// Pruebas del servidor de avisos (server/worker.js) con KV en memoria y un servicio de push simulado.
// Opcional: HTTP_ECE_MODULE=<ruta a node_modules/http_ece> descifra además con la librería de referencia.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { memoryKV, fakeSubscription, decrypt, verifyVapid } = require('./push-helpers.js');

const WORKER = pathToFileURL(path.join(__dirname, '..', 'server', 'worker.js')).href;
const DEVICE = 'a'.repeat(32);
const MIN = 60000;

let worker;
test.before(async () => { worker = (await import(WORKER)).default; });

function makeEnv(extra = {}) {
  return Object.assign({ PASITO: memoryKV() }, extra);
}

const call = (env, method, path, body, headers = {}) => worker.fetch(new Request(`https://avisos.test${path}`, {
  method,
  headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);

async function cron(env, time) {
  const pending = [];
  await worker.scheduled({ scheduledTime: time }, env, { waitUntil: p => pending.push(p) });
  return (await Promise.all(pending))[0];
}

// Sustituye fetch (el servicio de push) mientras dura fn.
async function withPushService(respond, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: await respond(calls.length, url, init) });
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = real;
  }
  return calls;
}

async function connect(env, reminders, fake) {
  const res = await call(env, 'PUT', `/api/devices/${DEVICE}`, { subscription: fake.subscription, reminders, api: 'https://avisos.test' });
  return { res, body: await res.json() };
}

const index = async env => (await env.PASITO.get('index', 'json')) || {};
const device = async env => env.PASITO.get(`dev:${DEVICE}`, 'json');

test('clave pública VAPID: se crea una vez y es estable', async () => {
  const env = makeEnv();
  const a = await (await call(env, 'GET', '/api/key')).json();
  const b = await (await call(env, 'GET', '/api/key')).json();
  assert.equal(Buffer.from(a.publicKey, 'base64url').length, 65);
  assert.equal(a.publicKey, b.publicKey);
});

test('rechaza dispositivos y suscripciones no válidos', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  assert.equal((await call(env, 'PUT', '/api/devices/corto', { subscription: fake.subscription })).status, 404);
  const evil = await fakeSubscription('https://ejemplo.com/robar');
  const r1 = await call(env, 'PUT', `/api/devices/${DEVICE}`, { subscription: evil.subscription });
  assert.equal(r1.status, 400);
  assert.match((await r1.json()).error, /no admitido/);
  const bad = { endpoint: fake.subscription.endpoint, keys: { p256dh: 'abc', auth: 'def' } };
  assert.equal((await call(env, 'PUT', `/api/devices/${DEVICE}`, { subscription: bad })).status, 400);
  const offCurve = new Uint8Array(65).fill(7);
  offCurve[0] = 4;
  const notAPoint = { endpoint: fake.subscription.endpoint, keys: { p256dh: Buffer.from(offCurve).toString('base64url'), auth: fake.subscription.keys.auth } };
  assert.equal((await call(env, 'PUT', `/api/devices/${DEVICE}`, { subscription: notAPoint })).status, 400, 'clave que no es un punto de la curva');
  assert.equal((await call(env, 'PUT', `/api/devices/${DEVICE}`, '{no json')).status, 400);
  assert.equal((await call(env, 'GET', '/api/devices/' + 'b'.repeat(32))).status, 404);
});

test('guarda y limpia los avisos, y calcula el próximo', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  const reminders = [
    { key: 'x', at: now + 30 * MIN, title: 'T'.repeat(500), body: 'b', tag: 'pasito-x', taskId: 'x', nag: 0 },
    { key: 'viejo', at: now - 7 * 3600000, title: 'Viejo' },
    { key: 'y', at: now + 5 * MIN, title: 'Antes', tag: 'pasito-y', nag: 9 },
    { key: 'roto', at: 'mañana' },
  ];
  const { res, body } = await connect(env, reminders, fake);
  assert.equal(res.status, 200);
  assert.equal(body.scheduled, 2);
  const doc = await device(env);
  assert.deepEqual(doc.reminders.map(r => r.key), ['y', 'x'], 'ordenados y sin los inválidos');
  assert.equal(doc.reminders[1].title.length, 120);
  assert.equal(doc.reminders[0].nag, 2);
  assert.equal((await index(env))[DEVICE], now + 5 * MIN);
  const st = await (await call(env, 'GET', `/api/devices/${DEVICE}`)).json();
  assert.equal(st.scheduled, 2);
});

test('el cron envía lo que toca, cifrado y firmado, y deja lo demás', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const t0 = Date.now() + 10 * MIN;
  await connect(env, [
    { key: 'a', at: t0, title: 'Tomar la pastilla', body: 'Empieza por: un vaso de agua', tag: 'pasito-a', taskId: 'a', pid: 'p1', nag: 0 },
    { key: 'a:n1', at: t0 + 10 * MIN, title: 'Tomar la pastilla', body: 'Otra vez', tag: 'pasito-a', taskId: 'a', pid: 'p1', nag: 1 },
  ], fake);

  let calls = await withPushService(() => 201, async () => { await cron(env, t0 - MIN); });
  assert.equal(calls.length, 0, 'todavía no toca');

  calls = await withPushService(() => 201, async () => { await cron(env, t0 + 1000); });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, fake.subscription.endpoint);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(init.headers['Content-Type'], 'application/octet-stream');
  assert.equal(init.headers.Urgency, 'high');
  assert.equal(init.headers.TTL, '21600');
  assert.equal(init.headers.Topic, 'pasito-a');

  const vapid = await verifyVapid(init.headers.Authorization);
  assert.equal(vapid.ok, true, 'firma ES256 válida');
  assert.equal(vapid.header.alg, 'ES256');
  assert.equal(vapid.claims.aud, 'https://fcm.googleapis.com');
  assert.ok(vapid.claims.exp > Date.now() / 1000 && vapid.claims.exp <= Date.now() / 1000 + 24 * 3600);
  assert.match(vapid.claims.sub, /^(mailto:|https:)/);
  const key = await (await call(env, 'GET', '/api/key')).json();
  assert.equal(vapid.publicKey, key.publicKey);

  const out = await decrypt(init.body, fake);
  assert.equal(out.rs, 4096);
  assert.equal(out.idlen, 65);
  assert.deepEqual(out.json, { title: 'Tomar la pastilla', body: 'Empieza por: un vaso de agua', tag: 'pasito-a', taskId: 'a', pid: 'p1', nag: 0, api: 'https://avisos.test', device: DEVICE });

  if (process.env.HTTP_ECE_MODULE) {
    // Descifrado independiente con la librería de referencia (la que usa web-push).
    const ece = require(process.env.HTTP_ECE_MODULE);
    const ecdh = require('node:crypto').createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(fake.privateJwk.d, 'base64url'));
    const plain = ece.decrypt(Buffer.from(init.body), { version: 'aes128gcm', privateKey: ecdh, authSecret: Buffer.from(fake.auth) });
    assert.equal(JSON.parse(plain.toString('utf8')).title, 'Tomar la pastilla');
  }

  const doc = await device(env);
  assert.deepEqual(doc.reminders.map(r => r.key), ['a:n1'], 'lo enviado se quita');
  assert.equal((await index(env))[DEVICE], t0 + 10 * MIN, 'el índice apunta al siguiente');
  await withPushService(() => 201, async () => { await cron(env, t0 + 10 * MIN + 1000); });
  assert.equal((await index(env))[DEVICE], null, 'sin avisos pendientes, sigue en el índice sin hora');
});

test('suscripción cancelada (410): se olvida el dispositivo', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - MIN, title: 'Ya', tag: 'pasito-a', taskId: 'a' }], fake);
  await withPushService(() => 410, async () => { await cron(env, now); });
  assert.equal(await device(env), null);
  assert.equal(DEVICE in (await index(env)), false);
});

test('fallo pasajero (500): se reintenta en el siguiente minuto', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - MIN, title: 'Reintentar', tag: 'pasito-a', taskId: 'a' }], fake);
  await withPushService(() => 500, async () => { await cron(env, now); });
  assert.deepEqual((await device(env)).reminders.map(r => r.key), ['a']);
  assert.equal((await index(env))[DEVICE], now + MIN);
  const calls = await withPushService(() => 201, async () => { await cron(env, now + MIN); });
  assert.equal(calls.length, 1);
  assert.equal((await device(env)).reminders.length, 0);
});

test('lo que lleva más de 6 h de retraso ya no se envía', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - 5 * MIN, title: 'Tarde', tag: 'pasito-a', taskId: 'a' }], fake);
  const calls = await withPushService(() => 201, async () => { await cron(env, now + 7 * 3600000); });
  assert.equal(calls.length, 0);
  assert.equal((await device(env)).reminders.length, 0);
});

test('responder a un aviso quita sus insistencias; posponer lo programa otra vez', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [
    { key: 'a:n1', at: now + 10 * MIN, title: 'X', tag: 'pasito-a', taskId: 'a', nag: 1 },
    { key: 'a:n2', at: now + 20 * MIN, title: 'X', tag: 'pasito-a', taskId: 'a', nag: 2 },
    { key: 'a:manana', at: now + 24 * 3600000, title: 'X', tag: 'pasito-a', taskId: 'a', nag: 0 },
    { key: 'b:n1', at: now + 10 * MIN, title: 'Y', tag: 'pasito-b', taskId: 'b', nag: 1 },
  ], fake);
  await call(env, 'POST', `/api/devices/${DEVICE}/ack`, { tag: 'pasito-a' });
  assert.deepEqual((await device(env)).reminders.map(r => r.key).sort(), ['a:manana', 'b:n1']);

  const res = await call(env, 'POST', `/api/devices/${DEVICE}/snooze`, { tag: 'pasito-b', taskId: 'b', pid: 'p1', title: 'Y', minutes: 10 });
  assert.equal(res.status, 200);
  const doc = await device(env);
  const snoozed = doc.reminders.find(r => r.key.startsWith('b:snooze'));
  assert.ok(snoozed && Math.abs(snoozed.at - (now + 10 * MIN)) < 5000);
  assert.equal(doc.reminders.some(r => r.key === 'b:n1'), false, 'posponer también quita la insistencia');
});

test('aviso de prueba inmediato', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  await connect(env, [], fake);
  let res;
  const calls = await withPushService(() => 201, async () => { res = await (await call(env, 'POST', `/api/devices/${DEVICE}/test`)).json(); });
  assert.equal(res.ok, true);
  assert.equal((await decrypt(calls[0].init.body, fake)).json.tag, 'pasito-test');
  await withPushService(() => 410, async () => { res = await (await call(env, 'POST', `/api/devices/${DEVICE}/test`)).json(); });
  assert.equal(res.gone, true);
  assert.equal(await device(env), null);
});

test('si el teléfono sincroniza mientras se envía, su lista nueva no se pierde', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - MIN, title: 'Ahora', tag: 'pasito-a', taskId: 'a' }], fake);
  await withPushService(async () => {
    await new Promise(r => setTimeout(r, 2));
    await connect(env, [{ key: 'nueva', at: now + 60 * MIN, title: 'Nueva', tag: 'pasito-n', taskId: 'n' }], fake);
    return 201;
  }, async () => { await cron(env, now); });
  assert.deepEqual((await device(env)).reminders.map(r => r.key), ['nueva']);
  assert.equal((await index(env))[DEVICE], now + 60 * MIN);
});

test('CORS y origen permitido', async () => {
  // Aunque se escriba con carpeta, barra final o mayúsculas, cuenta solo el origen.
  const env = makeEnv({ ALLOWED_ORIGIN: 'https://Yo.github.io/AUDHD-task-helper/' });
  const pre = await call(env, 'OPTIONS', '/api/key');
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /PUT/);
  const denied = await call(env, 'GET', '/api/key', undefined, { Origin: 'https://otra.web' });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), '*', 'la app puede leer el error');
  assert.match((await denied.json()).error, /Origen no permitido.*https:\/\/yo\.github\.io/);
  assert.equal((await call(env, 'GET', '/api/key', undefined, { Origin: 'https://yo.github.io' })).status, 200);
  const home = await (await call(makeEnv(), 'GET', '/')).json();
  assert.equal(home.ok, true);
  assert.equal((await call({}, 'GET', '/api/key')).status, 500, 'sin KV avisa del problema');
});

test('un dispositivo con datos dañados no detiene a los demás', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - MIN, title: 'Buena', tag: 'pasito-a', taskId: 'a' }], fake);
  const other = 'b'.repeat(32);
  const broken = { subscription: { endpoint: fake.subscription.endpoint, keys: { p256dh: Buffer.from(new Uint8Array(65).fill(4)).toString('base64url'), auth: fake.subscription.keys.auth } }, reminders: [{ key: 'x', at: now - MIN, title: 'Rota', tag: 't', taskId: 'x', nag: 0 }], api: '', updatedAt: now };
  await env.PASITO.put(`dev:${other}`, JSON.stringify(broken));
  const idx = await index(env);
  await env.PASITO.put('index', JSON.stringify(Object.assign({ [other]: now - MIN }, idx)));
  const calls = await withPushService(() => 201, async () => { await cron(env, now); });
  assert.equal(calls.length, 1, 'el bueno se envía');
  assert.equal((await decrypt(calls[0].init.body, fake)).json.title, 'Buena');
  assert.equal((await index(env))[other], now + 5 * MIN, 'el dañado se vuelve a mirar más tarde');
});

test('si guardar falla, no se envía (nada de repetir cada minuto)', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  const now = Date.now();
  await connect(env, [{ key: 'a', at: now - MIN, title: 'Una vez', tag: 'pasito-a', taskId: 'a' }], fake);
  const realPut = env.PASITO.put;
  env.PASITO.put = async () => { throw new Error('KV: cuota diaria agotada'); };
  let calls = await withPushService(() => 201, async () => { await cron(env, now); });
  assert.equal(calls.length, 0);
  env.PASITO.put = realPut;
  calls = await withPushService(() => 201, async () => { await cron(env, now + 6 * MIN); });
  assert.equal(calls.length, 1, 'cuando vuelve a poder guardar, se envía una sola vez');
  calls = await withPushService(() => 201, async () => { await cron(env, now + 7 * MIN); });
  assert.equal(calls.length, 0);
});

test('como mucho 10 dispositivos por servidor', async () => {
  const env = makeEnv();
  const fake = await fakeSubscription();
  for (let i = 0; i < 10; i++) {
    const id = i.toString(16).repeat(32);
    assert.equal((await call(env, 'PUT', `/api/devices/${id}`, { subscription: fake.subscription, reminders: [] })).status, 200);
  }
  const res = await call(env, 'PUT', `/api/devices/${'f'.repeat(31)}e`, { subscription: fake.subscription, reminders: [] });
  assert.equal(res.status, 429);
  assert.equal((await call(env, 'PUT', `/api/devices/${'0'.repeat(32)}`, { subscription: fake.subscription, reminders: [] })).status, 200, 'los ya conectados siguen pudiendo sincronizar');
});
