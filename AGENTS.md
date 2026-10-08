# AGENTS.md: notas para continuar o revisar Pasito

Contexto: la dueña/el dueño del repo tiene TDAH y pidió (en español) una web app para crear y gestionar listas de tareas,
recordatorios y estímulos positivos, porque le cuesta organizarse y entender qué le hace falta. Toda la UI está en español.

## Principios de producto (no romperlos)

- **Cero fricción para capturar.** Un campo siempre visible arriba; Enter guarda. Nada obligatorio salvo el texto.
- **Una sola cosa a la vez.** «¿Qué hago ahora?» devuelve una tarea con su motivo, no una lista.
- **Sin culpa ni castigo.** Nada de rachas que se rompen, ni rojos acusadores, ni confirmaciones que asusten.
  Lo destructivo usa **Deshacer** (`withUndo`), no `confirm()` (salvo «Borrar todo», con confirmación en línea).
- **Recompensa inmediata.** Estrellas, confeti, sonido, vibración, marcador fluorescente, mensajes de ánimo.
- **Accesible.** Atkinson Hyperlegible, objetivos táctiles ≥ 34–44 px, `prefers-reduced-motion` y ajuste «Menos animaciones».
- **Sin build, sin dependencias.** HTML + CSS + JS clásico (no módulos ES) para que funcione también con `file://`.

## Archivos

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | Estructura fija: cabecera, captura, `<main id="view">`, pestañas, hoja de aviso, ajustes, toasts, canvas de confeti. |
| `styles.css` | Tokens de color/tipo en `:root` + modo oscuro (`prefers-color-scheme` y `[data-theme]`). Todo color sale de tokens. |
| `logic.js` | Lógica pura, sin DOM (UMD: `window.PasitoLogic` o `require`). Fechas, parser de captura, repeticiones, ranking, stats, `.ics`. |
| `app.js` | Estado, guardado, render por vistas, eventos, recordatorios, temporizador, recompensas. Un IIFE. |
| `sw.js` | Service worker: caché red-primero para uso sin conexión y `notificationclick`. Sube `CACHE` si cambias la lista de assets. |
| `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png` | PWA instalable. Los PNG se generaron desde `icon.svg` con Playwright. |
| `tests/logic.test.js` | Pruebas `node:test` de `logic.js`. `npm test`. |

## Arquitectura de `app.js`

- **Estado** (`state`, en `localStorage['pasito-v1']`):
  `{ version, lists[], tasks[], log[], stars, battery:{day,level}, focus:{taskId,minutes,lastMinutes,isBreak,phase,endAt,remaining,total}, settings:{sound,calm,theme}, lastVisit }`.
  Tarea: `{ id, title, notes, list, energy:'low'|'med'|'high', minutes, remindAt(ISO), repeat:'none'|'daily'|'weekdays'|'weekly', today, steps[{id,text,done}], done, doneAt, notified, snoozes, createdAt, example?, prevRemindAt? }`.
  `log[]`: `{ at, kind:'task'|'step'|'focus', id?, title, stars, minutes? }`, en orden cronológico (se usa para Logros y para quitar estrellas al desmarcar).
  `normalize()` rellena campos que falten. Si cambias el esquema, migra ahí (y sube `version` si hace falta).
- **UI efímera** en `ui` (pestaña, tareas abiertas, filtro, cola de avisos, etc.). La pestaña va en `location.hash`.
- **Render**: `render()` reescribe `#view` con `viewHoy/viewTareas/viewEnfoque/viewLogros` (template strings; usa siempre `esc()`).
  Restaura el foco por `id`, así que **todo control de formulario necesita un `id` estable**.
- **Eventos delegados** en `document`: `click` → `actions[data-action](task, btn)` (la tarea sale del `[data-id]` más cercano),
  `submit` (captura, pasos, nueva lista), `input` (título/notas sin re-render), `change` (resto de campos → `save()` + `render()`).
- **Recordatorios**: `tick()` cada 15 s y al volver a la pestaña. Si `remindAt <= ahora` y `!notified`: marca `notified` y, si pasó
  hace < 6 h, `fireReminder()` (hoja en la app + sonido + vibración + notificación del sistema si la ventana no tiene foco).
  Lo más antiguo solo aparece en «Se pasó la hora». `housekeeping()` reinicia tareas repetidas (`L.shouldReset`) y limpia el foco de días pasados.
- **Repeticiones**: al completar, `remindAt` salta a `L.nextOccurrence()` y se guarda `prevRemindAt` para poder desmarcar.
  La tarea vuelve a pendiente (con pasos reiniciados) el día de su siguiente aviso.
- **Enfoque**: basado en `endAt` (sobrevive a recargas). Wake Lock mientras corre. Termina en `focusFinish()` (+2 ★ si ≥ 5 min y no es descanso).
- **Incrustado** (`EMBEDDED`, dentro de un iframe como la vista previa de claude.ai): sin service worker, sin descargas
  (`.ics`, copia JSON), sin banner de avisos. La copia se hace por portapapeles o pegando texto.

## Cómo probar

```bash
npm test                                   # lógica pura
npx http-server -c-1 -p 8080 .             # luego abre http://localhost:8080
```

Prueba manual mínima (o con Playwright, que viene instalado en el entorno de Claude Code en la nube):
capturar «llamar a mamá mañana a las 5» → aparece en Bandeja con aviso mañana 17:00; batería Baja → sugerencia;
marcar paso/tarea → estrellas y confeti; borrar → Deshacer; Enfoque 5 min → el título de la pestaña muestra la cuenta atrás;
poner `remindAt` en el pasado y recargar → aparece la hoja de aviso; revisar a 360 px de ancho y en modo oscuro.

## Limitaciones conocidas e ideas siguientes

- Sin servidor no hay notificaciones con la app cerrada (no hay Push). El `.ics` es la alternativa.
  Siguiente paso posible: Web Push con un backend mínimo, o Notification Triggers si algún navegador lo implementa.
- Sin sincronización entre dispositivos (solo copia/restauración manual).
- El parser de captura es heurístico: «a las 1–6» sin «de la mañana» se entiende como tarde (13–18 h). No entiende fechas como «el 15».
- `.ics` no pliega líneas de más de 75 octetos (los calendarios principales lo toleran).
- Ideas útiles para TDAH aún sin hacer: reordenar por arrastre, plantillas de rutinas (mañana/noche), «body doubling» con sonido ambiente,
  revisión semanal guiada, recordatorios escalonados (avisar otra vez si no se atiende), estimación vs. tiempo real.
