let peer;

function startPeer() {
  const role = document.querySelector('input[name="role"]:checked').value;
  const isInitiator = role === 'initiator';

  peer = new SimplePeer({
    initiator: isInitiator,
    trickle: false
  });

  // Show your signal when created
  peer.on('signal', data => {
    document.getElementById('yourSignal').value = JSON.stringify(data);
  });

  // Show chat section
  document.getElementById('chat-section').style.display = 'block';

  // Listen for data
  peer.on('data', data => {
    const chat = document.getElementById('chat');
    chat.value += 'Friend: ' + data + '\n';
  });

  // Optional: handle connection event
  peer.on('connect', () => {
    console.log('Connected to peer!');
  });

  // Optional: error logging
  peer.on('error', err => {
    console.error('Peer error:', err);
  });
}

// Connect with remote signal
function connect() {
  const remote = JSON.parse(document.getElementById('remoteSignal').value);
  peer.signal(remote);
}

// Send chat message
function sendMessage() {
  const input = document.getElementById('message');
  const chat = document.getElementById('chat');
  const msg = input.value;

  if (msg && peer.connected) {
    peer.send(msg);
    chat.value += 'You: ' + msg + '\n';
    input.value = '';
  }
}
