import state from './state.js';
import { APP_TITLE } from './constants.js';
import { detectPublicIP, showToast } from './utils.js';
import {
  initTheme,
  toggleTheme,
  appendMessage,
  clearChat,
  hideTypingIndicator,
  toggleEmojiPicker,
  renderEmojis,
  openGifModal,
  closeGifModal,
  loadGifs
} from './ui.js';
import { initPeer, connectToHost, broadcast, muteAllParticipants, toggleLockRoom } from './peer.js';
import { startVoice, startVideoMeeting, toggleCamera, toggleMute, leaveVoice } from './voice.js';
import { sendFile } from './files.js';
import { startScreenShare, stopScreenShare, closeScreenModal } from './screen.js';

window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  detectPublicIP();

  window.state = state;

  window.addEventListener('focus', () => {
    state.pageFocused = true;
    state.unreadCount = 0;
    document.title = APP_TITLE;
  });

  window.addEventListener('blur', () => {
    state.pageFocused = false;
  });

  const launchBtn = document.getElementById('launchBtn');
  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      const nicknameInput = document.getElementById('nickname');
      const colorInput = document.getElementById('color');
      const roleInput = document.querySelector('input[name="role"]:checked');

      const nickname = nicknameInput ? nicknameInput.value.trim() : '';
      const color = colorInput ? colorInput.value : '#60a5fa';
      const role = roleInput ? roleInput.value : 'host';

      if (!nickname) {
        showToast('Please enter a nickname', 'error');
        if (nicknameInput) nicknameInput.focus();
        return;
      }

      initPeer(nickname, color, role);

      if (role === 'join') {
        const connectId = document.getElementById('connect-id').value.trim();
        if (connectId) {
          setTimeout(() => connectToHost(connectId), 1000);
        } else {
          showToast('Enter host Peer ID to connect', 'info');
        }
      }

      const workspace = document.querySelector('.workspace');
      if (workspace) {
        workspace.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const connectIdInput = document.getElementById('connect-id');
      const hostId = connectIdInput ? connectIdInput.value.trim() : '';

      if (!hostId) {
        showToast('Please enter Host Peer ID', 'error');
        if (connectIdInput) connectIdInput.focus();
        return;
      }

      if (!state.peer) {
        const nickname = (document.getElementById('nickname')?.value || 'Joiner').trim();
        const color = document.getElementById('color')?.value || '#4ade80';
        initPeer(nickname, color, 'join');
        setTimeout(() => connectToHost(hostId), 1000);
      } else {
        connectToHost(hostId);
      }
    });
  }

  const copyPeerBtn = document.getElementById('copyPeer');
  const copyRoomBtn = document.getElementById('copyRoomBtn');

  const handleCopyPeer = () => {
    const peerIdInput = document.getElementById('peer-id');
    if (!peerIdInput || !peerIdInput.value) {
      showToast('No Room ID generated yet', 'info');
      return;
    }

    navigator.clipboard.writeText(peerIdInput.value)
      .then(() => showToast('Room ID copied to clipboard!', 'success'))
      .catch(() => showToast('Could not copy Room ID', 'error'));
  };

  if (copyPeerBtn) copyPeerBtn.addEventListener('click', handleCopyPeer);
  if (copyRoomBtn) copyRoomBtn.addEventListener('click', handleCopyPeer);

  const shareRoomBtn = document.getElementById('shareRoomBtn');
  if (shareRoomBtn) {
    shareRoomBtn.addEventListener('click', () => {
      const peerId = document.getElementById('peer-id')?.value;
      if (!peerId) {
        showToast('Start a session first to share', 'info');
        return;
      }
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${peerId}`;
      navigator.clipboard.writeText(shareUrl)
        .then(() => showToast('Invite link copied to clipboard!', 'success'))
        .catch(() => showToast('Could not copy link', 'error'));
    });
  }

  const clearChatBtn = document.getElementById('clearChatBtn');
  if (clearChatBtn) clearChatBtn.addEventListener('click', clearChat);

  const disconnectBtn = document.getElementById('disconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      if (state.isInCall || state.isInVideoMeeting) leaveVoice();
      if (state.screenStream) stopScreenShare();

      if (state.conn) {
        try { state.conn.close(); } catch (e) {}
        state.conn = null;
      }

      state.connections.forEach(c => {
        try { c.close(); } catch (e) {}
      });
      state.connections = [];

      if (state.peer) {
        try { state.peer.destroy(); } catch (e) {}
        state.peer = null;
      }

      showToast('Disconnected from workspace', 'info');
      const navState = document.getElementById('navConnectionState');
      const sidebarState = document.getElementById('sidebarConnectionState');
      if (navState) navState.textContent = 'Disconnected';
      if (sidebarState) sidebarState.textContent = 'Offline';
    });
  }

  const msgInput = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');

  const sendMessage = () => {
    if (!msgInput) return;
    const msg = msgInput.value.trim();
    if (!msg) return;

    const timestamp = Date.now();
    appendMessage(state.myNickname || 'You', msg, state.myColor, true, timestamp);

    const payload = {
      type: 'message',
      nickname: state.myNickname || 'User',
      color: state.myColor,
      message: msg,
      timestamp
    };

    if (state.isHost) {
      broadcast(state.myNickname || 'Host', msg, state.myColor, null, false, timestamp);
    } else if (state.conn) {
      state.conn.send(payload);
    }

    msgInput.value = '';
    hideTypingIndicator();
  };

  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  if (msgInput) {
    msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    msgInput.addEventListener('input', () => {
      if (!state.isHost && state.conn) {
        state.conn.send({ type: 'typing', nickname: state.myNickname });
      }
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const selectFileBtn = document.getElementById('selectFileBtn');
  const fileInput = document.getElementById('fileInput');
  const selectedFileLabel = document.getElementById('selectedFile');
  const sendFileBtn = document.getElementById('sendFileBtn');
  const fileShareBtn = document.getElementById('fileShareBtn');
  const attachmentBtn = document.getElementById('attachmentBtn');

  if (selectFileBtn && fileInput) {
    selectFileBtn.addEventListener('click', () => fileInput.click());
  }

  if (attachmentBtn && fileInput) {
    attachmentBtn.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0 && selectedFileLabel) {
        selectedFileLabel.textContent = fileInput.files[0].name;
      }
    });
  }

  if (sendFileBtn) sendFileBtn.addEventListener('click', sendFile);
  if (fileShareBtn) fileShareBtn.addEventListener('click', sendFile);

  // Voice & Video Call Buttons
  const voiceToggleBtn = document.getElementById('voiceToggleBtn');
  const videoToggleBtn = document.getElementById('videoToggleBtn');
  const joinBtn = document.getElementById('joinBtn');
  const camBtn = document.getElementById('camBtn');
  const muteBtn = document.getElementById('muteBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  if (voiceToggleBtn) voiceToggleBtn.addEventListener('click', startVoice);
  if (videoToggleBtn) videoToggleBtn.addEventListener('click', startVideoMeeting);
  if (joinBtn) joinBtn.addEventListener('click', startVoice);
  if (camBtn) camBtn.addEventListener('click', toggleCamera);
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);
  if (leaveBtn) leaveBtn.addEventListener('click', leaveVoice);

  // Host Control Buttons
  const muteAllBtn = document.getElementById('muteAllBtn');
  const lockRoomBtn = document.getElementById('lockRoomBtn');

  if (muteAllBtn) muteAllBtn.addEventListener('click', muteAllParticipants);
  if (lockRoomBtn) lockRoomBtn.addEventListener('click', toggleLockRoom);

  // Screen Share Buttons
  const screenShareBtn = document.getElementById('screenShareBtn');
  const shareScreenBtn = document.getElementById('shareScreenBtn');
  const stopScreenBtn = document.getElementById('stopScreenBtn');

  if (screenShareBtn) screenShareBtn.addEventListener('click', startScreenShare);
  if (shareScreenBtn) shareScreenBtn.addEventListener('click', startScreenShare);
  if (stopScreenBtn) stopScreenBtn.addEventListener('click', stopScreenShare);

  const closeScreenModalBtn = document.getElementById('closeScreenModalBtn');
  const screenModalOverlay = document.getElementById('screenModalOverlay');
  const modalFullscreenBtn = document.getElementById('modalFullscreenBtn');

  if (closeScreenModalBtn) closeScreenModalBtn.addEventListener('click', closeScreenModal);
  if (screenModalOverlay) screenModalOverlay.addEventListener('click', closeScreenModal);
  if (modalFullscreenBtn) {
    modalFullscreenBtn.addEventListener('click', () => {
      const modalBody = document.querySelector('.screen-modal-body');
      if (modalBody) {
        if (!document.fullscreenElement) {
          modalBody.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    });
  }

  // Interactive Emoji Picker Handlers
  const emojiBtn = document.getElementById('emojiBtn');
  const emojiPicker = document.getElementById('emojiPicker');
  const emojiSearchInput = document.getElementById('emojiSearchInput');
  const emojiCatBtns = document.querySelectorAll('.emoji-cat-btn');

  if (emojiBtn) {
    emojiBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleEmojiPicker();
    });
  }

  if (emojiSearchInput) {
    emojiSearchInput.addEventListener('input', e => {
      renderEmojis('smileys', e.target.value);
    });
  }

  emojiCatBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      emojiCatBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEmojis(btn.dataset.cat);
    });
  });

  document.addEventListener('click', e => {
    if (emojiPicker && emojiPicker.style.display !== 'none') {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.style.display = 'none';
      }
    }
  });

  // GIF Selector Modal Handlers
  const gifBtn = document.getElementById('gifBtn');
  const closeGifModalBtn = document.getElementById('closeGifModalBtn');
  const gifModalOverlay = document.getElementById('gifModalOverlay');
  const gifSearchInput = document.getElementById('gifSearchInput');
  const gifCatChips = document.querySelectorAll('.gif-cat-chip');

  if (gifBtn) gifBtn.addEventListener('click', openGifModal);
  if (closeGifModalBtn) closeGifModalBtn.addEventListener('click', closeGifModal);
  if (gifModalOverlay) gifModalOverlay.addEventListener('click', closeGifModal);

  if (gifSearchInput) {
    let gifSearchTimeout;
    gifSearchInput.addEventListener('input', e => {
      clearTimeout(gifSearchTimeout);
      gifSearchTimeout = setTimeout(() => {
        const query = e.target.value.trim().toLowerCase();
        if (query) {
          gifCatChips.forEach(c => c.classList.remove('active'));
          loadGifs(query);
        }
      }, 300);
    });
  }

  gifCatChips.forEach(chip => {
    chip.addEventListener('click', () => {
      gifCatChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (gifSearchInput) gifSearchInput.value = '';
      loadGifs(chip.dataset.query);
    });
  });

  const fullscreenBtn = document.getElementById('fullscreenBtn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) {
    ['dragenter', 'dragover'].forEach(eventName => {
      chatContainer.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        chatContainer.style.border = '2px dashed var(--primary)';
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      chatContainer.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        chatContainer.style.border = 'none';
      }, false);
    });

    chatContainer.addEventListener('drop', e => {
      const dt = e.dataTransfer;
      const files = dt.files;

      if (files && files.length > 0 && fileInput) {
        fileInput.files = files;
        if (selectedFileLabel) selectedFileLabel.textContent = files[0].name;
        showToast(`File selected: ${files[0].name}. Click Send File to transfer.`, 'info');
      }
    });
  }

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const connectIdInput = document.getElementById('connect-id');
    const roleJoinRadio = document.querySelector('input[name="role"][value="join"]');
    if (connectIdInput) connectIdInput.value = roomParam;
    if (roleJoinRadio) roleJoinRadio.checked = true;
    showToast(`Invite room code detected: ${roomParam}`, 'info');
  }

  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  console.log('ChitLAN v3.0 fully initialized');
});