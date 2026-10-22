// Bump APP_VERSION in js/constants.js for every release. The cache is named after it, so a
// new version installs a fresh cache and deletes the old one. HTML is fetched network-first;
// other files are served from the cache and refreshed in the background
// (stale-while-revalidate), so even a deploy without a bump reaches users on their next visit.
import { APP_VERSION } from './js/constants.js';

const CACHE_PREFIX = 'chitlan-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const APP_BASE = self.registration.scope;
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.html',
  './manifest.webmanifest',
  './ding.mp3',
  './css/animations.css',
  './css/app.css',
  './css/chat.css',
  './css/files.css',
  './css/responsive.css',
  './css/screen.css',
  './css/sidebar.css',
  './css/voice.css',
  './js/app.js',
  './js/constants.js',
  './js/connection-settings.js',
  './js/files.js',
  './js/peer.js',
  './js/screen.js',
  './js/session.js',
  './js/state.js',
  './js/ui.js',
  './js/utils.js',
  './js/voice.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './vendor/peerjs.min.js',
  './vendor/qrcode-generator.js'
];

function assetUrl(path) {
  return new URL(path, APP_BASE).href;
}

function isGoogleFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event) {
  const request = event.request;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(async response => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  if (cached) {
    // Keep the worker alive until the background refresh has updated the cache.
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

async function networkFirstHtml(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const url = new URL(request.url);
    const fallbackPath = url.pathname.endsWith('/app.html') ? './app.html' : './index.html';
    const fallback = await cache.match(assetUrl(fallbackPath));
    return fallback || Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS.map(path => new Request(assetUrl(path), { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) return caches.delete(name);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (isGoogleFont(url)) event.respondWith(cacheFirst(request));
    return;
  }

  const isHtml = request.mode === 'navigate'
    || request.destination === 'document'
    || url.pathname.endsWith('.html')
    || url.pathname === new URL('./', APP_BASE).pathname;
  event.respondWith(isHtml ? networkFirstHtml(request) : staleWhileRevalidate(event));
});
