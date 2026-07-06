let peer;
let conn;
let connections = [];
let isHost = false;
let myNickname = '';
let myColor = '';
let localStream = null;
let activeCalls = {};
let isMuted = false;
let isInCall = false;
let typingTimeout = null;
let unreadCount = 0;
let pageFocused = true;

let screenStream = null;
let activeScreenCalls = {};
let currentScreenSharer = null;

const CHUNK_SIZE = 1024 * 1024; // 1MB
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100GB
const RECONNECT_INTERVAL = 3000;
const NOTIFICATION_SOUND_SRC = 'ding.mp3';

const incomingFiles = {};
const outgoingFiles = {};

window.addEventListener("focus", () => {
  pageFocused = true;
  unreadCount = 0;
  document.title = "ChitLAN";
});

window.addEventListener("blur", () => {
  pageFocused = false;
});

async function detectPublicIP() {
  const ipDisplay = document.getElementById("ip-display");
  if (!ipDisplay) return;

  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store"
    });

    if (!res.ok) throw new Error();

    const data = await res.json();
    ipDisplay.textContent = "Public IP: " + data.ip;
  } catch (e) {
    if (!navigator.onLine) {
      ipDisplay.textContent = "Offline (no internet)";
    } else {
      ipDisplay.textContent = "IP: Not available";
    }
  }
}

window.addEventListener("load", detectPublicIP);

function generateNumericIdWithPrefix() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
}

function generateFileId() {
  return 'file-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

function safeText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function init() {
  myNickname = document.getElementById('nickname').value.trim();
  myColor = document.getElementById('color').value;

  if (!myNickname) return alert('Please enter your nickname.');

  isHost = document.querySelector('input[name="role"]:checked').value === 'host';
  peer = new Peer(generateNumericIdWithPrefix());

  peer.on('disconnected', () => {
    appendSystemMessage("Connection lost. Reconnecting...");
    setTimeout(() => {
      try { peer.reconnect(); } catch (e) {}
    }, RECONNECT_INTERVAL);
  });

  peer.on('open', id => {
    document.getElementById('peer-id').value = id;
    appendSystemMessage(`Your Room ID is ${id}`);
  });

  peer.on("call", call => {
    const metadata = call.metadata || {};

    // Screen share call
    if (metadata.type === 'screen-share') {
      call.answer();

      call.on("stream", remoteStream => {
        showScreenStream(remoteStream, metadata.sharerName || "Unknown");
      });

      call.on("close", () => {
        clearScreenViewer();
      });

      return;
    }

    // Voice call
    if (!localStream) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        localStream = stream;
        call.answer(localStream);
      }).catch(() => {
        appendSystemMessage("Incoming voice call blocked (mic permission denied).");
        return;
      });
    } else {
      call.answer(localStream);
    }

    call.on("stream", remoteStream => {
      playAudio(call.peer, remoteStream);
    });

    call.on("close", () => {
      delete activeCalls[call.peer];
      removeAudio(call.peer);
      updateVoiceUsers();
    });

    activeCalls[call.peer] = call;
    updateVoiceUI();
    updateVoiceUsers();
  });

  if (isHost) {
    peer.on('connection', c => {
      if (connections.length >= 9) {
        c.send({ type: 'system', message: 'Room is full. Max 10 users allowed.' });
        c.close();
        return;
      }

      c.on('data', data => handlePeerData(c, data));

      c.on('close', () => {
        broadcast('System', `${c.nickname || 'A user'} left the chat`, '#666');
        connections = connections.filter(p => p.peer !== c.peer);
        delete activeCalls[c.peer];
        delete activeScreenCalls[c.peer];
        removeAudio(c.peer);
        updateUserList();
        updateVoiceUsers();
      });
    });
  }

  document.getElementById('chat-ui').style.display = 'block';

  const msgInput = document.getElementById('msg-input');
  if (msgInput) {
    msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    msgInput.addEventListener('input', sendTypingIndicator);
  }

  loadChatHistory();
}

function handlePeerData(c, data) {
  if (data.type === 'intro') {
    c.nickname = data.nickname;
    c.color = data.color;
    connections.push(c);
    updateUserList();
    updateVoiceUsers();
    broadcast('System', `${c.nickname} has joined the chat`, '#666');
  } else if (data.type === 'message') {
    broadcast(data.nickname, data.message, data.color, c, true, data.timestamp);
  } else if (data.type === 'file-chunk') {
    handleIncomingFileChunk(data);

    connections.forEach(p => {
      if (p.peer !== c.peer) {
        p.send(data);
      }
    });
  } else if (data.type === 'file-ack') {
    handleFileAck(data);
  } else if (data.type === 'typing') {
    showTypingIndicator(data.nickname);
    connections.forEach(p => {
      if (p.peer !== c.peer) p.send(data);
    });
  } else if (data.type === 'screen-status') {
    connections.forEach(p => {
      if (p.peer !== c.peer) p.send(data);
    });

    if (data.action === 'started') {
      appendSystemMessage(`${data.nickname} started screen sharing`);
    } else if (data.action === 'stopped') {
      appendSystemMessage(`${data.nickname} stopped screen sharing`);
      clearScreenViewer();
    }
  }
}

function connectToHost() {
  const hostId = document.getElementById('connect-id').value.trim();
  if (!hostId) return alert("Please enter host's Peer ID.");

  conn = peer.connect(hostId);

  conn.on('open', () => {
    conn.send({ type: 'intro', nickname: myNickname, color: myColor });

    renderUserList([myNickname]);
    appendSystemMessage("Connected to host.");
  });

  conn.on('data', data => {
    if (data.type === 'message') {
      appendMessage(data.nickname, data.message, data.color, false, data.timestamp);
    } else if (data.type === 'system') {
      appendSystemMessage(data.message);
    } else if (data.type === 'file-chunk') {
      handleIncomingFileChunk(data);
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
      }
    }
  });

  conn.on('close', () => {
    appendSystemMessage('Disconnected. Reconnecting...');
    setTimeout(connectToHost, RECONNECT_INTERVAL);
  });
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;

  const timestamp = Date.now();
  appendMessage(myNickname, msg, myColor, true, timestamp);

  const data = {
    type: 'message',
    nickname: myNickname,
    color: myColor,
    message: msg,
    timestamp
  };

  if (isHost) {
    broadcast(myNickname, msg, myColor, null, false, timestamp);
  } else if (conn) {
    conn.send(data);
  }

  input.value = '';
  hideTypingIndicator();
}

function broadcast(nickname, message, color = '#000', exclude = null, shouldAppendLocal = true, timestamp = Date.now()) {
  const payload = { type: 'message', nickname, color, message, timestamp };

  connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });

  if (shouldAppendLocal) {
    appendMessage(nickname, message, color, false, timestamp);
  }
}

function formatMessageTime(timestamp) {
  const parsed = Number(timestamp);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function playNotificationSound() {
  const sound = document.getElementById('notificationSound');
  if (!sound) return;

  if (sound.getAttribute('src') !== NOTIFICATION_SOUND_SRC) {
    sound.setAttribute('src', NOTIFICATION_SOUND_SRC);
    sound.load();
  }

  sound.currentTime = 0;
  sound.play().catch(() => {});
}

function appendMessage(sender, msg, color = '#000', isSender = false, timestamp = Date.now()) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ' + (isSender || sender === myNickname ? 'right' : 'left');

  const safeMsg = safeText(msg);
  const formattedTime = formatMessageTime(timestamp);

  div.innerHTML = `
    <strong style="color:${color}">${safeText(sender)}</strong>
    ${safeMsg}
    <div class="message-time">${formattedTime}</div>
  `;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  saveChatHistory();

  if (!isSender && sender !== 'System') {
    playNotificationSound();

    if (!pageFocused) {
      unreadCount++;
      document.title = `(${unreadCount}) ChitLAN`;
    }
  }
}

function appendSystemMessage(msg) {
  appendMessage('System', msg, '#666');
}

function renderUserList(users) {
  const list = document.getElementById('userNames');
  if (!list) return;

  list.innerHTML = '';

  users.forEach(name => {
    const li = document.createElement('li');

    const dot = document.createElement('span');
    dot.className = 'dot';

    const text = document.createTextNode(' ' + name);

    li.appendChild(dot);
    li.appendChild(text);
    list.appendChild(li);
  });

  document.getElementById('userCount').textContent = users.length;
}

function updateUserList() {
  const users = connections.map(c => c.nickname);
  users.unshift(myNickname + ' (Host)');
  renderUserList(users);
}

function copyPeerId() {
  const peerIdInput = document.getElementById("peer-id");
  if (!peerIdInput || !peerIdInput.value) return;

  navigator.clipboard.writeText(peerIdInput.value)
    .then(() => appendSystemMessage("Room ID copied to clipboard."))
    .catch(() => alert("Could not copy Room ID."));
}

function sendTypingIndicator() {
  if (isHost) return;

  if (conn) {
    conn.send({
      type: 'typing',
      nickname: myNickname
    });
  }
}

function showTypingIndicator(name) {
  const el = document.getElementById('typing-indicator');
  if (!el) return;

  el.textContent = `${name} is typing...`;

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    el.textContent = '';
  }, 1500);
}

function hideTypingIndicator() {
  const el = document.getElementById('typing-indicator');
  if (el) el.textContent = '';
}

function handleFileAck(data) {
  const file = outgoingFiles[data.fileId];
  if (!file) return;

  file.ackedSet.add(data.index);

  const elapsed = (Date.now() - file.startTime) / 1000;
  const bytesDone = Math.min(file.ackedSet.size * CHUNK_SIZE, file.size);
  const speed = formatSpeed(bytesDone / Math.max(elapsed, 1));

  updateFileProgress(
    data.fileId,
    (file.ackedSet.size / file.totalChunks) * 100,
    true,
    speed
  );

  if (file.ackedSet.size === file.totalChunks) {
    markFileComplete(data.fileId, true);
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return value.toFixed(1) + ' ' + sizes[i];
}

function appendFileTransferMessage(direction, fileId, name, size, initialProgress, isSender, senderName, senderColor) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message file-message ' + (isSender ? 'right' : 'left');
  div.dataset.fileId = fileId;

  const displayName = senderName || myNickname;
  const displayColor = senderColor || myColor;
  const fileSizeText = formatFileSize(size);

  div.innerHTML = `
    <strong style="color:${displayColor}">${safeText(displayName)} (File)</strong>
    <div class="file-meta">
      <span class="file-name">${safeText(name)}</span>
      <span class="file-size">(${fileSizeText})</span>
      <span class="file-status">${direction === 'outgoing' ? 'Preparing to send…' : 'Receiving…'}</span>
    </div>
    <div class="file-progress">
      <div class="file-progress-bar" style="width:${initialProgress || 0}%"></div>
    </div>
    <div class="file-preview"></div>
  `;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  saveChatHistory();
  return div;
}

function updateFileProgress(fileId, progress, isSender, speedText = '') {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  if (!msg) return;

  const bar = msg.querySelector('.file-progress-bar');
  const status = msg.querySelector('.file-status');

  if (bar) bar.style.width = `${progress}%`;
  if (status) {
    const base = isSender ? 'Sending' : 'Receiving';
    status.textContent = `${base}… ${progress.toFixed(0)}% ${speedText ? `(${speedText})` : ''}`;
  }
}

function markFileComplete(fileId, isSender) {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  if (!msg) return;

  const status = msg.querySelector('.file-status');
  const bar = msg.querySelector('.file-progress');

  if (status) status.textContent = isSender ? 'Sent ✔️' : 'Received ✔️';
  if (bar) bar.style.opacity = 0.4;

  if (!isSender) {
    playNotificationSound();
  }
}

function sendFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    alert('File too large. Max allowed is ' + formatFileSize(MAX_FILE_SIZE));
    return;
  }

  if (!isHost && !conn) {
    alert('You are not connected to a host.');
    return;
  }

  const fileId = generateFileId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  outgoingFiles[fileId] = {
    file,
    name: file.name,
    size: file.size,
    totalChunks,
    ackedSet: new Set(),
    startTime: Date.now()
  };

  appendFileTransferMessage(
    'outgoing',
    fileId,
    file.name,
    file.size,
    0,
    true,
    myNickname,
    myColor
  );

  let currentChunk = 0;

  function sendNextChunk() {
    if (currentChunk >= totalChunks) {
      fileInput.value = '';
      return;
    }

    const start = currentChunk * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const blob = file.slice(start, end);
    const reader = new FileReader();

    reader.onload = e => {
      const payload = {
        type: 'file-chunk',
        fileId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        totalChunks,
        index: currentChunk,
        buffer: e.target.result,
        senderNickname: myNickname,
        senderColor: myColor
      };

      if (isHost) {
        connections.forEach(c => c.send(payload));
      } else if (conn) {
        conn.send(payload);
      }

      currentChunk++;
      updateFileProgress(fileId, (currentChunk / totalChunks) * 100, true);

      setTimeout(sendNextChunk, 10);
    };

    reader.onerror = () => {
      alert('Error reading file.');
    };

    reader.readAsArrayBuffer(blob);
  }

  sendNextChunk();
}

function handleIncomingFileChunk(data) {
  const {
    fileId,
    name,
    mimeType,
    size,
    totalChunks,
    index,
    buffer,
    senderNickname,
    senderColor
  } = data;

  if (!incomingFiles[fileId]) {
    incomingFiles[fileId] = {
      chunks: new Array(totalChunks),
      receivedSet: new Set(),
      received: 0,
      name,
      mimeType,
      size,
      totalChunks,
      senderName: senderNickname,
      senderColor
    };

    appendFileTransferMessage(
      'incoming',
      fileId,
      name,
      size,
      0,
      false,
      senderNickname,
      senderColor
    );
  }

  const fileEntry = incomingFiles[fileId];

  if (fileEntry.receivedSet.has(index)) return;

  fileEntry.receivedSet.add(index);
  fileEntry.chunks[index] = buffer;
  fileEntry.received++;

  if (conn) {
    conn.send({ type: 'file-ack', fileId, index });
  }

  const progress = (fileEntry.received / fileEntry.totalChunks) * 100;
  updateFileProgress(fileId, progress, false);

  if (fileEntry.received === fileEntry.totalChunks) {
    const blob = new Blob(fileEntry.chunks, {
      type: fileEntry.mimeType || 'application/octet-stream'
    });

    const url = URL.createObjectURL(blob);
    const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);

    if (msg) {
      const preview = msg.querySelector('.file-preview');
      preview.innerHTML = '';

      if (fileEntry.mimeType && fileEntry.mimeType.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = fileEntry.name;
        img.className = 'image-preview';
        img.onclick = () => window.open(url, '_blank');
        preview.appendChild(img);
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileEntry.name;
        link.textContent = '📁 Download ' + fileEntry.name;
        preview.appendChild(link);
      }
    }

    markFileComplete(fileId, false);
  }
}

async function startScreenShare() {
  if (screenStream) {
    alert("You are already sharing your screen.");
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    currentScreenSharer = myNickname;
    showScreenStream(screenStream, `${myNickname} (You)`);

    const videoTrack = screenStream.getVideoTracks()[0];

    if (videoTrack) {
      videoTrack.onended = () => {
        stopScreenShare();
      };
    }

    if (isHost) {
      connections.forEach(c => {
        const screenCall = peer.call(c.peer, screenStream, {
          metadata: {
            type: 'screen-share',
            sharerName: myNickname
          }
        });

        activeScreenCalls[c.peer] = screenCall;
      });
    } else if (conn) {
      const screenCall = peer.call(conn.peer, screenStream, {
        metadata: {
          type: 'screen-share',
          sharerName: myNickname
        }
      });

      activeScreenCalls[conn.peer] = screenCall;
    }

    if (isHost) {
      connections.forEach(c => {
        c.send({ type: 'screen-status', action: 'started', nickname: myNickname });
      });
    } else if (conn) {
      conn.send({ type: 'screen-status', action: 'started', nickname: myNickname });
    }

    appendSystemMessage("You started screen sharing");
    document.getElementById("shareScreenBtn").style.display = "none";
    document.getElementById("stopScreenBtn").style.display = "inline-block";

  } catch (err) {
    alert("Screen sharing was cancelled or blocked.");
  }
}

function stopScreenShare() {
  if (!screenStream) return;

  screenStream.getTracks().forEach(track => track.stop());
  screenStream = null;

  Object.values(activeScreenCalls).forEach(call => {
    try { call.close(); } catch (e) {}
  });
  activeScreenCalls = {};

  if (isHost) {
    connections.forEach(c => {
      c.send({ type: 'screen-status', action: 'stopped', nickname: myNickname });
    });
  } else if (conn) {
    conn.send({ type: 'screen-status', action: 'stopped', nickname: myNickname });
  }

  clearScreenViewer();
  appendSystemMessage("You stopped screen sharing");

  document.getElementById("shareScreenBtn").style.display = "inline-block";
  document.getElementById("stopScreenBtn").style.display = "none";
}

function showScreenStream(stream, sharerName = "Unknown") {
  const viewer = document.getElementById("screenViewer");
  const status = document.getElementById("screenStatus");

  if (!viewer || !status) return;

  viewer.srcObject = stream;
  viewer.play().catch(() => {});
  status.textContent = `Viewing: ${sharerName}'s screen`;
}

function clearScreenViewer() {
  const viewer = document.getElementById("screenViewer");
  const status = document.getElementById("screenStatus");

  if (viewer) {
    viewer.srcObject = null;
  }

  if (status) {
    status.textContent = "No active screen share";
  }
}

function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('chitlan_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

(function restoreTheme() {
  const saved = localStorage.getItem('chitlan_theme');
  if (saved === 'dark') {
    document.body.classList.add('dark');
  }
})();

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond > 1024 ** 3) return (bytesPerSecond / 1024 ** 3).toFixed(2) + ' GB/s';
  if (bytesPerSecond > 1024 ** 2) return (bytesPerSecond / 1024 ** 2).toFixed(2) + ' MB/s';
  return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("Service Worker registered"))
      .catch(err => console.log("SW failed:", err));
  });
}

let deferredPrompt;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById("installBtn");
  if (btn) btn.style.display = "block";
});

const installBtn = document.getElementById("installBtn");
if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

navigator.serviceWorker?.addEventListener("controllerchange", () => {
  window.location.reload();
});

async function startVoice() {
  if (isInCall) return;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    isInCall = true;
    updateVoiceUI();
    updateVoiceUsers();

    if (isHost) {
      connections.forEach(c => callPeer(c.peer));
    } else if (conn) {
      callPeer(conn.peer);
    }
  } catch (err) {
    alert("Microphone access denied");
  }

  const totalUsers = isHost ? connections.length + 1 : 2;
  if (totalUsers > 6) {
    alert("Voice works best with max 6 users");
  }
}

function callPeer(peerId) {
  if (!localStream || activeCalls[peerId]) return;

  const call = peer.call(peerId, localStream, {
    metadata: {
      type: 'voice'
    }
  });

  call.on("stream", remoteStream => {
    playAudio(peerId, remoteStream);
  });

  call.on("close", () => {
    delete activeCalls[peerId];
    removeAudio(peerId);
    updateVoiceUsers();
  });

  activeCalls[peerId] = call;
}

function playAudio(peerId, stream) {
  let audio = document.getElementById("audio-" + peerId);

  if (!audio) {
    audio = document.createElement("audio");
    audio.id = "audio-" + peerId;
    audio.autoplay = true;
    document.body.appendChild(audio);
  }

  audio.srcObject = stream;
}

function removeAudio(peerId) {
  const audio = document.getElementById("audio-" + peerId);
  if (audio) audio.remove();
}

function toggleMute() {
  if (!localStream) return;

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });

  updateVoiceUI();
}

function leaveVoice() {
  Object.values(activeCalls).forEach(call => call.close());
  activeCalls = {};

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  isInCall = false;
  isMuted = false;

  document.querySelectorAll('audio[id^="audio-"]').forEach(a => a.remove());

  updateVoiceUI();
  updateVoiceUsers();
}

function updateVoiceUsers() {
  const container = document.getElementById("voice-users");
  if (!container) return;

  container.innerHTML = "";

  const users = isHost
    ? connections.map(c => c.nickname)
    : [myNickname];

  users.unshift(myNickname + " (You)");

  [...new Set(users)].forEach(name => {
    const div = document.createElement("div");
    div.className = "voice-user";
    div.textContent = name;
    container.appendChild(div);
  });
}

function updateVoiceUI() {
  const joinBtn = document.getElementById("joinBtn");
  const muteBtn = document.getElementById("muteBtn");
  const leaveBtn = document.getElementById("leaveBtn");

  if (!joinBtn || !muteBtn || !leaveBtn) return;

  if (!isInCall) {
    joinBtn.style.display = "block";
    muteBtn.style.display = "none";
    leaveBtn.style.display = "none";
  } else {
    joinBtn.style.display = "none";
    muteBtn.style.display = "block";
    leaveBtn.style.display = "block";
  }

  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
}

function saveChatHistory() {
  const messages = document.getElementById("messages");
  if (!messages) return;
  localStorage.setItem("chitlan_chat_history", messages.innerHTML);
}

function loadChatHistory() {
  const messages = document.getElementById("messages");
  if (!messages) return;

  const saved = localStorage.getItem("chitlan_chat_history");
  if (saved) {
    messages.innerHTML = saved;
    messages.scrollTop = messages.scrollHeight;
  }
}
