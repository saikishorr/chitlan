import state from './state.js';
import { appendSystemMessage, showConfirmDialog } from './ui.js';
import { showToast, scheduleTimeout, clearManagedTimeout } from './utils.js';

export async function startScreenShare(takeoverApproved = false) {
  if (state.screenStream) {
    openScreenModal();
    return;
  }

  const otherSharer = state.roster.find(member => member.isSharing && member.peerId !== state.peer?.id);
  if (otherSharer && !takeoverApproved) {
    requestScreenTakeover(otherSharer);
    return;
  }

  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    state.currentScreenSharer = state.myNickname;
    state.currentScreenSharerPeerId = state.peer?.id || null;
    state.notifyCallState?.();
    showScreenStream(state.screenStream, `${state.myNickname} (You)`);
    openScreenModal();

    const videoTrack = state.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare();
      };
    }

    syncScreenCalls();

    const payload = { type: 'screen-status', action: 'started', nickname: state.myNickname, fromPeerId: state.peer?.id };
    if (state.isHost) {
      state.connections.forEach(c => c.send(payload));
    } else if (state.conn) {
      state.conn.send(payload);
    }

    appendSystemMessage('You started screen sharing');
    showToast('Screen sharing started', 'success');

    toggleScreenShareButtons(true);
  } catch (err) {
    console.error('Screen share error:', err);
    showToast('Screen sharing was cancelled or denied', 'error');
  }
}

// The sharer we asked to stop, and the toast that lets us start sharing once they agree.
let pendingTakeover = null;
let takeoverToast = null;
let takeoverToastTimeoutId = null;

function dismissTakeoverToast() {
  clearManagedTimeout(takeoverToastTimeoutId);
  takeoverToastTimeoutId = null;
  takeoverToast?.remove();
  takeoverToast = null;
  pendingTakeover = null;
}

function requestScreenTakeover(sharer) {
  pendingTakeover = { peerId: sharer.peerId, nickname: sharer.nickname };
  const request = {
    type: 'screen-takeover-request',
    fromPeerId: state.peer?.id,
    nickname: state.myNickname
  };
  if (state.isHost) {
    const target = state.connections.find(connection => connection.peer === sharer.peerId);
    if (target) target.send(request);
  } else if (state.conn) {
    state.conn.send({ type: 'screen-takeover-request', fromPeerId: state.peer?.id });
  }
  showToast(`Asked ${sharer.nickname} to stop sharing`, 'info');
}

export function stopScreenShare() {
  if (!state.screenStream) return;

  state.screenStream.getTracks().forEach(track => track.stop());
  state.screenStream = null;
  state.currentScreenSharer = null;
  state.currentScreenSharerPeerId = null;
  state.notifyCallState?.();

  Object.values(state.activeScreenCalls).forEach(call => {
    try { call.close(); } catch (e) {}
  });
  state.activeScreenCalls = {};

  const payload = { type: 'screen-status', action: 'stopped', nickname: state.myNickname, fromPeerId: state.peer?.id };
  if (state.isHost) {
    state.connections.forEach(c => c.send(payload));
  } else if (state.conn) {
    state.conn.send(payload);
  }

  clearScreenViewer();
  closeScreenModal();
  appendSystemMessage('You stopped screen sharing');
  showToast('Screen sharing stopped', 'info');

  toggleScreenShareButtons(false);
}

export function syncScreenCalls() {
  if (takeoverToast) {
    const newSharer = state.roster.find(member => member.isSharing
      && member.peerId !== state.peer?.id
      && member.peerId !== pendingTakeover?.peerId);
    if (newSharer) dismissTakeoverToast();
  }
  const membersById = new Map(state.roster.map(member => [member.peerId, member]));
  Object.entries(state.incomingScreenCalls).forEach(([peerId, call]) => {
    if (!membersById.get(peerId)?.isSharing) {
      try { call.close(); } catch (e) {}
      if (state.incomingScreenCalls[peerId] === call) delete state.incomingScreenCalls[peerId];
      if (state.currentScreenSharerPeerId === peerId) clearScreenViewer();
    }
  });
  if (!state.screenStream || !state.peer?.id) {
    Object.values(state.activeScreenCalls).forEach(call => { try { call.close(); } catch (e) {} });
    state.activeScreenCalls = {};
    return;
  }
  const peers = new Set(state.roster.map(member => member.peerId).filter(peerId => peerId && peerId !== state.peer.id));
  Object.entries(state.activeScreenCalls).forEach(([peerId, call]) => {
    if (!peers.has(peerId)) {
      try { call.close(); } catch (e) {}
      delete state.activeScreenCalls[peerId];
    }
  });
  peers.forEach(peerId => {
    if (state.activeScreenCalls[peerId]) return;
    const call = state.peer.call(peerId, state.screenStream, {
      metadata: { type: 'screen-share', sharerName: state.myNickname }
    });
    state.activeScreenCalls[peerId] = call;
  });
}

export async function handleScreenTakeoverRequest(fromPeerId, nickname, sharerPeerId = state.peer?.id) {
  if (sharerPeerId !== state.peer?.id) return;
  if (!state.screenStream) {
    sendScreenTakeoverResponse(fromPeerId, true);
    return;
  }
  const allow = await showConfirmDialog(`${nickname} wants to share their screen. Stop yours?`, {
    title: 'Screen sharing request',
    confirmText: 'Allow',
    cancelText: 'Keep sharing'
  });
  if (allow) stopScreenShare();
  sendScreenTakeoverResponse(fromPeerId, allow);
}

function sendScreenTakeoverResponse(toPeerId, accepted) {
  if (state.isHost) {
    const target = state.connections.find(connection => connection.peer === toPeerId);
    if (target) target.send({ type: 'screen-takeover-response', accepted });
  } else if (state.conn) {
    state.conn.send({ type: 'screen-takeover-response', toPeerId, accepted });
  }
}

export function handleScreenTakeoverResponse(accepted) {
  if (!accepted) {
    pendingTakeover = null;
    showToast('The current sharer chose to keep sharing', 'info');
    return;
  }
  // getDisplayMedia() needs a recent click, and this approval arrives over the network,
  // so ask the user to start the share themselves.
  const sharerName = pendingTakeover?.nickname || 'The other participant';
  const approvedBy = pendingTakeover;
  dismissTakeoverToast();
  pendingTakeover = approvedBy;
  takeoverToast = showToast(`${sharerName} stopped sharing. Start your share now`, 'success', {
    label: 'Share screen',
    persistent: true,
    onClick: () => {
      dismissTakeoverToast();
      startScreenShare(true);
    }
  });
  takeoverToastTimeoutId = scheduleTimeout(dismissTakeoverToast, 30000);
}

export function forceStopScreenShare(peerId) {
  if (!state.isHost) return;
  const sharer = state.connections.find(connection => connection.peer === peerId);
  if (sharer) sharer.send({ type: 'force-stop-screen-share' });
}

export function showScreenStream(stream, sharerName = 'Unknown') {
  state.currentScreenSharer = sharerName;

  const viewer = document.getElementById('screenViewer');
  const modalViewer = document.getElementById('screenViewerModal');
  const placeholder = document.getElementById('screenPlaceholder');
  const badge = document.getElementById('screenSharerBadge');
  const titleLabel = document.getElementById('screenTitleLabel');
  const nameText = document.getElementById('screenSharerNameText');

  if (viewer) {
    viewer.srcObject = stream;
    viewer.play().catch(() => {});
    viewer.style.display = 'block';
  }

  if (modalViewer) {
    modalViewer.srcObject = stream;
    modalViewer.play().catch(() => {});
  }

  if (placeholder) {
    placeholder.style.display = 'none';
  }

  if (badge) {
    badge.textContent = `Sharer: ${sharerName}`;
  }

  if (titleLabel && nameText) {
    nameText.textContent = `${sharerName} is sharing screen`;
    titleLabel.style.display = 'flex';
  }

  openScreenModal();
}

export function clearScreenViewer() {
  state.currentScreenSharer = null;
  state.currentScreenSharerPeerId = null;

  const viewer = document.getElementById('screenViewer');
  const modalViewer = document.getElementById('screenViewerModal');
  const placeholder = document.getElementById('screenPlaceholder');
  const titleLabel = document.getElementById('screenTitleLabel');

  if (viewer) {
    viewer.srcObject = null;
    viewer.style.display = 'none';
  }

  if (modalViewer) {
    modalViewer.srcObject = null;
  }

  if (placeholder) {
    placeholder.style.display = 'flex';
  }

  if (titleLabel) {
    titleLabel.style.display = 'none';
  }
}

export function openScreenModal() {
  const modal = document.getElementById('screenModal');
  if (modal) modal.style.display = 'flex';
}

export function closeScreenModal() {
  const modal = document.getElementById('screenModal');
  if (modal) modal.style.display = 'none';
}

export function toggleScreenShareButtons(isSharing) {
  const shareBtn = document.getElementById('shareScreenBtn');
  const stopBtn = document.getElementById('stopScreenBtn');

  if (shareBtn) shareBtn.style.display = isSharing ? 'none' : 'inline-block';
  if (stopBtn) stopBtn.style.display = isSharing ? 'inline-block' : 'none';
}
