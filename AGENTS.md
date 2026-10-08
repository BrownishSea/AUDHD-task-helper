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
| `tests/e2e.js` | Recorrido completo en Chromium con Playwright (servidor estático propio). `npm run test:e2e`; `PLAYWRIGHT_MODULE` apunta a un Playwright global, `SHOTS_DIR` guarda capturas. |

## Arquitectura de `app.js`

- **Perfiles**: `localStorage['pasito-perfiles'] = { active, list:[{id,name,color}] }` y un estado por perfil en
  `localStorage['pasito-v1:<id>']`. `loadProfiles()` migra la clave antigua `pasito-v1` (v1, sin perfiles) al primer perfil.
  `activateProfile()` guarda, pausa el enfoque, carga el otro estado, limpia `ui` y toasts y vuelve a Hoy.
  `checkOtherProfiles()` (en cada `tick`) dispara los avisos vencidos de los perfiles inactivos como toast + notificación.
  Los colores se validan contra `PROFILE_COLORS` (`safeColor`) porque van a un `style`.
- **Foto de perfil** (`photo` en la entrada del perfil dentro de `pasito-perfiles`, data URL JPEG de 192 px, ~10–20 KB):
  `makePhoto()` recorta con `L.squareCrop` (retratos sesgados hacia arriba), reduce a ≤1024 px y luego a mitades, rellena blanco
  (transparencias) y valida con `L.isSafePhoto` (solo `data:image/jpeg|png|webp;base64`, ≤400 000 caracteres). `loadProfiles()`
  descarta fotos que no pasen la validación (va a un `src`). En el editor (`pe`) se aplica al momento con «Deshacer» y
  «Cancelar» la devuelve a `ui.editPhotoOrig`; en el perfil nuevo (`pn`) queda en `ui.photoDraft` y el envío espera a
  `ui.photoPending`. `photoSeq` ignora decodificaciones viejas. Si guardar falla por cuota (`storageFull()`, mira `store.lastError`)
  se revierte y se avisa; si el almacenamiento está bloqueado, la foto se queda en memoria como el resto (`warnStorage()`).
  `renderHeader()` solo reescribe el avatar si cambió el perfil, para no recargar la imagen en cada render.
- **Estado** de un perfil (`state`, versión 2):
  `{ version, lists[], tasks[], log[], stars, battery:{day,level}, focus:{taskId,minutes,lastMinutes,isBreak,phase,endAt,remaining,total}, settings:{sound,calm,theme,nag,goal}, lastVisit }`.
  Tarea: `{ id, title, notes, list, energy:'low'|'med'|'high', minutes, remindAt(ISO), repeat:'none'|'daily'|'weekdays'|'weekly', today, steps[{id,text,done}], done, doneAt, notified, nagAt, nags, snoozes, createdAt, example?, prevRemindAt? }`.
  `log[]`: `{ at, kind:'task'|'step'|'focus'|'win', id?, title, stars, minutes? }`, en orden cronológico. «Logros» = todo lo que no es `step`.
  `normalize()` rellena y sanea campos (también al importar). Si cambias el esquema, migra ahí y sube `version`.
- **UI efímera** en `ui` (pestaña, tareas abiertas, filtro, cola de avisos, etc.). La pestaña va en `location.hash`.
- **Render**: `render()` reescribe `#view` con `viewHoy/viewTareas/viewEnfoque/viewLogros` (template strings; usa siempre `esc()`).
  Restaura el foco y el cursor por `id`, así que **todo control necesita un `id` estable y único** (`taskRow` usa `ctx` como prefijo
  porque la misma tarea puede salir dos veces). Ajustes y Perfiles son una sola hoja (`#sheet`, `renderSheet()`).
- **Insistencia**: `fireReminder()` programa `nagAt` (+10 min, máx. `NAG_MAX`); cualquier respuesta (hecha, posponer, empezar,
  cerrar, cambiar la hora) llama a `clearNag()`.
- **Eventos delegados** en `document`: `click` → `actions[data-action](task, btn)` (la tarea sale del `[data-id]` más cercano),
  `submit` (captura, pasos, nueva lista), `input` (título/notas sin re-render), `change` (resto de campos → `save()` + `render()`).
- **Recordatorios**: `tick()` cada 15 s y al volver a la pestaña. Si `remindAt <= ahora` y `!notified`: marca `notified` y, si pasó
  hace < 6 h, `fireReminder()` (hoja en la app + sonido + vibración + notificación del sistema si la ventana no tiene foco).
  Lo más antiguo solo aparece en «Se pasó la hora». `housekeeping()` reinicia tareas repetidas (`L.shouldReset`) y limpia el foco de días pasados.
- **Repeticiones**: al completar, `remindAt` salta a `L.nextOccurrence()` y se guarda `prevRemindAt` para poder desmarcar.
  La tarea vuelve a pendiente (con pasos reiniciados) el día de su siguiente aviso.
- **Enfoque**: basado en `endAt` (sobrevive a recargas). Wake Lock mientras corre. Termina en `focusFinish()` (+2 ★ si ≥ 5 min y no es descanso).
- **Varias pestañas**: el evento `storage` recarga el estado si otra pestaña lo cambia.
- **Incrustado** (`EMBEDDED`, dentro de un iframe como la vista previa de claude.ai): sin service worker, sin descargas
  (`.ics`, copia JSON), sin banner de avisos. La copia se hace por portapapeles o pegando texto.

## Cómo probar

```bash
npm test                                   # lógica pura
npx http-server -c-1 -p 8080 .             # luego abre http://localhost:8080
```

En el entorno de Claude Code en la nube Playwright ya está instalado de forma global:

```bash
PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright SHOTS_DIR=/tmp/capturas npm run test:e2e
```

`tests/e2e.js` cubre: migración v1→perfiles, ejemplos, sugerencia por batería, captura relativa, pasos/estrellas/deshacer,
vaciar la cabeza, rutinas, búsqueda sin tildes, enfoque + ruido marrón, logro manual, aviso vencido + posponer + insistencia,
perfiles (crear, aislar datos, aviso cruzado, volver, borrar y deshacer), foto de perfil (recorte a 192 px, deshacer, cancelar,
archivos no válidos, foco tras «Quitar foto», crear antes de que termine la decodificación, foto manipulada en el almacenamiento,
almacenamiento lleno y bloqueado), modo oscuro sin desbordes a 360 px y cero errores JS.
La guía para publicar en GitHub Pages está en el README.

## Limitaciones conocidas e ideas siguientes

- Sin servidor no hay notificaciones con la app cerrada (no hay Push). El `.ics` es la alternativa.
  Siguiente paso posible: Web Push con un backend mínimo, o Notification Triggers si algún navegador lo implementa.
- Sin sincronización entre dispositivos (solo copia/restauración manual por perfil). Perfiles sin contraseña.
- El parser de captura es heurístico: «a las 1–6» sin «de la mañana» se entiende como tarde (13–18 h). No entiende fechas como «el 15».
- `.ics` no pliega líneas de más de 75 octetos (los calendarios principales lo toleran).
- Hecho en v1.2: foto de perfil (revisada con 4 revisores + verificación adversarial; 6 problemas confirmados y corregidos).
- Si una pestaña con la versión anterior (sin fotos) sigue abierta y guarda la lista de perfiles, las fotos se pierden
  (esa versión no conoce el campo). Es transitorio tras actualizar; recargar las pestañas viejas lo evita.
- Ideas para la foto: elegir el encuadre a mano (zoom/arrastre) e incluirla en la copia de seguridad.
- Hecho en v1.1: perfiles, insistencia de avisos, «Vaciar la cabeza», rutinas, búsqueda, ruido marrón, logros manuales, meta ajustable,
  tiempos relativos en la captura.
- Ideas siguientes: reordenar por arrastre, revisión semanal guiada paso a paso, ordenar la Bandeja de una en una,
  estimación vs. tiempo real, rutinas propias guardadas como plantilla, PIN opcional por perfil.
