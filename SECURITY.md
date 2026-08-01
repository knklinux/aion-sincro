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
- **Validación de `Host`**: solo se aceptan peticiones con `Host: 127.0.0.1` o
  `localhost`.
- **Validación de `Origin`**: solo `file://` (null), `localhost` o `127.0.0.1`.
  Ninguna web externa puede invocar el puente (protege frente a DNS rebinding
  y cross-site request forgery).
- **Token OBLIGATORIO por defecto**: al iniciar, el puente genera un token
  aleatorio (`secrets`/`crypto`) y lo imprime en consola; cada petición `/run`
  y `/kill` debe incluirlo. También puedes fijar el tuyo con `--token CLAVE`.
  La app guarda el token solo en tu navegador.
- **Body limitado a 1 MB** en ambos puentes (Python y Node).
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

## Mejoras recomendadas (roadmap a futuro)

### Endurecimiento de seguridad

1. **No compartas el token**: el `TOKEN DE CONEXIÓN` que imprime el puente es
   tu llave de ejecución. Quien lo tenga podrá ejecutar comandos en tu máquina
   mientras el puente esté activo. Regéneralo reiniciando el puente o con
   `--token` propio.
2. **No sirvas la app por HTTP en una red local**: el micrófono solo funciona
   en `localhost`/HTTPS; si la expones en LAN, hazlo con HTTPS.
3. **Proxy de claves**: si la app llega a un dominio público, mueve las
   llamadas a los proveedores (Groq, OpenRouter…) a un backend proxy para no
   exponer API keys en el cliente. En uso local, `localStorage` es aceptable.
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
