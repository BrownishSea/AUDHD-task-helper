// Pasito · servidor de avisos (Cloudflare Worker, plan gratuito). Ver server/README.md.
// Guarda los avisos programados de cada teléfono en KV («PASITO») y, cada minuto (cron), envía los que tocan con
// Web Push: VAPID (RFC 8292) y cifrado aes128gcm (RFC 8291), hechos con WebCrypto, sin dependencias.
//
// API (todas las rutas bajo /api, con CORS):
//   GET    /api/key                    → { publicKey }  clave pública VAPID (se crea sola la primera vez)
//   PUT|POST /api/devices/:id          → guarda { subscription, reminders[], api } y devuelve { scheduled, next }
//   GET    /api/devices/:id            → estado: { scheduled, next, lastTest }
//   DELETE /api/devices/:id            → olvida el dispositivo
//   POST   /api/devices/:id/test       → envía un aviso de prueba ahora
//   POST   /api/devices/:id/ack        → { tag } quita las insistencias pendientes de ese aviso
//   POST   /api/devices/:id/snooze     → { tag, taskId, pid, title, minutes } programa el aviso otra vez

const MINUTE = 60000;
const DAY = 86400000;
const STALE = 6 * 3600000; // un aviso con más de 6 h de retraso ya no se envía (igual que en la app)
const RETRY = 30 * MINUTE; // si el servicio de push falla un momento, se reintenta durante media hora
const TTL = 6 * 3600; // segundos que el servicio de push guarda el aviso si el teléfono está sin conexión
const MAX_REMINDERS = 400;
const MAX_DEVICES = 10; // un servidor personal: tus teléfonos y ordenadores
const MAX_BODY = 200000;
const DEFAULT_SUBJECT = 'https://github.com/BrownishSea/AUDHD-task-helper';
// Solo servicios de push conocidos: el Worker no hace peticiones a direcciones arbitrarias.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/;

const enc = new TextEncoder();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/* ---------- Utilidades ---------- */

function b64uEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str) {
  const s = String(str).replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const str = (v, max) => String(v == null ? '' : v).slice(0, max);

/* ---------- VAPID (RFC 8292) ---------- */

let cachedKeys = null;

async function vapidKeys(env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK) {
    return { publicKey: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) };
  }
  if (cachedKeys) return cachedKeys;
  const stored = await env.PASITO.get('vapid', 'json');
  if (stored) return (cachedKeys = stored);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  cachedKeys = { publicKey, privateJwk };
  await env.PASITO.put('vapid', JSON.stringify(cachedKeys));
  return cachedKeys;
}

async function vapidAuthorization(endpoint, keys, subject, nowMs = Date.now()) {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64uEncode(signature)}, k=${keys.publicKey}`;
}

/* ---------- Cifrado del contenido (RFC 8291, aes128gcm) ---------- */

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

async function encryptPayload(subscription, plaintext) {
  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Un único registro: contenido + delimitador 0x02 (último registro), sin relleno.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

/* ---------- Envío ---------- */

async function sendPush(env, subscription, payload) {
  const keys = await vapidKeys(env);
  const body = await encryptPayload(subscription, enc.encode(JSON.stringify(payload)));
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    TTL: String(TTL),
    Urgency: 'high',
    Authorization: await vapidAuthorization(subscription.endpoint, keys, env.VAPID_SUBJECT || DEFAULT_SUBJECT),
  };
  // Topic: si el teléfono está sin conexión, la insistencia sustituye al aviso pendiente de la misma tarea.
  const topic = str(payload.tag, 32).replace(/[^A-Za-z0-9_-]/g, '');
  if (topic) headers.Topic = topic;
  try {
    const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
    return res.status;
  } catch (e) {
    return 0;
  }
}

function payloadFor(r, doc, id) {
  return { title: r.title, body: r.body, tag: r.tag, taskId: r.taskId, pid: r.pid, nag: r.nag, api: doc.api, device: id };
}

const transient = status => status === 0 || status === 429 || status >= 500;

/* ---------- Validación ---------- */

async function cleanSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || !s.keys) throw new HttpError(400, 'Suscripción no válida.');
  let url;
  try { url = new URL(s.endpoint); } catch (e) { throw new HttpError(400, 'Suscripción no válida.'); }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.test(url.hostname)) throw new HttpError(400, 'Servicio de push no admitido.');
  let p256dh;
  let auth;
  try {
    p256dh = b64uDecode(s.keys.p256dh);
    auth = b64uDecode(s.keys.auth);
  } catch (e) {
    throw new HttpError(400, 'Claves de la suscripción no válidas.');
  }
  if (p256dh.length !== 65 || p256dh[0] !== 4 || auth.length !== 16) throw new HttpError(400, 'Claves de la suscripción no válidas.');
  try {
    await crypto.subtle.importKey('raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  } catch (e) {
    throw new HttpError(400, 'Claves de la suscripción no válidas.');
  }
  return { endpoint: s.endpoint, keys: { p256dh: b64uEncode(p256dh), auth: b64uEncode(auth) } };
}

function cleanReminder(r, now) {
  const at = Number(r && r.at);
  if (!Number.isFinite(at) || at < now - STALE || at > now + 400 * DAY) return null;
  return {
    key: str(r.key, 128),
    at,
    title: str(r.title, 120) || 'Pasito',
    body: str(r.body, 240),
    tag: str(r.tag, 64),
    taskId: str(r.taskId, 64),
    pid: str(r.pid, 64),
    nag: Math.min(2, Math.max(0, Math.trunc(Number(r.nag)) || 0)),
  };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Demasiados datos.');
  try {
    return JSON.parse(text || '{}');
  } catch (e) {
    throw new HttpError(400, 'JSON no válido.');
  }
}

/* ---------- Almacenamiento (KV) ---------- */
// vapid → claves · dev:<id> → { subscription, reminders[], api, updatedAt, lastStatus, lastSentAt }
// index → { <id>: hora del próximo aviso, o null si no tiene } para que el cron lea una sola clave por minuto.

const devKey = id => `dev:${id}`;

async function getDevice(env, id) {
  const doc = await env.PASITO.get(devKey(id), 'json');
  if (!doc) throw new HttpError(404, 'Dispositivo desconocido. Vuelve a conectarlo desde Pasito.');
  return doc;
}

const nextOf = doc => (doc && doc.reminders.length ? doc.reminders[0].at : null);

async function saveDevice(env, id, doc) {
  doc.reminders.sort((a, b) => a.at - b.at);
  await env.PASITO.put(devKey(id), JSON.stringify(doc));
  await setNext(env, { [id]: nextOf(doc) });
}

// updates: { id: número | null (sin avisos) | undefined (borrar del índice) }
async function setNext(env, updates) {
  const index = (await env.PASITO.get('index', 'json')) || {};
  let changed = false;
  for (const [id, next] of Object.entries(updates)) {
    if (next === undefined) {
      if (id in index) {
        delete index[id];
        changed = true;
      }
    } else if (index[id] !== next) {
      index[id] = next;
      changed = true;
    }
  }
  if (changed) await env.PASITO.put('index', JSON.stringify(index));
}

function status(doc) {
  return { ok: true, scheduled: doc.reminders.length, next: nextOf(doc), lastTest: doc.lastStatus || null };
}

const dropNags = (doc, tag, now) => {
  doc.reminders = doc.reminders.filter(r => !(r.tag === tag && r.nag > 0 && r.at <= now + 3600000));
};

/* ---------- Rutas ---------- */

async function putDevice(env, id, body, now) {
  const subscription = await cleanSubscription(body.subscription);
  const index = (await env.PASITO.get('index', 'json')) || {};
  if (!(id in index) && Object.keys(index).length >= MAX_DEVICES) {
    throw new HttpError(429, `Este servidor ya tiene ${MAX_DEVICES} dispositivos conectados. Desconecta alguno que ya no uses.`);
  }
  const reminders = (Array.isArray(body.reminders) ? body.reminders : []).slice(0, MAX_REMINDERS).map(r => cleanReminder(r, now)).filter(Boolean);
  const api = /^https?:\/\/[^\s"'<>]{3,200}$/.test(String(body.api || '')) ? String(body.api) : '';
  const previous = await env.PASITO.get(devKey(id), 'json');
  const doc = { subscription, reminders, api, updatedAt: now, lastStatus: previous ? previous.lastStatus : null };
  await saveDevice(env, id, doc);
  return status(doc);
}

async function testDevice(env, id) {
  const doc = await getDevice(env, id);
  const code = await sendPush(env, doc.subscription, { title: 'Pasito', body: '¡Funciona! Así te llegarán los avisos aunque Pasito esté cerrada.', tag: 'pasito-test', api: doc.api, device: id });
  if (code === 404 || code === 410) {
    await env.PASITO.delete(devKey(id));
    await setNext(env, { [id]: undefined });
    return { ok: false, status: code, gone: true };
  }
  doc.lastStatus = code;
  await env.PASITO.put(devKey(id), JSON.stringify(doc));
  return { ok: code >= 200 && code < 300, status: code };
}

async function ackDevice(env, id, body, now) {
  const doc = await getDevice(env, id);
  const before = doc.reminders.length;
  dropNags(doc, str(body.tag, 64), now);
  if (doc.reminders.length !== before) await saveDevice(env, id, doc);
  return status(doc);
}

async function snoozeDevice(env, id, body, now) {
  const doc = await getDevice(env, id);
  const tag = str(body.tag, 64);
  const minutes = Math.min(1440, Math.max(1, Math.trunc(Number(body.minutes)) || 10));
  dropNags(doc, tag, now);
  const r = cleanReminder({ key: `${str(body.taskId, 64)}:snooze:${now}`, at: now + minutes * MINUTE, title: body.title, body: 'Lo pospusiste. ¿Vamos ahora?', tag, taskId: body.taskId, pid: body.pid, nag: 0 }, now);
  doc.reminders.push(r);
  await saveDevice(env, id, doc);
  return status(doc);
}

/* ---------- Cron: enviar lo que toca ---------- */

// Por dispositivo: primero se guarda la lista sin lo que toca y, solo si eso funciona, se envía. Así un fallo al guardar
// (por ejemplo, la cuota diaria de KV agotada) pierde como mucho ese minuto, en vez de repetir el aviso cada minuto.
// Un dispositivo con problemas no detiene a los demás.
async function sendDue(env, now) {
  const index = (await env.PASITO.get('index', 'json')) || {};
  const ids = Object.keys(index).filter(id => Number.isFinite(index[id]) && index[id] <= now);
  const updates = {};
  let sent = 0;
  for (const id of ids) {
    try {
      const doc = await env.PASITO.get(devKey(id), 'json');
      if (!doc) {
        updates[id] = undefined;
        continue;
      }
      const due = doc.reminders.filter(r => r.at <= now && r.at > now - STALE);
      doc.reminders = doc.reminders.filter(r => r.at > now);
      await env.PASITO.put(devKey(id), JSON.stringify(doc));
      const retry = [];
      let gone = false;
      for (const r of due) {
        const code = await sendPush(env, doc.subscription, payloadFor(r, doc, id));
        if (code === 404 || code === 410) {
          gone = true; // el teléfono canceló la suscripción
          break;
        }
        if (code >= 200 && code < 300) sent++;
        else if (transient(code) && r.at > now - RETRY) retry.push(r);
      }
      if (gone) {
        await env.PASITO.delete(devKey(id));
        updates[id] = undefined;
        continue;
      }
      // Lo último guardado manda: si el teléfono sincronizó mientras enviábamos, su lista es la buena.
      const latest = await env.PASITO.get(devKey(id), 'json');
      if (retry.length && latest && latest.updatedAt === doc.updatedAt) {
        latest.reminders = latest.reminders.concat(retry).sort((a, b) => a.at - b.at);
        await env.PASITO.put(devKey(id), JSON.stringify(latest));
        updates[id] = now + MINUTE; // reintento en el siguiente minuto
      } else {
        updates[id] = latest ? nextOf(latest) : undefined;
      }
    } catch (e) {
      updates[id] = now + 5 * MINUTE; // algo falló (KV, datos dañados): se vuelve a mirar dentro de 5 min
    }
  }
  if (Object.keys(updates).length) {
    try {
      await setNext(env, updates);
    } catch (e) { /* el índice se corregirá en la próxima sincronización */ }
  }
  return { checked: ids.length, sent };
}

/* ---------- Entrada ---------- */

// Solo el origen (https://usuario.github.io): sin carpeta, sin barra final y sin mayúsculas en el dominio.
function allowedOrigin(env) {
  const raw = (env.ALLOWED_ORIGIN || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch (e) {
    return raw;
  }
}

// Sin cookies ni credenciales: «*» deja que la app lea también los errores (por ejemplo, «Origen no permitido»).
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, code, headers) {
  return new Response(JSON.stringify(data), { status: code, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers) });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders();
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const allowed = allowedOrigin(env);
    const origin = request.headers.get('Origin');
    if (allowed && origin && origin !== allowed) {
      return json({ error: `Origen no permitido: este servidor solo atiende a ${allowed}. Revisa ALLOWED_ORIGIN.` }, 403, headers);
    }
    if (!env.PASITO) return json({ error: 'Falta el espacio KV «PASITO». Revisa server/README.md.' }, 500, headers);
    const parts = new URL(request.url).pathname.split('/').filter(Boolean);
    const now = Date.now();
    try {
      if (parts[0] !== 'api') return json({ ok: true, name: 'Pasito · servidor de avisos' }, 200, headers);
      if (parts[1] === 'key' && parts.length === 2 && request.method === 'GET') {
        return json({ publicKey: (await vapidKeys(env)).publicKey }, 200, headers);
      }
      const id = parts[2] || '';
      if (parts[1] === 'devices' && /^[a-f0-9]{32}$/.test(id)) {
        const action = parts[3] || '';
        // POST con text/plain es una petición «simple» (sin preflight): la app la usa también al cerrarse (keepalive).
        if (!action && (request.method === 'PUT' || request.method === 'POST')) return json(await putDevice(env, id, await readJson(request), now), 200, headers);
        if (!action && request.method === 'GET') return json(status(await getDevice(env, id)), 200, headers);
        if (!action && request.method === 'DELETE') {
          await env.PASITO.delete(devKey(id));
          await setNext(env, { [id]: undefined });
          return json({ ok: true }, 200, headers);
        }
        if (request.method === 'POST' && action === 'test') return json(await testDevice(env, id), 200, headers);
        if (request.method === 'POST' && action === 'ack') return json(await ackDevice(env, id, await readJson(request), now), 200, headers);
        if (request.method === 'POST' && action === 'snooze') return json(await snoozeDevice(env, id, await readJson(request), now), 200, headers);
      }
      return json({ error: 'No encontrado.' }, 404, headers);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, headers);
      return json({ error: 'Error interno del servidor de avisos.' }, 500, headers);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDue(env, event.scheduledTime || Date.now()));
  },
};
