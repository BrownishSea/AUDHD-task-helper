// Prueba de extremo a extremo en un navegador real (Chromium con Playwright).
// Uso: npm run test:e2e   (necesita Playwright: npm i -D playwright && npx playwright install chromium)
// Variables opcionales: PLAYWRIGHT_MODULE (ruta al paquete), SHOTS_DIR (carpeta para capturas).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { memoryKV, fakeSubscription, decrypt } = require('./push-helpers.js');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  // El Chromium completo (modo «headless» nuevo) admite notificaciones; el «headless shell» las deniega siempre.
  const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  // Siempre booleanos en las aserciones: un ElementHandle dentro de un mensaje de error agota la memoria al formatearlo.
  const exists = async (sel, pg = page) => (await pg.$(sel)) !== null;
  const shotsDir = process.env.SHOTS_DIR;
  const shot = async name => { if (shotsDir) await page.screenshot({ path: path.join(shotsDir, `${name}.png`) }); };
  const data = () => page.evaluate(() => {
    const meta = JSON.parse(localStorage.getItem('pasito-perfiles'));
    return { meta, state: JSON.parse(localStorage.getItem(`pasito-v1:${meta.active}`)) };
  });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (e) {
      console.log(`not ok - ${name}\n  ${String(e.message).split('\n').slice(0, 6).join('\n  ')}\n  ${String(e.stack).split('\n').find(l => l.includes('e2e.js')) || ''}`);
      process.exitCode = 1;
    }
  };

  // Simula datos de la versión anterior (sin perfiles) para comprobar la migración.
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('pasito-v1', JSON.stringify({ tasks: [{ id: 'old1', title: 'Tarea antigua', steps: [] }], lists: ['Bandeja'], stars: 7, log: [] }));
  });
  await page.reload();
  await page.waitForTimeout(300);

  await step('migra los datos antiguos a un primer perfil', async () => {
    const { meta, state } = await data();
    assert.equal(meta.list.length, 1);
    assert.equal(state.tasks[0].title, 'Tarea antigua');
    assert.equal(state.stars, 7);
    assert.equal(await page.evaluate(() => localStorage.getItem('pasito-v1')), null);
  });

  // A partir de aquí, empezamos de cero con los ejemplos.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  await step('bienvenida guiada: sin ejemplos, tres preguntas que crean tus primeras tareas', async () => {
    assert.equal((await data()).state.tasks.length, 0, 'nada viene hecho');
    assert.ok(await page.isVisible('#introForm'));
    assert.ok(await page.isHidden('#captureInput'), 'la captura se esconde durante la bienvenida');
    assert.ok(await page.isHidden('.tabs'), 'las pestañas también');
    await shot('00-bienvenida');
    await page.fill('#introName', 'Ana');
    await page.click('#introNext');
    assert.equal((await data()).meta.list[0].name, 'Ana');
    assert.ok(await page.isVisible('text=Paso 1 de 3'));
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'introDump', 'en el ordenador el cursor va al campo');
    // Volver atrás no pierde nada; el borrador se conserva al rehacer la vista.
    await page.fill('#introDump', 'Ordenar el escritorio\n- Pedir cita con el médico a las 17');
    await page.click('[data-action="intro-back"]');
    await page.click('#introNext');
    assert.equal(await page.inputValue('#introDump'), 'Ordenar el escritorio\n- Pedir cita con el médico a las 17');
    await page.fill('#introDump', 'Ordenar el escritorio\n- Pedir cita con el médico a las 17\n\nPreparar la presentación\nResponder un correo pendiente');
    await page.click('#introNext');
    await page.waitForSelector('.toast:has-text("4 ideas fuera de tu cabeza (1 con aviso)")');
    let { state } = await data();
    assert.deepEqual(state.tasks.map(t => t.title), ['Ordenar el escritorio', 'Pedir cita con el médico', 'Preparar la presentación', 'Responder un correo pendiente']);
    assert.ok(state.tasks.every(t => t.list === 'Bandeja'), 'todo a la Bandeja, sin ordenar');
    assert.equal(new Date(state.tasks[1].remindAt).getHours(), 17, 'la hora escrita se entiende');
    // Recargar a medias: sigue en el mismo paso, con lo ya guardado.
    await page.reload();
    await page.waitForSelector('#introForm');
    assert.ok(await page.isVisible('text=Paso 2 de 3'), 'retoma donde se quedó');
    assert.equal(await page.$$eval('.intro-chips .chip-btn', els => els.length), 4);
    // Paso 2: lo más pequeño. Elegir un chip, cambiar de idea al volver y escribir otra cosa.
    await page.click('.intro-chips .chip-btn:has-text("Ordenar el escritorio")');
    assert.equal(await page.getAttribute('.intro-chips .chip-btn:has-text("Ordenar el escritorio")', 'aria-pressed'), 'true');
    await page.click('#introNext');
    state = (await data()).state;
    assert.ok(state.tasks.find(t => t.title === 'Ordenar el escritorio').today, 'el chip elegido va al foco');
    assert.equal(state.tasks.find(t => t.title === 'Ordenar el escritorio').list, 'Personal', 'y sale de la Bandeja');
    await page.click('[data-action="intro-back"]');
    assert.equal(await page.getAttribute('.intro-chips .chip-btn:has-text("Ordenar el escritorio")', 'aria-pressed'), 'true');
    await page.fill('#introSmall', 'Beber un vaso de agua');
    assert.equal(await page.getAttribute('.intro-chips .chip-btn:has-text("Ordenar el escritorio")', 'aria-pressed'), 'false', 'escribir sustituye al chip');
    await page.click('#introNext');
    state = (await data()).state;
    const water = state.tasks.find(t => t.title === 'Beber un vaso de agua');
    assert.ok(water && water.today && water.energy === 'low' && water.minutes === 5, 'lo escrito va al foco de hoy');
    const desk0 = state.tasks.find(t => t.title === 'Ordenar el escritorio');
    assert.equal(desk0.today, false, 'la elección anterior deja el foco');
    assert.equal(desk0.list, 'Bandeja', 'y vuelve a su lista');
    // Atrás hasta el paso 1: recuerda lo guardado en vez de mostrar el cuadro vacío.
    await page.click('[data-action="intro-back"]');
    await page.click('[data-action="intro-back"]');
    assert.ok(await page.isVisible('text=Ya guardé en la Bandeja: «Ordenar el escritorio»'));
    assert.equal((await page.textContent('#introNext')).trim(), 'Añadir y seguir');
    await page.click('#introNext');
    await page.click('#introNext');
    assert.equal((await data()).state.tasks.length, 5, 'pasar de largo no duplica nada');
    // Paso 3: una rutina diaria con su hora (el selector de iOS solo avisa con `change`).
    assert.ok(await page.isVisible('text=Paso 3 de 3'));
    await page.fill('#introRoutine', 'Tomar la medicación');
    await page.evaluate(() => {
      const el = document.getElementById('introTime');
      el.value = '08:30';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.click('#introNext');
    state = (await data()).state;
    const meds = state.tasks.find(t => t.title === 'Tomar la medicación');
    assert.equal(meds.repeat, 'daily');
    assert.equal(new Date(meds.remindAt).getHours(), 8);
    assert.equal(new Date(meds.remindAt).getMinutes(), 30);
    assert.ok(Date.parse(meds.remindAt) > Date.now());
    // Resumen final con lo creado y cómo se usa; terminar da la primera estrella.
    assert.ok(await page.isVisible('text=4 ideas en la'));
    assert.ok(await page.isVisible('text=1 aviso programado: «Pedir cita con el médico»'));
    assert.ok(await page.isVisible('text=«Beber un vaso de agua» en tu'));
    assert.ok(await page.isVisible('text=cada día a las 08:30'));
    await shot('00-bienvenida-final');
    await page.click('#introNext');
    state = (await data()).state;
    assert.equal(state.settings.introDone, true);
    assert.equal(state.settings.intro, undefined);
    assert.equal(state.stars, 1);
    assert.equal(state.log.filter(e => e.kind === 'win').length, 1);
    assert.ok(await page.isVisible('#captureInput'));
    assert.ok(await page.isVisible('#hello-h'));
    assert.match(await page.textContent('#hello-date'), /· Ana$/);
    await page.reload();
    await page.waitForTimeout(300);
    assert.ok(await page.isHidden('#introForm'), 'no vuelve a salir');
    // Repetirla desde Ajustes no regala otra estrella ni miente sobre la lista.
    await page.click('#settingsBtn');
    await page.click('[data-action="intro-again"]');
    await page.waitForSelector('#introForm');
    assert.ok(await page.isHidden('#introName'), 'ya tiene nombre: no lo vuelve a pedir');
    for (let i = 0; i < 4; i++) await page.click('#introNext');
    assert.ok(await page.isVisible('text=No añadí nada nuevo'));
    assert.ok(await page.isVisible('text=Un repaso nunca sobra'));
    await page.click('#introNext');
    state = (await data()).state;
    assert.equal(state.stars, 1, 'la estrella de empezar es una sola');
    assert.equal(state.log.filter(e => e.kind === 'win').length, 1);
    // «Saltar» la cierra sin tocar nada.
    await page.click('#settingsBtn');
    await page.click('[data-action="intro-again"]');
    await page.waitForSelector('#introForm');
    await page.click('[data-action="intro-skip"]');
    state = (await data()).state;
    assert.equal(state.settings.introDone, true);
    assert.equal(state.tasks.length, 6);
    assert.equal(state.stars, 1, 'saltar no regala estrellas');
  });

  await step('batería baja sugiere una tarea fácil con su motivo', async () => {
    await page.click('#batt-low');
    assert.equal((await page.textContent('.suggestion .s-title')).trim(), 'Beber un vaso de agua');
    assert.match(await page.textContent('.suggestion .s-why'), /pide poca energía/);
    await shot('01-hoy');
  });

  await step('captura con lenguaje natural y tiempo relativo', async () => {
    await page.fill('#captureInput', 'Sacar la ropa en 45 min');
    await page.press('#captureInput', 'Enter');
    const { state } = await data();
    const t = state.tasks[state.tasks.length - 1];
    assert.equal(t.title, 'Sacar la ropa');
    const mins = Math.round((Date.parse(t.remindAt) - Date.now()) / 60000);
    assert.ok(mins >= 43 && mins <= 45, `aviso en ${mins} min`);
  });

  await step('pasos y tareas dan estrellas; deshacer recupera lo borrado', async () => {
    await page.click('[data-tab="tareas"]');
    const desk = (await data()).state.tasks.find(t => t.title === 'Ordenar el escritorio');
    await page.click(`#t-exp-${desk.id}`);
    await page.fill(`#step-in-${desk.id}`, 'Tirar lo que sea basura');
    await page.press(`#step-in-${desk.id}`, 'Enter');
    await page.click(`[data-id="${desk.id}"] [data-action="step-toggle"]`);
    const water = (await data()).state.tasks.find(t => t.title === 'Beber un vaso de agua');
    await page.click(`#t-chk-${water.id}`);
    assert.equal((await data()).state.stars, 1 + 1 + 2, 'bienvenida + paso + tarea fácil');
    await shot('02-tareas');
    await page.click(`[data-id="${desk.id}"] [data-action="delete"]`);
    assert.equal((await data()).state.tasks.length, 6);
    await page.click('.toast-btn:text("Deshacer")');
    assert.equal((await data()).state.tasks.length, 7);
  });

  await step('vaciar la cabeza crea varias tareas en la Bandeja', async () => {
    await page.click('#tool-dump');
    await page.fill('#dumpText', '- Comprar pan\n- Llamar al banco mañana a las 10\n\nRegar las plantas');
    await page.click('#dumpForm button[type="submit"]');
    const { state } = await data();
    const titles = state.tasks.map(t => t.title);
    assert.ok(['Comprar pan', 'Llamar al banco', 'Regar las plantas'].every(x => titles.includes(x)));
    assert.ok(state.tasks.find(t => t.title === 'Llamar al banco').remindAt);
  });

  await step('las rutinas se añaden con pasos y repetición', async () => {
    await page.click('#tool-tpl');
    await page.click('.template:has-text("Rutina de mañana")');
    const t = (await data()).state.tasks.find(x => x.title === 'Rutina de mañana');
    assert.equal(t.steps.length, 5);
    assert.equal(t.repeat, 'daily');
  });

  await step('la búsqueda filtra sin importar las tildes', async () => {
    await page.click('#flt-all');
    await page.fill('#taskSearch', 'medico');
    const rows = await page.$$eval('.groups .task .task-title', els => els.map(e => e.textContent.trim()));
    assert.deepEqual(rows, ['Pedir cita con el médico']);
    await page.fill('#taskSearch', '');
  });

  await step('enfoque: cuenta atrás y ruido marrón', async () => {
    await page.click('[data-tab="enfoque"]');
    await page.click('[data-action="focus-preset"][data-min="5"]');
    await page.click('#focusMain');
    await page.waitForTimeout(1200);
    assert.match(await page.textContent('#focusTime'), /^04:5\d$/);
    assert.match(await page.title(), /· Pasito$/);
    await page.click('#noiseBtn');
    assert.equal(await page.getAttribute('#noiseBtn', 'aria-pressed'), 'true');
    await shot('03-enfoque');
    await page.click('#noiseBtn');
  });

  await step('anotar un logro fuera de la lista', async () => {
    await page.click('[data-tab="logros"]');
    const before = (await data()).state.stars;
    await page.fill('#winInput', 'Contesté un correo difícil');
    await page.press('#winInput', 'Enter');
    assert.equal((await data()).state.stars, before + 1);
    assert.ok(await page.isVisible('.done-list >> text=Contesté un correo difícil'));
    await shot('04-logros');
  });

  await step('aviso vencido: aparece, se pospone, e insiste si no se atiende', async () => {
    await page.evaluate(() => {
      const meta = JSON.parse(localStorage.getItem('pasito-perfiles'));
      const key = `pasito-v1:${meta.active}`;
      const s = JSON.parse(localStorage.getItem(key));
      const t = s.tasks.find(x => x.title === 'Responder un correo pendiente');
      t.remindAt = new Date(Date.now() - 60000).toISOString();
      t.notified = false;
      localStorage.setItem(key, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForTimeout(400);
    assert.ok(await page.isVisible('#reminder'));
    assert.equal((await page.textContent('#remTitle')).trim(), 'Responder un correo pendiente');
    let t = (await data()).state.tasks.find(x => x.title === 'Responder un correo pendiente');
    assert.ok(t.nagAt, 'programa la insistencia');
    await shot('05-aviso');
    await page.click('[data-action="rem-snooze"][data-min="10"]');
    t = (await data()).state.tasks.find(x => x.title === 'Responder un correo pendiente');
    assert.equal(t.nagAt, null);
    assert.equal(t.notified, false);
    assert.ok(await page.isHidden('#reminder'));
  });

  await step('perfiles: crear, separar datos, solo avisa el perfil elegido, volver y borrar', async () => {
    const firstId = (await data()).meta.active;
    await page.click('#profileBtn');
    await page.fill('#pnName', 'Trabajo');
    await page.click('#pn-c1');
    await page.uncheck('#pnIntro');
    await page.click('#profileNewForm button[type="submit"]');
    let { meta, state } = await data();
    assert.equal(meta.list.length, 2);
    assert.equal(meta.list.find(p => p.id === meta.active).name, 'Trabajo');
    assert.equal(state.tasks.length, 0, 'perfil nuevo vacío');
    assert.equal((await page.textContent('#profileName')).trim(), 'Trabajo');
    assert.match(await page.textContent('#hello-date'), /· Trabajo$/);

    await page.fill('#captureInput', 'Preparar informe');
    await page.press('#captureInput', 'Enter');
    assert.equal((await data()).state.tasks.length, 1);

    const workId = meta.active;
    const overdue = (pid, title) => page.evaluate(([id, ttl]) => {
      const key = `pasito-v1:${id}`;
      const st = JSON.parse(localStorage.getItem(key));
      const t = st.tasks.find(x => x.title === ttl);
      t.remindAt = new Date(Date.now() - 30000).toISOString();
      t.notified = false;
      localStorage.setItem(key, JSON.stringify(st));
    }, [pid, title]);
    const wake = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const taskIn = async (pid, title) => JSON.parse(await page.evaluate(id => localStorage.getItem(`pasito-v1:${id}`), pid)).tasks.find(x => x.title === title);

    // Por defecto solo avisa el perfil abierto: un aviso vencido de «Ana» (el primer perfil) no suena estando en «Trabajo».
    assert.equal((await data()).meta.notify, 'active');
    await overdue(firstId, 'Pedir cita con el médico');
    await wake();
    await page.waitForTimeout(200);
    assert.ok(await page.isHidden('#reminder'), '«Ana» está en silencio');
    assert.equal((await taskIn(firstId, 'Pedir cita con el médico')).notified, false, 'queda pendiente para cuando se abra');
    assert.ok(await page.isHidden('#profileMute'));

    // Elegimos que avise siempre «Ana»: su aviso llega aunque esté abierto «Trabajo», y «Trabajo» queda en silencio.
    await page.click('#profileBtn');
    await page.check(`#nt-${firstId}`);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#reminder:has-text("Aviso para")');
    assert.equal((await page.textContent('#remTitle')).trim(), 'Pedir cita con el médico');
    assert.match(await page.textContent('#reminder .eyebrow'), /Ana/);
    assert.ok(await page.isVisible('#profileMute'), 'la cabecera muestra que «Trabajo» está en silencio');
    assert.ok(await page.isVisible('#notifyHere'));
    await shot('06-perfil-trabajo');

    // Posponer desde aquí cambia la tarea de «Yo».
    await page.click('[data-action="ext-snooze"][data-min="10"]');
    const snoozed = await taskIn(firstId, 'Pedir cita con el médico');
    const mins = Math.round((Date.parse(snoozed.remindAt) - Date.now()) / 60000);
    assert.ok(mins >= 9 && mins <= 10, `pospuesto ${mins} min`);
    assert.equal(snoozed.notified, false);
    assert.ok(await page.isHidden('#reminder'));

    // Una rutina diaria de «Yo» hecha ayer vuelve a sonar hoy aunque esté abierto «Trabajo».
    await page.evaluate(id => {
      const key = `pasito-v1:${id}`;
      const st = JSON.parse(localStorage.getItem(key));
      const t = st.tasks.find(x => x.title === 'Responder un correo pendiente');
      Object.assign(t, { repeat: 'daily', done: true, doneAt: new Date(Date.now() - 86400000).toISOString(), remindAt: new Date(Date.now() - 30000).toISOString(), notified: false });
      localStorage.setItem(key, JSON.stringify(st));
    }, firstId);
    await wake();
    await page.waitForSelector('#reminder:has-text("Responder un correo pendiente")');
    assert.equal((await taskIn(firstId, 'Responder un correo pendiente')).done, false);
    await page.click('[data-action="ext-close"]');

    // Si la terminan en otra pestaña, la tarjeta desaparece y no se puede posponer una tarea ya hecha.
    await overdue(firstId, 'Preparar la presentación');
    await wake();
    await page.waitForSelector('#reminder:has-text("Preparar la presentación")');
    await page.evaluate(id => {
      const key = `pasito-v1:${id}`;
      const st = JSON.parse(localStorage.getItem(key));
      st.tasks.find(x => x.title === 'Preparar la presentación').done = true;
      const value = JSON.stringify(st);
      localStorage.setItem(key, value);
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: value }));
    }, firstId);
    await page.waitForSelector('#reminder', { state: 'hidden' });

    // En un perfil en silencio no se promete «Te aviso».
    await page.fill('#captureInput', 'Llamar al cliente en 20 min');
    await page.press('#captureInput', 'Enter');
    assert.ok(await page.isVisible('.toast:has-text("está en silencio")'));
    // Distingue mayúsculas: el aviso de posponer dice «te aviso» y es correcto.
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.toast')].some(t => t.textContent.includes('Te aviso'))), false);

    // Las tareas de «Trabajo» no suenan mientras está en silencio.
    await overdue(workId, 'Preparar informe');
    await page.reload();
    await page.waitForTimeout(400);
    assert.ok(await page.isHidden('#reminder'), '«Trabajo» no suena');
    assert.equal((await taskIn(workId, 'Preparar informe')).notified, false);

    // «Ir a Yo» cambia de perfil y muestra el aviso completo.
    await overdue(firstId, 'Pedir cita con el médico');
    await wake();
    await page.waitForSelector('#reminder:has-text("Aviso para")');
    await shot('06b-aviso-de-otro-perfil');
    await page.click('[data-action="ext-go"]');
    ({ meta, state } = await data());
    assert.equal(meta.active, firstId);
    assert.ok(state.tasks.length > 5, 'el primer perfil conserva sus tareas');
    assert.equal((await page.textContent('#remTitle')).trim(), 'Pedir cita con el médico');
    assert.equal(await page.getAttribute('#reminder', 'data-id'), state.tasks.find(x => x.title === 'Pedir cita con el médico').id);

    // Salir del perfil que avisa con su aviso en pantalla: el aviso sigue, ahora como «Aviso para Yo».
    await page.click('#profileBtn');
    await page.click(`#pp-${workId}`);
    await page.waitForSelector('#reminder:has-text("Aviso para")');
    assert.equal((await page.textContent('#remTitle')).trim(), 'Pedir cita con el médico');
    await page.click('[data-action="ext-go"]');
    assert.equal((await data()).meta.active, firstId);
    await page.click('[data-action="rem-close"]');
    assert.ok(await page.isHidden('#profileMute'));

    // Pasar con las flechas por las opciones no hace sonar ni «gasta» los avisos de los perfiles por los que se pasa.
    assert.equal((await taskIn(workId, 'Preparar informe')).notified, false);
    await page.click('#profileBtn');
    await page.focus('#nt-active');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    assert.equal((await data()).meta.notify, firstId);
    assert.equal((await taskIn(workId, 'Preparar informe')).notified, false, '«Trabajo» no se dio por avisado');

    // Borrar el perfil elegido vuelve a «el que esté abierto»; deshacer lo recupera todo, también la elección.
    await page.click('#profileBtn');
    await page.check(`#nt-${workId}`);
    assert.ok(await page.isVisible(`.bell-badge[data-pid="${workId}"]`));
    assert.ok(await page.isHidden(`.bell-badge[data-pid="${firstId}"]`));
    await shot('07-perfiles');
    await page.click(`#pe-${workId}`);
    await page.click('[data-action="profile-delete-ask"]');
    await page.click('[data-action="profile-delete"]');
    assert.equal((await data()).meta.list.length, 1);
    assert.equal((await data()).meta.notify, 'active');
    assert.ok(await page.isHidden('#profileMute'), 'tras borrar el perfil elegido, el abierto deja de estar en silencio');
    assert.equal(await exists('#notifyHere'), false);
    await page.click('.toast:has-text("borrado") .toast-btn');
    ({ meta } = await data());
    assert.equal(meta.list.length, 2);
    assert.equal(meta.notify, workId);
    assert.equal(JSON.parse(await page.evaluate(id => localStorage.getItem(`pasito-v1:${id}`), workId)).tasks.length, 2, '«Preparar informe» y «Llamar al cliente»');
    await page.check('#nt-active');
    await page.keyboard.press('Escape');
    assert.equal((await data()).meta.notify, 'active');
  });

  await step('foto de perfil: elegir, recortar, deshacer, rechazar archivos malos y crear con foto', async () => {
    if (await page.isHidden('#sheet')) await page.click('#profileBtn');
    const id = (await data()).meta.active;
    const photoOf = async pid => (await data()).meta.list.find(p => p.id === pid).photo;
    await page.click(`#pe-${id}`);
    await page.setInputFiles('#pe-photo', path.join(ROOT, 'icon-512.png'));
    await page.waitForSelector('#profileAvatar img');
    const photo = await photoOf(id);
    assert.match(photo, /^data:image\/jpeg;base64,/);
    assert.ok(photo.length < 150000, `foto de ${photo.length} caracteres`);
    const dims = await page.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = src; }), photo);
    assert.deepEqual(dims, [192, 192]);
    assert.ok(await page.isVisible('#pe-preview img'));
    assert.ok(await page.isVisible('#pe-photo-del'));
    await shot('10-foto');

    await page.click('.toast:has-text("Foto de perfil guardada") .toast-btn');
    assert.equal(await photoOf(id), undefined);
    assert.equal(await exists('#profileAvatar img'), false);

    await page.setInputFiles('#pe-photo', { name: 'nota.png', mimeType: 'image/png', buffer: Buffer.from('no soy una imagen') });
    await page.waitForSelector('.toast:has-text("No pude leer esa imagen")');
    assert.equal(await photoOf(id), undefined);
    await page.setInputFiles('#pe-photo', { name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    assert.equal(await photoOf(id), undefined);

    await page.setInputFiles('#pe-photo', path.join(ROOT, 'icon-512.png'));
    await page.waitForSelector('#profileAvatar img');
    await page.focus('#pe-photo-del');
    await page.keyboard.press('Enter');
    assert.equal(await photoOf(id), undefined);
    assert.equal(await exists('#profileAvatar img'), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pe-pick', 'el foco sigue dentro de la hoja');

    // «Cancelar» deja la foto como estaba al abrir el editor (aquí, sin foto).
    await page.setInputFiles('#pe-photo', path.join(ROOT, 'icon-512.png'));
    await page.waitForSelector('#profileAvatar img');
    await page.click('[data-action="profile-edit-cancel"]');
    assert.equal(await photoOf(id), undefined);
    assert.equal(await exists('#profileAvatar img'), false);

    // Crear sin esperar a que se vea la vista previa: el perfil se crea igual con su foto.
    await page.fill('#pnName', 'Ana');
    assert.equal((await page.textContent('#pn-preview')).trim(), 'A');
    await page.setInputFiles('#pn-photo', path.join(ROOT, 'icon-512.png'));
    await page.click('#profileNewForm button[type="submit"]');
    await page.waitForSelector('#profileAvatar img');
    assert.ok(await page.isVisible('#introForm'), 'el perfil nuevo empieza con la bienvenida');
    assert.ok(await page.isHidden('#introName'), 'sin pedir el nombre otra vez');
    await page.click('[data-action="intro-skip"]');
    const after = await data();
    assert.equal(after.meta.list.find(p => p.id === after.meta.active).name, 'Ana');
    assert.match(await photoOf(after.meta.active), /^data:image\/jpeg/);
    assert.ok(await page.isVisible('#profileAvatar img'));

    // Una foto manipulada en el almacenamiento no llega al src.
    await page.evaluate(() => {
      const m = JSON.parse(localStorage.getItem('pasito-perfiles'));
      m.list[0].photo = 'javascript:alert(1)';
      m.active = m.list[0].id;
      localStorage.setItem('pasito-perfiles', JSON.stringify(m));
    });
    await page.reload();
    await page.waitForTimeout(300);
    assert.equal(await exists('#profileAvatar img'), false);
  });

  await step('foto con almacenamiento lleno o bloqueado: avisos claros y nada se rompe', async () => {
    const run = async (initScript, expectPhotoShown, expectedToast) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pg = await ctx.newPage();
      pg.on('pageerror', e => errors.push(e.message));
      await pg.addInitScript(initScript);
      await pg.goto(url);
      await pg.click('#profileBtn');
      await pg.click('[data-action="profile-edit"]');
      await pg.setInputFiles('#pe-photo', path.join(ROOT, 'icon-512.png'));
      await pg.waitForSelector(expectPhotoShown ? '#profileAvatar img' : `.toast:has-text("${expectedToast}")`);
      assert.equal(await exists('#profileAvatar img', pg), expectPhotoShown);
      if (!expectPhotoShown) {
        // Perfil nuevo con foto cuando no cabe: se crea sin ella y el aviso se ve después de cambiar.
        await pg.click('[data-action="profile-edit-cancel"]');
        await pg.fill('#pnName', 'Leo');
        await pg.setInputFiles('#pn-photo', path.join(ROOT, 'icon-192.png'));
        await pg.waitForSelector('#pn-preview img');
        await pg.click('#profileNewForm button[type="submit"]');
        await pg.waitForSelector('.toast:has-text("No quedaba espacio para la foto")');
        assert.equal((await pg.textContent('#profileName')).trim(), 'Leo');
        assert.equal(await exists('#profileAvatar img', pg), false);
      }
      await ctx.close();
    };
    // Lleno: solo fallan las escrituras que llevan una foto.
    await run(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(v).includes('data:image')) throw new DOMException('lleno', 'QuotaExceededError');
        return orig.call(this, k, v);
      };
    }, false, 'No queda espacio');
    // Bloqueado: nada se guarda (la app ya lo avisó al abrir), pero la foto se ve mientras esté abierta.
    await run(() => {
      Storage.prototype.setItem = function () { throw new DOMException('bloqueado', 'SecurityError'); };
    }, true, null);
  });

  await step('avisos con la app cerrada: conectar, programar, enviar, mostrar y aplicar «Hecha» o descartar', async () => {
    const worker = (await import(pathToFileURL(path.join(ROOT, 'server', 'worker.js')).href)).default;
    const env = { PASITO: memoryKV() };
    const fake = await fakeSubscription();
    const origin = new URL(url).origin;
    const pushed = [];
    const realFetch = globalThis.fetch;
    const waitFor = async (fn, what) => {
      for (let i = 0; i < 80; i++) {
        if (await fn()) return;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error(`no ocurrió: ${what}`);
    };
    // El servicio de push (FCM) simulado: el Worker le envía los avisos cifrados.
    globalThis.fetch = async (u, init) => {
      pushed.push({ url: String(u), init });
      return new Response(null, { status: 201 });
    };
    try {
      await context.grantPermissions(['notifications'], { origin });
      // El servidor de avisos real (server/worker.js) atiende las peticiones de la página.
      await page.route('https://avisos.test/**', async route => {
        const req = route.request();
        const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method());
        const res = await worker.fetch(new Request(req.url(), { method: req.method(), headers: req.headers(), body: hasBody ? req.postData() || '' : undefined }), env);
        await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
      });
      // Chromium de pruebas no tiene servicio de push: la suscripción se simula con claves que la prueba conoce.
      await page.addInitScript(sub => {
        const KEY = '__fakePushKey';
        const make = key => ({
          endpoint: sub.endpoint,
          options: { applicationServerKey: key },
          toJSON: () => ({ endpoint: sub.endpoint, expirationTime: null, keys: sub.keys }),
          unsubscribe: async () => { localStorage.removeItem(KEY); return true; },
        });
        PushManager.prototype.subscribe = async function (opts) {
          const k = new Uint8Array(opts.applicationServerKey);
          localStorage.setItem(KEY, JSON.stringify(Array.from(k)));
          return make(k.buffer);
        };
        PushManager.prototype.getSubscription = async function () {
          const saved = localStorage.getItem(KEY);
          return saved ? make(new Uint8Array(JSON.parse(saved)).buffer) : null;
        };
      }, fake.subscription);
      await page.reload();
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

      await page.fill('#captureInput', 'Probar aviso push en 30 min');
      await page.press('#captureInput', 'Enter');
      await page.click('#settingsBtn');
      await page.fill('#pushApi', 'avisos.test/'); // sin https ni barra final: se corrige solo
      await page.click('#pushConnect');
      await page.waitForSelector('.toast:has-text("Teléfono conectado")');
      const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('pasito-push')));
      assert.equal(cfg.api, 'https://avisos.test');
      assert.match(cfg.deviceId, /^[a-f0-9]{32}$/);
      const docKey = `dev:${cfg.deviceId}`;
      const mine = (await env.PASITO.get(docKey, 'json')).reminders.filter(r => r.title === 'Probar aviso push');
      assert.deepEqual(mine.map(r => r.nag), [0, 1, 2], 'aviso y dos insistencias programados en el servidor');
      assert.ok(await page.isVisible('#pushBox >> text=Conectado'));
      await shot('11-avisos-telefono');

      // A su hora, el cron envía el aviso cifrado al servicio de push.
      const pending = [];
      await worker.scheduled({ scheduledTime: mine[0].at + 1000 }, env, { waitUntil: p => pending.push(p) });
      await Promise.all(pending);
      const sent = pushed.filter(x => x.url === fake.subscription.endpoint);
      assert.equal(sent.length, 1);
      const payload = (await decrypt(sent[0].init.body, fake)).json;
      assert.equal(payload.title, 'Probar aviso push');
      assert.equal(payload.api, 'https://avisos.test');
      assert.equal(payload.device, cfg.deviceId);

      // Con Pasito cerrada, el service worker muestra la notificación con «Hecha» y «En 10 min».
      const cdp = await context.newCDPSession(page);
      const regs = [];
      cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations));
      await cdp.send('ServiceWorker.enable');
      await page.waitForTimeout(300);
      const reg = regs.find(r => !r.isDeleted && r.scopeURL.startsWith(origin));
      assert.ok(reg, 'service worker registrado');
      await page.goto('about:blank');
      await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: reg.registrationId, data: JSON.stringify(payload) });
      await page.waitForTimeout(500);
      await page.goto(url);
      const notes = await page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications())
        .map(n => ({ title: n.title, body: n.body, tag: n.tag, actions: (n.actions || []).map(a => a.action).join() })));
      assert.ok(notes.some(n => n.title === 'Probar aviso push' && n.tag === payload.tag && n.actions === 'done,snooze'), JSON.stringify(notes));

      // «Hecha» en la notificación: el service worker lo deja en cola y Pasito lo aplica al volver, con sus estrellas.
      const before = (await data()).state.stars;
      const queue = action => page.evaluate(a => new Promise((resolve, reject) => {
        const req = indexedDB.open('pasito-sw', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('actions', { autoIncrement: true });
        req.onsuccess = () => {
          const tx = req.result.transaction('actions', 'readwrite');
          tx.objectStore('actions').add(a);
          tx.oncomplete = () => { req.result.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }), action);
      await queue({ type: 'done', pid: payload.pid, taskId: payload.taskId, at: Date.now() });
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await waitFor(async () => (await data()).state.tasks.find(t => t.id === payload.taskId).done, 'la tarea queda hecha');
      assert.equal((await data()).state.stars, before + 3);
      await waitFor(async () => !(await env.PASITO.get(docKey, 'json')).reminders.some(r => r.taskId === payload.taskId), 'el servidor deja de tenerla programada');

      // Descartar la notificación ya sonada: cuenta como atendida, sin insistencias en la app ni en el servidor.
      await page.fill('#captureInput', 'Descartar aviso push en 40 min');
      await page.press('#captureInput', 'Enter');
      const other = (await data()).state.tasks.find(t => t.title === 'Descartar aviso push');
      await waitFor(async () => (await env.PASITO.get(docKey, 'json')).reminders.some(r => r.taskId === other.id), 'el servidor programa la segunda');
      await queue({ type: 'dismiss', pid: payload.pid, taskId: other.id, at: Date.parse(other.remindAt) + 1000 });
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await waitFor(async () => (await data()).state.tasks.find(t => t.id === other.id).notified, 'descartar la da por atendida');
      assert.equal((await data()).state.tasks.find(t => t.id === other.id).nagAt, null);
      await waitFor(async () => !(await env.PASITO.get(docKey, 'json')).reminders.some(r => r.taskId === other.id), 'el servidor quita sus avisos');

      // Desconectar borra el dispositivo del servidor.
      await page.click('#settingsBtn');
      await page.click('#pushOff');
      await waitFor(async () => (await env.PASITO.get(docKey, 'json')) === null, 'el servidor olvida el dispositivo');
      await page.waitForSelector('#pushConnect');
      assert.equal(await page.evaluate(() => localStorage.getItem('__fakePushKey')), null, 'suscripción cancelada');
      await page.keyboard.press('Escape');
    } finally {
      globalThis.fetch = realFetch;
      await page.unroute('https://avisos.test/**');
    }
  });

  await step('modo oscuro y ancho de móvil pequeño sin desbordes', async () => {
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 360, height: 780 });
    for (const tab of ['hoy', 'tareas', 'enfoque', 'logros']) {
      await page.click(`[data-tab="${tab}"]`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `desborde horizontal en ${tab}`);
    }
    await page.click('[data-tab="hoy"]');
    await shot('08-hoy-oscuro');
    await page.click('#settingsBtn');
    await shot('09-ajustes-oscuro');
    // La bienvenida, en estrecho y oscuro: chips largos y la fila «Qué / A qué hora» sin desbordes.
    await page.click('[data-action="intro-again"]');
    await page.waitForSelector('#introForm');
    await page.click('#introNext');
    await page.fill('#introDump', 'Revisar https://ejemplo.invalid/una-direccion-larguisima-sin-espacios-que-no-cabe-en-una-linea');
    await page.click('#introNext');
    for (const n of [2, 3]) {
      assert.ok(await page.isVisible(`text=Paso ${n} de 3`));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `desborde horizontal en la bienvenida, paso ${n}`);
      if (n === 2) {
        await shot('10-bienvenida-oscuro');
        await page.click('#introNext');
      }
    }
    await page.click('[data-action="intro-skip"]');
  });

  await step('sin errores de JavaScript', async () => {
    assert.deepEqual(errors, []);
  });

  await browser.close();
  server.close();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
