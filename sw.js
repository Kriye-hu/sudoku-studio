/* Sudoku Studio service worker — offline app shell. */
'use strict';

// Bump this version whenever the app shell changes.
const CACHE_NAME = 'sudoku-studio-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './sudoku.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put('./index.html', copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          return new Response(
            '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>数独</title><body style="font-family:system-ui;background:#f2f7fb;color:#142634;display:grid;place-items:center;min-height:100vh;margin:0"><p>暂时离线，请联网后再打开一次。</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      return cached || (await network) || new Response('', { status: 504 });
    })()
  );
});
