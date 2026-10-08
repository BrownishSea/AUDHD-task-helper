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
- Los avisos de los otros perfiles también te llegan: «Aviso para Trabajo: …» con un botón para cambiar.
- Al cambiar de perfil, si había una sesión de enfoque en marcha, queda en pausa.
- Borrar un perfil se puede deshacer unos segundos. Los perfiles **no tienen contraseña**.
- Si usabas la versión anterior, tus datos pasan solos al primer perfil («Yo»; puedes renombrarlo).

## Recordatorios: lo que hay que saber

1. Pulsa **Activar avisos** (en Hoy o en Ajustes) y acepta el permiso del navegador.
2. Los avisos funcionan **mientras Pasito esté abierto**, aunque sea en otra pestaña o minimizado.
3. **Con el navegador cerrado ninguna web puede avisarte.** Para lo importante abre la tarea → **«Añadir a mi calendario»**:
   se descarga un `.ics` que tu calendario (Google, Apple, Outlook) importa con su propia alarma.
4. En iPhone/iPad las notificaciones solo funcionan si instalas Pasito en la pantalla de inicio (iOS 16.4 o superior).

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
npm test             # lógica (fechas, captura, sugerencias…), sin dependencias
npm run test:e2e     # recorre la app en Chromium; necesita: npm i -D playwright && npx playwright install chromium
```

## Tus datos

- Se guardan solo en el navegador de ese dispositivo (`localStorage`). No hay sincronización entre dispositivos.
- En **Ajustes → Tus datos** puedes descargar o copiar una copia del perfil actual y restaurarla en otro dispositivo o perfil.
- Si borras los datos del navegador, se pierden: haz una copia de vez en cuando.
