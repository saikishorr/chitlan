import state from './state.js';
import { CHUNK_SIZE, MAX_FILE_SIZE } from './constants.js';
import {
  generateFileId,
  safeText,
  formatFileSize,
  formatSpeed,
  showToast
} from './utils.js';
import {
  playNotificationSound
} from './ui.js';

export function sendFile() {
  const fileInput = document.getElementById('fileInput');
  if (!fileInput || !fileInput.files.length) {
    showToast('Please select a file to send', 'info');
    return;
  }

  const file = fileInput.files[0];

  if (file.size > MAX_FILE_SIZE) {
    showToast(`File too large. Max allowed is ${formatFileSize(MAX_FILE_SIZE)}`, 'error');
    return;
  }

  if (!state.isHost && !state.conn) {
    showToast('You are not connected to a host', 'error');
    return;
  }

  const fileId = generateFileId();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  state.outgoingFiles[fileId] = {
    file,
    name: file.name,
    size: file.size,
    totalChunks,
    ackedSet: new Set(),
    startTime: Date.now()
  };

  appendFileTransferMessage(
    'outgoing',
    fileId,
    file.name,
    file.size,
    0,
    true,
    state.myNickname,
    state.myColor
  );

  let currentChunk = 0;

  function sendNextChunk() {
    if (currentChunk >= totalChunks) {
      fileInput.value = '';
      const selectedFileLabel = document.getElementById('selectedFile');
      if (selectedFileLabel) selectedFileLabel.textContent = 'No file selected';
      return;
    }

    const start = currentChunk * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const blob = file.slice(start, end);
    const reader = new FileReader();

    reader.onload = e => {
      const payload = {
        type: 'file-chunk',
        fileId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        totalChunks,
        index: currentChunk,
        buffer: e.target.result,
        senderNickname: state.myNickname,
        senderColor: state.myColor
      };

      if (state.isHost) {
        state.connections.forEach(c => c.send(payload));
      } else if (state.conn) {
        state.conn.send(payload);
      }

      currentChunk++;
      const elapsed = (Date.now() - state.outgoingFiles[fileId].startTime) / 1000;
      const bytesSent = Math.min(currentChunk * CHUNK_SIZE, file.size);
      const speed = formatSpeed(bytesSent / Math.max(elapsed, 0.5));
      const sendProgress = (currentChunk / totalChunks) * 100;

      updateFileProgress(fileId, sendProgress, true, speed);

      // If finished sending all chunks and no ACKs needed or all ACKed
      if (currentChunk >= totalChunks) {
        setTimeout(() => {
          markFileComplete(fileId, true);
        }, 300);
      } else {
        setTimeout(sendNextChunk, 5);
      }
    };

    reader.onerror = () => {
      showToast('Error reading file for transfer', 'error');
    };

    reader.readAsArrayBuffer(blob);
  }

  sendNextChunk();
}

export function handleFileAck(data) {
  const file = state.outgoingFiles[data.fileId];
  if (!file) return;

  file.ackedSet.add(data.index);

  const elapsed = (Date.now() - file.startTime) / 1000;
  const bytesDone = Math.min(file.ackedSet.size * CHUNK_SIZE, file.size);
  const speed = formatSpeed(bytesDone / Math.max(elapsed, 0.5));

  const ackProgress = (file.ackedSet.size / file.totalChunks) * 100;
  updateFileProgress(data.fileId, ackProgress, true, speed);

  if (file.ackedSet.size >= file.totalChunks) {
    markFileComplete(data.fileId, true);
  }
}

export function handleIncomingFileChunk(data, senderConnection = null) {
  const {
    fileId,
    name,
    mimeType,
    size,
    totalChunks,
    index,
    buffer,
    senderNickname,
    senderColor
  } = data;

  if (!state.incomingFiles[fileId]) {
    state.incomingFiles[fileId] = {
      chunks: new Array(totalChunks),
      receivedSet: new Set(),
      received: 0,
      name,
      mimeType,
      size,
      totalChunks,
      senderName: senderNickname,
      senderColor,
      startTime: Date.now()
    };

    appendFileTransferMessage(
      'incoming',
      fileId,
      name,
      size,
      0,
      false,
      senderNickname,
      senderColor
    );
  }

  const fileEntry = state.incomingFiles[fileId];

  if (fileEntry.receivedSet.has(index)) return;

  fileEntry.receivedSet.add(index);
  fileEntry.chunks[index] = buffer;
  fileEntry.received++;

  // Send ACK back to the exact sender connection (whether host or client)
  const ackPayload = { type: 'file-ack', fileId, index };
  if (senderConnection) {
    try { senderConnection.send(ackPayload); } catch (e) {}
  } else if (state.conn) {
    try { state.conn.send(ackPayload); } catch (e) {}
  }

  const elapsed = (Date.now() - fileEntry.startTime) / 1000;
  const bytesDone = Math.min(fileEntry.received * CHUNK_SIZE, fileEntry.size);
  const speed = formatSpeed(bytesDone / Math.max(elapsed, 0.5));

  const progress = (fileEntry.received / fileEntry.totalChunks) * 100;
  updateFileProgress(fileId, progress, false, speed);

  if (fileEntry.received === fileEntry.totalChunks) {
    const blob = new Blob(fileEntry.chunks, {
      type: fileEntry.mimeType || 'application/octet-stream'
    });

    const url = URL.createObjectURL(blob);
    const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);

    if (msg) {
      const preview = msg.querySelector('.file-preview');
      if (preview) {
        preview.innerHTML = '';

        if (fileEntry.mimeType && fileEntry.mimeType.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = fileEntry.name;
          img.className = 'image-preview';
          img.onclick = () => window.open(url, '_blank');
          preview.appendChild(img);
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = fileEntry.name;
          link.className = 'primary-btn';
          link.style.display = 'inline-block';
          link.style.marginTop = '8px';
          link.style.padding = '8px 16px';
          link.textContent = '💾 Download ' + fileEntry.name;
          preview.appendChild(link);
        }
      }
    }

    markFileComplete(fileId, false);
  }
}

export function appendFileTransferMessage(direction, fileId, name, size, initialProgress, isSender, senderName, senderColor) {
  const messagesDiv = document.getElementById('messages');
  if (!messagesDiv) return;

  const div = document.createElement('div');
  div.className = 'message file-message ' + (isSender ? 'right self' : 'left');
  div.dataset.fileId = fileId;

  const displayName = senderName || state.myNickname;
  const displayColor = senderColor || state.myColor;
  const fileSizeText = formatFileSize(size);

  div.innerHTML = `
    <div class="avatar" style="background:${displayColor}">${safeText(displayName).charAt(0).toUpperCase()}</div>
    <div class="bubble">
      <strong style="color:${displayColor}">${safeText(displayName)} (File Transfer)</strong>
      <div class="file-meta">
        <span class="file-name">${safeText(name)}</span>
        <span class="file-size">(${fileSizeText})</span>
        <span class="file-status">${direction === 'outgoing' ? 'Preparing file…' : 'Receiving file…'}</span>
      </div>
      <div class="file-progress" style="height:6px; background:rgba(255,255,255,0.1); border-radius:4px; margin-top:8px; overflow:hidden;">
        <div class="file-progress-bar" style="width:${initialProgress || 0}%; height:100%; background:var(--primary); transition:width 0.2s linear;"></div>
      </div>
      <div class="file-preview"></div>
    </div>
  `;

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return div;
}

export function updateFileProgress(fileId, progress, isSender, speedText = '') {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  const bar = msg ? msg.querySelector('.file-progress-bar') : null;
  const status = msg ? msg.querySelector('.file-status') : null;
  const fillGlobal = document.getElementById('progressFill');
  const percentGlobal = document.getElementById('progressPercent');
  const speedGlobal = document.getElementById('transferSpeed');

  const currentProgress = parseFloat(bar?.dataset?.lastProgress || '0');
  const safeProgress = Math.max(currentProgress, progress);

  if (bar) {
    bar.dataset.lastProgress = safeProgress.toString();
    bar.style.width = `${safeProgress}%`;
  }

  if (status) {
    const base = isSender ? 'Sending' : 'Receiving';
    status.textContent = `${base}… ${safeProgress.toFixed(0)}% ${speedText ? `(${speedText})` : ''}`;
  }

  if (fillGlobal) fillGlobal.style.width = `${safeProgress}%`;
  if (percentGlobal) percentGlobal.textContent = `${safeProgress.toFixed(0)}%`;
  if (speedGlobal && speedText) speedGlobal.textContent = speedText;
}

export function markFileComplete(fileId, isSender) {
  const msg = document.querySelector(`.file-message[data-file-id="${fileId}"]`);
  if (!msg) return;

  const status = msg.querySelector('.file-status');
  const bar = msg.querySelector('.file-progress');

  if (status) status.textContent = isSender ? 'File Sent ✔️' : 'File Received ✔️';
  if (bar) bar.style.opacity = '0.4';

  const fillGlobal = document.getElementById('progressFill');
  const percentGlobal = document.getElementById('progressPercent');
  if (fillGlobal) fillGlobal.style.width = '100%';
  if (percentGlobal) percentGlobal.textContent = '100%';

  state.filesTransferred++;
  const statFilesEl = document.getElementById('statFiles');
  if (statFilesEl) statFilesEl.textContent = state.filesTransferred;

  if (!isSender) {
    playNotificationSound();
    showToast('File transfer completed!', 'success');
  } else {
    showToast('File sent successfully!', 'success');
  }
}
