// Utilidades de prueba para el servidor de avisos: KV en memoria, suscripciones push falsas con claves reales,
// descifrado aes128gcm (RFC 8291) y verificación de la firma VAPID. Lo usan push-server.test.js y e2e.js.
const { webcrypto } = require('node:crypto');

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

const b64u = bytes => Buffer.from(bytes).toString('base64url');
const unb64u = str => new Uint8Array(Buffer.from(String(str), 'base64url'));

function memoryKV() {
  const map = new Map();
  return {
    map,
    async get(key, type) {
      if (!map.has(key)) return null;
      const value = map.get(key);
      return type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) { map.set(key, String(value)); },
    async delete(key) { map.delete(key); },
  };
}

// Una suscripción como la que da el navegador, con claves que la prueba conoce para poder descifrar.
async function fakeSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/prueba') {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const auth = webcrypto.getRandomValues(new Uint8Array(16));
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  return { subscription: { endpoint, keys: { p256dh: b64u(uaPublic), auth: b64u(auth) } }, privateJwk, uaPublic, auth };
}

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Descifrado según RFC 8291 §3.4 / RFC 8188, como lo haría el navegador.
async function decrypt(body, fake) {
  const data = new Uint8Array(body);
  const salt = data.slice(0, 16);
  const rs = new DataView(data.buffer, data.byteOffset).getUint32(16);
  const idlen = data[20];
  const asPublic = data.slice(21, 21 + idlen);
  const cipher = data.slice(21 + idlen);
  const priv = await subtle.importKey('jwk', fake.privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, priv, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...fake.uaPublic, ...asPublic]);
  const ikm = await hkdf(fake.auth, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('falta el delimitador de último registro');
  return { rs, idlen, json: JSON.parse(Buffer.from(plain.slice(0, end)).toString('utf8')) };
}

// Comprueba la cabecera Authorization: vapid t=<JWT ES256>, k=<clave pública>.
async function verifyVapid(header) {
  const m = /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(header || '');
  if (!m) throw new Error(`cabecera VAPID mal formada: ${header}`);
  const [h, c, s] = m[1].split('.');
  const pub = await subtle.importKey('raw', unb64u(m[2]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(s), enc.encode(`${h}.${c}`));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), claims: JSON.parse(Buffer.from(c, 'base64url')), publicKey: m[2] };
}

module.exports = { b64u, unb64u, memoryKV, fakeSubscription, decrypt, verifyVapid };
