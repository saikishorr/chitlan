import state from './state.js';
import { CHUNK_SIZE, MAX_FILE_SIZE } from './constants.js';
import {
  formatFileSize,
  formatSpeed,
  showToast,
  scheduleTimeout,
  clearManagedTimeout
} from './utils.js';
import { playNotificationSound } from './ui.js';

const MAX_IN_FLIGHT_CHUNKS = 6;
const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_ACK_TIMEOUT_MS = 30000;
const MEMORY_RECEIVE_LIMIT = 64 * 1024 * 1024;
const IMAGE_PREVIEW_LIMIT = 20 * 1024 * 1024;
const INLINE_PREVIEW_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function createFileId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return 'file-' + Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function getChunkCount(size) {
  return Math.max(1, Math.ceil(size / CHUNK_SIZE));
}

function safeColor(value) {
  const color = String(value || '');
  return /^#[\da-f]{3}(?:[\da-f]{3}|[\da-f]{5})?$/i.test(color) ? color : '#60a5fa';
}

function findTransferMessage(fileId) {
  return Array.from(document.querySelectorAll('.file-message[data-file-id]'))
    .find(message => message.dataset.fileId === fileId) || null;
}

function setGlobalProgress(progress, speedText) {
  const fill = document.getElementById('progressFill');
  const percent = document.getElementById('progressPercent');
  const speed = document.getElementById('transferSpeed');
  const value = Math.max(0, Math.min(100, progress));
  if (fill) fill.style.width = value + '%';
  if (percent) percent.textContent = value.toFixed(0) + '%';
  if (speed && speedText) speed.textContent = speedText;
}

function notifyFileCount() {
  state.filesTransferred++;
  const statFiles = document.getElementById('statFiles');
  if (statFiles) statFiles.textContent = String(state.filesTransferred);
}

function clearTransferTimers(transfer) {
  if (!transfer) return;
  transfer.inflight?.forEach(chunk => clearManagedTimeout(chunk.timer));
}

function updateTransferCard(fileId, progress, isSender, speedText = '') {
  const message = findTransferMessage(fileId);
  const bar = message?.querySelector('.file-progress-bar');
  const status = message?.querySelector('.file-status');
  const current = Number(bar?.dataset.lastProgress || 0);
  const value = Math.max(current, Math.max(0, Math.min(100, progress)));

  if (bar) {
    bar.dataset.lastProgress = String(value);
    bar.style.width = value + '%';
  }
  if (status) {
    status.textContent = (isSender ? 'Sending' : 'Receiving') + '… ' + value.toFixed(0) + '%' + (speedText ? ' (' + speedText + ')' : '');
  }
  setGlobalProgress(value, speedText);
}

export function appendFileTransferMessage(direction, fileId, name, size, initialProgress, isSender, senderName, senderColor) {
  const messages = document.getElementById('messages');
  if (!messages) return null;

  const sender = String(senderName || state.myNickname || 'Peer').slice(0, 80);
  const color = safeColor(senderColor || state.myColor);
  const message = document.createElement('div');
  message.className = 'message file-message ' + (isSender ? 'right self' : 'left');
  message.dataset.fileId = fileId;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.style.backgroundColor = color;
  avatar.textContent = sender.charAt(0).toUpperCase();

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const heading = document.createElement('strong');
  heading.style.color = color;
  heading.textContent = sender + ' (File Transfer)';

  const meta = document.createElement('div');
  meta.className = 'file-meta';
  const fileName = document.createElement('span');
  fileName.className = 'file-name';
  fileName.textContent = String(name || 'Unnamed file').slice(0, 1024);
  const fileSize = document.createElement('span');
  fileSize.className = 'file-size';
  fileSize.textContent = '(' + formatFileSize(size) + ')';
  const status = document.createElement('span');
  status.className = 'file-status uploading';
  status.textContent = direction === 'outgoing' ? 'Preparing file…' : 'Receiving file…';
  meta.append(fileName, fileSize, status);

  const progress = document.createElement('div');
  progress.className = 'file-progress';
  Object.assign(progress.style, {
    height: '6px',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: '4px',
    marginTop: '8px',
    overflow: 'hidden'
  });
  const progressBar = document.createElement('div');
  progressBar.className = 'file-progress-bar';
  progressBar.dataset.lastProgress = String(initialProgress || 0);
  Object.assign(progressBar.style, {
    width: (initialProgress || 0) + '%',
    height: '100%',
    background: 'var(--primary)',
    transition: 'width 0.2s linear'
  });
  progress.appendChild(progressBar);

  const preview = document.createElement('div');
  preview.className = 'file-preview';
  bubble.append(heading, meta, progress, preview);
  message.append(avatar, bubble);
  messages.appendChild(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function setTransferStatus(fileId, text, kind) {
  const message = findTransferMessage(fileId);
  const status = message?.querySelector('.file-status');
  if (status) {
    status.className = 'file-status ' + kind;
    status.textContent = text;
  }
}

export function updateFileProgress(fileId, progress, isSender, speedText = '') {
  updateTransferCard(fileId, progress, isSender, speedText);
}

export function markFileComplete(fileId, isSender) {
  const transfer = isSender ? state.outgoingFiles[fileId] : state.incomingFiles[fileId];
  if (transfer?.completed) return;
  if (transfer) transfer.completed = true;

  const message = findTransferMessage(fileId);
  const progress = message?.querySelector('.file-progress');
  if (progress) progress.style.opacity = '0.4';
  updateTransferCard(fileId, 100, isSender, '');
  setTransferStatus(fileId, isSender ? 'File sent' : 'File received', 'success');
  notifyFileCount();

  if (isSender) showToast('File sent successfully!', 'success');
  else {
    playNotificationSound();
    showToast('File transfer completed!', 'success');
  }
}

function markFileFailed(fileId, isSender, reason) {
  const transfer = isSender ? state.outgoingFiles[fileId] : state.incomingFiles[fileId];
  if (transfer?.completed || transfer?.failed) return;
  if (transfer) transfer.failed = true;

  const detail = String(reason || 'Connection interrupted').slice(0, 180);
  setTransferStatus(fileId, 'Transfer failed: ' + detail, 'failed');
  showToast('File transfer failed: ' + detail, 'error');
}

function isOpenConnection(connection) {
  return !!connection && connection.open !== false && typeof connection.send === 'function';
}

function sendRawAck(connection, entry, index, failed = false, reason = '') {
  if (!isOpenConnection(connection)) return false;
  const ack = {
    type: 'file-ack',
    fileId: entry.fileId,
    index,
    fromPeerId: state.peer?.id || '',
    expectedPeerIds: entry.deliveryPeerIds || []
  };
  if (failed) {
    ack.failed = true;
    ack.reason = String(reason || 'The receiver could not save this file.').slice(0, 180);
  }
  try {
    connection.send(ack);
    return true;
  } catch (error) {
    return false;
  }
}

function validateChunk(data) {
  if (!data || typeof data !== 'object') return 'Invalid file data.';
  if (typeof data.fileId !== 'string' || !/^file-[a-f\d]{32}$/i.test(data.fileId)) return 'Invalid file transfer ID.';
  if (typeof data.name !== 'string' || data.name.length > 1024) return 'Invalid file name.';
  if (typeof data.mimeType !== 'string' || data.mimeType.length > 256) return 'Invalid file type.';
  if (!Number.isSafeInteger(data.size) || data.size < 0 || data.size > MAX_FILE_SIZE) return 'File size is not supported.';
  if (!Number.isSafeInteger(data.totalChunks) || data.totalChunks !== getChunkCount(data.size)) return 'Invalid file chunk count.';
  if (!Number.isSafeInteger(data.index) || data.index < 0 || data.index >= data.totalChunks) return 'Invalid file chunk index.';

  let byteLength = -1;
  if (data.buffer instanceof ArrayBuffer) byteLength = data.buffer.byteLength;
  else if (ArrayBuffer.isView(data.buffer)) byteLength = data.buffer.byteLength;
  const offset = data.index * CHUNK_SIZE;
  const expectedBytes = Math.min(CHUNK_SIZE, data.size - offset);
  if (byteLength !== expectedBytes) return 'A file chunk had the wrong size.';
  return '';
}

function normalizedPeerIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 256))).slice(0, 10);
}

async function prepareIncomingStorage(entry) {
  const storage = globalThis.navigator?.storage;
  if (storage && typeof storage.getDirectory === 'function') {
    try {
      const directory = await storage.getDirectory();
      if (entry.cleanupRequested) return;
      entry.fileName = 'chitlan-' + entry.fileId;
      entry.directory = directory;
      const handle = await directory.getFileHandle(entry.fileName, { create: true });
      if (entry.cleanupRequested) {
        try { await directory.removeEntry(entry.fileName); } catch (removeError) {}
        entry.directory = null;
        entry.fileName = null;
        return;
      }
      entry.fileHandle = handle;
      entry.writer = await handle.createWritable();
      if (entry.cleanupRequested) {
        const writer = entry.writer;
        entry.writer = null;
        try { await writer.abort(); } catch (abortError) {}
        try { await directory.removeEntry(entry.fileName); } catch (removeError) {}
        entry.directory = null;
        entry.fileHandle = null;
        entry.fileName = null;
      }
      return;
    } catch (error) {
      entry.writer = null;
      if (entry.directory) {
        try { await entry.directory.removeEntry(entry.fileName); } catch (removeError) {}
      }
      entry.directory = null;
      entry.fileHandle = null;
      entry.fileName = null;
    }
  }

  if (entry.cleanupRequested) return;
  if (entry.size > MEMORY_RECEIVE_LIMIT) {
    throw new Error('This browser cannot safely receive files larger than 64 MB. Try a browser with local file storage support.');
  }
  entry.chunks = [];
}

function createIncomingEntry(data, senderConnection) {
  const entry = {
    fileId: data.fileId,
    name: data.name,
    mimeType: data.mimeType || 'application/octet-stream',
    size: data.size,
    totalChunks: data.totalChunks,
    senderName: String(data.senderNickname || 'Peer').slice(0, 80),
    senderColor: safeColor(data.senderColor),
    senderPeerId: typeof data.senderPeerId === 'string' ? data.senderPeerId : (senderConnection?.peer || ''),
    deliveryPeerIds: normalizedPeerIds(data.deliveryPeerIds),
    ackConnection: senderConnection,
    startTime: Date.now(),
    receivedBytes: 0,
    nextIndex: 0,
    queuedIndex: 0,
    queue: Promise.resolve(),
    pending: new Map(),
    bufferedChunks: new Map(),
    writer: null,
    chunks: null,
    failed: false,
    completed: false,
    relayAckNextIndex: new Map(),
    relayAckAhead: new Map()
  };
  state.incomingFiles[entry.fileId] = entry;
  appendFileTransferMessage('incoming', entry.fileId, entry.name, entry.size, 0, false, entry.senderName, entry.senderColor);
  entry.ready = prepareIncomingStorage(entry);
  return entry;
}

function createObjectUrl(blob) {
  return URL.createObjectURL(blob);
}

async function finalizeIncomingFile(entry) {
  let fileBlob;
  if (entry.writer) {
    await entry.writer.close();
    entry.writer = null;
    fileBlob = await entry.fileHandle.getFile();
  } else {
    fileBlob = new Blob(entry.chunks || [], { type: entry.mimeType });
    entry.chunks = null;
  }

  if (entry.cleanupRequested || entry.failed) throw new Error('File transfer was canceled.');

  entry.fileUrl = createObjectUrl(fileBlob);
  const message = findTransferMessage(entry.fileId);
  const preview = message?.querySelector('.file-preview');
  if (preview) {
    preview.replaceChildren();
    if (INLINE_PREVIEW_TYPES.has(String(entry.mimeType).toLowerCase()) && entry.size <= IMAGE_PREVIEW_LIMIT) {
      const image = document.createElement('img');
      image.src = entry.fileUrl;
      image.alt = entry.name;
      image.className = 'image-preview';
      image.addEventListener('click', () => openFilePreview(entry.fileUrl, entry.name));
      preview.appendChild(image);
    }

    const link = document.createElement('a');
    link.href = entry.fileUrl;
    link.download = entry.name;
    link.className = 'primary-btn';
    Object.assign(link.style, {
      display: 'inline-block',
      marginTop: '8px',
      padding: '8px 16px'
    });
    link.textContent = 'Download ' + entry.name;
    preview.appendChild(link);
  }

  markFileComplete(entry.fileId, false);
}

function openFilePreview(fileUrl, name) {
  let lightbox = document.getElementById('filePreviewLightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'filePreviewLightbox';
    lightbox.className = 'file-preview-lightbox';
    lightbox.hidden = true;
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'file-preview-close';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => { lightbox.hidden = true; });
    const image = document.createElement('img');
    image.className = 'file-preview-lightbox-image';
    image.alt = '';
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) lightbox.hidden = true;
    });
    lightbox.append(closeButton, image);
    document.body.appendChild(lightbox);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') lightbox.hidden = true;
    });
  }
  const image = lightbox.querySelector('img');
  image.src = fileUrl;
  image.alt = name;
  lightbox.hidden = false;
}

function revokeEntryFileUrl(entry) {
  if (!entry?.fileUrl) return;
  URL.revokeObjectURL(entry.fileUrl);
  entry.fileUrl = null;
}

function discardIncomingStorage(entry) {
  entry.cleanupRequested = true;
  const directory = entry.directory;
  const fileName = entry.fileName || ('chitlan-' + entry.fileId);
  entry.directory = null;
  entry.fileHandle = null;
  entry.fileName = null;
  const cleanup = () => {
    if (!directory || !fileName) return;
    try { Promise.resolve(directory.removeEntry(fileName)).catch(() => {}); } catch (error) {}
  };
  const writer = entry.writer;
  entry.writer = null;
  if (!writer) {
    cleanup();
    return;
  }
  try {
    Promise.resolve(writer.abort()).catch(() => {}).then(cleanup);
  } catch (error) {
    cleanup();
  }
}

function failIncomingEntry(entry, index, reason) {
  if (!entry.failed) {
    markFileFailed(entry.fileId, false, reason);
    entry.failed = true;
    discardIncomingStorage(entry);
    entry.bufferedChunks?.forEach((chunk, chunkIndex) => {
      entry.pending.delete(chunkIndex);
      chunk.resolve(false);
    });
    entry.bufferedChunks?.clear();
  }
  sendRawAck(entry.ackConnection, entry, index, true, reason);
}

export function handleIncomingFileChunk(data, senderConnection = null) {
  const validationError = validateChunk(data);
  if (validationError) {
    if (data?.fileId && senderConnection && isOpenConnection(senderConnection)) {
      try {
        senderConnection.send({ type: 'file-ack', fileId: data.fileId, index: data.index, fromPeerId: state.peer?.id || '', failed: true, reason: validationError });
      } catch (error) {}
    }
    return Promise.resolve(false);
  }

  let entry = state.incomingFiles[data.fileId];
  if (!entry) entry = createIncomingEntry(data, senderConnection);
  else {
    entry.ackConnection = senderConnection || entry.ackConnection;
    if (entry.size !== data.size || entry.totalChunks !== data.totalChunks || entry.name !== data.name || entry.mimeType !== (data.mimeType || 'application/octet-stream')) {
      failIncomingEntry(entry, data.index, 'File details changed during transfer.');
      return Promise.resolve(false);
    }
    if (data.deliveryPeerIds) entry.deliveryPeerIds = normalizedPeerIds(data.deliveryPeerIds);
  }

  if (entry.failed) {
    sendRawAck(entry.ackConnection, entry, data.index, true, 'The receiver could not save this file.');
    return Promise.resolve(false);
  }

  const pending = entry.pending.get(data.index);
  if (pending) {
    return pending.then(accepted => {
      if (accepted) sendRawAck(entry.ackConnection, entry, data.index);
      return accepted;
    }).catch(() => false);
  }
  if (data.index < entry.queuedIndex) {
    sendRawAck(entry.ackConnection, entry, data.index);
    return Promise.resolve(true);
  }
  if (data.index - entry.queuedIndex >= MAX_IN_FLIGHT_CHUNKS * 2) {
    failIncomingEntry(entry, data.index, 'File chunks arrived too far out of order.');
    return Promise.resolve(false);
  }

  const bytes = data.buffer instanceof ArrayBuffer
    ? new Uint8Array(data.buffer)
    : new Uint8Array(data.buffer.buffer, data.buffer.byteOffset, data.buffer.byteLength);
  let resolveChunk;
  const chunkPromise = new Promise(resolve => { resolveChunk = resolve; });
  entry.pending.set(data.index, chunkPromise);
  entry.bufferedChunks.set(data.index, { data, bytes, resolve: resolveChunk });
  queueBufferedChunks(entry);
  return chunkPromise;
}

function queueBufferedChunks(entry) {
  while (entry.bufferedChunks.has(entry.queuedIndex) && !entry.failed) {
    const { data, bytes, resolve } = entry.bufferedChunks.get(entry.queuedIndex);
    entry.bufferedChunks.delete(entry.queuedIndex);
    entry.queuedIndex++;

    const writePromise = entry.queue.then(async () => {
      await entry.ready;
      if (entry.failed) throw new Error('The receiver could not save this file.');
      if (data.index < entry.nextIndex) {
        sendRawAck(entry.ackConnection, entry, data.index);
        return true;
      }
      if (data.index !== entry.nextIndex) throw new Error('File chunks arrived out of order.');

      if (entry.writer) await entry.writer.write(bytes);
      else entry.chunks.push(bytes);
      entry.nextIndex++;
      entry.receivedBytes += bytes.byteLength;

      const elapsed = Math.max((Date.now() - entry.startTime) / 1000, 0.5);
      const speed = formatSpeed(entry.receivedBytes / elapsed);
      const progress = entry.size === 0 ? 100 : (entry.receivedBytes / entry.size) * 100;
      updateTransferCard(entry.fileId, progress, false, speed);

      if (entry.nextIndex === entry.totalChunks) await finalizeIncomingFile(entry);
      sendRawAck(entry.ackConnection, entry, data.index);
      return true;
    });

    entry.queue = writePromise.catch(error => {
      failIncomingEntry(entry, data.index, error?.message || 'The receiver could not save this file.');
      return false;
    });
    writePromise.then(accepted => {
      entry.pending.delete(data.index);
      resolve(accepted);
    }, error => {
      entry.pending.delete(data.index);
      failIncomingEntry(entry, data.index, error?.message || 'The receiver could not save this file.');
      resolve(false);
    });
  }
}

function expectedPeersForTransfer() {
  if (!state.isHost) return null;
  return new Set(state.connections.filter(isOpenConnection).map(connection => connection.peer));
}

export function sendFile() {
  const input = document.getElementById('fileInput');
  if (!input?.files?.length) {
    showToast('Please select a file to send', 'info');
    return;
  }

  const file = input.files[0];
  if (file.size > MAX_FILE_SIZE) {
    showToast('File too large. Max allowed is ' + formatFileSize(MAX_FILE_SIZE), 'error');
    return;
  }

  const targets = state.isHost
    ? state.connections.filter(isOpenConnection)
    : (isOpenConnection(state.conn) ? [state.conn] : []);
  if (!targets.length) {
    showToast(state.isHost ? 'No one else is in the room to receive this file.' : 'You are not connected to a host', 'error');
    return;
  }

  const fileId = createFileId();
  const totalChunks = getChunkCount(file.size);
  const transfer = {
    file,
    fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    totalChunks,
    targetConnections: targets.slice(),
    expectedPeerIds: expectedPeersForTransfer(),
    nextChunk: 0,
    ackedBytes: 0,
    inflight: new Map(),
    startTime: Date.now(),
    failed: false,
    completed: false,
    pumping: false
  };
  state.outgoingFiles[fileId] = transfer;

  appendFileTransferMessage('outgoing', fileId, file.name, file.size, 0, true, state.myNickname, state.myColor);
  setGlobalProgress(0, '0 KB/s');
  input.value = '';
  const selected = document.getElementById('selectedFile');
  if (selected) selected.textContent = 'No file selected';
  pumpOutgoingTransfer(transfer);
}

function pumpOutgoingTransfer(transfer) {
  if (transfer.pumping || transfer.failed || transfer.completed) return;
  transfer.pumping = true;

  (async () => {
    try {
      while (
        state.outgoingFiles[transfer.fileId] === transfer &&
        !transfer.failed &&
        transfer.inflight.size < MAX_IN_FLIGHT_CHUNKS &&
        transfer.nextChunk < transfer.totalChunks
      ) {
        const index = transfer.nextChunk++;
        const start = index * CHUNK_SIZE;
        const end = Math.min(transfer.size, start + CHUNK_SIZE);
        const buffer = await transfer.file.slice(start, end).arrayBuffer();
        if (state.outgoingFiles[transfer.fileId] !== transfer || transfer.failed) return;

        const chunk = {
          index,
          buffer,
          byteLength: buffer.byteLength,
          ackedBy: new Set(),
          attempts: 0,
          timer: null
        };
        transfer.inflight.set(index, chunk);
        transmitChunk(transfer, chunk);
      }
    } catch (error) {
      failOutgoingTransfer(transfer, error?.message || 'Could not read the selected file.');
    } finally {
      transfer.pumping = false;
      if (!transfer.failed && !transfer.completed && transfer.inflight.size < MAX_IN_FLIGHT_CHUNKS && transfer.nextChunk < transfer.totalChunks) {
        pumpOutgoingTransfer(transfer);
      }
    }
  })();
}

function transmitChunk(transfer, chunk) {
  if (transfer.failed || transfer.completed || state.outgoingFiles[transfer.fileId] !== transfer) return;
  chunk.attempts++;
  const payload = {
    type: 'file-chunk',
    fileId: transfer.fileId,
    name: transfer.name,
    mimeType: transfer.mimeType,
    size: transfer.size,
    totalChunks: transfer.totalChunks,
    index: chunk.index,
    buffer: chunk.buffer,
    senderPeerId: state.peer?.id || '',
    senderNickname: state.myNickname,
    senderColor: state.myColor
  };
  if (transfer.expectedPeerIds) payload.deliveryPeerIds = Array.from(transfer.expectedPeerIds);

  try {
    for (const connection of transfer.targetConnections) {
      if (!isOpenConnection(connection)) throw new Error('A participant disconnected during the transfer.');
      connection.send(payload);
    }
  } catch (error) {
    failOutgoingTransfer(transfer, error?.message || 'Could not send a file chunk.');
    return;
  }

  clearManagedTimeout(chunk.timer);
  chunk.timer = scheduleTimeout(() => {
    if (transfer.failed || transfer.completed || !transfer.inflight.has(chunk.index)) return;
    if (chunk.attempts >= MAX_CHUNK_ATTEMPTS) {
      failOutgoingTransfer(transfer, 'A participant did not acknowledge the file data.');
      return;
    }
    transmitChunk(transfer, chunk);
  }, CHUNK_ACK_TIMEOUT_MS);
}

function failOutgoingTransfer(transfer, reason) {
  if (!transfer || transfer.failed || transfer.completed) return;
  clearTransferTimers(transfer);
  markFileFailed(transfer.fileId, true, reason);
  transfer.failed = true;
  transfer.file = null;
  state.outgoingFiles[transfer.fileId] = undefined;
  delete state.outgoingFiles[transfer.fileId];
}

function completeOutgoingTransfer(transfer) {
  if (!transfer || transfer.completed || transfer.failed) return;
  clearTransferTimers(transfer);
  markFileComplete(transfer.fileId, true);
  transfer.file = null;
  state.outgoingFiles[transfer.fileId] = undefined;
  delete state.outgoingFiles[transfer.fileId];
}

function recordForwardedAck(entry, peerId, index) {
  if (!entry.deliveryPeerIds.includes(peerId)) return;
  let nextIndex = entry.relayAckNextIndex.get(peerId) || 0;
  if (index < nextIndex) return;

  let ahead = entry.relayAckAhead.get(peerId);
  if (!ahead) {
    ahead = new Set();
    entry.relayAckAhead.set(peerId, ahead);
  }
  if (index - nextIndex > MAX_IN_FLIGHT_CHUNKS * 2) return;
  ahead.add(index);
  while (ahead.has(nextIndex)) {
    ahead.delete(nextIndex);
    nextIndex++;
  }
  entry.relayAckNextIndex.set(peerId, nextIndex);
}

export function handleFileAck(data, senderConnection = null) {
  if (!data || data.type !== 'file-ack' || typeof data.fileId !== 'string' || !Number.isSafeInteger(data.index)) return;
  const transfer = state.outgoingFiles[data.fileId];
  if (transfer) {
    const peerId = state.isHost ? senderConnection?.peer : data.fromPeerId;
    if (!peerId) return;
    if (data.failed) {
      failOutgoingTransfer(transfer, String(data.reason || 'A participant could not receive the file.'));
      return;
    }
    if (data.index < 0 || data.index >= transfer.totalChunks) return;
    if (!transfer.expectedPeerIds) {
      transfer.expectedPeerIds = new Set(normalizedPeerIds(data.expectedPeerIds));
    }
    const chunk = transfer.inflight.get(data.index);
    if (!chunk || !transfer.expectedPeerIds?.has(peerId)) return;
    chunk.ackedBy.add(peerId);

    if (chunk.ackedBy.size === transfer.expectedPeerIds.size) {
      clearManagedTimeout(chunk.timer);
      transfer.inflight.delete(chunk.index);
      transfer.ackedBytes += chunk.byteLength;
      const elapsed = Math.max((Date.now() - transfer.startTime) / 1000, 0.5);
      const speed = formatSpeed(transfer.ackedBytes / elapsed);
      const progress = transfer.size === 0 ? 100 : (transfer.ackedBytes / transfer.size) * 100;
      updateTransferCard(transfer.fileId, progress, true, speed);

      if (transfer.nextChunk === transfer.totalChunks && transfer.inflight.size === 0) completeOutgoingTransfer(transfer);
      else pumpOutgoingTransfer(transfer);
    }
    return;
  }

  if (!state.isHost || !senderConnection) return;
  const entry = state.incomingFiles[data.fileId];
  if (!entry || !entry.senderPeerId || entry.senderPeerId === state.peer?.id || data.index < 0 || data.index >= entry.totalChunks) return;
  const peerId = senderConnection.peer;
  if (!entry.deliveryPeerIds.includes(peerId)) return;

  if (data.failed) {
    const origin = state.connections.find(connection => connection.peer === entry.senderPeerId);
    if (isOpenConnection(origin)) {
      try {
        origin.send({
          type: 'file-ack',
          fileId: entry.fileId,
          index: data.index,
          fromPeerId: peerId,
          expectedPeerIds: entry.deliveryPeerIds,
          failed: true,
          reason: String(data.reason || 'A participant could not receive the file.').slice(0, 180)
        });
      } catch (error) {}
    }
    return;
  }

  recordForwardedAck(entry, peerId, data.index);
  const origin = state.connections.find(connection => connection.peer === entry.senderPeerId);
  if (!isOpenConnection(origin)) return;
  try {
    origin.send({
      type: 'file-ack',
      fileId: entry.fileId,
      index: data.index,
      fromPeerId: peerId,
      expectedPeerIds: entry.deliveryPeerIds
    });
  } catch (error) {}
}

export function handleFilePeerLeft(peerId) {
  if (!peerId) return;
  Object.values(state.outgoingFiles).forEach(transfer => {
    if (!transfer || transfer.completed || transfer.failed) return;
    if (transfer.expectedPeerIds?.has(peerId)) {
      failOutgoingTransfer(transfer, 'A participant disconnected before receiving the file.');
    }
  });

  if (!state.isHost) return;
  Object.values(state.incomingFiles).forEach(entry => {
    if (!entry || entry.failed) return;
    if (entry.senderPeerId === peerId) {
      if (!entry.completed) failIncomingEntry(entry, entry.nextIndex, 'The sender disconnected during the transfer.');
      return;
    }
    const peerAckProgress = entry.relayAckNextIndex.get(peerId) || 0;
    const transferStillNeedsPeer = entry.nextIndex < entry.totalChunks || peerAckProgress < entry.totalChunks;
    if (entry.deliveryPeerIds.includes(peerId) && transferStillNeedsPeer) {
      const origin = state.connections.find(connection => connection.peer === entry.senderPeerId);
      if (isOpenConnection(origin)) {
        try {
          origin.send({
            type: 'file-ack',
            fileId: entry.fileId,
            index: Math.min(entry.nextIndex, entry.totalChunks - 1),
            fromPeerId: peerId,
            expectedPeerIds: entry.deliveryPeerIds,
            failed: true,
            reason: 'A participant disconnected before receiving the file.'
          });
        } catch (error) {}
      }
    }
  });
}

export function cleanupFileTransfers() {
  Object.values(state.outgoingFiles || {}).forEach(clearTransferTimers);
  Object.values(state.incomingFiles || {}).forEach(entry => {
    if (!entry) return;
    if (!entry.completed) entry.failed = true;
    revokeEntryFileUrl(entry);
    discardIncomingStorage(entry);
  });
  const lightbox = document.getElementById('filePreviewLightbox');
  if (lightbox) lightbox.hidden = true;
  state.outgoingFiles = {};
  state.incomingFiles = {};
}

export function clearReceivedFiles() {
  Object.values(state.incomingFiles || {}).forEach(entry => {
    if (!entry) return;
    entry.failed = true;
    revokeEntryFileUrl(entry);
    discardIncomingStorage(entry);
  });
  const lightbox = document.getElementById('filePreviewLightbox');
  if (lightbox) lightbox.hidden = true;
  state.incomingFiles = {};
}

export async function cleanupStaleFileEntries() {
  const storage = globalThis.navigator?.storage;
  if (!storage || typeof storage.getDirectory !== 'function') return;
  try {
    const directory = await storage.getDirectory();
    for await (const [name] of directory.entries()) {
      if (name.startsWith('chitlan-file-')) {
        try { await directory.removeEntry(name); } catch (error) {}
      }
    }
  } catch (error) {}
}
