let peer;
const chat = document.getElementById('chat');
const message = document.getElementById('message');
const yourSignal = document.getElementById('yourSignal');
const remoteSignal = document.getElementById('remoteSignal');

// Create a new peer connection
peer = new SimplePeer({ initiator: location.hash === '#1', trickle: false });

// Show our signal data
peer.on('signal', data => {
  yourSignal.value = JSON.stringify(data);
});

// Connect with remote signal data
function connect() {
  const remote = JSON.parse(remoteSignal.value);
  peer.signal(remote);
}

// On receiving a message
peer.on('data', data => {
  chat.value += 'Friend: ' + data + '\n';
});

// Send message
function sendMessage() {
  const msg = message.value;
  peer.send(msg);
  chat.value += 'You: ' + msg + '\n';
  message.value = '';
}
