/* Pasito: service worker. Guarda la app para usarla sin conexión, muestra los avisos push que llegan con la app
   cerrada (server/worker.js) y atiende los botones de la notificación. */
const CACHE = 'pasito-v6';
const ASSETS = ['./', 'index.html', 'styles.css', 'config.js', 'logic.js', 'app.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
// Safari (iPhone) exige mostrar una notificación por cada push; Chrome permite omitirla si la app está delante.
const UA = self.navigator.userAgent || '';
const IS_SAFARI = /Safari/.test(UA) && !/Chrome|Chromium|CriOS|Android/.test(UA);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones), caché si no hay conexión.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
  );
});

/* ---------- Cola de acciones para la app (IndexedDB «pasito-sw», almacén «actions») ---------- */
// «Hecha», «En 10 min» o tocar el aviso: la app las aplica al abrirse o al recibir el mensaje 'pasito-actions'.

function openQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pasito-sw', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('actions', { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueAction(action) {
  try {
    const db = await openQueue();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('actions', 'readwrite');
      tx.objectStore('actions').add(action);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) { /* sin IndexedDB: el aviso ya se atendió, la app no se enterará */ }
}

// Solo las ventanas de Pasito: en GitHub Pages todos los proyectos de un usuario comparten origen.
async function windows() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return list.filter(c => c.url.startsWith(self.registration.scope));
}

async function tellApp(message) {
  const list = await windows();
  list.forEach(c => c.postMessage(message));
  return list;
}

// Avisa al servidor (quitar insistencias, posponer). Sin conexión no pasa nada grave: la app sincroniza después.
async function callServer(d, action, body) {
  if (!d || !d.api || !d.device) return;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    await fetch(`${d.api}/api/devices/${d.device}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal });
  } catch (e) { /* sin conexión o sin respuesta a tiempo */ }
}

/* ---------- Avisos push ---------- */

self.addEventListener('push', event => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch (e) {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil((async () => {
    const front = (await windows()).find(c => c.visibilityState === 'visible' && c.focused);
    if (front && !IS_SAFARI && d.taskId) {
      // Pasito está delante: la propia app muestra su tarjeta de aviso.
      front.postMessage({ type: 'pasito-push', data: d });
      return;
    }
    await self.registration.showNotification(d.title || 'Pasito', {
      body: d.body || 'Es el momento. Un pasito basta.',
      tag: d.tag || 'pasito',
      renotify: true,
      requireInteraction: !!d.taskId,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: d,
      actions: d.taskId ? [{ action: 'done', title: 'Hecha' }, { action: 'snooze', title: 'En 10 min' }] : [],
    });
  })());
});

self.addEventListener('notificationclick', event => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  event.waitUntil((async () => {
    if (event.action === 'done' && d.taskId) {
      await queueAction({ type: 'done', pid: d.pid || '', taskId: d.taskId, at: Date.now() });
      await callServer(d, 'ack', { tag: d.tag });
      await tellApp({ type: 'pasito-actions' });
      return;
    }
    if (event.action === 'snooze' && d.taskId) {
      const until = Date.now() + 10 * 60000;
      await queueAction({ type: 'snooze', pid: d.pid || '', taskId: d.taskId, until });
      await callServer(d, 'snooze', { tag: d.tag, taskId: d.taskId, pid: d.pid, title: d.title, minutes: 10 });
      await tellApp({ type: 'pasito-actions' });
      return;
    }
    // Tocar el aviso: primero abrir Pasito (el navegador solo deja hacerlo unos segundos tras el toque), lo demás después.
    if (d.taskId) await queueAction({ type: 'open', pid: d.pid || '', taskId: d.taskId, at: Date.now() });
    const list = await windows();
    const opening = list.length && 'focus' in list[0] ? list[0].focus() : self.clients.openWindow('./#hoy');
    await Promise.allSettled([opening, d.tag ? callServer(d, 'ack', { tag: d.tag }) : null]);
    await tellApp({ type: 'pasito-actions' });
  })());
});

// Descartar el aviso también es responder: no insistir más, ni aquí ni al abrir Pasito.
self.addEventListener('notificationclose', event => {
  const d = event.notification.data || {};
  if (!d.taskId) return;
  event.waitUntil(Promise.allSettled([
    queueAction({ type: 'dismiss', pid: d.pid || '', taskId: d.taskId, at: Date.now() }),
    d.tag ? callServer(d, 'ack', { tag: d.tag }) : null,
  ]));
});
