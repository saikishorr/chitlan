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

// File sharing protocol. Joiners only talk to the host, so the host relays between them.
//   file-offer             sender -> receivers: name, size and type, before any file data
//   file-offer-recipients  host -> joiner sender: who the host passed the offer on to
//   file-offer-response    receiver -> sender: accepted or declined
//   file-offer-closed      sender -> receivers: who is getting the file; other offers expire
//   file-chunk / file-ack  the file data, acknowledged by every receiver
//   file-cancel            sender -> receivers: the sender cancelled or disconnected
//   file-leave             receiver -> sender: that receiver cancelled or disconnected
// PeerJS data channels are unordered here, so every step copes with messages arriving early.

const MAX_IN_FLIGHT_CHUNKS = 6;
const MAX_CHUNK_ATTEMPTS = 3;
const CHUNK_ACK_TIMEOUT_MS = 30000;
// After this long the sender stops waiting for answers and sends to whoever accepted.
const OFFER_TIMEOUT_MS = 2 * 60 * 1000;
const MEMORY_RECEIVE_LIMIT = 64 * 1024 * 1024;
const IMAGE_PREVIEW_LIMIT = 20 * 1024 * 1024;
const INLINE_PREVIEW_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const FILE_ID_PATTERN = /^file-[a-f\d]{32}$/i;
const CLOSED_FILE_ID_LIMIT = 200;

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

function isOpenConnection(connection) {
  return !!connection && connection.open !== false && typeof connection.send === 'function';
}

function trySend(connection, payload) {
  if (!isOpenConnection(connection)) return false;
  try {
    connection.send(payload);
    return true;
  } catch (error) {
    return false;
  }
}

function findConnection(peerId) {
  return state.connections.find(connection => connection.peer === peerId) || null;
}

// Remembers a file that was cancelled, so an offer for it that arrives late is ignored.
function closeFileId(fileId) {
  state.closedFileIds.add(fileId);
  if (state.closedFileIds.size > CLOSED_FILE_ID_LIMIT) {
    state.closedFileIds.delete(state.closedFileIds.values().next().value);
  }
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
  clearManagedTimeout(transfer.offerTimer);
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
    status.className = 'file-status uploading';
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

  const queueNote = document.createElement('div');
  queueNote.className = 'file-queue-note';

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

  const actions = document.createElement('div');
  actions.className = 'file-actions';

  const preview = document.createElement('div');
  preview.className = 'file-preview';
  bubble.append(heading, meta, queueNote, progress, actions, preview);
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

function setTransferActions(fileId, actions) {
  const container = findTransferMessage(fileId)?.querySelector('.file-actions');
  if (!container) return;
  container.replaceChildren(...actions.map(({ label, kind, onClick }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'file-action-btn' + (kind ? ' ' + kind : '');
    button.textContent = label;
    button.addEventListener('click', onClick, { once: true });
    return button;
  }));
}

function setQueueNote(fileId, text) {
  const note = findTransferMessage(fileId)?.querySelector('.file-queue-note');
  if (note) note.textContent = text;
}

export function updateFileProgress(fileId, progress, isSender, speedText = '') {
  updateTransferCard(fileId, progress, isSender, speedText);
}

export function markFileComplete(fileId, isSender, statusText = '') {
  const transfer = isSender ? state.outgoingFiles[fileId] : state.incomingFiles[fileId];
  if (transfer?.completed) return;
  if (transfer) transfer.completed = true;

  const message = findTransferMessage(fileId);
  const progress = message?.querySelector('.file-progress');
  if (progress) progress.style.opacity = '0.4';
  updateTransferCard(fileId, 100, isSender, '');
  setTransferStatus(fileId, statusText || (isSender ? 'File sent' : 'File received'), 'success');
  setTransferActions(fileId, []);
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
  setTransferActions(fileId, []);
  showToast('File transfer failed: ' + detail, 'error');
}

function sendRawAck(connection, entry, index, failed = false, reason = '') {
  const ack = {
    type: 'file-ack',
    fileId: entry.fileId,
    index,
    fromPeerId: state.peer?.id || ''
  };
  if (failed) {
    ack.failed = true;
    ack.reason = String(reason || 'The receiver could not save this file.').slice(0, 180);
  }
  return trySend(connection, ack);
}

function validateOffer(data) {
  if (!data || typeof data !== 'object') return 'Invalid file data.';
  if (typeof data.fileId !== 'string' || !FILE_ID_PATTERN.test(data.fileId)) return 'Invalid file transfer ID.';
  if (typeof data.name !== 'string' || data.name.length > 1024) return 'Invalid file name.';
  if (typeof data.mimeType !== 'string' || data.mimeType.length > 256) return 'Invalid file type.';
  if (!Number.isSafeInteger(data.size) || data.size < 0 || data.size > MAX_FILE_SIZE) return 'File size is not supported.';
  if (!Number.isSafeInteger(data.totalChunks) || data.totalChunks !== getChunkCount(data.size)) return 'Invalid file chunk count.';
  return '';
}

function validateChunk(data) {
  const offerError = validateOffer(data);
  if (offerError) return offerError;
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
    ackConnection: senderConnection,
    // offered -> accepted -> receiving, or declined / cancelled / expired
    phase: 'offered',
    ready: null,
    startTime: 0,
    receivedBytes: 0,
    nextIndex: 0,
    queuedIndex: 0,
    queue: Promise.resolve(),
    pending: new Map(),
    bufferedChunks: new Map(),
    writer: null,
    chunks: null,
    failed: false,
    completed: false
  };
  state.incomingFiles[entry.fileId] = entry;
  appendFileTransferMessage('incoming', entry.fileId, entry.name, entry.size, 0, false, entry.senderName, entry.senderColor);
  return entry;
}

function receiveFileOffer(data, senderConnection) {
  if (validateOffer(data) || state.incomingFiles[data.fileId] || state.closedFileIds.has(data.fileId)) return;
  const entry = createIncomingEntry(data, senderConnection);
  setTransferStatus(entry.fileId, entry.senderName + ' wants to send you this file', 'uploading');
  setTransferActions(entry.fileId, [
    { label: 'Accept', kind: 'primary', onClick: () => acceptIncomingFile(entry) },
    { label: 'Decline', onClick: () => declineIncomingFile(entry) }
  ]);
  playNotificationSound();
  showToast(entry.senderName + ' wants to send you a file', 'info');
}

function sendOfferResponse(entry, accepted) {
  trySend(entry.ackConnection, {
    type: 'file-offer-response',
    fileId: entry.fileId,
    accepted,
    fromPeerId: state.peer?.id || ''
  });
}

function acceptIncomingFile(entry) {
  if (entry.phase !== 'offered' || entry.failed) return;
  entry.phase = 'accepted';
  // Storage is only touched once the file is accepted. A failure here surfaces on the first chunk.
  entry.ready = prepareIncomingStorage(entry);
  entry.ready.catch(() => {});
  setTransferStatus(entry.fileId, 'Accepted. Waiting for the transfer to start…', 'uploading');
  setTransferActions(entry.fileId, [{ label: 'Cancel', kind: 'danger', onClick: () => cancelIncomingFile(entry) }]);
  sendOfferResponse(entry, true);
}

function declineIncomingFile(entry) {
  if (entry.phase !== 'offered' || entry.failed) return;
  entry.phase = 'declined';
  entry.failed = true;
  setTransferStatus(entry.fileId, 'Declined', 'failed');
  setTransferActions(entry.fileId, []);
  sendOfferResponse(entry, false);
}

function cancelIncomingFile(entry) {
  if (entry.phase === 'offered' || entry.completed || entry.failed) return;
  entry.phase = 'cancelled';
  stopIncomingEntry(entry);
  setTransferStatus(entry.fileId, 'Cancelled', 'failed');
  setTransferActions(entry.fileId, []);
  trySend(entry.ackConnection, { type: 'file-leave', fileId: entry.fileId, fromPeerId: state.peer?.id || '' });
}

function receiveFileCancel(data) {
  const entry = state.incomingFiles[data.fileId];
  if (!entry) {
    closeFileId(data.fileId);
    return;
  }
  if (entry.completed || entry.failed) return;
  entry.phase = 'cancelled';
  stopIncomingEntry(entry);
  setTransferActions(entry.fileId, []);
  if (data.senderLeft) setTransferStatus(entry.fileId, 'Transfer failed: ' + entry.senderName + ' disconnected', 'failed');
  else setTransferStatus(entry.fileId, 'Cancelled by ' + entry.senderName, 'failed');
}

function receiveOfferClosed(data) {
  const entry = state.incomingFiles[data.fileId];
  if (!entry || entry.completed || entry.failed) return;
  if (normalizedPeerIds(data.acceptedPeerIds).includes(state.peer?.id)) return;
  // The sender started without this device: it never answered, or answered too late.
  entry.phase = 'expired';
  stopIncomingEntry(entry);
  setTransferStatus(entry.fileId, 'Offer expired', 'failed');
  setTransferActions(entry.fileId, []);
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

// Stops receiving: nothing more is written and whatever was stored is deleted.
function stopIncomingEntry(entry) {
  entry.failed = true;
  discardIncomingStorage(entry);
  entry.bufferedChunks.forEach((chunk, chunkIndex) => {
    entry.pending.delete(chunkIndex);
    chunk.resolve(false);
  });
  entry.bufferedChunks.clear();
}

function failIncomingEntry(entry, index, reason) {
  if (!entry.failed) {
    markFileFailed(entry.fileId, false, reason);
    stopIncomingEntry(entry);
  }
  sendRawAck(entry.ackConnection, entry, index, true, reason);
}

function handleIncomingFileChunk(data, senderConnection = null) {
  const validationError = validateChunk(data);
  if (validationError) {
    if (typeof data?.fileId === 'string') sendRawAck(senderConnection, data, data.index, true, validationError);
    return Promise.resolve(false);
  }

  const entry = state.incomingFiles[data.fileId];
  if (!entry || entry.phase === 'offered') {
    sendRawAck(senderConnection, data, data.index, true, 'This file was not accepted.');
    return Promise.resolve(false);
  }
  entry.ackConnection = senderConnection || entry.ackConnection;
  if (entry.size !== data.size || entry.totalChunks !== data.totalChunks || entry.name !== data.name || entry.mimeType !== (data.mimeType || 'application/octet-stream')) {
    failIncomingEntry(entry, data.index, 'File details changed during transfer.');
    return Promise.resolve(false);
  }

  if (entry.failed) {
    sendRawAck(entry.ackConnection, entry, data.index, true, 'The receiver could not save this file.');
    return Promise.resolve(false);
  }
  if (entry.phase === 'accepted') {
    entry.phase = 'receiving';
    entry.startTime = Date.now();
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
      // Cancelled while the write was in progress.
      if (entry.failed) return false;
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

function fileTargets() {
  return state.isHost
    ? state.connections.filter(isOpenConnection)
    : (isOpenConnection(state.conn) ? [state.conn] : []);
}

function activeOutgoingTransfer() {
  return Object.values(state.outgoingFiles).find(transfer => transfer && !transfer.completed && !transfer.failed) || null;
}

function updateQueueNote(transfer) {
  const remaining = state.outgoingFileQueue.length;
  setQueueNote(transfer.fileId, remaining ? 'Queued (' + remaining + ' more)' : '');
}

export function sendFile() {
  const input = document.getElementById('fileInput');
  if (!input?.files?.length) {
    showToast('Please select a file to send', 'info');
    return;
  }

  const files = Array.from(input.files);
  const sendable = files.filter(file => file.size <= MAX_FILE_SIZE);
  if (sendable.length < files.length) {
    showToast('File too large. Max allowed is ' + formatFileSize(MAX_FILE_SIZE), 'error');
  }
  if (!sendable.length) return;

  if (!fileTargets().length) {
    showToast(state.isHost ? 'No one else is in the room to receive this file.' : 'You are not connected to a host', 'error');
    return;
  }

  input.value = '';
  const selected = document.getElementById('selectedFile');
  if (selected) selected.textContent = 'No file selected';

  // Files go out one at a time; the rest wait in the queue.
  state.outgoingFileQueue.push(...sendable);
  const active = activeOutgoingTransfer();
  if (active) updateQueueNote(active);
  else startNextQueuedFile();
}

function startNextQueuedFile() {
  while (state.outgoingFileQueue.length && !activeOutgoingTransfer()) {
    const targets = fileTargets();
    if (!targets.length) {
      state.outgoingFileQueue = [];
      showToast('Queued files were not sent because no one else is in the room.', 'error');
      return;
    }
    offerFile(state.outgoingFileQueue.shift(), targets);
  }
}

function offerFile(file, targets) {
  const fileId = createFileId();
  const transfer = {
    file,
    fileId,
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    totalChunks: getChunkCount(file.size),
    phase: 'offering',
    offerConnections: targets.slice(),
    targetConnections: targets.slice(),
    // The host knows who it offered the file to. A joiner hears it from the host.
    offeredPeerIds: state.isHost ? new Set(targets.map(connection => connection.peer)) : null,
    responses: new Map(),
    droppedPeerIds: new Set(),
    expectedPeerIds: new Set(),
    offerTimer: null,
    nextChunk: 0,
    ackedChunks: 0,
    ackedBytes: 0,
    inflight: new Map(),
    startTime: 0,
    failed: false,
    completed: false,
    pumping: false
  };
  state.outgoingFiles[fileId] = transfer;

  appendFileTransferMessage('outgoing', fileId, file.name, file.size, 0, true, state.myNickname, state.myColor);
  setTransferActions(fileId, [{ label: 'Cancel', kind: 'danger', onClick: () => cancelOutgoingTransfer(transfer) }]);
  updateQueueNote(transfer);
  updateOfferStatus(transfer);
  setGlobalProgress(0, '0 KB/s');

  sendToTransferTargets(transfer, {
    type: 'file-offer',
    fileId,
    name: transfer.name,
    mimeType: transfer.mimeType,
    size: transfer.size,
    totalChunks: transfer.totalChunks,
    senderPeerId: state.peer?.id || '',
    senderNickname: state.myNickname,
    senderColor: state.myColor
  });
  if (transfer.failed) return;
  transfer.offerTimer = scheduleTimeout(() => beginOutgoingTransfer(transfer), OFFER_TIMEOUT_MS);
}

function sendToTransferTargets(transfer, payload) {
  for (const connection of transfer.targetConnections.slice()) {
    if (trySend(connection, payload)) continue;
    if (state.isHost) dropReceiver(transfer, connection.peer, 'A participant disconnected before receiving the file.');
    else failOutgoingTransfer(transfer, 'You are not connected to the host.');
    if (transfer.failed || transfer.completed) return;
  }
}

function updateOfferStatus(transfer) {
  const offered = transfer.offeredPeerIds;
  if (!offered || offered.size <= 1) {
    setTransferStatus(transfer.fileId, 'Waiting for a response…', 'uploading');
    return;
  }
  let answered = 0;
  offered.forEach(peerId => {
    if (transfer.responses.has(peerId) || transfer.droppedPeerIds.has(peerId)) answered++;
  });
  setTransferStatus(transfer.fileId, 'Waiting for responses (' + answered + ' of ' + offered.size + ')…', 'uploading');
}

function setOfferRecipients(transfer, peerIds) {
  if (transfer.phase !== 'offering' || transfer.offeredPeerIds) return;
  transfer.offeredPeerIds = new Set(normalizedPeerIds(peerIds));
  maybeBeginOutgoingTransfer(transfer);
}

function handleOfferResponse(transfer, peerId, accepted) {
  if (transfer.phase !== 'offering' || !peerId || transfer.responses.has(peerId)) return;
  if (transfer.offeredPeerIds && !transfer.offeredPeerIds.has(peerId)) return;
  transfer.responses.set(peerId, accepted);
  maybeBeginOutgoingTransfer(transfer);
}

function maybeBeginOutgoingTransfer(transfer) {
  if (transfer.phase !== 'offering' || transfer.failed) return;
  updateOfferStatus(transfer);
  if (!transfer.offeredPeerIds) return;
  for (const peerId of transfer.offeredPeerIds) {
    if (!transfer.responses.has(peerId) && !transfer.droppedPeerIds.has(peerId)) return;
  }
  beginOutgoingTransfer(transfer);
}

function beginOutgoingTransfer(transfer) {
  if (transfer.phase !== 'offering' || transfer.failed) return;
  clearManagedTimeout(transfer.offerTimer);
  transfer.phase = 'sending';

  const accepted = Array.from(transfer.offeredPeerIds || [])
    .filter(peerId => transfer.responses.get(peerId) === true && !transfer.droppedPeerIds.has(peerId));
  transfer.expectedPeerIds = new Set(accepted);
  // Everyone offered the file hears who is getting it, so unanswered offers expire.
  const closed = { type: 'file-offer-closed', fileId: transfer.fileId, acceptedPeerIds: accepted };
  transfer.offerConnections.forEach(connection => trySend(connection, closed));

  if (!accepted.length) {
    transfer.failed = true;
    setTransferStatus(transfer.fileId, 'Not accepted', 'failed');
    showToast('No one accepted ' + transfer.name, 'info');
    endOutgoingTransfer(transfer);
    return;
  }

  if (state.isHost) {
    transfer.targetConnections = transfer.targetConnections.filter(connection => transfer.expectedPeerIds.has(connection.peer));
  }
  transfer.startTime = Date.now();
  updateTransferCard(transfer.fileId, 0, true, '');
  pumpOutgoingTransfer(transfer);
}

function pumpOutgoingTransfer(transfer) {
  if (transfer.pumping || transfer.failed || transfer.completed || transfer.phase !== 'sending') return;
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
  sendToTransferTargets(transfer, {
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
    senderColor: state.myColor,
    // Tells the host which members to relay this chunk to.
    deliveryPeerIds: Array.from(transfer.expectedPeerIds)
  });
  if (transfer.failed || transfer.completed || !transfer.inflight.has(chunk.index)) return;

  clearManagedTimeout(chunk.timer);
  chunk.timer = scheduleTimeout(() => {
    if (transfer.failed || transfer.completed || !transfer.inflight.has(chunk.index)) return;
    if (chunk.attempts >= MAX_CHUNK_ATTEMPTS) {
      // Stop waiting for whoever never confirmed this chunk; everyone else keeps receiving.
      Array.from(transfer.expectedPeerIds)
        .filter(peerId => !chunk.ackedBy.has(peerId))
        .forEach(peerId => dropReceiver(transfer, peerId, 'A participant did not acknowledge the file data.'));
      return;
    }
    transmitChunk(transfer, chunk);
  }, CHUNK_ACK_TIMEOUT_MS);
}

function settleChunk(transfer, chunk) {
  if (transfer.failed || transfer.completed || !transfer.inflight.has(chunk.index)) return;
  for (const peerId of transfer.expectedPeerIds) {
    if (!chunk.ackedBy.has(peerId)) return;
  }

  clearManagedTimeout(chunk.timer);
  transfer.inflight.delete(chunk.index);
  transfer.ackedChunks++;
  transfer.ackedBytes += chunk.byteLength;
  const elapsed = Math.max((Date.now() - transfer.startTime) / 1000, 0.5);
  const speed = formatSpeed(transfer.ackedBytes / elapsed);
  const progress = transfer.size === 0 ? 100 : (transfer.ackedBytes / transfer.size) * 100;
  updateTransferCard(transfer.fileId, progress, true, speed);

  if (transfer.ackedChunks === transfer.totalChunks) completeOutgoingTransfer(transfer);
  else pumpOutgoingTransfer(transfer);
}

// One receiver is out (cancelled, disconnected or failed). The others keep receiving.
function dropReceiver(transfer, peerId, reason) {
  if (!transfer || transfer.failed || transfer.completed || !peerId) return;
  if (transfer.phase === 'offering') {
    transfer.droppedPeerIds.add(peerId);
    maybeBeginOutgoingTransfer(transfer);
    return;
  }
  if (!transfer.expectedPeerIds.has(peerId)) return;
  transfer.expectedPeerIds.delete(peerId);
  transfer.droppedPeerIds.add(peerId);
  if (state.isHost) {
    transfer.targetConnections = transfer.targetConnections.filter(connection => connection.peer !== peerId);
  }
  if (!transfer.expectedPeerIds.size) {
    failOutgoingTransfer(transfer, reason || 'No one is receiving this file anymore.');
    return;
  }
  // Chunks that were only waiting on this receiver are now delivered.
  Array.from(transfer.inflight.values()).forEach(chunk => settleChunk(transfer, chunk));
}

function cancelOutgoingTransfer(transfer) {
  if (transfer.failed || transfer.completed) return;
  transfer.failed = true;
  const cancel = { type: 'file-cancel', fileId: transfer.fileId };
  transfer.offerConnections.forEach(connection => trySend(connection, cancel));
  setTransferStatus(transfer.fileId, 'Cancelled', 'failed');
  showToast('File transfer cancelled', 'info');
  endOutgoingTransfer(transfer);
}

function endOutgoingTransfer(transfer) {
  clearTransferTimers(transfer);
  transfer.file = null;
  setTransferActions(transfer.fileId, []);
  setQueueNote(transfer.fileId, '');
  delete state.outgoingFiles[transfer.fileId];
  startNextQueuedFile();
}

function failOutgoingTransfer(transfer, reason) {
  if (!transfer || transfer.failed || transfer.completed) return;
  markFileFailed(transfer.fileId, true, reason);
  transfer.failed = true;
  endOutgoingTransfer(transfer);
}

function completeOutgoingTransfer(transfer) {
  if (!transfer || transfer.completed || transfer.failed) return;
  const offered = transfer.offeredPeerIds?.size || 0;
  const delivered = transfer.expectedPeerIds.size;
  markFileComplete(transfer.fileId, true, delivered < offered ? 'Delivered to ' + delivered + ' of ' + offered : 'File sent');
  endOutgoingTransfer(transfer);
}

function handleFileAck(data, senderConnection = null) {
  if (!data || data.type !== 'file-ack' || typeof data.fileId !== 'string' || !Number.isSafeInteger(data.index)) return;
  const transfer = state.outgoingFiles[data.fileId];
  if (transfer) {
    const peerId = state.isHost ? senderConnection?.peer : data.fromPeerId;
    if (!peerId) return;
    if (data.failed) {
      dropReceiver(transfer, peerId, String(data.reason || 'A participant could not receive the file.').slice(0, 180));
      return;
    }
    if (transfer.phase !== 'sending' || data.index < 0 || data.index >= transfer.totalChunks) return;
    const chunk = transfer.inflight.get(data.index);
    if (!chunk || !transfer.expectedPeerIds.has(peerId)) return;
    chunk.ackedBy.add(peerId);
    settleChunk(transfer, chunk);
    return;
  }

  if (state.isHost && senderConnection) relayFileAck(data, senderConnection);
}

// Host side: a joiner offers a file. Pass the offer on to everyone else, the host included.
function relayFileOffer(data, originConnection) {
  if (validateOffer(data) || state.fileRelays[data.fileId] || state.incomingFiles[data.fileId] || state.closedFileIds.has(data.fileId)) return;
  const recipients = state.connections.filter(connection => connection !== originConnection && isOpenConnection(connection));
  const relay = {
    fileId: data.fileId,
    originPeerId: originConnection.peer,
    totalChunks: data.totalChunks,
    offeredPeerIds: recipients.map(connection => connection.peer),
    responses: new Map(),
    acceptedPeerIds: new Set(),
    ackNextIndex: new Map(),
    ackAhead: new Map()
  };
  state.fileRelays[data.fileId] = relay;

  // The host stamps the sender's real name and colour, as it does for chat.
  const offer = {
    type: 'file-offer',
    fileId: data.fileId,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    totalChunks: data.totalChunks,
    senderPeerId: originConnection.peer,
    senderNickname: originConnection.nickname || 'Peer',
    senderColor: originConnection.color || '#60a5fa'
  };
  trySend(originConnection, {
    type: 'file-offer-recipients',
    fileId: data.fileId,
    peerIds: [state.peer?.id, ...relay.offeredPeerIds].filter(Boolean)
  });
  recipients.forEach(connection => {
    if (!trySend(connection, offer)) relayReceiverLeft(relay, connection.peer);
  });
  receiveFileOffer(offer, originConnection);
}

function relayOfferResponse(data, connection) {
  const relay = state.fileRelays[data.fileId];
  if (!relay || !relay.offeredPeerIds.includes(connection.peer) || relay.responses.has(connection.peer)) return;
  const accepted = data.accepted === true;
  relay.responses.set(connection.peer, accepted);
  if (accepted) relay.acceptedPeerIds.add(connection.peer);
  trySend(findConnection(relay.originPeerId), {
    type: 'file-offer-response',
    fileId: relay.fileId,
    accepted,
    fromPeerId: connection.peer
  });
}

function relayOfferClosed(data, connection) {
  const relay = state.fileRelays[data.fileId];
  if (!relay || relay.originPeerId !== connection.peer) return;
  const accepted = normalizedPeerIds(data.acceptedPeerIds);
  relay.acceptedPeerIds.forEach(peerId => {
    if (!accepted.includes(peerId)) relay.acceptedPeerIds.delete(peerId);
  });
  const closed = { type: 'file-offer-closed', fileId: relay.fileId, acceptedPeerIds: accepted };
  relay.offeredPeerIds.forEach(peerId => trySend(findConnection(peerId), closed));
  receiveOfferClosed(closed);
}

function relayFileChunk(data, originConnection) {
  const relay = state.fileRelays[data.fileId];
  if (!relay || relay.originPeerId !== originConnection.peer || validateChunk(data)) return;
  const delivery = normalizedPeerIds(data.deliveryPeerIds);
  const forwarded = {
    type: 'file-chunk',
    fileId: data.fileId,
    name: data.name,
    mimeType: data.mimeType,
    size: data.size,
    totalChunks: data.totalChunks,
    index: data.index,
    buffer: data.buffer
  };
  const forward = () => {
    relay.acceptedPeerIds.forEach(peerId => {
      if (!delivery.includes(peerId)) return;
      if (!trySend(findConnection(peerId), forwarded)) relayReceiverLeft(relay, peerId);
    });
  };

  const hostEntry = state.incomingFiles[data.fileId];
  if (delivery.includes(state.peer?.id) && hostEntry && !hostEntry.failed) {
    // Store the host's own copy first, so chunks reach other members in order.
    handleIncomingFileChunk(data, originConnection).then(forward, forward);
  } else {
    forward();
  }
}

function recordForwardedAck(relay, peerId, index) {
  let nextIndex = relay.ackNextIndex.get(peerId) || 0;
  if (index < nextIndex) return;

  let ahead = relay.ackAhead.get(peerId);
  if (!ahead) {
    ahead = new Set();
    relay.ackAhead.set(peerId, ahead);
  }
  if (index - nextIndex > MAX_IN_FLIGHT_CHUNKS * 2) return;
  ahead.add(index);
  while (ahead.has(nextIndex)) {
    ahead.delete(nextIndex);
    nextIndex++;
  }
  relay.ackNextIndex.set(peerId, nextIndex);
}

function relayFileAck(data, connection) {
  const relay = state.fileRelays[data.fileId];
  const peerId = connection.peer;
  if (!relay || !relay.acceptedPeerIds.has(peerId) || data.index < 0 || data.index >= relay.totalChunks) return;

  const ack = { type: 'file-ack', fileId: relay.fileId, index: data.index, fromPeerId: peerId };
  if (data.failed) {
    relay.acceptedPeerIds.delete(peerId);
    ack.failed = true;
    ack.reason = String(data.reason || 'A participant could not receive the file.').slice(0, 180);
  } else {
    recordForwardedAck(relay, peerId, data.index);
  }
  trySend(findConnection(relay.originPeerId), ack);
}

// A member receiving a joiner's file cancelled or dropped out; tell the sender.
function relayReceiverLeft(relay, peerId) {
  relay.acceptedPeerIds.delete(peerId);
  if ((relay.ackNextIndex.get(peerId) || 0) >= relay.totalChunks) return;
  trySend(findConnection(relay.originPeerId), { type: 'file-leave', fileId: relay.fileId, fromPeerId: peerId });
}

function relayFileCancel(data, connection) {
  const relay = state.fileRelays[data.fileId];
  if (!relay) {
    closeFileId(data.fileId);
    return;
  }
  if (relay.originPeerId !== connection.peer) return;
  delete state.fileRelays[relay.fileId];
  closeFileId(relay.fileId);
  const cancel = { type: 'file-cancel', fileId: relay.fileId };
  relay.offeredPeerIds.forEach(peerId => trySend(findConnection(peerId), cancel));
  receiveFileCancel(cancel);
}

function handleHostFileMessage(data, connection) {
  const ownTransfer = state.outgoingFiles[data.fileId];
  if (data.type === 'file-offer') {
    relayFileOffer(data, connection);
  } else if (data.type === 'file-offer-response') {
    if (ownTransfer) handleOfferResponse(ownTransfer, connection.peer, data.accepted === true);
    else relayOfferResponse(data, connection);
  } else if (data.type === 'file-offer-closed') {
    relayOfferClosed(data, connection);
  } else if (data.type === 'file-chunk') {
    relayFileChunk(data, connection);
  } else if (data.type === 'file-ack') {
    handleFileAck(data, connection);
  } else if (data.type === 'file-cancel') {
    relayFileCancel(data, connection);
  } else if (data.type === 'file-leave') {
    const relay = state.fileRelays[data.fileId];
    if (ownTransfer) dropReceiver(ownTransfer, connection.peer, 'No one is receiving this file anymore.');
    else if (relay?.acceptedPeerIds.has(connection.peer)) relayReceiverLeft(relay, connection.peer);
  }
}

function handleJoinerFileMessage(data, connection) {
  const ownTransfer = state.outgoingFiles[data.fileId];
  if (data.type === 'file-offer') {
    receiveFileOffer(data, connection);
  } else if (data.type === 'file-offer-recipients') {
    if (ownTransfer) setOfferRecipients(ownTransfer, data.peerIds);
  } else if (data.type === 'file-offer-response') {
    if (ownTransfer) handleOfferResponse(ownTransfer, data.fromPeerId, data.accepted === true);
  } else if (data.type === 'file-offer-closed') {
    receiveOfferClosed(data);
  } else if (data.type === 'file-chunk') {
    handleIncomingFileChunk(data, connection);
  } else if (data.type === 'file-ack') {
    handleFileAck(data, connection);
  } else if (data.type === 'file-cancel') {
    receiveFileCancel(data);
  } else if (data.type === 'file-leave') {
    if (ownTransfer) dropReceiver(ownTransfer, data.fromPeerId, 'No one is receiving this file anymore.');
  }
}

// Entry point for every file-* message from a peer connection.
export function handleFileMessage(data, connection) {
  if (typeof data?.fileId !== 'string' || !FILE_ID_PATTERN.test(data.fileId)) return;
  if (state.isHost) handleHostFileMessage(data, connection);
  else handleJoinerFileMessage(data, connection);
}

export function handleFilePeerLeft(peerId) {
  if (!peerId) return;
  Object.values(state.outgoingFiles).forEach(transfer => {
    dropReceiver(transfer, peerId, 'A participant disconnected before receiving the file.');
  });

  if (!state.isHost) return;
  Object.values(state.fileRelays).forEach(relay => {
    if (relay.originPeerId === peerId) {
      delete state.fileRelays[relay.fileId];
      const cancel = { type: 'file-cancel', fileId: relay.fileId, senderLeft: true };
      relay.offeredPeerIds.forEach(id => trySend(findConnection(id), cancel));
      receiveFileCancel(cancel);
    } else if (relay.offeredPeerIds.includes(peerId)) {
      relayReceiverLeft(relay, peerId);
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
  state.fileRelays = {};
  state.outgoingFileQueue = [];
  state.closedFileIds.clear();
}

export function clearReceivedFiles() {
  Object.values(state.incomingFiles || {}).forEach(entry => {
    if (!entry) return;
    // Answer open offers and leave active transfers, so senders are not left waiting.
    if (entry.phase === 'offered') declineIncomingFile(entry);
    else cancelIncomingFile(entry);
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
