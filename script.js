// Updated script.js for file-sharing, 10-user limit, user list, message alignment, sound alert, and dark mode toggle

let peer;
let conn;
let connections = []; // for host
let isHost = false;
let myNickname = '';
let myColor = '';

// Generates a random 4-digit numeric ID
function generateNumericIdWithPrefix() {
  const num = Math.floor(1000 + Math.random() * 9000); // Ensures 4 digits
  return `${num}`;
}

function init() {
  myNickname = document.getElementById('nickname').value.trim();
  myColor = document.getElementById('color').value;
  if (!myNickname) return alert("Please enter your nickname.");

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
          broadcast(data.nickname, data.message, data.color, c);
        } else if (data.type === 'file') {
          handleFileReceive(data);
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

    // 🟢 Show own name in the user list
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
      } else if (data.type === 'file') {
        handleFileReceive(data);
      }
    });

    conn.on('close', () => {
      appendSystemMessage('Disconnected from chat');
    });
  });
}

// Function to send a message
function sendMessage() {
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;

  appendMessage(myNickname, msg, myColor, true);

  const data = { type: 'message', nickname: myNickname, color: myColor, message: msg };

  if (isHost) {
    broadcast(myNickname, msg, myColor);
  } else {
    conn.send(data);
  }

  input.value = '';
}

// Function to broadcast message to all connected users
function broadcast(nickname, message, color = '#000', exclude = null) {
  const payload = { type: 'message', nickname, color, message };
  connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });
  appendMessage(nickname, message, color);
}

// Function to append message to the chat box
function appendMessage(sender, msg, color = '#000', isSender = false) {
  const div = document.createElement('div');
  div.className = 'message ' + (isSender || sender === myNickname ? 'right' : 'left');
  div.innerHTML = `<strong style="color:${color}">${sender}</strong>${msg}`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;

  // Play sound only for incoming messages
  if (!isSender && sender !== 'System') {
    const sound = document.getElementById("notificationSound");
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

// Function to append system message
function appendSystemMessage(msg) {
  appendMessage('System', msg, '#666');
}

// Function to update the user list
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

// Function to handle receiving files
function handleFileReceive(data) {
  const blob = new Blob([data.buffer]);
  const url = URL.createObjectURL(blob);
  appendMessage('System', `📁 File received: <a href="${url}" download="${data.name}">${data.name}</a>`);
}

// Function to send files
function sendFile() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const fileData = { type: 'file', name: file.name, buffer: reader.result };

    if (isHost) {
      broadcast(myNickname, 'Sent a file: ' + file.name);
      connections.forEach(c => c.send(fileData));
    } else {
      conn.send(fileData);
      appendMessage(myNickname, 'Sent a file: ' + file.name, myColor, true);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Dark mode toggle function
function toggleTheme() {
  document.body.classList.toggle('dark-theme');
}
