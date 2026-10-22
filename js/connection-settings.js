import { CONNECTION_SETTINGS_KEY } from './constants.js';

const DEFAULT_ICE_SERVERS = [{
  urls: 'stun:stun.l.google.com:19302',
  username: '',
  credential: ''
}];

function isValidSignalHost(host) {
  const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*\.?$/i;
  return hostname.test(host) || /^\[[0-9a-f:.]+\]$/i.test(host);
}

function normalizePort(port, fallback) {
  if (port == null) return fallback;
  if (String(port).trim() === '') return '';
  const parsed = Number(port);
  return Number.isFinite(parsed) ? parsed : '';
}

export function defaultConnectionSettings() {
  return {
    signaling: {
      mode: 'public',
      host: '',
      port: 443,
      path: '/peerjs',
      secure: true
    },
    iceServers: DEFAULT_ICE_SERVERS.map(server => ({ ...server }))
  };
}

function normalizeIceServers(iceServers) {
  if (!Array.isArray(iceServers)) return [];
  return iceServers.map(server => {
    if (!server || typeof server !== 'object') return null;
    const urls = String(server.urls || '').split(',').map(url => url.trim()).filter(Boolean);
    if (!urls.length) return null;
    const normalized = { urls: urls.length === 1 ? urls[0] : urls };
    const username = String(server.username || '').trim();
    const credential = String(server.credential || '');
    if (username) normalized.username = username;
    if (credential) normalized.credential = credential;
    return normalized;
  }).filter(Boolean);
}

export function normalizeConnectionSettings(settings) {
  const defaults = defaultConnectionSettings();
  const signaling = settings?.signaling || {};
  return {
    signaling: {
      mode: signaling.mode === 'custom' ? 'custom' : 'public',
      host: String(signaling.host || '').trim(),
      port: normalizePort(signaling.port, defaults.signaling.port),
      path: signaling.path == null ? defaults.signaling.path : String(signaling.path).trim(),
      secure: signaling.secure !== false
    },
    iceServers: Array.isArray(settings?.iceServers)
      ? normalizeIceServers(settings.iceServers)
      : defaults.iceServers
  };
}

export function loadConnectionSettings() {
  try {
    const saved = localStorage.getItem(CONNECTION_SETTINGS_KEY);
    return saved ? normalizeConnectionSettings(JSON.parse(saved)) : defaultConnectionSettings();
  } catch (error) {
    return defaultConnectionSettings();
  }
}

export function saveConnectionSettings(settings) {
  const normalized = normalizeConnectionSettings(settings);
  try {
    localStorage.setItem(CONNECTION_SETTINGS_KEY, JSON.stringify(normalized));
  } catch (error) {}
  return normalized;
}

export function validateConnectionSettings(settings, { securePage = window.location.protocol === 'https:' } = {}) {
  const signaling = settings?.signaling || {};
  if (signaling.mode === 'custom') {
    const host = String(signaling.host || '').trim();
    const port = signaling.port === '' || signaling.port == null ? NaN : Number(signaling.port);
    const path = String(signaling.path || '').trim();
    const secure = signaling.secure !== false;
    if (!host || !isValidSignalHost(host)) {
      return 'Enter a server host without a protocol or path.';
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return 'Enter a valid signaling server port.';
    }
    if (!path.startsWith('/') || /[?#\s]/.test(path)) {
      return 'The signaling path must start with / and cannot contain a query or fragment.';
    }
    if (securePage && !secure) {
      return 'This page uses HTTPS, so the signaling server must use WSS with a valid TLS certificate.';
    }
  }

  for (const server of Array.isArray(settings?.iceServers) ? settings.iceServers : []) {
    const serverUrls = String(server?.urls || '').trim();
    if (!serverUrls) continue;
    const urls = serverUrls.split(',').map(url => url.trim());
    if (urls.some(url => !/^(stun|stuns|turn|turns):/i.test(url))) {
      return 'ICE server URLs must start with stun:, stuns:, turn:, or turns:.';
    }
  }
  return '';
}

function normalizeSignalSettings(signalSettings) {
  if (!signalSettings || typeof signalSettings !== 'object') return null;
  const host = String(signalSettings.host || '').trim();
  const port = Number(signalSettings.port);
  const path = String(signalSettings.path || '').trim();
  if (!host || !isValidSignalHost(host)) return null;
  if (signalSettings.port === '' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!path.startsWith('/') || /[?#\s]/.test(path)) return null;
  if (typeof signalSettings.secure !== 'boolean') return null;
  return { mode: 'custom', host, port, path, secure: signalSettings.secure };
}

export function encodeSignalSettings(signalSettings) {
  const normalized = normalizeSignalSettings(signalSettings);
  if (!normalized) return '';
  const json = JSON.stringify({
    host: normalized.host,
    port: normalized.port,
    path: normalized.path,
    secure: normalized.secure
  });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSignalSettings(value) {
  try {
    const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return normalizeSignalSettings(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    return null;
  }
}

export function buildPeerOptions(settings, signalOverride = null) {
  const normalized = normalizeConnectionSettings(settings);
  const signaling = signalOverride
    ? normalizeSignalSettings(signalOverride)
    : normalized.signaling.mode === 'custom' ? normalizeSignalSettings(normalized.signaling) : null;
  if (signalOverride && !signaling) throw new Error('The invite contains invalid custom signaling settings.');
  if (!signalOverride && normalized.signaling.mode === 'custom' && !signaling) {
    throw new Error('Complete the custom signaling server settings before connecting.');
  }

  const validationSettings = {
    signaling: signaling ? { ...signaling, mode: 'custom' } : { mode: 'public' },
    iceServers: normalized.iceServers
  };
  const validationError = validateConnectionSettings(validationSettings);
  if (validationError) throw new Error(validationError);

  const options = {
    host: signaling?.host || '0.peerjs.com',
    port: signaling?.port || 443,
    path: signaling?.path || '/',
    secure: signaling ? signaling.secure : true,
    config: { iceServers: normalized.iceServers, sdpSemantics: 'unified-plan' }
  };
  return { options, signaling: signaling ? { ...signaling, mode: 'custom' } : { mode: 'public' } };
}
