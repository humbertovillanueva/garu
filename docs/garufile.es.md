*In English: [garufile.md](garufile.md)*

# El Garufile

Un agente es un archivo YAML: qué hace, cuándo corre, qué herramientas recibe y qué puede hacer con ellas. Esta página está escrita a partir del esquema mismo, así que dice exactamente lo que Garu acepta. Un editor puede revisar un archivo mientras escribes: el esquema está en https://garuagents.com/garufile.schema.json, y un Garufile lo señala con esta primera línea:

```yaml
# yaml-language-server: $schema=https://garuagents.com/garufile.schema.json
```

Un `${VAR}` en cualquier parte de `tools` se lee de `.env` al ejecutar, así que las claves nunca quedan en el archivo.

## Nivel superior

Lo que tiene todo Garufile. `name`, `model` y `prompt` son obligatorios; todo lo demás tiene un valor predeterminado.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `name` | texto | obligatorio | El nombre del agente: minúsculas, dígitos y guiones. Es como lo llamas, y su carpeta bajo agents/. |
| `description` | texto | `""` | Qué hace, en una línea; se muestra bajo su nombre. |
| `language` | texto |  | En qué idioma te escribe, como código (es, pt-BR); recibe la fecha en ese idioma también. Sin definir: inglés. |
| `memory` | true / false | `false` | Una libreta pequeña que guarda entre ejecuciones (garu.remember y garu.forget, vigilados como cualquier herramienta; la lees y editas en su página). |
| `paused` | true / false | `false` | Se queda en el horario pero se salta, hasta que lo reanudes. |
| `persona` | objeto |  | Su cara y una línea de carácter; lo que puede hacer es la política. |
| `model` | texto | obligatorio | proveedor/modelo, como gemini/gemini-2.5-flash-lite, anthropic/claude-haiku-4-5, openai/gpt-5-mini u ollama/qwen3:8b. |
| `prompt` | texto | obligatorio | El trabajo, tal como lo lee el modelo. Garu agrega por su cuenta la fecha, tu nombre y las herramientas. |
| `tools` | lista | ninguno | Los servidores de herramientas MCP que puede usar: un comando que Garu ejecuta, o una URL a la que se conecta. Vacío: solo puede pensar y responder. |
| `triggers` | lista | `[{"manual":true}]` | Cuándo corre: un horario cron, una puerta webhook, o solo cuando se le pide. |
| `policy` | lista | `[{"tool":"*","action":"ask"}]` | Las reglas delante de cada llamada a una herramienta, leídas de arriba abajo; la primera que coincide gana, y una llamada que ninguna regla cubre te pregunta. |
| `maxTurns` | número entero | `25` | Como máximo estos turnos del modelo en una ejecución, para que nunca pueda ciclar sin fin. |
| `budget` | objeto | ninguno | El guardián del dinero: un tope por ejecución, un tope de ejecuciones al día, tus propios precios. |
| `modelOptions` | mapa | ninguno | Perillas del modelo: temperature, maxOutputTokens, thinkingBudget, y las opciones propias de Ollama tal cual. Una clave que un proveedor no tiene dónde poner se omite. |
| `sandbox` | objeto |  | Ejecuta cada servidor de herramientas dentro de su propio contenedor Docker. Omítelo para ejecutarlos en esta computadora; defínelo (aunque sea {}) para contenerlos. |

## `persona`

Su cara y una línea de carácter. Lo que puede hacer es la política, no la persona.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `kind` | `owl` · `fox` · `turtle` · `bee` · `cat` · `octopus` · `rabbit` · `bear` · `frog` · `penguin` · `raccoon` · `whale` | obligatorio | Su cara en la sala de control: owl (vigilante), fox (mensajero), turtle (guardián de archivos), bee (obrero), cat (lector), octopus (planificador), rabbit (corredor), bear (guardián), frog (conector), penguin (organizador), raccoon (experimentador), whale (lector de fondo). |
| `tagline` | texto |  | Una línea de carácter, mostrada bajo su nombre. |

## `tools`: un servidor que corre en tu computadora

Un programa que Garu inicia (y puede aislar). Con `auth: oauth`, Garu inicia sesión por él una vez y le entrega un token de acceso de corta vida al inicio de cada ejecución; el servidor nunca ve el secreto.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `name` | texto | obligatorio | El nombre del servidor en las reglas y en el registro: minúsculas, dígitos, - o _. Las herramientas son "<nombre>.<herramienta>". |
| `command` | texto | obligatorio | El programa que ejecuta el servidor MCP (node, npx, python…). |
| `args` | lista de texto | ninguno | Sus argumentos; ${VAR} lee un valor de .env. |
| `env` | mapa | ninguno | Variables de entorno para el servidor; ${VAR} lee un valor de .env, así que los secretos nunca quedan aquí. |
| `cwd` | texto |  | La carpeta en la que arranca. |
| `auth` | `none` · `oauth` |  | oauth: Garu inicia sesión por él una vez (garu auth, o la página del agente) y le entrega un token de acceso de corta vida al inicio de cada ejecución. |
| `oauth` | objeto |  | Tu propio cliente OAuth, para un servidor que no entrega uno. |

## `tools`: un servidor al que te conectas

Una URL que habla MCP sobre Streamable HTTP. Las cabeceras llevan claves desde `.env`; `auth: oauth` conserva el inicio de sesión de `garu auth`. Nada corre localmente, así que el aislamiento no aplica.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `name` | texto | obligatorio |  |
| `url` | texto | obligatorio |  |
| `headers` | mapa | ninguno | Cabeceras fijas, como una clave de API en ${VAR} desde .env. |
| `auth` | `none` · `oauth` | `"none"` | oauth: Garu inicia sesión en él una vez (garu auth) y guarda los tokens. |
| `oauth` | objeto |  | Tu propio cliente OAuth, cuando el servidor necesita uno. |

## `oauth`

Tu propio cliente OAuth, para un servidor que no entrega uno (Google, por ejemplo). Los valores pueden ser `${VAR}` desde `.env`, así que ningún secreto queda en el archivo.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `clientId` | texto | obligatorio | El id de tu cliente OAuth; ${VAR} lo lee de .env. |
| `clientSecret` | texto |  | El secreto de tu cliente OAuth, como ${VAR} desde .env; nunca escrito aquí. |
| `scopes` | lista de texto |  | Los permisos que pide el inicio de sesión (el scope). |
| `authorizationParams` | mapa | ninguno | Parámetros extra del inicio de sesión, como access_type: offline de Google para que las ejecuciones renueven el token sin ti. |
| `issuer` | texto |  | Con quién inicias sesión, como https://accounts.google.com. Un servidor local lo necesita; uno remoto lo encuentra solo. |

## `triggers`: uno de

Cuándo corre. Un disparador tiene uno de estos; un agente puede tener varios.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `cron` | texto |  | Un horario (minuto hora día mes día-de-semana), en la zona horaria de esta computadora; corre mientras la sala de control está activa con --up o como servicio de inicio. |
| `webhook` | texto |  | Una puerta: POST /api/agents/<agente>/hooks/<nombre> en la sala de control inicia una ejecución, con el message del cuerpo como entrada. |
| `manual` | true / false |  | Corre cuando se le pide: Ejecutar ahora, un mensaje, garu run. |

## `policy`: una regla

Las reglas se leen de arriba abajo; la primera cuyo patrón de herramienta y condiciones coinciden con una llamada la decide. Una llamada que ninguna regla cubre te pregunta. Una herramienta que ninguna regla puede permitir no se le muestra al modelo.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `tool` | texto | obligatorio | Un patrón sobre "<servidor>.<herramienta>": "gmail.send", "fs.*", "*". La primera regla cuyo patrón y condiciones coinciden con una llamada la decide. |
| `action` | `allow` · `ask` · `block` | obligatorio | allow: la llamada pasa por su cuenta. ask: espera tu aprobación en la bandeja. block: se rechaza, y una herramienta que ninguna regla puede permitir no se le muestra al modelo. |
| `when` | mapa |  | Condiciones sobre los argumentos de la llamada, por ruta con puntos ("to", "recipients.length"); todas deben cumplirse para que la regla coincida. |
| `reason` | texto |  | Por qué, en tus palabras: se muestra en la tarjeta de revisión, en el registro y en el aviso. |

## `when`: una condición

Indexada por una ruta con puntos en los argumentos de la llamada (`to`, `recipients.length`); todas las condiciones deben cumplirse para que la regla coincida.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `eq` | cualquier valor |  | El argumento es igual a este valor (igualdad profunda para listas y objetos). |
| `neq` | cualquier valor |  | El argumento es distinto de este valor. |
| `gt` | número |  | El argumento es un número mayor que este. |
| `gte` | número |  | El argumento es un número mayor o igual que este. |
| `lt` | número |  | El argumento es un número menor que este. |
| `lte` | número |  | El argumento es un número menor o igual que este. |
| `matches` | texto |  | El argumento, como texto, coincide con esta expresión regular (sintaxis de JavaScript; sin modificadores en línea). |
| `ignoreCase` | true / false |  | Para matches: mayúsculas y minúsculas cuentan igual. |
| `in` | lista de cualquier valor |  | El argumento es uno de estos valores. |
| `exists` | true / false |  | true: el argumento está presente; false: está ausente. |

## `budget`

El guardián del dinero. Todo agente siempre activo debería tener un tope por ejecución.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `maxCostUsd` | número |  | Una ejecución se detiene antes de que su costo estimado cruce estos dólares. |
| `maxRunsPerDay` | número entero |  | Como máximo estas ejecuciones al día, las inicie lo que las inicie; una ejecución que la red cortó no cuenta. |
| `pricing` | objeto |  | Tu propio precio para este modelo, en dólares por millón de tokens (ambos 0 en un nivel gratuito); si no, la tabla de Garu. |

## `budget.pricing`

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `inputPerMTok` | número | obligatorio | Dólares por millón de tokens de entrada. |
| `outputPerMTok` | número | obligatorio | Dólares por millón de tokens de salida. |

## `sandbox`

Defínelo (aunque sea `{}`) para ejecutar cada servidor de herramientas dentro de su propio contenedor Docker. `garu sandbox build` crea la imagen predeterminada.

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `image` | texto | `"garu-sandbox"` | La imagen Docker con los servidores de herramientas dentro; garu sandbox build crea la predeterminada. |
| `network` | `none` · `bridge` | `"none"` | none: sin red en absoluto. bridge: internet de salida normal. |
| `workspace` | texto |  | Una carpeta de esta computadora montada con lectura y escritura en /workspace dentro del contenedor. |
| `mounts` | lista | ninguno | Más carpetas por montar. |
| `memory` | texto | `"512m"` | Memoria para el contenedor, como 512m o 2g. |
| `cpus` | número | `1` | CPUs para el contenedor. |

## `sandbox.mounts`

| Clave | Tipo | Predeterminado | Qué es |
|---|---|---|---|
| `host` | texto | obligatorio | Una carpeta de esta computadora. |
| `container` | texto | obligatorio | Dónde aparece dentro del contenedor (una ruta absoluta). |
| `readonly` | true / false | `false` | Montarla solo de lectura. |

`garu validate <Garufile>` revisa un archivo; `garu try <agente> <servidor.herramienta>` dice qué harían sus reglas con una llamada; `garu new` escribe uno a partir de unas preguntas, y también "Nuevo agente" en la sala de control.
