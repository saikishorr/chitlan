import state from './state.js';
import { appendSystemMessage } from './ui.js';
import { showToast } from './utils.js';

export async function startVoice() {
  if (state.isInCall) return;

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    state.isInCall = true;
    state.isMuted = false;
    state.listenMuted = false;

    updateVoiceUI();
    updateVoiceUsers();
    appendSystemMessage('You joined the voice room');
    showToast('Voice chat started', 'success');

    Object.entries(state.activeCalls).forEach(([peerId, call]) => {
      if (!call.peerConnection?.getSenders().some(sender => sender.track)) {
        try { call.close(); } catch (e) {}
        delete state.activeCalls[peerId];
      }
    });
    syncMediaCalls();
    state.notifyCallState?.();
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
    const previousStream = state.localStream;
    state.videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    state.localStream = state.videoStream;
    state.isInVideoMeeting = true;
    state.isInCall = true;
    state.isCamOn = true;
    state.isMuted = false;
    state.listenMuted = false;

    updateVoiceUI();
    updateVoiceUsers();

    addVideoTile('local', state.videoStream, `${state.myNickname} (You)`);

    appendSystemMessage('You started video meeting');
    showToast('Camera video meeting started', 'success');

    await replaceExistingAudioTracks(previousStream, state.videoStream);
    if (previousStream && previousStream !== state.videoStream) {
      previousStream.getTracks().forEach(track => track.stop());
    }
    Object.entries(state.activeCalls).forEach(([peerId, call]) => {
      if (!call.peerConnection?.getSenders().some(sender => sender.track)) {
        try { call.close(); } catch (e) {}
        delete state.activeCalls[peerId];
      }
    });
    Object.entries(state.activeVideoCalls).forEach(([peerId, call]) => {
      if (!call.peerConnection?.getSenders().some(sender => sender.track)) {
        try { call.close(); } catch (e) {}
        delete state.activeVideoCalls[peerId];
      }
    });
    syncMediaCalls();
    state.notifyCallState?.();
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

// listenOnly: the other member isn't in the call; they can hear us without sending audio.
export function callPeer(peerId, { listenOnly = false } = {}) {
  if (!state.localStream || state.activeCalls[peerId]) return;
  const audioOnlyStream = new MediaStream(state.localStream.getAudioTracks());
  if (audioOnlyStream.getAudioTracks().length === 0) return;

  const call = state.peer.call(peerId, audioOnlyStream, {
    metadata: {
      type: 'voice',
      nickname: state.myNickname
    }
  });

  call.chitlanOutgoing = true;
  call.chitlanListenOnly = listenOnly;

  call.on('stream', remoteStream => {
    playAudio(peerId, remoteStream);
  });

  call.on('close', () => {
    if (state.activeCalls[peerId] === call) {
      delete state.activeCalls[peerId];
      removeAudio(peerId);
    }
    updateVoiceUsers();
  });

  state.activeCalls[peerId] = call;
}

export function callVideoPeer(peerId) {
  if (!state.videoStream || state.activeVideoCalls[peerId]) return;

  const videoTrack = state.videoStream.getVideoTracks()[0];
  if (!videoTrack) return;
  const videoOnlyStream = new MediaStream([videoTrack]);
  const call = state.peer.call(peerId, videoOnlyStream, {
    metadata: {
      type: 'video-meeting',
      nickname: state.myNickname
    }
  });
  call.chitlanOutgoing = true;

  call.on('stream', remoteStream => {
    state.remoteVideoStreams[peerId] = remoteStream;
    addVideoTile(peerId, remoteStream, rosterNickname(peerId));
  });

  call.on('close', () => {
    if (state.activeVideoCalls[peerId] === call) {
      delete state.activeVideoCalls[peerId];
      delete state.remoteVideoStreams[peerId];
      removeVideoTile(peerId);
    }
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
    video.playsInline = true;
    video.setAttribute('playsinline', '');
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

export function showJoinBanner(name, mode) {
  let banner = document.getElementById('incoming-call-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'incoming-call-banner';
    banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;background:#1e293b;color:white;padding:12px 16px;border:1px solid #475569;border-radius:10px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px #0006;';
    document.body.appendChild(banner);
  }
  banner.replaceChildren();
  const label = document.createElement('span');
  label.textContent = mode === 'camera' ? `${name} started a video meeting` : `${name} started a voice call`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = mode === 'camera' ? 'Join with camera' : 'Join with mic';
  button.addEventListener('click', () => {
    banner.remove();
    if (mode === 'camera') startVideoMeeting();
    else startVoice();
  }, { once: true });
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Not now';
  dismiss.addEventListener('click', () => banner.remove(), { once: true });
  banner.append(label, button, dismiss);
}

export function hideJoinBanner() {
  document.getElementById('incoming-call-banner')?.remove();
}

// Shows the join banner once for each member who newly starts or joins a call, and hides
// it when nobody is in a call any more. Runs on every roster change, on host and joiners.
function updateJoinBanner(membersById) {
  const inCallNow = new Set();
  membersById.forEach((member, peerId) => {
    if (member.inVoice || member.inVideo) inCallNow.add(peerId);
  });
  const newlyInCall = [...inCallNow].filter(peerId => !state.callMemberIdsSeen.has(peerId));
  state.callMemberIdsSeen = inCallNow;

  if (inCallNow.size === 0) {
    hideJoinBanner();
    return;
  }
  if (state.isInCall || state.isInVideoMeeting || newlyInCall.length === 0) return;
  const member = membersById.get(newlyInCall[0]);
  showJoinBanner(member.nickname || 'A participant', member.inVideo ? 'camera' : 'mic');
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

function rosterNickname(peerId) {
  return state.roster.find(member => member.peerId === peerId)?.nickname || 'Peer';
}

export function updateVideoTileNames() {
  state.roster.forEach(member => {
    const tile = document.getElementById(`tile-container-${member.peerId}`);
    const badge = tile?.querySelector('.video-tile-badge');
    if (badge) badge.textContent = member.nickname;
  });
}

export function syncMediaCalls() {
  const ownPeerId = state.peer?.id;
  if (!ownPeerId) return;
  const membersById = new Map(state.roster.filter(member => member.peerId !== ownPeerId).map(member => [member.peerId, member]));
  // What each member was doing at the previous roster update. A call is only closed for
  // "stopped their call" once the member was seen in that call, so a call that arrives
  // before the roster says its caller is in a call is not dropped.
  const previouslySeen = state.remoteMediaJoined;

  Object.entries(state.activeCalls).forEach(([peerId, call]) => {
    const member = membersById.get(peerId);
    const memberInCall = !!member && (member.inVoice || member.inVideo);
    const stoppedCall = !!previouslySeen[peerId]?.inCall && !memberInCall;
    // Calls someone else started may be listen-only (answered without a mic), so they stay
    // open while the caller is still in the call, even if this user hasn't joined.
    // A listen-only call is replaced once its target joins, because a call answered without
    // a mic can't start sending audio; the two-way call is set up below or by the other side.
    const shouldClose = call.chitlanOutgoing
      ? !member || (!state.isInCall && !state.isInVideoMeeting) || stoppedCall || (call.chitlanListenOnly && memberInCall)
      : !member || stoppedCall;
    if (shouldClose) {
      try { call.close(); } catch (e) {}
      if (state.activeCalls[peerId] === call) delete state.activeCalls[peerId];
      removeAudio(peerId);
    }
  });
  Object.entries(state.activeVideoCalls).forEach(([peerId, call]) => {
    const member = membersById.get(peerId);
    const stoppedVideo = !!previouslySeen[peerId]?.inVideo && !member?.inVideo;
    const shouldClose = call.chitlanOutgoing
      ? !member || !state.isInVideoMeeting || !member.inVideo
      : !member || stoppedVideo;
    if (shouldClose) {
      try { call.close(); } catch (e) {}
      if (state.activeVideoCalls[peerId] === call) delete state.activeVideoCalls[peerId];
      delete state.remoteVideoStreams[peerId];
      removeVideoTile(peerId);
    }
  });

  const seenNow = {};
  membersById.forEach((member, peerId) => {
    seenNow[peerId] = { inCall: !!(member.inVoice || member.inVideo), inVideo: !!member.inVideo };
  });
  state.remoteMediaJoined = seenNow;
  updateJoinBanner(membersById);

  membersById.forEach((member, peerId) => {
    const memberInCall = member.inVoice || member.inVideo;
    if (state.isInCall && !state.activeCalls[peerId]) {
      // Members not in the call get a listen-only call from everyone who is. Between two
      // members in the call, only the smaller peer ID calls, so there is one call per pair.
      if (!memberInCall) callPeer(peerId, { listenOnly: true });
      else if (ownPeerId < peerId) callPeer(peerId);
    }
    if (state.isInVideoMeeting && member.inVideo && ownPeerId < peerId && !state.activeVideoCalls[peerId]) callVideoPeer(peerId);
  });

  if (state.isInVideoMeeting && state.roster.length > 6 && !state.videoCrowdNoticeShown) {
    state.videoCrowdNoticeShown = true;
    showToast('Video works best with 6 or fewer people', 'info');
  }
  updateVideoTileNames();
}

async function replaceExistingAudioTracks(previousStream, nextStream) {
  if (!previousStream) return;
  const nextAudioTrack = nextStream.getAudioTracks()[0];
  if (!nextAudioTrack) return;
  const replacements = Object.entries(state.activeCalls).map(async ([peerId, call]) => {
    const connection = call.peerConnection;
    const sender = connection?.getSenders().find(item => item.track?.kind === 'audio')
      || connection?.getTransceivers().find(item => item.receiver?.track?.kind === 'audio')?.sender;
    let replaced = false;
    if (sender) {
      try {
        await sender.replaceTrack(nextAudioTrack);
        replaced = true;
      } catch (e) {
        console.error('Could not replace voice track:', e);
      }
    }
    if (!replaced) {
      try { call.close(); } catch (e) {}
      if (state.activeCalls[peerId] === call) delete state.activeCalls[peerId];
      removeAudio(peerId);
    }
  });
  await Promise.all(replacements);
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
  // Someone who chose to leave shouldn't keep hearing the room through listen-only calls.
  state.listenMuted = true;
  state.notifyCallState?.();

  document.querySelectorAll('audio[id^="audio-"]').forEach(a => a.remove());

  const grid = document.getElementById('videoMeetingGrid');
  if (grid) {
    grid.replaceChildren();
    grid.style.display = 'none';
  }
  state.remoteVideoStreams = {};

  updateVoiceUI();
  updateVoiceUsers();
  appendSystemMessage('You left the meeting');
  showToast('Left meeting', 'info');
}

export function updateVoiceUsers() {
  const container = document.getElementById('voice-users');
  if (!container) return;

  container.replaceChildren();
  const members = state.roster.filter(member => member.inVoice || member.inVideo);
  if (members.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No participants';
    container.appendChild(empty);
    return;
  }
  members.forEach(member => {
    const div = document.createElement('div');
    div.className = 'voice-user';
    div.textContent = `${member.nickname}${member.peerId === state.peer?.id ? ' (You)' : ''}`;
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
