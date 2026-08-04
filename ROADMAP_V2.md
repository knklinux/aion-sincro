# 🗺️ Hoja de Ruta — Aion Sincro v2.0

*"Menos features, más confianza." — el lema de la v2*

## El problema que ataca la v2

La v1 es un cohete de 30 features: funcionalmente brutal, pero con costes que
ya se notan (el arranque automático costó varias iteraciones, el onboarding
depende de un README enorme, y cada feature nueva añade superficie de test).
La v2 no busca **más**: busca que lo que hay **se sostenga solo** — que un
extraño la instale en 5 minutos, que un fallo se diagnostique en 1, y que
nada se rompa sin que la suite lo grite.

---

## Fase A — Estabilidad quirúrgica (la base, nada de features)

**Objetivo: cero regresiones conocidas, diagnóstico en segundos.**

| # | Trabajo | Por qué es consolidación |
|---|---|---|
| A1 | **Campaña de limpieza del monolito `index.html`**: dividir el `<script>` (~8.000 líneas) en módulos (`core.js`, `voice.js`, `reports.js`, `security.js`, `learn.js`) cargados en orden + bundler local simple | El archivo único ya es el mayor riesgo de mantenimiento: un error de comas en un módulo rompe todo y los tests de sintaxis solo ven "algo falló" |
| A2 | **Diagnóstico en un clic**: botón "🔧 Diagnóstico" que ejecute ping a puente/proxy/Piper, valide el token, muestre `startup.log` y genere un reporte exportable | Hoy el diagnóstico vive repartido entre `startup.log`, la pestaña Terminal y Ajustes — el usuario final no lo encuentra |
| A3 | **Suite de tests por módulo**: los ~990 tests quedan, pero agrupados para que un fallo diga *qué* módulo (voz, seguridad, informes) | La suite actual valida todo junto; en v2 cada módulo tiene su matriz y el CI la reporta por secciones |
| A4 | **Versiones pinneadas y reproducibles**: freeze del venv de Piper, `package.json` lockfile en `mobile/`, documentar las versiones exactas testadas | "En mi máquina funciona" deja de ser una excusa: la v2 se prueba contra una matriz concreta |

## Fase B — Documentación que vende y enseña

**Objetivo: un novato activa Aion solo; un reclutador la entiende en 2 minutos.**

| # | Trabajo | Por qué |
|---|---|---|
| B1 | **README reestructurado** (hay secciones que sobran en la portada): mover el "cómo contribuir/roadmap" a `CONTRIBUTING.md` y enlazar este `ROADMAP_V2.md` | El README actual es un manual de 700 líneas; la portada debe decir *qué es + demo + instalar en 5 pasos* |
| B2 | **Diagrama de arquitectura** (ASCII o Mermaid): web ↔ puente ↔ proxy ↔ Piper ↔ motores de IA ↔ PWA/APK | La única pieza que falta: cómo encaja todo — imprescindible para reclutadores y contribuidores |
| B3 | **Guía de resolución de problemas** (`TROUBLESHOOTING.md`): los 10 fallos reales ya vistos (token invalidado, Piper no suena, puente 403, popups bloqueados…) con su fix | Es conocimiento que ya tenemos y que hoy está disperso en la historia de la sesión |
| B4 | **Vídeo demo actualizado** + capturas nuevas en `PRIMERA_SESION.md` | El vídeo demo existente envejece rápido; la v2 necesita una pasada fresca que muestre los flujos actuales |

## Fase C — Onboarding: de cero a voz en 5 minutos

**Objetivo: primera experiencia sin fricción, para cualquiera.**

| # | Trabajo | Por qué |
|---|---|---|
| C1 | **Paquete "todo en uno" por sistema**: `windows/instalador-todo.cmd` (instala Python/Node si faltan + Piper + puente + acceso directo + arranque automático) y su gemelo en `linux/` | Hoy son 3-4 scripts que hay que conocer; el usuario final quiere **uno solo** |
| C2 | **Detector de requisitos en el arranque**: al abrir la app, un panel lista qué falta (Python, Node, Piper, token, clave) con su botón "arreglar" | El asistente de primera configuración ya existe; falta que *detecte* también el entorno del sistema, no solo las claves |
| C3 | **Plantillas de primer uso**: al primer arranque, 3 escenarios tipo ("Quiero practicar pentest", "Quiero un asistente de voz", "Solo quiero informes") que preconfiguran modos, voz y motor | Reduce la parálisis de elección: el novato no sabe por dónde empezar |

## Fase D — Seguridad: cerrar la hoja de ruta de SECURITY.md

**Objetivo: los pendientes de seguridad que ya están identificados, hechos.**

| # | Trabajo | Por qué |
|---|---|---|
| D1 | **Cifrado en reposo de `keys.json`** del proxy (p. ej. `age` o passphrase) | Es el único dato sensible que vive en disco en claro |
| D2 | **Rotación automática del token del puente** (TOTP/expiración) con re-negociación sin cortar la sesión | El token persistente es estable por diseño; hay que hacerlo *seguro a la vez que estable* |
| D3 | **Sandbox del puente**: lista blanca de comandos en modo «seguro» (solo lectura / comandos permitidos) | El puente ejecuta comandos reales; un modo restringido reduce el riesgo si la app queda abierta |
| D4 | **Auditoría de dependencias** (CI): `npm audit` en `mobile/`, `pip-audit` en el venv de Piper | Las dependencias mínimas existen; hay que vigilarlas en cada CI |

---

## 📊 Estimación de orden

| Fase | Esfuerzo | Entrega |
|---|---|---|
| A (estabilidad) | ~1 semana de trabajo real | Base modular + diagnóstico en un clic |
| B (docs) | ~2-3 días | Repo legible + troubleshooting |
| C (onboarding) | ~4-5 días | De cero a voz en 5 min |
| D (seguridad) | ~3-4 días | Roadmap de seguridad cerrado |

## 🚫 Lo que NO entra en la v2

Cualquier feature que no reduzca el tiempo de instalación, de diagnóstico o de
entendimiento del proyecto, no entra en la v2. Las ideas de ampliación
(vtuber, más herramientas, más motores) viven en [IDEAS.md](IDEAS.md) y se
revisan **después** de estabilizar.

## 🧱 Primer entregable sugerido

La **Fase A1** (modularizar el monolito): es la que desbloquea todo lo demás —
sin módulos, cada cambio sigue siendo un riesgo global.
