import state from './state.js';
import { APP_TITLE, APP_VERSION } from './constants.js';
import { showToast, scheduleTimeout, clearManagedTimeout, normalizeRoomCode, formatRoomCode, sanitizeNickname } from './utils.js';
import {
  initTheme,
  toggleTheme,
  appendMessage,
  clearChat,
  exportChat,
  hideTypingIndicator,
  toggleEmojiPicker,
  renderEmojis,
  openGifModal,
  closeGifModal,
  loadGifs,
  showConfirmDialog
} from './ui.js';
import { initPeer, connectToHost, broadcast, muteAllParticipants, toggleLockRoom } from './peer.js';
import { startVoice, startVideoMeeting, toggleCamera, toggleMute, leaveVoice } from './voice.js';
import { sendFile, addStagedFiles, renderStagedFiles, clearReceivedFiles, cleanupFileTransfers, cleanupStaleFileEntries } from './files.js';
import { startScreenShare, stopScreenShare, closeScreenModal } from './screen.js';
import { resetSession } from './session.js';
import {
  buildPeerOptions,
  decodeSignalSettings,
  encodeSignalSettings,
  loadConnectionSettings,
  saveConnectionSettings,
  validateConnectionSettings
} from './connection-settings.js';

window.addEventListener('DOMContentLoaded', () => {
  void cleanupStaleFileEntries();
  window.addEventListener('pagehide', cleanupFileTransfers);
  initTheme();
  const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
  if (debugMode) window.state = state;

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const signalParam = urlParams.get('sig');
  const inviteSignalSettings = signalParam ? decodeSignalSettings(signalParam) : null;
  const invalidSignalInvite = !!signalParam && !inviteSignalSettings;
  const quickRoomCode = normalizeRoomCode(roomParam);
  const quickJoinMode = !!roomParam && !!quickRoomCode;
  const quickJoinScreen = document.getElementById('quickJoinScreen');
  const quickJoinTitle = document.getElementById('quickJoinTitle');
  const quickJoinForm = document.getElementById('quickJoinForm');
  const quickNicknameInput = document.getElementById('quickNickname');
  const quickPasscodeField = document.getElementById('quickPasscodeField');
  const quickPasscodeInput = document.getElementById('quickPasscode');
  const quickJoinError = document.getElementById('quickJoinError');
  const quickJoinButton = document.getElementById('quickJoinButton');
  const customServerNotice = document.getElementById('customServerNotice');
  if (customServerNotice && inviteSignalSettings) {
    customServerNotice.textContent = `This room uses a custom server: ${inviteSignalSettings.host}`;
    customServerNotice.hidden = false;
  } else if (customServerNotice && invalidSignalInvite) {
    customServerNotice.textContent = 'This invite has invalid custom server settings. Ask the host for a new invite.';
    customServerNotice.hidden = false;
  }
  const nicknameInput = document.getElementById('nickname');
  const colorInput = document.getElementById('color');
  const profileStorageKey = 'chitlan_profile';
  let savedProfile = {};
  try {
    savedProfile = JSON.parse(localStorage.getItem(profileStorageKey) || '{}');
  } catch (error) {}
  if (typeof savedProfile?.nickname === 'string' && nicknameInput) {
    nicknameInput.value = sanitizeNickname(savedProfile.nickname);
  }
  if (typeof savedProfile?.color === 'string' && colorInput
      && Array.from(colorInput.options).some(option => option.value === savedProfile.color)) {
    colorInput.value = savedProfile.color;
  }
  if (quickNicknameInput) quickNicknameInput.value = nicknameInput?.value || '';

  const rememberProfile = () => {
    const validColor = colorInput && Array.from(colorInput.options).some(option => option.value === colorInput.value)
      ? colorInput.value
      : '#60a5fa';
    try {
      localStorage.setItem(profileStorageKey, JSON.stringify({
        nickname: sanitizeNickname(nicknameInput?.value),
        color: validColor
      }));
    } catch (error) {}
  };
  nicknameInput?.addEventListener('input', () => {
    if (quickNicknameInput && document.activeElement !== quickNicknameInput) {
      quickNicknameInput.value = nicknameInput.value;
    }
    rememberProfile();
  });
  colorInput?.addEventListener('change', rememberProfile);
  quickNicknameInput?.addEventListener('input', () => {
    if (nicknameInput) nicknameInput.value = quickNicknameInput.value;
    rememberProfile();
  });

  const connectionSettingsPanel = document.getElementById('connectionSettingsPanel');
  const connectionSettingsToggle = document.getElementById('connectionSettingsToggle');
  const signalingModeInput = document.getElementById('signalingMode');
  const customSignalingFields = document.getElementById('customSignalingFields');
  const signalingHostInput = document.getElementById('signalingHost');
  const signalingPortInput = document.getElementById('signalingPort');
  const signalingPathInput = document.getElementById('signalingPath');
  const signalingSecureInput = document.getElementById('signalingSecure');
  const iceServerList = document.getElementById('iceServerList');
  const connectionTestStatus = document.getElementById('connectionTestStatus');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const savedConnectionSettings = loadConnectionSettings();

  if (signalingModeInput) signalingModeInput.value = savedConnectionSettings.signaling.mode;
  if (signalingHostInput) signalingHostInput.value = savedConnectionSettings.signaling.host;
  if (signalingPortInput) signalingPortInput.value = String(savedConnectionSettings.signaling.port);
  if (signalingPathInput) signalingPathInput.value = savedConnectionSettings.signaling.path;
  if (signalingSecureInput) signalingSecureInput.checked = savedConnectionSettings.signaling.secure;

  const createIceServerRow = server => {
    const row = document.createElement('div');
    row.className = 'ice-server-row';
    const fields = document.createElement('div');
    fields.className = 'ice-server-row-fields';
    [
      ['URL', 'urls', server.urls || '', 'stun:host:3478 or turn:host:3478'],
      ['Username', 'username', server.username || '', 'Optional'],
      ['Credential', 'credential', server.credential || '', 'Optional']
    ].forEach(([labelText, fieldName, value, placeholder]) => {
      const label = document.createElement('label');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = fieldName === 'credential' ? 'password' : 'text';
      input.autocomplete = 'off';
      input.dataset.iceField = fieldName;
      input.value = value;
      input.placeholder = placeholder;
      label.appendChild(input);
      fields.appendChild(label);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ice-server-remove';
    remove.dataset.removeIceServer = 'true';
    remove.setAttribute('aria-label', 'Remove ICE server');
    remove.textContent = '\u00d7';
    fields.appendChild(remove);
    row.appendChild(fields);
    return row;
  };

  const renderIceServers = servers => {
    if (!iceServerList) return;
    iceServerList.replaceChildren(...servers.map(createIceServerRow));
  };
  renderIceServers(savedConnectionSettings.iceServers);

  const readConnectionSettingsForm = () => ({
    signaling: {
      mode: signalingModeInput?.value || 'public',
      host: signalingHostInput?.value.trim() || '',
      port: signalingPortInput?.value === '' ? NaN : Number(signalingPortInput?.value),
      path: signalingPathInput?.value.trim() || '',
      secure: !!signalingSecureInput?.checked
    },
    iceServers: Array.from(iceServerList?.querySelectorAll('.ice-server-row') || []).map(row => ({
      urls: row.querySelector('[data-ice-field="urls"]')?.value || '',
      username: row.querySelector('[data-ice-field="username"]')?.value || '',
      credential: row.querySelector('[data-ice-field="credential"]')?.value || ''
    }))
  });

  const persistConnectionSettings = () => {
    saveConnectionSettings(readConnectionSettingsForm());
    if (connectionTestStatus) connectionTestStatus.textContent = '';
  };
  const updateCustomSignalingVisibility = () => {
    if (customSignalingFields) customSignalingFields.hidden = signalingModeInput?.value !== 'custom';
  };
  updateCustomSignalingVisibility();
  connectionSettingsToggle?.addEventListener('click', () => {
    const open = connectionSettingsPanel?.hidden ?? true;
    if (connectionSettingsPanel) connectionSettingsPanel.hidden = !open;
    connectionSettingsToggle.setAttribute('aria-expanded', String(open));
  });
  signalingModeInput?.addEventListener('change', () => {
    updateCustomSignalingVisibility();
    persistConnectionSettings();
  });
  [signalingHostInput, signalingPortInput, signalingPathInput, signalingSecureInput].forEach(input => {
    input?.addEventListener('input', persistConnectionSettings);
    input?.addEventListener('change', persistConnectionSettings);
  });
  iceServerList?.addEventListener('input', persistConnectionSettings);
  iceServerList?.addEventListener('change', persistConnectionSettings);
  iceServerList?.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-remove-ice-server]');
    if (!removeButton) return;
    removeButton.closest('.ice-server-row')?.remove();
    persistConnectionSettings();
  });
  document.getElementById('addIceServerBtn')?.addEventListener('click', () => {
    iceServerList?.appendChild(createIceServerRow({ urls: '', username: '', credential: '' }));
    persistConnectionSettings();
    iceServerList?.lastElementChild?.querySelector('[data-ice-field="urls"]')?.focus();
  });

  testConnectionBtn?.addEventListener('click', async () => {
    const settings = readConnectionSettingsForm();
    const validationError = validateConnectionSettings(settings);
    if (validationError) {
      if (connectionTestStatus) connectionTestStatus.textContent = validationError;
      return;
    }
    persistConnectionSettings();
    testConnectionBtn.disabled = true;
    if (connectionTestStatus) connectionTestStatus.textContent = 'Testing signaling server...';
    let temporaryPeer = null;
    try {
      const { options } = buildPeerOptions(settings);
      temporaryPeer = new window.Peer(undefined, options);
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = callback => value => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          callback(value);
        };
        const onOpen = finish(resolve);
        const onError = finish(reject);
        const timeoutId = setTimeout(() => {
          const timeoutError = new Error('Connection test timed out');
          timeoutError.type = 'timeout';
          onError(timeoutError);
        }, 15000);
        temporaryPeer.on('open', onOpen);
        temporaryPeer.on('error', onError);
      });
      if (connectionTestStatus) connectionTestStatus.textContent = 'Connection succeeded.';
    } catch (error) {
      if (connectionTestStatus) connectionTestStatus.textContent = `Connection failed (PeerJS error: ${error?.type || 'unknown'}).`;
    } finally {
      try { temporaryPeer?.destroy(); } catch (error) {}
      testConnectionBtn.disabled = false;
    }
  });

  window.addEventListener('focus', () => {
    state.pageFocused = true;
    state.unreadCount = 0;
    document.title = APP_TITLE;
  });

  window.addEventListener('blur', () => {
    state.pageFocused = false;
  });

  const launchBtn = document.getElementById('launchBtn');
  const connectBtn = document.getElementById('connectBtn');
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  let initializing = false;
  let customServerConfirmed = false;

  const setInitializing = value => {
    initializing = value;
    [launchBtn, connectBtn, tryAgainBtn, quickJoinButton].forEach(button => {
      if (button) button.disabled = value;
    });
  };

  const launchSession = async (role, requestedCode = '') => {
    if (initializing || state.peer) return;
    if (role === 'join' && invalidSignalInvite) {
      if (quickJoinError) {
        quickJoinError.textContent = 'This invite has invalid custom server settings. Ask the host for a new invite.';
        quickJoinError.hidden = false;
      }
      return;
    }
    const nicknameInput = document.getElementById('nickname');
    const nickname = sanitizeNickname(nicknameInput?.value);
    if (nicknameInput) nicknameInput.value = nickname;
    const color = document.getElementById('color')?.value || '#60a5fa';
    const passcode = document.getElementById('room-passcode')?.value || '';
    if (!nickname) {
      showToast('Please enter a nickname', 'error');
      nicknameInput?.focus();
      return;
    }
    rememberProfile();
    const roomCode = requestedCode || document.getElementById('connect-id')?.value.trim() || '';
    if (role === 'join' && !roomCode) {
      showToast('Please enter the host room code', 'error');
      document.getElementById('connect-id')?.focus();
      return;
    }

    const launchSettings = readConnectionSettingsForm();
    if (role === 'join' && inviteSignalSettings) {
      launchSettings.signaling = { ...inviteSignalSettings, mode: 'custom' };
    }
    const settingsError = validateConnectionSettings(launchSettings);
    if (settingsError) {
      if (quickJoinMode && quickJoinError) {
        quickJoinError.textContent = settingsError;
        quickJoinError.hidden = false;
      } else {
        if (connectionTestStatus) connectionTestStatus.textContent = settingsError;
        if (connectionSettingsPanel) connectionSettingsPanel.hidden = false;
        connectionSettingsToggle?.setAttribute('aria-expanded', 'true');
        connectionSettingsPanel?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    persistConnectionSettings();

    setInitializing(true);
    try {
      if (role === 'join' && inviteSignalSettings && !customServerConfirmed) {
        const accepted = await showConfirmDialog(
          `This room uses a custom server: ${inviteSignalSettings.host}. Continue only if you trust this server.`,
          { title: 'Custom signaling server', confirmText: 'Connect' }
        );
        if (!accepted) return;
        customServerConfirmed = true;
      }
      await initPeer(nickname, color, role, passcode, role === 'join' ? inviteSignalSettings : null);
      if (role === 'join') await connectToHost(roomCode);
      if (role === 'join' && quickJoinMode) {
        document.body.classList.remove('quick-join-mode');
        if (quickJoinScreen) quickJoinScreen.hidden = true;
      }
      const workspace = document.querySelector('.workspace');
      workspace?.scrollIntoView({ behavior: 'smooth' });
      if (tryAgainBtn) tryAgainBtn.style.display = 'none';
    } catch (error) {
      if (quickJoinMode && state.peer) resetSession();
      if (quickJoinMode && quickJoinError) {
        quickJoinError.textContent = error?.message || 'Could not join the room. Please try again.';
        quickJoinError.hidden = false;
        if (error?.reason === 'wrong-passcode' && quickPasscodeField && quickPasscodeInput) {
          quickPasscodeField.hidden = false;
          quickPasscodeInput.required = true;
          quickPasscodeInput.focus();
        }
      }
    } finally {
      setInitializing(false);
    }
  };

  if (launchBtn) {
    launchBtn.addEventListener('click', () => {
      const roleInput = document.querySelector('input[name="role"]:checked');
      const role = roleInput ? roleInput.value : 'host';
      launchSession(role);
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const connectIdInput = document.getElementById('connect-id');
      const hostId = connectIdInput ? connectIdInput.value.trim() : '';
      if (!hostId) {
        showToast('Please enter the host room code', 'error');
        if (connectIdInput) connectIdInput.focus();
        return;
      }
      if (state.conn || initializing) return;
      if (state.peer) {
        setInitializing(true);
        connectToHost(hostId).catch(() => {}).finally(() => setInitializing(false));
      } else launchSession('join', hostId);
    });
  }

  if (quickJoinForm) {
    quickJoinForm.addEventListener('submit', event => {
      event.preventDefault();
      const nickname = sanitizeNickname(quickNicknameInput?.value);
      if (quickNicknameInput) quickNicknameInput.value = nickname;
      if (nicknameInput) nicknameInput.value = nickname;
      const roomInput = document.getElementById('connect-id');
      if (roomInput) roomInput.value = formatRoomCode(quickRoomCode);
      const passcodeInput = document.getElementById('room-passcode');
      if (passcodeInput) passcodeInput.value = quickPasscodeInput?.value || '';
      if (quickJoinError) {
        quickJoinError.textContent = '';
        quickJoinError.hidden = true;
      }
      rememberProfile();
      launchSession('join', quickRoomCode);
    });
  }

  if (tryAgainBtn) {
    tryAgainBtn.addEventListener('click', () => {
      const role = document.querySelector('input[name="role"]:checked')?.value || 'join';
      launchSession(role);
    });
  }

  const copyPeerBtn = document.getElementById('copyPeer');
  const copyRoomBtn = document.getElementById('copyRoomBtn');

  const handleCopyPeer = () => {
    const peerIdInput = document.getElementById('peer-id');
    if (!peerIdInput || !peerIdInput.value) {
      showToast('No room code generated yet', 'info');
      return;
    }

    navigator.clipboard.writeText(peerIdInput.value)
      .then(() => showToast('Room code copied to clipboard!', 'success'))
      .catch(() => showToast('Could not copy room code', 'error'));
  };

  if (copyPeerBtn) copyPeerBtn.addEventListener('click', handleCopyPeer);
  if (copyRoomBtn) copyRoomBtn.addEventListener('click', handleCopyPeer);

  const getCurrentRoomCode = () => normalizeRoomCode(
    state.roomCode
    || document.getElementById('peer-id')?.value
    || document.getElementById('connect-id')?.value
  );
  const buildInviteUrl = () => {
    const code = getCurrentRoomCode();
    if (!code) return '';
    const inviteUrl = new URL(window.location.pathname, window.location.origin);
    inviteUrl.searchParams.set('room', formatRoomCode(code));
    const signaling = state.peerSignalSettings?.mode === 'custom'
      ? state.peerSignalSettings
      : !state.peer ? loadConnectionSettings().signaling : null;
    if (signaling?.mode === 'custom') {
      const signature = encodeSignalSettings(signaling);
      if (signature) inviteUrl.searchParams.set('sig', signature);
    }
    return inviteUrl.toString();
  };
  const shareInvite = async () => {
    const code = getCurrentRoomCode();
    const inviteUrl = buildInviteUrl();
    if (!inviteUrl) {
      showToast('Start or join a room before sharing an invite', 'info');
      return;
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Join my ChitLAN room',
          text: `Join room ${formatRoomCode(code)}`,
          url: inviteUrl
        });
        showToast('Invite shared', 'success');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast('Invite link copied to clipboard!', 'success');
    } catch (error) {
      showToast('Could not share or copy the invite link', 'error');
    }
  };

  const shareRoomBtn = document.getElementById('shareRoomBtn');
  if (shareRoomBtn) shareRoomBtn.addEventListener('click', shareInvite);

  const qrModal = document.getElementById('qrModal');
  const qrModalContent = qrModal?.querySelector('.qr-modal-content');
  const qrCanvas = document.getElementById('inviteQrCanvas');
  const closeQrModal = () => {
    if (qrModal) qrModal.hidden = true;
    document.body.style.overflow = '';
    document.getElementById('showQrBtn')?.focus();
  };
  const openQrModal = () => {
    const code = getCurrentRoomCode();
    const inviteUrl = buildInviteUrl();
    if (!code || !inviteUrl) {
      showToast('Start or join a room before showing its QR code', 'info');
      return;
    }
    if (typeof window.qrcode !== 'function' || !qrCanvas) {
      showToast('The QR code generator could not be loaded', 'error');
      return;
    }

    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(inviteUrl);
      qr.make();
      const context = qrCanvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable');
      const moduleCount = qr.getModuleCount();
      const quietZone = 4;
      const totalModules = moduleCount + quietZone * 2;
      const cellSize = Math.floor(qrCanvas.width / totalModules);
      const offset = Math.floor((qrCanvas.width - cellSize * totalModules) / 2);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, qrCanvas.width, qrCanvas.height);
      context.fillStyle = '#070b14';
      for (let row = 0; row < moduleCount; row++) {
        for (let column = 0; column < moduleCount; column++) {
          if (!qr.isDark(row, column)) continue;
          context.fillRect(
            offset + (column + quietZone) * cellSize,
            offset + (row + quietZone) * cellSize,
            cellSize,
            cellSize
          );
        }
      }
      document.getElementById('qrRoomCode').textContent = formatRoomCode(code);
      document.getElementById('qrInviteUrl').textContent = inviteUrl;
      qrModal.hidden = false;
      document.body.style.overflow = 'hidden';
      qrModalContent?.focus();
    } catch (error) {
      showToast('Could not create the room QR code', 'error');
    }
  };
  document.getElementById('showQrBtn')?.addEventListener('click', openQrModal);
  document.getElementById('closeQrModalBtn')?.addEventListener('click', closeQrModal);
  document.getElementById('closeQrModalAction')?.addEventListener('click', closeQrModal);
  document.getElementById('qrModalOverlay')?.addEventListener('click', closeQrModal);
  document.getElementById('shareQrInviteBtn')?.addEventListener('click', shareInvite);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && qrModal && !qrModal.hidden) closeQrModal();
  });

  const clearChatBtn = document.getElementById('clearChatBtn');
  if (clearChatBtn) clearChatBtn.addEventListener('click', () => {
    clearReceivedFiles();
    clearChat();
  });
  const exportChatBtn = document.getElementById('exportChatBtn');
  if (exportChatBtn) exportChatBtn.addEventListener('click', exportChat);

  const disconnectBtn = document.getElementById('disconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      stopLocalTyping();
      resetSession();
    });
  }

  const msgInput = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  let lastTypingSentAt = 0;
  let localTypingActive = false;

  const sendTypingState = type => {
    if (!state.peer) return;
    const payload = { type, nickname: state.myNickname, fromPeerId: state.peer.id };
    if (state.isHost) {
      state.connections.forEach(connection => {
        if (connection.open !== false) connection.send(payload);
      });
    } else if (state.conn) {
      state.conn.send(payload);
    }
  };

  const stopLocalTyping = () => {
    sendTypingState('typing-stop');
    localTypingActive = false;
    hideTypingIndicator(state.peer?.id || null);
  };

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
    sendTypingState('typing-stop');
    localTypingActive = false;
    hideTypingIndicator(state.peer?.id || null);
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
      if (!msgInput.value.trim()) {
        stopLocalTyping();
        return;
      }
      const now = Date.now();
      if (now - lastTypingSentAt >= 1500) {
        sendTypingState('typing');
        lastTypingSentAt = now;
        localTypingActive = true;
      }
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  const selectFileBtn = document.getElementById('selectFileBtn');
  const fileInput = document.getElementById('fileInput');
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
      addStagedFiles(fileInput.files);
      fileInput.value = '';
    });
  }

  renderStagedFiles();
  if (sendFileBtn) sendFileBtn.addEventListener('click', sendFile);
  if (fileShareBtn) fileShareBtn.addEventListener('click', () => {
    if (state.stagedFiles.length) sendFile();
    else fileInput?.click();
  });
  if (msgInput) {
    msgInput.addEventListener('paste', event => {
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      event.preventDefault();
      addStagedFiles(files);
    });
  }

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
      clearManagedTimeout(gifSearchTimeout);
      gifSearchTimeout = scheduleTimeout(() => {
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
        chatContainer.classList.add('is-drop-target');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      chatContainer.addEventListener(eventName, e => {
        e.preventDefault();
        e.stopPropagation();
        if (eventName === 'dragleave' && chatContainer.contains(e.relatedTarget)) return;
        chatContainer.classList.remove('is-drop-target');
      }, false);
    });

    chatContainer.addEventListener('drop', e => {
      addStagedFiles(e.dataTransfer?.files);
    });
  }

  if (roomParam) {
    const connectIdInput = document.getElementById('connect-id');
    const roleJoinRadio = document.querySelector('input[name="role"][value="join"]');
    if (connectIdInput) connectIdInput.value = roomParam;
    if (roleJoinRadio) roleJoinRadio.checked = true;
    if (quickJoinMode) {
      document.body.classList.add('quick-join-mode');
      if (quickJoinScreen) quickJoinScreen.hidden = false;
      if (quickJoinTitle) quickJoinTitle.textContent = `Join room ${formatRoomCode(quickRoomCode)}`;
    } else {
      showToast('This invite link has an invalid room code', 'error');
    }
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

  const offlineBanner = document.getElementById('offlineBanner');
  const updateOfflineBanner = () => {
    if (offlineBanner) offlineBanner.hidden = navigator.onLine;
  };
  window.addEventListener('online', updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);
  updateOfflineBanner();

  if ('serviceWorker' in navigator) {
    let reloadAfterUpdate = false;
    let updateToastShown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadAfterUpdate) window.location.reload();
    });

    const showUpdateAvailable = (registration, waitingWorker) => {
      if (updateToastShown || !navigator.serviceWorker.controller) return;
      updateToastShown = true;
      showToast('A new version is available', 'info', {
        label: 'Reload',
        persistent: true,
        onClick: () => {
          reloadAfterUpdate = true;
          const waiting = registration.waiting || waitingWorker;
          if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
          else window.location.reload();
        }
      });
    };

    navigator.serviceWorker.register('./sw.js', { type: 'module' })
      .then(registration => {
        if (registration.waiting) showUpdateAvailable(registration, registration.waiting);
        const watchInstallingWorker = installing => {
          if (!installing) return;
          const checkInstalledState = () => {
            if (installing.state === 'installed' && registration.waiting) {
              showUpdateAvailable(registration, registration.waiting);
            }
          };
          installing.addEventListener('statechange', checkInstalledState);
          checkInstalledState();
        };
        watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => watchInstallingWorker(registration.installing));

      const checkForUpdate = () => {
        if (navigator.onLine && document.visibilityState === 'visible') {
          registration.update().catch(() => {});
        }
      };
      window.addEventListener('focus', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
      document.addEventListener('visibilitychange', checkForUpdate);
      checkForUpdate();
      })
      .catch(error => {
        if (debugMode) console.warn('Service worker registration failed', error);
      });
  }

  if (debugMode) console.log(`ChitLAN v${APP_VERSION} fully initialized`);
});
