let peer;
let conn;
let connections = []; // host use
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
    appendMessage('System', `Your ID is ${id}`, '#666');
  });

  if (isHost) {
    peer.on('connection', c => {
      c.on('data', data => {
        if (data.type === 'intro') {
          c.nickname = data.nickname;
          c.color = data.color;
          connections.push(c);
          broadcast('System', `${c.nickname} has joined the chat`, '#666');
        } else if (data.type === 'message') {
          broadcast(data.nickname, data.message, data.color, c);
        }
      });

      c.on('close', () => {
        broadcast('System', `${c.nickname || 'A user'} left the chat`, '#666');
        connections = connections.filter(p => p.peer !== c.peer);
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

    conn.on('data', data => {
      if (data.type === 'message') {
        appendMessage(data.nickname, data.message, data.color);
      } else if (data.type === 'system') {
        appendMessage('System', data.message, '#666');
      }
    });

    conn.on('close', () => {
      appendMessage('System', 'Disconnected from chat', '#666');
    });
  });
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const msg = input.value.trim();
  if (!msg) return;

  appendMessage(myNickname, msg, myColor);

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

function appendMessage(sender, msg, color = '#000') {
  const div = document.createElement('div');
  div.innerHTML = `<strong style="color:${color}">${sender}</strong>: ${msg}`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}
document.getElementById("joinBtn").addEventListener("click", () => {
    document.getElementById("notificationSound").play().catch(() => {
        // This is expected; just unlocks the audio permission
    });
});
peer.on('data', data => {
    const msg = JSON.parse(data.toString());

    if (msg.nickname !== yourNickname) {
        const sound = document.getElementById("notificationSound");
        sound.currentTime = 0;
        sound.play().catch(err => console.log("Sound error:", err));
    }

    renderMessage(msg);
});


