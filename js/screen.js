import state from './state.js';
import { appendSystemMessage } from './ui.js';
import { showToast } from './utils.js';

export async function startScreenShare() {
  if (state.screenStream) {
    openScreenModal();
    return;
  }

  // Conflict / Takeover Prompt if another user is currently sharing
  if (state.currentScreenSharer && state.currentScreenSharer !== state.myNickname) {
    const confirmTakeover = confirm(`${state.currentScreenSharer} is currently sharing their screen. Starting your screen share will stop their stream. Do you want to continue?`);
    if (!confirmTakeover) return;

    // Send stop request to active sharer
    const takeoverPayload = { type: 'screen-status', action: 'stop-request', requester: state.myNickname };
    if (state.isHost) {
      state.connections.forEach(c => c.send(takeoverPayload));
    } else if (state.conn) {
      state.conn.send(takeoverPayload);
    }
  }

  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    state.currentScreenSharer = state.myNickname;
    showScreenStream(state.screenStream, `${state.myNickname} (You)`);
    openScreenModal();

    const videoTrack = state.screenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare();
      };
    }

    if (state.isHost) {
      state.connections.forEach(c => {
        const screenCall = state.peer.call(c.peer, state.screenStream, {
          metadata: {
            type: 'screen-share',
            sharerName: state.myNickname
          }
        });
        state.activeScreenCalls[c.peer] = screenCall;
      });
    } else if (state.conn) {
      const screenCall = state.peer.call(state.conn.peer, state.screenStream, {
        metadata: {
          type: 'screen-share',
          sharerName: state.myNickname
        }
      });
      state.activeScreenCalls[state.conn.peer] = screenCall;
    }

    const payload = { type: 'screen-status', action: 'started', nickname: state.myNickname };
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

export function stopScreenShare() {
  if (!state.screenStream) return;

  state.screenStream.getTracks().forEach(track => track.stop());
  state.screenStream = null;
  state.currentScreenSharer = null;

  Object.values(state.activeScreenCalls).forEach(call => {
    try { call.close(); } catch (e) {}
  });
  state.activeScreenCalls = {};

  const payload = { type: 'screen-status', action: 'stopped', nickname: state.myNickname };
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
