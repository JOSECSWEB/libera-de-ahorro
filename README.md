# Libreta de Ahorro USDT — App web

App móvil (sin instalar nada, se abre en el navegador) para llevar el registro del ahorro en USDT.
Puedes agregar, editar y borrar movimientos desde el celular, y ver cuánto tenías acumulado en
cualquier fecha del historial con un calendario.

## Qué incluye
- **Dashboard** con saldo actual, resumen y simulador de valor en bolívares.
- **Calendario**: eliges una fecha y te dice el saldo acumulado hasta ese día, con un mini gráfico
  de la evolución.
- **Agregar / editar / borrar movimientos** desde el botón ＋, protegido con un PIN que tú eliges.
- Los datos quedan guardados en la nube (Vercel KV, gratis), así que se ven igual desde cualquier
  celular o computadora, no solo en el tuyo.

---

## Paso 1 — Subir el código a GitHub

1. Ve a [github.com/new](https://github.com/new) y crea un repositorio nuevo (puede ser privado),
   por ejemplo `libreta-ahorro-usdt`.
2. En tu computadora (o desde GitHub Desktop / la web), sube todos los archivos de esta carpeta
   al repositorio. Si usas la web de GitHub: "Add file" → "Upload files" → arrastra todo el
   contenido de esta carpeta (menos este README si quieres, aunque no hace daño subirlo).

## Paso 2 — Conectar el repositorio a Vercel

1. Ve a [vercel.com](https://vercel.com) y entra con tu cuenta de GitHub.
2. "Add New" → "Project" → elige el repositorio que acabas de crear.
3. Framework Preset: déjalo en **"Other"**. No hace falta tocar nada más.
4. Todavía **no le des a Deploy** — primero crea la base de datos (paso 3), o si ya diste deploy,
   no pasa nada, luego lo re-despliega solo al conectar la base de datos.

## Paso 3 — Crear la base de datos (Vercel KV)

1. Dentro de tu proyecto en Vercel, ve a la pestaña **"Storage"**.
2. "Create Database" → elige **"KV"** (es gratis hasta un límite muy generoso para este uso).
3. Ponle un nombre, por ejemplo `ahorro-usdt-db`, y créala.
4. Vercel te va a preguntar a qué proyecto conectarla — elige el proyecto que creaste en el
   paso 2. Esto agrega automáticamente las variables de entorno que la función necesita
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.) — no tienes que copiarlas a mano.

## Paso 4 — Configurar tus PINs

Hay dos niveles de acceso:
- **PIN de administrador**: puede ver los movimientos Y agregar/editar/borrar.
- **PIN de solo consulta** (opcional): puede ver los movimientos pero no tocarlos. Útil si quieres
  compartir el link con alguien para que solo consulte, sin poder modificar nada.

En tu proyecto en Vercel: **Settings → Environment Variables** y agrega:
   - Nombre: `ADMIN_PIN` — Valor: el PIN de administrador (ej. `2468`)
   - Nombre: `VIEW_PIN` — Valor: el PIN de solo consulta (ej. `1357`) — **opcional**, sáltalo si
     no lo necesitas. Si no lo configuras, solo existirá el PIN de administrador y cualquiera que
     lo use entra en modo edición.

Usa dos PINs distintos entre sí; si son iguales, quien entre con ese PIN tendrá acceso de
administrador. Guarda los cambios.

## Paso 5 — Desplegar

1. Ve a la pestaña **"Deployments"** y dale a **"Redeploy"** (para que tome la base de datos y el
   PIN que acabas de configurar).
2. Cuando termine, Vercel te da una URL tipo `https://libreta-ahorro-usdt.vercel.app` — esa es tu
   libreta, accesible desde cualquier celular.

## Paso 6 — Cargar tu historial actual (solo una vez)

1. Abre `https://tu-proyecto.vercel.app/seed.html` en el navegador.
2. Ingresa tu PIN y toca "Cargar historial". Esto sube de una sola vez los 13 movimientos que ya
   tenías (del 25/06 al 28/08/2026), para que no tengas que escribirlos a mano.
3. Solo funciona si la base de datos está vacía — así que hazlo antes de agregar movimientos
   nuevos manualmente, y solo una vez.

## Paso 7 — Usarla desde el iPhone como una app

1. Abre la URL en Safari.
2. Botón de compartir → **"Agregar a pantalla de inicio"**.
3. Ahora tienes un ícono en tu pantalla de inicio que abre la libreta directo, sin barra de
   navegador — se siente como una app normal.

---

## Tasas en vivo (BCV y Binance P2P)

En la tarjeta "Simulador de valor hoy" aparecen dos chips con la tasa BCV y la tasa Binance P2P
(USDT/VES) del momento, tomadas de [pydolarve.org](https://pydolarve.org) — una API pública y
gratuita, sin necesidad de crear cuenta ni API key. Toca cualquiera de los dos chips para usar esa
tasa en el simulador al instante. No requiere configuración adicional: funciona apenas despliegues
el proyecto.

Ten en cuenta:
- Es un servicio comunitario gratuito, no oficial de Binance ni del BCV — puede fallar o cambiar
  de formato alguna vez. Si un día no carga, el chip muestra "Reintentar" y de todas formas puedes
  escribir la tasa a mano como siempre.
- La tasa Binance P2P que reporta es una referencia del mercado P2P (mediana de ofertas), no un
  precio fijo — puede variar un poco frente a lo que veas tú mismo en la app de Binance en ese
  momento.

## Cargar un movimiento desde una foto (OCR gratuito)

Al agregar o editar un movimiento, hay un botón "📷 Cargar desde foto". Toma o elige una foto del
recibo de Binance y la app intenta leer automáticamente el monto en Bs, la tasa, el monto en
USDT, la fecha/hora, el tipo (compra/venta) y el número de orden, llenando el formulario por ti.

Esto usa [Tesseract.js](https://tesseract.projectnaomi.com), una librería de reconocimiento de
texto gratuita y de código abierto que corre **directo en tu navegador** — la foto nunca sale de
tu teléfono ni se manda a ningún servidor, y no requiere ninguna cuenta ni API de pago.

Ten en cuenta:
- La precisión depende de la calidad de la foto: mejor con buena luz, el recibo derecho y sin
  reflejos.
- Siempre revisa los datos antes de guardar — el formulario se llena solo pero nunca se guarda
  automáticamente sin que lo veas, porque el OCR puede equivocarse en algún dígito.
- Si Binance cambia el diseño de sus recibos en el futuro, puede que algún campo deje de
  reconocerse bien; en ese caso siempre puedes llenarlo a mano como antes.

## Cierre de sesión por inactividad

Si pasan 5 minutos sin tocar la pantalla (sin clics, toques, scroll o teclas), la app cierra la
sesión sola y te vuelve a pedir el PIN. Esto aplica tanto si entraste con el PIN de administrador
como con el de solo consulta — es una protección extra por si dejas el teléfono desbloqueado con
la app abierta.

## Uso diario

- **Abrir la app**: pide un PIN al entrar. Con el PIN de administrador ves todo y puedes editar;
  con el PIN de consulta (si lo configuraste) solo puedes ver. El PIN se recuerda mientras la
  pestaña/app esté abierta; hay un enlace "Cambiar PIN" al final si quieres salir o cambiar de
  modo.
- **Agregar un movimiento nuevo** (solo con PIN de administrador): botón ＋ abajo a la derecha,
  llena los datos del recibo de Binance, guarda.
- **Editar o borrar uno existente** (solo con PIN de administrador): tócalo en la lista para
  abrirlo, y usa los botones "Editar" / "Borrar" que aparecen abajo del detalle. Con el PIN de
  consulta estos botones no aparecen.
- **Ver el saldo en una fecha pasada**: en la tarjeta "📅 Saldo en una fecha", elige el día — te
  muestra cuánto USDT tenías acumulado hasta ese día y si hubo movimientos ese día en concreto.
- **Compartir con alguien**: solo mándale el link de la app (o que la agregue a su pantalla de
  inicio también). Si no le compartes el PIN, puede ver todo pero no puede editar nada.

## Seguridad — qué tan protegido está esto

Es una protección simple con PIN (como un candado de bicicleta, no una caja fuerte): suficiente
para que nadie que encuentre el link por casualidad pueda modificar tus datos, pero no es cifrado
bancario. No pongas ahí información sensible más allá de lo que ya compartes en esta libreta
(montos y contrapartes de P2P). Si quieres subir el nivel de seguridad más adelante (login con
contraseña de verdad, por ejemplo), se puede agregar después sin rehacer todo.

## Si algo no carga

- Revisa en Vercel → tu proyecto → pestaña **"Logs"** para ver el error exacto.
- El error más común es que la base de datos KV no quedó conectada al proyecto (paso 3) o que
  falta la variable `ADMIN_PIN` (paso 4) — en ese caso, no vas a poder guardar movimientos nuevos,
  aunque sí podrás ver los que ya existan.
