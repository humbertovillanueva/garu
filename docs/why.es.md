*In English: [why.md](why.md)*

# Garu, explicado

Este es el documento que hay que leer antes de explicarle Garu a alguien más. Cuenta de dónde salió la idea, qué es cada pieza y por qué existe, qué intentamos lograr, en qué se diferencia Garu de todo lo que tiene cerca, y las preguntas difíciles que la gente va a hacer. Léelo dos veces. La última sección te da las versiones de una frase, de un párrafo y de un minuto para decirlas en voz alta.

## De dónde salió

En las cinco semanas antes de que Garu existiera, dos de las empresas más grandes del mundo lanzaron el mismo producto. OpenAI anunció Dots en su DevDay: agentes siempre activos, cada uno con su propia computadora en la nube, que trabajan para ti las veinticuatro horas. Meta lanzó Muse: un agente personal en la nube de Meta que reserva, llena formularios y compra, con aprobaciones por una app o por WhatsApp. Los dos contaron la misma historia: vas a tener agentes trabajando para ti mientras duermes.

Los dos tienen la misma forma de problema. Son cerrados. Están atados a los modelos de un solo proveedor. Ninguno está disponible en la mayor parte de Europa, Suiza o el Reino Unido. Dots no te deja ver ni borrar recuerdos uno por uno. Y la queja más aguda de la gente que de verdad usó Dots no era sobre la IA en absoluto: "mi ritmo lo limita mi aprobación". El agente genera trabajo más rápido de lo que un humano puede revisarlo, así que o apruebas todo sin mirar o te conviertes en el cuello de botella.

La pregunta de la que partió Garu es más simple que todo eso. Si una cosa va a correr toda la noche con acceso a mis archivos, mi correo, mis repositorios, mi Slack: ¿qué puede tocar exactamente, quién lo decidió, y dónde está el registro? Dots y Muse lo tratan como una página de ajustes. Garu lo trata como el producto.

Así que la apuesta fue: construir la versión abierta, y construirla alrededor del control. No "un agente que chatea contigo". Un runtime que ejecuta agentes, y un núcleo que se sienta entre cada agente y cada herramienta.

## Qué es Garu, en una línea

Garu es un runtime para agentes siempre activos donde cada acción pasa por una política que tú escribiste, queda registrada, tiene tope de costo y puede aislarse. La forma corta: Garu es systemd para tus agentes.

Vale la pena entender la analogía con systemd porque es precisa. systemd no escribe tus programas. Los ejecuta: los arranca según un horario, los reinicia, los aísla, registra lo que hacen, y te deja decir qué pueden tocar. Garu es esa capa para agentes. La inteligencia del agente viene del modelo al que lo apuntes. Garu es todo lo que rodea al modelo y hace que sea seguro dejarlo corriendo.

## Las cuatro piezas

**El Garufile.** Un agente es un archivo YAML. Nombra un modelo, lista los servidores de herramientas MCP que el agente puede usar, fija un horario, pone un tope al costo y, lo más importante, lleva la política. Como es un archivo, se puede comparar, revisar, versionar y compartir. El agente de otra persona es un archivo que puedes leer antes de ejecutarlo. Eso importa más de lo que suena: la alternativa, que es como funciona Dots, es una configuración que no puedes ver viviendo dentro de la nube de alguien más.

**El núcleo de política.** Este es el corazón. Cada llamada a una herramienta que el modelo quiere hacer va primero al núcleo. El núcleo lee las reglas de arriba abajo; la primera que coincide decide: permitir, preguntar o bloquear. Las reglas coinciden por el nombre de la herramienta y por los argumentos, así que puedes permitir una herramienta de fetch para cuatro hosts concretos y bloquearla en todo lo demás, o permitir una escritura de archivo solo para rutas que coincidan con `briefs/2026-10-07.md`. Tres propiedades lo hacen un núcleo y no un filtro. Se sienta entre el modelo y el cliente MCP en el código, no en el prompt, así que el modelo no puede convencerlo de dejarlo pasar. Que nada coincida significa preguntar, nunca un permiso silencioso. Y una herramienta que ninguna regla podría permitir jamás no se le muestra al modelo en absoluto, así que el modelo no puede gastar un turno intentándolo, y el servidor de 46 herramientas de GitHub aparece como 3 herramientas.

**La caja negra.** Cada ejecución escribe un archivo al que solo se agrega: los turnos del modelo con sus tokens y su costo, cada petición de herramienta, cada decisión de la política, cada aprobación y quién la dio, cada resultado. La sala de control es una vista sobre esos archivos. El `garu log` de la terminal es otra vista. No hay base de datos, así que no hay nada que se corrompa, nada que migrar, y el registro es una carpeta en la que puedes hacer grep. Si un agente hizo algo a las 3 de la mañana, puedes repasar exactamente lo que vio y lo que decidió.

**La sala de control.** Una app web, también una app de teléfono, que muestra a los agentes como lo que son: cosas con nombre, con un estado, una conversación y una historia. Cuando una regla dice preguntar, la ejecución se pausa y aparece una tarjeta de revisión que se ve como la cosa que se está pidiendo: un correo se ve como un correo, una escritura de archivo muestra el archivo, un borrador de respuesta muestra a quién va y qué dice. Aprobar, aprobar por 24 horas, o rechazar con una nota que el agente lee. También ejecuta los horarios, así que "mis agentes están corriendo" y "puedo ver a mis agentes" son el mismo proceso.

## Por qué MCP es la razón de que esto funcione

Garu no trae integraciones. Habla el Model Context Protocol, que es la forma estándar en que los modelos hablan con las herramientas; pasó a la Linux Foundation a finales de 2025 y hay más de diez mil servidores para él. Como cada herramienta, local o alojada, llega por el mismo protocolo, el núcleo es universal: un solo lenguaje de política cubre un sistema de archivos en tu laptop, el servidor alojado de GitHub, Linear, la API interna de tu empresa. Los servidores remotos se conectan por Streamable HTTP; los servidores que piden inicio de sesión usan OAuth, que `garu auth` hace una vez en un navegador. Sin MCP, Garu necesitaría un adaptador por servicio y la política sería a medida para cada adaptador. Con él, la política es el producto y las herramientas son problema de alguien más.

## La filosofía de las aprobaciones

La queja de Dots, "mi ritmo lo limita mi aprobación", es el encargo de diseño de todo lo que hay en la bandeja de Garu. Tres ideas la responden.

Primero, preguntar debe ser raro y específico. Las lecturas suelen estar permitidas sin más; las escrituras en la propia carpeta del agente suelen estar permitidas; lo que sale de la máquina o toca algo compartido es lo que pregunta. Un Garufile bien escrito pregunta por una o dos cosas por ejecución, no por veinte.

Segundo, las aprobaciones deben escribir la política. "Aprobar por 24 h" crea un permiso temporal limitado a este agente, esta herramienta, exactamente esta ruta o URL o destinatario, hasta mañana. Aprueba lo mismo tres veces sin ningún rechazo y Garu propone la regla más estrecha que cubre lo que de verdad aprobaste, y la escribe en tu Garufile, con los comentarios conservados, cuando tú lo digas. La política converge hacia lo que haces en vez de quedarse como un documento que escribiste una vez.

Tercero, un rechazo debe enseñar. Rechazar una llamada antes detenía esa llamada y nada más. Nuestro propio agente demostró por qué eso no basta: con la instrucción de vigilar "el repo de Garu" sin que le dieran el nombre, encontró el proyecto de otra persona llamado garu e intentó registrar sus estadísticas. La tarjeta de revisión atrapó los números equivocados, yo rechacé, y el agente entonces intentó publicar los mismos números equivocados en Slack, porque nada le dijo por qué. Ahora un rechazo lleva una nota, "repo equivocado, usa humbertovillanueva/garu", que vuelve al modelo antes de su siguiente paso. Una llamada rechazada se convierte en una corrección, no solo en un muro.

Y siempre: el silencio es un no. Una petición que nadie responde en treinta minutos se rechaza. Un agente sin vigilancia nunca recibe un sí por defecto.

## Qué intentamos lograr

A corto plazo, la meta es que Garu sea lo que la gente de verdad ejecuta cuando quiere un agente trabajando sin vigilancia con acceso de escritura a algo que le importa. La prueba es simple: ¿lo dejarías correr toda la noche? Si la respuesta es sí por la política, la caja negra y el tope, Garu está haciendo su trabajo.

A mediano plazo, dos cosas. Un registro, `garu install <url>`, para que un Garufile que escribió otra persona esté a un comando de distancia y puedas leer su política antes de ejecutarlo. Y un Garu alojado para quien no quiera dejar una laptop abierta: agentes que siguen corriendo, aprobar con un toque desde el teléfono, disponible en los lugares donde Dots y Muse no están.

La estrella polar: que cualquiera pueda tener agentes trabajando para sí las veinticuatro horas sin entregarle las llaves a una empresa cuyas reglas no puede leer. El archivo de política es del usuario. El registro es del usuario. El modelo es el que elija, incluido uno que corra en su propia máquina gratis.

## En qué se diferencia Garu

Frente a **Dots y Muse**: son cerrados, de un solo proveedor y restringidos por región; la política y la memoria viven en su nube. Garu es abierto, corre con cualquier modelo incluidos los locales, corre donde estás tú, y la política es un archivo que te pertenece.

Frente a **los frameworks de agentes** como LangGraph, CrewAI o el Agents SDK de OpenAI: esos sirven para construir un agente, el bucle, los prompts y la orquestación. Garu sirve para ejecutar uno sin vigilancia. Ellos resuelven el momento de construir; Garu resuelve el momento de ejecutar. Como MCP está en medio, un agente construido con uno de ellos podría en principio correr bajo el núcleo de Garu.

Frente a **OpenDots** (CopilotKit), el vecino de código abierto más cercano: es una app de compañero de trabajo siempre activo, Slack y voz y canales, con permisos por Dot. Garu es un runtime con un núcleo de política: reglas por herramienta y por argumento, ocultación estática, una caja negra, topes de presupuesto, un entorno aislado, cron, modelos locales. Ellos van a ganar "compañero amigable en Slack" por marca y por financiación; Garu no debería pelear ahí. Una app así podría correr sobre Garu.

Frente a **open-multi-agent**: fuerte en gobernanza, aprobaciones duraderas, diario verificable, pero construido para equipos que orquestan pipelines. Garu es personal y siempre activo: un archivo YAML, un comando, una bandeja, tu teléfono.

Frente a **las herramientas de flujos de trabajo** como n8n o Zapier: esas ejecutan grafos fijos que dibujaste. Garu ejecuta un modelo que decide qué hacer a continuación, dentro de límites que tú pusiste. La política existe precisamente porque el agente no es un grafo fijo.

Frente a **poner una herramienta de programación con IA en cron**: sin política por argumento, sin registro de decisiones, sin tope, sin bandeja, sin aprender de las aprobaciones. Funciona hasta la noche en que no.

La frase que lo resume todo: los demás están construyendo el agente; Garu es aquello en lo que puedes confiar para ejecutarlo.

## Qué hemos demostrado hasta ahora

No diapositivas; ejecuciones. Tomay lee la agenda cada día entre semana a las 7 y escribe una nota de preparación para cada reunión a partir del correo reciente con las personas que participan; solo puede leer, así que nunca se pausa; su primera ejecución costó $0.0013. Bea clasifica el correo del último día en cuatro etiquetas a las 8 y redacta respuestas que esperan un toque; el servidor de Gmail de Garu no tiene herramienta para enviar, así que no puede enviar ni aunque una regla estuviera mal. Sus primeras ejecuciones sobre correo real son la razón de que ahora clasifique por lotes: siete hilos, nueve turnos, $0.004. Rook lee el servidor MCP alojado de GitHub, tiene permitidas 3 de sus 46 herramientas y solo para un repositorio, y cada lunes por la mañana registra estrellas, forks, issues y PRs, publicando solo cuando algo cambió. Atlas lee un espacio de Linear por OAuth, lista el backlog y crea un issue cuando se le pide; crear issues fue la primera regla que Garu aprendió, después de tres aprobaciones y ningún rechazo. Los modelos locales a través de Ollama ejecutan los ejemplos por nada. El aislamiento con Docker ejecuta los servidores de herramientas con la red apagada. El nivel gratuito de Gemini ejecuta todo. Treinta y dos archivos de pruebas y 265 pruebas cubren el núcleo, la bandeja, los permisos temporales, las sugerencias, el planificador, los servidores remotos, OAuth, el servidor de Google y las herramientas web.

## Las preguntas difíciles, respondidas con honestidad

*¿No puede el modelo saltarse la política?* No puede llamar a una herramienta que la política bloquea; el núcleo es código entre el modelo y las herramientas, no una instrucción en el prompt. Lo que sí puede hacer es elegir un argumento equivocado para una herramienta permitida, y por eso las reglas ven los argumentos y por eso existe preguntar para las llamadas que importan.

*¿Y la inyección de prompts en los resultados de las herramientas?* El texto inyectado solo puede llegar a herramientas permitidas con argumentos permitidos, y cualquier cosa marcada como preguntar se detiene ante un humano. No evita que a un modelo lo convenzan de usar mal una herramienta permitida dentro de su regla. La defensa son permisos estrechos, que es todo el diseño.

*¿No será molesto aprobar todo?* Al principio. Los permisos temporales y las reglas aprendidas existen para que converja. Un buen Garufile pregunta por una o dos cosas por ejecución después de la primera semana.

*¿El aislamiento es obligatorio?* No. Los servidores de herramientas locales corren en el host a menos que agregues un bloque sandbox. Los servidores remotos corren en la máquina de alguien más, así que ahí la política es toda la frontera, y por eso bloquear es lo predeterminado.

*¿Quién puede llegar a la sala de control?* Escucha en localhost, y a un navegador en la misma computadora se le deja entrar como tú; `--require-login` lo desactiva en una máquina compartida. Todo lo demás necesita el token de inicio de sesión que está en `.garu/ui-token`: un teléfono lo obtiene escaneando el código de vinculación (se convierte en una cookie), y las apps lo envían como cabecera bearer. Por Tailscale, solo tus propios dispositivos pueden resolver la dirección siquiera. Escuchar en otra dirección sigue imprimiendo un aviso, porque entonces el token es el único candado en tu red.

*¿Tres semanas de vida son suficientes para confiar?* Confía en el diseño, no en la edad. El diseño es lo más pequeño que responde a la pregunta de la noche entera, y cada parte se puede leer: un archivo YAML, un registro JSONL, unos pocos miles de líneas de TypeScript.

## Vocabulario

Un **Garufile** es el archivo YAML que define un agente. Un **servidor de herramientas** es un servidor MCP, local (un comando) o remoto (una URL). La **política** es la lista ordenada de reglas; **permitir**, **preguntar** y **bloquear** son las tres decisiones. **Ocultación estática** significa que las herramientas que nunca podrían permitirse no se le ofrecen al modelo. La **bandeja** guarda las preguntas que esperan a un humano; una **tarjeta de revisión** es una de ellas. Un **permiso temporal** es un permiso acotado y con plazo que crea "Aprobar por 24 h". Una **sugerencia** es una regla que Garu propone después de aprobaciones repetidas. La **caja negra** es el registro JSONL por ejecución; una **ejecución** es una pasada con su propio id. Un **disparador** es lo que arranca una ejecución: cron, un mensaje, o Ejecutar ahora. La **sala de control** es la interfaz web y de teléfono; `garu ui --up` la ejecuta junto con los horarios.

## Cómo decirlo

Una frase: Garu ejecuta agentes las veinticuatro horas, y cada acción que toman pasa por una política que tú escribiste.

Un párrafo: Garu es un runtime de código abierto para agentes siempre activos. Un agente es un archivo YAML con un modelo, algunos servidores de herramientas MCP, un horario y una política. Cada llamada a una herramienta pasa primero por la política: permitir, preguntar o bloquear, por nombre de herramienta y por argumento. Preguntar pausa la ejecución y pone una tarjeta de revisión en tu bandeja, en tu teléfono si quieres; el silencio es un no. Cada ejecución queda registrada, cada ejecución tiene tope de costo, los servidores de herramientas pueden correr en Docker, y cualquier modelo funciona, incluidos los locales gratis. Es systemd para tus agentes.

Un minuto: empieza con la pregunta. "Si un agente va a correr toda la noche con acceso a mis archivos y mis cuentas, ¿qué puede tocar exactamente, quién lo decidió, y dónde está el registro?" Di que OpenAI y Meta acaban de lanzar agentes siempre activos y ninguno la responde bien: cerrados, un solo proveedor, no disponibles en buena parte del mundo, la aprobación como una idea de último momento. Luego Garu: un agente es un archivo que puedes leer; cada acción pasa por un núcleo de política que se sienta en el código entre el modelo y las herramientas; lo que importa se pausa para ti y el resto no; las aprobaciones escriben la política con el tiempo; todo queda registrado; corre con modelos gratuitos o locales. Cierra con la demo: un agente que clasifica el correo de anoche en cuatro etiquetas y redacta las respuestas, cada borrador esperando tu toque y sin forma alguna de enviar, por menos de medio centavo. Y luego la frase: los demás están construyendo el agente; Garu es aquello en lo que puedes confiar para ejecutarlo.
