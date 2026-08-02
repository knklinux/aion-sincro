# 📢 POSTS_LINKEDIN.md — 10 publicaciones semanales de pentesting

> Compañero de [`LINKEDIN.md`](LINKEDIN.md) (sección 10). Cada publicación está
> **lista para copiar y pegar** en LinkedIn, con su gancho, captura sugerida y
> hashtags. Regla de oro nº 5 de la guía: **cada dato es verificable** en el
> repo `knklinux/aion-sincro` — sin logros inventados.
>
> **Calendario**: 1 post por semana (≈ 2,5 meses, el tiempo de preparación del
> eJPT). Publica el mismo día y hora, responde los comentarios la primera hora,
> y reutiliza cada post como hilo de X, entrada de blog o sección de tu CV.

---

## Semana 1 · Presentación: por qué construyo mis herramientas

### 📝 Post (listo para pegar)

**De instalar carpintería metálica a construir un asistente de IA para pentesting. Y con 518 tests de seguridad que lo demuestran. 🔧→🛡️**

Hola, soy Arkaitz. Tengo 0 títulos universitarios. Estudios hasta secundaria. Y un trabajo a turno completo como autónomo instalador de carpintería metálica en Málaga.

Pero cuando acaba el día y se apaga la radial, enciendo el portátil. Sin contactos en el sector y aprendiendo en solitario, decidí hacer lo único que tiene sentido cuando no tienes currículum: **construir lo que te gustaría que existiera**.

Así nació **Aion Sincro**, un asistente de IA open-source para pentesting y red team. Y más tarde **CyberGuard**, un toolkit CLI de seguridad en Python con cero dependencias.

¿Qué puede hacer Aion? 5 motores de IA gratuitos (Ollama 100% local, OpenRouter, Groq, HuggingFace y Mistral), voz neuronal local con Piper, informes de pentest profesionales exportables a Markdown, PDF y Word, auditoría ISO 27001:2022, una ruta guiada de red team con 18 checkpoints y examen, y una suite de seguridad con **518 tests** y pruebas de mutación reales (quito una línea de seguridad y verifico que el test cae — si no cae, no protege).

No soy un gurú. No vengo de FAANG. Soy un tipo que mide cerramientos por la mañana y escribe tests de cifrado WebCrypto por la noche. Y cada afirmación de este post se puede comprobar en el repo, sin humo.

Hoy me preparo para el eJPT mientras sigo construyendo en público, porque mi CV no son títulos: son repositorios.

📎 Repo: github.com/knklinux/aion-sincro

**Pregunta para ti:** ¿cuál fue tu primer proyecto que demostró que sabías sin tener el papel que lo acreditara? Me encantaría leer tu historia. 👇

`#Ciberseguridad #Pentesting #RedTeam #OpenSource #Linux #Autodidacta #eJPT #ReconversiónProfesional`

### 📸 Captura sugerida
La portada del README (logo ⚡ + título "Compañera de Pentest · Coarquitecta del Plan de Rescate") o una captura del visor geométrico de Aion hablando.

### ✅ Verificable
- 518 tests app + 89 tests bridge = 607 en total: `cd hermes-ai && node test_app.js` → `RESULTADO: 518 ok · 0 fallos` | `python test_bridge.py` → `89 ok · 0 fallos`.
- 5 motores, Piper, CyberGuard, informes MD/PDF/Word, ISO 27001, 18 checkpoints: todo en el README y `LINKEDIN.md`.

---

## Semana 2 · nmap más allá de `-sV -sC`

### 📝 Post (listo para pegar)

**Un escaneo no es un informe. 🗺️**

Cuando empecé con nmap, mi comando era siempre el mismo: `nmap -sV -sC` contra la IP, copiar puertos a mano al bloc de notas, y a otra cosa. Tardé semanas en entender que un escaneo responde *qué hay abierto*, pero un informe explica *qué significa para quien tiene que decidir*.

Como no tengo a nadie que me revise los informes (soy autodidacta y aprendo solo), tuve que construir mi propio revisor: un parser que convierte la salida real de nmap en un informe de reconocimiento automático.

Lo que aprendí en el camino:

1. **`-p-` + `--min-rate`** para mapear TODO el rango de puertos. Los "de siempre" (22, 80, 443) son solo el 0,004% de los 65535. Escanear 1000 puertos por defecto es ir a una auditoría con los ojos vendados.
2. **`-oX` salida XML**, no texto plano: así la máquina puede leerla y yo puedo automatizar el informe en lugar de copiar y pegar.
3. **Reducir el ruido**: `-T1`/`-T2` para escaneos discretos y `--disable-arp-ping` cuando el objetivo no está en tu red local.
4. **Interpretar, no listar**: un puerto 9100 abierto no es "raro", es *una impresora expuesta*. Eso es un hallazgo. Un puerto 6379 sin autenticación no es "Redis", es *una posible puerta trasera*. Cada puerto cuenta una historia.

El parser lo metí dentro de Aion Sincro (mi asistente open-source): pegas la salida de nmap en el chat y te genera un informe con tabla de puertos, superficie de ataque y recomendaciones. Exportable a Markdown, PDF y Word. Sin subir datos a ningún sitio, todo en local.

No soy un experto en nmap. Soy un tipo que aprendió a base de escanear su propio laboratorio y automatizar la parte aburrida. Pero cada afirmación de este post se puede comprobar en el repo.

📎 Repo: github.com/knklinux/aion-sincro

**Pregunta para ti:** ¿cuál es la flag de nmap que más usas y por qué? Yo tengo un par de opiniones polémicas sobre `-A`… 👇

`#Nmap #Pentesting #Reconocimiento #InfoSec #Linux #RedTeam #Autodidacta`

### 📸 Captura sugerida
Salida real de un escaneo con `-sV -sC -p-` y el informe generado automáticamente a partir de su XML.

### ✅ Verificable
- El parser de nmap vive en `hermes-ai/index.html` (detecta la salida y genera el informe de reconocimiento) y está cubierto por la suite.

---

## Semana 3 · Lo que nmap no te cuenta

### 📝 Post (listo para pegar)

**Lo que nmap no te cuenta: los falsos negativos que casi me cuestan un hallazgo. 🔍**

La semana pasada hablé de flags avanzados. Esta semana toca lo incómodo: lo que nmap **no ve**, aunque le pases `-p-`.

Escaneé mi propio laboratorio y nmap me dijo que el puerto 8080 estaba cerrado. El servicio respondía. El navegador lo cargaba. Pero nmap, silencio.

Tres razones por las que nmap miente:

1. **Firewall con rate-limiting**: si el objetivo descarta paquetes tras N conexiones, nmap marca "filtered" o no ve nada. Solución: `--max-retries 3` y `--scan-delay 1s`.
2. **Protocolos que nmap no entiende**: servicios custom, HTTP en puertos raros, o un netcat escuchando. Solución: `nc -zv` como segunda opinión.
3. **El triple handshake engaña**: un puerto completa SYN/ACK y luego larga un RST antes de que nmap termine de sondear. Solución: combinar `-sT` (TCP connect) con `-sS`.

Lo metí en Aion Sincro: ahora la app me avisa si hay rangos sin escanear y sugiere flags de verificación. Porque un escaneo incompleto es un informe incompleto.

No soy analista de redes. Soy un instalador de carpintería metálica que aprendió a pillar a nmap en un renuncio. Cada afirmación, comprobable en el repo.

📎 Repo: github.com/knklinux/aion-sincro

**Pregunta para ti:** ¿alguna vez te ha pasado que una herramienta te diga "no hay nada" y tú sepas que sí lo hay? Cuéntame la anécdota. 👇

`#Nmap #Pentesting #FalsosNegativos #InfoSec #RedTeam #Reconocimiento #Autodidacta`

### 📸 Captura sugerida
Un escaneo donde nmap muestra "closed/filtered" y la evidencia de que el puerto realmente responde (navegador, netcat o Wireshark).

### ✅ Verificable
- El parser de nmap en `hermes-ai/index.html` genera recomendaciones de verificación adicional cuando detecta rangos sin escanear o resultados inconsistentes. Cubierto por la suite de tests.## Semana 4 · OSINT con herramientas libres

### 📝 Post

**Empecé OSINT con `holehe` y Wayback Machine: esto encontré. 🕵️**

El reconocimiento pasivo es la fase más infravalorada del pentest. Sin tocar el objetivo, con solo fuentes abiertas, aprendí a:

- **Comprobar qué servicios usan un email** (holehe, que consulta registros públicos de alta).
- **Explorar el pasado de un dominio** con la Wayback Machine: versiones antiguas, archivos olvidados y subdominios que ya no existen… pero siguen en DNS.
- **Buscar contenido oculto en robots.txt** y directorios que el propio sitio intenta esconder.

Lo integré todo en un módulo local: `python aion_osint.py --user NOMBRE` te devuelve cuentas asociadas, y `--domain DOMINIO` analiza robots.txt + Wayback + contenido oculto. 70+ plataformas, 65 tests, y **sin subir nada a internet** — todo se consulta desde tu máquina.

⚠️ Regla de oro: OSINT solo sobre **datos propios o con autorización** (Art. 197 C.P.). El objetivo de este post es aprender, no espiar.

¿Qué herramienta OSINT te sorprendió más cuando la descubriste? 👇

`#OSINT #Pentesting #RedTeam #Privacidad #HackingEtico #Linux`

### 📸 Captura sugerida
Salida real de `aion_osint.py --user <usuario>` o la del análisis de un dominio (robots.txt + Wayback).

### ✅ Verificable
- `hermes-ai/aion_osint.py` + `robots_wayback.py` (65 tests: `python test_aion_osint.py`). También hay botón 🕵️ OSINT en la propia app.

---

## Semana 5 · OverTheWire Bandit: 27 niveles

### 📝 Post

**27 niveles después, la terminal ya no me da miedo. 🐚**

Cuando empecé, `ls`, `cd` y `cat` eran "los tres mandamientos". Hoy, tras los 27 niveles de OverTheWire Bandit, la terminal es mi lengua materna. Esto es lo que ese reto me enseñó:

1. **Leer la ayuda es una habilidad**: `man`, `--help` y `strings` resuelven más que memorizar comandos.
2. **Pensar en pipelines**: encadenar herramientas (`grep`, `sort`, `uniq`, `awk`) es pensar en flujos de datos.
3. **La seguridad está en los detalles**: archivos ocultos, permisos raros, cron jobs, `setuid`… todo es una pista.
4. **SSH y claves**: cada nivel es una excusa para usar ssh, scp y claves públicas/privadas sin miedo.

No hay truco: es constancia. Un nivel al día durante un mes. Si te atascas, `strings` y `grep -r` son tus amigos.

¿Cuál es tu reto CLI favorito? Yo estoy mirando ya hacia la siguiente montaña… 👇

`#OverTheWire #Bandit #Terminal #Linux #CTF #AprendizajeAutodidacta`

### 📸 Captura sugerida
Captura del último nivel resuelto (o del ranking) — verifica el progreso sin inventar.

### ✅ Verificable
- Nivel 27 alcanzado: verificado en `LINKEDIN.md` (sección laboratorios). Si ya estás en el 28 o más, actualízalo antes de publicar.

---

## Semana 6 · Informes de pentest: la parte que nadie practica

### 📝 Post

**El exploit es el 20%; el informe es el 80%. 🧾**

Todos quieren ser los que "entran". Nadie quiere ser el que explica **qué se encontró, por qué importa y qué hacer**. Pero el informe es lo que lee el cliente, la dirección y, sí, también quien te contrata.

Mi plantilla de informe de pentest tiene 5 bloques que nunca fallan:

1. **Resumen ejecutivo** — para dirección: riesgo en 3 frases, sin tecnicismos.
2. **Alcance y contexto** — qué se probó, con qué autorización, durante cuánto tiempo.
3. **Metodología** — el proceso, no solo los resultados.
4. **Hallazgos** — severidad + descripción + evidencia + recomendación, en tabla.
5. **Conclusiones y próximos pasos** — qué priorizar, qué re-testear.

Automatizar la parte repetitiva (tablas, cabecera, formato, incluso la **portada corporativa y la marca de agua CONFIDENCIAL** del PDF) me deja tiempo para lo que importa: la calidad del análisis.

¿Cómo estructuras tus informes? ¿Usas plantillas o los haces desde cero? 👇

`#Pentesting #Informes #RedTeam #ReportWriting #Seguridad #eJPT`

### 📸 Captura sugerida
Una página de un informe real generado (tabla de hallazgos con severidad o la portada con cabecera corporativa).

### ✅ Verificable
- Modo 💼 Laboral en la app: plantillas de reconocimiento, pentest y reporte ejecutivo, export a Markdown/PDF/Word (.docx real) y marca de agua configurable.

---

## Semana 7 · OWASP Top 10: lo que estoy aprendiendo

### 📝 Post

**Los atacantes no memorizan listas: explotan contextos. 🌐**

Estudiando el OWASP Top 10 descubrí que el fallo no está en no conocer la lista, sino en no reconocer el **patrón en contexto**. Un mismo "insertar datos en una web" puede ser SQLi, XSS o command injection según dónde aterrice.

Mis apuntes mentales hasta ahora:

- **A03 Injection**: todo lo que construye una consulta con texto del usuario huele mal.
- **A01 Broken Access Control**: el clásico que aparece cuando pruebas "¿y si cambio el ID de la URL?"
- **A05 Security Misconfiguration**: headers faltantes, `X-Powered-By` gritando, directorios listados.
- **A02 Cryptographic Failures**: credenciales en claro que no deberían existir.

Lo practico en mi laboratorio y lo conecto con mi ruta de aprendizaje: cada vulnerabilidad tiene su checkpoint de práctica. La teoría se olvida; el contexto se recuerda.

¿Cuál es la vulnerabilidad web más infravalorada para ti? Yo tengo un candidato claro… 👇

`#OWASP #WebSecurity #Pentesting #BugBounty #Seguridad #RedTeam`

### 📸 Captura sugerida
Un hallazgo real de tu laboratorio (una petición interceptada, un header mal configurado o la prueba de concepto de un fallo).

### ✅ Verificable
- La Ruta Red Team de la app incluye módulos de seguridad web con checkpoints de práctica y examen final.

---

## Semana 8 · Mi plan de estudio del eJPT

### 📝 Post

**Me preparo para el eJPT: esto es exactamente lo que estoy haciendo. 📚**

Soy autodidacta y no tengo títulos que me avalen, así que mi plan para el eJPT es 100% práctico:

1. **Ruta guiada de red team con 18 checkpoints**: reconocimiento → explotación → informe. Cada checkpoint tiene teoría, comando exacto, interpretación y práctica en laboratorio.
2. **Laboratorios diarios**: OverTheWire Bandit (nivel 27), TryHackMe y HackTheBox.
3. **Práctica real con herramientas**: nmap, gobuster, Burp Suite, OSINT… y automatización de informes.
4. **Examen simulado propio**: la app me genera un examen con preguntas de cada fase y me da la puntuación con recomendaciones de repaso.
5. **Construir en público**: cada hallazgo que aprendo, lo publico (como este post).

Cuando complete los 18 checkpoints, Aion me emite un **informe de progreso exportable** con habilidades y recomendaciones — mi "certificado" de que lo hago, no de que lo digo.

¿Qué certificación de entrada recomiendas para alguien sin formación reglada? 👇

`#eJPT #Certificación #Pentesting #RedTeam #Estudio #Seguridad`

### 📸 Captura sugerida
La ruta de la app con el progreso de checkpoints o el plan de estudio. Honestidad: el eJPT está **en preparación**, no conseguido.

### ✅ Verificable
- 18 checkpoints + examen + informe de progreso: en `hermes-ai/index.html` (Ruta Red Team). eJPT marcado como "en preparación" en `LINKEDIN.md`.

---

## Semana 9 · Seguridad por diseño

### 📝 Post

**Si no puedes probar que tu control de seguridad protege, no protege. 🔐**

La semana pasada alguien me preguntó: *"¿cómo sabes que tus claves API están a salvo?"*. No dije "porque cifro". Lo demostré:

- **WebCrypto de verdad**: AES-GCM 256 con clave derivada por PBKDF2-SHA256 (120.000 iteraciones). La contraseña nunca se guarda: se pide cada sesión para desbloquear.
- **El puente local endurecido**: solo escucha en `127.0.0.1`, valida `Host` y `Origin` contra falsificaciones, y exige token en cada petición.
- **518 tests + pruebas de mutación**: no basta con tener tests; quito una línea de seguridad y **compruebo que el test falla**. Si el test no se entera, el test no protege.

Eso es "seguridad por diseño": el control no es una feature que se añade al final, es la **prueba de que funciona**. Y cualquiera puede verificarlo: el repo es público.

¿Haces pruebas de mutación en tus proyectos? ¿O tus tests solo te dicen lo que quieres oír? 👇

`#SeguridadPorDiseño #WebCrypto #DevSecOps #OpenSource #Pentesting #Testing #Ciberseguridad`

### 📸 Captura sugerida
El resultado de la suite (`518 ok · 0 fallos`) o el informe de cobertura de mutación mostrando qué checks protegen de verdad.

### ✅ Verificable
- Cifrado WebCrypto, endurecimiento del puente, 518 tests y `test_mutacion.py` con informe de cobertura: todo en el repo y documentado en `SECURITY.md`.

---

## Semana 10 · Recapitulación: 10 semanas construyendo en público

### 📝 Post

**10 semanas, 10 publicaciones y una ruta de red team con 18 checkpoints. 🏁**

Esto es lo que he construido en público este trimestre:

- 🛡️ **Aion Sincro**: asistente de IA open-source para pentest y red team — 5 motores gratis, voz local con Piper, informes MD/PDF/Word, auditoría ISO 27001 y una suite con **518 tests**.
- 🗺️ **Ruta Red Team**: 18 checkpoints con examen y certificación de progreso exportable.
- 🕵️ **OSINT local**: análisis de dominios, emails y contenido oculto sin subir nada a internet.
- 🧾 **Informes profesionales**: plantillas de reconocimiento, pentest y ejecutivo; parsers de nmap, Burp, Nessus y gobuster.
- 🎓 **Preparación eJPT**: examen simulado propio, Bandit nivel 27 y constancia diaria.

Lo más valioso no es el código: es **haber aprendido en público**. Cada post era un checkpoint de mi propio camino. Si alguien con 0 títulos puede hacer esto en 2,5 meses, imagínate con constancia un año.

¿Qué debería aprender o construir ahora? El siguiente capítulo lo elegimos entre todos. 👇

`#RedTeam #OpenSource #Pentesting #Aprendizaje #eJPT #InfoSec`

### 📸 Captura sugerida
Un "mapa" visual de lo publicado (capturas de cada semana en una cuadrícula) + logros: 518 tests, 18 checkpoints, Bandit 27.

### ✅ Verificable
- Cada afirmación de este post aparece verificada en los posts 1-9 y en el repo.

---

## 📋 Checklist antes de publicar

- [ ] Revisa que los datos sigan siendo ciertos (los tests pueden subir de 518, Bandit puede pasar del 27…).
- [ ] Adjunta la captura real (nada de imágenes de stock ni de otro repo).
- [ ] Publica el mismo día y hora de cada semana.
- [ ] Responde todos los comentarios la primera hora.
- [ ] Conecta con 3 personas del sector esa semana (mensaje breve y honesto).
- [ ] Reutiliza el post: hilo de X, entrada de blog, sección del CV.

---

*Documento vivo: actualiza los números cuando cambien (ej. 518 → nueva cifra de la suite) y añade publicaciones nuevas cuando el calendario se amplíe.*
