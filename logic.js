/* Pasito: lógica pura (sin DOM). En el navegador queda en window.PasitoLogic; en Node se usa con require() para los tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PasitoLogic = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const DAY = 86400000;
  const STARS = { low: 2, med: 3, high: 5 };
  const LEVELS = ['Semilla', 'Brote', 'Plantita', 'Arbusto', 'Árbol', 'Bosque'];
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const pad = n => String(n).padStart(2, '0');

  /* ---------- Fechas ---------- */

  function dayKey(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Días de calendario entre a y b (a - b). Math.round absorbe los cambios de horario.
  function dayDiff(a, b) {
    return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtTime(d) {
    const x = new Date(d);
    return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    return `${dayKey(iso)}T${fmtTime(iso)}`;
  }

  function fmtWhen(iso, now = Date.now()) {
    const d = new Date(iso);
    const diff = dayDiff(d, now);
    const t = fmtTime(d);
    if (diff === 0) return `hoy ${t}`;
    if (diff === 1) return `mañana ${t}`;
    if (diff === -1) return `ayer ${t}`;
    if (diff > 1 && diff < 7) return `${WEEKDAYS[d.getDay()]} ${t}`;
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${t}`;
  }

  function fmtDay(iso, now = Date.now()) {
    const d = new Date(iso);
    const diff = dayDiff(d, now);
    if (diff === 0) return 'Hoy';
    if (diff === -1) return 'Ayer';
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  }

  function fmtLongDate(now = Date.now()) {
    const d = new Date(now);
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  }

  /* ---------- Captura rápida: "llamar a mamá mañana a las 5" ---------- */

  const PERIOD = '(am|pm|de\\s+la\\s+mañana|de\\s+la\\s+tarde|de\\s+la\\s+noche)';
  const TIME_PATTERNS = [
    // 17:30 · a las 9:15 · 7:30 pm · 8:00 de la mañana
    new RegExp(`\\s(?:a\\s+las?\\s+)?(\\d{1,2}):(\\d{2})\\s*(?:h|hs)?\\s*${PERIOD}?(?=\\s)`, 'i'),
    // 5pm · a las 5 pm
    /\s(?:a\s+las?\s+)?(\d{1,2})()\s*(am|pm)(?=\s)/i,
    // a las 5 · a las 17 h · a las 9 de la mañana
    new RegExp(`\\sa\\s+las?\\s+(\\d{1,2})()\\s*(?:h|hs)?\\s*${PERIOD}?(?=\\s)`, 'i'),
  ];
  const WEEKDAY_RE = /\s(?:el\s+)?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)(?=\s)/i;
  const WEEKDAY_INDEX = { domingo: 0, lunes: 1, martes: 2, miércoles: 3, miercoles: 3, jueves: 4, viernes: 5, sábado: 6, sabado: 6 };

  function parseQuickInput(text, now = new Date()) {
    const base = new Date(now);
    const original = String(text).trim();
    let s = ` ${original} `;
    let hour = null;
    let minute = 0;
    let dayOffset = null;
    let defaultHour = 9;
    let partOfDay = false;

    for (const re of TIME_PATTERNS) {
      const m = s.match(re);
      if (!m) continue;
      let h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      const period = (m[3] || '').toLowerCase();
      if (period === 'pm' || period.endsWith('tarde') || period.endsWith('noche')) {
        if (h < 12) h += 12;
      } else if (period === 'am' || period.endsWith('mañana')) {
        if (h === 12) h = 0;
      } else if (h >= 1 && h <= 6) {
        h += 12; // "a las 5" casi siempre significa 17:00
      }
      if (h > 23 || min > 59) continue;
      hour = h;
      minute = min;
      s = s.replace(m[0], ' ');
      break;
    }

    const part = s.match(/\sesta\s+(mañana|tarde|noche)(?=\s)/i);
    if (part) {
      dayOffset = 0;
      partOfDay = true;
      defaultHour = { mañana: 9, tarde: 18, noche: 21 }[part[1].toLowerCase()];
      s = s.replace(part[0], ' ');
    } else {
      const days = [[/\spasado\s+mañana(?=\s)/i, 2], [/\smañana(?=\s)/i, 1], [/\shoy(?=\s)/i, 0]];
      for (const [re, off] of days) {
        const m = s.match(re);
        if (m) {
          dayOffset = off;
          s = s.replace(m[0], ' ');
          break;
        }
      }
      if (dayOffset === null) {
        const m = s.match(WEEKDAY_RE);
        if (m) {
          const target = WEEKDAY_INDEX[m[1].toLowerCase()];
          dayOffset = (target - base.getDay() + 7) % 7 || 7;
          s = s.replace(m[0], ' ');
        }
      }
    }

    let remindAt = null;
    if (hour !== null || partOfDay || (dayOffset !== null && dayOffset > 0)) {
      const d = new Date(base);
      d.setDate(d.getDate() + (dayOffset || 0));
      d.setHours(hour !== null ? hour : defaultHour, hour !== null ? minute : 0, 0, 0);
      if (dayOffset === null && d <= base) d.setDate(d.getDate() + 1); // solo hora y ya pasó: mañana
      if (d > base) remindAt = d.toISOString();
    }

    let title = s.replace(/\s+/g, ' ').trim().replace(/^[,.;:\-–]+\s*|\s*[,.;:\-–]+$/g, '');
    if (!title) title = original;
    return { title, remindAt, today: dayOffset === 0 };
  }

  /* ---------- Repeticiones ---------- */

  function nextOccurrence(iso, repeat, now = Date.now()) {
    if (!iso || !repeat || repeat === 'none') return null;
    let d = new Date(iso);
    const step = repeat === 'weekly' ? 7 : 1;
    do {
      d = addDays(d, step);
      if (repeat === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    } while (d.getTime() <= now);
    return d.toISOString();
  }

  // ¿Una tarea repetida y hecha debe volver a estar pendiente?
  function shouldReset(task, now = Date.now()) {
    if (!task.done || !task.repeat || task.repeat === 'none') return false;
    if (task.remindAt) return dayKey(task.remindAt) <= dayKey(now);
    if (!task.doneAt) return true;
    const gap = dayDiff(now, task.doneAt);
    return task.repeat === 'weekly' ? gap >= 7 : gap >= 1;
  }

  /* ---------- "¿Qué hago ahora?" ---------- */

  const ENERGY_FIT = {
    low: { low: 3, med: 0, high: -4 },
    med: { low: 2, med: 2, high: -1 },
    high: { low: 0, med: 1, high: 3 },
  };
  const FIT_REASON = { low: 'pide poca energía', med: 'encaja con tu energía de ahora', high: 'aprovecha tu batería alta' };

  function rankTasks(tasks, battery, now = Date.now()) {
    const today = dayKey(now);
    return tasks
      .filter(t => !t.done)
      .map(t => {
        let score = 0;
        const reasons = [];
        if (t.today) {
          score += 5;
          reasons.push('la marcaste para hoy');
        }
        if (t.remindAt) {
          const at = new Date(t.remindAt).getTime();
          if (at <= now) {
            score += 4;
            reasons.push('ya pasó su hora');
          } else if (dayKey(at) === today) {
            score += 3;
            reasons.push(`tiene aviso a las ${fmtTime(at)}`);
          }
        }
        if (battery && ENERGY_FIT[battery]) {
          const fit = ENERGY_FIT[battery][t.energy || 'med'];
          score += fit;
          if (fit >= 2) reasons.push(FIT_REASON[battery]);
        }
        if (t.minutes && t.minutes <= 15) {
          score += battery === 'low' ? 2 : 1;
          reasons.push(`es corta (${t.minutes} min)`);
        }
        const steps = t.steps || [];
        const pending = steps.filter(s => !s.done);
        if (pending.length && pending.length < steps.length) {
          score += 1;
          reasons.push('ya la empezaste');
        }
        score -= Math.min(t.snoozes || 0, 3) * 0.5;
        if (!reasons.length) reasons.push('lleva un rato esperando');
        return { task: t, score, reasons, nextStep: pending[0] ? pending[0].text : null };
      })
      .sort((a, b) => b.score - a.score || String(a.task.createdAt).localeCompare(String(b.task.createdAt)));
  }

  /* ---------- Logros ---------- */

  function weekStats(log, now = Date.now()) {
    const counts = {};
    for (const e of log) {
      if (e.kind === 'step') continue;
      const k = dayKey(e.at);
      counts[k] = (counts[k] || 0) + 1;
    }
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(now, -i);
      const k = dayKey(d);
      out.push({ key: k, label: 'DLMXJVS'[d.getDay()], count: counts[k] || 0, isToday: i === 0 });
    }
    return out;
  }

  function levelFor(stars) {
    let level = 0;
    let floor = 0;
    let need = 20;
    while (stars >= floor + need) {
      floor += need;
      level++;
      need += 10;
    }
    return { level: level + 1, name: LEVELS[Math.min(level, LEVELS.length - 1)], into: stars - floor, need };
  }

  /* ---------- Calendario (.ics) ---------- */

  const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const icsUtc = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  // Hora "flotante" (sin Z): el calendario la interpreta en la zona local, así las repeticiones no se mueven con el horario de verano.
  const icsLocal = d => toLocalInput(new Date(d).toISOString()).replace(/[-:]/g, '') + '00';

  function buildICS(task, now = Date.now()) {
    const start = new Date(task.remindAt);
    const end = new Date(start.getTime() + (task.minutes || 15) * 60000);
    const rrule = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY' }[task.repeat];
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pasito//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${task.id}@pasito`, `DTSTAMP:${icsUtc(now)}`, `DTSTART:${icsLocal(start)}`, `DTEND:${icsLocal(end)}`,
      `SUMMARY:${icsText(task.title)}`,
    ];
    if (task.notes) lines.push(`DESCRIPTION:${icsText(task.notes)}`);
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(task.title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  return {
    DAY, STARS, LEVELS,
    dayKey, dayDiff, addDays, fmtTime, toLocalInput, fmtWhen, fmtDay, fmtLongDate,
    parseQuickInput, nextOccurrence, shouldReset, rankTasks, weekStats, levelFor, buildICS,
  };
});
