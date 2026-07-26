export async function detectPublicIP() {
  const ipDisplay = document.getElementById('ip-display');
  if (!ipDisplay) return;

  try {
    const res = await fetch('https://api.ipify.org?format=json', {
      cache: 'no-store'
    });
    if (!res.ok) throw new Error();

    const data = await res.json();
    ipDisplay.textContent = 'IP: ' + data.ip;
  } catch (e) {
    if (!navigator.onLine) {
      ipDisplay.textContent = 'Offline (LAN only)';
    } else {
      ipDisplay.textContent = 'IP: Local Network';
    }
  }
}

export function generateNumericIdWithPrefix() {
  return `${Math.floor(1000 + Math.random() * 9000)}`;
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

export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  // Inline toast styling if CSS doesn't cover it
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    padding: '12px 20px',
    borderRadius: '12px',
    background: type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#7c5cff',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
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

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}