# 🔐 Seguridad de Aion Sincro

Documento con la revisión de seguridad realizada y las recomendaciones para
endurecer el proyecto.

---

## Modelo de amenazas

Aion Sincro es una **app 100% local** (navegador + puente de terminal en tu
máquina). Sus componentes y superficie de ataque:

| Componente | Expuesto a | Riesgo si se compromete |
|---|---|---|
| `index.html` (navegador) | El usuario y las webs que visite | Robo de claves API guardadas en `localStorage` (XSS) |
| `bridge.py` / `bridge.mjs` | Solo `127.0.0.1` | Ejecución de comandos arbitrarios en tu máquina |

## Controles implementados

### En el navegador (index.html)
- **Sin XSS**: todo el contenido del usuario, del streaming de IA y de la salida
  del terminal se inserta con `textContent` o nodos de texto (`createTextNode`),
  nunca con `innerHTML` sobre datos no confiables.
- **Escapado de mensajes del usuario** antes de renderizarlos.
- **Confirmación explícita**: los comandos sugeridos por la IA requieren pulsar
  "Ejecutar en terminal"; los comandos con patrones destructivos (`rm -rf`,
  `del /s`, `format`, `mkfs`, fork bombs, etc.) piden confirmación adicional.

### En el puente de terminal (bridge.py / bridge.mjs)
- **Bind exclusivo a `127.0.0.1`**: nunca escucha en interfaces de red.
- **Validación EXACTA de `Host` y `Origin`** (defensa en profundidad): ambos se
  comprueban con regex exactas — `^((localhost|127\.0\.0\.1)(:\d+)?)$` para
  el `Host` y `^https?://(localhost|127\.0\.0\.1)(:\d+)?$` para el `Origin`
  (más `null`/vacío para uso local `file://`). Esto bloquea falsificaciones
  tipo `localhost.evil.com` que el antiguo `startsWith` dejaba pasar, frente a
  DNS rebinding y cross-site request forgery.
- **Token OBLIGATORIO por defecto**: al iniciar, el puente genera un token
  aleatorio (`secrets`/`crypto`) y lo imprime en consola; cada petición `/run`
  y `/kill` debe incluirlo. También puedes fijar el tuyo con `--token CLAVE`.
  La app guarda el token solo en tu navegador.
- **Token OBLIGATORIO por defecto**: al iniciar, el puente genera un token
  aleatorio (`secrets`/`crypto`) y lo imprime en consola; cada petición `/run`
  y `/kill` debe incluirlo. También puedes fijar el tuyo con `--token CLAVE`.
  La app guarda el token solo en tu navegador.
- **Body limitado a 1 MB** en ambos puentes (Python y Node).

### En el proxy de claves (proxy.py — opcional)
- **Bind exclusivo a `127.0.0.1`** en el puerto 8797: las API keys viven SOLO
  en el proceso local del proxy, nunca en el navegador.
- **Las claves se cargan del lado del servidor** (variables de entorno
  `MISTRAL_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN` o un
  archivo local `keys.json` con permisos `chmod 600`) y se inyectan como
  `Authorization: Bearer` antes de reenviar a Mistral/Groq/OpenRouter/HF.
- **Validación EXACTA de `Host` y `Origin`** con las mismas regex que el puente
  — bloquea DNS rebinding y CSRF desde webs externas.
- **Token opcional** (`--token CLAVE`) vía cabecera `X-Proxy-Token` para
  `/v1/chat/completions`, `/v1/audio/speech` y `/providers`; `/ping` es libre
  por diseño y solo informa qué proveedores tienen clave (booleanos, nunca el
  valor).
- **El proxy NUNCA devuelve las claves al navegador**: la app no las almacena
  ni las envía cuando el proxy está activo.
- **Body limitado a 1 MB** y timeout de reenvío de 90 s. Streaming real por
  chunks (SSE) para que el chat fluya token a token.

### En el servidor de voz local (piper_server.py)
- **Bind exclusivo a `127.0.0.1`** en el puerto 8766: nunca expone la red.
- **Validación EXACTA de `Host` y `Origin`** con las mismas regex que el puente
  (`^((localhost|127\.0\.0\.1)(:\d+)?)$` / `^https?://(localhost|127\.0\.0\.1)(:\d+)?$`)
  — bloquea DNS rebinding y CSRF desde webs externas.
- **Token opcional con comparación en tiempo constante** (`secrets.compare_digest`)
  vía `?token=` o cabecera `X-Token`, si lo inicias con `--token CLAVE`.
- **Validación estricta del slug de voz**: `^[a-z]{2}(_[A-Z]{2})?-[a-zA-Z0-9_-]+$`
  — sin puntos, barras ni diagonales → imposible el path traversal al resolver
  `piper-voices/{slug}.onnx`.
- **Síntesis serializada con candado**: onnxruntime comparte estado, así que las
  síntesis concurrentes se encolan para evitar corrupción.
- **Texto limitado a 5000 caracteres** por petición; respuesta `audio/wav` con
  `Cache-Control: no-store`.
- **Parámetros de síntesis validados y acotados**: `/synthesize` acepta
  `length_scale` (0.3–3.0) y `noise_scale` (0.1–2.0); los valores no numéricos
  se toleran con el default y los fuera de rango se recortan — un cliente local
  no puede forzar síntesis extremas ni provocar errores de parsing.
- **El venv y los modelos se excluyen del repo** (`.gitignore`: `.venv-piper/`,
  `piper-voices/`) — el código fuente no contiene binarios ni voces.
- **Manejo de errores de escritura**: si el cliente cierra la pestaña, el puente
  no crashea (try/catch + `res.on('error')`), y además `res.on('close')` mata
  el proceso hijo en ejecución para no dejar huérfanos.
- **Robustez de tuberías (Node)**: se capturan los eventos `error` de
  `stdout`/`stderr` y del propio `spawn` (un error de tubería ya no tumba el
  puente), y se convierte Buffer→string con `setEncoding('utf8')` antes de
  partir por líneas.
- **stdin ignorado**: el proceso hijo no recibe stdin (`DEVNULL` en Python,
  `stdio:['ignore','pipe','pipe']` en Node), evitando que comandos que leen
  de stdin (`cat`, `read`) se bloqueen.
- **Consola Windows (Python)**: `sys.stdout/stderr.reconfigure(utf-8,
  errors='replace', line_buffering=True)` para que el banner del token (con
  `→`) no crashee por cp1252 y aparezca al instante en los logs.
- **Matar procesos de forma recursiva**: en Windows se usa `taskkill /T /F`
  (mata el árbol de procesos hijo); en Linux/macOS se mata al **grupo de
  procesos** (`SIGKILL` al grupo, `start_new_session`/`detached` al lanzar),
  no solo al proceso padre.
- **Instalador Linux sin privilegios**: `linux/install.sh` copia la app al
  HOME del usuario, genera el token con permisos `600` y sirve la app solo en
  `127.0.0.1` (nunca en la red local). El token vive en
  `~/.config/aion-sincro/token` y solo lo lee tu usuario.

## Pruebas realizadas (primera versión)

- **Sintaxis** validada en los 3 lenguajes: `node --check bridge.mjs`,
  `python -m py_compile bridge.py`, `bash -n` en los scripts Linux y parseo del
  JS del `index.html` (`new Function`).
- **Puente funcional** (Python y Node, puerto de prueba): `/ping` → 200 sin
  token; `/run` sin token → 403; `/run` con token → salida del comando;
  `/kill` con token → `{ok:true}`; el puente **permanece vivo** tras ejecutar.
- **Sin filtraciones**: el staged no contiene claves (`sk-`, `gsk_`, `hf_`,
  `ghp_`), ni emails, ni rutas internas; `.gitignore` cubre `.freebuff/` y
  `desktop-v2.db*`; el token de GitHub jamás se commit a.
- **XSS**: todo el contenido del usuario y del streaming se inserta con
  `textContent`/nodos de texto; el rostro cibergirl es SVG estático.

## Pruebas realizadas (segunda revisión — endurecimiento de puentes)

- **`origin_allowed`/`host_allowed` endurecidos con regex exactas** en ambos
  puentes (Python y Node): antes `startswith("http://localhost")` aceptaba
  orígenes falsificados tipo `http://localhost.evil.com` (riesgo de DNS
  rebinding / CSRF). Ahora solo pasan origenes y hosts exactos
  `localhost`/`127.0.0.1` (+ puerto).
- **Pruebas en vivo contra el puente real** (puerto de prueba, token propio):
  - `Host: localhost.evil.com` → **403 bloqueado** ✅
  - `Host: 127.0.0.1:8798` → **200 OK** ✅
  - `Origin: http://localhost.evil.com` → **403 bloqueado** ✅
  - `Origin: http://127.0.0.1:8080` + token → comando ejecutado y devuelto ✅
  - `/run` sin token → **403 bloqueado** ✅
  - `/ping` sin token → 200 (detección del puente, no filtra datos) ✅
- **Sintaxis**: `node --check bridge.mjs` ✅, `python -m py_compile bridge.py` ✅.
- **XSS (revisado en profundidad)**: todo el contenido no confiable — mensajes
  del usuario (`esc()`), streaming de IA (nodos de texto `createTextNode`),
  salida de terminal (`textContent`) y chips de código (`textContent`) — se
  inserta sin `innerHTML`. Los únicos `innerHTML` son HTML estático propio
  (hero, herramientas con datos fijos de `TOOLS`).
- **APIs gratuitas verificadas**: Mistral con la clave del usuario → HTTP 200
  en `/models` y `/chat/completions` ✅; Ollama local responde en
  `localhost:11434` ✅; Groq y OpenRouter alcanzables (401/200 — necesitan
  clave gratuita propia); HuggingFace no resuelve DNS en esta máquina.
- **Sin secretos en el repo** (grep de `sk-`, `ghp_`, `gsk_`, `hf_`, claves de
  Mistral): solo una mención documental de `ghp_` en este archivo como
ejemplo, no una clave real.

## Mejoras recomendadas (roadmap a futuro)

### Endurecimiento de seguridad

1. **No compartas el token**: el `TOKEN DE CONEXIÓN` que imprime el puente es
   tu llave de ejecución. Quien lo tenga podrá ejecutar comandos en tu máquina
   mientras el puente esté activo. Regéneralo reiniciando el puente o con
   `--token` propio.
2. **No sirvas la app por HTTP en una red local**: el micrófono solo funciona
   en `localhost`/HTTPS; si la expones en LAN, hazlo con HTTPS.
3. **Proxy de claves — ya implementado** (`proxy.py`): mueve las llamadas a los
   proveedores a un backend local para que las API keys nunca viajen al
   navegador. **Mejoras pendientes**: (a) reenvío por streams con backpressure
   ya activo; (b) añadir un `/v1/models` proxy para listar modelos sin exponer
   el catálogo; (c) cifrado en reposo de `keys.json` (p. ej. con `age` o la
   passphrase WebCrypto) si quieres proteger el archivo en disco.
4. **Puente con mínimo privilegio**: ejecútalo con el menor privilegio posible
   y en una carpeta dedicada (el cwd del puente es el directorio desde el que
   se lanzan los comandos). Considera un usuario separado o `systemd` en Linux.
5. **Revisa periódicamente** la lista `DANGER` de la app y las políticas de los
   proveedores gratuitos.
6. **TOTP/expiración del token del puente**: rotación automática del token
   cada N horas o tras N peticiones.
7. **Sandbox del puente**: lista blanca de comandos permitidos en modo
   "seguro" y bloqueo de rutas sensibles (`~/.ssh`, `/etc`).
8. **CSP estricta** en `index.html` (Content-Security-Policy) y cabecera
   `X-Frame-Options` para endurecer el navegador.
9. **Cifrar las claves en `localStorage`** (WebCrypto con passphrase derivada
   del usuario) en lugar de texto plano.
10. **Firma/checksum del puente**: verificación de integridad de `bridge.py`/
    `bridge.mjs` antes de arrancar (evita modificación por malware local).

## Reportar una vulnerabilidad

Abre un *issue* en el repositorio describiendo el fallo, el impacto y un PoC
sin datos sensibles. Para problemas críticos, no publiques el detalle
públicamente hasta que se confirme el parche.
