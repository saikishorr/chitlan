// Updated script.js for file-sharing with inline preview, progress bars,
// 10-user limit, user list, message alignment, sound alert, and dark mode toggle.

let peer;
let conn;
let connections = []; // for host
let isHost = false;
let myNickname = '';
let myColor = '';

// File transfer state
const CHUNK_SIZE = 64 * 1024; // 64KB per chunk
const MAX_FILE_SIZE = 10240 * 1024 * 1024; // 10GB limit (adjust if you want)

const incomingFiles = {}; // fileId -> {chunks, totalChunks, received, name, mimeType, size, senderName, senderColor}
const outgoingFiles = {}; // fileId -> {name, size, totalChunks, sentChunks}

// Generates a random 4-digit numeric ID
function generateNumericIdWithPrefix() {
  const num = Math.floor(1000 + Math.random() * 9000); // Ensures 4 digits
  return `${num}`;
}

// Generate unique file ID for each transfer
function generateFileId() {
  return 'file-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

function init() {
  myNickname = document.getElementById('nickname').value.trim();
  myColor = document.getElementById('color').value;
  if (!myNickname) return alert('Please enter your nickname.');

  isHost = document.querySelector('input[name="role"]:checked').value === 'host';
  peer = new Peer(generateNumericIdWithPrefix());

  peer.on('open', id => {
    document.getElementById('peer-id').value = id;
    appendSystemMessage(`Your ID is ${id}`);
  });

  if (isHost) {
    peer.on('connection', c => {
      if (connections.length >= 10) {
        c.send({ type: 'system', message: 'Room is full. Max 10 users allowed.' });
        c.close();
        return;
      }

      c.on('data', data => {
        if (data.type === 'intro') {
          c.nickname = data.nickname;
          c.color = data.color;
          connections.push(c);
          updateUserList();
          broadcast('System', `${c.nickname} has joined the chat`, '#666');
        } else if (data.type === 'message') {
          // normal text message from a joiner
          broadcast(data.nickname, data.message, data.color, c);
        } else if (data.type === 'file-chunk') {
          // file chunk from a joiner
          handleIncomingFileChunk(data);
          // forward to all other clients except the sender
          connections.forEach(p => {
            if (p.peer !== c.peer) {
              p.send(data);
            }
          });
        }
      });

      c.on('close', () => {
        broadcast('System', `${c.nickname || 'A user'} left the chat`, '#666');
        connections = connections.filter(p => p.peer !== c.peer);
        updateUserList();
      });
    });
  }

  document.getElementById('chat-ui').style.display = 'block';
}

function connectToHost() {
  const hostId = document.getElementById('connect-id').value.trim();
  if (!hostId) return alert("Please enter host's Peer ID.");

  conn = peer.connect(hostId);

  conn.on('open', () => {
    conn.send({ type: 'intro', nickname: myNickname, color: myColor });

    // Show own name in the user list
    const list = document.getElementById('userNames');
    list.innerHTML = '';
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span> ${myNickname}`;
    list.appendChild(li);
    document.getElementById('userCount').textContent = 1;

    conn.on('data', data => {
      if (data.type === 'message') {
        appendMessage(data.nickname, data.message, data.color);
      } else if (data.type === 'system') {
        appendSystemMessage(data.message);
      } else if (data.type === 'file-chunk') {
        handleIncomingFileChunk(data);
      }
    });

    conn.on('close', () => {
      appendSystemMessage('Disconnected from chat');
    });
  });
}

// ===== Chat message helpers =====

function sendMessage() {
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;

  appendMessage(myNickname, msg, myColor, true);

  const data = { type: 'message', nickname: myNickname, color: myColor, message: msg };

  if (isHost) {
    broadcast(myNickname, msg, myColor);
  } else if (conn) {
    conn.send(data);
  }

  input.value = '';
}

function broadcast(nickname, message, color = '#000', exclude = null) {
  const payload = { type: 'message', nickname, color, message };
  connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });
  appendMessage(nickname, message, color);
}

function appendMessage(sender, msg, color = '#000', isSender = false) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ' + (isSender || sender === myNickname ? 'right' : 'left');

  // Escape text to avoid HTML injection
  const safeMsg = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  div.innerHTML = `<strong style="color:${color}">${sender}</strong>${safeMsg}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Play sound only for incoming non-system messages
  if (!isSender && sender !== 'System') {
    const sound = document.getElementById('notificationSound');
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

function appendSystemMessage(msg) {
  appendMessage('System', msg, '#666');
}

// ===== User list =====

function updateUserList() {
  const list = document.getElementById('userNames');
  list.innerHTML = '';
  const users = connections.map(c => c.nickname);
  users.unshift(myNickname + ' (Host)');
  users.forEach(name => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot"></span> ${name}`;
    list.appendChild(li);
  });
  document.getElementById('userCount').textContent = users.length;
}

// ===== File sending & receiving with progress =====

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return value.toFixed(1) + ' ' + sizes[i];
}

/**
 * Create a message bubble for a file transfer (sending or receiving).
 * direction: "outgoing" | "incoming"
 */
function appendFileTransferMessage(direction, fileId, name, size, initialProgress, isSender, senderName, senderColor) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  const alignRight = isSender;

  div.className = 'message file-message ' + (alignRight ? 'right' : 'left');
  div.dataset.fileId = fileId;

  const displayName = senderName || myNickname;
  const displayColor = senderColor || myColor;

  const fileSizeText = formatFileSize(size);

  div.innerHTML = `
    <strong style="color:${displayColor}">${displayName} (File)</strong>
    <div class="file-meta">
      <span class="file-name">${name}</span>
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
  return div;
}

function updateFileProgress(fileId, progress, isSender) {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  if (!msg) return;
  const bar = msg.querySelector('.file-progress-bar');
  const status = msg.querySelector('.file-status');

  if (bar) {
    bar.style.width = `${progress}%`;
  }
  if (status) {
    const base = isSender ? 'Sending' : 'Receiving';
    status.textContent = `${base}… ${progress.toFixed(0)}%`;
  }
}

function markFileComplete(fileId, isSender) {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  if (!msg) return;
  const status = msg.querySelector('.file-status');
  const bar = msg.querySelector('.file-progress');

  if (status) {
    status.textContent = isSender ? 'Sent ✔️' : 'Received ✔️';
  }
  if (bar) {
    bar.style.opacity = 0.4;
  }

  // Play sound on completed incoming file
  if (!isSender) {
    const sound = document.getElementById('notificationSound');
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

/**
 * Send a file in chunks with progress.
 */
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
    name: file.name,
    size: file.size,
    totalChunks,
    sentChunks: 0
  };

  // Create outgoing file message bubble
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
  const reader = new FileReader();

  reader.onload = e => {
    const chunkBuffer = e.target.result;

    const payload = {
      type: 'file-chunk',
      fileId,
      name: file.name,
      mimeType: file.type,
      size: file.size,
      totalChunks,
      index: currentChunk,
      buffer: chunkBuffer,
      senderNickname: myNickname,
      senderColor: myColor
    };

    if (isHost) {
      // host sends directly to all connected peers
      connections.forEach(c => c.send(payload));
    } else if (conn) {
      conn.send(payload);
    }

    currentChunk++;
    outgoingFiles[fileId].sentChunks = currentChunk;

    const progress = (currentChunk / totalChunks) * 100;
    updateFileProgress(fileId, progress, true);

    if (currentChunk < totalChunks) {
      readNextChunk();
    } else {
      markFileComplete(fileId, true);
      fileInput.value = ''; // reset input
    }
  };

  reader.onerror = () => {
    alert('Error reading file.');
  };

  function readNextChunk() {
    const start = currentChunk * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const blob = file.slice(start, end);
    reader.readAsArrayBuffer(blob);
  }

  readNextChunk();
}

/**
 * Handle incoming file chunks (for both host and joiners).
 */
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
    // First chunk for this file
    incomingFiles[fileId] = {
      chunks: new Array(totalChunks),
      received: 0,
      name,
      mimeType,
      size,
      totalChunks,
      senderName: senderNickname,
      senderColor
    };

    // Create incoming message bubble
    appendFileTransferMessage(
      'incoming',
      fileId,
      name,
      size,
      0,
      senderNickname === myNickname, // isSender (should usually be false here)
      senderNickname,
      senderColor
    );
  }

  const fileEntry = incomingFiles[fileId];
  fileEntry.chunks[index] = buffer;
  fileEntry.received++;

  const progress = (fileEntry.received / fileEntry.totalChunks) * 100;
  updateFileProgress(fileId, progress, false);

  // If file completed, assemble and show preview/link
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
        // Inline image preview
        const img = document.createElement('img');
        img.src = url;
        img.alt = fileEntry.name;
        img.className = 'image-preview';
        img.onclick = () => window.open(url, '_blank');
        preview.appendChild(img);
      } else {
        // Download link for non-image file
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

// ===== Dark mode toggle =====

function toggleTheme() {
  // Match the CSS selector: body.dark { ... }
  document.body.classList.toggle('dark');
}

