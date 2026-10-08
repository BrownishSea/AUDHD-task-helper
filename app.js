/* Pasito: interfaz, perfiles, guardado, recordatorios, temporizador de enfoque y recompensas. Usa logic.js (window.PasitoLogic). */
(() => {
  'use strict';

  const L = window.PasitoLogic;
  const KEY = 'pasito-v1';
  const PROFILES_KEY = 'pasito-perfiles';
  const MIN = 60000;
  const HOUR = 60 * MIN;
  const NAG_EVERY = 10 * MIN;
  const NAG_MAX = 2;
  const PHOTO_SIZE = 192;
  const PHOTO_MAX_BYTES = 30 * 1024 * 1024;
  const PHOTO_MAX_CHARS = 150000;
  // Dentro de un iframe (por ejemplo, la vista previa de claude.ai) no hay descargas ni service worker.
  const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  const INBOX = 'Bandeja';
  const TABS = ['hoy', 'tareas', 'enfoque', 'logros'];
  const ENERGY = { low: 'Baja', med: 'Media', high: 'Alta' };
  const REPEAT = { none: 'No repetir', daily: 'Cada día', weekdays: 'De lunes a viernes', weekly: 'Cada semana' };
  const MINUTES = [5, 10, 15, 25, 45, 60, 90, 120];
  const FOCUS_PRESETS = [5, 10, 15, 25, 45];
  const STARTERS = ['Preparar lo que necesito', 'Hacerlo solo 5 minutos', 'Revisar y darlo por terminado'];
  const PROFILE_COLORS = [['#2847D1', 'Azul'], ['#2D7A4E', 'Verde'], ['#B9432C', 'Teja'], ['#7A3FC0', 'Violeta'], ['#9A5B00', 'Ámbar'], ['#0F7480', 'Turquesa']];
  const PLACEHOLDERS = ['Saca una idea de tu cabeza…', 'Ej.: comprar pan esta tarde', 'Ej.: llamar al médico mañana a las 10', 'Ej.: sacar la ropa en 45 min', 'Ej.: pagar el alquiler el lunes'];
  const BATTERY_HINT = {
    low: 'Batería baja: hoy valen las tareas pequeñas. Descansar también cuenta.',
    med: 'Batería media: buen momento para avanzar algo concreto.',
    high: 'Batería alta: aprovecha para lo que más te cuesta.',
  };
  const TEMPLATES = [
    { title: 'Rutina de mañana', list: 'Personal', energy: 'low', minutes: 20, repeat: 'daily', hour: 8, steps: ['Beber un vaso de agua', 'Tomar la medicación', 'Desayunar', 'Lavarme los dientes', 'Mirar mi foco de hoy'] },
    { title: 'Rutina de noche', list: 'Personal', energy: 'low', minutes: 20, repeat: 'daily', hour: 22, steps: ['Dejar lista la ropa de mañana', 'Poner el móvil a cargar', 'Preparar lo que llevo mañana', 'Elegir el foco de mañana', 'Apagar pantallas'] },
    { title: 'Antes de salir de casa', list: 'Personal', energy: 'low', minutes: 5, repeat: 'none', steps: ['Llaves', 'Cartera', 'Móvil', 'Cargador o auriculares', 'Medicación'] },
    { title: 'Revisión semanal', list: 'Personal', energy: 'med', minutes: 20, repeat: 'weekly', hour: 18, weekday: 0, steps: ['Vaciar la cabeza', 'Ordenar la Bandeja', 'Mirar los avisos de la semana', 'Elegir 3 cosas importantes', 'Mirar lo que logré'] },
    { title: 'Ordenar la casa en 15 minutos', list: 'Casa', energy: 'med', minutes: 15, repeat: 'none', steps: ['Platos al fregadero', 'Basura fuera', 'Ropa al cesto', 'Despejar una superficie'] },
  ];

  const MSG = {
    done: [
      '¡Hecho! Eso cuenta, y mucho.', 'Una menos. Tu cerebro te lo agradece.', 'Terminar es una habilidad y la estás entrenando.',
      'Lo lograste. Tómate un segundo para notarlo.', '¡Toma! Otra victoria para hoy.', 'Pasito a pasito. Así se hace.',
      'Eso estaba ocupando espacio en tu cabeza. Ya no.',
    ],
    step: ['Un paso menos.', 'Avanzando. Cada paso suma.', 'Bien. El siguiente será más fácil.', 'Paso hecho. Sigue a tu ritmo.'],
    capture: ['Anotado. Ya no tienes que recordarlo.', 'Fuera de tu cabeza, dentro de la lista.', 'Guardado. Puedes ordenarlo luego.'],
    win: ['¡Eso también cuenta!', 'Bien visto. Hiciste más de lo que crees.', 'Logro anotado. Mira todo lo que haces.'],
    focusStart: ['Solo empieza. Lo demás viene después.', 'Un rato corto, nada más.', 'No hace falta hacerlo perfecto, solo hacerlo.'],
    focusMid: [
      'Vas bien. Sigue un poquito más.', 'Si te distrajiste, vuelve sin culpa. Eso también es enfocarse.',
      'Respira. Estás avanzando.', 'Ya llevas un buen rato. ¡Qué bien!',
    ],
    focusDone: ['¡Lo hiciste! Empezar era lo más difícil.', 'Tiempo cumplido. Muy bien hecho.', 'Sesión completa. Te ganaste un respiro.'],
    reminder: ['Un paso pequeño basta.', 'No tiene que ser perfecto.', 'Puedes hacerlo, aunque sea un poquito.'],
    nag: ['Te lo recuerdo otra vez, sin presión.', 'Sigue aquí cuando quieras empezar.', '¿Lo movemos a otro momento? También vale.'],
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
  const todayKey = () => L.dayKey(Date.now());
  const pickDaily = arr => arr[Number(todayKey().replace(/-/g, '')) % arr.length];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const pad2 = n => String(n).padStart(2, '0');
  const byId = id => state.tasks.find(t => t.id === id);
  const joinEs = list => list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  const minutesLabel = m => ({ 60: '1 hora', 90: '1 hora y media', 120: '2 horas' })[m] || `${m} min`;
  const isWin = e => e.kind !== 'step';
  const vibrate = p => {
    try {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate) navigator.vibrate(p);
    } catch (e) { /* sin vibración */ }
  };

  const store = {
    lastError: '',
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
        store.lastError = '';
        return true;
      } catch (e) {
        store.lastError = (e && e.name) || 'error';
        return false;
      }
    },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { /* nada que borrar */ } },
  };
  // QuotaExceededError (Chrome, Safari) o NS_ERROR_DOM_QUOTA_REACHED (Firefox): el almacenamiento está lleno.
  // Cualquier otro error significa que el navegador no deja guardar nada (datos de sitio bloqueados).
  const storageFull = () => /quota/i.test(store.lastError);

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

  /* ---------- Perfiles ---------- */

  const stateKey = id => `${KEY}:${id}`;
  const safeColor = c => (PROFILE_COLORS.some(([v]) => v === c) ? c : PROFILE_COLORS[0][0]);
  const initial = name => (Array.from(String(name).trim())[0] || '?').toUpperCase();
  const avatarInner = p => (p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc(initial(p.name)));
  const avatar = (p, opts = {}) => `<span${opts.id ? ` id="${opts.id}"` : ''} class="avatar${p.photo ? ' has-photo' : ''}${opts.cls ? ' ' + opts.cls : ''}" style="background:${safeColor(p.color)}" aria-hidden="true">${avatarInner(p)}</span>`;

  function loadProfiles() {
    let meta = null;
    try { meta = JSON.parse(store.get(PROFILES_KEY)); } catch (e) { /* dañado: se recrea */ }
    if (!meta || !Array.isArray(meta.list) || !meta.list.length) {
      const id = uid();
      meta = { active: id, list: [{ id, name: 'Yo', color: PROFILE_COLORS[0][0] }] };
      // Datos de la versión sin perfiles: pasan al primer perfil.
      const legacy = store.get(KEY);
      if (legacy && store.set(stateKey(id), legacy)) store.remove(KEY);
      store.set(PROFILES_KEY, JSON.stringify(meta));
    }
    meta.list = meta.list.filter(p => p && p.id).map(p => {
      const item = { id: String(p.id), name: String(p.name || 'Perfil').slice(0, 24), color: safeColor(p.color) };
      if (L.isSafePhoto(p.photo)) item.photo = p.photo;
      return item;
    });
    if (!meta.list.some(p => p.id === meta.active)) meta.active = meta.list[0].id;
    return meta;
  }
  const saveProfiles = () => store.set(PROFILES_KEY, JSON.stringify(profiles));
  const currentProfile = () => profiles.list.find(p => p.id === profiles.active);

  function readProfileState(id) {
    try {
      const data = JSON.parse(store.get(stateKey(id)));
      return data && Array.isArray(data.tasks) ? data : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Estado y guardado ---------- */

  function makeTask(fields) {
    return Object.assign({
      id: uid(), title: 'Sin nombre', notes: '', list: INBOX, energy: 'med', minutes: null,
      remindAt: null, repeat: 'none', today: false, steps: [], done: false, doneAt: null,
      notified: false, nagAt: null, nags: 0, snoozes: 0, createdAt: new Date().toISOString(),
    }, fields);
  }

  function exampleTasks() {
    const steps = list => list.map(text => ({ id: uid(), text, done: false }));
    return [
      makeTask({ title: 'Beber un vaso de agua', energy: 'low', minutes: 5, today: true, list: 'Personal', example: true }),
      makeTask({ title: 'Ordenar el escritorio', energy: 'med', minutes: 15, today: true, list: 'Casa', example: true, steps: steps(['Tirar lo que sea basura', 'Guardar 5 cosas', 'Limpiar la superficie']) }),
      makeTask({ title: 'Pedir cita con el médico', energy: 'med', minutes: 10, list: 'Personal', remindAt: L.nextAt(17), example: true, steps: steps(['Buscar el número', 'Llamar', 'Apuntar la fecha en la agenda']) }),
      makeTask({ title: 'Preparar la presentación', energy: 'high', minutes: 45, list: 'Trabajo / estudio', example: true }),
      makeTask({ title: 'Responder un correo pendiente', energy: 'low', minutes: 10, example: true }),
    ];
  }

  function freshState(withExamples) {
    return {
      version: 2,
      lists: [INBOX, 'Personal', 'Casa', 'Trabajo / estudio'],
      tasks: withExamples ? exampleTasks() : [],
      log: [],
      stars: 0,
      battery: null,
      focus: { taskId: null, minutes: 15, lastMinutes: 15, isBreak: false, phase: 'idle', endAt: null, remaining: null, total: null },
      settings: { sound: true, calm: false, theme: 'system', nag: true, goal: 3 },
      lastVisit: Date.now(),
    };
  }

  function normalize(data) {
    const base = freshState(false);
    const s = Object.assign(base, data, { version: 2 });
    s.settings = Object.assign(freshState(false).settings, data.settings);
    s.settings.goal = Math.min(5, Math.max(1, Number(s.settings.goal) || 3));
    s.focus = Object.assign(freshState(false).focus, data.focus);
    s.lists = Array.isArray(data.lists) && data.lists.length ? data.lists.map(String) : freshState(false).lists;
    if (!s.lists.includes(INBOX)) s.lists.unshift(INBOX);
    s.log = Array.isArray(data.log) ? data.log.filter(e => e && e.at) : [];
    s.stars = Math.max(0, Number(data.stars) || 0);
    s.tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(Boolean).map(t => {
      const task = makeTask(t);
      task.title = String(task.title || 'Sin nombre');
      task.steps = Array.isArray(task.steps) ? task.steps.filter(Boolean).map(x => ({ id: x.id || uid(), text: String(x.text || ''), done: !!x.done })) : [];
      if (!ENERGY[task.energy]) task.energy = 'med';
      if (!REPEAT[task.repeat]) task.repeat = 'none';
      if (!s.lists.includes(task.list)) s.lists.push(task.list);
      return task;
    });
    return s;
  }

  function loadState(id) {
    const data = readProfileState(id);
    return data ? normalize(data) : null;
  }

  let profiles = loadProfiles();
  let state = loadState(profiles.active) || freshState(profiles.list.length === 1);
  let saveTimer = null;
  let storageWarned = false;

  function warnStorage() {
    if (storageWarned) return;
    storageWarned = true;
    toast('Este navegador no me deja guardar. Tus cambios se perderán al cerrar.');
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!store.set(stateKey(profiles.active), JSON.stringify(state))) warnStorage();
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
    panel: null,
    search: '',
    suggesting: false,
    suggestId: null,
    skipped: new Set(),
    confirm: null,
    sheet: null,
    sheetOpener: null,
    editProfile: null,
    photoDraft: null,
    photoPending: null,
    editPhotoOrig: undefined,
    photoToasts: [],
    creatingProfile: false,
    reminderQueue: [],
    remNote: '',
    focusNote: '',
    focusDoneMsg: '',
    noteSlot: 0,
    noise: false,
    justDone: null,
    renderDay: null,
  };

  function resetUi() {
    Object.assign(ui, {
      filter: 'all', showDone: false, newList: false, panel: null, search: '', suggesting: false, suggestId: null,
      confirm: null, editProfile: null, reminderQueue: [], focusNote: '', focusDoneMsg: '', noteSlot: 0,
    });
    ui.open.clear();
    ui.skipped.clear();
  }

  /* ---------- Render ---------- */

  const view = $('view');

  function render() {
    const active = document.activeElement;
    const activeId = active && active.id;
    let sel = null;
    try { if (active && typeof active.selectionStart === 'number') sel = [active.selectionStart, active.selectionEnd]; } catch (e) { /* sin selección */ }
    ui.renderDay = todayKey();
    renderHeader();
    document.querySelectorAll('[data-tab]').forEach(b => {
      b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
      b.classList.toggle('is-live', b.dataset.tab === 'enfoque' && state.focus.phase === 'running');
    });
    view.innerHTML = { hoy: viewHoy, tareas: viewTareas, enfoque: viewEnfoque, logros: viewLogros }[ui.tab]();
    renderReminder();
    paintTimer();
    // El contenido se rehace entero: devolvemos el foco (y el cursor) al control equivalente.
    if (activeId && !view.contains(active)) {
      const el = $(activeId);
      if (el && el !== document.activeElement) {
        el.focus({ preventScroll: true });
        if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* no admite selección */ }
      }
    }
    if (ui.justDone) setTimeout(() => { ui.justDone = null; }, 0);
  }

  // La cabecera solo se toca si cambió el perfil, para no recargar la foto en cada render.
  let shownProfile = {};
  function renderHeader() {
    const p = currentProfile();
    if (p.id !== shownProfile.id || p.name !== shownProfile.name || p.color !== shownProfile.color || p.photo !== shownProfile.photo) {
      shownProfile = { id: p.id, name: p.name, color: p.color, photo: p.photo };
      const av = $('profileAvatar');
      av.style.background = safeColor(p.color);
      av.classList.toggle('has-photo', !!p.photo);
      av.innerHTML = avatarInner(p);
      $('profileName').textContent = p.name;
      $('profileBtn').setAttribute('aria-label', `Perfil: ${p.name}. Cambiar de perfil`);
    }
    $('captureInput').placeholder = pickDaily(PLACEHOLDERS);
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

  // ctx distingue la misma tarea mostrada en dos sitios, para que los id sean únicos.
  function taskRow(t, opts = {}) {
    const ctx = opts.ctx || 't';
    const open = ui.open.has(t.id);
    const n = Date.now();
    const meta = [`<span class="chip">${battery(t.energy)}${ENERGY[t.energy]}</span>`];
    if (t.minutes) meta.push(`<span class="chip">${ICON.clock}${minutesLabel(t.minutes)}</span>`);
    if (t.remindAt) {
      const late = !t.done && Date.parse(t.remindAt) <= n;
      meta.push(`<span class="chip ${late ? 'chip-alert' : 'chip-pen'}">${ICON.bell}${L.fmtWhen(t.remindAt, n)}</span>`);
    }
    if (t.repeat !== 'none') meta.push(`<span class="chip">${ICON.repeat}${REPEAT[t.repeat]}</span>`);
    if (t.steps.length) meta.push(`<span class="chip">${ICON.steps}${t.steps.filter(s => s.done).length}/${t.steps.length} pasos</span>`);
    if (opts.showList) meta.push(`<span class="chip">${esc(t.list)}</span>`);
    if (t.example) meta.push('<span class="chip chip-example">ejemplo</span>');
    const cls = ['task', t.done && 'is-done', open && 'is-open', ui.justDone === t.id && 'just-done'].filter(Boolean).join(' ');
    return `<li class="${cls}" data-id="${t.id}">
      <div class="task-row">
        <button class="check" id="${ctx}-chk-${t.id}" data-action="toggle" aria-pressed="${t.done}" aria-label="${t.done ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${esc(t.title)}">${ICON.check}</button>
        <button class="task-main" id="${ctx}-exp-${t.id}" data-action="expand" aria-expanded="${open}">
          <span class="task-title"><span class="hl">${esc(t.title)}</span></span>
          <span class="meta">${meta.join('')}</span>
        </button>
        <button class="star" id="${ctx}-star-${t.id}" data-action="star" aria-pressed="${t.today}" aria-label="${t.today ? 'Quitar de mi foco de hoy' : 'Añadir a mi foco de hoy'}: ${esc(t.title)}">${ICON.star}</button>
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
    if (t.remindAt) opts.push(['none', 'Quitar hora']);
    return opts.map(([k, label]) => `<button class="chip-btn" data-action="remind-quick" data-when="${k}">${label}</button>`).join('');
  }

  function editor(t) {
    const id = t.id;
    const steps = t.steps.map(s => `<li class="step${s.done ? ' is-done' : ''}${ui.justDone === s.id ? ' just-done' : ''}">
        <button class="check sm" id="st-${s.id}" data-action="step-toggle" data-step="${s.id}" aria-pressed="${s.done}" aria-label="${s.done ? 'Desmarcar' : 'Marcar'} paso: ${esc(s.text)}">${ICON.check}</button>
        <span class="hl">${esc(s.text)}</span>
        <button class="x" data-action="step-del" data-step="${s.id}" aria-label="Quitar paso: ${esc(s.text)}">${ICON.x}</button>
      </li>`).join('');
    const starters = t.steps.length ? '' : `<div class="quick"><span class="hint">¿Te cuesta empezar? Prueba con:</span>${STARTERS.map(s => `<button class="chip-btn" data-action="step-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
    return `<div class="editor">
      <label class="field"><span class="field-label">Nombre</span>
        <input class="input" id="title-${id}" data-field="title" value="${esc(t.title)}" maxlength="200" autocomplete="off"></label>
      <div class="field"><span class="field-label">Pasos pequeños</span>
        ${steps ? `<ul class="steps">${steps}</ul>` : ''}
        <form class="inline-form step-form" data-id="${id}" autocomplete="off">
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
    const winsToday = state.log.filter(e => isWin(e) && L.dayKey(e.at) === todayKey()).length;
    const goal = state.settings.goal;
    const level = currentBattery();
    const h = new Date(n).getHours();
    const name = currentProfile().name;
    const hello = h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches';
    const dateLine = L.fmtLongDate(n) + (profiles.list.length > 1 || name !== 'Yo' ? ` · ${name}` : '');

    const glance = [];
    if (focusPending) glance.push(['', `${plural(focusPending, 'tarea', 'tareas')} en tu foco de hoy`]);
    if (overdue.length) glance.push(['is-alert', `${plural(overdue.length, 'aviso pasó', 'avisos pasaron')} de hora (sin culpa)`]);
    const laterToday = upcoming.filter(t => L.dayDiff(t.remindAt, n) === 0).length;
    if (laterToday) glance.push(['', `${plural(laterToday, 'aviso', 'avisos')} más tarde`]);
    if (inbox.length) glance.push(['is-muted', `${plural(inbox.length, 'idea', 'ideas')} en la Bandeja sin ordenar`, 'go-inbox']);
    if (!focus.length && pending.length) glance.push(['is-muted', 'Aún no elegiste tu foco de hoy', 'go-tareas']);
    if (winsToday) glance.push(['is-good', `${plural(winsToday, 'logro', 'logros')} hoy`, 'go-logros']);
    const glanceHtml = glance.length
      ? `<ul class="glance">${glance.map(([cls, text, action]) => `<li class="${cls}"><span class="dot"></span>${action ? `<button data-action="${action}">${text}</button>` : `<span>${text}</span>`}</li>`).join('')}</ul>`
      : '<p>Todo tranquilo. Anota algo arriba si se te ocurre, o descansa.</p>';

    const needsNotif = !EMBEDDED && 'Notification' in window && Notification.permission === 'default' && pending.some(t => t.remindAt);

    return `
      <section class="hello" aria-labelledby="hello-h">
        <p class="eyebrow" id="hello-date">${esc(dateLine)}</p>
        <h1 class="view-title" id="hello-h">${esc(hello)}</h1>
        <p class="margin-note">${esc(pickDaily(MSG.daily))}</p>
        <div class="panel"><p class="eyebrow">Tu día en un vistazo</p>${glanceHtml}</div>
      </section>
      ${examplesBanner()}
      ${needsNotif ? `<div class="banner"><p>Tienes tareas con aviso. Activa los avisos para que Pasito te llame aunque estés en otra pestaña.</p><button class="btn primary sm" data-action="notif-enable">Activar avisos</button></div>` : ''}

      <section class="block" aria-labelledby="batt-h">
        <h2 id="batt-h">¿Cómo está tu batería ahora?</h2>
        <div class="seg" role="group" aria-labelledby="batt-h">
          ${['low', 'med', 'high'].map(l => `<button class="seg-btn" id="batt-${l}" data-action="battery" data-level="${l}" aria-pressed="${level === l}">${battery(l)}<span>${ENERGY[l]}</span></button>`).join('')}
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
          <button class="check" id="att-chk-${t.id}" data-action="toggle" aria-pressed="false" aria-label="Marcar como hecha: ${esc(t.title)}">${ICON.check}</button>
          <div><p class="attn-title">${esc(t.title)}</p><p class="attn-when">${ICON.bell}era ${L.fmtWhen(t.remindAt, n)}</p>
          <div class="row">${quickButtons(t)}</div></div></li>`).join('')}</ul>
      </section>` : ''}

      <section class="block" aria-labelledby="foco-h">
        <div class="block-head"><h2 id="foco-h">Mi foco de hoy</h2><span class="count">${focus.length} de 3</span></div>
        ${focus.length ? `<ul class="tasks">${focus.map(t => taskRow(t, { showList: true, ctx: 'foco' })).join('')}</ul>`
          : `<div class="empty"><p>Marca hasta 3 tareas con la estrella ${ICON.star} para tenerlas aquí.</p><button class="btn" data-action="go-tareas">Elegir en Tareas</button></div>`}
        ${focus.length > 3 ? '<p class="hint">Tienes más de 3. Menos es más: ¿alguna puede esperar a mañana?</p>' : ''}
      </section>

      ${upcoming.length ? `<section class="block" aria-labelledby="up-h">
        <h2 id="up-h">Próximos avisos</h2>
        <ul class="upcoming">${upcoming.slice(0, 5).map(t => `<li><span class="when">${L.fmtWhen(t.remindAt, n)}</span><span class="what">${esc(t.title)}</span></li>`).join('')}</ul>
      </section>` : ''}

      <section class="block" aria-labelledby="prog-h">
        <div class="block-head"><h2 id="prog-h">Hoy</h2><span class="count">${plural(winsToday, 'logro', 'logros')}</span></div>
        <div class="meter" role="progressbar" aria-labelledby="prog-h" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(winsToday, goal)}"><span style="width:${Math.min(winsToday / goal, 1) * 100}%"></span></div>
        <p class="hint">${winsToday >= goal ? '¡Meta suave cumplida! Todo lo demás es extra.'
          : winsToday ? `Meta suave: ${goal}. ${goal - winsToday === 1 ? 'Te falta 1' : `Te faltan ${goal - winsToday}`}, sin prisa.`
          : `Meta suave: ${plural(goal, 'pequeña victoria', 'pequeñas victorias')}. Cualquier cosa cuenta.`}</p>
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
        <button class="btn primary big" id="suggestBtn" data-action="suggest">Dime qué hago ahora</button>`;
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
        <button class="btn ghost" id="suggestOther" data-action="suggest-other">Otra opción</button>
        ${t.steps.length ? '' : '<button class="btn ghost" data-action="split">Dividir en pasos</button>'}
      </div>
    </div>`;
  }

  /* ----- Tareas ----- */

  function dumpPanel() {
    return `<form class="panel stack" id="dumpForm" autocomplete="off">
      <h2 class="panel-title">Vaciar la cabeza</h2>
      <p class="hint">Escribe todo lo que te ronda, una cosa por línea, sin ordenar. Si pones «mañana a las 10» o «en 20 min», creo el aviso.</p>
      <label class="sr-only" for="dumpText">Ideas, una por línea</label>
      <textarea class="input" id="dumpText" rows="6" placeholder="Comprar pan&#10;Llamar al banco mañana a las 10&#10;Buscar regalo de cumpleaños"></textarea>
      <div class="row"><button class="btn primary" type="submit">Guardar todo en la Bandeja</button><button class="btn ghost" type="button" data-action="panel" data-panel="">Cerrar</button></div>
    </form>`;
  }

  function templatesPanel() {
    return `<div class="panel stack">
      <h2 class="panel-title">Rutinas listas para usar</h2>
      <p class="hint">Se añaden con sus pasos y su aviso. Después cámbialas a tu manera.</p>
      <ul class="template-list">${TEMPLATES.map((tp, i) => `<li><button class="template" data-action="template-add" data-i="${i}">
        <span class="tp-title">${esc(tp.title)}</span>
        <span class="hint">${tp.steps.length} pasos · ${REPEAT[tp.repeat]}${tp.hour != null ? ` · aviso a las ${pad2(tp.hour)}:00` : ''}</span>
      </button></li>`).join('')}</ul>
      <div class="row"><button class="btn ghost" data-action="panel" data-panel="">Cerrar</button></div>
    </div>`;
  }

  function matchesSearch(t, q) {
    if (!q) return true;
    return L.searchKey([t.title, t.notes, ...t.steps.map(s => s.text)].join(' ')).includes(q);
  }

  function viewTareas() {
    if (ui.filter !== 'all' && !state.lists.includes(ui.filter)) ui.filter = 'all';
    const counts = {};
    state.tasks.forEach(t => { if (!t.done) counts[t.list] = (counts[t.list] || 0) + 1; });
    const total = state.tasks.filter(t => !t.done).length;
    const doneCount = state.tasks.length - total;
    const q = L.searchKey(ui.search.trim());
    const chips = [`<button class="filter" id="flt-all" data-action="filter" data-list="all" aria-pressed="${ui.filter === 'all'}">Todas <span class="n">${total}</span></button>`]
      .concat(state.lists.map((l, i) => `<button class="filter" id="flt-${i}" data-action="filter" data-list="${esc(l)}" aria-pressed="${ui.filter === l}">${esc(l)} <span class="n">${counts[l] || 0}</span></button>`));
    chips.push(ui.newList
      ? `<form class="new-list" id="newListForm" autocomplete="off"><label class="sr-only" for="newListInput">Nombre de la lista</label>
          <input class="input" id="newListInput" maxlength="40" placeholder="Nombre de la lista">
          <button class="btn sm primary" type="submit">Crear</button><button class="btn sm ghost" type="button" data-action="new-list-cancel">Cancelar</button></form>`
      : '<button class="filter add" id="flt-new" data-action="new-list">+ Nueva lista</button>');

    const shown = ui.filter === 'all' ? state.lists : [ui.filter];
    const groups = shown.map(l => {
      const items = state.tasks.filter(t => t.list === l && (ui.showDone || !t.done) && matchesSearch(t, q)).sort(taskOrder);
      if (!items.length && (ui.filter === 'all' || q)) return '';
      const del = l !== INBOX && ui.filter === l ? `<button class="btn sm ghost danger-text" data-action="list-delete" data-list="${esc(l)}">Borrar lista</button>` : '';
      return `<section class="group" aria-label="${esc(l)}">
        <div class="block-head"><h2>${esc(l)}</h2>${del}</div>
        ${items.length ? `<ul class="tasks">${items.map(t => taskRow(t)).join('')}</ul>`
          : `<p class="empty-line">Nada por aquí. Escribe arriba y se guardará en «${esc(l)}».</p>`}
      </section>`;
    }).join('');

    const inboxCount = counts[INBOX] || 0;
    const showSearch = state.tasks.length > 6 || ui.search;
    const empty = q ? `<div class="empty"><p>Nada coincide con «${esc(ui.search.trim())}».</p></div>`
      : '<div class="empty"><p>No hay tareas pendientes. Cuando se te ocurra algo, escríbelo arriba.</p></div>';
    return `
      <h1 class="view-title">Tareas</h1>
      <div class="row">
        <button class="btn sm" id="tool-dump" data-action="panel" data-panel="dump" aria-expanded="${ui.panel === 'dump'}">Vaciar la cabeza</button>
        <button class="btn sm" id="tool-tpl" data-action="panel" data-panel="templates" aria-expanded="${ui.panel === 'templates'}">Añadir rutina</button>
      </div>
      ${ui.panel === 'dump' ? dumpPanel() : ''}${ui.panel === 'templates' ? templatesPanel() : ''}
      <div class="filters" role="group" aria-label="Listas">${chips.join('')}</div>
      ${showSearch ? `<label class="search"><span class="sr-only">Buscar en tus tareas</span><input class="input" type="search" id="taskSearch" placeholder="Buscar en tus tareas" value="${esc(ui.search)}" autocomplete="off"></label>` : ''}
      ${examplesBanner()}
      ${inboxCount && !q && (ui.filter === 'all' || ui.filter === INBOX) ? '<p class="hint">La Bandeja es para soltar ideas rápido. Cuando puedas, ábrelas y dales lista, tiempo y energía: así sabrás qué hacer después.</p>' : ''}
      <div class="groups">${groups || empty}</div>
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
    if (running) controls = '<button class="btn primary" id="focusMain" data-action="focus-pause">Pausar</button>';
    else if (!finished) controls = `<button class="btn primary" id="focusMain" data-action="focus-start">${paused ? 'Seguir' : 'Empezar'}</button>`;
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
      <div class="noise">
        <button class="btn sm${ui.noise ? ' primary' : ''}" id="noiseBtn" data-action="noise" aria-pressed="${ui.noise}">${ui.noise ? 'Apagar ruido marrón' : 'Poner ruido marrón'}</button>
        <p class="hint">Un sonido de fondo constante ayuda a muchas personas con TDAH a concentrarse.</p>
      </div>
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
        <p class="hint">Ganas estrellas al terminar tareas (más si piden más energía), pasos, sesiones de enfoque y logros que anotas.</p>
      </section>
      <section class="block" aria-labelledby="win-h">
        <h2 id="win-h">¿Hiciste algo que no estaba en la lista?</h2>
        <form class="inline-form" id="winForm" autocomplete="off">
          <label class="sr-only" for="winInput">Lo que hiciste</label>
          <input class="input" id="winInput" maxlength="120" placeholder="Ej.: contesté ese correo difícil">
          <button class="btn primary" type="submit">Anotar</button>
        </form>
        <p class="hint">También cuenta. Anótalo y gana una estrella.</p>
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
      if (!isWin(e)) continue;
      if (L.dayDiff(e.at, n) < -days) break;
      const k = L.dayKey(e.at);
      if (!groups.has(k)) groups.set(k, { label: L.fmtDay(e.at, n), items: [] });
      groups.get(k).items.push(e);
    }
    if (!groups.size) return '';
    const label = e => (e.kind === 'focus' ? `Enfoque ${e.minutes} min${e.title ? ' · ' + e.title : ''}` : e.title);
    return `<div class="done-days">${[...groups.values()].map(g => `<div class="done-day"><h3>${esc(g.label)}</h3>
      <ul class="done-list">${g.items.map(e => `<li><span class="hl on">${esc(label(e))}</span><span class="stars-pill">+${e.stars} ★</span></li>`).join('')}</ul></div>`).join('')}</div>`;
  }

  /* ----- Hojas: ajustes y perfiles ----- */

  const sheetEl = $('sheet');

  function settingsSheet() {
    const s = state.settings;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const notifText = {
      unsupported: 'Aquí el navegador no permite avisos del sistema. Los recordatorios aparecerán dentro de Pasito mientras esté abierto.',
      granted: 'Avisos activados. Te aviso aunque Pasito esté en otra pestaña o minimizado.',
      denied: 'Los avisos están bloqueados para esta página. Puedes permitirlos en los ajustes del navegador (el candado junto a la dirección).',
      default: 'Activa los avisos para que Pasito te llame la atención aunque estés en otra pestaña.',
    }[perm];
    return `
      <p class="hint">Estos ajustes son del perfil <strong>${esc(currentProfile().name)}</strong>.</p>
      <div class="set-group"><h3>Avisos</h3>
        <p class="hint">${notifText}</p>
        <div class="row">
          ${perm === 'default' ? '<button class="btn primary" data-action="notif-enable">Activar avisos</button>' : ''}
          <button class="btn" data-action="notif-test">Probar un aviso</button>
        </div>
        <label class="switch"><input type="checkbox" id="setNag" ${s.nag ? 'checked' : ''}><span>Insistir si no respondo (hasta 2 veces, cada 10 min)</span></label>
        ${EMBEDDED ? '' : '<p class="hint">Con el navegador cerrado ninguna web puede avisarte. Para lo importante, abre la tarea y usa «Añadir a mi calendario».</p>'}
      </div>
      <div class="set-group"><h3>Comodidad</h3>
        <label class="switch"><input type="checkbox" id="setSound" ${s.sound ? 'checked' : ''}><span>Sonidos suaves</span></label>
        <label class="switch"><input type="checkbox" id="setCalm" ${s.calm ? 'checked' : ''}><span>Menos animaciones y confeti</span></label>
        <label class="field"><span class="field-label">Meta suave de logros al día</span>
          <select class="input" id="setGoal">${[1, 2, 3, 4, 5].map(g => `<option value="${g}" ${g === s.goal ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
      </div>
      <fieldset class="set-group"><legend>Tema</legend>
        <div class="seg">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<label class="seg-btn"><input type="radio" name="theme" id="theme-${v}" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      </fieldset>
      <details class="set-group tips"><summary>Trucos para anotar más rápido</summary>
        <ul class="tip-list">
          <li><strong>mañana a las 5</strong>: aviso mañana a las 17:00 (escribe «de la mañana» si es temprano)</li>
          <li><strong>en 20 minutos</strong>, <strong>en media hora</strong>: aviso dentro de ese tiempo</li>
          <li><strong>el viernes 10:00</strong>, <strong>pasado mañana</strong>, <strong>esta tarde</strong>, <strong>mañana por la noche</strong></li>
          <li><strong>hoy</strong>: va directo a tu foco de hoy</li>
          <li>En el ordenador, pulsa <kbd>/</kbd> para escribir sin usar el ratón</li>
        </ul>
      </details>
      <div class="set-group"><h3>Tus datos</h3>
        <p class="hint">Todo se guarda solo en este navegador y en este dispositivo. La copia incluye solo este perfil (sin la foto).</p>
        <div class="row">
          ${EMBEDDED ? '' : '<button class="btn" data-action="export-download">Descargar copia</button>'}
          <button class="btn" data-action="export-copy">Copiar copia</button>
          <label class="btn" for="importFile">Importar archivo</label>
          <input type="file" id="importFile" accept="application/json,.json" class="sr-only">
        </div>
        <label class="field"><span class="field-label">O pega aquí una copia para restaurarla en este perfil</span>
          <textarea class="input" id="importText" rows="2" spellcheck="false"></textarea></label>
        <div class="row"><button class="btn sm" data-action="import-text">Restaurar desde el texto</button></div>
      </div>
      <div class="set-group"><h3>Limpieza</h3>
        <div class="row">
          <button class="btn" data-action="clear-done">Borrar tareas hechas</button>
          ${ui.confirm === 'reset'
            ? '<span class="confirm">¿Seguro? Se borra todo este perfil. <button class="btn sm danger" data-action="reset-yes">Sí, borrar todo</button><button class="btn sm ghost" data-action="confirm-no">No</button></span>'
            : '<button class="btn ghost danger-text" data-action="reset-ask">Borrar todo</button>'}
        </div>
      </div>`;
  }

  function colorPicker(prefix, selected) {
    return `<fieldset class="field"><legend class="field-label">Color</legend><div class="swatches">${PROFILE_COLORS.map(([c, name], i) => `<label class="swatch" style="--sw:${c}">
      <input type="radio" name="${prefix}Color" id="${prefix}-c${i}" value="${c}" ${c === selected ? 'checked' : ''}><span class="sr-only">${name}</span></label>`).join('')}</div></fieldset>`;
  }

  function photoField(prefix, p) {
    return `<div class="field"><span class="field-label">Foto (opcional)</span>
      <div class="photo-row">
        ${avatar(p, { id: `${prefix}-preview`, cls: 'avatar-lg' })}
        <div class="photo-actions">
          <button class="btn sm" type="button" id="${prefix}-pick" data-action="photo-pick" data-prefix="${prefix}">${p.photo ? 'Cambiar foto' : 'Elegir foto'}</button>
          <button class="btn sm ghost danger-text" type="button" id="${prefix}-photo-del" data-action="photo-remove" data-prefix="${prefix}" ${p.photo ? '' : 'hidden'}>Quitar foto</button>
        </div>
        <input type="file" id="${prefix}-photo" data-photo="${prefix}" accept="image/*" class="sr-only" tabindex="-1" aria-hidden="true">
      </div>
      <p class="hint">${prefix === 'pe' ? 'Se ve al momento; «Cancelar» la deja como estaba. ' : ''}Se recorta en cuadrado y se guarda en pequeño, solo en este dispositivo.</p>
    </div>`;
  }

  function profilesSheet() {
    const used = new Set(profiles.list.map(p => p.color));
    const nextColor = (PROFILE_COLORS.find(([c]) => !used.has(c)) || PROFILE_COLORS[0])[0];
    const items = profiles.list.map(p => {
      const active = p.id === profiles.active;
      if (ui.editProfile === p.id) {
        const del = profiles.list.length < 2 ? ''
          : ui.confirm === 'pdel:' + p.id
            ? `<span class="confirm">Se borran sus tareas y estrellas. <button class="btn sm danger" type="button" data-action="profile-delete" data-pid="${p.id}">Sí, borrar</button><button class="btn sm ghost" type="button" data-action="confirm-no">No</button></span>`
            : `<button class="btn sm ghost danger-text" type="button" data-action="profile-delete-ask" data-pid="${p.id}">Borrar perfil</button>`;
        return `<li class="profile-item is-editing"><form class="stack" id="profileEditForm" data-pid="${p.id}" autocomplete="off">
          <label class="field"><span class="field-label">Nombre</span><input class="input" id="peName" maxlength="24" value="${esc(p.name)}"></label>
          ${photoField('pe', p)}
          ${colorPicker('pe', p.color)}
          <div class="row"><button class="btn sm primary" type="submit">Guardar</button><button class="btn sm ghost" type="button" data-action="profile-edit-cancel">Cancelar</button>${del}</div>
        </form></li>`;
      }
      const data = active ? state : readProfileState(p.id);
      const pending = data ? data.tasks.filter(t => t && !t.done).length : 0;
      const stars = data ? Number(data.stars) || 0 : 0;
      return `<li class="profile-item">
        <button class="profile-pick" id="pp-${p.id}" data-action="profile-switch" data-pid="${p.id}" aria-pressed="${active}">
          ${avatar(p)}<span class="pinfo"><span class="pname">${esc(p.name)}${active ? '<span class="sr-only"> (en uso)</span>' : ''}</span><span class="hint">${plural(pending, 'pendiente', 'pendientes')} · ${stars} ★</span></span>
        </button>
        <button class="btn sm ghost" id="pe-${p.id}" data-action="profile-edit" data-pid="${p.id}">Editar</button>
      </li>`;
    }).join('');
    return `
      <div class="set-group"><h3>¿Quién usa Pasito ahora?</h3>
        <ul class="profile-list">${items}</ul>
        <p class="hint">Toca «Editar» para cambiar el nombre, la foto o el color. Cada perfil tiene sus propias listas, avisos, estrellas y ajustes: sirve para compartir el dispositivo o para separar, por ejemplo, trabajo y casa. Los avisos de los demás perfiles también te llegan.</p>
      </div>
      <form class="set-group" id="profileNewForm" autocomplete="off"><h3>Nuevo perfil</h3>
        <label class="field"><span class="field-label">Nombre</span><input class="input" id="pnName" maxlength="24" placeholder="Ej.: Trabajo, Casa, Ana"></label>
        ${photoField('pn', { name: '', color: nextColor, photo: ui.photoDraft })}
        ${colorPicker('pn', nextColor)}
        <label class="switch"><input type="checkbox" id="pnExamples"><span>Empezar con tareas de ejemplo</span></label>
        <div class="row"><button class="btn primary" type="submit">Crear y usar este perfil</button></div>
      </form>
      <p class="hint">Los perfiles no tienen contraseña: cualquiera que use este dispositivo puede abrirlos.</p>`;
  }

  function renderSheet() {
    if (!ui.sheet) return;
    $('sheetTitle').textContent = ui.sheet === 'profiles' ? 'Perfiles' : 'Ajustes';
    sheetEl.querySelector('.sheet-body').innerHTML = ui.sheet === 'profiles' ? profilesSheet() : settingsSheet();
  }

  function openSheet(name, opener) {
    ui.sheet = name;
    ui.sheetOpener = opener || null;
    ui.confirm = null;
    ui.editProfile = null;
    ui.photoDraft = null;
    ui.editPhotoOrig = undefined;
    sheetEl.hidden = false;
    renderSheet();
    $('sheetClose').focus();
  }
  function closeSheet() {
    if (!ui.sheet) return;
    const opener = ui.sheetOpener;
    ui.sheet = null;
    ui.confirm = null;
    ui.editProfile = null;
    sheetEl.hidden = true;
    if (opener && document.body.contains(opener)) opener.focus();
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

  /* ---------- Recompensas y sonido ---------- */

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
    setTimeout(() => removeToast(id), opts.action ? 8000 : 3800);
    return id;
  }
  function removeToast(id) {
    const el = $(id);
    if (el) el.remove();
    toastActions.delete(id);
  }
  function clearToasts() {
    toastsEl.innerHTML = '';
    toastActions.clear();
  }

  let audioCtx = null;
  function audio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function unlockAudio() {
    if (!state.settings.sound || audioCtx) return;
    try { audio(); } catch (e) { /* sin audio */ }
  }

  function chime(kind) {
    if (!state.settings.sound) return;
    try {
      const ctx = audio();
      const notes = { done: [523.25, 659.25, 783.99], step: [659.25, 783.99], reminder: [783.99, 587.33, 783.99, 587.33], focus: [523.25, 659.25, 783.99, 1046.5] }[kind] || [660];
      const t0 = ctx.currentTime + 0.02;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = t0 + i * 0.13;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.55);
      });
    } catch (e) { /* sin audio */ }
  }

  // Ruido marrón continuo: un búfer en bucle cuyo final empalma con el inicio, sin chasquidos.
  let noiseNode = null;
  function startNoise() {
    try {
      const ctx = audio();
      const len = ctx.sampleRate * 6;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      const drift = data[len - 1] - data[0];
      for (let i = 0; i < len; i++) data[i] -= drift * (i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 1.5);
      src.connect(gain).connect(ctx.destination);
      src.start();
      noiseNode = { src, gain };
      ui.noise = true;
    } catch (e) {
      ui.noise = false;
      toast('No pude reproducir sonido en este navegador.');
    }
  }
  function stopNoise() {
    ui.noise = false;
    if (!noiseNode) return;
    const { src, gain } = noiseNode;
    noiseNode = null;
    try {
      gain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.25);
      src.stop(audioCtx.currentTime + 1.2);
    } catch (e) { /* ya parado */ }
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

  const clearNag = t => { t.nagAt = null; t.nags = 0; };

  function completeTask(t, rect) {
    const at = new Date().toISOString();
    const stars = L.STARS[t.energy] || 3;
    t.done = true;
    t.doneAt = at;
    t.snoozes = 0;
    clearNag(t);
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
    clearNag(t);
    ui.reminderQueue = ui.reminderQueue.filter(x => x !== t.id);
    save();
    render();
    toast(date ? `Te aviso ${L.fmtWhen(t.remindAt)}.` : 'Hora quitada. La tarea sigue en tu lista.');
  }

  function addTask(fields) {
    const t = makeTask(fields);
    state.tasks.push(t);
    return t;
  }

  function withUndo(label, mutate) {
    const pid = profiles.active;
    const snapshot = JSON.stringify(state);
    mutate();
    save();
    applySettings();
    render();
    toast(label, {
      action: {
        label: 'Deshacer',
        run: () => {
          if (profiles.active !== pid) {
            store.set(stateKey(pid), snapshot);
            toast('Recuperado en el otro perfil.');
            return;
          }
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
    ui.search = '';
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
    withUndo('Copia restaurada en este perfil.', () => {
      state = normalize(data);
      resetUi();
    });
    renderSheet();
  }

  /* ---------- Perfiles: acciones ---------- */

  function pauseFocusQuietly() {
    const f = state.focus;
    if (f.phase !== 'running') return false;
    f.remaining = Math.max(0, f.endAt - Date.now());
    f.endAt = null;
    f.phase = 'paused';
    releaseWake();
    return true;
  }

  function activateProfile(id, saveCurrent) {
    const p = profiles.list.find(x => x.id === id);
    if (!p) return;
    let paused = false;
    if (saveCurrent) {
      paused = pauseFocusQuietly();
      save();
    }
    profiles.active = id;
    saveProfiles();
    state = loadState(id) || freshState(false);
    resetUi();
    ui.tab = 'hoy';
    try { history.replaceState(null, '', '#hoy'); } catch (e) { /* sin historial */ }
    clearToasts();
    stopNoise();
    applySettings();
    housekeeping();
    save();
    closeSheet();
    render();
    ensureTimer();
    tick();
    window.scrollTo(0, 0);
    toast(`Hola, ${p.name}.${paused ? ' Dejé en pausa la sesión de enfoque del otro perfil.' : ''}`, { hand: true });
  }

  function createProfile(name, color, withExamples, photo) {
    const p = { id: uid(), name, color: safeColor(color) };
    const fresh = freshState(withExamples);
    Object.assign(fresh.settings, { sound: state.settings.sound, calm: state.settings.calm, theme: state.settings.theme });
    // Primero lo esencial (tareas y ajustes); la foto, si no cabe, se descarta y se avisa.
    store.set(stateKey(p.id), JSON.stringify(fresh));
    profiles.list.push(p);
    let photoDropped = false;
    if (L.isSafePhoto(photo)) {
      p.photo = photo;
      if (!saveProfiles() && storageFull()) {
        delete p.photo;
        photoDropped = true;
      }
    }
    ui.photoDraft = null;
    activateProfile(p.id, true);
    // Después de activateProfile, que limpia los avisos anteriores.
    if (photoDropped) toast('No quedaba espacio para la foto; el perfil se creó sin ella. Puedes añadirla luego desde «Editar».');
  }

  /* ---------- Foto de perfil ---------- */

  // Recorta en cuadrado y reduce a PHOTO_SIZE. Primero a 1024 px como mucho y luego a la mitad cada vez,
  // para que no salga pixelada en navegadores que suavizan poco al reducir.
  function makePhoto(file) {
    return new Promise((resolve, reject) => {
      if (file.type && !/^image\//.test(file.type)) {
        reject(new Error('archivo'));
        return;
      }
      if (file.size > PHOTO_MAX_BYTES) {
        reject(new Error('grande'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const { sx, sy, side } = L.squareCrop(img.naturalWidth, img.naturalHeight);
          if (!side) throw new Error('vacía');
          let size = Math.min(side, 1024);
          let src = document.createElement('canvas');
          src.width = src.height = size;
          const ctx = src.getContext('2d');
          ctx.fillStyle = '#FFFFFF'; // las zonas transparentes quedan blancas en el JPEG
          ctx.fillRect(0, 0, size, size);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          while (size > PHOTO_SIZE) {
            const next = Math.max(PHOTO_SIZE, Math.round(size / 2));
            const c = document.createElement('canvas');
            c.width = c.height = next;
            const cx = c.getContext('2d');
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(src, 0, 0, size, size, 0, 0, next, next);
            src = c;
            size = next;
          }
          let data = src.toDataURL('image/jpeg', 0.85);
          if (data.length > PHOTO_MAX_CHARS) data = src.toDataURL('image/jpeg', 0.6);
          if (!L.isSafePhoto(data)) throw new Error('formato');
          resolve(data);
        } catch (e) {
          reject(e);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('ilegible'));
      };
      img.src = url;
    });
  }

  function refreshPhotoPreview(prefix) {
    const preview = $(`${prefix}-preview`);
    if (!preview) return;
    const p = prefix === 'pe' ? profiles.list.find(x => x.id === ui.editProfile) : null;
    const photo = p ? p.photo : ui.photoDraft;
    const name = ($(`${prefix}Name`) || {}).value || (p ? p.name : '');
    const color = (document.querySelector(`input[name="${prefix}Color"]:checked`) || {}).value || (p && p.color);
    preview.style.background = safeColor(color);
    preview.classList.toggle('has-photo', !!photo);
    preview.innerHTML = avatarInner({ name, photo });
    const pick = $(`${prefix}-pick`);
    const del = $(`${prefix}-photo-del`);
    pick.textContent = photo ? 'Cambiar foto' : 'Elegir foto';
    pick.removeAttribute('aria-busy');
    const hadFocus = document.activeElement === del;
    del.hidden = !photo;
    if (hadFocus && !photo) pick.focus();
  }

  function applyProfilePhoto(pid, photo, undoable) {
    const p = profiles.list.find(x => x.id === pid);
    if (!p) return false;
    const prev = p.photo || null;
    if (photo) p.photo = photo;
    else delete p.photo;
    if (!saveProfiles()) {
      if (storageFull()) {
        if (prev) p.photo = prev;
        else delete p.photo;
        toast('No queda espacio en este navegador para la foto. Borra tareas hechas que no necesites y prueba otra vez.');
        return false;
      }
      warnStorage(); // no se puede guardar nada: la foto se queda mientras la app esté abierta, como el resto
    }
    renderHeader();
    if (ui.editProfile === pid) refreshPhotoPreview('pe');
    else renderSheet();
    if (undoable && prev !== (photo || null)) {
      ui.photoToasts.push(toast(photo ? 'Foto de perfil guardada.' : 'Foto quitada.', { action: { label: 'Deshacer', run: () => applyProfilePhoto(pid, prev, false) } }));
    }
    return true;
  }

  // Nunca rechaza: el formulario de perfil nuevo espera a que termine (ui.photoPending) antes de crear el perfil.
  let photoSeq = 0;
  async function handlePhotoFile(prefix, file) {
    const pid = ui.editProfile;
    const seq = ++photoSeq;
    const pick = $(`${prefix}-pick`);
    if (pick) {
      pick.textContent = 'Preparando foto…';
      pick.setAttribute('aria-busy', 'true');
    }
    let data = null;
    try {
      data = await makePhoto(file);
    } catch (e) {
      if (seq !== photoSeq) return;
      refreshPhotoPreview(prefix);
      toast(e && e.message === 'grande'
        ? 'Esa imagen pesa demasiado (más de 30 MB). Prueba con otra o con una captura de pantalla.'
        : 'No pude leer esa imagen. Prueba con una foto JPG o PNG.');
      return;
    }
    if (seq !== photoSeq) return; // eligieron otra foto mientras tanto
    if (prefix === 'pe') applyProfilePhoto(pid, data, true);
    else {
      ui.photoDraft = data;
      refreshPhotoPreview('pn');
    }
  }

  function deleteProfile(id) {
    const idx = profiles.list.findIndex(x => x.id === id);
    if (idx < 0 || profiles.list.length < 2) return;
    const meta = profiles.list[idx];
    const wasActive = id === profiles.active;
    const raw = wasActive ? JSON.stringify(state) : store.get(stateKey(id));
    profiles.list.splice(idx, 1);
    store.remove(stateKey(id));
    ui.confirm = null;
    ui.editProfile = null;
    if (wasActive) activateProfile(profiles.list[0].id, false);
    else {
      saveProfiles();
      renderSheet();
    }
    toast(`Perfil «${meta.name}» borrado.`, {
      action: {
        label: 'Deshacer',
        run: () => {
          if (profiles.list.some(x => x.id === id)) return;
          profiles.list.splice(Math.min(idx, profiles.list.length), 0, meta);
          if (raw) store.set(stateKey(id), raw);
          saveProfiles();
          renderSheet();
          toast(`Perfil «${meta.name}» recuperado.`);
        },
      },
    });
  }

  // Avisos de los perfiles que no están abiertos: se muestran con su nombre.
  function checkOtherProfiles(now) {
    if (profiles.list.length < 2) return;
    for (const p of profiles.list) {
      if (p.id === profiles.active) continue;
      const data = readProfileState(p.id);
      if (!data) continue;
      let changed = false;
      for (const t of data.tasks) {
        if (!t || t.done || !t.remindAt || t.notified) continue;
        const at = Date.parse(t.remindAt);
        if (!(at <= now)) continue;
        t.notified = true;
        changed = true;
        if (now - at < 6 * HOUR) {
          chime('reminder');
          vibrate([120, 80, 120]);
          toast(`Aviso para ${p.name}: ${t.title}`, {
            action: {
              label: `Ir a ${p.name}`,
              run: () => {
                activateProfile(p.id, true);
                const x = byId(t.id);
                if (x && !x.done) {
                  ui.reminderQueue.push(x.id);
                  renderReminder();
                }
              },
            },
          });
          if (!document.hasFocus()) systemNotify(`${p.name} · ${t.title}`, 'Abre Pasito para verlo.', t.id, true);
        }
      }
      if (changed) store.set(stateKey(p.id), JSON.stringify(data));
    }
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
    if (f.phase === 'paused') return f.remaining || 0;
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
    pauseFocusQuietly();
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
    stopNoise();
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
    stopNoise();
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
    render();
    if (ui.tab !== 'enfoque') {
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
    if (t) {
      t.snoozes = 0;
      clearNag(t);
    }
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

  function fireReminder(t, isNag) {
    if (!ui.reminderQueue.includes(t.id)) ui.reminderQueue.push(t.id);
    ui.remNote = pick(isNag ? MSG.nag : MSG.reminder);
    t.nagAt = state.settings.nag && (t.nags || 0) < NAG_MAX ? new Date(Date.now() + NAG_EVERY).toISOString() : null;
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
      if (t.done || !t.remindAt) continue;
      if (!t.notified) {
        const at = Date.parse(t.remindAt);
        if (at <= n) {
          t.notified = true;
          changed = true;
          if (n - at < 6 * HOUR) fireReminder(t, false);
        }
      } else if (t.nagAt && Date.parse(t.nagAt) <= n) {
        // Aviso no atendido: se repite (hasta NAG_MAX veces) si el ajuste está activado.
        t.nagAt = null;
        changed = true;
        if (state.settings.nag && (t.nags || 0) < NAG_MAX) {
          t.nags = (t.nags || 0) + 1;
          fireReminder(t, true);
        }
      }
    }
    checkOtherProfiles(n);
    if (!changed) return;
    save();
    if (isTyping()) renderReminder();
    else render();
  }

  /* ---------- Eventos ---------- */

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
      const name = L.searchKey(t.title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tarea';
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
    panel(t, btn) {
      const p = btn.dataset.panel || null;
      ui.panel = ui.panel === p ? null : p;
      render();
      if (ui.panel === 'dump') $('dumpText').focus();
    },
    'template-add'(t, btn) {
      const tp = TEMPLATES[Number(btn.dataset.i)];
      if (!tp) return;
      if (!state.lists.includes(tp.list)) state.lists.push(tp.list);
      const task = addTask({
        title: tp.title, list: tp.list, energy: tp.energy, minutes: tp.minutes, repeat: tp.repeat,
        remindAt: tp.hour != null ? L.nextAt(tp.hour, 0, tp.weekday != null ? tp.weekday : null) : null,
        steps: tp.steps.map(text => ({ id: uid(), text, done: false })),
      });
      ui.panel = null;
      save();
      render();
      toast(`«${tp.title}» añadida. Cámbiala a tu manera.`, { action: { label: 'Ver', run: () => openTask(task.id) } });
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
      const f = state.focus;
      f.minutes = Number(btn.dataset.min);
      f.lastMinutes = f.minutes;
      f.isBreak = false;
      f.phase = 'idle';
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
      if (f.minutes !== 5) f.lastMinutes = f.minutes;
      f.isBreak = true;
      f.minutes = 5;
      f.phase = 'idle';
      focusStart();
    },
    'focus-complete-task'(t, btn) {
      const f = state.focus;
      const task = byId(f.taskId);
      f.phase = 'idle';
      f.minutes = f.lastMinutes || 15;
      f.taskId = null;
      if (task && !task.done) completeTask(task, btn.getBoundingClientRect());
      else {
        save();
        render();
      }
    },
    'focus-step-done'(t, btn) {
      const task = byId(state.focus.taskId);
      if (task) toggleStep(task, btn.dataset.step);
    },
    noise() {
      if (ui.noise) stopNoise();
      else startNoise();
      render();
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
    'rem-close'(t) {
      ui.reminderQueue.shift();
      if (t) {
        clearNag(t);
        save();
      }
      renderReminder();
    },
    'toast-act'(t, btn) {
      const run = toastActions.get(btn.dataset.toast);
      removeToast(btn.dataset.toast);
      if (run) run();
    },
    'open-settings'(t, btn) { openSheet('settings', btn); },
    'open-profiles'(t, btn) { openSheet('profiles', btn); },
    'close-sheet'() { closeSheet(); },
    'profile-switch'(t, btn) {
      if (btn.dataset.pid === profiles.active) closeSheet();
      else activateProfile(btn.dataset.pid, true);
    },
    'profile-edit'(t, btn) {
      ui.editProfile = btn.dataset.pid;
      const p = profiles.list.find(x => x.id === ui.editProfile);
      ui.editPhotoOrig = p ? p.photo || null : undefined;
      ui.photoToasts = [];
      ui.confirm = null;
      renderSheet();
      $('peName').focus();
    },
    'profile-edit-cancel'() {
      const pid = ui.editProfile;
      const p = profiles.list.find(x => x.id === pid);
      const orig = ui.editPhotoOrig;
      ui.editProfile = null;
      ui.editPhotoOrig = undefined;
      ui.confirm = null;
      if (p && orig !== undefined && (p.photo || null) !== orig) {
        ui.photoToasts.forEach(removeToast);
        applyProfilePhoto(pid, orig, false);
        toast('Foto como estaba.');
      }
      ui.photoToasts = [];
      renderSheet();
    },
    'profile-delete-ask'(t, btn) {
      ui.confirm = 'pdel:' + btn.dataset.pid;
      renderSheet();
    },
    'profile-delete'(t, btn) { deleteProfile(btn.dataset.pid); },
    'photo-pick'(t, btn) {
      const input = $(`${btn.dataset.prefix}-photo`);
      if (input) input.click();
    },
    'photo-remove'(t, btn) {
      if (btn.dataset.prefix === 'pe') applyProfilePhoto(ui.editProfile, null, true);
      else {
        ui.photoDraft = null;
        refreshPhotoPreview('pn');
      }
    },
    async 'notif-enable'() {
      if (!('Notification' in window)) {
        toast('Este navegador no permite avisos del sistema. Te avisaré dentro de la app.');
        return;
      }
      try { await Notification.requestPermission(); } catch (e) { /* rechazado */ }
      render();
      renderSheet();
      toast(Notification.permission === 'granted' ? 'Avisos activados.' : 'Sin permiso para avisos. Te avisaré dentro de la app mientras esté abierta.');
    },
    async 'notif-test'() {
      unlockAudio();
      chime('reminder');
      const ok = await systemNotify('Pasito', 'Así se verán tus avisos. ¡Todo listo!', 'pasito-test', false);
      toast(ok ? 'Aviso de prueba enviado.' : 'Los avisos del sistema no están activos aquí. Te avisaré dentro de la app con sonido.');
    },
    'export-download'() {
      const who = L.searchKey(currentProfile().name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil';
      download(`pasito-${who}-${todayKey()}.json`, JSON.stringify(state, null, 2), 'application/json');
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
      renderSheet();
    },
    'confirm-no'() {
      ui.confirm = null;
      renderSheet();
    },
    'reset-yes'() {
      ui.confirm = null;
      withUndo('Perfil vaciado. Empiezas de cero.', () => {
        state = freshState(false);
        resetUi();
      });
      renderSheet();
    },
  };

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      setTab(tab.dataset.tab);
      return;
    }
    if (e.target === sheetEl) {
      closeSheet();
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || !actions[btn.dataset.action]) return;
    const holder = btn.closest('[data-id]');
    actions[btn.dataset.action](holder ? byId(holder.dataset.id) : null, btn, e);
  });

  const submitters = {
    captureForm() {
      const input = $('captureInput');
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      const parsed = L.parseQuickInput(text, new Date());
      const list = ui.tab === 'tareas' && ui.filter !== 'all' ? ui.filter : INBOX;
      const t = addTask({ title: parsed.title, remindAt: parsed.remindAt, today: parsed.today, list });
      input.value = '';
      save();
      render();
      let msg = pick(MSG.capture);
      if (parsed.remindAt) msg += ` Te aviso ${L.fmtWhen(parsed.remindAt)}.`;
      else if (parsed.today) msg += ' Está en tu foco de hoy.';
      toast(msg, { hand: true, action: { label: 'Detalles', run: () => openTask(t.id) } });
    },
    dumpForm() {
      const lines = $('dumpText').value.split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, 100);
      if (!lines.length) {
        $('dumpText').focus();
        return;
      }
      const now = new Date();
      let withReminder = 0;
      lines.forEach(line => {
        const p = L.parseQuickInput(line, now);
        if (p.remindAt) withReminder++;
        addTask({ title: p.title.slice(0, 200), remindAt: p.remindAt, today: p.today, list: INBOX });
      });
      ui.panel = null;
      ui.filter = INBOX;
      save();
      render();
      toast(`${plural(lines.length, 'idea guardada', 'ideas guardadas')}${withReminder ? ` (${withReminder} con aviso)` : ''}. Tu cabeza te lo agradece.`, { hand: true });
    },
    winForm() {
      const input = $('winInput');
      const text = input.value.trim().slice(0, 120);
      if (!text) {
        input.focus();
        return;
      }
      state.stars += 1;
      state.log.push({ at: new Date().toISOString(), kind: 'win', title: text, stars: 1 });
      save();
      render();
      celebrate(null, pick(MSG.win), 1);
    },
    newListForm() {
      const name = $('newListInput').value.trim().slice(0, 40);
      if (!name) return;
      const existing = state.lists.find(l => l.toLowerCase() === name.toLowerCase());
      if (!existing) state.lists.push(name);
      ui.newList = false;
      ui.filter = existing || name;
      save();
      render();
      toast(existing ? `Ya tenías «${existing}».` : `Lista «${name}» creada. Lo que anotes ahora irá ahí.`);
    },
    async profileNewForm() {
      if (ui.creatingProfile) return;
      const name = $('pnName').value.trim().slice(0, 24);
      if (!name) {
        $('pnName').focus();
        toast('Ponle un nombre al perfil.');
        return;
      }
      const color = (document.querySelector('input[name="pnColor"]:checked') || {}).value;
      const examples = $('pnExamples').checked;
      ui.creatingProfile = true;
      try {
        if (ui.photoPending) await ui.photoPending; // la foto elegida aún se está preparando
        ui.photoPending = null;
        if (ui.sheet !== 'profiles') return; // cerraron la hoja mientras tanto
        createProfile(name, color, examples, ui.photoDraft);
      } finally {
        ui.creatingProfile = false;
      }
    },
    profileEditForm(form) {
      const p = profiles.list.find(x => x.id === form.dataset.pid);
      const name = $('peName').value.trim().slice(0, 24);
      if (!p || !name) return;
      p.name = name;
      p.color = safeColor((document.querySelector('input[name="peColor"]:checked') || {}).value);
      ui.editProfile = null;
      ui.editPhotoOrig = undefined;
      ui.photoToasts = [];
      saveProfiles();
      renderSheet();
      render();
      toast('Perfil guardado.');
    },
  };

  document.addEventListener('submit', e => {
    const form = e.target;
    e.preventDefault();
    if (submitters[form.id]) {
      submitters[form.id](form);
      return;
    }
    if (form.classList.contains('step-form')) {
      const t = byId(form.dataset.id);
      const input = form.querySelector('input');
      const text = input.value.trim();
      if (!t || !text) return;
      t.steps.push({ id: uid(), text, done: false });
      save();
      render();
      const again = $(`step-in-${t.id}`);
      if (again) again.focus();
    }
  });

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'pnName' || el.id === 'peName') {
      refreshPhotoPreview(el.id.slice(0, 2));
      return;
    }
    if (el.id === 'taskSearch') {
      ui.search = el.value;
      render();
      return;
    }
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

  const settingSwitches = { setSound: 'sound', setCalm: 'calm', setNag: 'nag' };

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.photo) {
      const file = el.files && el.files[0];
      el.value = '';
      if (file) {
        const job = handlePhotoFile(el.dataset.photo, file);
        if (el.dataset.photo === 'pn') ui.photoPending = job;
      }
      return;
    }
    if (el.name === 'pnColor' || el.name === 'peColor') {
      refreshPhotoPreview(el.name.slice(0, 2));
      return;
    }
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
    if (settingSwitches[el.id]) {
      state.settings[settingSwitches[el.id]] = el.checked;
      if (el.id === 'setNag' && !el.checked) state.tasks.forEach(clearNag);
      save();
      applySettings();
      if (el.id === 'setSound' && el.checked) chime('step');
      return;
    }
    if (el.id === 'setGoal') {
      state.settings.goal = Number(el.value) || 3;
      save();
      render();
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
      if (field === 'title' && !t.title.trim()) {
        t.title = 'Sin nombre';
        el.value = t.title;
      }
      save();
      return;
    }
    if (field === 'list') t.list = el.value;
    else if (field === 'minutes') t.minutes = Number(el.value) || null;
    else if (field === 'energy') t.energy = el.value;
    else if (field === 'repeat') t.repeat = el.value;
    else if (field === 'remindAt') {
      const d = el.value ? new Date(el.value) : null;
      t.remindAt = d && !isNaN(d) ? d.toISOString() : null;
      t.notified = false;
      clearNag(t);
    }
    save();
    render();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (ui.sheet) closeSheet();
      else if (!$('reminder').hidden) actions['rem-close'](byId($('reminder').dataset.id));
      return;
    }
    // Mantiene el foco del teclado dentro de la hoja abierta.
    if (e.key === 'Tab' && ui.sheet) {
      const items = [...sheetEl.querySelectorAll('button, input, select, textarea, summary')].filter(x => !x.disabled && x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.metaKey && !e.ctrlKey && !ui.sheet) {
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

  // Si Pasito está abierto en dos pestañas, la otra se actualiza sola.
  window.addEventListener('storage', e => {
    if (e.key === stateKey(profiles.active) && e.newValue) {
      try {
        state = normalize(JSON.parse(e.newValue));
      } catch (err) {
        return;
      }
      applySettings();
      ensureTimer();
      if (isTyping()) renderReminder();
      else render();
    } else if (e.key === PROFILES_KEY) {
      const keep = profiles.active;
      profiles = loadProfiles();
      if (profiles.list.some(p => p.id === keep)) profiles.active = keep;
      renderHeader();
      renderSheet();
    }
  });

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
