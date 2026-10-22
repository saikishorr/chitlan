import state from './state.js';
import { MAX_ROOM_USERS } from './constants.js';
import { buildPeerOptions, loadConnectionSettings } from './connection-settings.js';
import { generateRoomCode, normalizeRoomCode, formatRoomCode, roomPeerId, showToast, scheduleTimeout, scheduleInterval, clearManagedTimeout, clearManagedInterval, sanitizeNickname } from './utils.js';
import {
  setConnectionStatus,
  updateProfileUI,
  renderUserList,
  appendMessage,
  RICH_GIF_CATALOG,
  appendSystemMessage,
  showTypingIndicator,
  hideTypingIndicator,
  restoreChatHistory,
  startSessionTimer,
  updateConnectionHealth,
  showConfirmDialog
} from './ui.js';
import {
  updateVoiceUsers,
  playAudio,
  removeAudio,
  updateVoiceUI,
  addVideoTile,
  removeVideoTile,
  toggleMute,
  syncMediaCalls,
  updateVideoTileNames
} from './voice.js';
import { handleIncomingFileChunk, handleFileAck, handleFilePeerLeft } from './files.js';
import { showScreenStream, clearScreenViewer, stopScreenShare, syncScreenCalls, handleScreenTakeoverRequest, handleScreenTakeoverResponse } from './screen.js';
import { resetSession } from './session.js';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
// How long the host waits after a joiner's connection closes before announcing that they
// left. Covers the joiner's first reconnect attempts (1 s + 2 s backoff plus connect time).
const RECONNECT_GRACE_MS = 10000;
let pendingConnectionReject = null;

function connectionErrorMessage(type, message = '') {
  if (type === 'peer-unavailable') return `No room with code ${formatRoomCode(state.roomCode)}. Check the code with the host.`;
  if (['network', 'server-error', 'socket-error'].includes(type)) return "Can't reach the connection server. ChitLAN needs an internet connection to find other people.";
  if (type === 'browser-incompatible') return 'This browser cannot connect. Please use a recent version of Chrome, Firefox, Edge, or Safari.';
  if (type === 'unavailable-id') return 'Could not create a unique room code. Please try again.';
  return `Peer connection error: ${type || message}`;
}

function showTryAgainButton() {
  const button = document.getElementById('tryAgainBtn');
  if (button) button.style.display = 'inline-flex';
}

function finishReconnectFailure() {
  resetSession();
  setConnectionStatus('Could not reconnect', 'disconnected');
  showTryAgainButton();
}

function waitForPeerOpen(peer) {
  if (peer && !peer.destroyed && !peer.disconnected) return Promise.resolve(peer);
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      clearManagedTimeout(timeoutId);
      peer.off?.('open', onOpen);
      peer.off?.('error', onError);
    };
    const onOpen = () => { cleanup(); resolve(peer); };
    const onError = error => { cleanup(); reject(error); };
    peer.on('open', onOpen);
    peer.on('error', onError);
    timeoutId = scheduleTimeout(() => {
      cleanup();
      reject(new Error('Peer server did not reconnect'));
    }, 15000);
  });
}

function scheduleReconnect() {
  if (state.reconnectStopped || !state.peer || state.reconnecting) return;
  const nextAttempt = state.reconnectAttempt + 1;
  if (nextAttempt > RECONNECT_DELAYS.length) {
    finishReconnectFailure();
    return;
  }
  state.reconnecting = true;
  state.reconnectAttempt = nextAttempt;
  setConnectionStatus(`Reconnecting (${nextAttempt}/6)...`, 'connecting');
  state.reconnectTimeoutId = scheduleTimeout(async () => {
    state.reconnectTimeoutId = null;
    const peer = state.peer;
    const roomCode = state.roomCode;
    try {
      if (!peer || peer.destroyed) throw new Error('Peer was closed');
      if (peer.disconnected) {
        peer.reconnect();
        await waitForPeerOpen(peer);
      }
      if (state.isHost) {
        state.reconnecting = false;
        state.reconnectAttempt = 0;
        setConnectionStatus('Connected', 'connected');
        return;
      }
      if (state.conn) {
        const previous = state.conn;
        state.conn = null;
        try { previous.close(); } catch (e) {}
      }
      await connectToHost(roomCode, { reconnecting: true });
    } catch (error) {
      state.reconnecting = false;
      scheduleReconnect();
    }
  }, RECONNECT_DELAYS[nextAttempt - 1]);
}

function closePeerCalls(peerId) {
  [state.activeCalls, state.activeVideoCalls, state.activeScreenCalls, state.incomingScreenCalls].forEach(calls => {
    const call = calls[peerId];
    if (call) {
      try { call.close(); } catch (e) {}
      delete calls[peerId];
    }
  });
  delete state.remoteVideoStreams[peerId];
  delete state.remoteMediaJoined[peerId];
  removeAudio(peerId);
  removeVideoTile(peerId);
}

export function startTelemetry() {
  clearManagedInterval(state.telemetryIntervalId);
  state.telemetryIntervalId = scheduleInterval(() => {
    const now = Date.now();
    if (state.conn) {
      state.conn.send({ type: 'ping', timestamp: now });
    } else if (state.isHost && state.connections.length > 0) {
      state.connections.forEach(c => c.send({ type: 'ping', timestamp: now }));
    } else if (!state.peer) {
      updateConnectionHealth(null);
    }
  }, 3000);
}

export async function kickParticipant(peerId) {
  if (!state.isHost) return;

  const targetConn = state.connections.find(c => c.peer === peerId);
  if (!targetConn) return;
  const nickname = targetConn.nickname || 'Peer';

  const confirmKick = await showConfirmDialog(`Are you sure you want to remove ${nickname} from the workspace?`, {
    title: 'Remove participant',
    confirmText: 'Kick',
    cancelText: 'Cancel'
  });
  if (!confirmKick) return;

  targetConn.send({
    type: 'join-rejected',
    reason: 'kicked'
  });
  state.kickedPeerIds.add(targetConn.peer);

  targetConn.kicked = true;
  clearManagedTimeout(targetConn.departureTimeoutId);

  scheduleTimeout(() => {
    try { targetConn.close(); } catch (e) {}
    if (!state.connections.includes(targetConn)) return;
    state.connections = state.connections.filter(p => p !== targetConn);
    handleFilePeerLeft(targetConn.peer);
    closePeerCalls(targetConn.peer);
    updateUserList();
    updateVoiceUsers();
  }, 400);

  appendSystemMessage(`${nickname} was removed from the meeting by the Host.`);
  showToast(`${nickname} removed from room`, 'info');
  showToast('Kicked users can rejoin with a new link. Lock the room or set a passcode to keep them out.', 'info');
  broadcast('System', `${nickname} was removed from the room by the Host`, '#ef4444', null, false);
}

export function muteAllParticipants() {
  if (!state.isHost) return;

  state.connections.forEach(c => {
    c.send({ type: 'host-command', action: 'mute-mic' });
  });

  appendSystemMessage('Host muted all participants');
  showToast('Muted all participants', 'info');
}

export function toggleLockRoom() {
  if (!state.isHost) return;

  state.isRoomLocked = !state.isRoomLocked;
  const btn = document.getElementById('lockRoomBtn');
  if (btn) {
    btn.textContent = state.isRoomLocked ? '🔒 Unlock' : '🔒 Lock';
  }

  appendSystemMessage(state.isRoomLocked ? 'Host locked the room to new joiners' : 'Host unlocked the room');
  showToast(state.isRoomLocked ? 'Room locked to new joiners' : 'Room unlocked', 'info');
}

export function initPeer(nickname, color, role, passcode = '', signalOverride = null) {
  if (state.peer && !state.peer.destroyed) return state.peerReady || Promise.resolve(state.peer);
  let peerOptions;
  let peerSignalSettings;
  try {
    const peerConfiguration = buildPeerOptions(loadConnectionSettings(), signalOverride);
    peerOptions = peerConfiguration.options;
    peerSignalSettings = peerConfiguration.signaling;
  } catch (error) {
    setConnectionStatus(error.message, 'disconnected');
    throw error;
  }
  state.myNickname = nickname;
  state.peerSignalSettings = peerSignalSettings;
  state.myColor = color;
  state.isHost = role === 'host';
  state.roomPasscode = passcode;
  state.kickedPeerIds = state.isHost ? new Set() : state.kickedPeerIds;
  state.notifyCallState = () => {
    const callState = {
      inVoice: state.isInCall,
      inVideo: state.isInVideoMeeting,
      isSharing: !!state.screenStream
    };
    if (state.isHost) {
      updateUserList();
      updateVoiceUsers();
    } else if (state.conn) {
      state.conn.send({ type: 'call-state', ...callState });
    }
  };

  updateProfileUI(state.myNickname, state.myColor, role);
  setConnectionStatus('Initializing...', 'connecting');
  state.reconnectStopped = false;
  state.reconnectAttempt = 0;
  state.reconnecting = false;
  state.hasJoinedRoom = false;

  state.peerReady = new Promise((resolve, reject) => {
  let settled = false;
  let collisionRetries = 0;
  const cancelInitialization = () => {
    if (settled) return;
    settled = true;
    state.cancelPeerInit = null;
    reject(new Error('Peer initialization cancelled'));
  };
  state.cancelPeerInit = cancelInitialization;
  const createPeer = () => {
    state.roomCode = generateRoomCode();
    try {
      state.peer = new window.Peer(roomPeerId(state.roomCode), peerOptions);
    } catch (error) {
      state.cancelPeerInit = null;
      setConnectionStatus(connectionErrorMessage(error.type, error.message), 'disconnected');
      reject(error);
      return;
    }
    const peer = state.peer;

  peer.on('open', id => {
    if (state.peer !== peer) return;
    if (settled) {
      if (state.isHost) {
        state.reconnecting = false;
        state.reconnectAttempt = 0;
        setConnectionStatus('Connected', 'connected');
      }
      return;
    }
    settled = true;
    state.cancelPeerInit = null;
    const peerIdInput = document.getElementById('peer-id');
    const roomStatus = document.getElementById('roomStatus');

    if (state.isHost) {
      if (peerIdInput) peerIdInput.value = formatRoomCode(state.roomCode);
      if (roomStatus) roomStatus.textContent = `Room code: ${formatRoomCode(state.roomCode)} - Active`;
      setConnectionStatus('Connected', 'connected');
      restoreChatHistory(state.roomCode);
      appendSystemMessage(`Room created successfully! Your room code is ${formatRoomCode(state.roomCode)}`);
      showToast(`Room code generated: ${formatRoomCode(state.roomCode)}`, 'success');
      updateUserList();
      startSessionTimer();
      startTelemetry();
    } else {
      if (peerIdInput) peerIdInput.value = '';
      if (roomStatus) roomStatus.textContent = 'Connecting to room...';
      setConnectionStatus('Peer ready. Connecting to room...', 'connecting');
    }
    resolve(peer);
  });

  peer.on('disconnected', () => {
    if (state.peer !== peer || state.reconnectStopped) return;
    if (!settled) {
      settled = true;
      state.cancelPeerInit = null;
      const error = new Error('Peer server disconnected before initialization completed');
      setConnectionStatus(connectionErrorMessage('network'), 'disconnected');
      reject(error);
      return;
    }
    scheduleReconnect();
  });

  peer.on('error', err => {
    if (new URLSearchParams(window.location.search).get('debug') === '1') console.error('PeerJS error:', err);
    if (state.peer !== peer) return;
    if (err.type === 'unavailable-id' && collisionRetries < 3) {
      collisionRetries++;
      setConnectionStatus('Room code collision. Retrying...', 'connecting');
      try { peer.destroy(); } catch (e) {}
      createPeer();
      return;
    }
    const message = connectionErrorMessage(err.type, err.message);
    setConnectionStatus(message, 'disconnected');
    showToast(message, 'error');
    if (!settled) {
      settled = true;
      state.cancelPeerInit = null;
      try { peer.destroy(); } catch (e) {}
      if (state.peer === peer) state.peer = null;
      reject(err);
    } else if (pendingConnectionReject) {
      pendingConnectionReject(new Error(message));
      pendingConnectionReject = null;
    }
  });

  peer.on('call', call => {
    const metadata = call.metadata || {};

    if (metadata.type === 'screen-share') {
      call.answer();
      state.incomingScreenCalls[call.peer] = call;
      call.on('stream', remoteStream => {
        state.currentScreenSharerPeerId = call.peer;
        showScreenStream(remoteStream, state.roster.find(member => member.peerId === call.peer)?.nickname || metadata.sharerName || 'Peer');
      });
      call.on('close', () => {
        if (state.incomingScreenCalls[call.peer] === call) delete state.incomingScreenCalls[call.peer];
        if (state.currentScreenSharerPeerId === call.peer) clearScreenViewer();
      });
      return;
    }

    if (metadata.type === 'video-meeting') {
      const videoTrack = state.videoStream?.getVideoTracks()[0];
      call.answer(state.isInVideoMeeting && videoTrack ? new MediaStream([videoTrack]) : undefined);
      call.on('stream', remoteStream => {
        state.remoteVideoStreams[call.peer] = remoteStream;
        addVideoTile(call.peer, remoteStream, state.roster.find(member => member.peerId === call.peer)?.nickname || metadata.nickname || 'Peer');
      });
      call.on('close', () => {
        if (state.activeVideoCalls[call.peer] === call) {
          delete state.activeVideoCalls[call.peer];
          delete state.remoteVideoStreams[call.peer];
          removeVideoTile(call.peer);
        }
      });
      state.activeVideoCalls[call.peer] = call;
      return;
    }

    if (!state.isInCall && state.listenMuted) {
      try { call.close(); } catch (e) {}
      return;
    }
    const audioTracks = state.localStream?.getAudioTracks() || [];
    call.answer(state.isInCall && audioTracks.length ? new MediaStream(audioTracks) : undefined);

    call.on('stream', remoteStream => {
      playAudio(call.peer, remoteStream);
    });

    call.on('close', () => {
      if (state.activeCalls[call.peer] === call) {
        delete state.activeCalls[call.peer];
        removeAudio(call.peer);
      }
      updateVoiceUsers();
    });

    state.activeCalls[call.peer] = call;
    updateVoiceUI();
    updateVoiceUsers();
  });

  peer.on('connection', c => {
    if (state.isHost && state.kickedPeerIds.has(c.peer)) {
      c.on('open', () => {
        c.send({ type: 'join-rejected', reason: 'kicked' });
        scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 300);
      });
      return;
    }
    // A member reconnecting with the same peer ID keeps its place even if the room was
    // locked or filled up while it was away.
    const isReturningMember = state.isHost && state.connections.some(p => p.peer === c.peer);

    // Check Room Lock status
    if (state.isHost && state.isRoomLocked && !isReturningMember) {
      c.on('open', () => {
        c.send({
          type: 'join-rejected', reason: 'locked',
          message: 'This workspace room has been locked by the Host.'
        });
        scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 800);
      });
      return;
    }

    // Non-Host Peer Redirection Logic
    if (!state.isHost && state.conn) {
      c.on('open', () => {
        if (state.roster.length >= MAX_ROOM_USERS) {
          c.send({
            type: 'join-rejected', reason: 'full',
            message: `room is full (${MAX_ROOM_USERS}/${MAX_ROOM_USERS})`
          });
          scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 800);
          return;
        }

        const hostPeerId = state.conn.peer;
        appendSystemMessage(`${c.peer} attempted to join your local peer ID. Redirecting to Host (${hostPeerId})...`);
        showToast(`🔀 Redirecting incoming peer to main Host (${hostPeerId})...`, 'info');

        c.send({
          type: 'room-redirect',
          targetHostId: hostPeerId,
          redirectedBy: state.myNickname
        });

        scheduleTimeout(() => {
          try { c.close(); } catch (e) {}
        }, 1200);
      });
      return;
    }

    if (state.isHost) {
      if (!isReturningMember && 1 + state.connections.length >= MAX_ROOM_USERS) {
        c.on('open', () => {
          c.send({
            type: 'join-rejected', reason: 'full',
            message: `room is full (${MAX_ROOM_USERS}/${MAX_ROOM_USERS})`
          });
          scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 800);
        });
        return;
      }

      c.on('data', data => handlePeerData(c, data));

      c.on('close', () => {
        // Only the current connection for a peer may announce a departure; a replaced
        // (reconnected) or kicked connection has already been handled elsewhere.
        if (!state.connections.includes(c) || c.kicked) return;
        // Wait briefly so a joiner that reconnects with the same peer ID is treated as a
        // reconnect rather than a leave followed by a join.
        clearManagedTimeout(c.departureTimeoutId);
        c.departureTimeoutId = scheduleTimeout(() => {
          if (!state.connections.includes(c)) return;
          state.connections = state.connections.filter(p => p !== c);
          appendSystemMessage(`${c.nickname || 'A peer'} left the room`);
          showToast(`${c.nickname || 'A peer'} disconnected`, 'info');
          handleFilePeerLeft(c.peer);
          closePeerCalls(c.peer);
          updateUserList();
          updateVoiceUsers();
          updateConnectionHealth(null);
        }, RECONNECT_GRACE_MS);
      });

      c.on('error', err => {
        console.error('Peer connection error', err);
      });
    }
  });
  };
  createPeer();
  });
  return state.peerReady;
}

export function handlePeerData(c, data) {
  if (!data || !data.type) return;

  if (data.type === 'ping') {
    c.send({ type: 'pong', timestamp: data.timestamp });
  } else if (data.type === 'pong') {
    const rtt = Math.max(1, Date.now() - data.timestamp);
    updateConnectionHealth(rtt);
  } else if (data.type === 'intro') {
    if (state.kickedPeerIds.has(c.peer)) {
      c.send({ type: 'join-rejected', reason: 'kicked' });
      scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 300);
      return;
    }
    if (String(data.passcode || '') !== state.roomPasscode) {
      c.send({ type: 'join-rejected', reason: 'wrong-passcode' });
      scheduleTimeout(() => { try { c.close(); } catch (e) {} }, 300);
      return;
    }
    if (state.connections.includes(c)) return;

    // A joiner that reconnects keeps its peer ID. Replace its old connection instead of
    // adding a second member, and keep the name it already had.
    const previous = state.connections.find(p => p.peer === c.peer);
    const isReconnect = !!previous;
    if (previous) {
      clearManagedTimeout(previous.departureTimeoutId);
      state.connections = state.connections.filter(p => p !== previous);
      try { previous.close(); } catch (e) {}
      // In-flight file transfers were bound to the old connection and cannot resume.
      handleFilePeerLeft(previous.peer);
      c.inVoice = previous.inVoice;
      c.inVideo = previous.inVideo;
      c.isSharing = previous.isSharing;
    }

    let nickname;
    if (previous) {
      nickname = previous.nickname;
    } else {
      const requestedName = sanitizeNickname(data.nickname);
      const takenNames = new Set([state.myNickname, ...state.connections.map(peer => peer.nickname)]);
      nickname = requestedName;
      let suffix = 2;
      while (takenNames.has(nickname)) {
        const suffixText = ` (${suffix++})`;
        const baseName = Array.from(requestedName).slice(0, 24 - suffixText.length).join('');
        nickname = `${baseName}${suffixText}`;
      }
    }
    c.nickname = nickname;
    c.color = previous ? previous.color : data.color;
    state.connections.push(c);

    updateConnectionHealth(null);
    updateUserList();
    updateVoiceUsers();

    c.send({ type: 'welcome', nickname: c.nickname, roster: state.roster });

    if (isReconnect) {
      appendSystemMessage(`${c.nickname} reconnected`);
      broadcast('System', `${c.nickname} reconnected`, '#94a3b8', c, false);
    } else {
      appendSystemMessage(`${c.nickname} joined the workspace`);
      showToast(`${c.nickname} connected`, 'success');
      broadcast('System', `${c.nickname} has joined the room`, '#94a3b8', c, false);
    }

    if (state.isHost && state.screenStream) {
      c.send({
        type: 'screen-status',
        action: 'started',
        nickname: state.myNickname
      });
    }

    if (!isReconnect) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) {
          p.send({ type: 'peer-joined', peerId: c.peer, nickname: c.nickname });
        }
      });
    }
  } else if (data.type === 'peer-joined') {
    syncScreenCalls();
  } else if (data.type === 'message') {
    if (state.isHost) {
      broadcast(c.nickname || 'Peer', data.message, c.color || '#60a5fa', c, true, data.timestamp, c.peer);
    } else {
      appendMessage(data.nickname, data.message, data.color, false, data.timestamp, data.fromPeerId);
    }
  } else if (data.type === 'gif') {
    if (!Number.isInteger(data.gifId) || !RICH_GIF_CATALOG[data.gifId]) return;
    const timestamp = Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : Date.now();
    if (state.isHost) {
      const payload = {
        type: 'gif',
        gifId: data.gifId,
        timestamp,
        nickname: c.nickname || 'Peer',
        color: c.color || '#60a5fa',
        fromPeerId: c.peer
      };
      state.connections.forEach(peer => {
        if (peer !== c && peer.open !== false) {
          try { peer.send(payload); } catch (error) {}
        }
      });
      appendMessage(payload.nickname, '', payload.color, false, timestamp, c.peer, { gifId: data.gifId });
    } else if (c === state.conn) {
      appendMessage(data.nickname, '', data.color, false, timestamp, data.fromPeerId, { gifId: data.gifId });
    }
  } else if (data.type === 'system') {
    if (!state.isHost && c === state.conn) appendSystemMessage(data.message);
  } else if (data.type === 'file-chunk') {
    if (state.isHost) {
      const existingTransfer = state.incomingFiles[data.fileId];
      const recipients = existingTransfer
        ? existingTransfer.deliveryPeerIds.filter(peerId => peerId !== state.peer?.id)
        : state.connections.filter(p => p.peer !== c.peer && p.open !== false).map(p => p.peer);
      const deliveryPeerIds = existingTransfer?.deliveryPeerIds || [state.peer?.id, ...recipients].filter(Boolean);
      const relayedData = {
        ...data,
        senderPeerId: c.peer,
        senderNickname: c.nickname || data.senderNickname,
        senderColor: c.color || data.senderColor,
        deliveryPeerIds
      };

      handleIncomingFileChunk(relayedData, c).then(accepted => {
        if (!accepted) return;
        state.connections.forEach(p => {
          if (p.peer === c.peer || !recipients.includes(p.peer) || p.open === false) return;
          try {
            p.send(relayedData);
          } catch (error) {
            handleFileAck({
              type: 'file-ack',
              fileId: data.fileId,
              index: data.index,
              failed: true,
              reason: 'Could not forward a file chunk.'
            }, p);
          }
        });
      });
    } else {
      handleIncomingFileChunk(data, c);
    }
  } else if (data.type === 'file-ack') {
    handleFileAck(data, c);
  } else if (data.type === 'typing' || data.type === 'typing-stop') {
    const payload = { ...data, nickname: c.nickname || data.nickname || 'Peer', fromPeerId: c.peer };
    if (data.type === 'typing') showTypingIndicator(payload.nickname, c.peer);
    else hideTypingIndicator(c.peer);
    if (state.isHost) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) p.send(payload);
      });
    }
  } else if (data.type === 'call-state') {
    c.inVoice = !!data.inVoice;
    c.inVideo = !!data.inVideo;
    c.isSharing = !!data.isSharing;
    updateUserList();
    updateVoiceUsers();
  } else if (data.type === 'screen-takeover-request') {
    const sharer = state.roster.find(member => member.isSharing);
    if (!sharer) {
      c.send({ type: 'screen-takeover-response', accepted: true });
    } else if (sharer.peerId === state.peer?.id) {
      handleScreenTakeoverRequest(c.peer, c.nickname || 'A participant');
    } else {
      const target = state.connections.find(connection => connection.peer === sharer.peerId);
      if (target) target.send({ type: 'screen-takeover-request', fromPeerId: c.peer, nickname: c.nickname || 'A participant' });
      else c.send({ type: 'screen-takeover-response', accepted: true });
    }
  } else if (data.type === 'screen-takeover-response') {
    if (data.toPeerId === state.peer?.id) {
      handleScreenTakeoverResponse(!!data.accepted);
    } else {
      const requester = state.connections.find(connection => connection.peer === data.toPeerId);
      if (requester) requester.send({ type: 'screen-takeover-response', accepted: !!data.accepted });
    }
  } else if (data.type === 'screen-status') {
    if (state.isHost) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) p.send(data);
      });
    }

    if (data.action === 'started') {
      state.currentScreenSharerPeerId = data.fromPeerId || null;
      appendSystemMessage(`${data.nickname} started screen sharing`);
    } else if (data.action === 'stopped') {
      appendSystemMessage(`${data.nickname} stopped screen sharing`);
      if (!data.fromPeerId || data.fromPeerId === state.currentScreenSharerPeerId) clearScreenViewer();
    }
  }
}

export async function connectToHost(roomCode, { reconnecting = false } = {}) {
  const code = normalizeRoomCode(roomCode);
  const hostId = roomPeerId(code);
  if (!hostId) {
    showToast('Enter a valid 6-character room code', 'error');
    throw new Error('Invalid room code');
  }
  if (!state.peer) throw new Error('Peer is not initialized');
  await (state.peerReady || Promise.resolve(state.peer));
  if (state.peer.disconnected) {
    state.peer.reconnect();
    await waitForPeerOpen(state.peer);
  }

  state.roomCode = code;
  setConnectionStatus(reconnecting ? `Reconnecting (${state.reconnectAttempt}/6)...` : 'Connecting to host...', 'connecting');
  const peer = state.peer;
  const conn = peer.connect(hostId);
  state.conn = conn;

  return new Promise((resolve, reject) => {
    let promiseSettled = false;
    let welcomed = false;
    let timeoutId;
    const settleFailure = error => {
      if (promiseSettled) return;
      promiseSettled = true;
      clearManagedTimeout(timeoutId);
      if (pendingConnectionReject === settleFailure) pendingConnectionReject = null;
      if (state.cancelPendingConnection === cancelConnection) state.cancelPendingConnection = null;
      if (state.conn === conn) state.conn = null;
      try { conn.close(); } catch (e) {}
      reject(error);
    };
    const cancelConnection = () => settleFailure(new Error('Connection cancelled'));
    state.cancelPendingConnection = cancelConnection;
    pendingConnectionReject = settleFailure;
    timeoutId = scheduleTimeout(() => {
      settleFailure(new Error('Timed out connecting to the room'));
    }, 15000);

    conn.on('open', () => {
      if (state.conn !== conn || state.reconnectStopped) return;
      conn.send({
        type: 'intro',
        nickname: state.myNickname,
        color: state.myColor,
        passcode: state.roomPasscode
      });
      setConnectionStatus('Waiting for room response...', 'connecting');
    });

    conn.on('data', data => {
      if (!data || !data.type) return;
      if (data.type === 'ping') {
        conn.send({ type: 'pong', timestamp: data.timestamp });
      } else if (data.type === 'pong') {
        updateConnectionHealth(Math.max(1, Date.now() - data.timestamp));
      } else if (data.type === 'join-rejected') {
        const messages = {
          full: data.message || `room is full (${MAX_ROOM_USERS}/${MAX_ROOM_USERS})`,
          locked: 'This room is locked by the host.',
          'wrong-passcode': 'That passcode is incorrect. Check it with the host.',
          kicked: 'You were removed from the room by the host.'
        };
        const message = messages[data.reason] || 'You could not join this room.';
        state.reconnectStopped = true;
        const rejection = new Error(message);
        rejection.reason = data.reason || '';
        settleFailure(rejection);
        resetSession();
        setConnectionStatus(message, 'disconnected');
        appendSystemMessage(message);
      } else if (data.type === 'host-command') {
        if (data.action === 'mute-mic' && state.localStream && !state.isMuted) {
          toggleMute();
          showToast('The Host muted your microphone', 'info');
        }
      } else if (data.type === 'welcome') {
        state.myNickname = data.nickname || state.myNickname;
        updateProfileUI(state.myNickname, state.myColor, 'join');
        restoreChatHistory(code);
        state.roster = Array.isArray(data.roster) ? data.roster : [];
        renderUserList(state.roster);
        syncMediaCalls();
        syncScreenCalls();
        updateVideoTileNames();
        updateVoiceUsers();

        const firstRoomConnection = !state.hasJoinedRoom;
        welcomed = true;
        state.hasJoinedRoom = true;
        state.reconnecting = false;
        state.reconnectAttempt = 0;
        setConnectionStatus(`Connected to room ${formatRoomCode(code)}`, 'connected');
        const joinedText = `${firstRoomConnection ? 'Connected' : 'Reconnected'} to room ${formatRoomCode(code)}`;
        appendSystemMessage(joinedText);
        showToast(joinedText, 'success');
        const roomStatus = document.getElementById('roomStatus');
        if (roomStatus) roomStatus.textContent = `Connected to Room ${formatRoomCode(code)}`;
        if (firstRoomConnection) startSessionTimer();
        startTelemetry();
        if (!promiseSettled) {
          promiseSettled = true;
          clearManagedTimeout(timeoutId);
          if (pendingConnectionReject === settleFailure) pendingConnectionReject = null;
          if (state.cancelPendingConnection === cancelConnection) state.cancelPendingConnection = null;
          resolve(conn);
        }
      } else if (data.type === 'roster') {
        state.roster = Array.isArray(data.members) ? data.members : [];
        renderUserList(state.roster);
        syncMediaCalls();
        syncScreenCalls();
        updateVideoTileNames();
        updateVoiceUsers();
      } else if (data.type === 'screen-takeover-request') {
        handleScreenTakeoverRequest(data.fromPeerId, data.nickname || 'A participant');
      } else if (data.type === 'screen-takeover-response') {
        handleScreenTakeoverResponse(!!data.accepted);
      } else if (data.type === 'force-stop-screen-share') {
        stopScreenShare();
      } else if (data.type === 'room-redirect') {
        appendSystemMessage(`${data.redirectedBy || 'Member'} redirected you to the main workspace Host (${data.targetHostId}).`);
        showToast(`Redirecting to main workspace room (Host ID: ${data.targetHostId})...`, 'info');
        const targetHostId = data.targetHostId;
        const targetInput = document.getElementById('connect-id');
        if (targetInput) targetInput.value = targetHostId;
        settleFailure(new Error('Redirected to the room host'));
        scheduleTimeout(() => connectToHost(targetHostId).catch(() => {}), 600);
      } else if (data.type === 'peer-joined') {
        syncScreenCalls();
      } else if (data.type === 'message') {
        appendMessage(data.nickname, data.message, data.color, false, data.timestamp, data.fromPeerId);
      } else if (data.type === 'gif') {
        if (Number.isInteger(data.gifId) && RICH_GIF_CATALOG[data.gifId]) {
          appendMessage(data.nickname, '', data.color, false, data.timestamp, data.fromPeerId, { gifId: data.gifId });
        }
      } else if (data.type === 'system' && !state.isHost && conn === state.conn) {
        appendSystemMessage(data.message);
      } else if (data.type === 'file-chunk') {
        handleIncomingFileChunk(data, conn);
      } else if (data.type === 'file-ack') {
        handleFileAck(data);
      } else if (data.type === 'typing') {
        showTypingIndicator(data.nickname, data.fromPeerId);
      } else if (data.type === 'typing-stop') {
        hideTypingIndicator(data.fromPeerId);
      } else if (data.type === 'screen-status') {
        if (data.action === 'started') {
          state.currentScreenSharerPeerId = data.fromPeerId || null;
          appendSystemMessage(`${data.nickname} started screen sharing`);
        } else if (data.action === 'stopped') {
          appendSystemMessage(`${data.nickname} stopped screen sharing`);
          if (!data.fromPeerId || data.fromPeerId === state.currentScreenSharerPeerId) clearScreenViewer();
        }
      }
    });

    conn.on('close', () => {
      if (state.conn === conn) state.conn = null;
      if (state.reconnectStopped || state.peer !== peer) return;
      if (!welcomed) {
        settleFailure(new Error('Connection to the host closed'));
        if (state.hasJoinedRoom && !state.reconnecting) scheduleReconnect();
        return;
      }
      if (state.hasJoinedRoom) scheduleReconnect();
    });

    conn.on('error', error => {
      const message = connectionErrorMessage(error.type || error.name, error.message);
      setConnectionStatus(message, 'disconnected');
      showToast(message, 'error');
      settleFailure(new Error(message));
      if (state.hasJoinedRoom && !state.reconnecting) scheduleReconnect();
    });
  });
}

export function broadcast(nickname, message, color = '#60a5fa', exclude = null, shouldAppendLocal = true, timestamp = Date.now(), fromPeerId = null) {
  const payload = { type: 'message', nickname, color, message, timestamp, fromPeerId: fromPeerId || state.peer?.id };

  state.connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });

  if (shouldAppendLocal) {
    appendMessage(nickname, message, color, false, timestamp, payload.fromPeerId);
  }
}

export function broadcastGif(gifId, timestamp = Date.now()) {
  if (!Number.isInteger(gifId) || !RICH_GIF_CATALOG[gifId]) return;
  const payload = {
    type: 'gif',
    gifId,
    timestamp,
    nickname: state.myNickname || 'Host',
    color: state.myColor || '#60a5fa',
    fromPeerId: state.peer?.id
  };
  state.connections.forEach(connection => {
    if (connection.open !== false) {
      try { connection.send(payload); } catch (error) {}
    }
  });
}

export function updateUserList() {
  if (!state.isHost) {
    renderUserList(state.roster);
    return;
  }

  const members = [];
  if (state.peer?.id) {
    members.push({
      peerId: state.peer.id,
      nickname: state.myNickname,
      color: state.myColor,
      isHost: true,
      inVoice: state.isInCall,
      inVideo: state.isInVideoMeeting,
      isSharing: !!state.screenStream
    });
  }
  state.connections.forEach(c => members.push({
    peerId: c.peer,
    nickname: c.nickname || 'Peer',
    color: c.color || '#60a5fa',
    isHost: false,
    inVoice: !!c.inVoice,
    inVideo: !!c.inVideo,
    isSharing: !!c.isSharing
  }));
  state.roster = members;
  renderUserList(members);
  state.connections.forEach(c => {
    try { c.send({ type: 'roster', members }); } catch (e) {}
  });
  syncMediaCalls();
  syncScreenCalls();
  updateVideoTileNames();
}
