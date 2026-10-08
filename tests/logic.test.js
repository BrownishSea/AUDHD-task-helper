// Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// Jueves 8 de octubre de 2026, 10:00 hora local
const NOW = new Date(2026, 9, 8, 10, 0);
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();

test('captura: mañana a las 5 de la tarde', () => {
  const r = L.parseQuickInput('Llamar a mamá mañana a las 5 de la tarde', NOW);
  assert.equal(r.title, 'Llamar a mamá');
  assert.equal(r.remindAt, at(9, 17));
  assert.equal(r.today, false);
});

test('captura: números sueltos no son horas', () => {
  const r = L.parseQuickInput('Comprar 3 manzanas', NOW);
  assert.equal(r.title, 'Comprar 3 manzanas');
  assert.equal(r.remindAt, null);
});

test('captura: hora sola de hoy, o de mañana si ya pasó', () => {
  assert.equal(L.parseQuickInput('Pagar la luz 18:30', NOW).remindAt, at(8, 18, 30));
  assert.equal(L.parseQuickInput('Pagar la luz 8:30', NOW).remindAt, at(9, 8, 30));
});

test('captura: "a las 5" sin más se entiende como 17:00', () => {
  assert.equal(L.parseQuickInput('Recoger paquete a las 5', NOW).remindAt, at(8, 17));
});

test('captura: "hoy" sin hora va al foco del día sin aviso', () => {
  const r = L.parseQuickInput('Lavar ropa hoy', NOW);
  assert.equal(r.title, 'Lavar ropa');
  assert.equal(r.remindAt, null);
  assert.equal(r.today, true);
});

test('captura: esta tarde, pasado mañana y días de la semana', () => {
  assert.equal(L.parseQuickInput('Estudiar esta tarde', NOW).remindAt, at(8, 18));
  assert.equal(L.parseQuickInput('Dentista pasado mañana', NOW).remindAt, at(10, 9));
  const r = L.parseQuickInput('Pagar alquiler el lunes 10:00', NOW);
  assert.equal(r.title, 'Pagar alquiler');
  assert.equal(r.remindAt, at(12, 10));
  assert.equal(L.parseQuickInput('Reunión el jueves', NOW).remindAt, at(15, 9), 'mismo día de la semana = la próxima');
});

test('captura: tiempos relativos', () => {
  const r = L.parseQuickInput('Sacar la ropa de la lavadora en 45 min', NOW);
  assert.equal(r.title, 'Sacar la ropa de la lavadora');
  assert.equal(r.remindAt, at(8, 10, 45));
  assert.equal(L.parseQuickInput('Llamar en media hora', NOW).remindAt, at(8, 10, 30));
  assert.equal(L.parseQuickInput('Revisar el horno dentro de 2 horas', NOW).remindAt, at(8, 12));
  assert.equal(L.parseQuickInput('Pensar en 3 ideas', NOW).remindAt, null, 'un número sin unidad no es un aviso');
});

test('captura: mañana por la tarde', () => {
  const r = L.parseQuickInput('Ir al gimnasio mañana por la tarde', NOW);
  assert.equal(r.title, 'Ir al gimnasio');
  assert.equal(r.remindAt, at(9, 18));
  assert.equal(L.parseQuickInput('Correr mañana por la mañana', NOW).remindAt, at(9, 9));
});

test('próxima hora fija y búsqueda sin tildes', () => {
  assert.equal(L.nextAt(8, 0, null, NOW.getTime()), at(9, 8));
  assert.equal(L.nextAt(22, 0, null, NOW.getTime()), at(8, 22));
  assert.equal(L.nextAt(18, 0, 0, NOW.getTime()), at(11, 18), 'domingo siguiente');
  assert.equal(L.searchKey('Médico ÁRBOL'), 'medico arbol');
});

test('foto de perfil: solo imágenes seguras y recorte cuadrado', () => {
  assert.equal(L.isSafePhoto('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(L.isSafePhoto('data:image/webp;base64,UklGRg+/'), true);
  assert.equal(L.isSafePhoto('javascript:alert(1)'), false);
  assert.equal(L.isSafePhoto('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(L.isSafePhoto('data:image/png;base64,abc" onerror="x'), false);
  assert.equal(L.isSafePhoto('data:image/png;base64,' + 'A'.repeat(400000)), false);
  assert.equal(L.isSafePhoto(null), false);
  assert.deepEqual(L.squareCrop(4000, 3000), { sx: 500, sy: 0, side: 3000 });
  assert.deepEqual(L.squareCrop(3000, 4000), { sx: 0, sy: 300, side: 3000 });
  assert.deepEqual(L.squareCrop(120, 120), { sx: 0, sy: 0, side: 120 });
});

test('solo avisa un perfil: el elegido o el que esté abierto', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(L.notifyTarget({ active: 'b', list }), 'b', 'sin elegir: el abierto');
  assert.equal(L.notifyTarget({ active: 'b', notify: 'active', list }), 'b');
  assert.equal(L.notifyTarget({ active: 'b', notify: 'c', list }), 'c', 'elegido aunque esté abierto otro');
  assert.equal(L.notifyTarget({ active: 'b', notify: 'borrado', list }), 'b', 'si el elegido ya no existe, el abierto');
  assert.equal(L.notifyTarget({ active: 'x', list }), 'a');
  assert.equal(L.notifyTarget({ list: [] }), null);
  assert.equal(L.notifyTarget(null), null);
});

test('avisos para el servidor: futuros, con insistencia, repeticiones y sin los ya hechos', () => {
  const now = NOW.getTime();
  const tasks = [
    { id: 'a', title: 'Llamar', remindAt: at(8, 17), steps: [{ text: 'Buscar el número', done: false }] },
    { id: 'b', title: 'Hecha', remindAt: at(8, 18), done: true },
    { id: 'c', title: 'Pasada', remindAt: at(8, 9) },
    { id: 'd', title: 'Pastilla', remindAt: at(9, 9), repeat: 'daily', done: true },
    { id: 'e', title: 'Sonó', remindAt: at(8, 9, 50), notified: true, nagAt: at(8, 10, 5) },
    { id: 'f', title: 'Sin hora' },
  ];
  const plan = L.pushSchedule(tasks, { now, pid: 'p1', days: 3 });
  const a = plan.filter(x => x.taskId === 'a');
  assert.deepEqual(a.map(x => [x.at, x.nag]), [[Date.parse(at(8, 17)), 0], [Date.parse(at(8, 17, 10)), 1], [Date.parse(at(8, 17, 20)), 2]]);
  assert.equal(a[0].body, 'Empieza por: Buscar el número');
  assert.equal(a[0].tag, 'pasito-a');
  assert.equal(a[0].pid, 'p1');
  assert.equal(plan.some(x => x.taskId === 'b' || x.taskId === 'c' || x.taskId === 'f'), false, 'ni hechas, ni pasadas, ni sin hora');
  const d = plan.filter(x => x.taskId === 'd' && x.nag === 0).map(x => x.at);
  assert.deepEqual(d, [at(9, 9), at(10, 9), at(11, 9)].map(Date.parse), 'la rutina diaria hasta el horizonte');
  assert.deepEqual(plan.filter(x => x.taskId === 'e').map(x => [x.at, x.nag]), [[Date.parse(at(8, 10, 5)), 1], [Date.parse(at(8, 10, 15)), 2]], 'si ya sonó, sus insistencias pendientes');
  assert.deepEqual(L.pushSchedule([{ id: 'g', title: 'G', remindAt: at(8, 9, 50), notified: true, nags: 1, nagAt: at(8, 10, 5) }], { now }).map(x => x.nag), [2], 'tras la primera insistencia queda la segunda');
  const refresh = plan.filter(x => x.key === 'pasito-refresh');
  assert.equal(refresh.length, 1, 'con rutinas, un aviso para renovar la lista');
  assert.equal(refresh[0].at, Date.parse(at(11, 9)) - 43200000, 'medio día antes de la última rutina programada');
  assert.equal(refresh[0].taskId, '');
  assert.equal(plan.some(x => 'repeat' in x), false);
  assert.ok(plan.every((x, i) => i === 0 || plan[i - 1].at <= x.at), 'ordenado por hora');
  assert.equal(new Set(plan.map(x => x.key)).size, plan.length, 'claves únicas');

  const quiet = L.pushSchedule(tasks, { now, nag: false, profileName: 'Casa', days: 1 });
  assert.equal(quiet.some(x => x.nag), false);
  assert.match(quiet[0].body, /^Casa · /);
  assert.equal(L.pushSchedule(tasks.filter(t => !t.repeat), { now, max: 2 }).length, 2);
  assert.equal(L.pushSchedule([tasks[0]], { now }).some(x => x.key === 'pasito-refresh'), false, 'sin rutinas no hace falta');
});

test('una rutina sin marcar pasa a la vez más reciente', () => {
  const now = NOW.getTime();
  assert.equal(L.catchUpRepeat({ repeat: 'daily', remindAt: at(5, 9) }, now), at(8, 9));
  assert.equal(L.catchUpRepeat({ repeat: 'daily', remindAt: at(7, 11) }, now), null, 'aún no le tocó otra vez');
  assert.equal(L.catchUpRepeat({ repeat: 'daily', remindAt: at(5, 9), done: true }, now), null, 'las hechas las reinicia shouldReset');
  assert.equal(L.catchUpRepeat({ repeat: 'none', remindAt: at(5, 9) }, now), null);
  assert.equal(L.catchUpRepeat({ repeat: 'weekdays', remindAt: at(2, 9) }, new Date(2026, 9, 11, 12).getTime()), at(9, 9), 'el domingo, la del viernes');
});

test('repetición diaria, laborables y semanal', () => {
  const now = NOW.getTime();
  assert.equal(L.nextOccurrence(at(8, 9), 'daily', now), at(9, 9));
  // viernes 9 → lunes 12
  assert.equal(L.nextOccurrence(at(9, 9), 'weekdays', new Date(2026, 9, 9, 12).getTime()), at(12, 9));
  assert.equal(L.nextOccurrence(at(1, 9), 'weekly', now), at(15, 9));
  assert.equal(L.nextOccurrence(at(8, 9), 'none', now), null);
});

test('una tarea repetida vuelve a pendiente el día de su próximo aviso', () => {
  const t = { done: true, repeat: 'daily', remindAt: at(9, 9), doneAt: at(8, 9, 30) };
  assert.equal(L.shouldReset(t, NOW.getTime()), false);
  assert.equal(L.shouldReset(t, new Date(2026, 9, 9, 0, 5).getTime()), true);
  assert.equal(L.shouldReset({ done: true, repeat: 'weekly', doneAt: at(5, 9) }, NOW.getTime()), false);
  assert.equal(L.shouldReset({ done: true, repeat: 'none', doneAt: at(1, 9) }, NOW.getTime()), false);
});

test('con batería baja se sugiere lo corto y fácil', () => {
  const tasks = [
    { id: 'a', title: 'Informe', energy: 'high', minutes: 60, steps: [], createdAt: '1' },
    { id: 'b', title: 'Agua', energy: 'low', minutes: 5, steps: [], createdAt: '2' },
    { id: 'c', title: 'Hecha', energy: 'low', minutes: 5, steps: [], done: true, createdAt: '0' },
  ];
  const r = L.rankTasks(tasks, 'low', NOW.getTime());
  assert.equal(r.length, 2);
  assert.equal(r[0].task.id, 'b');
  assert.ok(r[0].reasons.includes('pide poca energía'));
});

test('lo marcado para hoy y lo vencido va primero', () => {
  const tasks = [
    { id: 'a', energy: 'low', minutes: 5, steps: [], createdAt: '1' },
    { id: 'b', energy: 'med', steps: [], today: true, createdAt: '2' },
    { id: 'c', energy: 'med', steps: [{ text: 'x', done: true }, { text: 'y', done: false }], remindAt: at(8, 9), createdAt: '3' },
  ];
  const r = L.rankTasks(tasks, null, NOW.getTime());
  assert.deepEqual(r.map(x => x.task.id), ['b', 'c', 'a']);
  assert.equal(r[1].nextStep, 'y');
});

test('estadísticas de la semana y niveles', () => {
  const log = [
    { at: at(8, 9), kind: 'task' },
    { at: at(8, 9), kind: 'step' },
    { at: at(6, 9), kind: 'focus' },
  ];
  const w = L.weekStats(log, NOW.getTime());
  assert.equal(w.length, 7);
  assert.equal(w[6].count, 1);
  assert.equal(w[6].isToday, true);
  assert.equal(w[4].count, 1);
  assert.deepEqual(L.levelFor(0), { level: 1, name: 'Semilla', into: 0, need: 20 });
  assert.equal(L.levelFor(20).level, 2);
  assert.equal(L.levelFor(49).level, 2);
  assert.equal(L.levelFor(50).level, 3);
});

test('archivo de calendario con aviso y repetición', () => {
  const ics = L.buildICS({ id: 'x1', title: 'Tomar pastilla, con agua', remindAt: at(8, 9), minutes: 5, repeat: 'daily' }, NOW.getTime());
  assert.match(ics, /DTSTART:20261008T090000\r\n/);
  assert.match(ics, /SUMMARY:Tomar pastilla\\, con agua/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /BEGIN:VALARM/);
});

test('formatos de fecha en español', () => {
  assert.equal(L.fmtWhen(at(8, 17, 5), NOW.getTime()), 'hoy 17:05');
  assert.equal(L.fmtWhen(at(9, 9), NOW.getTime()), 'mañana 09:00');
  assert.equal(L.fmtWhen(at(12, 9), NOW.getTime()), 'lunes 09:00');
  assert.equal(L.fmtDay(at(7, 9), NOW.getTime()), 'Ayer');
  assert.equal(L.fmtLongDate(NOW), 'jueves 8 de octubre');
});
