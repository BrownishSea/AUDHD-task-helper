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
