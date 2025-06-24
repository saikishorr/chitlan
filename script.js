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
        appendMessage('system', 'Initializing PeerJS...'); // Added for better UI feedback

        // Use a random ID for this session.
        // PeerJS signaling server hosted by peerjs.com
        // IMPORTANT: Ensure your network allows WebSocket connections to peerjs.com:443
        peer = new Peer({
            host: 'peerjs.com',
            port: 443,
            secure: true // Use WSS (secure WebSockets)
        });

        // Event: Peer ID is generated and ready
        peer.on('open', (id) => {
            myIdInput.value = id;
            console.log('PeerJS: My Peer ID is generated:', id);
            appendMessage('system', `Your Peer ID: ${id}. Share this with a friend to connect!`);
            // Make ID input selectable for easier copying
            myIdInput.select();
        });

        // Event: Incoming connection from another peer
        peer.on('connection', (newConn) => {
            console.log('PeerJS: Incoming connection from:', newConn.peer);
            if (conn && conn.open && conn.peer !== newConn.peer) { // Ensure it's a *different* peer if already connected
                // If already connected, close old connection to simplify example (for 1-to-1 chat)
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
            // More specific error messages for the user
            let errorMessage = `Error: ${err.message}.`;
            if (err.type === 'peer-unavailable') {
                errorMessage += ' The peer ID you tried to connect to does not exist or is offline.';
            } else if (err.type === 'network') {
                errorMessage += ' Check your internet connection or network firewall settings.';
            } else if (err.type === 'browser-incompatible') {
                errorMessage += ' Your browser might not support WebRTC or PeerJS.';
            }
            appendMessage('system', errorMessage + ' Please refresh and try again.');
            sendButton.disabled = true;
            conn = null; // Ensure connection is cleared on error
        });

        // Event: Peer connection to signaling server closed (e.g., lost network)
        peer.on('disconnected', () => {
            console.warn('PeerJS: Disconnected from signaling server. Attempting to reconnect...');
            appendMessage('system', 'Disconnected from signaling server. Attempting to reconnect...');
            // PeerJS will often try to reconnect automatically
            sendButton.disabled = true; // Disable sending until reconnected
        });

        // Event: Reconnected to signaling server
        peer.on('reconnect', () => {
            console.log('PeerJS: Reconnected to signaling server.');
            appendMessage('system', 'Reconnected to signaling server.');
            // Re-check if any data connection is still open, enable send if so
            if (conn && conn.open) {
                sendButton.disabled = false;
            }
        });
    }

    // --- Connection Handling ---
    function setupConnectionEvents(connection) {
        // Event: Connection is opened and ready to send/receive data
        connection.on('open', () => {
            console.log('DataConnection: Opened with peer', connection.peer);
            appendMessage('system', `Data connection with ${connection.peer} established.`);
            sendButton.disabled = false;
        });

        // Event: Data received from the connected peer
        connection.on('data', (data) => {
            // Ensure data is an object and has a message property, as sent
            if (typeof data === 'object' && data.message) {
                appendMessage('received', data.message);
            } else {
                console.warn('Received unexpected data format:', data);
            }
        });

        // Event: Connection is closed (e.g., remote peer closes browser, or explicit close)
        connection.on('close', () => {
            console.log('DataConnection: Closed with peer', connection.peer);
            appendMessage('system', `Connection with ${connection.peer} closed.`);
            conn = null; // Clear the connection reference
            sendButton.disabled = true; // Disable send button
        });

        // Event: Connection error
        connection.on('error', (err) => {
            console.error('DataConnection Error:', err);
            appendMessage('system', `Data connection error with ${connection.peer}: ${err.message}`);
            sendButton.disabled = true;
            conn = null; // Clear connection reference on error
        });
    }

    // --- UI Interactions ---

    // Copy Peer ID to clipboard
    copyMyIdButton.addEventListener('click', () => {
        myIdInput.select(); // Select the text in the input field
        myIdInput.setSelectionRange(0, 99999); // For mobile devices
        try {
            document.execCommand('copy');
            // Added visual feedback for copying
            copyMyIdButton.textContent = 'Copied!';
            setTimeout(() => {
                copyMyIdButton.textContent = 'Copy ID';
            }, 2000);
            console.log('Peer ID copied to clipboard:', myIdInput.value);
        } catch (err) {
            console.error('Failed to copy text:', err);
            alert('Failed to copy Peer ID. Please copy it manually: ' + myIdInput.value);
        }
    });

    // Connect to a remote peer
    connectButton.addEventListener('click', () => {
        const remotePeerId = peerIdInput.value.trim();
        if (!remotePeerId) {
            alert('Please enter a Peer ID to connect.');
            return;
        }

        if (peer && peer.open) {
            if (conn && conn.open) {
                if (conn.peer === remotePeerId) {
                    appendMessage('system', `Already connected to ${remotePeerId}.`);
                    return;
                }
                conn.close(); // Close existing connection before opening a new one
                appendMessage('system', `Closing existing connection to connect to ${remotePeerId}.`);
            }
            console.log('PeerJS: Attempting to connect to:', remotePeerId);
            conn = peer.connect(remotePeerId, {
                reliable: true // Ensures messages arrive in order and are retried if lost
            });
            setupConnectionEvents(conn);
            appendMessage('system', `Attempting to connect to ${remotePeerId}...`);
            sendButton.disabled = true; // Disable until connected
        } else if (!peer) {
            appendMessage('system', 'PeerJS object not initialized. Please refresh the page.');
            console.error('PeerJS object is null. Initialization might have failed.');
        } else if (!peer.open) {
            appendMessage('system', 'PeerJS is still connecting to the signaling server. Please wait.');
            console.warn('PeerJS not yet open. Current status:', peer.disconnected ? 'disconnected' : 'connecting');
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
        if (!messageText) { // Don't send empty messages
            return;
        }

        if (conn && conn.open) {
            conn.send({ message: messageText }); // Send data as an object
            appendMessage('sent', messageText);
            messageInput.value = ''; // Clear input field
        } else if (!conn) {
            appendMessage('system', 'Not connected to any peer. Please connect first.');
            console.warn('Attempted to send message but no connection exists.');
        } else if (!conn.open) {
            appendMessage('system', 'Connection is not open. Please wait for connection or reconnect.');
            console.warn('Attempted to send message but connection is not open.');
        }
    }

    // --- Display Messages ---
    function appendMessage(type, text) {
        const messageItem = document.createElement('div');
        messageItem.classList.add('message-item');

        const timestamp = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); // India specific time format
        let prefix = '';

        if (type === 'sent') {
            messageItem.classList.add('sent');
            prefix = 'You';
        } else if (type === 'received') {
            messageItem.classList.add('received');
            // Use conn.peer for sender ID, or 'Friend' if conn is null/closed
            prefix = `Friend (${conn && conn.peer ? conn.peer.substring(0, 8) + '...' : 'Unknown'})`; // Truncate peer ID for display
        } else if (type === 'system') {
            messageItem.classList.add('system');
            prefix = 'System';
        }

        messageItem.innerHTML = `<span class="message-prefix">${prefix}:</span> <span class="message-text">${text}</span><span class="timestamp">${timestamp}</span>`;
        messagesDiv.appendChild(messageItem);

        // Scroll to the bottom of the chat
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Initialize PeerJS when the page loads
    initializePeer();
});
