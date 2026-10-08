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
| `config.js` | `window.PASITO_CONFIG = { pushApi }`: dirección del servidor de avisos para no pedirla en cada teléfono. |
| `server/worker.js` | Servidor de avisos (Cloudflare Worker, un solo archivo, sin dependencias): API + cron cada minuto + Web Push (VAPID RFC 8292, aes128gcm RFC 8291 con WebCrypto). Guía en `server/README.md`. |
| `tests/push-server.test.js`, `tests/push-helpers.js` | Pruebas del Worker con KV en memoria y push simulado; descifran cada envío y verifican la firma. `HTTP_ECE_MODULE` añade un descifrado con la librería de referencia `http_ece`. |
| `tests/e2e.js` | Recorrido completo en Chromium con Playwright (servidor estático propio). `npm run test:e2e`; `PLAYWRIGHT_MODULE` apunta a un Playwright global, `SHOTS_DIR` guarda capturas. |

## Arquitectura de `app.js`

- **Perfiles**: `localStorage['pasito-perfiles'] = { active, notify, list:[{id,name,color,photo?}] }` y un estado por perfil en
  `localStorage['pasito-v1:<id>']`. `loadProfiles()` migra la clave antigua `pasito-v1` (v1, sin perfiles) al primer perfil.
  `activateProfile()` guarda, pausa el enfoque, carga el otro estado, limpia `ui` y toasts y vuelve a Hoy.
- **Solo avisa un perfil** (petición expresa: uso individual). `notify` es `'active'` (el abierto, por defecto) o un id;
  `L.notifyTarget(meta)` lo resuelve (si el id ya no existe, el abierto). `tick()` solo procesa avisos e insistencia del perfil
  abierto si es el elegido (`activeNotifies()`); un perfil en silencio conserva `notified=false`, sus vencidas salen en
  «Se pasó la hora» y su cola en pantalla se oculta (no se borra). Si el elegido no está abierto, `checkOtherProfiles()` lee su
  estado en bruto, reinicia sus rutinas (`resetIfDue`, compartido con `housekeeping`), marca `notified`, programa su insistencia
  y encola `ui.extQueue` ({pid, taskId}); `renderReminder()` lo muestra como tarjeta «Aviso para X» (`ext-go`, `ext-snooze`,
  `ext-close`, que escriben en el almacenamiento de ese perfil vía `updateExternalTask`, que no toca tareas ya hechas).
  `activateProfile()` pasa los avisos externos del perfil que se abre a su cola normal y, si el que se deja es el elegido,
  convierte su cola en avisos externos. El selector (`notifyTarget`) aplica la elección con retardo (`chooseNotifyTarget`,
  600 ms, o al cerrar la hoja / pulsar otra cosa) porque las flechas del teclado marcan cada opción al pasar.
  Al poner una hora en un perfil en silencio, `remindPromise()` no promete «Te aviso».
- **Avisos con la app cerrada (Web Push)**. Configuración del dispositivo en `localStorage['pasito-push']`
  (`{ api, deviceId, lastSyncAt, lastHash, scheduled, lastError }`, no es del perfil; otra pestaña la fusiona pero conserva su
  `lastHash`). «Conectar este teléfono» (`connectPush`) pide permiso (`permissionHelp()` si está bloqueado), suscribe
  `pushManager` con la clave VAPID de `GET /api/key` y `pushSync()` hace `POST /api/devices/:id` (`text/plain`, sin preflight)
  con `L.pushSchedule()` del perfil que avisa: 14 días, repeticiones, insistencias (+10/+20 min; si el aviso actual ya sonó,
  las que quedan desde `nagAt`) y una entrada `pasito-refresh` medio día antes de la última rutina para pedir que se abra la app.
  `schedulePushSync()` (1,5 s) se llama desde `save()`, `saveProfiles()` y cada `tick()`; solo envía si cambia el hash o cada
  6 h, y no desde pestañas ocultas (salvo `flushPushNow()`, con `keepalive`, al ocultar la app o en `pagehide`).
  La app siempre muestra su notificación local si la ventana no tiene foco; usa la misma etiqueta `pasito-<id>` que el push,
  así el sistema no la duplica. El service worker muestra el push (o, si Pasito está delante y no es Safari, le pasa el aviso
  con `postMessage` `pasito-push`); solo cuenta ventanas dentro de su `scope`. «Hecha», «En 10 min», tocar y descartar se
  guardan en IndexedDB `pasito-sw/actions` (`queueAction`: `done|snooze|open|dismiss`, con `at`). La app los aplica con
  `drainActions()` antes del primer `tick()` al arrancar, al volver a la pestaña o al recibir `pasito-actions`; antes de aplicar
  pone la tarea al día (`resetIfDue` + `catchUp` en `a.at`), «Hecha» usa `completeTask(t, null, a.at)` o `completeRaw` en
  perfiles no abiertos, y `open/dismiss` la dan por atendida (sin insistir; `open` además enseña la tarjeta).
  `catchUp()` (`L.catchUpRepeat`): una rutina sin responder salta a su última repetición en vez de quedarse en la vieja.
  Tocar o descartar → `POST /ack` (borra las insistencias de esa etiqueta); «En 10 min» → `POST /snooze`.
- **Servidor (`server/worker.js`)**. KV: `vapid`, `dev:<id>` (máx. 10 dispositivos, si no 429) e `index` (`{id: próximo|null}`;
  `null` = sin avisos, el cron lo salta; una lectura por minuto). Solo acepta endpoints de servicios de push conocidos y claves
  P-256 válidas. El cron guarda primero el dispositivo sin los avisos que toca y luego envía (si guardar falla, no envía: nada
  se repite); 404/410 → olvida el dispositivo; 429/5xx/red → los vuelve a poner si nadie cambió el dispositivo; >6 h tarde →
  descarta. Cada dispositivo va en su `try/catch`. `ALLOWED_ORIGIN` se normaliza con `new URL().origin` y un origen distinto
  recibe un 403 legible. Claves VAPID opcionales por variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_JWK`). Solo `export default`.
- **Avisos cortos (toasts)**: abajo, encima de las pestañas; no capturan toques salvo su botón, y suben por encima de la
  tarjeta de recordatorio (`liftToasts`, variable CSS `--toast-lift`). Antes, arriba, tapaban perfil y ajustes.
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
perfiles (crear, aislar datos, volver, borrar y deshacer), un solo perfil avisa (por defecto el abierto; «Siempre X» con tarjeta
externa, posponer, «Ir a X», rutina diaria del elegido, tarjeta obsoleta entre pestañas, texto honesto en silencio, salir del
perfil que avisa con su aviso en pantalla, flechas por el selector sin gastar avisos, borrar el elegido), foto de perfil (recorte a 192 px, deshacer, cancelar,
archivos no válidos, foco tras «Quitar foto», crear antes de que termine la decodificación, foto manipulada en el almacenamiento,
almacenamiento lleno y bloqueado), avisos con la app cerrada (conectar contra el Worker real con suscripción simulada,
programación en el servidor, envío cifrado del cron y descifrado, notificación del service worker con sus botones vía CDP
`ServiceWorker.deliverPushMessage`, «Hecha» y descartar aplicados desde la cola, desconectar), modo oscuro sin desbordes a 360 px y cero errores JS.
Usa el Chromium completo (`channel: 'chromium'`): el «headless shell» deniega siempre las notificaciones.
La guía para publicar en GitHub Pages está en el README.

## Limitaciones conocidas e ideas siguientes

- Avisos con la app cerrada: requieren desplegar `server/` (Cloudflare, gratis). iOS no muestra botones en las notificaciones web.
  KV es eventualmente consistente: un aviso puede salir hasta ~1 min tarde o, rara vez, repetirse (mismo `tag`, se sustituye).
- Sin sincronización entre dispositivos (solo copia/restauración manual por perfil). Perfiles sin contraseña.
- El parser de captura es heurístico: «a las 1–6» sin «de la mañana» se entiende como tarde (13–18 h). No entiende fechas como «el 15».
- `.ics` no pliega líneas de más de 75 octetos (los calendarios principales lo toleran).
- Hecho en v1.4: notificaciones con la app cerrada (servidor propio en Cloudflare Workers).
- Hecho en v1.3: un solo perfil recibe los avisos (revisado con 3 revisores + verificación adversarial; 8 problemas confirmados
  y corregidos, más los avisos cortos que tapaban la cabecera).
- En el modo «el perfil que esté abierto», dos ventanas abiertas en perfiles distintos suenan cada una el suyo (es lo que pide el modo).
- Las pruebas e2e nunca deben pasar un ElementHandle a `assert` (usar `exists()`): formatear el error agota la memoria.
- Hecho en v1.2: foto de perfil (revisada con 4 revisores + verificación adversarial; 6 problemas confirmados y corregidos).
- Si una pestaña con la versión anterior (sin fotos) sigue abierta y guarda la lista de perfiles, las fotos se pierden
  (esa versión no conoce el campo). Es transitorio tras actualizar; recargar las pestañas viejas lo evita.
- Ideas para la foto: elegir el encuadre a mano (zoom/arrastre) e incluirla en la copia de seguridad.
- Hecho en v1.1: perfiles, insistencia de avisos, «Vaciar la cabeza», rutinas, búsqueda, ruido marrón, logros manuales, meta ajustable,
  tiempos relativos en la captura.
- Ideas siguientes: reordenar por arrastre, revisión semanal guiada paso a paso, ordenar la Bandeja de una en una,
  estimación vs. tiempo real, rutinas propias guardadas como plantilla, PIN opcional por perfil.
