# Pasito

Listas de tareas, recordatorios y ánimo para cerebros con TDAH.
Funciona en el navegador, se puede instalar en el móvil y **no necesita cuenta ni servidor**: todo se guarda en tu dispositivo.

> ¿Eres un agente o vas a programar? Lee [`AGENTS.md`](AGENTS.md).

## Qué hace

| Pestaña | Para qué sirve |
| --- | --- |
| **Hoy** | Un vistazo de tu día en frases simples ("2 tareas en tu foco", "1 aviso pasó de hora"), tu nivel de **batería**, el botón **«Dime qué hago ahora»**, tu foco de hoy (máx. 3) y tu progreso. |
| **Tareas** | Todas tus listas (Bandeja, Personal, Casa, Trabajo / estudio y las que crees). Cada tarea puede tener pasos pequeños, tiempo aproximado, energía que pide, recordatorio y repetición. |
| **Enfoque** | Temporizador de 5 a 45 minutos con el siguiente paso a la vista, mensajes de ánimo y descansos. |
| **Logros** | Estrellas, niveles, tus últimos 7 días y todo lo que lograste. |

### Pensado para TDAH

- **Captura en un segundo.** Escribe arriba y pulsa Enter. Entiende frases como
  `llamar a mamá mañana a las 5`, `pagar la luz el viernes 10:00`, `estudiar esta tarde` o `lavar ropa hoy`
  y crea el recordatorio solo. Todo lo que anotas sin lista va a la **Bandeja** para ordenarlo después.
- **«¿Qué hago ahora?»** Elige una sola tarea según tu batería, tus avisos y tu foco, y te dice *por qué*.
  Si es grande, te propone dividirla en pasos. Si no te convence, pide otra.
- **Pasos pequeños.** Cada paso da una estrella. Si te cuesta empezar, hay sugerencias como «Hacerlo solo 5 minutos».
- **Empezar 5 minutos.** Un toque y arranca el temporizador con esa tarea.
- **Estímulos positivos.** Confeti, sonido suave, el texto se marca con fluorescente, mensajes de ánimo y estrellas
  (2 por tarea fácil, 3 media, 5 difícil; 1 por paso; 2 por sesión de enfoque).
- **Sin culpa.** Nada de rachas que se rompen ni texto en rojo acusador. Lo vencido aparece como «se pasó la hora»
  con botones para elegir otro momento. Todo lo que borras se puede **deshacer**.
- **Rutinas.** Repite cada día, de lunes a viernes o cada semana; los pasos se reinician solos.

## Recordatorios: lo que hay que saber

1. Pulsa **Activar avisos** (en Hoy o en Ajustes). Te avisará con notificación, sonido y vibración.
2. Los avisos funcionan **mientras Pasito esté abierto**, aunque sea en otra pestaña o minimizado.
3. **Con el navegador cerrado ninguna web puede avisarte.** Para lo importante abre la tarea y pulsa
   **«Añadir a mi calendario»**: se descarga un archivo `.ics` que tu calendario (Google, Apple, Outlook) abre
   con su propia alarma, que sí suena aunque Pasito esté cerrado.
4. En iPhone/iPad las notificaciones solo funcionan si instalas Pasito en la pantalla de inicio (iOS 16.4 o superior).

## Cómo usarlo

### En tu ordenador (rápido)

```bash
npm start        # sirve la carpeta en http://localhost:8080
```

También puedes abrir `index.html` con doble clic, pero así no se instala ni funciona sin conexión.

### En el móvil: publicarlo gratis con GitHub Pages

1. En GitHub, ve a **Settings → Pages** de este repositorio.
2. En **Source** elige **Deploy from a branch**, rama `main` (o la rama con esta app) y carpeta `/ (root)`.
3. En un par de minutos tendrás una dirección como `https://<tu-usuario>.github.io/AUDHD-task-helper/`.
4. Ábrela en el móvil y usa **«Añadir a pantalla de inicio»** (Safari: botón Compartir; Chrome: menú ⋮ → Instalar app).

## Tus datos

- Se guardan solo en el navegador de ese dispositivo (`localStorage`). No hay sincronización entre dispositivos.
- En **Ajustes → Tus datos** puedes descargar o copiar una copia de seguridad, y restaurarla en otro dispositivo.
- Si borras los datos del navegador, se pierden: haz una copia de vez en cuando.

## Pruebas

```bash
npm test         # pruebas de la lógica (Node 18+), sin dependencias
```
