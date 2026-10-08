// Prueba de extremo a extremo en un navegador real (Chromium con Playwright).
// Uso: npm run test:e2e   (necesita Playwright: npm i -D playwright && npx playwright install chromium)
// Variables opcionales: PLAYWRIGHT_MODULE (ruta al paquete), SHOTS_DIR (carpeta para capturas).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

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
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
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
      console.log(`not ok - ${name}\n  ${e.message.split('\n')[0]}`);
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

  await step('primer uso con tareas de ejemplo', async () => {
    const { state } = await data();
    assert.equal(state.tasks.length, 5);
    assert.ok(await page.isVisible('text=Borrar ejemplos'));
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
    await page.click(`[data-id="${desk.id}"] [data-action="step-toggle"]`);
    const water = (await data()).state.tasks.find(t => t.title === 'Beber un vaso de agua');
    await page.click(`#t-chk-${water.id}`);
    assert.equal((await data()).state.stars, 3);
    await shot('02-tareas');
    await page.click(`[data-id="${desk.id}"] [data-action="delete"]`);
    assert.equal((await data()).state.tasks.length, 5);
    await page.click('.toast-btn:text("Deshacer")');
    assert.equal((await data()).state.tasks.length, 6);
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

  await step('perfiles: crear, separar datos, avisos cruzados, volver y borrar', async () => {
    const firstId = (await data()).meta.active;
    await page.click('#profileBtn');
    await page.fill('#pnName', 'Trabajo');
    await page.click('#pn-c1');
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

    // Un aviso vencido del otro perfil llega como toast con su nombre.
    await page.evaluate(id => {
      const key = `pasito-v1:${id}`;
      const s = JSON.parse(localStorage.getItem(key));
      const t = s.tasks.find(x => x.title === 'Pedir cita con el médico');
      t.remindAt = new Date(Date.now() - 30000).toISOString();
      t.notified = false;
      localStorage.setItem(key, JSON.stringify(s));
    }, firstId);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(200);
    assert.ok(await page.isVisible('.toast >> text=Aviso para Yo: Pedir cita con el médico'));
    await shot('06-perfil-trabajo');

    await page.click('#profileBtn');
    await shot('07-perfiles');
    await page.click(`#pp-${firstId}`);
    ({ meta, state } = await data());
    assert.equal(meta.active, firstId);
    assert.ok(state.tasks.length > 5, 'el primer perfil conserva sus tareas');

    const workId = meta.list.find(p => p.name === 'Trabajo').id;
    await page.click('#profileBtn');
    await page.click(`#pe-${workId}`);
    await page.click('[data-action="profile-delete-ask"]');
    await page.click('[data-action="profile-delete"]');
    assert.equal((await data()).meta.list.length, 1);
    await page.click('.toast-btn:text("Deshacer")');
    assert.equal((await data()).meta.list.length, 2);
    assert.equal(JSON.parse(await page.evaluate(id => localStorage.getItem(`pasito-v1:${id}`), workId)).tasks.length, 1);
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
    assert.equal(await page.$('#profileAvatar img'), null);

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
    assert.equal(await page.$('#profileAvatar img'), null);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pe-pick', 'el foco sigue dentro de la hoja');

    // «Cancelar» deja la foto como estaba al abrir el editor (aquí, sin foto).
    await page.setInputFiles('#pe-photo', path.join(ROOT, 'icon-512.png'));
    await page.waitForSelector('#profileAvatar img');
    await page.click('[data-action="profile-edit-cancel"]');
    assert.equal(await photoOf(id), undefined);
    assert.equal(await page.$('#profileAvatar img'), null);

    // Crear sin esperar a que se vea la vista previa: el perfil se crea igual con su foto.
    await page.fill('#pnName', 'Ana');
    assert.equal((await page.textContent('#pn-preview')).trim(), 'A');
    await page.setInputFiles('#pn-photo', path.join(ROOT, 'icon-512.png'));
    await page.click('#profileNewForm button[type="submit"]');
    await page.waitForSelector('#profileAvatar img');
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
    assert.equal(await page.$('#profileAvatar img'), null);
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
      assert.equal(!!(await pg.$('#profileAvatar img')), expectPhotoShown);
      if (!expectPhotoShown) {
        // Perfil nuevo con foto cuando no cabe: se crea sin ella y el aviso se ve después de cambiar.
        await pg.click('[data-action="profile-edit-cancel"]');
        await pg.fill('#pnName', 'Leo');
        await pg.setInputFiles('#pn-photo', path.join(ROOT, 'icon-192.png'));
        await pg.waitForSelector('#pn-preview img');
        await pg.click('#profileNewForm button[type="submit"]');
        await pg.waitForSelector('.toast:has-text("No quedaba espacio para la foto")');
        assert.equal((await pg.textContent('#profileName')).trim(), 'Leo');
        assert.equal(await pg.$('#profileAvatar img'), null);
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
