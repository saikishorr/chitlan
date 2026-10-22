import state from './state.js';

export function scheduleTimeout(callback, delay) {
  let id;
  id = setTimeout(() => {
    state.managedTimeouts.delete(id);
    callback();
  }, delay);
  state.managedTimeouts.add(id);
  return id;
}

export function scheduleInterval(callback, delay) {
  const id = setInterval(callback, delay);
  state.managedIntervals.add(id);
  return id;
}

export function clearManagedTimeout(id) {
  if (id == null) return;
  clearTimeout(id);
  state.managedTimeouts.delete(id);
}

export function clearManagedInterval(id) {
  if (id == null) return;
  clearInterval(id);
  state.managedIntervals.delete(id);
}

export function clearManagedTimers() {
  state.managedTimeouts.forEach(id => clearTimeout(id));
  state.managedIntervals.forEach(id => clearInterval(id));
  state.managedTimeouts.clear();
  state.managedIntervals.clear();
}

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  return Array.from(values, value => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join('');
}

export function normalizeRoomCode(value) {
  const code = String(value || '').trim().replace(/^chitlan-/i, '').replace(/-/g, '').toUpperCase();
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)) return '';
  return code;
}

export function formatRoomCode(value) {
  const code = normalizeRoomCode(value);
  return code ? `${code.slice(0, 3)}-${code.slice(3)}` : '';
}

export function sanitizeNickname(value) {
  let nickname = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  nickname = Array.from(nickname).slice(0, 24).join('').trim() || 'Guest';
  if (/^(system|host)$/i.test(nickname)) nickname += ' (guest)';
  return nickname;
}

export function roomPeerId(value) {
  const code = normalizeRoomCode(value);
  return code ? `chitlan-${code.toLowerCase()}` : '';
}

export function generateFileId() {
  return 'file-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
}

export function safeText(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatMessageTime(timestamp) {
  const parsed = Number(timestamp);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatFileSize(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return value.toFixed(1) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 KB/s';
  if (bytesPerSecond > 1024 ** 3) return (bytesPerSecond / 1024 ** 3).toFixed(2) + ' GB/s';
  if (bytesPerSecond > 1024 ** 2) return (bytesPerSecond / 1024 ** 2).toFixed(2) + ' MB/s';
  return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
}

export function showToast(message, type = 'info', action = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  if (action) {
    const label = document.createElement('span');
    label.textContent = message;
    toast.appendChild(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label || 'Action';
    button.addEventListener('click', action.onClick);
    Object.assign(button.style, {
      padding: '6px 10px',
      border: '1px solid rgba(255,255,255,.45)',
      borderRadius: '8px',
      background: 'rgba(255,255,255,.18)',
      color: '#ffffff',
      font: 'inherit',
      fontWeight: '700',
      whiteSpace: 'nowrap'
    });
    toast.appendChild(button);
    Object.assign(toast.style, { display: 'flex', alignItems: 'center', gap: '12px' });
  } else {
    toast.textContent = message;
  }

  // Inline toast styling if CSS doesn't cover it
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    borderRadius: '12px',
    background: type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--primary)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 10px 30px var(--shadow-dark-40)',
    zIndex: '9999',
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
  });

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  if (!action?.persistent) {
    scheduleTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      scheduleTimeout(() => toast.remove(), 300);
    }, 3500);
  }
  return toast;
}
