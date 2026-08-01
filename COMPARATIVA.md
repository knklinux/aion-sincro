# ⚖️ Comparativa práctica: Aion Sincro frente al ecosistema

Documento de análisis comparativo (primera versión) con los principales
asistentes de IA de escritorio/open source y las herramientas de pentest más
representativas. El objetivo es identificar qué **funciones valiosas** podemos
incorporar y qué estamos **haciendo mejor** que el resto.

---

## 1. Asistentes de IA locales / open source (2024–2026)

| Proyecto | Voz | Terminal | Herramientas | Local | Notas |
|---|---|---|---|---|---|
| **Aion Sincro** (este repo) | ✅ Web Speech (offline) | ✅ puente seguro 127.0.0.1 + token | web, clima, CVE, GitHub, países | ✅ 100% | Un solo HTML + bridge, sin dependencias, rostro animado SVG |
| Open Interpreter | ❌ texto | ✅ **nativo (CLI agente)** | navegación QA, MCP | ✅ | Agente de código Rust; sandboxing, ACP |
| Jan | 🟡 extensiones | ❌ | RAG básico, plugins | ✅ | App escritorio multiplataforma, GGUF offline |
| LM Studio | 🟡 vía servidor | 🟡 (Bionic agent) | creación docs/PDF | 🟡 UI privativa | Servidor local OpenAI-compatible |
| LibreChat | ✅ STT/TTS | ✅ Code Interpreter sandbox | **MCP, RAG, subagentes, Generative UI** | ✅ | "ChatGPT con esteroides", MIT |
| Open WebUI | ✅ llamadas voz/video | ✅ Open Terminal | **RAG vectorial, function calling, MCP** | ✅ | Navaja suiza autohospedaje |
| AnythingLLM | 🟡 Magic Echo | ❌ | **RAG por workspaces** | ✅ | Foco en documentos/espacios |
| SillyTavern | ✅ **TTS local XTTS/Kokoro** | ❌ | lorebooks, RP, imágenes | ✅ | El TTS local más avanzado |
| LobeChat | ✅ STT/TTS | 🟡 plugins | **100+ plugins, multi-modelo** | ✅ | Mercado de plugins enorme |

### Qué podemos aprender (mejoras valiosas para v1)

1. **RAG documental local** (AnythingLLM / Open WebUI): arrastrar un PDF/TXT
   y chatear con él de forma privada. Para v1: lectura de archivos locales vía
   el puente (`cat` de archivos de la carpeta del proyecto) — sin vectores,
   solo contexto en el prompt.
2. **Generative UI / Artifacts** (LibreChat / Claude): renderizar el código
   HTML que genera Aion en una pestaña de vista previa en vivo. Como somos
   ‎web-first, es la mejora con mejor relación coste/impacto.
3. **Voz neuronal local** (SillyTavern/Kokoro): la Web Speech es funcional pero
   robótica. Un conector opcional a un TTS local (Kokoro-js en WASM) daría una
   voz con matices de verdad. **Fase 2.**
4. **Plugins/mercado** (LobeChat): convertir las herramientas fijas en un
   sistema de plugins JSON/JS activables. Buena arquitectura de futuro.
5. **Subagentes asíncronos** (Open Interpreter / LibreChat): tareas en segundo
   plano ("revisa los CVEs de la semana y guárdalos") con notificación al
   rostro. Fase 2.

---

## 2. Herramientas de pentest con IA (2024–2026)

| Herramienta | Funciones | Local | Interfaz | Notas |
|---|---|---|---|---|
| **Aion Sincro** | análisis de salidas, CVEs (NVD), checklists OWASP/MITRE, informes, terminal seguro | ✅ | web | Énfasis en compañera ética + salvaguardas |
| PentestGPT | guía de fases pentest, razonamiento | 🟡 (requiere API) | CLI | El pionero, pero sin herramientas reales |
| WhiteRabbitNeo | modelos LLM *fine-tuned* en seguridad | 🟡 | CLI/API | Modelos, no una plataforma |
| Interstell | análisis de CVEs con LLM | 🟡 | web | Foco en CVE management |
| w4sp-lab | agente web de pentest | 🟡 | web | Automatización de escaneos |
| Vulnhuntr | análisis estático de código (IA) | 🟡 | CLI | Detecta vulns en repos |
| Burp Suite + IA | proxy + asistente | ❌ | app | Estándar de la industria (cerrado) |

### Qué podemos aprender

1. **Integración con Burp/nmap real**: Aion ya interpreta salidas pegadas; el
   siguiente paso es que **lea los archivos de salida** (`nmap -oX`, `-oN`)
   directamente desde la carpeta del proyecto vía el puente (nuevo endpoint
   `/read` con token).
2. **Checklists OWASP/MITRE interactivas**: convertir el conocimiento estático
   en un **módulo de rutas de estudio** paso a paso (nuestra ventaja frente a
   PentestGPT: las tenemos pero hay que hacerlas navegables).
3. **Plantillas de informe**: informe de pentest profesional (ejecutivo +
   técnico con CVSS) exportable en Markdown — petición recurrente y muy
   diferenciadora.

---

## 3. Qué hacemos mejor que el resto (nuestras ventajas)

- 🎯 **Compañera con personalidad, no herramienta** — el manifiesto Aion Sincro
  (coautoría humano-IA) no tiene equivalente en ningún proyecto analizado.
- 🛡️ **Seguridad por diseño**: puente solo en 127.0.0.1, Host/Origin + token
  obligatorio, comandos con confirmación y filtro destructivo, sin XSS.
- 🌀 **Rostro animado SVG puro** — ningún otro asistente local tiene avatar
  reactivo sin dependencias ni telemetría.
- 🧠 **5 proveedores de IA en un solo HTML** (Demo/Ollama/Groq/OpenRouter/HF) —
  LibreChat y LobeChat lo hacen con cientos de dependencias; Aion Sincro con
  un solo archivo.
- 🪶 **Cero dependencias, cero servidores**: todo el frontend es un HTML.
  Ollama local opcional; todo lo demás funciona sin instalar nada.
- 🔍 **Herramientas gratuitas sin claves** (clima, CVE NVD, GitHub, países,
  búsqueda DDG+Wikipedia) directamente desde el navegador con fallback robusto.

---

## 4. Plan de mejoras priorizado para v1.x

| Prioridad | Mejora | Esfuerzo | Impacto |
|---|---|---|---|
| 🔴 P1 | **Vista previa de código (Artifacts)** | medio | Alto — muy visual |
| 🔴 P1 | **Leer archivos del proyecto** (`/read` en el puente) | bajo | Alto — pentest real |
| 🟠 P2 | **Plantillas de informe de pentest** exportables | medio | Alto — diferenciador |
| 🟠 P2 | **Rutas de estudio / checklists navegables** | medio | Alto — formación |
| 🟡 P3 | **Voz neuronal local (Kokoro-js)** | alto | Medio — pulido |
| 🟡 P3 | **Sistema de plugins** | alto | Medio — arquitectura |
| 🟡 P3 | **Subagentes asíncronos** | alto | Medio — potencia |

---

*Documento vivo: se actualiza con cada iteración del proyecto.*
