# 💡 Lluvia de ideas — Aion Sincro v1.0

> Compañera de Pentest · Coarquitecta del Plan de Rescate
> Sesión de ideación tras la revisión 3×3 y las pruebas de humo de cada engranaje.

---

## 🎯 Prioridad alta — practicidad diaria (laboral)

1. **Plantillas de informe en Word (.docx)** — además de Markdown/PDF, exportar el informe de
   pentest con la cabecera corporativa ya maquetada (python-docx o LibreOffice headless).
2. **Exportación de la sesión completa** — JSON descargable del chat con marca de tiempo para
   reconstruir una auditoría (ya existe la persistencia local; falta el export limpio).
3. **Cronómetro de sesión global** — tiempo total por sesión de trabajo y por modo
   (Laboral / Ruta / Evaluación) con informe de horas (útil para facturación freelance).
4. **Modo «offline total»** — la app ya funciona sin red para Ruta/Evaluación/informes;
   documentar el modo avión como propuesta de valor.
5. **Chat con adjuntos** — pegar archivos (logs, .pcap, .txt de herramientas) y que Aion
   los analice localmente sin motor de IA (parsers existentes ampliados).

## 🧭 Portabilidad

6. **PWA (Progressive Web App)** — manifest + service worker: instalable en móvil/escritorio
   sin store, con caché de la app para arranque offline. Bajo esfuerzo, alto impacto.
7. **Docker Compose** — un `docker-compose.yml` que levante la app + puente + proxy + piper
   con un comando, para laboratorios aislados (ideal para pruebas en contenedor).
8. **Ejecutable Windows** — empaquetar con `pyinstaller` el puente/proxy/piper y una versión
   portable de la app (sin instalar Python en la máquina del cliente).

## 🤖 Aplicación Android

9. **WebView de la PWA en Android** — la vía más rápida: Capacitor (Ionic) envuelve la app
   web existente en un APK con permisos de micrófono para la hotword y la voz.
10. **TTS local en Android** — usar el motor TTS del sistema (`TextToSpeech`) para el español
    sin depender de Piper en el móvil (Piper Android existe pero requiere build nativo).
11. **Termux en Android** — la app web ya funciona en cualquier navegador; documentar el
    flujo «Termux + servidor local» para tener Aion en el móvil sin APK.
12. **Notificaciones push de la hotword** — si la PWA está en segundo plano, no se puede
    oír la hotword en Android; documentar el límite y la alternativa (servicio foreground).

## 🔐 Seguridad a futuro (del roadmap de SECURITY.md)

13. **Contraseña maestra con bio-auth** — desbloqueo de claves con huella en el móvil vía
    WebAuthn (solo PWA en contexto seguro HTTPS).
14. **HashiCorp Vault o secret-store local** — alternativa al cifrado WebCrypto para
    despliegues serios.
15. **Firma de informes** — hash SHA-256 del PDF generado y verificación del autor para
    entregables de auditoría.

## ✨ Calidad de vida

16. **Tema claro/oscuro automático** — seguir `prefers-color-scheme` (la UI es oscura hoy;
    un tema claro ayuda en informes en pantalla).
17. **Historial de comandos del terminal** — flecha ↑/↓ con el histórico de la sesión.
18. **Sugerencias de voz según emoción** — ya hay selector de emociones voxtral; añadir
    detección automática de tono en el texto de Aion.
19. **Modo presentación** — pantalla limpia para mostrar informes al cliente.

---

> 📌 Sugerencia de arranque: **#1 (Word)**, **#6 (PWA)** y **#9 (Android vía Capacitor)**
> son las de mayor relación impacto/esfuerzo para la v1.1.
