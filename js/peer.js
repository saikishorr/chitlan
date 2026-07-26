import state from './state.js';
import { MAX_ROOM_PEERS, RECONNECT_INTERVAL } from './constants.js';
import { generateNumericIdWithPrefix, showToast } from './utils.js';
import {
  setConnectionStatus,
  updateProfileUI,
  renderUserList,
  appendMessage,
  appendSystemMessage,
  showTypingIndicator,
  startSessionTimer,
  updateConnectionHealth
} from './ui.js';
import {
  updateVoiceUsers,
  playAudio,
  removeAudio,
  updateVoiceUI,
  addVideoTile,
  removeVideoTile,
  toggleMute
} from './voice.js';
import { handleIncomingFileChunk, handleFileAck } from './files.js';
import { showScreenStream, clearScreenViewer, stopScreenShare } from './screen.js';

let telemetryInterval = null;

export function startTelemetry() {
  if (telemetryInterval) clearInterval(telemetryInterval);
  telemetryInterval = setInterval(() => {
    const now = Date.now();
    if (state.conn) {
      state.conn.send({ type: 'ping', timestamp: now });
    } else if (state.isHost && state.connections.length > 0) {
      state.connections.forEach(c => c.send({ type: 'ping', timestamp: now }));
    } else if (state.peer) {
      updateConnectionHealth(8);
    } else {
      updateConnectionHealth(null);
    }
  }, 3000);
}

export function kickParticipantByName(nickname) {
  if (!state.isHost) return;

  const targetConn = state.connections.find(c => (c.nickname || '') === nickname);
  if (!targetConn) return;

  const confirmKick = confirm(`Are you sure you want to remove ${nickname} from the workspace?`);
  if (!confirmKick) return;

  targetConn.send({
    type: 'kick-user',
    reason: 'Removed by Host'
  });

  setTimeout(() => {
    try { targetConn.close(); } catch (e) {}
    state.connections = state.connections.filter(p => p.peer !== targetConn.peer);
    delete state.activeCalls[targetConn.peer];
    delete state.activeScreenCalls[targetConn.peer];
    delete state.activeVideoCalls[targetConn.peer];
    removeAudio(targetConn.peer);
    removeVideoTile(targetConn.peer);
    updateUserList();
    updateVoiceUsers();
  }, 400);

  appendSystemMessage(`${nickname} was removed from the meeting by the Host.`);
  showToast(`${nickname} removed from room`, 'info');
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

export function initPeer(nickname, color, role) {
  state.myNickname = nickname;
  state.myColor = color;
  state.isHost = role === 'host';

  updateProfileUI(state.myNickname, state.myColor, role);
  setConnectionStatus('Initializing...', 'connecting');

  const roomId = generateNumericIdWithPrefix();
  state.peer = new window.Peer(roomId);

  state.peer.on('open', id => {
    const peerIdInput = document.getElementById('peer-id');
    const roomStatus = document.getElementById('roomStatus');

    if (peerIdInput) peerIdInput.value = id;
    if (roomStatus) roomStatus.textContent = `Room ID: ${id} • Active`;

    setConnectionStatus('Connected', 'connected');
    appendSystemMessage(`Room created successfully! Your Room ID is ${id}`);
    showToast(`Room ID generated: ${id}`, 'success');

    renderUserList([`${state.myNickname} (You)`]);
    startSessionTimer();
    startTelemetry();
  });

  state.peer.on('disconnected', () => {
    setConnectionStatus('Reconnecting...', 'connecting');
    appendSystemMessage('Connection lost. Reconnecting to Peer server...');
    setTimeout(() => {
      try {
        if (state.peer && !state.peer.destroyed) state.peer.reconnect();
      } catch (e) {}
    }, RECONNECT_INTERVAL);
  });

  state.peer.on('error', err => {
    console.error('PeerJS error:', err);
    showToast(`Peer connection error: ${err.type || err.message}`, 'error');
  });

  state.peer.on('call', call => {
    const metadata = call.metadata || {};

    if (metadata.type === 'screen-share') {
      call.answer();
      call.on('stream', remoteStream => {
        showScreenStream(remoteStream, metadata.sharerName || 'Peer');
      });
      call.on('close', () => {
        clearScreenViewer();
      });
      return;
    }

    if (metadata.type === 'video-meeting') {
      call.answer(state.videoStream || state.localStream);
      call.on('stream', remoteStream => {
        addVideoTile(call.peer, remoteStream, metadata.nickname || 'Peer');
      });
      call.on('close', () => {
        removeVideoTile(call.peer);
      });
      return;
    }

    if (!state.localStream) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          state.localStream = stream;
          state.isInCall = true;
          call.answer(state.localStream);
          updateVoiceUI();
          updateVoiceUsers();
        })
        .catch(() => {
          call.answer();
          appendSystemMessage('Incoming voice stream received (mic disabled).');
        });
    } else {
      call.answer(state.localStream);
    }

    call.on('stream', remoteStream => {
      playAudio(call.peer, remoteStream);
    });

    call.on('close', () => {
      delete state.activeCalls[call.peer];
      removeAudio(call.peer);
      updateVoiceUsers();
    });

    state.activeCalls[call.peer] = call;
    updateVoiceUI();
    updateVoiceUsers();
  });

  state.peer.on('connection', c => {
    // Check Room Lock status
    if (state.isHost && state.isRoomLocked) {
      c.on('open', () => {
        c.send({
          type: 'room-full',
          message: 'This workspace room has been locked by the Host.'
        });
        setTimeout(() => { try { c.close(); } catch (e) {} }, 800);
      });
      return;
    }

    // Non-Host Peer Redirection Logic
    if (!state.isHost && state.conn) {
      c.on('open', () => {
        const userCount = document.querySelectorAll('#userNames .user').length;
        if (userCount >= MAX_ROOM_PEERS) {
          c.send({
            type: 'room-full',
            message: `Main Workspace Room is full (Maximum ${MAX_ROOM_PEERS} members allowed).`
          });
          setTimeout(() => { try { c.close(); } catch (e) {} }, 800);
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

        setTimeout(() => {
          try { c.close(); } catch (e) {}
        }, 1200);
      });
      return;
    }

    if (state.isHost) {
      if (state.connections.length >= MAX_ROOM_PEERS - 1) {
        c.on('open', () => {
          c.send({
            type: 'room-full',
            message: `Room is full. Maximum ${MAX_ROOM_PEERS} members allowed.`
          });
          setTimeout(() => { try { c.close(); } catch (e) {} }, 800);
        });
        return;
      }

      c.on('data', data => handlePeerData(c, data));

      c.on('close', () => {
        appendSystemMessage(`${c.nickname || 'A peer'} left the room`);
        showToast(`${c.nickname || 'A peer'} disconnected`, 'info');

        state.connections = state.connections.filter(p => p.peer !== c.peer);
        delete state.activeCalls[c.peer];
        delete state.activeScreenCalls[c.peer];
        delete state.activeVideoCalls[c.peer];
        removeAudio(c.peer);
        removeVideoTile(c.peer);
        updateUserList();
        updateVoiceUsers();
      });

      c.on('error', err => {
        console.error('Peer connection error', err);
      });
    }
  });
}

export function handlePeerData(c, data) {
  if (!data || !data.type) return;

  if (data.type === 'ping') {
    c.send({ type: 'pong', timestamp: data.timestamp });
  } else if (data.type === 'pong') {
    const rtt = Math.max(1, Date.now() - data.timestamp);
    updateConnectionHealth(rtt);
  } else if (data.type === 'intro') {
    c.nickname = data.nickname;
    c.color = data.color;
    state.connections.push(c);

    updateUserList();
    updateVoiceUsers();

    appendSystemMessage(`${c.nickname} joined the workspace`);
    showToast(`${c.nickname} connected`, 'success');

    broadcast('System', `${c.nickname} has joined the room`, '#94a3b8', c, false);

    if (state.isHost && state.screenStream) {
      const screenCall = state.peer.call(c.peer, state.screenStream, {
        metadata: {
          type: 'screen-share',
          sharerName: state.myNickname
        }
      });
      state.activeScreenCalls[c.peer] = screenCall;

      c.send({
        type: 'screen-status',
        action: 'started',
        nickname: state.myNickname
      });
    }

    state.connections.forEach(p => {
      if (p.peer !== c.peer) {
        p.send({ type: 'peer-joined', peerId: c.peer, nickname: c.nickname });
      }
    });
  } else if (data.type === 'peer-joined') {
    if (state.screenStream) {
      const screenCall = state.peer.call(data.peerId, state.screenStream, {
        metadata: {
          type: 'screen-share',
          sharerName: state.myNickname
        }
      });
      state.activeScreenCalls[data.peerId] = screenCall;
    }
  } else if (data.type === 'message') {
    if (state.isHost) {
      broadcast(data.nickname, data.message, data.color, c, true, data.timestamp, data.isHtml);
    } else {
      appendMessage(data.nickname, data.message, data.color, false, data.timestamp, data.isHtml);
    }
  } else if (data.type === 'file-chunk') {
    handleIncomingFileChunk(data, c);
    if (state.isHost) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) p.send(data);
      });
    }
  } else if (data.type === 'file-ack') {
    handleFileAck(data);
  } else if (data.type === 'typing') {
    showTypingIndicator(data.nickname);
    if (state.isHost) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) p.send(data);
      });
    }
  } else if (data.type === 'screen-status') {
    if (state.isHost) {
      state.connections.forEach(p => {
        if (p.peer !== c.peer) p.send(data);
      });
    }

    if (data.action === 'started') {
      appendSystemMessage(`${data.nickname} started screen sharing`);
    } else if (data.action === 'stopped') {
      appendSystemMessage(`${data.nickname} stopped screen sharing`);
      clearScreenViewer();
    } else if (data.action === 'stop-request') {
      if (state.screenStream) {
        stopScreenShare();
        appendSystemMessage(`${data.requester || 'A peer'} requested screen share takeover`);
      }
    }
  }
}

export function connectToHost(hostId) {
  if (!hostId) {
    showToast('Please enter Host Peer ID', 'error');
    return;
  }

  setConnectionStatus('Connecting to host...', 'connecting');

  state.conn = state.peer.connect(hostId);

  state.conn.on('open', () => {
    state.conn.send({
      type: 'intro',
      nickname: state.myNickname,
      color: state.myColor
    });

    setConnectionStatus('Connected to Host', 'connected');
    appendSystemMessage(`Connected to Host (${hostId})`);
    showToast('Connected to Host successfully!', 'success');

    const roomStatus = document.getElementById('roomStatus');
    if (roomStatus) roomStatus.textContent = `Connected to Room ${hostId}`;

    renderUserList([state.myNickname + ' (You)', 'Host']);
    startSessionTimer();
    startTelemetry();
  });

  state.conn.on('data', data => {
    if (data.type === 'ping') {
      state.conn.send({ type: 'pong', timestamp: data.timestamp });
    } else if (data.type === 'pong') {
      const rtt = Math.max(1, Date.now() - data.timestamp);
      updateConnectionHealth(rtt);
    } else if (data.type === 'kick-user') {
      appendSystemMessage('⚠️ You were removed from the room by the Host.');
      showToast('⚠️ You were removed from the room by the Host', 'error');
      setConnectionStatus('Removed by Host', 'disconnected');
      if (state.conn) {
        try { state.conn.close(); } catch (e) {}
        state.conn = null;
      }
    } else if (data.type === 'host-command') {
      if (data.action === 'mute-mic') {
        if (state.localStream && !state.isMuted) {
          toggleMute();
          showToast('🔇 The Host muted your microphone', 'info');
        }
      }
    } else if (data.type === 'room-full') {
      appendSystemMessage(`⚠️ ${data.message}`);
      showToast(`⚠️ ${data.message}`, 'error');
      setConnectionStatus('Room Full / Locked', 'disconnected');
      if (state.conn) {
        try { state.conn.close(); } catch (e) {}
        state.conn = null;
      }
    } else if (data.type === 'room-redirect') {
      appendSystemMessage(`${data.redirectedBy || 'Member'} redirected you to the main workspace Host (${data.targetHostId}).`);
      showToast(`🔀 Redirecting to main workspace room (Host ID: ${data.targetHostId})...`, 'info');

      if (state.conn) {
        try { state.conn.close(); } catch (e) {}
        state.conn = null;
      }

      const connectIdInput = document.getElementById('connect-id');
      if (connectIdInput) connectIdInput.value = data.targetHostId;

      setTimeout(() => {
        connectToHost(data.targetHostId);
      }, 600);
    } else if (data.type === 'peer-joined') {
      if (state.screenStream) {
        const screenCall = state.peer.call(data.peerId, state.screenStream, {
          metadata: {
            type: 'screen-share',
            sharerName: state.myNickname
          }
        });
        state.activeScreenCalls[data.peerId] = screenCall;
      }
    } else if (data.type === 'message') {
      appendMessage(data.nickname, data.message, data.color, false, data.timestamp, data.isHtml);
    } else if (data.type === 'system') {
      appendSystemMessage(data.message);
    } else if (data.type === 'file-chunk') {
      handleIncomingFileChunk(data, state.conn);
    } else if (data.type === 'file-ack') {
      handleFileAck(data);
    } else if (data.type === 'typing') {
      showTypingIndicator(data.nickname);
    } else if (data.type === 'screen-status') {
      if (data.action === 'started') {
        appendSystemMessage(`${data.nickname} started screen sharing`);
      } else if (data.action === 'stopped') {
        appendSystemMessage(`${data.nickname} stopped screen sharing`);
        clearScreenViewer();
      } else if (data.action === 'stop-request') {
        if (state.screenStream) {
          stopScreenShare();
          appendSystemMessage(`${data.requester || 'A peer'} requested screen share takeover`);
        }
      }
    }
  });

  state.conn.on('close', () => {
    setConnectionStatus('Disconnected', 'disconnected');
    appendSystemMessage('Disconnected from Host.');
    showToast('Disconnected from Host', 'error');
  });

  state.conn.on('error', err => {
    console.error('Connection error:', err);
    showToast('Failed to connect to Host ID', 'error');
    setConnectionStatus('Connection Failed', 'disconnected');
  });
}

export function broadcast(nickname, message, color = '#60a5fa', exclude = null, shouldAppendLocal = true, timestamp = Date.now(), isHtml = false) {
  const payload = { type: 'message', nickname, color, message, isHtml, timestamp };

  state.connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });

  if (shouldAppendLocal) {
    appendMessage(nickname, message, color, false, timestamp, isHtml);
  }
}

export function updateUserList() {
  const users = state.connections.map(c => c.nickname || 'Peer');
  users.unshift(state.myNickname + ' (You)');
  renderUserList(users);
}