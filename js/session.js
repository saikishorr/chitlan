import state, { createInitialState } from './state.js';
import { clearManagedTimers } from './utils.js';
import { setConnectionStatus, renderUserList, hideTypingIndicator } from './ui.js';
import { updateVoiceUI } from './voice.js';
import { cleanupFileTransfers } from './files.js';

export function resetSession() {
  state.reconnectStopped = true;
  state.cancelPeerInit?.();
  state.cancelPendingConnection?.();
  hideTypingIndicator();
  cleanupFileTransfers();
  clearManagedTimers();

  const streams = new Set([
    state.localStream,
    state.videoStream,
    state.screenStream,
    ...Object.values(state.remoteVideoStreams || {}),
    ...Array.from(document.querySelectorAll('audio, video')).map(element => element.srcObject)
  ].filter(Boolean));
  streams.forEach(stream => {
    stream.getTracks?.().forEach(track => {
      try { track.stop(); } catch (e) {}
    });
  });

  const calls = new Set([
    ...Object.values(state.activeCalls || {}),
    ...Object.values(state.activeVideoCalls || {}),
    ...Object.values(state.activeScreenCalls || {}),
    ...Object.values(state.incomingScreenCalls || {})
  ].filter(Boolean));
  calls.forEach(call => {
    try { call.close(); } catch (e) {}
  });

  const connections = new Set([state.conn, ...(state.connections || [])].filter(Boolean));
  connections.forEach(connection => {
    try { connection.close(); } catch (e) {}
  });
  try { state.peer?.destroy(); } catch (e) {}

  Object.keys(state).forEach(key => delete state[key]);
  Object.assign(state, createInitialState());

  document.querySelectorAll('audio[id^="audio-"]').forEach(element => element.remove());
  document.querySelectorAll('.toast').forEach(element => element.remove());
  document.getElementById('incoming-call-banner')?.remove();
  document.querySelectorAll('.chitlan-dialog-overlay').forEach(element => element.remove());

  const videoGrid = document.getElementById('videoMeetingGrid');
  if (videoGrid) {
    videoGrid.replaceChildren();
    videoGrid.style.display = 'none';
  }
  const screenModal = document.getElementById('screenModalOverlay');
  if (screenModal) screenModal.style.display = 'none';

  const userNames = document.getElementById('userNames');
  if (userNames) renderUserList([]);
  const voiceUsers = document.getElementById('voice-users');
  if (voiceUsers) voiceUsers.textContent = 'No participants';
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const profileAvatar = document.getElementById('profileAvatar');
  const currentRole = document.getElementById('currentRole');
  const hostControls = document.getElementById('hostControls');
  if (profileName) profileName.textContent = 'Guest User';
  if (profileRole) profileRole.textContent = 'Host';
  if (profileAvatar) profileAvatar.textContent = 'G';
  if (currentRole) currentRole.textContent = 'Host';
  if (hostControls) hostControls.style.display = 'none';

  const peerId = document.getElementById('peer-id');
  const roomStatus = document.getElementById('roomStatus');
  const duration = document.getElementById('statDuration');
  const retryButton = document.getElementById('tryAgainBtn');
  if (peerId) peerId.value = '';
  if (roomStatus) roomStatus.textContent = 'Ready to collaborate';
  if (duration) duration.textContent = '00:00';
  if (retryButton) retryButton.style.display = 'none';

  document.getElementById('typing-indicator')?.replaceChildren();
  updateVoiceUI();
  ['messageCount', 'statMessages', 'statFiles', 'filesTransferred'].forEach(id => {
    const element = document.getElementById(id);
    if (element) element.textContent = '0';
  });
  const statUsers = document.getElementById('statUsers');
  if (statUsers) statUsers.textContent = '0';
  setConnectionStatus('Disconnected', 'disconnected');
}
