import state from './state.js';
import { appendSystemMessage } from './ui.js';
import { safeText, showToast } from './utils.js';

export async function startVoice() {
  if (state.isInCall) return;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.isInCall = true;
    state.isMuted = false;

    updateVoiceUI();
    updateVoiceUsers();
    appendSystemMessage('You joined the voice room');
    showToast('Voice chat started', 'success');

    if (state.isHost) {
      state.connections.forEach(c => callPeer(c.peer));
    } else if (state.conn) {
      callPeer(state.conn.peer);
    }
  } catch (err) {
    console.error('Mic access error:', err);
    showToast('Microphone access denied or unreadable', 'error');
    appendSystemMessage('Could not access microphone');
  }
}

export async function startVideoMeeting() {
  if (state.isInVideoMeeting) {
    toggleCamera();
    return;
  }

  try {
    state.videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.localStream = state.videoStream;
    state.isInVideoMeeting = true;
    state.isInCall = true;
    state.isCamOn = true;
    state.isMuted = false;

    updateVoiceUI();
    updateVoiceUsers();

    addVideoTile('local', state.videoStream, `${state.myNickname} (You)`);

    appendSystemMessage('You started video meeting');
    showToast('Camera video meeting started', 'success');

    if (state.isHost) {
      state.connections.forEach(c => callVideoPeer(c.peer));
    } else if (state.conn) {
      callVideoPeer(state.conn.peer);
    }
  } catch (err) {
    console.error('Camera access error:', err);
    showToast('Camera access denied or unreadable', 'error');
    appendSystemMessage('Could not access camera for video meeting');
  }
}

export function toggleCamera() {
  if (!state.videoStream) {
    startVideoMeeting();
    return;
  }

  const videoTrack = state.videoStream.getVideoTracks()[0];
  if (videoTrack) {
    state.isCamOn = !state.isCamOn;
    videoTrack.enabled = state.isCamOn;
    updateVoiceUI();
    showToast(state.isCamOn ? 'Camera enabled' : 'Camera disabled', 'info');
  }
}

export function callPeer(peerId) {
  if (!state.localStream || state.activeCalls[peerId]) return;

  const call = state.peer.call(peerId, state.localStream, {
    metadata: {
      type: 'voice',
      nickname: state.myNickname
    }
  });

  call.on('stream', remoteStream => {
    playAudio(peerId, remoteStream);
  });

  call.on('close', () => {
    delete state.activeCalls[peerId];
    removeAudio(peerId);
    updateVoiceUsers();
  });

  state.activeCalls[peerId] = call;
}

export function callVideoPeer(peerId) {
  if (!state.videoStream || state.activeVideoCalls[peerId]) return;

  const call = state.peer.call(peerId, state.videoStream, {
    metadata: {
      type: 'video-meeting',
      nickname: state.myNickname
    }
  });

  call.on('stream', remoteStream => {
    addVideoTile(peerId, remoteStream, state.connections.find(c => c.peer === peerId)?.nickname || 'Peer');
  });

  call.on('close', () => {
    delete state.activeVideoCalls[peerId];
    removeVideoTile(peerId);
  });

  state.activeVideoCalls[peerId] = call;
}

export function addVideoTile(peerId, stream, nickname) {
  const grid = document.getElementById('videoMeetingGrid');
  if (!grid) return;

  grid.style.display = 'grid';

  let tile = document.getElementById(`tile-container-${peerId}`);
  if (!tile) {
    tile = document.createElement('div');
    tile.id = `tile-container-${peerId}`;
    tile.className = 'video-tile';

    const video = document.createElement('video');
    video.id = `video-tile-${peerId}`;
    video.autoplay = true;
    video.playsinline = true;
    if (peerId === 'local') video.muted = true;

    const badge = document.createElement('div');
    badge.className = 'video-tile-badge';
    badge.textContent = nickname;

    tile.appendChild(video);
    tile.appendChild(badge);
    grid.appendChild(tile);
  }

  const videoEl = document.getElementById(`video-tile-${peerId}`);
  if (videoEl) {
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
  }
}

export function removeVideoTile(peerId) {
  const tile = document.getElementById(`tile-container-${peerId}`);
  if (tile) tile.remove();

  const grid = document.getElementById('videoMeetingGrid');
  if (grid && grid.children.length === 0) {
    grid.style.display = 'none';
  }
}

export function playAudio(peerId, stream) {
  let audio = document.getElementById('audio-' + peerId);

  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'audio-' + peerId;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }

  audio.srcObject = stream;
}

export function removeAudio(peerId) {
  const audio = document.getElementById('audio-' + peerId);
  if (audio) audio.remove();
}

export function toggleMute() {
  if (!state.localStream) return;

  state.isMuted = !state.isMuted;
  state.localStream.getAudioTracks().forEach(track => {
    track.enabled = !state.isMuted;
  });

  updateVoiceUI();
  showToast(state.isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

export function leaveVoice() {
  Object.values(state.activeCalls).forEach(call => {
    try { call.close(); } catch (e) {}
  });
  state.activeCalls = {};

  Object.values(state.activeVideoCalls).forEach(call => {
    try { call.close(); } catch (e) {}
  });
  state.activeVideoCalls = {};

  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  if (state.videoStream) {
    state.videoStream.getTracks().forEach(track => track.stop());
    state.videoStream = null;
  }

  state.isInCall = false;
  state.isInVideoMeeting = false;
  state.isMuted = false;
  state.isCamOn = false;

  document.querySelectorAll('audio[id^="audio-"]').forEach(a => a.remove());

  const grid = document.getElementById('videoMeetingGrid');
  if (grid) {
    grid.innerHTML = '';
    grid.style.display = 'none';
  }

  updateVoiceUI();
  updateVoiceUsers();
  appendSystemMessage('You left the meeting');
  showToast('Left meeting', 'info');
}

export function updateVoiceUsers() {
  const container = document.getElementById('voice-users');
  if (!container) return;

  container.innerHTML = '';

  if (!state.isInCall && Object.keys(state.activeCalls).length === 0) {
    container.innerHTML = '<div class="empty-state">No participants</div>';
    return;
  }

  const users = state.isHost
    ? state.connections.map(c => c.nickname || 'Peer')
    : [state.myNickname];

  if (state.isInCall) {
    users.unshift(state.myNickname + ' (You)');
  }

  const uniqueUsers = [...new Set(users)];

  uniqueUsers.forEach(name => {
    const div = document.createElement('div');
    div.className = 'voice-user';
    div.textContent = name;
    container.appendChild(div);
  });
}

export function updateVoiceUI() {
  const statusLabel = document.getElementById('voiceStatus');
  const joinBtn = document.getElementById('joinBtn');
  const camBtn = document.getElementById('camBtn');
  const muteBtn = document.getElementById('muteBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  if (statusLabel) {
    statusLabel.textContent = state.isInVideoMeeting
      ? 'Video Meeting'
      : (state.isInCall
        ? (state.isMuted ? 'Muted' : 'Voice Connected')
        : 'Disconnected');
  }

  if (camBtn) {
    camBtn.textContent = state.isCamOn ? '📷 Cam Off' : '📷 Cam On';
  }

  if (!joinBtn || !muteBtn || !leaveBtn) return;

  if (!state.isInCall) {
    joinBtn.style.display = 'inline-block';
    muteBtn.style.display = 'none';
    leaveBtn.style.display = 'none';
  } else {
    joinBtn.style.display = 'none';
    muteBtn.style.display = 'inline-block';
    leaveBtn.style.display = 'inline-block';
  }

  muteBtn.textContent = state.isMuted ? 'Unmute' : 'Mute';
}
