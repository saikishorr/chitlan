// Updated script.js for 10-user limit, user list, message alignment, sound alert, and dark mode toggle

let peer;
let conn;
let connections = []; // for host
let isHost = false;
let myNickname = '';
let myColor = '';

function init() {
  myNickname = document.getElementById('nickname').value.trim();
  myColor = document.getElementById('color').value;
  if (!myNickname) return alert("Please enter your nickname.");

  isHost = document.querySelector('input[name="role"]:checked').value === 'host';
  peer = new Peer();

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
      }
    });

    conn.on('close', () => {
      appendSystemMessage('Disconnected from chat');
    });
  });
}

// function connectToHost() {
//   const hostId = document.getElementById('connect-id').value.trim();
//   if (!hostId) return alert("Please enter host's Peer ID.");

//   conn = peer.connect(hostId);

//   conn.on('open', () => {
//     conn.send({ type: 'intro', nickname: myNickname, color: myColor });

//     conn.on('data', data => {
//       if (data.type === 'message') {
//         appendMessage(data.nickname, data.message, data.color);
//       } else if (data.type === 'system') {
//         appendSystemMessage(data.message);
//       }
//     });

//     conn.on('close', () => {
//       appendSystemMessage('Disconnected from chat');
//     });
//   });
// }

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

function broadcast(nickname, message, color = '#000', exclude = null) {
  const payload = { type: 'message', nickname, color, message };
  connections.forEach(c => {
    if (exclude && c.peer === exclude.peer) return;
    c.send(payload);
  });
  appendMessage(nickname, message, color);
}

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

function appendSystemMessage(msg) {
  appendMessage('System', msg, '#666');
}

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

function toggleTheme() {
  document.body.classList.toggle('dark');
}
