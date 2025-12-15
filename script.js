// ================= CONFIG =================
const CHUNK_SIZE = 3 * 1024 * 1024; // 2MB
const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100GB
const RECONNECT_INTERVAL = 3000;
const RESEND_TIMEOUT = 4000;

// ================= STATE =================
let peer, conn;
let connections = [];
let isHost = false;
let myNickname = '', myColor = '';

const outgoingFiles = {};
const incomingFiles = {};

// ================= UTIL =================
const genId = () => Math.floor(1000 + Math.random() * 9000).toString();
const genFileId = () => `file-${Date.now()}-${Math.random()}`;

function formatSpeed(bps) {
  if (bps > 1024 ** 3) return (bps / 1024 ** 3).toFixed(2) + ' GB/s';
  if (bps > 1024 ** 2) return (bps / 1024 ** 2).toFixed(2) + ' MB/s';
  return (bps / 1024).toFixed(2) + ' KB/s';
}

// ================= INIT =================
function init() {
  myNickname = nickname.value.trim();
  myColor = color.value;
  if (!myNickname) return alert('Enter nickname');

  isHost = document.querySelector('[name=role]:checked').value === 'host';
  peer = new Peer(genId());

  peer.on('open', id => peerId.value = id);
  peer.on('disconnected', () => setTimeout(() => peer.reconnect(), RECONNECT_INTERVAL));

  if (isHost) setupHost();
  chatUI.style.display = 'block';
}

// ================= CONNECTION =================
function connectToHost() {
  const hostId = connectId.value.trim();
  if (!hostId) return;

  conn = peer.connect(hostId);

  conn.on('open', () => conn.send({ type: 'intro', nickname: myNickname, color: myColor }));
  conn.on('close', () => setTimeout(connectToHost, RECONNECT_INTERVAL));
  conn.on('data', handleData);
}

// ================= DATA ROUTER =================
function handleData(data) {
  if (data.type === 'file-chunk') receiveChunk(data);
  if (data.type === 'ack') handleAck(data);
  if (data.type === 'resend-request') resendChunks(data);
}

// ================= FILE SEND =================
function sendFile() {
  const file = fileInput.files[0];
  if (!file || file.size > MAX_FILE_SIZE) return alert('Invalid file');

  const fileId = genFileId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  outgoingFiles[fileId] = {
    file,
    totalChunks,
    sent: new Set(),
    acked: new Set(),
    startTime: Date.now()
  };

  sendChunk(fileId, 0);
}

function sendChunk(fileId, index) {
  const f = outgoingFiles[fileId];
  if (!f || index >= f.totalChunks) return;

  const start = index * CHUNK_SIZE;
  const slice = f.file.slice(start, start + CHUNK_SIZE);
  const reader = new FileReader();

  reader.onload = () => {
    const payload = {
      type: 'file-chunk',
      fileId,
      index,
      totalChunks: f.totalChunks,
      size: f.file.size,
      name: f.file.name,
      buffer: reader.result
    };

    (isHost ? connections : [conn]).forEach(c => c.send(payload));
    f.sent.add(index);

    setTimeout(() => {
      if (!f.acked.has(index)) sendChunk(fileId, index);
    }, RESEND_TIMEOUT);

    if (index + 1 < f.totalChunks) sendChunk(fileId, index + 1);
  };

  reader.readAsArrayBuffer(slice);
}

function handleAck({ fileId, index }) {
  const f = outgoingFiles[fileId];
  if (!f) return;

  f.acked.add(index);
  const sentBytes = f.acked.size * CHUNK_SIZE;
  const speed = formatSpeed(sentBytes / ((Date.now() - f.startTime) / 1000));

  updateFileProgress(fileId, (f.acked.size / f.totalChunks) * 100, true, speed);

  if (f.acked.size === f.totalChunks) markFileComplete(fileId, true);
}

// ================= FILE RECEIVE =================
async function receiveChunk(data) {
  let f = incomingFiles[data.fileId];

  if (!f) {
    const handle = await showSaveFilePicker({ suggestedName: data.name });
    f = incomingFiles[data.fileId] = {
      writable: await handle.createWritable(),
      received: new Set(),
      buffer: new Map(),
      expected: 0,
      total: data.totalChunks,
      startTime: Date.now(),
      size: data.size
    };
  }

  f.received.add(data.index);
  f.buffer.set(data.index, data.buffer);

  while (f.buffer.has(f.expected)) {
    await f.writable.write(f.buffer.get(f.expected));
    f.buffer.delete(f.expected);
    f.expected++;
  }

  conn.send({ type: 'ack', fileId: data.fileId, index: data.index });

  const speed = formatSpeed(
    (f.expected * CHUNK_SIZE) / ((Date.now() - f.startTime) / 1000)
  );

  updateFileProgress(data.fileId, (f.expected / f.total) * 100, false, speed);

  if (f.expected === f.total) {
    await f.writable.close();
    markFileComplete(data.fileId, false);
    delete incomingFiles[data.fileId];
  }
}

// ================= RESEND =================
function resendChunks({ fileId, missing }) {
  missing.forEach(i => sendChunk(fileId, i));
}
