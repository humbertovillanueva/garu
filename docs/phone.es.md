*In English: [phone.md](phone.md)*

# Garu en tu teléfono

La sala de control es una app web que se instala en tu pantalla de inicio. Aprueba lo que pide un agente desde donde estés, mira una ejecución en vivo, revisa el gasto. Nada se va a una nube: tu teléfono habla con el mismo proceso `garu ui` de tu computadora, por una conexión privada.

## La conexión privada: Tailscale

El navegador de la computadora donde corre Garu es de confianza automáticamente. Cualquier otro dispositivo tiene que iniciar sesión con el token de la sala de control, una llave que Garu crea al arrancar por primera vez y guarda en `.garu/ui-token`. Ese token es lo único que separa a un desconocido de tu botón de aprobar, así que la sala de control debe seguir viviendo en una red que sea tuya. [Tailscale](https://tailscale.com) le da a cada dispositivo tuyo una dirección privada y hace que se alcancen entre ellos y nada más. El plan gratuito alcanza para esto.

1. Instala Tailscale en la computadora donde corre Garu y en tu teléfono, con la misma cuenta en los dos.
2. En la computadora, con `garu ui --up` corriendo en su host y puerto predeterminados:

   ```sh
   tailscale serve --bg 4000
   ```

   Tailscale imprime una dirección como `https://your-mac.tail1234.ts.net`. Lleva un certificado HTTPS real y solo tus dispositivos pueden resolverla.

3. En la computadora, en la sala de control que ya tienes abierta (localhost está bien), ve a **Ajustes → Tu teléfono y otros dispositivos** y pulsa *Mostrar código de vinculación*. Garu le pregunta a Tailscale la dirección que está sirviendo y apunta el código ahí.
4. Escanea el código con la cámara de tu teléfono. Abre la sala de control con la sesión ya iniciada.

El código es un enlace que lleva el token, y por eso debes escanearlo tú y nadie más. Si prefieres no escanear (un iPhone, o un emulador sin cámara), pulsa *Copiar enlace* ahí y pégalo en la pantalla de inicio de sesión del teléfono. Un teléfono se queda con la sesión iniciada un año; *Cerrar sesión* está en el mismo panel de Ajustes. Si el token llega a filtrarse, detén Garu, borra `.garu/ui-token`, arráncalo de nuevo, y todos los dispositivos tendrán que iniciar sesión otra vez.

`--bg` lo mantiene sirviendo después de que cierres la terminal; `tailscale serve off` lo detiene. La sala de control en sí sigue escuchando en `127.0.0.1:4000`, así que nada en tu red local puede llegarle directamente.

Para que la otra mitad también sobreviva a un reinicio, ejecuta `garu service install` en tu carpeta de Garu una sola vez: la sala de control y los horarios arrancan entonces al iniciar sesión (y se reinician si fallan), con su salida en `.garu/ui.log`. Detén primero el `garu ui` que tenías en una terminal, porque el servicio toma el puerto.

## Instálala

**iPhone (Safari):** Compartir → *Agregar a inicio*. Se abre a pantalla completa con su propio ícono.

**Android (Chrome):** el menú ofrece *Instalar app*, o *Agregar a la pantalla principal*.

HTTPS es lo que hace posible la instalación, una razón más para pasar por `tailscale serve` en vez de poner a Garu a escuchar en otra dirección.

## Notificaciones

La app del teléfono muestra lo que está esperando cuando la abres. Para recibir un aviso push cuando un agente se pausa, ejecuta la sala de control con `--notify https://ntfy.sh/<your-topic>` y suscríbete a ese tema en la app de [ntfy](https://ntfy.sh). Cada notificación enlaza de vuelta a la sala de control, así que de la pantalla de bloqueo a la tarjeta de revisión hay un solo toque.

## Sin Tailscale

`garu ui --host 0.0.0.0` escucha en todas las interfaces. Los dispositivos de la red pueden cargar la página, pero no ven ni aprueban nada sin el token. Es HTTP simple, así que el token viaja sin cifrar por esa red y el teléfono no puede instalar la página como app; úsalo solo en una red que controles por completo, y prefiere la configuración de arriba. `garu ui --require-login` obliga a iniciar sesión incluso al navegador local, para una computadora compartida.
