/* Pasito: interfaz, guardado, recordatorios, temporizador de enfoque y recompensas. Usa logic.js (window.PasitoLogic). */
(() => {
  'use strict';

  const L = window.PasitoLogic;
  const KEY = 'pasito-v1';
  const MIN = 60000;
  const HOUR = 60 * MIN;
  // Dentro de un iframe (por ejemplo, la vista previa de claude.ai) no hay descargas ni service worker.
  const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  const INBOX = 'Bandeja';
  const TABS = ['hoy', 'tareas', 'enfoque', 'logros'];
  const ENERGY = { low: 'Baja', med: 'Media', high: 'Alta' };
  const REPEAT = { none: 'No repetir', daily: 'Cada día', weekdays: 'De lunes a viernes', weekly: 'Cada semana' };
  const MINUTES = [5, 10, 15, 25, 45, 60, 90, 120];
  const FOCUS_PRESETS = [5, 10, 15, 25, 45];
  const STARTERS = ['Preparar lo que necesito', 'Hacerlo solo 5 minutos', 'Revisar y darlo por terminado'];
  const BATTERY_HINT = {
    low: 'Batería baja: hoy valen las tareas pequeñas. Descansar también cuenta.',
    med: 'Batería media: buen momento para avanzar algo concreto.',
    high: 'Batería alta: aprovecha para lo que más te cuesta.',
  };

  const MSG = {
    done: [
      '¡Hecho! Eso cuenta, y mucho.', 'Una menos. Tu cerebro te lo agradece.', 'Terminar es una habilidad y la estás entrenando.',
      'Lo lograste. Tómate un segundo para notarlo.', '¡Toma! Otra victoria para hoy.', 'Pasito a pasito. Así se hace.',
      'Eso estaba ocupando espacio en tu cabeza. Ya no.',
    ],
    step: ['Un paso menos.', 'Avanzando. Cada paso suma.', 'Bien. El siguiente será más fácil.', 'Paso hecho. Sigue a tu ritmo.'],
    capture: ['Anotado. Ya no tienes que recordarlo.', 'Fuera de tu cabeza, dentro de la lista.', 'Guardado. Puedes ordenarlo luego.'],
    focusStart: ['Solo empieza. Lo demás viene después.', 'Un rato corto, nada más.', 'No hace falta hacerlo perfecto, solo hacerlo.'],
    focusMid: [
      'Vas bien. Sigue un poquito más.', 'Si te distrajiste, vuelve sin culpa. Eso también es enfocarse.',
      'Respira. Estás avanzando.', 'Ya llevas un buen rato. ¡Qué bien!',
    ],
    focusDone: ['¡Lo hiciste! Empezar era lo más difícil.', 'Tiempo cumplido. Muy bien hecho.', 'Sesión completa. Te ganaste un respiro.'],
    reminder: ['Un paso pequeño basta.', 'No tiene que ser perfecto.', 'Puedes hacerlo, aunque sea un poquito.'],
    welcomeBack: ['¡Qué bueno verte! Volver también cuenta.', 'Hola de nuevo. Hoy es buen día para un pasito.'],
    daily: [
      'No tienes que hacerlo todo. Solo lo siguiente.', 'Hecho es mejor que perfecto.', 'Tu valor no depende de tu lista de tareas.',
      'Empezar pequeño también es empezar.', 'Las tareas pendientes no son fracasos, son planes.', 'Descansar también es parte del plan.',
      'Si hoy cuesta, elige lo más pequeño.',
    ],
  };

  /* ---------- Utilidades ---------- */

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const pickDaily = arr => arr[Math.floor(Date.now() / L.DAY) % arr.length];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pad2 = n => String(n).padStart(2, '0');
  const todayKey = () => L.dayKey(Date.now());
  const byId = id => state.tasks.find(t => t.id === id);
  const joinEs = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  const minutesLabel = m => ({ 60: '1 hora', 90: '1 hora y media', 120: '2 horas' })[m] || `${m} min`;
  const vibrate = p => {
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* sin vibración */ }
  };

  const svg = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  const ICON = {
    check: svg('<path d="M5 12.5l4.2 4.2L19 7"/>'),
    star: svg('<path d="M12 3.6l2.55 5.2 5.75.83-4.16 4.05.98 5.72L12 16.7l-5.12 2.7.98-5.72L3.7 9.63l5.75-.83z"/>'),
    bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    repeat: svg('<path d="M4 11V9a3 3 0 0 1 3-3h11"/><path d="m15 3 3 3-3 3"/><path d="M20 13v2a3 3 0 0 1-3 3H6"/><path d="m9 21-3-3 3-3"/>'),
    steps: svg('<path d="M4 18h5v-5h5V8h6"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  };
  function battery(level) {
    const n = { low: 1, med: 2, high: 3 }[level] || 2;
    let bars = '';
    for (let i = 0; i < n; i++) bars += `<rect class="fill" x="${5 + i * 4.6}" y="9.5" width="3.4" height="5" rx=".8"/>`;
    return svg(`<rect x="2.5" y="7" width="17" height="10" rx="2.4"/><path d="M21.5 10.5v3"/>${bars}`, 'ico-batt');
  }

  /* ---------- Estado y guardado ---------- */

  function makeTask(fields) {
    return Object.assign({
      id: uid(), title: 'Sin nombre', notes: '', list: INBOX, energy: 'med', minutes: null,
      remindAt: null, repeat: 'none', today: false, steps: [], done: false, doneAt: null,
      notified: false, snoozes: 0, createdAt: new Date().toISOString(),
    }, fields);
  }

  function exampleTasks() {
    const at = new Date();
    at.setHours(17, 0, 0, 0);
    if (at <= Date.now()) at.setDate(at.getDate() + 1);
    const steps = list => list.map(text => ({ id: uid(), text, done: false }));
    return [
      makeTask({ title: 'Beber un vaso de agua', energy: 'low', minutes: 5, today: true, list: 'Personal', example: true }),
      makeTask({ title: 'Ordenar el escritorio', energy: 'med', minutes: 15, today: true, list: 'Casa', example: true, steps: steps(['Tirar lo que sea basura', 'Guardar 5 cosas', 'Limpiar la superficie']) }),
      makeTask({ title: 'Pedir cita con el médico', energy: 'med', minutes: 10, list: 'Personal', remindAt: at.toISOString(), example: true, steps: steps(['Buscar el número', 'Llamar', 'Apuntar la fecha en la agenda']) }),
      makeTask({ title: 'Preparar la presentación', energy: 'high', minutes: 45, list: 'Trabajo / estudio', example: true }),
      makeTask({ title: 'Responder un correo pendiente', energy: 'low', minutes: 10, example: true }),
    ];
  }

  function freshState(withExamples) {
    return {
      version: 1,
      lists: [INBOX, 'Personal', 'Casa', 'Trabajo / estudio'],
      tasks: withExamples ? exampleTasks() : [],
      log: [],
      stars: 0,
      battery: null,
      focus: { taskId: null, minutes: 15, lastMinutes: 15, isBreak: false, phase: 'idle', endAt: null, remaining: null, total: null },
      settings: { sound: true, calm: false, theme: 'system' },
      lastVisit: Date.now(),
    };
  }

  function normalize(data) {
    const base = freshState(false);
    const s = Object.assign(base, data);
    s.settings = Object.assign(freshState(false).settings, data.settings);
    s.focus = Object.assign(freshState(false).focus, data.focus);
    s.lists = Array.isArray(data.lists) && data.lists.length ? data.lists.slice() : freshState(false).lists;
    if (!s.lists.includes(INBOX)) s.lists.unshift(INBOX);
    s.log = Array.isArray(data.log) ? data.log : [];
    s.stars = Number(data.stars) || 0;
    s.tasks = (Array.isArray(data.tasks) ? data.tasks : []).map(t => {
      const task = makeTask(t);
      task.steps = Array.isArray(task.steps) ? task.steps : [];
      if (!s.lists.includes(task.list)) s.lists.push(task.list);
      return task;
    });
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* almacenamiento bloqueado o dañado: empezamos de cero */ }
    return freshState(true);
  }

  let state = load();
  let saveTimer = null;
  let storageWarned = false;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      if (!storageWarned) {
        storageWarned = true;
        toast('Este navegador no me deja guardar. Tus cambios se perderán al cerrar.');
      }
    }
  }
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  const ui = {
    tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'hoy',
    open: new Set(),
    filter: 'all',
    showDone: false,
    newList: false,
    suggesting: false,
    suggestId: null,
    skipped: new Set(),
    confirm: null,
    settings: false,
    reminderQueue: [],
    remNote: '',
    focusNote: '',
    focusDoneMsg: '',
    noteSlot: 0,
    justDone: null,
    renderDay: null,
  };

  /* ---------- Render ---------- */

  const view = $('view');

  function render() {
    const active = document.activeElement && document.activeElement.id;
    ui.renderDay = todayKey();
    $('todayLabel').textContent = L.fmtLongDate();
    document.querySelectorAll('[data-tab]').forEach(b => {
      b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
      b.classList.toggle('is-live', b.dataset.tab === 'enfoque' && state.focus.phase === 'running');
    });
    view.innerHTML = { hoy: viewHoy, tareas: viewTareas, enfoque: viewEnfoque, logros: viewLogros }[ui.tab]();
    if (ui.settings) renderSettings();
    renderReminder();
    paintTimer();
    if (active) {
      const el = $(active);
      if (el && el !== document.activeElement) el.focus({ preventScroll: true });
    }
    if (ui.justDone) setTimeout(() => { ui.justDone = null; }, 0);
  }

  function setTab(tab) {
    ui.tab = tab;
    try { history.replaceState(null, '', '#' + tab); } catch (e) { /* sin historial */ }
    render();
    window.scrollTo(0, 0);
  }

  function currentBattery() {
    return state.battery && state.battery.day === todayKey() ? state.battery.level : null;
  }

  const remindTime = t => (t.remindAt ? Date.parse(t.remindAt) : Infinity);
  function taskOrder(a, b) {
    return (a.done - b.done) || (b.today - a.today) || (remindTime(a) - remindTime(b)) || String(a.createdAt).localeCompare(String(b.createdAt));
  }

  function examplesBanner() {
    if (!state.tasks.some(t => t.example)) return '';
    return `<div class="banner"><p>Las tareas con la etiqueta <span class="chip chip-example">ejemplo</span> están para que pruebes: márcalas, ábrelas, juega con ellas.</p>
      <button class="btn sm" data-action="clear-examples">Borrar ejemplos</button></div>`;
  }

  function taskRow(t, opts = {}) {
    const open = ui.open.has(t.id);
    const n = Date.now();
    const meta = [`<span class="chip">${battery(t.energy)}${ENERGY[t.energy] || 'Media'}</span>`];
    if (t.minutes) meta.push(`<span class="chip">${ICON.clock}${t.minutes} min</span>`);
    if (t.remindAt) {
      const late = !t.done && Date.parse(t.remindAt) <= n;
      meta.push(`<span class="chip ${late ? 'chip-alert' : 'chip-pen'}">${ICON.bell}${L.fmtWhen(t.remindAt, n)}</span>`);
    }
    if (t.repeat && t.repeat !== 'none') meta.push(`<span class="chip">${ICON.repeat}${REPEAT[t.repeat]}</span>`);
    if (t.steps.length) meta.push(`<span class="chip">${ICON.steps}${t.steps.filter(s => s.done).length}/${t.steps.length} pasos</span>`);
    if (opts.showList) meta.push(`<span class="chip">${esc(t.list)}</span>`);
    if (t.example) meta.push('<span class="chip chip-example">ejemplo</span>');
    const cls = ['task', t.done && 'is-done', open && 'is-open', ui.justDone === t.id && 'just-done'].filter(Boolean).join(' ');
    return `<li class="${cls}" data-id="${t.id}">
      <div class="task-row">
        <button class="check" data-action="toggle" aria-pressed="${t.done}" aria-label="${t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${esc(t.title)}">${ICON.check}</button>
        <button class="task-main" data-action="expand" aria-expanded="${open}">
          <span class="task-title"><span class="hl">${esc(t.title)}</span></span>
          <span class="meta">${meta.join('')}</span>
        </button>
        <button class="star" data-action="star" aria-pressed="${t.today}" aria-label="${t.today ? 'Quitar de mi foco de hoy' : 'Añadir a mi foco de hoy'}">${ICON.star}</button>
      </div>
      ${open ? editor(t) : ''}
    </li>`;
  }

  function quickButtons(t) {
    const h = new Date().getHours();
    const opts = [['1h', 'En 1 hora']];
    if (h < 17) opts.push(['tarde', 'Esta tarde']);
    else if (h < 20) opts.push(['noche', 'Esta noche']);
    opts.push(['manana', 'Mañana 9:00']);
    if (!t || t.remindAt) opts.push(['none', 'Quitar hora']);
    return opts.map(([k, label]) => `<button class="chip-btn" data-action="remind-quick" data-when="${k}">${label}</button>`).join('');
  }

  function editor(t) {
    const id = t.id;
    const steps = t.steps.map(s => `<li class="step${s.done ? ' is-done' : ''}${ui.justDone === s.id ? ' just-done' : ''}">
        <button class="check sm" data-action="step-toggle" data-step="${s.id}" aria-pressed="${s.done}" aria-label="${s.done ? 'Desmarcar' : 'Marcar'} paso: ${esc(s.text)}">${ICON.check}</button>
        <span class="hl">${esc(s.text)}</span>
        <button class="x" data-action="step-del" data-step="${s.id}" aria-label="Quitar paso: ${esc(s.text)}">${ICON.x}</button>
      </li>`).join('');
    const starters = t.steps.length ? '' : `<div class="quick"><span class="hint">¿Te cuesta empezar? Prueba con:</span>${STARTERS.map(s => `<button class="chip-btn" data-action="step-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    return `<div class="editor">
      <label class="field"><span class="field-label">Nombre</span>
        <input class="input" id="title-${id}" data-field="title" value="${esc(t.title)}" maxlength="200" autocomplete="off"></label>
      <div class="field"><span class="field-label">Pasos pequeños</span>
        ${steps ? `<ul class="steps">${steps}</ul>` : ''}
        <form class="step-form" data-id="${id}" autocomplete="off">
          <label class="sr-only" for="step-in-${id}">Nuevo paso</label>
          <input class="input" id="step-in-${id}" placeholder="Un paso concreto, empieza con un verbo" maxlength="120">
          <button class="btn" type="submit">Añadir</button>
        </form>
        ${starters}
      </div>
      <div class="field-grid">
        <label class="field"><span class="field-label">Lista</span>
          <select class="input" id="list-${id}" data-field="list">${state.lists.map(l => `<option ${l === t.list ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Tiempo aproximado</span>
          <select class="input" id="min-${id}" data-field="minutes"><option value="">No lo sé</option>${MINUTES.map(m => `<option value="${m}" ${m === t.minutes ? 'selected' : ''}>${minutesLabel(m)}</option>`).join('')}</select></label>
      </div>
      <fieldset class="field"><legend class="field-label">Energía que pide</legend>
        <div class="seg">${['low', 'med', 'high'].map(e => `<label class="seg-btn"><input type="radio" id="en-${e}-${id}" name="energy-${id}" value="${e}" data-field="energy" ${t.energy === e ? 'checked' : ''}>${battery(e)}<span>${ENERGY[e]}</span></label>`).join('')}</div>
      </fieldset>
      <div class="field"><label class="field-label" for="rem-${id}">Recordatorio</label>
        <input class="input" type="datetime-local" id="rem-${id}" data-field="remindAt" value="${L.toLocalInput(t.remindAt)}">
        <div class="quick">${quickButtons(t)}</div>
      </div>
      <label class="field"><span class="field-label">Repetir</span>
        <select class="input" id="rep-${id}" data-field="repeat">${Object.entries(REPEAT).map(([k, v]) => `<option value="${k}" ${k === t.repeat ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Notas</span>
        <textarea class="input" id="notes-${id}" data-field="notes" rows="2" maxlength="2000">${esc(t.notes)}</textarea></label>
      <div class="editor-actions">
        ${t.done ? '' : '<button class="btn primary" data-action="focus-task">Enfocarme en esta</button>'}
        ${!EMBEDDED && t.remindAt ? '<button class="btn" data-action="ics">Añadir a mi calendario</button>' : ''}
        <button class="btn ghost danger-text" data-action="delete">Borrar tarea</button>
      </div>
    </div>`;
  }

  /* ----- Hoy ----- */

  function viewHoy() {
    const n = Date.now();
    const pending = state.tasks.filter(t => !t.done);
    const overdue = pending.filter(t => t.remindAt && Date.parse(t.remindAt) <= n).sort((a, b) => remindTime(a) - remindTime(b));
    const upcoming = pending.filter(t => t.remindAt && Date.parse(t.remindAt) > n && L.dayDiff(t.remindAt, n) <= 1).sort((a, b) => remindTime(a) - remindTime(b));
    const focus = state.tasks.filter(t => t.today).sort(taskOrder);
    const focusPending = focus.filter(t => !t.done).length;
    const inbox = pending.filter(t => t.list === INBOX);
    const doneToday = state.log.filter(e => e.kind === 'task' && L.dayKey(e.at) === todayKey()).length;
    const level = currentBattery();
    const h = new Date(n).getHours();
    const hello = h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches';

    const glance = [];
    if (focusPending) glance.push(['', `${plural(focusPending, 'tarea', 'tareas')} en tu foco de hoy`]);
    if (overdue.length) glance.push(['is-alert', `${plural(overdue.length, 'aviso pasó', 'avisos pasaron')} de hora (sin culpa)`]);
    const laterToday = upcoming.filter(t => L.dayDiff(t.remindAt, n) === 0).length;
    if (laterToday) glance.push(['', `${plural(laterToday, 'aviso', 'avisos')} más tarde`]);
    if (inbox.length) glance.push(['is-muted', `${plural(inbox.length, 'idea', 'ideas')} en la Bandeja sin ordenar`, 'go-inbox']);
    if (!focus.length && pending.length) glance.push(['is-muted', 'Aún no elegiste tu foco de hoy', 'go-tareas']);
    if (doneToday) glance.push(['is-good', `${plural(doneToday, 'logro', 'logros')} hoy`, 'go-logros']);
    const glanceHtml = glance.length
      ? `<ul class="glance">${glance.map(([cls, text, action]) => `<li class="${cls}"><span class="dot"></span>${action ? `<button data-action="${action}">${text}</button>` : `<span>${text}</span>`}</li>`).join('')}</ul>`
      : '<p>Todo tranquilo. Anota algo arriba si se te ocurre, o descansa.</p>';

    const needsNotif = !EMBEDDED && 'Notification' in window && Notification.permission === 'default' && pending.some(t => t.remindAt);

    return `
      <section class="hello" aria-labelledby="hello-h">
        <h1 class="view-title" id="hello-h">${hello}</h1>
        <p class="margin-note">${esc(pickDaily(MSG.daily))}</p>
        <div class="panel"><p class="eyebrow">Tu día en un vistazo</p>${glanceHtml}</div>
      </section>
      ${examplesBanner()}
      ${needsNotif ? `<div class="banner"><p>Tienes tareas con aviso. Activa los avisos para que Pasito te llame aunque estés en otra pestaña.</p><button class="btn primary sm" data-action="notif-enable">Activar avisos</button></div>` : ''}

      <section class="block" aria-labelledby="batt-h">
        <h2 id="batt-h">¿Cómo está tu batería ahora?</h2>
        <div class="seg" role="group" aria-labelledby="batt-h">
          ${['low', 'med', 'high'].map(l => `<button class="seg-btn" data-action="battery" data-level="${l}" aria-pressed="${level === l}">${battery(l)}<span>${ENERGY[l]}</span></button>`).join('')}
        </div>
        <p class="hint">${level ? BATTERY_HINT[level] : 'Así te sugiero tareas que encajen contigo ahora.'}</p>
      </section>

      <section class="block" aria-labelledby="next-h">
        <h2 id="next-h">¿Qué hago ahora?</h2>
        ${suggestionBlock()}
      </section>

      ${overdue.length ? `<section class="block" aria-labelledby="att-h">
        <h2 id="att-h">Se pasó la hora</h2>
        <p class="hint">Le pasa a todo el mundo. Elige otro momento o quita la hora.</p>
        <ul class="attn-list">${overdue.map(t => `<li class="attn" data-id="${t.id}">
          <button class="check" data-action="toggle" aria-pressed="false" aria-label="Marcar como hecha: ${esc(t.title)}">${ICON.check}</button>
          <div><p class="attn-title">${esc(t.title)}</p><p class="attn-when">${ICON.bell}era ${L.fmtWhen(t.remindAt, n)}</p>
          <div class="row">${quickButtons(t)}</div></div></li>`).join('')}</ul>
      </section>` : ''}

      <section class="block" aria-labelledby="foco-h">
        <div class="block-head"><h2 id="foco-h">Mi foco de hoy</h2><span class="count">${focus.length} de 3</span></div>
        ${focus.length ? `<ul class="tasks">${focus.map(t => taskRow(t, { showList: true })).join('')}</ul>`
          : `<div class="empty"><p>Marca hasta 3 tareas con la estrella ${ICON.star} para tenerlas aquí.</p><button class="btn" data-action="go-tareas">Elegir en Tareas</button></div>`}
        ${focus.length > 3 ? '<p class="hint">Tienes más de 3. Menos es más: ¿alguna puede esperar a mañana?</p>' : ''}
      </section>

      ${upcoming.length ? `<section class="block" aria-labelledby="up-h">
        <h2 id="up-h">Próximos avisos</h2>
        <ul class="upcoming">${upcoming.slice(0, 5).map(t => `<li><span class="when">${L.fmtWhen(t.remindAt, n)}</span><span class="what">${esc(t.title)}</span></li>`).join('')}</ul>
      </section>` : ''}

      <section class="block" aria-labelledby="prog-h">
        <div class="block-head"><h2 id="prog-h">Hoy</h2><span class="count">${plural(doneToday, 'logro', 'logros')}</span></div>
        <div class="meter" role="progressbar" aria-labelledby="prog-h" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${Math.min(doneToday, 3)}"><span style="width:${Math.min(doneToday / 3, 1) * 100}%"></span></div>
        <p class="hint">${doneToday >= 3 ? '¡Meta suave cumplida! Todo lo demás es extra.' : doneToday ? `Meta suave: 3. ${3 - doneToday === 1 ? 'Te falta 1' : `Te faltan ${3 - doneToday}`}, sin prisa.` : 'Meta suave: 3 pequeñas victorias. Cualquier cosa cuenta.'}</p>
      </section>`;
  }

  function currentSuggestion() {
    const ranked = L.rankTasks(state.tasks, currentBattery(), Date.now());
    if (!ranked.length) return { ranked, pick: null };
    let pool = ranked.filter(r => !ui.skipped.has(r.task.id));
    if (!pool.length) {
      ui.skipped.clear();
      pool = ranked;
    }
    const chosen = pool.find(r => r.task.id === ui.suggestId) || pool[0];
    ui.suggestId = chosen.task.id;
    return { ranked, pick: chosen };
  }

  function suggestionBlock() {
    if (!ui.suggesting) {
      return `<p class="lede">Te propongo una sola cosa según tu batería, tus avisos y tu foco.</p>
        <button class="btn primary big" data-action="suggest">Dime qué hago ahora</button>`;
    }
    const { pick: r } = currentSuggestion();
    if (!r) return '<div class="empty"><p>No tienes tareas pendientes. Disfrútalo, o anota algo nuevo arriba.</p></div>';
    const t = r.task;
    const big = !t.steps.length && (t.energy === 'high' || (t.minutes || 0) >= 45);
    return `<div class="panel-strong suggestion" data-id="${t.id}">
      <p class="eyebrow">Ahora mismo</p>
      <p class="s-title">${esc(t.title)}</p>
      <p class="s-why">Porque ${esc(joinEs(r.reasons))}.</p>
      ${r.nextStep ? `<p class="s-step">${ICON.steps}Empieza por: <strong>${esc(r.nextStep)}</strong></p>`
        : big ? '<p class="s-step">Parece grande. Dividirla en pasos la hace más fácil de empezar.</p>' : ''}
      <div class="row">
        <button class="btn primary" data-action="quick-focus">Empezar 5 minutos</button>
        <button class="btn" data-action="toggle">Ya está hecha</button>
        <button class="btn ghost" data-action="suggest-other">Otra opción</button>
        ${t.steps.length ? '' : '<button class="btn ghost" data-action="split">Dividir en pasos</button>'}
      </div>
    </div>`;
  }

  /* ----- Tareas ----- */

  function viewTareas() {
    if (ui.filter !== 'all' && !state.lists.includes(ui.filter)) ui.filter = 'all';
    const counts = {};
    state.tasks.forEach(t => { if (!t.done) counts[t.list] = (counts[t.list] || 0) + 1; });
    const total = state.tasks.filter(t => !t.done).length;
    const doneCount = state.tasks.filter(t => t.done).length;
    const chips = [`<button class="filter" data-action="filter" data-list="all" aria-pressed="${ui.filter === 'all'}">Todas <span class="n">${total}</span></button>`]
      .concat(state.lists.map(l => `<button class="filter" data-action="filter" data-list="${esc(l)}" aria-pressed="${ui.filter === l}">${esc(l)} <span class="n">${counts[l] || 0}</span></button>`));
    chips.push(ui.newList
      ? `<form class="new-list" id="newListForm" autocomplete="off"><label class="sr-only" for="newListInput">Nombre de la lista</label>
          <input class="input" id="newListInput" maxlength="40" placeholder="Nombre de la lista">
          <button class="btn sm primary" type="submit">Crear</button><button class="btn sm ghost" type="button" data-action="new-list-cancel">Cancelar</button></form>`
      : '<button class="filter add" data-action="new-list">+ Nueva lista</button>');

    const shown = ui.filter === 'all' ? state.lists : [ui.filter];
    const groups = shown.map(l => {
      const items = state.tasks.filter(t => t.list === l && (ui.showDone || !t.done)).sort(taskOrder);
      if (!items.length && ui.filter === 'all') return '';
      const del = l !== INBOX && ui.filter === l ? `<button class="btn sm ghost danger-text" data-action="list-delete" data-list="${esc(l)}">Borrar lista</button>` : '';
      return `<section class="group" aria-label="${esc(l)}">
        <div class="block-head"><h2>${esc(l)}</h2>${del}</div>
        ${items.length ? `<ul class="tasks">${items.map(t => taskRow(t)).join('')}</ul>`
          : `<p class="empty-line">Nada por aquí. Escribe arriba y se guardará en «${esc(l)}».</p>`}
      </section>`;
    }).join('');

    const inboxCount = counts[INBOX] || 0;
    return `
      <h1 class="view-title">Tareas</h1>
      <div class="filters" role="group" aria-label="Listas">${chips.join('')}</div>
      ${examplesBanner()}
      ${inboxCount && (ui.filter === 'all' || ui.filter === INBOX) ? `<p class="hint">La Bandeja es para soltar ideas rápido. Cuando puedas, ábrelas y dales lista, tiempo y energía: así sabrás qué hacer después.</p>` : ''}
      <div class="groups">${groups || '<div class="empty"><p>No hay tareas pendientes. Cuando se te ocurra algo, escríbelo arriba.</p></div>'}</div>
      <label class="switch"><input type="checkbox" id="showDone" ${ui.showDone ? 'checked' : ''}><span>Mostrar hechas (${doneCount})</span></label>`;
  }

  /* ----- Enfoque ----- */

  function viewEnfoque() {
    const f = state.focus;
    const pending = state.tasks.filter(t => !t.done);
    const t = f.taskId ? byId(f.taskId) : null;
    const next = t && !t.done ? t.steps.find(s => !s.done) : null;
    const sessions = state.log.filter(e => e.kind === 'focus' && L.dayKey(e.at) === todayKey()).length;
    const running = f.phase === 'running';
    const paused = f.phase === 'paused';
    const finished = f.phase === 'done';
    const locked = running || paused;
    if (!ui.focusNote) ui.focusNote = pickDaily(MSG.focusStart);

    let controls = '';
    if (running) controls = '<button class="btn primary" data-action="focus-pause">Pausar</button>';
    else if (!finished) controls = `<button class="btn primary" data-action="focus-start">${paused ? 'Seguir' : 'Empezar'}</button>`;
    if (locked) controls += '<button class="btn ghost" data-action="focus-reset">Reiniciar</button>';

    const donePanel = !finished ? '' : `<div class="done-panel" role="status">
      <h2>${f.isBreak ? 'Fin del descanso' : '¡Sesión completa!'}</h2>
      <p>${f.isBreak ? '¿Volvemos con otro ratito?' : `${esc(ui.focusDoneMsg || MSG.focusDone[0])} <span class="stars-pill">+2 ★</span>`}</p>
      <div class="row center">
        ${!f.isBreak && t && !t.done ? '<button class="btn primary" data-action="focus-complete-task">Terminé la tarea</button>' : ''}
        <button class="btn" data-action="focus-more">${f.isBreak ? 'Otra sesión' : '5 minutos más'}</button>
        ${f.isBreak ? '' : '<button class="btn ghost" data-action="focus-break">Descanso de 5 min</button>'}
        <button class="btn ghost" data-action="focus-reset">Listo por ahora</button>
      </div>
    </div>`;

    return `<section class="focus${f.isBreak ? ' is-break' : ''}" aria-labelledby="focus-h">
      <h1 class="view-title" id="focus-h">Enfoque</h1>
      <p class="lede">Elige una sola cosa y dale un rato corto. Empezar es la parte difícil.</p>
      <label class="field"><span class="field-label">¿En qué te enfocas?</span>
        <select class="input" id="focusTask" ${locked ? 'disabled' : ''}>
          <option value="">Algo sin anotar</option>
          ${pending.map(x => `<option value="${x.id}" ${x.id === f.taskId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}
        </select></label>
      ${next ? `<p class="s-step">${ICON.steps}Siguiente paso: <strong>${esc(next.text)}</strong>
        <button class="btn sm" data-action="focus-step-done" data-step="${next.id}">Paso hecho</button></p>` : ''}
      <div class="presets" role="group" aria-label="Duración">
        ${FOCUS_PRESETS.map(m => `<button class="filter" data-action="focus-preset" data-min="${m}" aria-pressed="${!f.isBreak && f.minutes === m}" ${locked ? 'disabled' : ''}>${m} min</button>`).join('')}
      </div>
      <div class="ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-bar" id="ringBar" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg>
        <div class="ring-center"><div class="ring-time" id="focusTime" role="timer" aria-live="off">00:00</div><div class="ring-label">${f.isBreak ? 'descanso' : 'enfoque'}</div></div>
      </div>
      <div class="row center">${controls}</div>
      <p class="margin-note center" id="focusNote">${esc(ui.focusNote)}</p>
      ${donePanel}
      <p class="hint center">${sessions ? `Sesiones hoy: ${sessions}` : 'Si no sabes por dónde empezar, prueba 5 minutos.'}</p>
    </section>`;
  }

  /* ----- Logros ----- */

  function viewLogros() {
    const lv = L.levelFor(state.stars);
    const week = L.weekStats(state.log, Date.now());
    const daysWith = week.filter(d => d.count).length;
    const max = Math.max(3, ...week.map(d => d.count));
    const recent = doneHistory(14);
    return `
      <section class="block" aria-labelledby="logros-h">
        <h1 class="view-title" id="logros-h">Logros</h1>
        <div class="stars-card">
          <div class="stars-big"><span>${state.stars}</span>${ICON.star}<span class="sr-only">estrellas</span></div>
          <div class="level">
            <p class="level-name">Nivel ${lv.level} · ${lv.name}</p>
            <div class="meter" role="progressbar" aria-label="Progreso al siguiente nivel" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.into}"><span style="width:${(lv.into / lv.need) * 100}%"></span></div>
            <p class="hint">${lv.need - lv.into} ★ para el siguiente nivel</p>
          </div>
        </div>
        <p class="hint">Ganas estrellas al terminar tareas (más si piden más energía), pasos y sesiones de enfoque.</p>
      </section>
      <section class="block" aria-labelledby="week-h">
        <div class="block-head"><h2 id="week-h">Últimos 7 días</h2><span class="count">${daysWith} de 7 días con logros</span></div>
        <div class="week">${week.map(d => `<div class="week-col${d.isToday ? ' is-today' : ''}">
          <span class="week-track"><span class="week-n">${d.count || ''}</span>${d.count ? `<span class="week-bar" style="height:${(d.count / max) * 80}%"></span>` : ''}</span>
          <span class="week-d">${d.label}</span></div>`).join('')}</div>
        <p class="margin-note">${daysWith >= 4 ? '¡Qué semana! Mira todo lo que hiciste.' : daysWith ? 'Cada día con un logro cuenta. Los demás no borran nada.' : 'Esta semana empieza cuando tú quieras. Un pasito basta.'}</p>
      </section>
      <section class="block" aria-labelledby="hist-h">
        <h2 id="hist-h">Lo que lograste</h2>
        ${recent || '<p class="empty-line">Aquí aparecerá todo lo que termines. Hasta lo más pequeño.</p>'}
      </section>`;
  }

  function doneHistory(days) {
    const n = Date.now();
    const groups = new Map();
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.kind === 'step') continue;
      if (L.dayDiff(e.at, n) < -days) break;
      const k = L.dayKey(e.at);
      if (!groups.has(k)) groups.set(k, { label: L.fmtDay(e.at, n), items: [] });
      groups.get(k).items.push(e);
    }
    if (!groups.size) return '';
    return `<div class="done-days">${[...groups.values()].map(g => `<div class="done-day"><h3>${esc(g.label)}</h3>
      <ul class="done-list">${g.items.map(e => `<li><span class="hl on">${esc(e.kind === 'focus' ? `Enfoque ${e.minutes} min${e.title ? ' · ' + e.title : ''}` : e.title)}</span><span class="stars-pill">+${e.stars} ★</span></li>`).join('')}</ul></div>`).join('')}</div>`;
  }

  /* ----- Ajustes ----- */

  const settingsEl = $('settings');

  function renderSettings() {
    const s = state.settings;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const notifText = {
      unsupported: 'Aquí el navegador no permite avisos del sistema. Los recordatorios aparecerán dentro de Pasito mientras esté abierto.',
      granted: 'Avisos activados. Te aviso aunque Pasito esté en otra pestaña o minimizado.',
      denied: 'Los avisos están bloqueados para esta página. Puedes permitirlos en los ajustes del navegador (el candado junto a la dirección).',
      default: 'Activa los avisos para que Pasito te llame la atención aunque estés en otra pestaña.',
    }[perm];
    settingsEl.querySelector('.sheet-body').innerHTML = `
      <div class="set-group"><h3>Avisos</h3>
        <p class="hint">${notifText}</p>
        <div class="row">
          ${perm === 'default' ? '<button class="btn primary" data-action="notif-enable">Activar avisos</button>' : ''}
          <button class="btn" data-action="notif-test">Probar un aviso</button>
        </div>
        ${EMBEDDED ? '' : '<p class="hint">Con el navegador cerrado ninguna web puede avisarte. Para lo importante, abre la tarea y usa «Añadir a mi calendario».</p>'}
      </div>
      <div class="set-group"><h3>Comodidad</h3>
        <label class="switch"><input type="checkbox" id="setSound" ${s.sound ? 'checked' : ''}><span>Sonidos suaves</span></label>
        <label class="switch"><input type="checkbox" id="setCalm" ${s.calm ? 'checked' : ''}><span>Menos animaciones y confeti</span></label>
      </div>
      <fieldset class="set-group"><legend>Tema</legend>
        <div class="seg">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<label class="seg-btn"><input type="radio" name="theme" id="theme-${v}" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      <div class="set-group"><h3>Tus datos</h3>
        <p class="hint">Todo se guarda solo en este navegador y en este dispositivo. Haz una copia de vez en cuando.</p>
        <div class="row">
          ${EMBEDDED ? '' : '<button class="btn" data-action="export-download">Descargar copia</button>'}
          <button class="btn" data-action="export-copy">Copiar copia</button>
          <label class="btn" for="importFile">Importar archivo</label>
          <input type="file" id="importFile" accept="application/json,.json" class="sr-only">
        </div>
        <label class="field"><span class="field-label">O pega aquí una copia para restaurarla</span>
          <textarea class="input" id="importText" rows="2" spellcheck="false"></textarea></label>
        <div class="row"><button class="btn sm" data-action="import-text">Restaurar desde el texto</button></div>
      </div>
      <div class="set-group"><h3>Limpieza</h3>
        <div class="row">
          <button class="btn" data-action="clear-done">Borrar tareas hechas</button>
          ${ui.confirm === 'reset'
            ? '<span class="confirm">¿Seguro? Se borra todo. <button class="btn sm danger" data-action="reset-yes">Sí, borrar todo</button><button class="btn sm ghost" data-action="confirm-no">No</button></span>'
            : '<button class="btn ghost danger-text" data-action="reset-ask">Borrar todo</button>'}
        </div>
      </div>
      <p class="hint">Pasito guarda tus estrellas, tus listas y tus avisos. Nada sale de tu dispositivo.</p>`;
  }

  function openSettings() {
    ui.settings = true;
    settingsEl.hidden = false;
    renderSettings();
    $('settingsClose').focus();
  }
  function closeSettings() {
    ui.settings = false;
    ui.confirm = null;
    settingsEl.hidden = true;
    $('settingsBtn').focus();
  }

  function applySettings() {
    const root = document.documentElement;
    const theme = state.settings.theme;
    if (theme === 'light' || theme === 'dark') {
      root.dataset.theme = theme;
      root.dataset.themeByApp = '1';
    } else if (root.dataset.themeByApp) {
      delete root.dataset.theme;
      delete root.dataset.themeByApp;
    }
    root.classList.toggle('calm', !!state.settings.calm);
  }

  /* ---------- Recompensas ---------- */

  const toastsEl = $('toasts');
  const toastActions = new Map();
  let toastSeq = 0;

  function toast(text, opts = {}) {
    const id = 'toast-' + (++toastSeq);
    const el = document.createElement('div');
    el.className = 'toast' + (opts.hand ? ' toast-hand' : '');
    el.id = id;
    el.innerHTML = `<span class="toast-text">${esc(text)}</span>${opts.stars ? `<span class="stars-pill">+${opts.stars} ★</span>` : ''}${opts.action ? `<button class="toast-btn" data-action="toast-act" data-toast="${id}">${esc(opts.action.label)}</button>` : ''}`;
    if (opts.action) toastActions.set(id, opts.action.run);
    toastsEl.appendChild(el);
    while (toastsEl.children.length > 2) removeToast(toastsEl.firstElementChild.id);
    setTimeout(() => removeToast(id), opts.action ? 7000 : 3800);
  }
  function removeToast(id) {
    const el = $(id);
    if (el) el.remove();
    toastActions.delete(id);
  }

  let audioCtx = null;
  function chime(kind) {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const notes = { done: [523.25, 659.25, 783.99], step: [659.25, 783.99], reminder: [783.99, 587.33, 783.99, 587.33], focus: [523.25, 659.25, 783.99, 1046.5] }[kind] || [660];
      const t0 = audioCtx.currentTime + 0.02;
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const t = t0 + i * 0.13;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) { /* sin audio */ }
  }

  const canvas = $('confetti');
  let confettiRaf = 0;
  function confetti(rect) {
    if (state.settings.calm || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const x0 = rect ? rect.left + rect.width / 2 : w / 2;
    const y0 = rect ? rect.top + rect.height / 2 : h / 2;
    const css = getComputedStyle(document.documentElement);
    const colors = ['--hl', '--pen', '--coral', '--good'].map(v => css.getPropertyValue(v).trim());
    const parts = Array.from({ length: 38 }, () => ({
      x: x0, y: y0, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 8 - 3,
      size: 4 + Math.random() * 5, color: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    }));
    const start = performance.now();
    cancelAnimationFrame(confettiRaf);
    const frame = now => {
      const k = (now - start) / 1100;
      ctx.clearRect(0, 0, w, h);
      if (k >= 1) return;
      ctx.globalAlpha = 1 - k * k;
      for (const p of parts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      confettiRaf = requestAnimationFrame(frame);
    };
    confettiRaf = requestAnimationFrame(frame);
  }

  function celebrate(rect, msg, stars) {
    chime('done');
    vibrate(25);
    confetti(rect);
    toast(msg, { stars, hand: true });
  }

  /* ---------- Acciones sobre tareas ---------- */

  function completeTask(t, rect) {
    const at = new Date().toISOString();
    const stars = L.STARS[t.energy] || 3;
    t.done = true;
    t.doneAt = at;
    t.snoozes = 0;
    state.stars += stars;
    state.log.push({ at, kind: 'task', id: t.id, title: t.title, stars });
    if (t.repeat !== 'none' && t.remindAt) {
      t.prevRemindAt = t.remindAt;
      t.remindAt = L.nextOccurrence(t.remindAt, t.repeat, Date.now());
      t.notified = false;
    }
    ui.reminderQueue = ui.reminderQueue.filter(x => x !== t.id);
    ui.justDone = t.id;
    const focusLeft = state.tasks.filter(x => x.today && !x.done).length;
    celebrate(rect, t.today && !focusLeft ? '¡Foco de hoy completado! Lo que hagas ahora es extra.' : pick(MSG.done), stars);
    save();
    render();
  }

  function reopenTask(t) {
    t.done = false;
    t.doneAt = null;
    for (let i = state.log.length - 1; i >= 0; i--) {
      const e = state.log[i];
      if (e.kind === 'task' && e.id === t.id) {
        state.stars = Math.max(0, state.stars - e.stars);
        state.log.splice(i, 1);
        break;
      }
    }
    if (t.prevRemindAt) {
      t.remindAt = t.prevRemindAt;
      t.prevRemindAt = null;
      t.notified = Date.parse(t.remindAt) <= Date.now();
    }
    save();
    render();
  }

  function toggleStep(t, stepId) {
    const s = t.steps.find(x => x.id === stepId);
    if (!s) return;
    s.done = !s.done;
    if (s.done) {
      state.stars += 1;
      state.log.push({ at: new Date().toISOString(), kind: 'step', id: s.id, title: s.text, stars: 1 });
      ui.justDone = s.id;
      chime('step');
      vibrate(15);
      if (!t.done && t.steps.every(x => x.done)) {
        toast('¡Todos los pasos listos! ¿Marcamos la tarea como hecha?', {
          stars: 1, hand: true,
          action: { label: 'Sí, hecha', run: () => { const x = byId(t.id); if (x && !x.done) completeTask(x, null); } },
        });
      } else {
        toast(pick(MSG.step), { stars: 1, hand: true });
      }
    } else {
      const i = state.log.findIndex(e => e.kind === 'step' && e.id === s.id);
      if (i >= 0) {
        state.stars = Math.max(0, state.stars - state.log[i].stars);
        state.log.splice(i, 1);
      }
    }
    save();
    render();
  }

  function quickTime(key) {
    const d = new Date();
    d.setSeconds(0, 0);
    if (key === '1h') {
      d.setMinutes(d.getMinutes() + 60);
      d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    } else if (key === 'tarde') d.setHours(18, 0);
    else if (key === 'noche') d.setHours(21, 0);
    else if (key === 'manana') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0);
    } else return null;
    return d;
  }

  function setReminder(t, date) {
    t.remindAt = date ? date.toISOString() : null;
    t.notified = false;
    ui.reminderQueue = ui.reminderQueue.filter(x => x !== t.id);
    save();
    render();
    toast(date ? `Te aviso ${L.fmtWhen(t.remindAt)}.` : 'Hora quitada. La tarea sigue en tu lista.');
  }

  function withUndo(label, mutate) {
    const snapshot = JSON.stringify(state);
    mutate();
    save();
    applySettings();
    render();
    toast(label, {
      action: {
        label: 'Deshacer',
        run: () => {
          state = normalize(JSON.parse(snapshot));
          save();
          applySettings();
          render();
          toast('Listo, lo recuperé.');
        },
      },
    });
  }

  function openTask(id, focusSelector) {
    const t = byId(id);
    if (!t) return;
    ui.open.add(id);
    ui.filter = 'all';
    if (t.done) ui.showDone = true;
    setTab('tareas');
    const row = view.querySelector(`[data-id="${id}"]`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      const field = row.querySelector(focusSelector || '[data-field="title"]');
      if (field) field.focus({ preventScroll: true });
    }
  }

  function download(filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importData(text) {
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* no es JSON */ }
    if (!data || !Array.isArray(data.tasks)) {
      toast('Eso no parece una copia de Pasito. Revisa que sea el texto o archivo completo.');
      return;
    }
    withUndo('Copia restaurada.', () => { state = normalize(data); });
  }

  /* ---------- Enfoque ---------- */

  let timerHandle = null;
  let wakeLock = null;

  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { wakeLock = null; }
  }
  function releaseWake() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ya liberado */ }
    wakeLock = null;
  }

  function remainingMs() {
    const f = state.focus;
    if (f.phase === 'running') return Math.max(0, f.endAt - Date.now());
    if (f.phase === 'paused') return f.remaining;
    if (f.phase === 'done') return 0;
    return f.minutes * MIN;
  }

  function paintTimer() {
    const f = state.focus;
    const ms = remainingMs();
    const total = f.phase === 'idle' ? f.minutes * MIN : f.total || f.minutes * MIN;
    const secs = Math.ceil(ms / 1000);
    const text = `${pad2(Math.floor(secs / 60))}:${pad2(secs % 60)}`;
    const time = $('focusTime');
    if (time) time.textContent = text;
    const bar = $('ringBar');
    if (bar) {
      bar.setAttribute('stroke-dashoffset', String(100 - (ms / total) * 100));
      bar.style.opacity = ms > 0 ? '1' : '0';
    }
    document.title = f.phase === 'running' ? `${text} · Pasito` : 'Pasito';
  }

  function ensureTimer() {
    clearInterval(timerHandle);
    timerHandle = null;
    if (state.focus.phase === 'running') timerHandle = setInterval(timerTick, 500);
    paintTimer();
  }

  function timerTick() {
    const f = state.focus;
    if (f.phase !== 'running') return ensureTimer();
    if (Date.now() >= f.endAt) return focusFinish();
    paintTimer();
    const slot = Math.floor((f.total - (f.endAt - Date.now())) / (5 * MIN));
    if (slot > 0 && slot !== ui.noteSlot) {
      ui.noteSlot = slot;
      ui.focusNote = pick(MSG.focusMid);
      const note = $('focusNote');
      if (note) note.textContent = ui.focusNote;
    }
  }

  function focusStart() {
    const f = state.focus;
    if (f.phase === 'paused' && f.remaining) {
      f.endAt = Date.now() + f.remaining;
    } else {
      f.total = f.minutes * MIN;
      f.endAt = Date.now() + f.total;
      ui.noteSlot = 0;
      ui.focusNote = f.isBreak ? 'Descansa de verdad: estírate, bebe agua, mira lejos.' : pick(MSG.focusStart);
    }
    f.phase = 'running';
    f.remaining = null;
    unlockAudio();
    requestWake();
    save();
    ensureTimer();
    render();
  }

  function focusPause() {
    const f = state.focus;
    f.remaining = Math.max(0, f.endAt - Date.now());
    f.endAt = null;
    f.phase = 'paused';
    releaseWake();
    save();
    ensureTimer();
    render();
  }

  function focusReset() {
    const f = state.focus;
    f.phase = 'idle';
    f.endAt = null;
    f.remaining = null;
    if (f.isBreak) {
      f.isBreak = false;
      f.minutes = f.lastMinutes || 15;
    }
    releaseWake();
    save();
    ensureTimer();
    render();
  }

  function focusFinish() {
    const f = state.focus;
    f.phase = 'done';
    f.endAt = null;
    f.remaining = 0;
    releaseWake();
    ensureTimer();
    chime('focus');
    vibrate([80, 60, 80]);
    const t = f.taskId ? byId(f.taskId) : null;
    if (!f.isBreak && f.total >= 5 * MIN) {
      state.stars += 2;
      state.log.push({ at: new Date().toISOString(), kind: 'focus', minutes: Math.round(f.total / MIN), title: t ? t.title : '', stars: 2 });
      ui.focusDoneMsg = pick(MSG.focusDone);
      confetti(null);
    }
    if (!document.hasFocus()) systemNotify(f.isBreak ? 'Fin del descanso' : '¡Sesión completa!', f.isBreak ? '¿Volvemos con otro ratito?' : 'Muy bien. Vuelve a Pasito para decidir qué sigue.', 'pasito-focus', false);
    save();
    if (ui.tab === 'enfoque') render();
    else {
      render();
      toast(f.isBreak ? 'Fin del descanso.' : '¡Sesión de enfoque completa!', { stars: f.isBreak ? 0 : 2, hand: true, action: { label: 'Ver', run: () => setTab('enfoque') } });
    }
  }

  function goFocus(taskId, minutes, autostart) {
    const f = state.focus;
    if (f.phase === 'running' || f.phase === 'paused') {
      toast('Ya tienes una sesión en marcha. Termínala o reiníciala para cambiar.');
      setTab('enfoque');
      return;
    }
    f.taskId = taskId;
    f.isBreak = false;
    f.phase = 'idle';
    if (minutes) f.minutes = minutes;
    f.lastMinutes = f.minutes;
    const t = byId(taskId);
    if (t) t.snoozes = 0;
    ui.tab = 'enfoque';
    try { history.replaceState(null, '', '#enfoque'); } catch (e) { /* sin historial */ }
    window.scrollTo(0, 0);
    if (autostart) focusStart();
    else {
      save();
      render();
    }
  }

  /* ---------- Recordatorios ---------- */

  async function systemNotify(title, body, tag, sticky) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const opts = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, requireInteraction: !!sticky };
      if (reg) await reg.showNotification(title, opts);
      else new Notification(title, opts);
      return true;
    } catch (e) {
      return false;
    }
  }

  function fireReminder(t) {
    if (!ui.reminderQueue.includes(t.id)) ui.reminderQueue.push(t.id);
    ui.remNote = pick(MSG.reminder);
    chime('reminder');
    vibrate([120, 80, 120]);
    const next = t.steps.find(s => !s.done);
    if (!document.hasFocus()) systemNotify(t.title, next ? `Empieza por: ${next.text}` : 'Es el momento. Un pasito basta.', t.id, true);
  }

  function renderReminder() {
    const el = $('reminder');
    while (ui.reminderQueue.length) {
      const t = byId(ui.reminderQueue[0]);
      if (t && !t.done) break;
      ui.reminderQueue.shift();
    }
    const t = ui.reminderQueue.length ? byId(ui.reminderQueue[0]) : null;
    if (!t) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const next = t.steps.find(s => !s.done);
    el.dataset.id = t.id;
    el.innerHTML = `<p class="eyebrow">${ICON.bell}Recordatorio</p>
      <h2 id="remTitle">${esc(t.title)}</h2>
      ${next ? `<p class="s-step">${ICON.steps}Empieza por: <strong>${esc(next.text)}</strong></p>` : ''}
      <p class="margin-note">${esc(ui.remNote)}</p>
      <div class="row">
        <button class="btn primary" data-action="rem-start">Empezar ahora</button>
        <button class="btn" data-action="rem-done">Ya está hecha</button>
        <button class="btn ghost" data-action="rem-snooze" data-min="10">En 10 min</button>
        <button class="btn ghost" data-action="rem-snooze" data-min="60">En 1 hora</button>
      </div>
      ${ui.reminderQueue.length > 1 ? `<p class="hint">${plural(ui.reminderQueue.length - 1, 'aviso más espera', 'avisos más esperan')} después de este.</p>` : ''}
      <button class="icon-btn" data-action="rem-close" aria-label="Cerrar aviso">${ICON.x}</button>`;
    el.hidden = false;
  }

  function housekeeping() {
    const n = Date.now();
    const today = todayKey();
    let changed = false;
    for (const t of state.tasks) {
      if (L.shouldReset(t, n)) {
        t.done = false;
        t.doneAt = null;
        t.prevRemindAt = null;
        t.steps.forEach(s => { s.done = false; });
        changed = true;
      }
      if (t.done && t.today && t.repeat === 'none' && t.doneAt && L.dayKey(t.doneAt) < today) {
        t.today = false;
        changed = true;
      }
    }
    if (state.log.length > 3000) {
      state.log = state.log.slice(-2000);
      changed = true;
    }
    return changed;
  }

  const isTyping = () => {
    const el = document.activeElement;
    if (!el || el.id === 'captureInput') return false;
    return el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'datetime-local', 'file'].includes(el.type));
  };

  function tick() {
    const n = Date.now();
    let changed = housekeeping() || ui.renderDay !== todayKey();
    for (const t of state.tasks) {
      if (t.done || !t.remindAt || t.notified) continue;
      const at = Date.parse(t.remindAt);
      if (at <= n) {
        t.notified = true;
        changed = true;
        if (n - at < 6 * HOUR) fireReminder(t);
      }
    }
    if (!changed) return;
    save();
    if (isTyping()) renderReminder();
    else render();
  }

  /* ---------- Eventos ---------- */

  function unlockAudio() {
    if (!state.settings.sound || audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* sin audio */ }
  }

  const actions = {
    toggle(t, btn) {
      if (!t) return;
      if (t.done) reopenTask(t);
      else completeTask(t, btn.getBoundingClientRect());
    },
    expand(t) {
      if (!t) return;
      if (ui.open.has(t.id)) ui.open.delete(t.id);
      else ui.open.add(t.id);
      render();
    },
    star(t) {
      if (!t) return;
      t.today = !t.today;
      save();
      render();
      if (t.today) {
        const n = state.tasks.filter(x => x.today && !x.done).length;
        toast(n > 3 ? 'Ya tienes más de 3 en tu foco. Menos es más: ¿alguna puede esperar?' : 'Añadida a tu foco de hoy.');
      }
    },
    'step-toggle'(t, btn) { if (t) toggleStep(t, btn.dataset.step); },
    'step-del'(t, btn) {
      if (!t) return;
      t.steps = t.steps.filter(s => s.id !== btn.dataset.step);
      save();
      render();
    },
    'step-suggest'(t, btn) {
      if (!t) return;
      t.steps.push({ id: uid(), text: btn.dataset.text, done: false });
      save();
      render();
    },
    'remind-quick'(t, btn) { if (t) setReminder(t, quickTime(btn.dataset.when)); },
    'focus-task'(t) { if (t) goFocus(t.id, null, false); },
    ics(t) {
      if (!t || !t.remindAt) return;
      const name = t.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'tarea';
      download(`${name}.ics`, L.buildICS(t), 'text/calendar');
      toast('Abre el archivo descargado para añadirlo a tu calendario.');
    },
    delete(t) {
      if (!t) return;
      withUndo('Tarea borrada.', () => {
        state.tasks = state.tasks.filter(x => x.id !== t.id);
        ui.open.delete(t.id);
      });
    },
    battery(t, btn) {
      state.battery = { day: todayKey(), level: btn.dataset.level };
      ui.suggesting = true;
      ui.suggestId = null;
      ui.skipped.clear();
      save();
      render();
    },
    suggest() {
      ui.suggesting = true;
      ui.suggestId = null;
      render();
    },
    'suggest-other'() {
      const { ranked } = currentSuggestion();
      if (ranked.length < 2) {
        toast('Es la única pendiente. ¡Tú puedes con ella!');
        return;
      }
      ui.skipped.add(ui.suggestId);
      ui.suggestId = null;
      render();
    },
    'quick-focus'(t) { if (t) goFocus(t.id, 5, true); },
    split(t) { if (t) openTask(t.id, `#step-in-${t.id}`); },
    filter(t, btn) {
      ui.filter = btn.dataset.list;
      render();
    },
    'new-list'() {
      ui.newList = true;
      render();
      $('newListInput').focus();
    },
    'new-list-cancel'() {
      ui.newList = false;
      render();
    },
    'list-delete'(t, btn) {
      const name = btn.dataset.list;
      withUndo(`Lista «${name}» borrada. Sus tareas pasaron a la Bandeja.`, () => {
        state.lists = state.lists.filter(l => l !== name);
        state.tasks.forEach(x => { if (x.list === name) x.list = INBOX; });
        ui.filter = 'all';
      });
    },
    'clear-examples'() {
      withUndo('Ejemplos borrados. Ahora es todo tuyo.', () => {
        const ids = new Set();
        state.tasks.filter(x => x.example).forEach(x => { ids.add(x.id); x.steps.forEach(s => ids.add(s.id)); });
        state.log = state.log.filter(e => {
          if (!ids.has(e.id)) return true;
          state.stars = Math.max(0, state.stars - (e.stars || 0));
          return false;
        });
        state.tasks = state.tasks.filter(x => !x.example);
      });
    },
    'go-inbox'() {
      ui.filter = INBOX;
      setTab('tareas');
    },
    'go-tareas'() {
      ui.filter = 'all';
      setTab('tareas');
    },
    'go-logros'() { setTab('logros'); },
    'focus-preset'(t, btn) {
      state.focus.minutes = Number(btn.dataset.min);
      state.focus.lastMinutes = state.focus.minutes;
      state.focus.isBreak = false;
      state.focus.phase = 'idle';
      save();
      render();
    },
    'focus-start'() { focusStart(); },
    'focus-pause'() { focusPause(); },
    'focus-reset'() { focusReset(); },
    'focus-more'() {
      const f = state.focus;
      if (f.isBreak) {
        f.isBreak = false;
        f.minutes = f.lastMinutes || 15;
      } else {
        f.minutes = 5;
      }
      f.phase = 'idle';
      focusStart();
    },
    'focus-break'() {
      const f = state.focus;
      f.lastMinutes = f.minutes === 5 ? f.lastMinutes : f.minutes;
      f.isBreak = true;
      f.minutes = 5;
      f.phase = 'idle';
      focusStart();
    },
    'focus-complete-task'(t, btn) {
      const task = byId(state.focus.taskId);
      state.focus.phase = 'idle';
      state.focus.minutes = state.focus.lastMinutes || 15;
      if (task && !task.done) completeTask(task, btn.getBoundingClientRect());
      state.focus.taskId = null;
      save();
      render();
    },
    'focus-step-done'(t, btn) {
      const task = byId(state.focus.taskId);
      if (task) toggleStep(task, btn.dataset.step);
    },
    'rem-start'(t) {
      ui.reminderQueue.shift();
      if (t) goFocus(t.id, 5, true);
      else render();
    },
    'rem-done'(t) {
      ui.reminderQueue.shift();
      if (t && !t.done) completeTask(t, null);
      else render();
    },
    'rem-snooze'(t, btn) {
      if (!t) return;
      ui.reminderQueue.shift();
      t.snoozes = (t.snoozes || 0) + 1;
      setReminder(t, new Date(Date.now() + Number(btn.dataset.min) * MIN));
    },
    'rem-close'() {
      ui.reminderQueue.shift();
      renderReminder();
    },
    'toast-act'(t, btn) {
      const run = toastActions.get(btn.dataset.toast);
      removeToast(btn.dataset.toast);
      if (run) run();
    },
    'open-settings'() { openSettings(); },
    'close-settings'() { closeSettings(); },
    async 'notif-enable'() {
      if (!('Notification' in window)) {
        toast('Este navegador no permite avisos del sistema. Te avisaré dentro de la app.');
        return;
      }
      try { await Notification.requestPermission(); } catch (e) { /* rechazado */ }
      render();
      toast(Notification.permission === 'granted' ? 'Avisos activados.' : 'Sin permiso para avisos. Te avisaré dentro de la app mientras esté abierta.');
    },
    async 'notif-test'() {
      unlockAudio();
      chime('reminder');
      const ok = await systemNotify('Pasito', 'Así se verán tus avisos. ¡Todo listo!', 'pasito-test', false);
      toast(ok ? 'Aviso de prueba enviado.' : 'Los avisos del sistema no están activos aquí. Te avisaré dentro de la app con sonido.');
    },
    'export-download'() {
      download(`pasito-copia-${todayKey()}.json`, JSON.stringify(state, null, 2), 'application/json');
      toast('Copia descargada.');
    },
    'export-copy'() {
      const text = JSON.stringify(state);
      const fallback = () => {
        const box = $('importText');
        box.value = text;
        box.select();
        toast('Selecciona el texto de la caja y cópialo a mano.');
      };
      try {
        navigator.clipboard.writeText(text).then(() => toast('Copia en el portapapeles. Pégala en una nota o en un correo para ti.'), fallback);
      } catch (e) {
        fallback();
      }
    },
    'import-text'() { importData($('importText').value.trim()); },
    'clear-done'() {
      const n = state.tasks.filter(x => x.done && x.repeat === 'none').length;
      if (!n) {
        toast('No hay tareas hechas que borrar.');
        return;
      }
      withUndo(`${plural(n, 'tarea hecha borrada', 'tareas hechas borradas')}. Tus estrellas se quedan.`, () => {
        state.tasks = state.tasks.filter(x => !x.done || x.repeat !== 'none');
      });
    },
    'reset-ask'() {
      ui.confirm = 'reset';
      renderSettings();
    },
    'confirm-no'() {
      ui.confirm = null;
      renderSettings();
    },
    'reset-yes'() {
      ui.confirm = null;
      ui.open.clear();
      withUndo('Todo borrado. Empiezas de cero.', () => { state = freshState(false); });
    },
  };

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      setTab(tab.dataset.tab);
      return;
    }
    if (e.target === settingsEl) {
      closeSettings();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || !actions[btn.dataset.action]) return;
    const holder = btn.closest('[data-id]');
    actions[btn.dataset.action](holder ? byId(holder.dataset.id) : null, btn, e);
  });

  document.addEventListener('submit', e => {
    const form = e.target;
    e.preventDefault();
    if (form.id === 'captureForm') {
      const input = $('captureInput');
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      const parsed = L.parseQuickInput(text, new Date());
      const list = ui.tab === 'tareas' && ui.filter !== 'all' ? ui.filter : INBOX;
      const t = makeTask({ title: parsed.title, remindAt: parsed.remindAt, today: parsed.today, list });
      state.tasks.push(t);
      input.value = '';
      save();
      render();
      let msg = pick(MSG.capture);
      if (parsed.remindAt) msg += ` Te aviso ${L.fmtWhen(parsed.remindAt)}.`;
      else if (parsed.today) msg += ' Está en tu foco de hoy.';
      toast(msg, { hand: true, action: { label: 'Detalles', run: () => openTask(t.id) } });
    } else if (form.classList.contains('step-form')) {
      const t = byId(form.dataset.id);
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!t || !text) return;
      t.steps.push({ id: uid(), text, done: false });
      save();
      render();
      const again = $(`step-in-${t.id}`);
      if (again) again.focus();
    } else if (form.id === 'newListForm') {
      const name = $('newListInput').value.trim().slice(0, 40);
      if (!name) return;
      const existing = state.lists.find(l => l.toLowerCase() === name.toLowerCase());
      if (!existing) state.lists.push(name);
      ui.newList = false;
      ui.filter = existing || name;
      save();
      render();
      toast(existing ? `Ya tenías «${existing}».` : `Lista «${name}» creada. Lo que anotes ahora irá ahí.`);
    }
  });

  document.addEventListener('input', e => {
    const el = e.target;
    const field = el.dataset.field;
    if (field !== 'title' && field !== 'notes') return;
    const holder = el.closest('[data-id]');
    const t = holder && byId(holder.dataset.id);
    if (!t) return;
    t[field] = el.value;
    if (field === 'title') {
      delete t.example;
      const label = holder.querySelector('.task-title .hl');
      if (label) label.textContent = t.title || 'Sin nombre';
    }
    saveSoon();
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'showDone') {
      ui.showDone = el.checked;
      render();
      return;
    }
    if (el.id === 'focusTask') {
      state.focus.taskId = el.value || null;
      save();
      render();
      return;
    }
    if (el.id === 'setSound' || el.id === 'setCalm') {
      state.settings[el.id === 'setSound' ? 'sound' : 'calm'] = el.checked;
      save();
      applySettings();
      if (el.id === 'setSound' && el.checked) {
        unlockAudio();
        chime('step');
      }
      return;
    }
    if (el.name === 'theme') {
      state.settings.theme = el.value;
      save();
      applySettings();
      return;
    }
    if (el.id === 'importFile') {
      const file = el.files && el.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importData(String(reader.result));
      reader.readAsText(file);
      el.value = '';
      return;
    }
    const field = el.dataset.field;
    const holder = el.closest('[data-id]');
    const t = field && holder && byId(holder.dataset.id);
    if (!t) return;
    if (field === 'title' || field === 'notes') {
      if (!t.title.trim()) t.title = 'Sin nombre';
      save();
      return;
    }
    if (field === 'list') t.list = el.value;
    else if (field === 'minutes') t.minutes = Number(el.value) || null;
    else if (field === 'energy') t.energy = el.value;
    else if (field === 'repeat') t.repeat = el.value;
    else if (field === 'remindAt') {
      t.remindAt = el.value ? new Date(el.value).toISOString() : null;
      t.notified = false;
    }
    save();
    render();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (ui.settings) closeSettings();
      else if (!$('reminder').hidden) actions['rem-close']();
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      $('captureInput').focus();
    }
  });

  document.addEventListener('pointerdown', unlockAudio, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (saveTimer) save();
      return;
    }
    state.lastVisit = Date.now();
    tick();
    ensureTimer();
    if (state.focus.phase === 'running') requestWake();
  });
  window.addEventListener('pagehide', () => { if (saveTimer) save(); });

  /* ---------- Arranque ---------- */

  document.documentElement.lang = 'es';
  const away = Date.now() - (state.lastVisit || Date.now());
  state.lastVisit = Date.now();
  applySettings();
  housekeeping();
  save();
  render();
  ensureTimer();
  tick();
  setInterval(tick, 15000);
  if (away > 2 * L.DAY) setTimeout(() => toast(pick(MSG.welcomeBack), { hand: true }), 600);

  if (!EMBEDDED && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
  }
})();
