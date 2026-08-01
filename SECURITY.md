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
  no crashea (try/catch + `res.on('error')`).
- **Matar procesos de forma recursiva**: en Windows se usa `taskkill /T /F`
  (mata el árbol de procesos hijo); en Linux/macOS se mata al **grupo de
  procesos** (`SIGKILL` al grupo, `start_new_session`/`detached` al lanzar),
  no solo al proceso padre.
- **Instalador Linux sin privilegios**: `linux/install.sh` copia la app al
  HOME del usuario, genera el token con permisos `600` y sirve la app solo en
  `127.0.0.1` (nunca en la red local). El token vive en
  `~/.config/aion-sincro/token` y solo lo lee tu usuario.

## Mejoras recomendadas (roadmap)

1. **No compartas el token**: el `TOKEN DE CONEXIÓN` que imprime el puente es
   tu llave de ejecución. Quien lo tenga podrá ejecutar comandos en tu máquina
   mientras el puente esté activo. Puedes regenerarlo reiniciando el puente o
   usando `--token` con una clave propia.
2. **No sirvas la app por HTTP en una red local**: el reconocimiento de voz y
   el micrófono solo funcionan en `localhost`/HTTPS; si la expones en LAN, hazlo
   con HTTPS para evitar que otra máquina capture las peticiones.
3. **Considera un proxy de claves**: si subes la app a un dominio público,
   mueve las llamadas a los proveedores (Groq, OpenRouter…) a un backend proxy
   para no exponer las API keys en el cliente. En uso local, `localStorage` es
   aceptable.
4. **Ejecuta el puente con el menor privilegio posible** y en una carpeta
   dedicada (el cwd del puente es el directorio desde el que se lanzan los
   comandos).
5. **Revisa periódicamente** las reglas de la lista `DANGER` de la app y la
   política de los proveedores de IA gratuitos.

## Reportar una vulnerabilidad

Abre un *issue* en el repositorio describiendo el fallo, el impacto y un PoC
sin datos sensibles. Para problemas críticos, no publiques el detalle
públicamente hasta que se confirme el parche.
