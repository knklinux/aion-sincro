# ⚡ Aion Sincro — Compañera de Pentest y Red Team

**Aion Sincro no es un asistente servil: es una compañera.** Una IA con
personalidad propia —leal, sincera y directa— que te acompaña en tu aprendizaje
de **pentesting y red team**. Proyecto **open source**, local y privado por
defecto, pensado para ser **disfrutable y mejorable al 100%**.

Un solo archivo HTML (`index.html`) + un puente de terminal opcional
(`bridge.py` / `bridge.mjs`). Sin servidores, sin suscripciones, sin telemetría.

---

## ✨ Qué es Aion Sincro

| Aspecto | Detalle |
|---|---|
| 🤝 **Compañera, no herramienta** | Tiene carácter, opinión y humor seco. No obedece por obedecer: te cuestiona con cariño para que pienses mejor. |
| 🎯 **Vocación** | Tu aprendizaje de **pentesting y red team**: metodología, interpretación de herramientas, CVEs e informes profesionales. Y de un poco de todo lo demás. |
| 🎙️ **Voz** | Escucha (reconocimiento nativo, Chrome/Edge) y responde por voz **offline** con las voces de Windows. |
| 🌀 **Avatar animado** | **Rostro cibergirl holográfico** (SVG puro, sin dependencias): parpadea, mueve la boca al hablar, sigue con la mirada y cambia de expresión según el estado (escucha / piensa / habla / error). Tema cálido dorado/esmeralda, nada de azul genérico. |
| 🧠 **Cerebro de IA** | 5 motores: **Demo local**, **Ollama** (100% local), **Groq**, **OpenRouter** y **HuggingFace**. Todos sin coste. |
| 🧰 **Herramientas** | Búsqueda web, **clima**, **base de CVEs (NVD)**, **GitHub** y **datos de países** — activables individualmente. |
| 🖥️ **Terminal integrado** | Ejecuta comandos reales en tu máquina vía puente local seguro, con tu confirmación en cada uno. |
| 🛡️ **Modo Pentest** | Especialización en seguridad ofensiva **ética** con salvaguardas: solo pruebas autorizadas. |

---

## 🚀 Inicio rápido

1. Abre `index.html` en **Chrome o Edge**.
2. Pulsa **▶ INICIAR AION SINCRÓ**.
3. Habla, escribe o usa las tarjetas del panel de bienvenida.

> 📌 El reconocimiento de voz funciona en `localhost` o `HTTPS`:
> ```bash
> python -m http.server 8000   # luego abre http://localhost:8000
> ```

### 🐧 Instalación en Linux / macOS

Para tu máquina Linux, el repo incluye un instalador y un lanzador en
[`linux/`](linux/) — sin sudo, todo en tu HOME:

```bash
cd aion-sincro/linux
./install.sh          # copia la app, genera el token y crea el lanzador
# … luego, cada vez que quieras abrirla:
aion-sincro           # sirve la app en localhost + arranca el puente + abre el navegador
```

El lanzador:
- Sirve la app en `http://127.0.0.1:8080` (necesario para el micrófono).
- Arranca el puente `bridge.py` (o `bridge.mjs` si no hay Python) con tu token.
- Abre el navegador y deja todo en segundo plano (pids en `~/.config/aion-sincro/`).
- Se desinstala con `linux/uninstall.sh`.

> 💡 En Linux, Ollama suele permitir orígenes locales sin configurar. Si sirves
> la app desde otro origen, usa `OLLAMA_ORIGINS=*` igual que en Windows.

### Conectar un cerebro de IA

| Motor | Cómo | Modelo por defecto |
|---|---|---|
| **Ollama** (recomendado) | `ollama pull hermes3` + `set OLLAMA_ORIGINS=*` | `hermes3` |
| **Groq** | clave gratis en console.groq.com | `NousResearch/Hermes-3-Llama-3.1-70B-Flash` |
| **OpenRouter** | clave gratis en openrouter.ai/keys | `nousresearch/hermes-3-llama-3.1-70b:free` |
| **HuggingFace** | token gratis en huggingface.co/settings/tokens | `NousResearch/Hermes-3-Llama-3.1-70B` |

> 💡 Las claves se guardan **solo en tu navegador**. Cualquier modelo compatible
> con OpenAI funciona: solo cambia el nombre.

---

## 🧰 Herramientas integradas (gratis, sin claves)

La pestaña **🧰 Herramientas** te deja activar/desactivar cada fuente. Aion Sincro
las consulta desde tu navegador cuando tu pregunta lo requiere:

- 🌐 **Búsqueda web** — DuckDuckGo + Wikipedia (noticias, definiciones, actualidad).
- 🌦️ **Clima** — Open-Meteo: "¿qué tiempo hace en Madrid?"
- 🛡️ **CVEs** — NVD: "busca CVE-2021-44228" (te da descripción y CVSS).
- 🐙 **GitHub** — "busca repositorios de gobuster".
- 🗺️ **Países** — REST Countries: "capital de Japón".

Si una fuente externa no responde (red/CORS), la búsqueda web cubre el hueco
sin romper nada.

---

## 🖥️ Terminal integrado

> ⚠️ **El puente exige token por defecto.** Al iniciarlo genera un
> `TOKEN DE CONEXIÓN` y lo imprime en la consola. Pégalo en
> **Ajustes → Terminal local → Token del puente**. Sin él rechaza todo (403).
> Esto es **seguro por defecto**: ninguna página o archivo descargado podría
> ejecutar comandos sin tu token.

```bash
# Opción A — Python 3 (sin dependencias)
python bridge.py

# Opción B — Node.js (sin dependencias)
node bridge.mjs

# Opcional: token propio
python bridge.py --token TU_CLAVE_SEGURA
```

El puente escucha **solo en `127.0.0.1:8765`**, valida `Host` y `Origin`, exige
token y mata procesos de forma recursiva (`taskkill /T /F` en Windows, `SIGKILL`
al grupo de procesos en Linux/macOS). La IA sugiere comandos en bloques de
código con botones inteligentes — tú decides ejecutar, con confirmación extra
para comandos destructivos.

### 💻 Aion Sincro también programa

Cada bloque de código que escribe la IA se detecta y recibe botones:

- **▶ Ejecutar en terminal** — bloques `bash`/`sh`/`powershell`/`cmd`.
- **▶ Ejecutar (python3)** o **(node)** — bloques `python`/`js` en Linux/macOS
  (se pasan al intérprete correspondiente).
- **📋 Copiar** — siempre disponible, con el lenguaje del bloque.

Pídele cualquier cosa: *"escribe un script que escanee puertos"*, *"dame una
función en python para parsear nmap"* o *"automatiza un informe"*. La ejecución
siempre pasa por tu confirmación y el filtro de comandos destructivos.

---

## 🛡️ Modo Pentest

Pulsa **🛡️ Pentest**: Aion Sincro se convierte en tu compañera de campo —
metodología red team (reconocimiento → explotación en laboratorio →
post-explotación → movimiento lateral → informe), análisis de salidas de
nmap/burp/nessus/metasploit, checklists OWASP y MITRE ATT&CK, CVEs e informes
profesionales.

**Reglas de oro (integradas):** solo pruebas **autorizadas**; si falta permiso,
lo dice y ofrece alternativas legales (TryHackMe, HackTheBox, laboratorios
propios). Declara tu ámbito en Ajustes.

---

## ⌨️ Atajos

| Acción | Atajo |
|---|---|
| Hablar / detener | **Espacio** o 🎙️ |
| Enviar | **Enter** |
| Ejecutar en Terminal | **Enter** · detener con **Ctrl+C** |

---

## 🔐 Seguridad

Revisión completa y recomendaciones en **[SECURITY.md](SECURITY.md)**: sin XSS
(`textContent` en todo), confirmación de comandos, puente limitado a
`127.0.0.1` con Host/Origin + token obligatorio, y hoja de ruta para
endurecerlo.

---

## 🛠️ Contribuir / mejorarlo al 100%

El proyecto se creó para que lo **hagas tuyo**:

- **Personalidad**: edita `BASE_SYSTEM` y `PENTEST_SYSTEM` (su carácter, su voz).
- **Añadir un proveedor de IA**: entrada en `PROVIDERS` + caso en `streamChat`.
- **Añadir una herramienta**: entrada en `TOOLS` + un bloque en `runTools()`
  (cualquier API gratuita con CORS sirve).
- **Añadir chips de pentest**: el array de `buildChips()`.
- **Reforzar el puente**: políticas finas en `bridge.py` / `bridge.mjs`.

### Roadmap sugerido

- [ ] Proxy de claves opcional para uso en nube.
- [ ] Módulo de aprendizaje guiado (rutas de estudio red team).
- [ ] Guardado de sesiones e informes (exportar markdown).
- [ ] Skills/comandos personalizados del usuario.
- [ ] Soporte de modelo de visión para capturas de pantalla.

---

## 📁 Estructura

```
aion-sincro/
├── index.html       # La app completa (HTML + CSS + JS)
├── bridge.py        # Puente de terminal local (Python, sin dependencias)
├── bridge.mjs       # Puente de terminal local (Node, sin dependencias)
├── linux/           # Versión para Linux/macOS
│   ├── install.sh   #   instalador (sin sudo)
│   ├── aion-sincro  #   lanzador (web localhost + puente + navegador)
│   ├── uninstall.sh #   desinstalador
│   └── aion-sincro.svg
├── README.md        # Esta guía
├── SECURITY.md      # Revisión y recomendaciones de seguridad
├── LICENSE          # MIT
└── .gitignore
```

---

## ⚠️ Aviso legal

Aion Sincro es una herramienta educativa para **profesionales y estudiantes de
seguridad que trabajan con autorización**. Úsala únicamente sobre sistemas
propios o con permiso explícito. El uso no autorizado de técnicas de ataque es
ilegal.
