# Pasito

Listas de tareas, recordatorios y ánimo para cerebros con TDAH.
Funciona en el navegador, se instala en el móvil como una app y **no necesita cuenta ni servidor**: todo se guarda en tu dispositivo.

> ¿Eres un agente o vas a programar? Lee [`AGENTS.md`](AGENTS.md).

## Qué hace

| Pestaña | Para qué sirve |
| --- | --- |
| **Hoy** | Tu día en frases simples («2 tareas en tu foco», «1 aviso pasó de hora»), tu **batería**, el botón **«Dime qué hago ahora»**, tu foco de hoy (máx. 3) y tu meta suave del día. |
| **Tareas** | Tus listas, búsqueda, **«Vaciar la cabeza»** (muchas ideas de golpe) y **rutinas listas** (mañana, noche, salir de casa, revisión semanal…). Cada tarea puede tener pasos, tiempo, energía, aviso y repetición. |
| **Enfoque** | Temporizador de 5 a 45 min con el siguiente paso a la vista, descansos y **ruido marrón** de fondo. |
| **Logros** | Estrellas, niveles, últimos 7 días, todo lo que lograste y un sitio para **anotar lo que hiciste aunque no estuviera en la lista**. |

Arriba a la derecha están tu **perfil** (círculo con inicial) y los **Ajustes**.

### La primera vez

Pasito no viene con tareas de ejemplo: la primera vez te hace **tres preguntas** y con tus respuestas monta tu lista.
Qué te da vueltas en la cabeza (una cosa por línea, va a la Bandeja), qué es lo más pequeño que podrías hacer hoy
(va a tu foco) y si hay algo que necesites hacer cada día (una rutina con su hora). Todo se puede saltar y, al terminar,
te explica en cinco líneas cómo se usa cada pestaña. Para verla otra vez: *Ajustes → Volver a ver la bienvenida*.

### Pensado para TDAH

- **Captura en un segundo.** Escribe y pulsa Enter. Entiende `llamar a mamá mañana a las 5`, `sacar la ropa en 45 min`,
  `pagar el alquiler el lunes 10:00`, `ir al gimnasio mañana por la tarde` o `lavar ropa hoy`, y crea el aviso solo.
- **«¿Qué hago ahora?»** Elige *una* tarea según tu batería, tus avisos y tu foco, y te dice por qué. Si es grande, propone dividirla.
- **Empezar 5 minutos.** Un toque y arranca el temporizador con esa tarea.
- **Avisos que insisten (con cariño).** Si no respondes a un aviso, vuelve a sonar hasta 2 veces cada 10 min. Se puede apagar.
- **Estímulos positivos.** Confeti, sonido suave, texto marcado con fluorescente, mensajes de ánimo y estrellas
  (2/3/5 por tarea según energía, 1 por paso, 2 por sesión de enfoque, 1 por logro anotado).
- **Sin culpa.** Sin rachas que se rompen. Lo vencido es «se pasó la hora», con botones para elegir otro momento. Todo se puede **deshacer**.
- **Meta suave ajustable** (1 a 5 logros al día) para los días de batería baja.

### Perfiles

Toca el círculo con tu inicial. Cada perfil tiene **sus propias listas, avisos, estrellas y ajustes**.
Sirve para compartir el dispositivo con otra persona o para separar contextos (por ejemplo «Casa» y «Trabajo»).

- **Foto de perfil**: en *Editar* (o al crear un perfil) pulsa **Elegir foto** y escoge una de la galería o de tus archivos.
  Se recorta en cuadrado, se reduce y se guarda solo en el dispositivo. Se ve al momento; **Cancelar** la deja como estaba
  y **Quitar foto** vuelve a la inicial. La copia de seguridad no incluye la foto.
- **Solo suena un perfil a la vez** (Pasito es para una persona). En *Perfiles → ¿Quién recibe los avisos?* eliges:
  - **El perfil que esté abierto** (por defecto): los avisos cambian contigo al cambiar de perfil.
  - **Siempre «Nombre»**: ese perfil avisa aunque tengas abierto otro. Su aviso sale con su nombre y los botones
    «Ir a «Nombre»», «En 10 min» y «En 1 hora».

  Los demás perfiles quedan **en silencio**: no suenan, su círculo de arriba lleva una campana tachada y Hoy lo explica
  con un botón «Que avise este perfil». Sus tareas vencidas siguen apareciendo en «Se pasó la hora».
- Al cambiar de perfil, si había una sesión de enfoque en marcha, queda en pausa.
- Borrar un perfil se puede deshacer unos segundos. Los perfiles **no tienen contraseña**.
- Si usabas la versión anterior, tus datos pasan solos al primer perfil («Yo»; puedes renombrarlo).

## Recordatorios: lo que hay que saber

1. Pulsa **Activar avisos** (en Hoy o en Ajustes) y acepta el permiso del navegador.
2. Sin nada más, los avisos funcionan **mientras Pasito esté abierta**, aunque sea en otra pestaña o minimizada.
3. **Para que el teléfono te avise con Pasito cerrada**, crea tu servidor de avisos gratis (unos 10 minutos, una sola vez)
   y conecta el teléfono. Mira la sección siguiente.
4. En iPhone/iPad las notificaciones solo funcionan si instalas Pasito en la pantalla de inicio (iOS 16.4 o superior).
5. Alternativa sin servidor para lo muy importante: abre la tarea → **«Añadir a mi calendario»** (un `.ics` con su propia alarma).

## Avisos con la app cerrada (notificaciones en el teléfono)

Una web no puede despertarse sola cuando está cerrada: hace falta un pequeño servidor que le envíe la notificación
a su hora. Pasito trae uno listo en la carpeta [`server/`](server/), pensado para el **plan gratuito de Cloudflare**.

1. **Crea tu servidor** siguiendo [`server/README.md`](server/README.md). Se puede hacer todo desde el navegador,
   sin instalar nada. Al terminar tendrás una dirección del tipo `https://pasito-avisos.tu-usuario.workers.dev`.
2. (Opcional) Pega esa dirección en [`config.js`](config.js) (`pushApi: '...'`) y súbelo: así ningún teléfono te la pedirá.
3. En el teléfono, abre **Pasito instalada** → *Ajustes* → *Avisos con la app cerrada* → **Conectar este teléfono**
   → acepta el permiso → **Enviar aviso de prueba**.

Qué llega y cómo:

- Los avisos del **perfil que avisa**, sus rutinas (los próximos 14 días) y, si tienes «Insistir», dos recordatorios más.
- En Android la notificación trae **Hecha** (cuenta como hecha, con sus estrellas, al abrir Pasito) y **En 10 min**.
  En iPhone, tocarla abre Pasito con el aviso delante.
- En Android, si Pasito está abierta y delante, el aviso sale dentro de la app en vez de como notificación, para no repetirlo.
  En iPhone siempre llega también la notificación (Safari lo exige).
- Las rutinas se programan para 14 días. Antes de que se acaben llega un aviso para que abras Pasito un momento y se renueven;
  en la práctica, con abrirla de vez en cuando basta.
- El contenido va cifrado de extremo a extremo; tu servidor solo guarda la hora, el título y el primer paso de cada aviso.

## Cómo publicarlo (gratis, con GitHub Pages)

Necesitas que el código esté en la rama principal (`main`) o elegir directamente la rama donde está.

1. **Lleva el código a `main`** (recomendado): en GitHub abre *Pull requests → New pull request*, elige la rama
   `claude/task-list-app-reminders-svr02v` y pulsa *Create pull request* y luego *Merge*.
   *(Atajo: puedes saltarte esto y elegir esa rama en el paso 3.)*
2. Ve a **Settings → Pages** del repositorio.
3. En **Build and deployment → Source** elige **Deploy from a branch**; en **Branch** elige `main` (o la rama) y la carpeta **`/ (root)`**. Pulsa **Save**.
4. Espera 1–2 minutos y recarga esa página: aparecerá la dirección, del tipo
   `https://<tu-usuario>.github.io/AUDHD-task-helper/`.
5. **En el móvil**, abre esa dirección y añádela a la pantalla de inicio:
   - Android (Chrome): menú ⋮ → **Instalar app** o **Añadir a pantalla de inicio**.
   - iPhone (Safari): botón **Compartir** → **Añadir a pantalla de inicio**. Ábrela desde el icono y activa los avisos.

Cada vez que se suba un cambio a esa rama, GitHub Pages lo publica solo en un par de minutos.
Si el móvil sigue mostrando la versión anterior, cierra la app del todo y vuelve a abrirla.

## Cómo probarlo

### En el ordenador

```bash
npm start            # abre http://localhost:8080
```

(Con `localhost` funcionan también los avisos y el modo sin conexión. Abrir `index.html` con doble clic sirve para mirar, pero no instala la app.)

### Lista rápida para probar a mano (5 minutos)

> Para probar los avisos con la app cerrada, primero conecta el teléfono (sección anterior), ponte una tarea
> `probar en 2 minutos`, cierra Pasito del todo y espera.


1. Elige tu **batería** en Hoy → pulsa **Dime qué hago ahora** → **Empezar 5 minutos**.
2. Escribe `probar aviso en 1 minuto`, pulsa Enter, **activa los avisos** y espera: debe salir el aviso con sonido.
   No lo toques y en 10 minutos insistirá.
3. En Tareas: abre una tarea, añade pasos, márcalos (estrellas y confeti), bórrala y pulsa **Deshacer**.
4. Prueba **Vaciar la cabeza** con varias líneas y añade una **rutina**.
5. Toca tu círculo de perfil → **Editar** → **Elegir foto**. Luego crea **«Trabajo»** → comprueba que está vacío → vuelve a tu perfil y todo sigue ahí.
6. En Logros, **anota algo que hiciste**.
7. En el móvil: instala la app, ponte un aviso `en 2 minutos` y bloquea la pantalla para ver cómo se comporta tu teléfono.

### Pruebas automáticas

```bash
npm test             # lógica y servidor de avisos (cifrado, firma, envío), sin dependencias
npm run test:e2e     # recorre la app en Chromium; necesita: npm i -D playwright && npx playwright install chromium
```

## Tus datos

- Se guardan solo en el navegador de ese dispositivo (`localStorage`). No hay sincronización entre dispositivos.
- En **Ajustes → Tus datos** puedes descargar o copiar una copia del perfil actual y restaurarla en otro dispositivo o perfil.
- Si borras los datos del navegador, se pierden: haz una copia de vez en cuando.
