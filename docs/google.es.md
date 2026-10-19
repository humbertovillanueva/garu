*In English: [google.md](google.md)*

# Gmail y Google Calendar

Dos de los agentes de este repositorio trabajan sobre tu cuenta de Google:

- **Tomay** (`agents/tomay`) lee la agenda de hoy cada día entre semana a las 7:00 y escribe una nota de preparación para cada reunión a partir de tu correo reciente con las personas que participan, más tus huecos libres. Solo lee.
- **Bea** (`agents/bea`) clasifica el correo del último día en cuatro etiquetas a las 8:00 y redacta respuestas para lo que las necesita. Cada borrador espera tu aprobación, y ella no tiene forma de enviar.

Hablan con Google a través de `packages/mcp-google`, el servidor de Gmail y Calendar de Garu. Google necesita saber quién pregunta, así que creas un proyecto gratuito de Google Cloud una sola vez. Toma unos quince minutos y no cuesta nada: sin cuenta de facturación, sin tarjeta.

## Qué le pide Garu a Google

| Agente | Permiso | Qué permite |
|---|---|---|
| Tomay | `calendar.calendarlist.readonly`, `calendar.events.readonly` | ver tus calendarios y sus eventos |
| Tomay | `gmail.readonly` | leer tu correo |
| Bea | `gmail.modify` | leer, etiquetar y redactar borradores. Google lo describe como "leer, redactar y enviar"; es el único permiso que deja etiquetar. El servidor de Garu no tiene herramienta para enviar, así que Bea no puede enviar. |

Cada conjunto de permisos es un inicio de sesión aparte, así que Tomay nunca tiene un token que pueda escribir.

## 1. Crea un proyecto

Abre [console.cloud.google.com/projectcreate](https://console.cloud.google.com/projectcreate), ponle `Garu` de nombre y pulsa **Crear**. "Sin organización" es lo normal en una cuenta personal. Puedes ignorar el aviso de la prueba gratuita; nada de esto necesita facturación.

Cuando esté creado, elige **Garu** en el selector de proyectos de arriba. Todos los pasos de abajo ocurren dentro de él.

## 2. Activa las dos APIs

Abre cada una de estas y pulsa **Habilitar**:

- [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com)
- [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) (no "CalDAV API")

Funcionó cuando la página muestra un botón **Inhabilitar API**.

## 3. Configura la pantalla de inicio de sesión

Busca **Google Auth Platform** en la consola (o **APIs y servicios → Pantalla de consentimiento de OAuth**) y pulsa **Comenzar** ("Get started"):

1. **Información de la app:** nombre de la app `Garu`, tu correo como correo de asistencia.
2. **Público:** **Externo** ("Interno" es solo para organizaciones de Workspace).
3. **Información de contacto:** tu correo.
4. Acepta la política de datos de usuario de Google y pulsa **Crear**.

Luego abre **Público** en el menú de la izquierda:

- Deja el **Estado de publicación** en **Prueba** ("Testing"). No lo publiques.
- En **Usuarios de prueba**, pulsa **Agregar usuarios** y agrega la dirección de Gmail que los agentes deben leer. Solo los usuarios de prueba pueden iniciar sesión.

## 4. Crea el cliente

Abre **Clientes → Crear cliente**:

- **Tipo de aplicación: App de escritorio** ("Desktop app"). Garu inicia sesión a través de tu propia computadora (`127.0.0.1`), que es justo para lo que sirve el tipo de escritorio. Las guías de Google muestran "Aplicación web"; eso es para apps alojadas en un sitio web.
- **Nombre:** el que quieras, p. ej. `Garu on my Mac`.
- Si Google muestra una casilla **Use this client for an AI-powered agent** (usar este cliente para un agente con IA), márcala. Garu se probó con ella marcada, y los servidores MCP de Workspace de Google solo aceptan clientes marcados así.

Pulsa **Crear**. Antes de cerrar la ventana que aparece, pulsa **Descargar JSON**: Google muestra el secreto del cliente una sola vez.

## 5. Pon el cliente en `.env`

Del archivo descargado, copia `client_id` y `client_secret` a `.env` en la raíz del repositorio (está en el gitignore):

```sh
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

Cópialos del archivo en vez de teclearlos desde la pantalla: `l`, `I` y `1` se parecen, y un solo carácter equivocado hace que Google rechace el inicio de sesión sin decir por qué. Después guarda el archivo JSON en un lugar privado, o bórralo.

## 6. Inicia sesión, tres veces

```sh
npm run garu -- auth agents/tomay/Garufile.yaml calendar
npm run garu -- auth agents/tomay/Garufile.yaml gmail
npm run garu -- auth agents/bea/Garufile.yaml gmail
```

Cada uno abre tu navegador predeterminado:

1. Elige la cuenta que agregaste como usuario de prueba.
2. Google dice **Google no ha verificado esta app** ("Google hasn't verified this app"). Es lo esperado para tu propia app en Prueba: pulsa **Continuar** (o **Configuración avanzada → Ir a Garu (no seguro)**).
3. Revisa que los permisos coincidan con la tabla de arriba, márcalos y pulsa **Continuar**.
4. La página dice **Signed in** (sesión iniciada). Ciérrala.

`npm run garu -- validate agents/bea/Garufile.yaml` muestra `signed in` junto a cada servidor cuando está listo.

## 7. Crea las etiquetas de Bea

En Gmail, pulsa **+** junto a **Etiquetas** y crea `Garu`. Luego crea cuatro más, cada una con **Anidar etiqueta en: Garu**: `Needs reply`, `FYI`, `Receipts`, `Newsletters` (Responder, Para saber, Recibos, Boletines: la edición en español de Bea usa esos nombres, ver más abajo). Bea solo agrega tus propias etiquetas; no puede crearlas, y nunca toca Recibidos, Spam ni Papelera.

## 8. Pruébalos

Abre la sala de control (`npm run garu -- ui --up`), ve a **Agentes** y pulsa **Ejecutar ahora** en Tomay, y luego en Bea. Tomay escribe el resumen de hoy en `agents/tomay/briefs/`. Bea clasifica el correo del último día, y cada borrador que escribe aparece en la **Bandeja** para que lo apruebes o lo rechaces con una nota. Un borrador aprobado va a **Borradores** de Gmail; nunca se envía.

Si Garu corre como servicio de inicio de sesión, reinícialo para que los horarios tomen a los agentes: `npm run garu -- service restart`.

## En español

Cada agente y cada ejemplo trae una edición en español junto a la inglesa, `Garufile.es.yaml` al lado de `Garufile.yaml` (para Tomay y Bea: `agents/tomay/Garufile.es.yaml` y `agents/bea/Garufile.es.yaml`). Las mismas reglas, con las instrucciones en español y `language: es`, que hace que Garu les pase la fecha en español y les diga que escriban sus resúmenes y respuestas en ese idioma (una respuesta sigue el idioma del correo que contesta). Garu solo carga archivos llamados `Garufile.yaml`, así que para cambiar un agente, copia su edición en español encima de la inglesa:

```sh
cp agents/tomay/Garufile.es.yaml agents/tomay/Garufile.yaml
cp agents/bea/Garufile.es.yaml agents/bea/Garufile.yaml
```

Las etiquetas de Bea también están en español: en el paso 7, anida `Responder`, `Para saber`, `Recibos` y `Boletines` bajo `Garu`. Los agentes te llaman por el nombre con el que corre Garu (`--as`, o `GARU_USER` en `.env`), así que no hay que editar nada en los archivos.

## Conviene saber

- **El inicio de sesión dura 7 días en Prueba.** Google lo hace expirar en las apps que no están publicadas, porque el acceso a Gmail es delicado. Desde el sexto día la pantalla de inicio dice **Vuelve a iniciar sesión pronto** con el comando; pasado el séptimo el agente muestra **falta iniciar sesión**. En ambos casos, vuelve a ejecutar su comando `garu auth`.
- **Tu correo va al modelo que elegiste.** El texto de los hilos que leen los agentes se envía al modelo de su Garufile (Gemini de forma predeterminada). Un modelo local a través de Ollama lo mantiene en tu máquina.
- **Los tokens se quedan en tu computadora**, en `.garu/auth/` (en el gitignore). `garu auth <Garufile> <server> --forget` elimina uno, y puedes revocar el acceso de Garu en cualquier momento en [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Los servidores MCP de Gmail y Calendar de Google** solo responden a proyectos inscritos en el Google Workspace Developer Preview Program. El servidor de Garu usa las APIs normales, así que funciona hoy con una cuenta personal.
