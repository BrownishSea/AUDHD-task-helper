# Servidor de avisos de Pasito

Un servidor pequeño y gratuito (Cloudflare Workers) que envía las notificaciones a tu teléfono **aunque Pasito esté cerrada**.
Solo lo necesitas una vez; después cada teléfono se conecta desde *Ajustes → Avisos con la app cerrada*.

- **Qué guarda:** por cada teléfono conectado, su suscripción de notificaciones y la lista de avisos programados
  (hora, título de la tarea y el primer paso). Nada más: ni tus listas, ni tus notas, ni tus estrellas.
- **Cuánto cuesta:** nada. Cabe de sobra en el plan gratuito de Cloudflare (Workers, KV y una tarea programada por minuto).
- **Con qué funciona:** Chrome en Android (en el navegador o instalada) y Pasito instalada en iPhone/iPad con iOS 16.4 o superior.
  También en Chrome, Edge y Firefox de escritorio.

## Opción A: desde el navegador, sin instalar nada (recomendada)

1. Crea una cuenta gratis en <https://dash.cloudflare.com/sign-up> y entra.
2. **Crea el almacén de datos.** Menú *Storage & Databases → Workers KV* → **Create instance** (o *Create namespace*).
   Ponle de nombre `PASITO` y créalo.
3. **Crea el Worker.** Menú *Workers & Pages* → **Create** → *Start with Hello World* (o *Create Worker*).
   Ponle de nombre `pasito-avisos` y pulsa **Deploy**.
4. **Pega el código.** En el Worker, pulsa **Edit code**, borra todo lo que hay, pega el contenido de
   [`worker.js`](worker.js) (botón *Raw* en GitHub → seleccionar todo → copiar) y pulsa **Deploy**.
5. **Conecta el almacén.** En el Worker: *Settings → Bindings → Add → KV namespace*.
   *Variable name*: `PASITO` (exactamente así, en mayúsculas). *KV namespace*: el `PASITO` que creaste. Guarda.
6. **Programa la revisión cada minuto.** *Settings → Trigger events* (o *Triggers → Cron Triggers*) → **Add** →
   *Cron expression*: `* * * * *` (cinco asteriscos separados por espacios). Guarda.
7. **(Recomendado) Limita quién puede usarlo.** *Settings → Variables and Secrets → Add*: tipo *Text*,
   nombre `ALLOWED_ORIGIN`, valor **solo el dominio** de tu Pasito, sin la carpeta ni barra final: por ejemplo
   `https://brownishsea.github.io` (no `https://brownishsea.github.io/AUDHD-task-helper/`).
   Así otras webs no pueden usar tu servidor desde el navegador. No es una contraseña: es una protección básica.
8. **Comprueba que funciona.** Abre la dirección del Worker (aparece arriba, del tipo
   `https://pasito-avisos.tu-usuario.workers.dev`). Debe responder `{"ok":true,"name":"Pasito · servidor de avisos"}`.
   Si ves un error sobre el espacio KV, revisa el paso 5.

## Opción B: con la terminal (Node 18 o superior)

```bash
cd server
npx wrangler@4 login                          # abre el navegador para entrar en tu cuenta
npx wrangler@4 kv namespace create PASITO     # copia el "id" que te muestra
# pega ese id en wrangler.toml, en la línea: id = "PEGA_AQUI_EL_ID_DEL_KV"
# (recomendado) pon tu dirección de Pasito en ALLOWED_ORIGIN, dentro de wrangler.toml
npx wrangler@4 deploy                         # te muestra la dirección: https://pasito-avisos.<tu-usuario>.workers.dev
```

## Conectar tu teléfono

1. (Opcional, pero cómodo) Pon la dirección del Worker en [`config.js`](../config.js), en `pushApi: '...'`, y súbelo a GitHub.
   Así ningún teléfono te la pedirá. Ten en cuenta que, si el repositorio es público, esa dirección queda a la vista;
   si prefieres no publicarla, déjalo vacío y escríbela a mano en cada teléfono.
2. En el teléfono abre **Pasito instalada** (en iPhone: Compartir → *Añadir a pantalla de inicio*, y ábrela desde ese icono).
3. *Ajustes → Avisos con la app cerrada* → escribe la dirección si te la pide → **Conectar este teléfono** → acepta el permiso.
4. Pulsa **Enviar aviso de prueba**. Debe llegarte una notificación en unos segundos. Prueba también con la app cerrada.

Cada teléfono o navegador se conecta por separado (hasta 10 por servidor). Pasito mantiene la lista de avisos al día sola:
cada vez que cambias una tarea, la vuelve a enviar (solo si cambió algo), también justo al cerrar o esconder la app.

## Cómo funciona por dentro

- Pasito envía al Worker los avisos **del perfil que avisa** (ver *Perfiles → ¿Quién recibe los avisos?*) de los próximos
  14 días, incluidas las rutinas que se repiten y, si tienes activado «Insistir», dos recordatorios más a los 10 y 20 minutos.
- El servidor solo sabe lo que Pasito le envió. Si tienes rutinas, medio día antes de que se acabe esa lista llega un aviso
  «Abre Pasito un momento…»: al abrirla se renueva. Abrir Pasito de vez en cuando basta.
- Cada minuto, el Worker envía los que tocan con **Web Push**, firmados con VAPID y cifrados de extremo a extremo
  (aes128gcm): solo tu teléfono puede leer el contenido, ni siquiera el servicio de push de Google o Apple.
  La clave VAPID se crea sola la primera vez y se guarda en tu KV.
- Botones de la notificación (en Android): **Hecha** marca la tarea (con sus estrellas) la próxima vez que abras Pasito;
  **En 10 min** la vuelve a programar. Tocar o descartar la notificación cancela las insistencias de ese aviso.
- Si un teléfono cancela las notificaciones, el servicio de push lo dice y el Worker lo olvida.

## Si algo no funciona

| Qué ves | Qué hacer |
| --- | --- |
| «No pude hablar con tu servidor de avisos» | Revisa la dirección (empieza por `https://` y acaba en `.workers.dev`) y que el Worker responda en el navegador (paso 8). |
| «Origen no permitido: este servidor solo atiende a …» | `ALLOWED_ORIGIN` no coincide con el dominio de tu Pasito. Pon solo `https://tu-usuario.github.io` (sin carpeta). |
| «Este servidor ya tiene 10 dispositivos conectados» | El servidor admite 10. Desconecta en Pasito los teléfonos o navegadores que ya no uses. |
| «Sin permiso para notificaciones» | Se negó el permiso. Pasito te dice dónde activarlo en tu teléfono; actívalo y vuelve a conectar. |
| En iPhone no aparece la opción | Pasito tiene que estar instalada en la pantalla de inicio y abierta desde su icono (iOS 16.4+). |
| El aviso de prueba no llega | En el teléfono, revisa que las notificaciones de Chrome / de Pasito estén permitidas y que no esté en modo «No molestar». |
| «Ya no está suscrito» | Pulsa *Desconectar* y vuelve a *Conectar este teléfono*. |

Los avisos llegan con hasta un minuto de retraso (la revisión es por minuto). Si el teléfono está sin conexión,
el servicio de push guarda el aviso hasta 6 horas.
