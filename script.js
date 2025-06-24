document.addEventListener('DOMContentLoaded', () => {
    const myIdInput = document.getElementById('my-id');
    const copyMyIdButton = document.getElementById('copy-my-id');
    const peerIdInput = document.getElementById('peer-id-input');
    const connectButton = document.getElementById('connect-button');
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    let peer = null; // Our PeerJS object
    let conn = null; // The active PeerJS DataConnection

    // --- PeerJS Initialization ---
    function initializePeer() {
        // Use a random ID for this session.
        // PeerJS signaling server hosted by peerjs.com
        peer = new Peer({
            host: 'peerjs.com',
            port: 443,
            secure: true // Use HTTPS for signaling
        });

        // Event: Peer ID is generated and ready
        peer.on('open', (id) => {
            myIdInput.value = id;
            console.log('My Peer ID:', id);
            appendMessage('system', `Your Peer ID: ${id}. Share this with a friend to connect!`);
        });

        // Event: Incoming connection from another peer
        peer.on('connection', (newConn) => {
            console.log('Incoming connection from:', newConn.peer);
            if (conn && conn.open) {
                // If already connected, close old connection or handle multiple connections
                conn.close();
                appendMessage('system', `Closing existing connection to connect to ${newConn.peer}.`);
            }
            conn = newConn;
            setupConnectionEvents(conn);
            appendMessage('system', `Connected to ${conn.peer}! You can now chat.`);
            sendButton.disabled = false;
        });

        // Event: Error handling
        peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
            appendMessage('system', `Error: ${err.message}. Please refresh.`);
            sendButton.disabled = true;
        });

        // Event: Peer connection closed (e.g., lost network)
        peer.on('disconnected', () => {
            console.warn('PeerJS disconnected. Attempting to reconnect...');
            appendMessage('system', 'Disconnected from signaling server. Attempting to reconnect...');
            // PeerJS will often try to reconnect automatically
        });
    }

    // --- Connection Handling ---
    function setupConnectionEvents(connection) {
        // Event: Connection is opened and ready to send/receive data
        connection.on('open', () => {
            console.log('DataConnection opened:', connection.peer);
            appendMessage('system', `Connection with ${connection.peer} established.`);
            sendButton.disabled = false;
        });

        // Event: Data received from the connected peer
        connection.on('data', (data) => {
            appendMessage('received', data.message);
        });

        // Event: Connection is closed (e.g., remote peer closes)
        connection.on('close', () => {
            console.log('DataConnection closed:', connection.peer);
            appendMessage('system', `Connection with ${connection.peer} closed.`);
            conn = null; // Clear the connection reference
            sendButton.disabled = true;
        });

        // Event: Connection error
        connection.on('error', (err) => {
            console.error('DataConnection Error:', err);
            appendMessage('system', `Connection error with ${connection.peer}: ${err.message}`);
            sendButton.disabled = true;
        });
    }

    // --- UI Interactions ---

    // Copy Peer ID to clipboard
    copyMyIdButton.addEventListener('click', () => {
        myIdInput.select();
        document.execCommand('copy');
        alert('Your Peer ID copied to clipboard!');
    });

    // Connect to a remote peer
    connectButton.addEventListener('click', () => {
        const remotePeerId = peerIdInput.value.trim();
        if (remotePeerId && peer && peer.open) {
            if (conn && conn.open) {
                conn.close(); // Close existing connection before opening a new one
                appendMessage('system', `Closing existing connection to connect to ${remotePeerId}.`);
            }
            console.log('Attempting to connect to:', remotePeerId);
            conn = peer.connect(remotePeerId); // Initiate a connection
            setupConnectionEvents(conn);
            appendMessage('system', `Attempting to connect to ${remotePeerId}...`);
            sendButton.disabled = true; // Disable until connected
        } else if (!peer || !peer.open) {
            appendMessage('system', 'PeerJS not ready. Please wait or refresh.');
        } else {
            alert('Please enter a Peer ID to connect.');
        }
    });

    // Send message when Send button is clicked
    sendButton.addEventListener('click', sendMessage);

    // Send message when Enter key is pressed in input field
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    function sendMessage() {
        const messageText = messageInput.value.trim();
        if (messageText && conn && conn.open) {
            conn.send({ message: messageText }); // Send data as an object
            appendMessage('sent', messageText);
            messageInput.value = ''; // Clear input field
        } else if (!conn || !conn.open) {
            appendMessage('system', 'Not connected to a peer. Please connect first.');
        }
    }

    // --- Display Messages ---
    function appendMessage(type, text) {
        const messageItem = document.createElement('div');
        messageItem.classList.add('message-item');

        const timestamp = new Date().toLocaleTimeString();
        let prefix = '';

        if (type === 'sent') {
            messageItem.classList.add('sent');
            prefix = 'You';
        } else if (type === 'received') {
            messageItem.classList.add('received');
            prefix = `Friend (${conn ? conn.peer : 'Unknown'})`;
        } else if (type === 'system') {
            messageItem.classList.add('system');
            prefix = 'System';
        }

        messageItem.innerHTML = `<span class="message-prefix">${prefix}</span> <span class="message-text">${text}</span><span class="timestamp">${timestamp}</span>`;
        messagesDiv.appendChild(messageItem);

        // Scroll to the bottom of the chat
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Initialize PeerJS when the page loads
    initializePeer();
});