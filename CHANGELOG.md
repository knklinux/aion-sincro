# 📜 CHANGELOG — Aion Sincro

> Compañera de Pentest · Coarquitecta del Plan de Rescate
>
> Todas las fechas en `YYYY-MM-DD`. Los hashes corresponden a la rama `main` de `knklinux/aion-sincro`.
>
> Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## 🔮 Pendiente de publicar

Trabajo validado en local, aún sin commit en `main`:

- **Test de mutación real** (`test_mutacion.py`) — copia temporal de `index.html` a la que se le quita la limpieza de `saveStore` y verifica que el check de regresión WebCrypto **cae** (prueba no vacua). Integrado como paso `[3/3]` en `test_all.cmd` y `test_all.sh`.
- **`AION_HTML`** en `test_app.js` — la suite acepta una ruta alternativa de `index.html` (la usa el harness de mutación), con auto-check del soporte.
- **Flujo completo de sesión WebCrypto** en `test_app.js` — cifrar → reiniciar (solo sobrevive el blob) → desbloquear con contraseña correcta (las claves vuelven) y errónea (`null`), simulando una recarga real de la app.

También hay **trabajo sin commitear en el árbol** que aún no forma parte de `main` y se documentará en su release: el **módulo OSINT** (`aion_osint.py` con su suite `test_aion_osint.py` y lanzadores `linux/aion-osint` / `windows/aion-osint.cmd`), junto a modificaciones en `README.md` e `index.html`.

---

## ✨ Lote 2026-08-02 — configuración, seguridad y perfil profesional

### 🚀 Primera configuración y comodidad

- `67c293c` — **feat:** **asistente de primera configuración** — wizard de 5 pasos (motor, Piper, terminal) en dorado de marca que se auto-abre cuando no hay motor configurado, con prueba real de conexión, persistencia inteligente (`aion_setup_done` solo con motor conectado) y comando "configúrame".
- `67c293c` — **feat:** **recordar desbloqueo durante la sesión** — la clave derivada (nunca la contraseña) vive en `sessionStorage`, se re-importa como clave no extraíble al recargar y se olvida al bloquear/desactivar.

### 🔐 Seguridad

- `67c293c` — **fix(seguridad):** la prueba de conexión de **OpenRouter** daba **falso positivo** (usaba `GET /v1/models`, que es público). Ahora valida con `GET /v1/auth/key` (401 real con clave inválida) y muestra label + usos restantes. Hallado en prueba end-to-end real.

### 👤 Perfil profesional y CV

- `4d510fc` — **docs:** `LINKEDIN.md` con **datos reales confirmados** de Arkaitz (nombre completo, trabajo actual como autónomo instalador de carpintería metálica en Alupro Cerramientos, estudios hasta secundaria, inglés técnico, eJPT en preparación), verificado contra el perfil de GitHub sin afirmaciones inventadas.
- `4d510fc` — **feat:** `generar_cv.py` — genera el CV en HTML/PDF desde `LINKEDIN.md` (fuente única de verdad) + `POSTS_LINKEDIN.md` con los 10 posts semanales + `CV_Arkaitz.html/pdf` (versionados por petición expresa) + capturas del visor.

### 📱 Portabilidad e instalación

- `20f474c` — **feat:** **PWA instalable** (`manifest.webmanifest` + `sw.js` con caché offline + iconos 192/512/maskable) y **esqueleto Android con Capacitor** (`mobile/`, permiso `RECORD_AUDIO` para la hotword, cleartext para el puente local).
- `20f474c` — **feat:** `windows/serve.js` (servidor del lanzador) y actualización de `windows/aion-sincro.cmd` y `windows/install.cmd` (instalación a `%LOCALAPPDATA%\AionSincro`).

---

## ✨ Lanzamiento inicial — 2026-08-01

Primera versión estable de Aion Sincro. Los 15 commits publicados hasta la fecha, agrupados por funcionalidad. *(El proyecto aún no tiene tags de versión; la numeración formal se fijará al primer release etiquetado.)*

### 🧠 Identidad, Núcleo e interfaz

- `77248e7` — **feat:** Aion Sincro — compañera IA local de pentest y red team (base de la app, chat, voz y terminal).
- `a61e437` — **feat:** visor profesional (SVG geométrico como identidad visual), modo ◈ Sincronía (coarquitecta con los axiomas del Núcleo), `NUCLEO_MEMORIA.md`, `MANIFIESTO.md` (obra completa), proveedor Mistral y robustez de puentes.
- `a250ba1` — **fix:** visor sin transición residual en cambios de estado.
- `2fe5928` — **feat:** historia de Ark & Jimmy en la app — overlay de bienvenida, narración por voz y memoria persistente `historia_vista` (con botón 📖 Ver historia en el header y overlay bilingüe ES/EN).
- `5b55586` — **chore(windows):** icono de Aion Sincro para el acceso directo de escritorio.

### 🗣️ Voz (neuronal local y neural en la nube)

- `d9cae3e` — **feat:** integración completa de **Piper TTS** — voces locales en español (es_ES, es_MX, es_AR), velocidad/expresividad (`length_scale`/`noise_scale`) e instaladores de doble clic (`windows/instalar-piper.cmd` y `linux/instalar-piper.sh`).
- `5cb2c47` — **feat:** voz neural **Voxtral de Mistral** como alternativa de IA + lote acumulado (Piper, WebCrypto, modelo por proveedor, overlay bilingüe).
- `6ce4a7b` — **feat:** **auto-idioma de voz** — Aion detecta el idioma del texto y enruta EN→Voxtral / ES→voces offline, con selector de 7 emociones de Paul (neutral, alegre, confiado, enojado, triste…).

### 🔐 Seguridad y cifrado de claves

- `6ce4a7b` — **feat:** **cifrado WebCrypto** de claves (AES-GCM 256 + PBKDF2-SHA256, 120 000 iteraciones) y **proxy de claves opcional** (`proxy.py`) para que Mistral/Groq/OpenRouter nunca viajen en claro al navegador.
- `070d648` — **feat:** hardening de puentes y modelos IA verificados.
- `f4b29ed` — **fix(seguridad):** **Origin CSRF** en `bridge.mjs` + lote de robustez y tests.
- `b52d523` — **feat:** animación de seguridad del avatar — pulso rojo al bloquear, respiración verde al desbloquear.
- `dd811c0` — **feat:** **bloqueo automático por inactividad** — las claves se bloquean solas tras X minutos configurables (0 = desactivado) y el candado vuelve a rojo.

### 🛡️ Aprendizaje guiado — Ruta Red Team

- `14083d3` — **feat:** módulo de aprendizaje guiado — **Ruta Red Team** por niveles (recon → explotación → informe) con 18 checkpoints de práctica.
- `101f25c` — **feat:** modo **Evaluación** — examen práctico con preguntas de cada fase, puntuación y recomendaciones de repaso.
- `b52d523` — **feat:** **certificación de la Ruta** — informe de progreso exportable (Markdown/PDF) con checkpoints, habilidades y recomendaciones para el CV/portafolio + **temporizador de sesión de práctica** (racha, tiempo medio y contador en vivo).

### 📊 Informes profesionales y cumplimiento

- `101f25c` — **feat:** modo **Laboral** con plantillas de informe (reconocimiento, informe de pentest, reporte ejecutivo) exportables en Markdown/PDF + **herramienta de auditoría ISO 27001:2022** (cuestionario de los 4 temas del Anexo A, puntuación por tema y plan de cumplimiento).

### ⚙️ Instalación, infraestructura y calidad

- `070d648` — **feat:** instalador Windows completo (lanzador + acceso directo), hardening de puentes y modelos IA verificados.
- `fea654f` — **fix(hooks):** resolución del root del **pre-commit hook** en Git Bash (salto de línea de `git rev-parse`).
- `101f25c` / `f4b29ed` — suite de pruebas (`test_bridge.py` + `test_app.js`), cobertura WebCrypto y regresión de cifrado, integrada en el flujo de git.

---

## 📌 Cómo mantener este changelog

1. Cada commit nuevo se agrupa en la sección **🔮 Pendiente de publicar** (o en la sección de funcionalidad correspondiente si se publica con su lote).
2. Al publicar, se mueve a una sección `## ✨ [vX.Y.Z] — <fecha>` con el hash corto y el tipo (`feat:`, `fix:`, `chore:`, `fix(seguridad):`…).
3. Se usa **español** y el estilo emoji del README, respetando la agrupación por funcionalidad (cifrado, voz, Ruta, informes, seguridad, instalación).
