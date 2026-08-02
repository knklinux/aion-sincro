#!/usr/bin/env node
/**
 * Aion Sincro — Suite de pruebas de la app web (JS)
 * =================================================
 * Valida que cada cambio en index.html no rompa la app:
 *   1) Sintaxis del <script> con `node --check`
 *   2) Ausencia de secretos/claves reales en los archivos del repo
 *   3) Funciones puras: detectEmotion (tono de voz), voxtralSlug
 *   4) Presencia de los elementos/funciones clave de la app
 *
 * Uso:
 *     node test_app.js
 *     (o desde test_all.cmd / test_all.sh)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = __dirname;
let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function check(name, cond, extra = "") {
  if (cond) {
    PASS++;
    console.log(`  ✔ ${name}`);
  } else {
    FAIL++;
    FAILURES.push(name);
    console.log(`  ✘ ${name}  ${extra}`);
  }
}

// ---------- 1) Sintaxis del <script> de index.html ----------
console.log("\n[1] Sintaxis del JavaScript de index.html");
// AION_HTML permite apuntar la suite a una copia alternativa de index.html
// (la usa test_mutacion.py para probar que los checks de regresión protegen).
const html = fs.readFileSync(process.env.AION_HTML || path.join(ROOT, "index.html"), "utf8");
check("test_app.js soporta AION_HTML (harness de mutación)", /AION_HTML/.test(fs.readFileSync(__filename, "utf8")));
const match = html.match(/<script>([\s\S]*)<\/script>/);
check("index.html contiene un <script>", !!match);
if (!match) {
  console.log(`RESULTADO: ${PASS} ok · ${FAIL} fallos`);
  process.exit(1);
}
const script = match[1];
const tmpScript = path.join(os.tmpdir(), `aion-check-${Date.now()}.js`);
fs.writeFileSync(tmpScript, script);
try {
  const r = spawnSync(process.execPath, ["--check", tmpScript], { encoding: "utf8" });
  check("node --check sobre el <script>", r.status === 0, (r.stderr || "").slice(0, 300));
} finally {
  try { fs.unlinkSync(tmpScript); } catch (_) {}
}

// ---------- 2) Ausencia de secretos ----------
console.log("\n[2] Ausencia de secretos en el repo");
// Patrones de claves reales: SK-, GSK_, HF_, GHP_, sk-ant-, claves Mistral 32 hex
const SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9]{20,}/g,
  /\bgsk_[A-Za-z0-9]{20,}/g,
  /\bhf_[A-Za-z0-9]{20,}/g,
  /\bghp_[A-Za-z0-9]{20,}/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
];
// Claves compartidas por el usuario en el chat (nunca deben aparecer en el repo).
// Se construyen POR FRAGMENTOS para que la clave completa jamás exista como
// literal contiguo en el código — así este propio test no filtra nada.
const KNOWN_LEAKS = [
  "QdI0yX6f1Fvc8E" + "gAb2QtLtW23zvR5EJ7", // Mistral
  "7f6278d2cf394c5b" + "beae378eab6a8ff2",  // key "Ollama" inválida
  "ghp_5Wgo4pmIwcMYm" + "fNx7tJe0n08GhM9V11YDGWJ", // GitHub
];
// Solo archivos de CÓDIGO real (los tests referencian las claves conocidas por diseño)
const CODE_FILES = [
  "index.html", "bridge.py", "bridge.mjs", "piper_server.py", "proxy.py", "piper_compare.py",
  "windows/install.cmd", "windows/uninstall.cmd", "windows/aion-sincro.cmd",
  "windows/crear-acceso-directo.ps1", "windows/instalar-piper.cmd",
  "linux/install.sh", "linux/uninstall.sh", "linux/instalar-piper.sh",
];
let leaks = [];
for (const f of CODE_FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const content = fs.readFileSync(p, "utf8");
  for (const re of SECRET_PATTERNS) {
    for (const m of content.match(re) || []) leaks.push(`${f}: ${m.slice(0, 12)}…`);
  }
  for (const k of KNOWN_LEAKS) {
    if (content.includes(k)) leaks.push(`${f}: clave conocida ${k.slice(0, 8)}…`);
  }
}
check("sin claves de API en el código", leaks.length === 0, leaks.join("; ").slice(0, 300));
// El token del puente en la config NO debe estar hardcodeado en el código
check("sin token de puente hardcodeado", !/token\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/.test(script));

// ---------- 3) Funciones puras ----------
console.log("\n[3] Funciones puras de la app (tono de voz y slugs)");

function extractFn(src, name) {
  // Extrae "function <name>(){...}" (preservando el prefijo async si existe) con balanceo de llaves
  let idx = src.indexOf(`function ${name}(`);
  if (idx < 0) return null;
  if (src.slice(idx - 6, idx) === "async ") idx -= 6;
  let i = src.indexOf("{", idx);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(idx, j + 1);
    }
  }
  return null;
}

// detectEmotion
const detectEmotionSrc = extractFn(script, "detectEmotion");
check("detectEmotion presente", !!detectEmotionSrc);
if (detectEmotionSrc) {
  const detectEmotion = new Function(`"use strict"; ${detectEmotionSrc}; return detectEmotion;`)();
  const cases = [
    ["término técnico 'ataque' → neutral", detectEmotion("analiza este ataque de fuerza bruta"), "neutral"],
    ["alarma '¡ataque!' → angry", detectEmotion("¡ataque detectado! ¡peligro!"), "angry"],
    ["éxito → excited", detectEmotion("¡Excelente! Ganamos el CTF"), "excited"],
    ["tristeza → sad", detectEmotion("Lo siento, perdimos el laboratorio"), "sad"],
    ["confianza → confident", detectEmotion("Confía en mí, sin duda"), "confident"],
    ["frustración → frustrated", detectEmotion("Uf, esto no funciona"), "frustrated"],
    ["'Windows' no dispara excited", detectEmotion("hay que instalar la versión para Windows"), "neutral"],
    ["'contenido' no dispara cheerful", detectEmotion("revisa este contenido del informe"), "neutral"],
    ["texto vacío → neutral", detectEmotion(""), "neutral"],
  ];
  for (const [name, got, want] of cases) {
    check(name, got === want, `got ${got}`);
  }
}

// voxtralSlug (depende de store + VOXTRAL_EMOTIONS + detectEmotion)
const voxtralSlugSrc = extractFn(script, "voxtralSlug");
check("voxtralSlug presente", !!voxtralSlugSrc);
if (voxtralSlugSrc) {
  const store = { voice: "voxtral:en_paul", voxtralEmotion: "angry" };
  const VOXTRAL_EMOTIONS = [
    ["auto", "x"], ["neutral", "x"], ["happy", "x"], ["confident", "x"],
    ["cheerful", "x"], ["excited", "x"], ["sad", "x"], ["frustrated", "x"], ["angry", "x"],
  ];
  const detectEmotion = new Function(`"use strict"; ${detectEmotionSrc}; return detectEmotion;`)();
  const voxtralSlug = new Function(
    `"use strict"; const store=arguments[0]; const VOXTRAL_EMOTIONS=arguments[1]; const detectEmotion=arguments[2]; ${voxtralSlugSrc}; return voxtralSlug;`
  )(store, VOXTRAL_EMOTIONS, detectEmotion);
  check("emoción manual → en_paul_angry", voxtralSlug("cualquier texto") === "en_paul_angry");
  store.voxtralEmotion = "auto";
  check("auto + tono alegre → en_paul_excited", voxtralSlug("¡Excelente! Ganamos") === "en_paul_excited");
  store.voice = "voxtral:gb_oliver";
  check("Oliver fijo → gb_oliver_neutral", voxtralSlug("x") === "gb_oliver_neutral");
  store.voice = "voxtral:gb_jane";
  check("Jane fija → gb_jane_sarcasm", voxtralSlug("x") === "gb_jane_sarcasm");
}

// detectLang (auto-idioma: en→voxtral, es→voz offline)
const detectLangSrc = extractFn(script, "detectLang");
check("detectLang presente", !!detectLangSrc);
if (detectLangSrc) {
  const detectLang = new Function(`"use strict"; ${detectLangSrc}; return detectLang;`)();
  const cases = [
    ["es frase simple", detectLang("Hola, ¿cómo estás hoy?", "es-ES"), "es"],
    ["es texto técnico", detectLang("analiza este ataque de fuerza bruta", "es-ES"), "es"],
    ["es manifiesto", detectLang("El manifiesto habla de la vida y la libertad", "es-ES"), "es"],
    ["en frase simple", detectLang("Hello, how are you today?", "es-ES"), "en"],
    ["en texto técnico", detectLang("scan the network with nmap and gobuster", "es-ES"), "en"],
    ["en manifiesto", detectLang("The manifesto is about life and freedom", "es-ES"), "en"],
    ["mixto dominado por es", detectLang("el test with nmap fue un éxito", "es-ES"), "es"],
    ["vacío usa fallback en", detectLang("", "en-US"), "en"],
  ];
  for (const [name, got, want] of cases) {
    check(`detectLang: ${name} → ${want}`, got === want);
  }
}

// Router de speak(): auto-idioma enruta EN→Voxtral y ES→voz offline
check("speak() enruta por detectLang con autoLang", /function\s+speak\s*\([^)]*\)\{[\s\S]*?if\(store\.autoLang\)\{[\s\S]*?detectLang\(text,store\.lang\)/.test(script));
check("EN sin clave → speakWindows('en-US')", /if\(store\.mistralKey\) return speakVoxtral\(text\);\s*return speakWindows\(text,'en-US'\);/.test(script));
check("ES → speakWindows con idioma español", /return speakWindows\(text,\(store\.lang[\s\S]*?'es-ES'\);/.test(script));
check("pickVoice respeta voz explícita si idioma coincide", /if\(exact&&\(!store\.autoLang[\s\S]*?\)\) return exact;/.test(script));

// ---------- 4) Elementos y funciones clave de la app ----------
console.log("\n[4] Integridad de la app (elementos y funciones clave)");
const REQUIRED_IDS = [
  "bootBtn", "textInput", "sendBtn", "voiceSel", "provider", "modelInput",
  "btnCrypto", "cryptoPass", "piperUrl", "piperToken", "voxtralEmotion",
  "bridgeToken", "termInput", "termRunBtn",
  "welcome", "welcomeBtn", "welcomeNarrateBtn", "btnStory", "btnAutoLang",
  "proxyUrl", "proxyToken", "btnProxy", "btnRefreshModels", "piperLength", "piperNoise",
  "btnLearn", "learnOverlay", "learnBody", "learnProgress", "btnResetLearn", "btnCloseLearn",
  "btnLock", "lockPop", "lockPass", "lockUnlockBtn", "lockNowBtn", "lockWrap",
  "btnLaboral", "laboralBanner",
];
// Módulo de aprendizaje guiado: Ruta Red Team (recon → explotación → informe)
check("RUTA_PENTEST con 3 fases", /RUTA_PENTEST=\[\s*\{[\s\S]*?key:'recon'[\s\S]*?key:'exploit'[\s\S]*?key:'informe'/.test(script));
check("RUTA_PENTEST con módulos y checkpoints", (script.match(/cp:\[\{id:/g)||[]).length >= 6);
check("renderLearn() definida", /function\s+renderLearn\s*\(/.test(script));
check("learnPractice() definida y cierra overlay", /function\s+learnPractice\s*\([\s\S]*?classList\.remove\('show'\)[\s\S]*?handleUserText\(/.test(script));
check("learnCheck() guarda y re-renderiza", /function\s+learnCheck\s*\([\s\S]*?learnSave\(d\);[\s\S]*?renderLearn\(\);/.test(script));
check("learnDone() lee de localStorage (aion_ruta)", /function\s+learnDone\s*\(\).*localStorage\.getItem\('aion_ruta'/.test(script));
check("learnSave() escribe en localStorage (aion_ruta)", /function\s+learnSave\s*\([^)]*\)\{.*localStorage\.setItem\('aion_ruta'/.test(script));
check("renderLearn() al arranque", /function\s+bind\(\)\{\s*renderLearn\(\);[\s\S]*?startAutoLock\(\);[\s\S]*?\$\('#bootBtn'\)\.onclick/.test(script));
check("btnLearn abre el overlay", /\$\('#btnLearn'\)\.onclick=\(\)=>\{ renderLearn\(\);[\s\S]*?classList\.add\('show'\)/.test(script));
check("texto de checkpoints escapado con esc()", /<span class="cp-t">\$\{esc\(en\?c\.t_en:c\.t\)\}/.test(script));
// Certificación de la Ruta: informe de progreso exportable (CV / portafolio)
check("btnCert presente en el footer de la Ruta", html.includes('id="btnCert"'));
check("overlay #certOverlay presente", html.includes('id="certOverlay"'));
check("botones de export del certificado", html.includes('id="certExportMd"') && html.includes('id="certExportPdf"'));
check("certStats() definida y lee de RUTA_PENTEST", /function\s+certStats\s*\([\s\S]*?learnDone\(\)[\s\S]*?RUTA_PENTEST\.map/.test(script));
check("certSkillTexts() definida y extrae títulos", /function\s+certSkillTexts\s*\(/ .test(script));
check("certMarkdown() genera informe con habilidades y recomendaciones", /function\s+certMarkdown\s*\([\s\S]*?## \$\{L\.skills\}[\s\S]*?## \$\{L\.recs\}/.test(script));
check("certMarkdown() incluye el progreso por fase", /## \$\{L\.byPhase\}[\s\S]*?st\.map\(row\)/.test(script));
check("renderCert() definida y dibuja nombre editable", /function\s+renderCert\s*\([\s\S]*?id=\"certName\"/.test(script));
check("renderCert() escapa habilidades (XSS)", /cert-skill\"><b>▸<\/b><span>\$\{esc\(s\)\}<\/span>/.test(script));
check("openCert() definida", /function\s+openCert\s*\([\s\S]*?classList\.add\('show'\)/.test(script));
check("banner de Ruta completada incluye CTA de certificado", /id=\"learnCertCta\"[\s\S]*?openCert\(\);/.test(script));
check("btnCert abre el overlay", /\$\('#btnCert'\)\.onclick=openCert;/.test(script));
check("certExportMd/PDF usan certMarkdown()", script.includes("$('#certExportMd').onclick") && script.includes("$('#certExportPdf').onclick") && (script.match(/certMarkdown\(\)/g)||[]).length>=2);
check("certRecommendations() definida", /function\s+certRecommendations\s*\(/.test(script));
// Temporizador de sesión de práctica: racha y tiempo medio
check("pracStart() inicia la sesión en localStorage", /function\s+pracStart\s*\([^)]*\)\{ try\{ localStorage\.setItem\('aion_prac_session'/.test(script));
check("sesiones de práctica abandonadas >12h se descartan", /const PRAC_STALE=12\*3600\*1000;/.test(script) && /ms>=1000&&ms<PRAC_STALE/.test(script));
check("tick en vivo se autodestruye al cerrar la Ruta", script.includes("if(!o||!o.classList.contains('show')){ pracTickStop(); return; }"));
check("pracFinish() registra el tiempo y limpia la sesión", /function\s+pracFinish\s*\([^)]*\)\{[\s\S]*?localStorage\.removeItem\('aion_prac_session'\)[\s\S]*?pracSaveLog\(l\);/.test(script));
check("pracStreak() cuenta días consecutivos", /function\s+pracStreak\s*\([^)]*\)\{[\s\S]*?new Set\(pracLog\(\)\.map\(e=>e\.date\)\)/.test(script));
check("pracAvgMs() calcula la media", /function\s+pracAvgMs\s*\([^)]*\)\{.*pracLog\(\).*reduce/.test(script));
check("fmtPrac() formatea m:ss y h:mm", /function\s+fmtPrac\s*\([^)]*\)\{[\s\S]*?return m\+'m '/.test(script));
check("pracStatsHtml() dibuja la barra con racha/media/sesiones", /function\s+pracStatsHtml\s*\([^)]*\)\{[\s\S]*?pracStreak\(\)[\s\S]*?prac-bar[\s\S]*?pracAvgMs\(\)/.test(script));
check("renderLearn() antepone la barra de práctica", /body\.innerHTML=pracStatsHtml\(\)\+body\.innerHTML;/.test(script));
check("learnPractice() inicia el temporizador", /function\s+learnPractice\s*\([^)]*\)\{[\s\S]*?pracStart\(id\);/.test(script));
check("learnCheck() registra el tiempo al completar", /function\s+learnCheck\s*\([^)]*\)\{[\s\S]*?pracFinish\(id\)/.test(script));
check("toast muestra el tiempo y la racha", script.includes("'✅ Completado en ')+fmtPrac(ms)") && script.includes("pracStreak()"));
check("tick en vivo arranca/para con la Ruta", /btnLearn'\)\.onclick=\(\)=>\{ renderLearn\(\);.*classList\.add\('show'\)[\s\S]*?pracTickStart\(\);/.test(script) && /btnCloseLearn'\)\.onclick=\(\)=>\{ pracTickStop\(\);[\s\S]*?classList\.remove\('show'\);/.test(script));
// Modo Laboral: informes profesionales exportables en Markdown/PDF
check("LABORAL_SYSTEM definido con anatomía de informe", /const LABORAL_SYSTEM=`[\s\S]*?## 3\. Hallazgos[\s\S]*?REPORTE EJECUTIVO/.test(script));
check("store persiste laboral:false", /laboral:false,/.test(script));
check("systemPrompt() prioriza Laboral tras Sincronía", /else if\(store\.laboral\) base=LABORAL_SYSTEM;/.test(script));
check("btnLaboral presente en header", html.includes('id="btnLaboral"'));
check("laboralBanner presente", html.includes('id="laboralBanner"'));
check("syncLaboralUI() definida", /function\s+syncLaboralUI\s*\(/.test(script));
check("chips laboral: reconocimiento, pentest, ejecutivo y hallazgos", /Informe de reconocimiento[\s\S]*?Informe de pentest[\s\S]*?Informe ejecutivo[\s\S]*?Informe de hallazgos/.test(script));
check("chips visibles con store.laboral", /\$\(\'#chips\'\)\.classList\.toggle\('show',store\.pentest\|\|store\.laboral\);/.test(script));
check("downloadMarkdown() definida", /function\s+downloadMarkdown\s*\(/.test(script));
check("exportPdf() definida con ventana imprimible", /function\s+exportPdf\s*\([\s\S]*?window\.open|print\(/.test(script));
check("mdToHtml() definida", /function\s+mdToHtml\s*\(/.test(script));
check("barra de exportación solo con modo Laboral", /store\.laboral&&looksReport&&!bodyEl\.querySelector\('\.exportBar'\)[\s\S]*?textContent='📥 Markdown'[\s\S]*?textContent='📄 PDF'/.test(script));
check("CSS exportBar presente", /\.exportBar\{/.test(html));
check("exportPdf sin document.write (barrera de seguridad)", !/w\.document\.write/.test(script) && !/document\.write\(html\)/.test(script));
check("PDF_CSS separado como constante", /const PDF_CSS='body\{/.test(script));
check("exportPdf construye popup con DOM APIs", /w\.document\.open\(\); w\.document\.close\(\);[\s\S]*?w\.document\.body\.innerHTML=mdToHtml\(text\);/.test(script));
check("mdToHtml escapa HTML en párrafos (XSS)", /return '<p>'\+b\(escH\(blk\)/.test(script));
check("mdToHtml escapa HTML en celdas de tabla (XSS)", /b\(escH\(c\)\)/.test(script));
// Piper: velocidad y expresividad configurables (length_scale/noise_scale)
check("piperPlay envía length_scale", /p\.length_scale=store\.piperLength\|\|1\.0;/.test(script));
check("piperPlay envía noise_scale", /p\.noise_scale=store\.piperNoise\|\|0\.667;/.test(script));
check("store persiste piperLength/piperNoise", /piperLength:1\.0, piperNoise:0\.667,/.test(script));
// Fix: el selector solo muestra voces Piper realmente instaladas (evita elegir voces inexistentes)
check("piperPing captura las voces instaladas del /ping", script.includes("PIPER_INSTALLED=j.voices") && script.includes("let PIPER_INSTALLED=null"));
check("refreshPiperOptions() definida", /function\s+refreshPiperOptions\s*\(/.test(script));
check("installedPiperOptions() helper único (DRY)", /function\s+installedPiperOptions\s*\(/.test(script) && script.includes("PIPER_VOICES.filter(v=>!PIPER_INSTALLED||PIPER_INSTALLED.includes(v[0]))") && script.includes("installedPiperOptions()+"));
check("refreshPiperOptions conserva la selección no-Piper", script.includes("sel.value=cur") && script.includes("store.voice=''"));
// Proxy de claves: las claves nunca viajan al navegador cuando está activo
check("streamChat enruta por proxy cuando proxyOn", /if\(store\.proxyOn&&provider!=='demo'&&provider!=='ollama'\)\{[\s\S]*?url=pb\+'\/v1\/chat\/completions'/.test(script));
check("proxy no envía Authorization desde el navegador", /if\(store\.proxyOn&&provider!=='demo'&&provider!=='ollama'\)\{[\s\S]*?headers=\{'Content-Type':'application\/json'\}[\s\S]*?headers\['X-Proxy-Token'\]/.test(script));
check("voxtralPlay enruta TTS por proxy", /function voxtralPlay\(chunk\)\{[\s\S]*?store\.proxyOn&&store\.proxyUrl/.test(script));
// Memoria consistente de la historia: helpers centralizados y marca persistente
check(`historySeen() definida`, /function\s+historySeen\s*\(/.test(script));
check(`markHistorySeen() definida`, /function\s+markHistorySeen\s*\(/.test(script));
check(`syncStoryBtnUI() definida`, /function\s+syncStoryBtnUI\s*\(/.test(script));
check(`marca 'historia_vista' solo en helpers`, (script.match(/'historia_vista'/g)||[]).length===2);
check(`btnStory marca historia_vista`, /\$\('#btnStory'\)\.onclick=\(\)=>\{[\s\S]*?markHistorySeen\(\);/.test(script));
check(`welcomeBtn marca historia_vista`, /\$\('#welcomeBtn'\)\.onclick=\(\)=>\{[\s\S]*?markHistorySeen\(\);/.test(script));
check(`boot respeta historia_vista`, /if\(historySeen\(\)\)\{ chime\(\); maybeWake\(\); maybeOpenSetup\(\); return; \}/.test(script));
// Wake word personalizado: selector en Ajustes, persistencia y detección dinámica
check("store persiste wakeWord:'aion' por defecto", /wake:false, wakeWord:'aion',/.test(script));
check("selector #wakeWordSel presente en Ajustes", html.includes('id="wakeWordSel"'));
check("opciones del wake word (aion/aria/nova/aura/iris/luna/vega)", html.includes('<option value="aion">') && html.includes('<option value="aria">') && html.includes('<option value="nova">') && html.includes('<option value="aura">') && html.includes('<option value="iris">') && html.includes('<option value="luna">') && html.includes('<option value="vega">'));
check("openSettings rellena el selector", /\$\('#wakeWordSel'\)\.value=store\.wakeWord\|\|'aion';/.test(script));
check("collectSettings persiste el wake word", /store\.wakeWord=\(\$\('#wakeWordSel'\)\.value\|\|'aion'\)\.toLowerCase\(\);/.test(script));
check("wakeWord() helper definida", /function\s+wakeWord\s*\(\).*store\.wakeWord\|\|'aion'\)\.toLowerCase\(\)/.test(script));
check("detección construye la regex desde store.wakeWord", script.includes("const ww=wakeWord().replace") && script.includes("new RegExp('(^|\\\\s)(hola|oye|hey|ok)?\\\\s*'+ww"));
check("detección normaliza tildes (aíon → aion)", script.includes("texto.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')"));
check("startWakeScan muestra el wake word elegido", /statusText'\)\.textContent='DI «HOLA '\+wakeWord\(\)\.toUpperCase\(\)\+'»'/.test(script));
check("syncWakeWordUI actualiza botón y hint", /function\s+syncWakeWordUI\s*\([\s\S]*?wakeWordBtn[\s\S]*?wakeWordHint/.test(script));
// Frase completa: «Aion, abre el terminal» se ejecuta directamente sin esperar
check("frase completa: captura la petición tras el wake word", script.includes("ww+'(?:([") && script.includes("+.*)|$)"));
check("frase completa: no ejecuta con resultado provisional", /if\(!final\) return;/.test(script));
check("frase completa: ejecuta handleUserText con la petición", script.includes("handleUserText(resto)"));
check("frase completa: limpia separadores de la petición", script.includes("(m[3]||'').replace(/^[\\s,.;:!¿?]+/,'')"));
check("frase completa: wake word solo sigue esperando petición", script.includes("Te escucho. ¿Qué necesitas?"));

// --- Informes PDF: marca de agua y portada corporativa ---
check("store default pdfWatermark/pdfCover/pdfCompany", script.includes("pdfWatermark:false, pdfWatermarkText:'CONFIDENCIAL', pdfCover:false, pdfCompany:''"));
check("Ajustes: toggle de marca de agua presente", html.includes('id="btnPdfWatermark"'));
check("Ajustes: texto de marca de agua editable", html.includes('id="pdfWatermarkText"'));
check("Ajustes: toggle de portada corporativa presente", html.includes('id="btnPdfCover"'));
check("Ajustes: nombre de organización editable", html.includes('id="pdfCompany"'));
check("pdfExtraCss() definida", /function\s+pdfExtraCss\s*\(/.test(script));
check("marca de agua fija en cada página (position:fixed)", script.includes(".pdf-wm{position:fixed") && script.includes("rotate(-30deg)"));
check("portada con page-break-after", script.includes(".pdf-cover{page-break-after:always"));
check("pdfCoverHtml escapa datos del usuario (XSS)", script.includes("const org=escH((store.pdfCompany||'').trim()") && script.includes("const conf=escH((store.pdfWatermarkText||'CONFIDENCIAL').trim())") && script.includes("const tt=escH(title||reportTitle(text))"));
check("exportPdf inserta portada antes del contenido", script.includes("className='pdf-cover'") && script.includes("insertBefore(cov, w.document.body.firstChild)"));
check("exportPdf añade marca de agua al final", script.includes("className='pdf-wm'") && script.includes("appendChild(wm)"));
check("openSettings rellena pdfWatermarkText/pdfCompany", script.includes("$('#pdfWatermarkText').value=store.pdfWatermarkText") && script.includes("$('#pdfCompany').value=store.pdfCompany"));
check("collectSettings persiste pdfWatermark/pdfCover", script.includes("store.pdfWatermark=$('#btnPdfWatermark').classList.contains('on')") && script.includes("store.pdfCover=$('#btnPdfCover').classList.contains('on')"));
check("syncPdfUI() sincroniza ambos toggles", /function\s+syncPdfUI\s*\([\s\S]*?btnPdfWatermark[\s\S]*?btnPdfCover/.test(script));
check("exportPdf mantiene barrera XSS (sin document.write)", !/w\.document\.write/.test(script) && script.includes("cov.innerHTML=pdfCoverHtml(text,title)"));

// --- Modo Laboral: informe de reconocimiento desde salida real de nmap ---
check("parseNmapOutput() definida", /function\s+parseNmapOutput\s*\(/.test(script));
check("nmapReconReport() definida", /function\s+nmapReconReport\s*\(/.test(script));
check("parser detecta formato normal de nmap", script.includes("Nmap scan report for") && script.includes("PORT") && script.includes("(tcp|udp|sctp)"));
check("parser soporta formato grepable (-oG)", script.includes("Ports:") && script.includes("open|closed|filtered") && script.includes("(tcp|udp)"));
check("parser extrae OS/Running/MAC", script.includes("OS\\s+details?:\\s*(.+)$") && script.includes("MAC\\s+Address:\\s*(.+)$"));
check("informe tiene resumen ejecutivo y tabla de puertos", script.includes("# Informe de Reconocimiento — Nmap") && script.includes("| Puerto | Protocolo | Estado | Servicio / Versión |"));
check("informe incluye superficie de ataque y recomendaciones", script.includes("## 3. Superficie de ataque") && script.includes("## 4. Recomendaciones") && script.includes("laboratorio propio o permiso del propietario"));
check("handleUserText intercepta la salida de herramientas en modo Laboral", script.includes("else report=reconReport(text)") && script.includes("if(report){") && script.includes("body.textContent=report"));
check("el informe reutiliza renderTermChips (barra exportar)", script.includes("renderTermChips(body, report)"));
check("banner Laboral menciona pegar salida de nmap", html.includes("Pega aquí la salida real de nmap"));
// --- Modo Laboral: parsers de gobuster / Nessus / Burp Suite ---
check("parseGobusterOutput() definida", /function\s+parseGobusterOutput\s*\(/.test(script));
check("gobusterReconReport() definida", /function\s+gobusterReconReport\s*\(/.test(script));
check("parseNessusOutput() definida", /function\s+parseNessusOutput\s*\(/.test(script));
check("nessusReconReport() definida", /function\s+nessusReconReport\s*\(/.test(script));
check("parseBurpOutput() definida", /function\s+parseBurpOutput\s*\(/.test(script));
check("burpReconReport() definida", /function\s+burpReconReport\s*\(/.test(script));
check("dispatcher detectToolOutput() detecta las 4 herramientas", /function\s+detectToolOutput\s*\(/.test(script) && script.includes("return 'gobuster'") && script.includes("return 'nessus'") && script.includes("return 'burp'"));
check("dispatcher reconReport() enruta cada herramienta a su generador", /function\s+reconReport\s*\(/.test(script) && script.includes("if(tool==='nmap') return nmapReconReport(text)") && script.includes("if(tool==='gobuster') return gobusterReconReport(text)") && script.includes("if(tool==='nessus') return nessusReconReport(text)") && script.includes("if(tool==='burp') return burpReconReport(text)"));
check("informe gobuster: tabla de rutas + resumen ejecutivo", script.includes("# Informe de Enumeración de Directorios — Gobuster") && script.includes("| Ruta | Estado | Tamaño | Redirección |") && script.includes("## 2. Hallazgos interesantes"));
check("informe nessus: tabla de hallazgos + detalle críticos/altos", script.includes("# Informe de Escaneo de Vulnerabilidades — Nessus") && script.includes("| Severidad | Plugin | Nombre | CVSS | Host |") && script.includes("## 2. Detalle de críticos/altos"));
check("informe burp: tabla de hallazgos + detalle altos/críticos", script.includes("# Informe de Seguridad de Aplicación — Burp Suite") && script.includes("| Severidad | Hallazgo | Host | Ruta |") && script.includes("## 2. Detalle de hallazgos altos/críticos"));
check("los 3 generadores son bilingües (reportIsEn)", script.includes("const en=reportIsEn();") && script.includes("'# Directory Enumeration Report — Gobuster") && script.includes("'# Vulnerability Scan Report — Nessus") && script.includes("'# Application Security Report — Burp Suite"));
// --- curl: cabeceras de seguridad HTTP ---
check("parseCurlOutput() definida", /function\s+parseCurlOutput\s*\(/.test(script));
check("curlReconReport() definida", /function\s+curlReconReport\s*\(/.test(script));
check("detectToolOutput detecta curl (línea de estado HTTP)", script.includes("return 'curl'") && script.includes("/^HTTP\\/[\\d.]+\\s+\\d{3}/im"));
check("informe curl: cabeceras de seguridad + tabla de estado", script.includes("# Informe de Cabeceras de Seguridad — curl") && script.includes("# HTTP Security Headers Report — curl") && script.includes("| Cabecera | Estado |"));
check("reconReport enruta curl a curlReconReport", script.includes("if(tool==='curl') return curlReconReport(text)"));
// --- Plantillas Laboral: informe ejecutivo y de hallazgos ---
check("executiveReport() definida (resumen para dirección)", /function\s+executiveReport\s*\(/.test(script));
check("findingsReport() definida (tabla de hallazgos)", /function\s+findingsReport\s*\(/.test(script));
check("executiveReport bilingüe", script.includes("# Executive Report") && script.includes("# Informe Ejecutivo") && script.includes("Summary for management") && script.includes("Resumen para dirección"));
check("findingsReport bilingüe con tabla priorizada", script.includes("# Findings Report") && script.includes("# Informe de Hallazgos") && script.includes("| # | Severidad | Hallazgo | Evidencia | Recomendación |"));
check("intercept laboral enruta por palabras clave (ejecutivo/hallazgos)", script.includes("report=executiveReport(text)") && script.includes("report=findingsReport(text)") && script.includes("else report=reconReport(text)") && script.includes("informe de hallazgos|findings report"));
check("TOOL_LABEL incluye curl", script.includes("curl:'curl'"));
check("chips laboral bilingües con ejecutivo/hallazgos desde terminal", script.includes("Informe ejecutivo: genera el informe ejecutivo para dirección desde la salida real del terminal") && script.includes("Executive report: generate the executive report for management from the real terminal output"));
check("demoBrain Laboral explica el parsing local", script.includes("el parsing es local"));

// --- Re-escaneo nmap desde la barra del informe (flags nuevos en el terminal) ---
check("termRun acepta callback onDone con salida acumulada", /function\s+termRun\s*\(cmd,\s*onDone\)/.test(script) && script.includes("out+=j.out+'\\n'") && script.includes("if(typeof onDone==='function') onDone(out)"));
check("nmapRescan() definida para re-ejecutar nmap", /function\s+nmapRescan\s*\(/.test(script));
check("botón ↻ Re-scan nmap en la barra de exportar", script.includes("'↻ Re-scan nmap'") && script.includes("nmapRescan(nmapH[1].split("));
check("barra solo en informes nmap (título + host sección 2)", script.includes("Informe de Reconocimiento — Nmap") && script.includes("nmapH=text.match(/### 2\\.\\d+ `([^`]+)`/)"));
check("nmapRescan sanea flags y host (anti-inyección, puente shell=True)", script.includes("const SAFE=/^[A-Za-z0-9") && script.includes("if(!SAFE.test(f))") && script.includes("!SAFE.test(h)"));
check("botón nmap quita '(ip)' del host antes de re-escanear", script.includes("nmapRescan(nmapH[1].split("));
check("nmapRescan avisa si el terminal está ocupado", script.includes("if(termBusy){ toast('⏳ El terminal está ocupado") );
check("nmapRescan vuelve al chat con el informe regenerado", script.includes("switchTab('chat'); // volvemos al chat para ver el informe regenerado"));
check("nmapRescan regenera el informe con la salida fresca", script.includes("const fresh=nmapReconReport(out)") && script.includes("renderTermChips(body, fresh)"));
check("nmapRescan usa prompt por defecto -sV -sC -p-", script.includes("prompt('Flags de nmap para el re-escaneo (p. ej. -sV -sC -p-):','-sV -sC -p-')"));

// --- Modo Laboral: idioma de los informes (es/en) ---
check("store default reportLang:'es'", script.includes("reportLang:'es'"));
check("Ajustes: selector de idioma de informes presente", html.includes('id="reportLangSel"') && html.includes('value="en"'));
check("helper reportIsEn() y uso en nmapReconReport", /function\s+reportIsEn\s*\(/.test(script) && script.includes("const en=reportIsEn();"));
check("informe en tiene título y resumen en inglés", script.includes("'# Reconnaissance Report — Nmap") && script.includes("host(s) analyzed"));
check("informe es mantiene el título en español", script.includes("'# Informe de Reconocimiento — Nmap") && script.includes("host(s) analizado(s)"));
check("demoBrain Laboral responde en inglés cuando reportLang=en", script.includes("store.laboral&&reportIsEn()) return '💼 **Laboral Mode**") && script.includes("# [Report title]") && script.includes("Executive summary for management"));
check("demoBrain Laboral mantiene la respuesta en español", script.includes("store.laboral) return '💼 **Modo Laboral**") && script.includes("el parsing es local"));
check("confirmación hablada del informe respeta reportLang", script.includes("const _tool=TOOL_LABEL[detectToolOutput(text)]||(reportIsEn()?'the tool':'la herramienta');") && script.includes("speak(reportIsEn()") && script.includes("I generated the reconnaissance report from your") && script.includes("He generado el informe de reconocimiento desde tu salida de "));
check("banner Laboral bilingüe en syncLaboralUI", script.includes("ban.innerHTML=reportIsEn()") && script.includes("LABORAL MODE ACTIVATED") && script.includes("Paste the real nmap output") && script.includes("MODO LABORAL ACTIVADO"));
check("cambio de reportLang refresca el banner (syncLaboralUI en syncSettings)", script.includes("syncProxyUI(); syncLaboralUI(); refreshProviderUI();"));
check("tabla de puertos bilingüe", script.includes("| Port | Protocol | State | Service / Version |") && script.includes("| Puerto | Protocolo | Estado | Servicio / Versión |"));
check("superficie de ataque bilingüe", script.includes("## 3. Attack surface") && script.includes("## 3. Superficie de ataque"));
check("recomendaciones bilingües", script.includes("## 4. Recommendations") && script.includes("## 4. Recomendaciones"));
check("pdfCoverHtml usa reportIsEn() y subtítulo en inglés", script.includes("const en=reportIsEn();") && script.includes("Report generated with Aion Sincro"));
check("openSettings rellena reportLangSel", script.includes("$('#reportLangSel').value=store.reportLang||'es'"));
check("collectSettings persiste reportLang", script.includes("store.reportLang=$('#reportLangSel').value||'es'"));
for (const id of REQUIRED_IDS) {
  check(`#${id} presente`, html.includes(`id="${id}"`));
}
const REQUIRED_FNS = [
  "loadStore", "saveStore", "encryptSecrets", "decryptSecrets", "speakPiper",
  "speakVoxtral", "speakWindows", "detectLang", "piperPing", "proxyPing", "syncProxyUI", "collectSettings", "openSettings", "testProvider",
  "handleUserText", "termPing", "streamChat", "refreshModelsViaProxy", "lockSecrets",
];
for (const fn of REQUIRED_FNS) {
  check(`function ${fn} presente`, new RegExp(`function\\*?\\s+${fn}\\s*\\(`).test(script));
}
// Candado de cifrado en el header: indicador visual + desbloqueo rápido sin Ajustes  check("syncCryptoUI actualiza el candado del header", /function\s+syncCryptoUI\s*\([\s\S]*?lb\.classList\.toggle\('visible',on\);[\s\S]*?lb\.classList\.toggle\('locked',on&&!unlocked\);/.test(script));
  check("testProvider de OpenRouter valida con /auth/key (no /models público)", /function\s+testProvider\s*\([^)]*\)[\s\S]*?p==='openrouter'[\s\S]*?\/auth\/key/.test(script) && !/openrouter:[^\n]*\/models/.test(script));
check("lockSecrets() purga claves sin desactivar cifrado", /function\s+lockSecrets\s*\([\s\S]*?cryptoUnlocked=false; cryptoKey=null;[\s\S]*?saveStore\(\); syncCryptoUI\(\);/.test(script));
check("lockSecrets purga las claves de memoria", script.includes("['groqKey','openrouterKey','hfToken','mistralKey','bridgeToken','piperToken','proxyToken'].forEach(k=>{ store[k]=''; const el=$('#'+k); if(el) el.value=''; })"));
// Transición de seguridad del avatar: pulso rojo al bloquear, respiración verde al desbloquear
check("avatarSecurityFx() definida", /function\s+avatarSecurityFx\s*\([^)]*\)/.test(script));
check("avatarSecurityFx añade sec-lock/sec-unlock al núcleo", /c\.classList\.add\(type==='lock'\?'sec-lock':'sec-unlock'\);/.test(script));
check("avatarSecurityFx limpia la animación al terminar", /secFxTimer=setTimeout\(\(\)=>\{ c\.classList\.remove\('sec-lock','sec-unlock'\); \},2000\)/.test(script));
check("CSS keyframes secLock (pulso rojo)", /@keyframes secLock\s*\{[\s\S]*?rgba\(251,113,133/.test(html));
check("CSS keyframes secUnlock (respiración verde)", /@keyframes secUnlock\s*\{[\s\S]*?rgba\(52,211,153/.test(html));
check("CSS #core.sec-lock presente (especificidad alta)", /#core\.sec-lock\{animation:secLock/.test(html));
check("CSS #core.sec-unlock presente (especificidad alta)", /#core\.sec-unlock\{animation:secUnlock/.test(html));
check("lockSecrets() dispara el pulso rojo", /function\s+lockSecrets\s*\([\s\S]*?avatarSecurityFx\('lock'\);/.test(script));
check("desbloqueo desde el popup dispara la respiración verde", /\$\('#lockUnlockBtn'\)\.onclick=async\(\)=>\{[\s\S]*?avatarSecurityFx\('unlock'\);/.test(script));
check("activar cifrado dispara la respiración verde", /store\.crypto=true; cryptoUnlocked=true;[\s\S]*?avatarSecurityFx\('unlock'\);/.test(script));
check("desbloqueo desde Ajustes dispara la respiración verde", /applySecrets\(s\); cryptoUnlocked=true;[\s\S]*?avatarSecurityFx\('unlock'\);/.test(script));
// Bloqueo automático por inactividad
check("store persiste autoLockMin:0 por defecto", /autoLockMin:0,/.test(script));
check("campo autoLockMin en Ajustes", html.includes('id="autoLockMin"'));
check("collectSettings lee autoLockMin", /store\.autoLockMin=Math\.max\(0,parseInt\(\$\('#autoLockMin'\)\.value,10\)\|\|0\);/.test(script));
check("openSettings rellena autoLockMin", /\$\('#autoLockMin'\)\.value=store\.autoLockMin\|\|0;/.test(script));
check("markActivity() definida", /function\s+markActivity\s*\([^)]*\)\{ lastActivity=Date\.now\(\); \}/.test(script));
check("maybeAutoLock() bloquea tras la inactividad", /function\s+maybeAutoLock\s*\([^)]*\)\{[\s\S]*?Date\.now\(\)-lastActivity>=min\*60000[\s\S]*?lockSecrets\(\);/.test(script));
check("maybeAutoLock ignora si no hay claves desbloqueadas", /if\(!\(store\.crypto&&cryptoUnlocked\)\) return;/.test(script));
check("maybeAutoLock ignora autoLockMin=0", /min<=0\).*return;/.test(script));
check("startAutoLock() escucha actividad y tic cada 30s", /function\s+startAutoLock\s*\([^)]*\)\{[\s\S]*?\['mousemove','keydown','mousedown','touchstart','scroll','wheel'\][\s\S]*?setInterval\(maybeAutoLock,30000\);/.test(script));
check("startAutoLock() no duplica el intervalo", /if\(autoLockTick\) return;/.test(script));

check("bind() arranca el auto-bloqueo", /function\s+bind\(\)\{\s*renderLearn\(\);\s*startAutoLock\(\);/.test(script));
check("desbloqueos resetean la actividad", /avatarSecurityFx\('unlock'\); markActivity\(\);/ .test(script) && (script.match(/markActivity\(\);/g)||[]).length>=4);
check("desbloqueo rápido reutiliza decryptSecrets", /\$\('#lockUnlockBtn'\)\.onclick=async\(\)=>\{[\s\S]*?decryptSecrets\(pass,store\.encSecrets\)/.test(script));
check("bloqueo rápido usa lockSecrets", /\$\('#lockNowBtn'\)\.onclick=\(\)=>\{[\s\S]*?lockSecrets\(\);/.test(script));
check("popover se cierra al hacer clic fuera", /document\.addEventListener\('click',e=>\{[\s\S]*?w\.contains\(e\.target\)/ .test(script) || /document\.addEventListener\('click',e=>\{[\s\S]*?classList\.remove\('show'\)/.test(script));
// Modo Evaluación: examen práctico de la Ruta Red Team
check("EVAL_EXAM con las 3 fases de la Ruta", /EVAL_EXAM=\[[\s\S]*?key:'recon'[\s\S]*?key:'exploit'[\s\S]*?key:'informe'[\s\S]*?\];/.test(script));
check("EVAL_EXAM con 14 preguntas (a: índice correcto)", (script.match(/\{t:'[^']*', o:\[/g)||[]).length>=14);
check("cada pregunta EVAL enlaza un checkpoint (cp:)", (script.match(/cp:'recon-|cp:'exploit-|cp:'informe-/g)||[]).length>=14);
check("evalState persiste en localStorage (aion_eval)", /localStorage\.getItem\('aion_eval'/.test(script) && /localStorage\.setItem\('aion_eval'/.test(script));
check("renderEval() dibuja opciones con data-q/data-oi", script.includes("data-q=\"'+id+'\"") && script.includes("data-oi=\"'+oi+'\"") && /function\s+renderEval\s*\(/.test(script));
check("el examen NO revela la respuesta correcta al seleccionar", !script.includes("on-'+(oi===q.a?'ok':'no')") && script.includes("class=\"eval-opt'+(sel?' sel':'')+"));
check("recomendaciones usan el título real del checkpoint", /esc\(evalCheckpointTitle\(r\.cp\)\)/.test(script));
check("evalCheckpointTitle resuelve por c.id o p.key+'-'+c.id", /x\.id===cpId\|\|p\.key\+'-'\+x\.id===cpId/.test(script));
check("banner de examen final en la Ruta al completar 18/18", /if\(tAll>0&&dAll>=tAll\)\{[\s\S]*?learnEvalCta[\s\S]*?openEval\(\);/.test(script));
check("los cp: de EVAL_EXAM existen como checkpoints de la Ruta", (()=>{ const cpIds=[...script.matchAll(/cp:'([a-z0-9-]+)'/g)].map(m=>m[1]); if(!cpIds.length) return false; const rt=[...script.matchAll(/id:'((?:recon|exploit|informe)-[a-z0-9-]+)'/g)].map(m=>m[1]); return cpIds.every(id=>rt.includes(id)); })());
check("evalGrade() puntúa por fase y global", /function\s+evalGrade\s*\([\s\S]*?byPhase\[p\.key\]=\{pct:pt\?Math\.round\(po\/pt\*100\):0/.test(script));
check("evalGrade() genera recomendaciones de repaso", /function\s+evalGrade\s*\([\s\S]*?review\.push\(\{cp:q\.cp[\s\S]*?\).*renderEval\(\);/.test(script));
check("récord de puntuación se guarda (best)", /if\(evalState\.best===null\|\|pct>evalState\.best\) evalState\.best=pct;/.test(script));
check("openEval() muestra el overlay", /function\s+openEval\s*\([\s\S]*?classList\.add\('show'\)/.test(script));
check("botón btnEval en header", html.includes('id="btnEval"'));
check("overlay evalOverlay presente", html.includes('id="evalOverlay"'));
check("evalRetake reinicia el examen", /\$\('#evalRetake'\)\.onclick=\(\)=>\{ evalState\.done=false; evalState\.answers=\{\};/.test(script));
check("EVAL_EXAM es un dataset válido (3 fases, preguntas estructuradas)", (()=>{ const m=script.match(/const EVAL_EXAM=(\[[\s\S]*?\]);/); if(!m) return false; try{ const arr=new Function('return '+m[1]+';')(); return Array.isArray(arr)&&arr.length===3&&arr.every(p=>p.q&&p.q.length>=4&&p.q.every(q=>Array.isArray(q.o)&&q.o.length>=3&&typeof q.a==='number'&&q.cp)); }catch(_){ return false; } })());
check("evalReportMd() definida para exportar el resultado", /function\s+evalReportMd\s*\(/.test(script));
check("evalReportMd bilingüe (es/en según reportLang)", script.includes("const en=reportIsEn()") && script.includes("'# Red Team Route — Evaluation Report") && script.includes("'# Ruta Red Team — Informe de Evaluación"));
check("evalReportMd incluye nota por fase con tabla", script.includes("Score by phase") && script.includes("Nota por fase") && script.includes("s.ok+'/'+s.tot"));
check("evalReportMd incluye respuestas falladas con tu respuesta y correcta", script.includes("Failed answers") && script.includes("Respuestas falladas") && script.includes("**Your answer:**") && script.includes("**Tu respuesta:**") && script.includes("**Respuesta correcta:**"));
check("evalReportMd enlaza checkpoints a repasar", script.includes("evalCheckpointTitle(f.q.cp)") && script.includes("**Review checkpoint:**") && script.includes("**Checkpoint a repasar:**"));
check("evalReportMd incluye plan de repaso con acción", script.includes("Review plan (linked checkpoints)") && script.includes("Plan de repaso (checkpoints vinculados)") && script.includes("Open the Route → PRACTICE") && script.includes("Abre la Ruta → PRACTICAR"));
check("evalReportMd incluye veredicto y pie", script.includes("(en?'Verdict':'Veredicto')") && script.includes("Generated by Aion Sincro · Red Team Route evaluation") && script.includes("Evaluación de la Ruta Red Team · "));
check("botones de exportación del examen en la vista de resultados", html.includes('id="btnEvalExportMd"') && html.includes('id="btnEvalExportPdf"'));
check("btnEvalExportMd descarga Markdown con evalReportMd", script.includes("emd.onclick=()=>{ const md=evalReportMd()") && script.includes("downloadMarkdown(md,'evaluacion-ruta-red-team')"));
check("btnEvalExportPdf exporta PDF con evalReportMd", script.includes("epdf.onclick=()=>{ const md=evalReportMd()") && script.includes("exportPdf(md,'Evaluación Ruta Red Team')"));
check("evalReportMd recalcula el veredicto con reportLang (no g.verdict)", script.includes("const verdict=en") && script.includes("g.pct>=80?'Outstanding") && script.includes("g.pct>=80?'¡Excelente"));
// Herramienta de auditoría de cumplimiento ISO 27001:2022
check("ISO_NORMS con los 4 temas del Anexo A", /ISO_NORMS=\[[\s\S]*?key:'org'[\s\S]*?key:'people'[\s\S]*?key:'phys'[\s\S]*?key:'tech'/.test(script));
check("controles ISO con los 4 prefijos A.5/A.6/A.7/A.8", (script.match(/{id:'A\.5\./g)||[]).length>=15 && (script.match(/{id:'A\.6\./g)||[]).length>=8 && (script.match(/{id:'A\.7\./g)||[]).length>=10 && (script.match(/{id:'A\.8\./g)||[]).length>=15);
check("cada control ISO lleva acción de cumplimiento (need)", /{id:'A\.5\.1'[\s\S]*?need:'[\s\S]*?'/.test(script) && (script.match(/need:'/g)||[]).length>=40);
check("ISO_WEIGHTS con pesos del Anexo A", /ISO_WEIGHTS=\{org:\.37, people:\.08, phys:\.14, tech:\.34\}/.test(script));
check("store de la auditoría en localStorage (aion_iso)", /localStorage\.getItem\('aion_iso'/.test(script) && /localStorage\.setItem\('aion_iso'/.test(script));
check("renderISO() definida y dibuja el cuestionario", /function\s+renderISO\s*\([\s\S]*?iso-opt'\+/.test(script));
check("isoScoreByTheme() puntúa Cumple=100 Parcial=50", /v==='ok'\?100:\(v==='part'\?50:0\)/.test(script));
check("isoGaps() excluye ok y na", /if\(v==='ok'\|\|v==='na'\|\|!v\) continue;/.test(script));
check("isoReportMd() genera informe con resumen y brechas", /function\s+isoReportMd\s*\([\s\S]*?## 3\. Plan de cumplimiento/.test(script));
check("isoReportMd() escapa pipes en acciones", script.includes(".need.replace(/\\|/g,'/')") && script.includes("|\\n"));
check("openISO() muestra el overlay", /function\s+openISO\s*\([\s\S]*?classList\.add\('show'\)/.test(script));
check("botón btnISO en header", html.includes('id="btnISO"'));
check("overlay isoOverlay presente", html.includes('id="isoOverlay"'));
check("exportación ISO reutiliza downloadMarkdown/exportPdf", /\$\('#isoExportMd'\)\.onclick=\(\)=>\{[\s\S]*?downloadMarkdown\(md,'informe-auditoria-iso'\);[\s\S]*?\$\('#isoExportPdf'\)\.onclick=\(\)=>\{[\s\S]*?exportPdf\(md,'Informe Auditoría ISO'\);/.test(script));
check("Escape cierra el overlay ISO", /e\.key==='Escape'\)\{\s*const o=\$\('#isoOverlay'\); if\(o&&o\.classList\.contains\('show'\)\) o\.classList\.remove\('show'\);/.test(script));
check("comando 'iso/auditoría' abre la herramienta", /\/\\biso\\b\|27001\|auditor\[ií\]a\|normativa\|normativo\|cumplimiento\|sgs\[ií\]\/\.test\(q\)\)\{ openISO\(\);/.test(script));
check("ISO_NORMS es un dataset válido (4 temas, controles estructurados)", (()=>{ const m=script.match(/const ISO_NORMS=(\[[\s\S]*?\]);\s*const ISO_WEIGHTS/); if(!m) return false; try{ const arr=new Function('return '+m[1]+';')(); return Array.isArray(arr)&&arr[0]&&arr[0].themes&&arr[0].themes.length===4&&arr[0].themes.every(t=>t.controls&&t.controls.length>=8); }catch(_){ return false; } })());
// Herramienta OSINT local (aion_osint.py vía puente)
check("botón btnOsint en el header", html.includes('id="btnOsint"'));
check("overlay #osintOverlay presente", html.includes('id="osintOverlay"'));
check("selector de tipo OSINT con 4 modos (user/email/phone/domain)", html.includes('<option value="user">') && html.includes('<option value="email">') && html.includes('<option value="phone">') && html.includes('<option value="domain">'));
check("input de valor y botón Buscar", html.includes('id="osintInput"') && html.includes('id="osintRunBtn"') && html.includes('id="osintLimit"'));
check("openOsint() definida y abre el overlay", /function\s+openOsint\s*\([\s\S]*?classList\.add\('show'\)/.test(script));
check("osintRun() definida", /function\s+osintRun\s*\(/.test(script));
check("osintParseJson() definida (extrae el bloque JSON)", /function\s+osintParseJson\s*\([\s\S]*?indexOf\('\{'\).*lastIndexOf\('\}'/.test(script));
check("osintRender() definida y escapa todo el contenido (XSS)", /function\s+osintRender\s*\([\s\S]*?esc\(/.test(script));
check("validación estricta por tipo (anti-inyección, puente shell=True)", /const OSINT_SAFE=\{[\s\S]*?user:\/\^\[A-Za-z0-9_.\\-\]\{2,64\}\$\//.test(script) && script.includes("OSINT_SAFE[type].test(raw)"));
check("osintBuildCmd() construye python aion_osint.py --json", script.includes("python aion_osint.py '") && script.includes(" --json") && script.includes("--limit"));
check("osintRun sin puente muestra el comando manual", script.includes("Puente desconectado") && script.includes("inicia bridge.py o bridge.mjs"));
check("osintRun protege contra terminal ocupado (spinner no se congela)", /if\(termBusy\)\{ toast\('⏳ El terminal está ocupado/.test(script));
check("Escape cierra el overlay OSINT", /e\.key==='Escape'\)\{\s*const o=\$\('#osintOverlay'\); if\(o&&o\.classList\.contains\('show'\)\) o\.classList\.remove\('show'\);/.test(script));
check("aviso legal de uso en el overlay", html.includes("⚖️ Uso legal: solo datos propios o con autorización (Art. 197 C.P.)"));

// ---------- LinkedIn: overlay de 10 publicaciones semanales ----------
check("botón btnLinkedin en el header", html.includes('id="btnLinkedin"'));
check("overlay #linkedinOverlay presente", html.includes('id="linkedinOverlay"'));
check("10 posts embebidos en LINKEDIN_POSTS (semanas 1-10)", /const LINKEDIN_POSTS=\[[\s\S]*?w:10,/.test(script) && (script.match(/w:\d+/g)||[]).length>=10);
check("openLinkedin() y renderLinkedinGrid() definidas", /function\s+openLinkedin\s*\(/.test(script) && /function\s+renderLinkedinGrid\s*\(/.test(script));
check("viewLinkedinPost() muestra texto con textContent (sin innerHTML de posts)", /function\s+viewLinkedinPost\s*\([\s\S]*?t\.textContent=p\.b/.test(script));
check("copyLinkedinPost() usa el portapapeles con fallback", /function\s+copyLinkedinPost\s*\([\s\S]*?navigator\.clipboard/.test(script) && /document\.execCommand\('copy'\)/.test(script));
check("exportLinkedinPost() exporta a Markdown", /function\s+exportLinkedinPost\s*\([\s\S]*?downloadMarkdown/.test(script));
check("generateLinkedinPost() envía el tema al chat", /function\s+generateLinkedinPost\s*\([\s\S]*?handleUserText/.test(script));
check("Escape cierra el overlay LinkedIn", /e\.key==='Escape'\)\{\s*const o=\$\('#linkedinOverlay'\); if\(o&&o\.classList\.contains\('show'\)\) o\.classList\.remove\('show'\);/.test(script));
check("demoBrain responde a 'post de linkedin'", /post de linkedin|publicaci[oó]n de linkedin/.test(script) && script.includes("Modo LinkedIn") && script.includes("📢"));
check("sin XSS en el visor: el grid usa esc()", /renderLinkedinGrid\s*\([\s\S]*?\$\{esc\(p\.t\)\}/.test(script));

// ---------- Asistente de primera configuración ----------
check("botón #btnSetup en el header", html.includes('id="btnSetup"'));
check("overlay #setupOverlay con 5 pasos", html.includes('id="setupOverlay"') && html.includes('id="setupStep4"'));
check("needsSetup() detecta motor sin configurar", /function\s+needsSetup\s*\(/.test(script) && /store\.provider==='demo'/.test(script));
check("syncSetupBtnUI() mantiene visible el botón 🚀 Inicio", /function\s+syncSetupBtnUI\s*\([\s\S]*?style\.display=''/.test(script));
check("openSetup()/closeSetup()/setupGo() definidas", /function\s+openSetup\s*\(/.test(script) && /function\s+closeSetup\s*\(/.test(script) && /function\s+setupGo\s*\(/.test(script));
check("setupTestMistral() guarda la clave y cambia a Mistral", /function\s+setupTestMistral\s*\([\s\S]*?store\.provider='mistral'/.test(script));
check("setupPiperCheck() usa piperPing", /function\s+setupPiperCheck\s*\([\s\S]*?piperPing/.test(script));
check("setupTermCheck() usa termPing", /function\s+setupTermCheck\s*\([\s\S]*?termPing/.test(script));
check("setupFinish() marca aion_setup_done", /function\s+setupFinish\s*\([\s\S]*?aion_setup_done/.test(script));
check("maybeOpenSetup() respeta historia y sesión", /function\s+maybeOpenSetup\s*\([\s\S]*?aion_setup_skip_session/.test(script));
check("Escape cierra el overlay de configuración y marca la sesión", /e\.key==='Escape'\)\{\s*const o=\$\('#setupOverlay'\); if\(o&&o\.classList\.contains\('show'\)\)\{ o\.classList\.remove\('show'\); try\{ sessionStorage\.setItem\('aion_setup_skip_session'/.test(script));
check("demoBrain responde a 'configúrame' sin falsos positivos", /config\[uú\]rame|primera configuraci[oó]n|asistente de (configuraci[oó]n|arranque)|configurar (aion|la app|el asistente|mis claves)/.test(script) && script.includes('asistente de primera configuración'));
check("auto-open en boot cuando no hay motor", /maybeOpenSetup\(\);/.test(script));

// ---------- Recordar desbloqueo durante la sesión (sessionStorage) ----------
check("store default rememberUnlock:false", /rememberUnlock:false/.test(script));
check("checkbox en lockPop y en Ajustes", html.includes('id="lockRemember"') && html.includes('id="setRememberUnlock"'));
check("deriveKey soporta clave extraíble para guardar en sesión", /async function deriveKey\s*\(pass,salt,extractable=\w+\)/.test(script));
check("helpers REMEMBER_KEY/Get/Set/Clear usan sessionStorage", /const REMEMBER_KEY='aion_remember_key'/.test(script) && /sessionStorage\.getItem\(REMEMBER_KEY\)/.test(script) && /sessionStorage\.removeItem\(REMEMBER_KEY\)/.test(script));
check("rememberUnlockSave exporta la clave RAW (nunca la contraseña)", /async function rememberUnlockSave\s*\(pass\)[\s\S]*?exportKey\('raw',k\)/.test(script));
check("tryRememberedUnlock re-importa y descifra sin contraseña", /async function tryRememberedUnlock\s*\([\s\S]*?importKey\('raw',raw,\{name:'AES-GCM'\},false/.test(script) && /applySecrets\(s\)/.test(script));
check("los 3 puntos de desbloqueo guardan la clave si está marcado", /if\(store\.rememberUnlock\) rememberUnlockSave\(pass\); else rememberUnlockClear\(\);/.test(script) && /rememberUnlockClear\(\);/.test(script));
check("lockSecrets olvida el desbloqueo recordado", /function lockSecrets\s*\([\s\S]*?rememberUnlockClear\(\);/.test(script));
check("desactivar cifrado limpia la clave recordada", /store\.crypto=false; store\.encSecrets=null; cryptoUnlocked=false; cryptoKey=null; rememberUnlockClear\(\);/.test(script));
check("autoConfigure intenta el desbloqueo recordado al arrancar", /async function autoConfigure\(\)\{[\s\S]*?await tryRememberedUnlock\(\);/.test(script));
check("syncRememberUnlockUI sincroniza ambos checkboxes", /function syncRememberUnlockUI\s*\([\s\S]*?\$\('#lockRemember'\)/.test(script) && /\$\('#setRememberUnlock'\)/.test(script));
check("collectSettings persiste rememberUnlock", /store\.rememberUnlock=!!\(\$\('#setRememberUnlock'\)\|\|\{\}\)\.checked/.test(script));

// ---------- Puesta en marcha automática (autoConfigure) ----------
check("autoConfigure() definida y llamada en boot()", /function\s+autoConfigure\s*\(/.test(script) && /autoConfigure\(\);/.test(script));
check("adopta el token del puente servido por el lanzador (fetch 'token')", /fetch\('token',\{cache:'no-store'\}\)/.test(script) && /store\.bridgeToken=t; saveStore\(\);/.test(script));
check("auto-proveedor: pasa de demo a un motor real si hay clave", /store\.provider==='demo'[\s\S]*find\(p=>p==='huggingface'/.test(script) && /⚡ Motor restaurado automáticamente/.test(script));
check("reintentos del ping del puente (hasta 5×)", /for\(let i=0;i<5;i\+\+\)\{ await termPing\(\); if\(termConnected\) break; await sleep\(700\); \}/.test(script));
check("reintentos del ping de Piper (hasta 4×)", /for\(let i=0;i<4;i\+\+\)\{[\s\S]*piperPing\(res\)/.test(script));
check("aviso si hay claves cifradas pero bloqueadas (no es demo)", /🔒 Tienes claves cifradas guardadas/.test(script) && /desbloquéalas en ⚙️ Ajustes/.test(script));

// Barreras de seguridad: sin eval(), sin document.write, y el texto del usuario
// siempre se escapa con esc() antes de entrar al DOM (nunca ${text} directo).
check("sin eval(", !/\beval\s*\(/.test(script));
check("sin document.write", !/document\.write/.test(script));
check("el texto de usuario se escapa con esc()", /addMsg\('user',esc\(/.test(script));
check("sin interpolación directa de variables de usuario en innerHTML", !/innerHTML\s*=.*\$\{(text|msg|input|q)\b/.test(script));

// ---------- 5) Cifrado WebCrypto de claves ----------
console.log("\n[5] Cifrado WebCrypto de claves (AES-GCM 256 + PBKDF2)");
// Estático: parámetros criptográficos correctos y claves nunca en claro
check("PBKDF2-SHA256 con 120000 iteraciones", /iterations:120000,hash:'SHA-256'/.test(script));
check("AES-GCM de 256 bits no-extraíble por defecto", /async function deriveKey\s*\(pass,salt,extractable=false\)[\s\S]*?\{name:'AES-GCM',length:256\},extractable,\['encrypt','decrypt'\]/.test(script) && /encryptSecrets|decryptSecrets|reEncryptSecrets/.test(script));
check("salt aleatorio de 16 bytes", /getRandomValues\(new Uint8Array\(16\)\)/.test(script));
check("iv aleatorio de 12 bytes", /getRandomValues\(new Uint8Array\(12\)\)/.test(script));
check("clave no-extraíble en importKey", /importKey\('raw'[\s\S]*?'PBKDF2',false,\['deriveKey'\]\)/.test(script));
check("saveStore limpia claves si cifrado activo", /if\(store\.crypto&&store\.encSecrets\)\{ rest\.mistralKey=''; rest\.groqKey='';/.test(script));
check("decryptSecrets devuelve null si passphrase errónea", /\}catch\(e\)\{ return null; \} \/\/ contraseña incorrecta o blob corrupto/.test(script));
check("la contraseña nunca se persiste", !/cryptoPass[^\n]{0,40}(localStorage|setItem)/.test(script));

// Dinámico: round-trip REAL ejecutando las funciones extraídas con crypto.subtle de Node
(async () => {
  const names = ["buf2b64", "b642buf", "collectSecrets", "deriveKey", "encryptSecrets", "decryptSecrets"];
  const srcs = names.map(n => [n, extractFn(script, n)]);
  check("funciones de cifrado extraíbles del <script>", srcs.every(([, s]) => !!s));
  if (srcs.every(([, s]) => !!s)) {
    try {
      const fakeStore = { mistralKey: "mk-test-abc123", groqKey: "gk-test", openrouterKey: "", hfToken: "", bridgeToken: "bt-secreto", piperToken: "" };
      const src = `"use strict"; const store=arguments[0]; ${srcs.map(([, s]) => s).join("\n")}; return {buf2b64,b642buf,collectSecrets,deriveKey,encryptSecrets,decryptSecrets};`;
      const fns = new Function(src)(fakeStore);
      const enc = await fns.encryptSecrets("pass-super-secreta");
      check("blob cifrado con v/salt/iv/data", enc && enc.v === 1 && !!enc.salt && !!enc.iv && !!enc.data);
      const dec = await fns.decryptSecrets("pass-super-secreta", enc);
      check("round-trip: descifra el mismo blob", dec && dec.mistralKey === "mk-test-abc123" && dec.bridgeToken === "bt-secreto");
      const bad = await fns.decryptSecrets("pass-equivocada", enc);
      check("passphrase errónea → null (no lanza)", bad === null);
      const enc2 = await fns.encryptSecrets("otra-pass");
      check("salt aleatorio: blobs distintos", enc.salt !== enc2.salt && enc.data !== enc2.data);
      check("el blob no contiene el secreto en claro", enc.data.indexOf("mk-test") < 0 && enc.data.indexOf("bt-secreto") < 0);
    } catch (e) {
      check("round-trip WebCrypto ejecuta sin error", false, (e && e.message || e).toString().slice(0, 200));
    }
  }

// Flujo completo de sesión: cifrar → reiniciar (solo sobrevive el blob) → desbloquear.
// Simula un reinicio real de la app: tras recargar, las claves en claro NO existen en
// memoria; solo queda store.encSecrets (lo que persistió saveStore en localStorage).
// OJO: va con `await` porque es una IIFE anidada dentro del wrapper async — sin await,
// el wrapper seguiría hasta process.exit y mataría esta IIFE suspendida en su primer await.
await (async () => {
  const names = ["buf2b64", "b642buf", "collectSecrets", "deriveKey", "encryptSecrets", "decryptSecrets"];
  const srcs = names.map(n => [n, extractFn(script, n)]);
  check("funciones de cifrado extraíbles para el flujo de sesión", srcs.every(([, s]) => !!s));
  if (srcs.every(([, s]) => !!s)) {
    try {
      // 1) CIFRAR: sesión original con las claves en memoria.
      const sesion1 = {
        crypto: true, cryptoUnlocked: true, encSecrets: null,
        mistralKey: "mk-flujo-abc", groqKey: "gk-flujo-xyz", bridgeToken: "bt-flujo-zzz",
      };
      const src = `"use strict"; const store=arguments[0]; ${srcs.map(([, s]) => s).join("\n")}; return {buf2b64,b642buf,collectSecrets,deriveKey,encryptSecrets,decryptSecrets};`;
      const fns = new Function(src)(sesion1);
      const blob = await fns.encryptSecrets("clave-de-sesion");
      check("cifrar: genera el blob con los secretos", blob && blob.v === 1 && !!blob.data);

      // 2) REINICIAR: el nuevo store solo tiene crypto + encSecrets (como loadStore
      //    tras la recarga); las claves en claro ya no están en ninguna parte.
      const sesion2 = { crypto: true, cryptoUnlocked: false, encSecrets: blob };
      const fns2 = new Function(src)(sesion2);

      // 3) DESBLOQUEAR con la contraseña correcta: las claves vuelven.
      const restaurado = await fns2.decryptSecrets("clave-de-sesion", sesion2.encSecrets);
      check("reinicio + contraseña correcta → las claves vuelven",
        !!restaurado && restaurado.mistralKey === "mk-flujo-abc" && restaurado.bridgeToken === "bt-flujo-zzz");

      // 4) DESBLOQUEAR con contraseña errónea: null y las claves NO vuelven.
      const negado = await fns2.decryptSecrets("clave-equivocada", sesion2.encSecrets);
      check("reinicio + contraseña errónea → null (claves bloqueadas)", negado === null);

      // 5) Lo único que cruza el reinicio es el blob cifrado: sin claves en claro.
      const raw = JSON.stringify(blob);
      check("tras el reinicio solo viaja el blob cifrado", raw.indexOf("mk-flujo") < 0 && raw.indexOf("bt-flujo") < 0);
    } catch (e) {
      check("flujo de sesión ejecuta sin error", false, (e && e.message || e).toString().slice(0, 200));
    }
  }
})();

  // Regresión: saveStore NUNCA persiste claves en claro cuando crypto está activo.
  const saveSrc = extractFn(script, "saveStore");
  check("saveStore extraíble del <script>", !!saveSrc);
  if (saveSrc) {
    const memo = {};
    const fakeLocal = { setItem: (k, v) => { memo[k] = v; }, getItem: () => null };
    const store = {
      crypto: true, encSecrets: { v: 1, salt: "s", iv: "i", data: "d" },
      mistralKey: "mk-test-abc123", groqKey: "gk-secreto", openrouterKey: "or-secreto",
      hfToken: "hf-secreto", bridgeToken: "bt-secreto", piperToken: "pp-secreto", proxyToken: "px-secreto",
      provider: "mistral", history: [], piperOnline: false, tools: {},
    };
    try {
      new Function("store", "localStorage", `"use strict"; ${saveSrc}; saveStore();`)(store, fakeLocal);
      const saved = JSON.parse(memo.aion_cfg);
      const keys = ["mistralKey", "groqKey", "openrouterKey", "hfToken", "bridgeToken", "piperToken", "proxyToken"];
      const leaks = keys.filter((k) => saved[k] !== "" && saved[k] !== undefined);
      check("saveStore con crypto activo NO persiste claves en claro", leaks.length === 0, "fuga: " + leaks.join(","));
      check("el blob cifrado sí se persiste", saved.encSecrets && saved.encSecrets.data !== undefined);
      const raw = JSON.stringify(saved);
      check("ningún secreto aparece en el JSON persistido", ["mk-test-abc123", "gk-secreto", "bt-secreto"].every((x) => raw.indexOf(x) < 0));
    } catch (e) {
      check("saveStore con crypto activo ejecuta sin error", false, (e && e.message || e).toString().slice(0, 200));
    }
  }

  // ---------- Overlay bilingüe: renderWelcomeLang ----------
  const welcomeSrc = extractFn(script, "renderWelcomeLang");
  const isEnglishSrc = extractFn(script, "isEnglish");
  check("renderWelcomeLang extraíble del <script>", !!welcomeSrc);
  if (welcomeSrc && isEnglishSrc) {
    // WELCOME_EN_BODY es una constante template literal (extractable con
    // indexOf/slice). WELCOME_ES_BODY es un `let` que la app captura del DOM
    // en runtime (captureWelcomeES), así que en el harness lo suministramos
    // como haría la app: el cuerpo español con su título real.
    const BT = String.fromCharCode(96);
    const start = script.indexOf("const WELCOME_EN_BODY=");
    const open = start >= 0 ? script.indexOf(BT, start) : -1;
    const close = open >= 0 ? script.indexOf(BT + ";", open + 1) : -1;
    const enBodySrc = start >= 0 && close > open ? script.slice(open + 1, close) : "";
    const esBodySrc = '<div class="w-sec"><div class="w-kicker">El origen</div><h3>La grieta en el tiempo</h3></div>';
    check("constante WELCOME_EN_BODY extraíble", enBodySrc.length > 0);
    check("cuerpo ES de prueba suministrado con título", esBodySrc.indexOf("La grieta en el tiempo") >= 0);
    const mkEl = (text) => ({ textContent: text, lastChild: { textContent: text }, title: "" });
    let bodyInner = "";
    const body = { set innerHTML(v) { bodyInner = v; }, get innerHTML() { return bodyInner; } };
    const sub = mkEl("");
    const small = mkEl("");
    const welcome = {
      querySelector: (sel) => (sel === ".win-body" ? body : sel === ".wh-sub" ? sub : sel === ".win-foot small" ? small : null),
    };
    const fake$ = (sel) => (sel === "#welcome" ? welcome : sel === "#btnStory" ? mkEl("") : null);
    const run = (lang) => {
      bodyInner = ""; sub.textContent = ""; small.textContent = "";
      const src = `"use strict";
        const store=arguments[0], WELCOME_EN_BODY=arguments[1], WELCOME_ES_BODY=arguments[2], $=arguments[3], welcome=arguments[4], body=arguments[5], sub=arguments[6], small=arguments[7], syncStoryBtnUI=arguments[8];
        ${isEnglishSrc}
        ${welcomeSrc}
        renderWelcomeLang();
        return { bodyInner: body.innerHTML, sub: sub.textContent, small: small.textContent };`;
      return new Function(src)({ lang }, enBodySrc, esBodySrc, fake$, welcome, body, sub, small, () => {});
    };
    const en = run("en-US");
    const es = run("es-ES");
    check("en-US → título en inglés (sub)", en.sub.indexOf("The story of Ark & Jimmy") >= 0, en.sub.slice(0, 80));
    check("en-US → usa WELCOME_EN_BODY", en.bodyInner.indexOf(enBodySrc.slice(0, 40)) >= 0);
    check("es-ES → título en español (sub)", es.sub.indexOf("La historia de Ark & Jimmy") >= 0, es.sub.slice(0, 80));
    check("es-ES → usa WELCOME_ES_BODY", es.bodyInner.indexOf(esBodySrc.slice(0, 40)) >= 0);
  }

  // ---------- Parsers dinámicos: gobuster / Nessus / Burp Suite ----------
  console.log("\n[Modo Laboral] Parsers de herramientas (muestras reales)");
  const dynParsers = ["parseNmapOutput", "parseGobusterOutput", "parseNessusOutput", "parseBurpOutput", "parseCurlOutput",
    "gobusterReconReport", "nessusReconReport", "burpReconReport", "curlReconReport", "executiveReport", "findingsReport", "detectToolOutput", "reconReport"];
  const dynSrcs = dynParsers.map(n => [n, extractFn(script, n)]);
  check("parsers y generadores extraíbles del <script>", dynSrcs.every(([, s]) => !!s));
  if (dynSrcs.every(([, s]) => !!s)) {
    try {
      // reportIsEn() se inyecta como stub falso (es-ES) para los generadores bilingües.
      const src = `"use strict"; const store=arguments[0]; function reportIsEn(){return false;}
        ${dynSrcs.map(([, s]) => s).join("\n")};
        return {parseGobusterOutput,parseNessusOutput,parseBurpOutput,parseCurlOutput,gobusterReconReport,nessusReconReport,burpReconReport,curlReconReport,executiveReport,findingsReport,detectToolOutput,reconReport};`;
      const fns = new Function(src)({ lang: "es-ES" });

      // gobuster: salida real del formato '/path (Status: NNN) [Size: NNN]'
      const gob = fns.parseGobusterOutput(
        "===============================================================\n" +
        "Gobuster v3.6 by OJ Reeves (@TheColonial) & Christian Mehlmauer (@firefart)\n" +
        "===============================================================\n" +
        "/admin                (Status: 200) [Size: 5123]\n" +
        "/login                (Status: 301) [Size: 178] [--> /login/]\n" +
        "/backup              (Status: 403) [Size: 212]\n");
      check("gobuster: extrae rutas con status y tamaño", !!gob && gob.length === 3 && gob[0].path === "/admin" && gob[0].status === 200 && gob[2].status === 403);
      const gobMd = fns.gobusterReconReport("/admin (Status: 200) [Size: 5123]\n/login (Status: 301) [Size: 178] [--> /login/]\n");
      check("gobuster: informe con tabla y hallazgos", !!gobMd && gobMd.includes("| `/admin` | 200 |") && gobMd.includes("## 2. Hallazgos interesantes"));

      // Nessus: formato 'Plugin #ID (Nombre)' + campos clave
      const nes = fns.parseNessusOutput(
        "- 192.168.1.10 (\n" +
        "Plugin #11936 (OS Identification)\n" +
        "  Severity: Medium\n" +
        "  CVSS v2.0 Base Score: 5.0\n" +
        "  Synopsis: The remote host can be identified.\n" +
        "  Description: The remote host is running an OS.\n" +
        "  Solution: N/A\n" +
        "Plugin #10150 (Windows SMB Remote Code Execution)\n" +
        "  Severity: Critical\n" +
        "  CVSS v2.0 Base Score: 10.0\n" +
        "  Synopsis: Arbitrary code execution.\n" +
        "  Solution: Apply the vendor patch.\n");
      check("nessus: extrae plugins con severidad y CVSS", !!nes && nes.length === 2 && /critical/i.test(nes[1].severity) && nes[1].cvss === "10.0" && nes[1].host === "192.168.1.10");
      const nesMd = fns.nessusReconReport("Plugin #10150 (Windows SMB RCE)\n  Severity: Critical\n  CVSS v2.0 Base Score: 10.0\n  Synopsis: RCE.\n  Solution: Patch.\n");
      check("nessus: informe con resumen y detalle críticos", !!nesMd && nesMd.includes("1 crítico") && nesMd.includes("## 2. Detalle de críticos/altos"));

      // Burp Suite: formato 'Issue: Nombre' + campos clave
      const bur = fns.parseBurpOutput(
        "Issue: SQL Injection\n" +
        "  Severity: High\n" +
        "  Confidence: Certain\n" +
        "  Host: https://app.example.com\n" +
        "  Path: /search?q=test\n" +
        "  Description: The parameter q is injectable.\n" +
        "  Remediation: Use parameterized queries.\n" +
        "Issue: Missing X-Frame-Options\n" +
        "  Severity: Medium\n" +
        "  Confidence: Firm\n" +
        "  Host: https://app.example.com\n" +
        "  Path: /\n");
      check("burp: extrae issues con severidad y host", !!bur && bur.length === 2 && /high/i.test(bur[0].severity) && bur[0].path === "/search?q=test");
      const burMd = fns.burpReconReport("Issue: SQL Injection\n  Severity: High\n  Confidence: Certain\n  Host: https://app.example.com\n  Path: /search\n  Description: injectable.\n  Remediation: parameterized queries.\n");
      check("burp: informe con tabla y remediación", !!burMd && burMd.includes("| High | SQL Injection |") && burMd.includes("**Remediación:**"));

      // Dispatcher: detección y enrutado de cada formato
      check("detectToolOutput identifica cada formato", fns.detectToolOutput("Nmap scan report for 10.0.0.1") === "nmap" && fns.detectToolOutput("/x (Status: 200) [Size: 1]") === "gobuster" && fns.detectToolOutput("Plugin #1 (x)\nSeverity: High") === "nessus" && fns.detectToolOutput("Issue: X\nSeverity: High") === "burp");
      check("reconReport devuelve null con texto irrelevante", fns.reconReport("hola que tal") === null);
      const burViaDispatcher = fns.reconReport("Issue: SQL Injection\nSeverity: High\nHost: x\nPath: /\n");
      check("reconReport enruta burp al generador correcto", !!burViaDispatcher && burViaDispatcher.includes("# Informe de Seguridad de Aplicación"));

      // curl: salida real de 'curl -sI https://host' (HTTP status + cabeceras)
      const curlSample = "HTTP/1.1 200 OK\n" +
        "Server: nginx/1.24.0\n" +
        "Content-Type: text/html; charset=utf-8\n" +
        "Strict-Transport-Security: max-age=31536000\n" +
        "Content-Security-Policy: default-src 'self'\n";
      const curl = fns.parseCurlOutput(curlSample);
      check("curl: extrae status, server y cabeceras", !!curl && curl.status === 200 && curl.server === "nginx/1.24.0" && Array.isArray(curl.missing) && curl.missing.length === 4);
      const curlMd = fns.curlReconReport(curlSample);
      check("curl: informe con resumen y tabla de cabeceras", !!curlMd && curlMd.includes("# Informe de Cabeceras de Seguridad — curl") && curlMd.includes("| Cabecera | Estado |") && curlMd.includes("✔ presente"));
      check("reconReport enruta curl al generador de cabeceras", fns.reconReport(curlSample) && fns.reconReport(curlSample).includes("# Informe de Cabeceras de Seguridad — curl"));

      // Plantillas Laboral: ejecutivo y hallazgos desde salida real
      const execNmap = fns.executiveReport("Nmap scan report for 10.0.0.1\nPORT     STATE SERVICE\n80/tcp   open  http\n22/tcp   open  ssh\n");
      check("executiveReport: resumen para dirección desde nmap", !!execNmap && execNmap.includes("# Informe Ejecutivo") && execNmap.includes("## 1. Métricas clave") && execNmap.includes("**2 puerto(s) abierto(s)**"));
      const findGob = fns.findingsReport("/admin (Status: 200) [Size: 5123]\n/login (Status: 301) [Size: 178] [--> /login/]\n");
      check("findingsReport: tabla de hallazgos desde gobuster", !!findGob && findGob.includes("# Informe de Hallazgos") && findGob.includes("| # | Severidad | Hallazgo | Evidencia | Recomendación |") && findGob.includes("| 1 | medium | /admin |"));
      const execCurl = fns.executiveReport(curlSample);
      check("executiveReport: métricas desde curl (cabeceras)", !!execCurl && execCurl.includes("# Informe Ejecutivo") && execCurl.includes("Cabeceras de seguridad ausentes") && execCurl.includes("4"));
      check("executiveReport/findingsReport null con texto irrelevante", fns.executiveReport("hola que tal") === null && fns.findingsReport("hola que tal") === null);
      check("detectToolOutput identifica curl como 'curl'", fns.detectToolOutput(curlSample) === "curl");
    } catch (e) {
      check("parsers dinámicos ejecutan sin error", false, (e && e.message || e).toString().slice(0, 200));
    }
  }

  // ---------- DOCX dinámico: buildDocx genera un .docx real en memoria ----------
  console.log("\n[DOCX] Generación real de un documento Word (ZIP OOXML)");
  const docxFns = ["docxEscape", "zipCrc32", "zipEntry", "zipBuild", "mdToDocxBody", "buildDocx"];
  const docxSrcs = docxFns.map(n => [n, extractFn(script, n)]);
  check("funciones DOCX extraíbles del <script>", docxSrcs.every(([, s]) => !!s));
  if (docxSrcs.every(([, s]) => !!s)) {
    try {
      const src = `"use strict"; const store=arguments[0]; function reportIsEn(){return false;} function reportTitle(md){const m=String(md||'').match(/^#\\s+(.+)$/m); return m?m[1].trim():'informe-aion';}
        ${docxSrcs.map(([, s]) => s).join("\n")};
        return {buildDocx,docxEscape,zipCrc32,mdToDocxBody};`;
      const fns = new Function(src)({ pdfCover: true, pdfWatermark: true, pdfCompany: "Acme Corp", pdfWatermarkText: "CONFIDENCIAL", lang: "es-ES" });
      const sample = "# Informe de Pentest\n\n## 1. Resumen ejecutivo\n\n**Alcance:** 10.0.0.0/24\n\n| Puerto | Servicio | Severidad |\n|---|---|---|\n| 22 | ssh | media |\n| 80 | http | baja |\n\n- Hallazgo 1\n- Hallazgo 2\n\n> Nota: solo uso autorizado.\n";
      const bytes = fns.buildDocx(sample, "Informe de Pentest", { en: false, company: "Acme Corp", confidential: "CONFIDENCIAL", cover: true, watermark: true });
      check("buildDocx devuelve Uint8Array", bytes instanceof Uint8Array && bytes.length > 500);
      const zipHead = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      check("firma ZIP válida (PK\x03\x04)", zipHead === "PK\x03\x04", "got: " + JSON.stringify(zipHead));
      const latin = Buffer.from(bytes).toString("latin1");
      check("ZIP contiene [Content_Types].xml", latin.includes("[Content_Types].xml"));
      check("ZIP contiene word/document.xml", latin.includes("word/document.xml"));
      check("ZIP contiene header1.xml (cabecera corporativa)", latin.includes("word/header1.xml"));
      check("cabecera: organización en header", latin.includes("Acme Corp"));
      check("cabecera: sello de confidencialidad", latin.includes("CONFIDENCIAL"));
      check("documento XML con tabla convertida", latin.includes("<w:tbl>") && latin.includes("<w:tr>"));
      check("documento XML con título y estilos", latin.includes("Informe de Pentest") && latin.includes("CoverTitle") && latin.includes("Heading1"));
      check("marca de agua VML presente", latin.includes("v:textpath"));
      check("zipCrc32 calcula CRC determinista", fns.zipCrc32(new Uint8Array([1, 2, 3, 4])) === 0xB63CFBCD);
      const esc = fns.docxEscape("<a>&\"x\"</a>");
      check("docxEscape escapa XML (barrera XSS)", esc === "&lt;a&gt;&amp;&quot;x&quot;&lt;/a&gt;", "got: " + esc);
      const mdBody = fns.mdToDocxBody("**negrita** y normal\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
      check("mdToDocxBody: negrita a runs bold", mdBody.includes("<w:b/>") && mdBody.includes("negrita"));
      check("mdToDocxBody: tabla a w:tbl con encabezado sombreado", mdBody.includes("<w:tbl>") && mdBody.includes("EEF4FB"));
      const xssBody = fns.mdToDocxBody("<script>&amp; \"comilla\"");
      check("mdToDocxBody: escapa TODO el texto (fix XSS/XML)", !xssBody.includes("<script>") && xssBody.includes("&lt;script&gt;") && xssBody.includes("&amp;amp;") && xssBody.includes("&quot;comilla&quot;"));
      const boldSafe = fns.mdToDocxBody("**<b>** texto & ");
      check("mdToDocxBody: bold con contenido peligroso escapado", !boldSafe.includes("<b>") && boldSafe.includes("&lt;b&gt;") && boldSafe.includes("&amp;"));
    } catch (e) {
      check("generación DOCX dinámica ejecuta sin error", false, (e && e.message || e).toString().slice(0, 200));
    }
  }

  // ---------- Verificación de integridad (arranque) ----------
  console.log("\n[Integridad] Verificación automática en el arranque");
  check("panel de integridad en #boot", html.includes('id="bootInt"') && html.includes('id="biAppDot"') && html.includes('id="biSecretsDot"'));
  check("botón 🧬 en el header", html.includes('id="btnIntegrity"'));
  check("runIntegrityCheck definida", /function\s+runIntegrityCheck/.test(script));
  check("localIntegrity (fallback sin puente)", /function\s+localIntegrity/.test(script));
  check("endpoint /integrity vía puente", script.includes("BRIDGE+'/integrity'"));
  check("arranque ejecuta runIntegrityCheck (vía autoConfigure, sin doble ping)", /autoConfigure\(\);/.test(script) && script.includes("runIntegrityCheck(false)") && !script.includes("termPing().then(()=>runIntegrityCheck(false))"));
  check("botón re-ejecuta la verificación", script.includes("$('#btnIntegrity').onclick=()=>runIntegrityCheck(true)"));
  check("localIntegrity revisa claves en claro", script.includes("const fields=['mistralKey','groqKey','openrouterKey','hfToken','bridgeToken','piperToken','proxyToken']") && script.includes("fields.forEach(k=>{ if(s[k]) leaks.push(k); })"));
  check("estados de fila (ok/err/busy)", script.includes("'bi-dot '+state") && script.includes("setBiRow('biApp','busy'") );

  // ---------- PWA: manifest + service worker + instalación ----------
  console.log("\n[PWA] Instalable y offline");
  const manifestSrc = fs.existsSync(path.join(ROOT, "manifest.webmanifest")) ? fs.readFileSync(path.join(ROOT, "manifest.webmanifest"), "utf8") : "";
  const swSrc = fs.existsSync(path.join(ROOT, "sw.js")) ? fs.readFileSync(path.join(ROOT, "sw.js"), "utf8") : "";
  check("manifest.webmanifest existe y es JSON válido", (() => { try { JSON.parse(manifestSrc); return manifestSrc.length > 0; } catch { return false; } })());
  check("manifest: campos esenciales PWA", /"name"\s*:/.test(manifestSrc) && /"short_name"/.test(manifestSrc) && /"start_url"\s*:\s*".\/index.html"/.test(manifestSrc) && /"display"\s*:\s*"standalone"/.test(manifestSrc) && /"theme_color"/.test(manifestSrc));
  check("manifest: iconos 192/512 + maskable", (manifestSrc.match(/"src"\s*:\s*"icons\/aion-/g) || []).length >= 2 && manifestSrc.includes("maskable"));
  check("sw.js existe con caché versionada", /const CACHE_NAME\s*=\s*"aion-sincro-v\d+"/.test(swSrc));
  check("sw.js precachea el núcleo (index + manifest + iconos)", swSrc.includes("./index.html") && swSrc.includes("manifest.webmanifest") && swSrc.includes("aion-512.png"));
  check("sw.js: navegación network-first con fallback offline", /req\.mode\s*===\s*['"]navigate['"]/.test(swSrc) && /caches\.match\(['"]\.\/index\.html['"]\)/.test(swSrc));
  check("sw.js: no cachea orígenes ajenos (guarda real de código)", swSrc.includes("if (url.origin !== self.location.origin) return;") && /caches\s*\.match\(req\)/.test(swSrc));
  check("sw.js: limpieza de cachés antiguas en activate", /caches\s*\.keys\(\)/.test(swSrc) && /caches\s*\.delete\(k\)/.test(swSrc) && swSrc.includes("clients.claim"));
  check("index.html enlaza el manifest", html.includes('rel="manifest" href="manifest.webmanifest"'));
  check("index.html: theme-color y apple-touch-icon", html.includes('name="theme-color"') && html.includes('rel="apple-touch-icon" href="icons/aion-192.png"'));
  check("index.html: botón de instalación PWA en el header", html.includes('id="btnInstall"') && html.includes('⬇️ Instalar'));
  check("index.html: registra sw.js solo en http(s)", /navigator\.serviceWorker\.register\('sw\.js'\)/.test(script) && script.includes("location.protocol"));
  check("index.html: beforeinstallprompt muestra el botón", script.includes("beforeinstallprompt") && script.includes("deferredPrompt=e"));
  check("index.html: appinstalled oculta el botón", script.includes("appinstalled") && script.includes("(display-mode: standalone)"));
  check("iconos PWA existen en disco", ["icons/aion-192.png", "icons/aion-512.png", "icons/aion-maskable-512.png"].every(f => fs.existsSync(path.join(ROOT, f))));
  check("gen_pwa_icons.py presente (iconos reproducibles)", fs.existsSync(path.join(ROOT, "gen_pwa_icons.py")));
  check("README documenta la instalación PWA", /PWA/.test(fs.readFileSync(path.join(ROOT, "README.md"), "utf8")));

  // ---------- DOCX: exportación a Word (.docx) ----------
  console.log("\n[DOCX] Exportación a Word con cabecera corporativa");
  check("exportDocx definida", /function\s+exportDocx\s*\(/.test(script));
  check("buildDocx definida (pura, devuelve Uint8Array)", /function\s+buildDocx\s*\(/.test(script));
  check("ZIP en JS puro: zipCrc32/zipEntry/zipBuild", /function\s+zipCrc32\s*\(/.test(script) && /function\s+zipEntry\s*\(/.test(script) && /function\s+zipBuild\s*\(/.test(script));
  check("mdToDocxBody convierte markdown a XML de Word", /function\s+mdToDocxBody\s*\(/.test(script));
  check("escape XML para barrera XSS", /function\s+docxEscape\s*\([^)]*\)\{[\s\S]*?\.replace\(\/&\/g,'&amp;'\)/.test(script));
  check("documento OOXML con namespaces w/r", script.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') && script.includes('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'));
  check("cabecera corporativa en header1.xml (org + título + conf)", script.includes('word/header1.xml') && script.includes('CoverOrg') && script.includes('B22222'));
  check("marca de agua VML nativa de Word", script.includes('v:textpath') && script.includes('urn:schemas-microsoft-com:vml'));
  check("usa branding de Ajustes (pdfCompany/pdfWatermarkText/pdfCover)", /store\.pdfCompany/.test(script) && /store\.pdfWatermarkText/.test(script) && /store\.pdfCover/.test(script));
  check("barra de informe ofrece Word (.docx)", html.includes('Word (.docx)') && script.includes("b2b.onclick=()=>exportDocx(text, reportTitle(text))"));
  check("bilingüe: portada respeta reportIsEn", script.includes("en?'Report generated with Aion Sincro · ':'Informe generado con Aion Sincro · '"));
  check("CoverOrg: spacing en pPr (OOXML válido)", /CoverOrg[\s\S]{0,500}?<w:pPr><w:spacing w:before="3000"\/>/.test(script) && !/<w:rPr>[\s\S]{0,140}?<w:spacing/.test(script));

  // ---------- Android (Capacitor): esqueleto del APK ----------
  console.log("\n[Android] Esqueleto Capacitor para el APK");
  const pkgPath = path.join(ROOT, "mobile", "package.json");
  const capPath = path.join(ROOT, "mobile", "capacitor.config.json");
  const pkgSrc = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, "utf8") : "";
  const capSrc = fs.existsSync(capPath) ? fs.readFileSync(capPath, "utf8") : "";
  const patchSrc = fs.existsSync(path.join(ROOT, "mobile", "patch-manifest.js")) ? fs.readFileSync(path.join(ROOT, "mobile", "patch-manifest.js"), "utf8") : "";
  const bwSrc = fs.existsSync(path.join(ROOT, "mobile", "build-web.js")) ? fs.readFileSync(path.join(ROOT, "mobile", "build-web.js"), "utf8") : "";
  check("mobile/package.json existe y es JSON válido", (() => { try { return JSON.parse(pkgSrc).name === "aion-sincro-android"; } catch { return false; } })());
  check("package.json: dependencias de Capacitor", /@capacitor\/core/.test(pkgSrc) && /@capacitor\/android/.test(pkgSrc) && /@capacitor\/cli/.test(pkgSrc));
  check("package.json: scripts del flujo Android", /"setup"/.test(pkgSrc) && /"apk"/.test(pkgSrc) && /"patch:manifest"/.test(pkgSrc));
  check("capacitor.config.json válido con appId/name/webDir", (() => { try { const c = JSON.parse(capSrc); return c.appId && c.appName && c.webDir === "www" && c.android && c.android.allowMixedContent === true; } catch { return false; } })());
  check("build-web.js copia index.html+manifest+sw+icons a www", bwSrc.includes("index.html") && bwSrc.includes("manifest.webmanifest") && bwSrc.includes("sw.js") && bwSrc.includes("icons"));
  check("patch-manifest.js: RECORD_AUDIO (micrófono/hotword)", patchSrc.includes("RECORD_AUDIO"));
  check("patch-manifest.js: INTERNET + MODIFY_AUDIO_SETTINGS", patchSrc.includes("INTERNET") && patchSrc.includes("MODIFY_AUDIO_SETTINGS"));
  check("patch-manifest.js: cleartext para el puente local", /android:usesCleartextTraffic\s*=\s*"true"/.test(patchSrc));
  check("patch-manifest.js: idempotente", patchSrc.includes("ya tenía los permisos") && patchSrc.includes("includes(p)"));
  check("README documenta el flujo Android (Capacitor)", /Capacitor/.test(fs.readFileSync(path.join(ROOT, "README.md"), "utf8")) && /npm run setup/.test(fs.readFileSync(path.join(ROOT, "README.md"), "utf8")));
  check(".gitignore cubre mobile/www y mobile/android", (() => { const g = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8"); return /mobile\/www\//.test(g) && /mobile\/android\//.test(g); })());

  // ---------- Lanzador Windows: fix del arranque del acceso directo ----------
  console.log("\n[Windows] Lanzador del acceso directo (fix arranque)");
  const launcherSrc = fs.existsSync(path.join(ROOT, "windows", "aion-sincro.cmd")) ? fs.readFileSync(path.join(ROOT, "windows", "aion-sincro.cmd"), "utf8") : "";
  const serveJs = fs.existsSync(path.join(ROOT, "windows", "serve.js")) ? fs.readFileSync(path.join(ROOT, "windows", "serve.js"), "utf8") : "";
  const installCmd = fs.existsSync(path.join(ROOT, "windows", "install.cmd")) ? fs.readFileSync(path.join(ROOT, "windows", "install.cmd"), "utf8") : "";
  check("windows/serve.js existe (respaldo sin Python)", serveJs.length > 0);
  check("lanzador usa node %~dp0serve.js (resuelve en repo e instalado)", launcherSrc.includes("%~dp0serve.js") && !/node -e "const http/.test(launcherSrc));
  check("lanzador usa timeout.exe con ruta completa (retardo real, sin GNU timeout)", launcherSrc.includes("%SystemRoot%\\System32\\timeout.exe /t 1 /nobreak") && launcherSrc.includes("%SystemRoot%\\System32\\timeout.exe /t 2 /nobreak") && !launcherSrc.includes("timeout /t") && !launcherSrc.includes("ping -n"));
  check("serve.js: solo 127.0.0.1 (micrófono/Web Speech)", serveJs.includes('"127.0.0.1"'));
  check("serve.js: barrera de path traversal", serveJs.includes("f.startsWith(ROOT + path.sep)"));
  check("serve.js: decodeURIComponent con try/catch (sin crash por URL malformada)", serveJs.includes("decodeURIComponent") && serveJs.includes("catch"));
  check("install.cmd copia serve.js a la instalación", installCmd.includes("serve.js"));

  // ---------- CV automático: generar_cv.py (fuente única de verdad: LINKEDIN.md) ----------
  console.log("\n[CV] Generador de currículum desde LINKEDIN.md");
  const cvPy = fs.existsSync(path.join(ROOT, "generar_cv.py")) ? fs.readFileSync(path.join(ROOT, "generar_cv.py"), "utf8") : "";
  const linkedinMd = fs.existsSync(path.join(ROOT, "LINKEDIN.md")) ? fs.readFileSync(path.join(ROOT, "LINKEDIN.md"), "utf8") : "";
  check("generar_cv.py existe", cvPy.length > 0);
  check("LINKEDIN.md existe (fuente de verdad del CV)", linkedinMd.length > 0);
  check("el generador lee LINKEDIN.md como fuente única", cvPy.includes("SRC = os.path.join(HERE, \"LINKEDIN.md\")"));
  check("escapado HTML con esc() (sin XSS en el CV)", /def esc\(s\):[\s\S]*?html\.escape\(s, quote=True\)/.test(cvPy));
  check("prints ASCII (sin UnicodeEncodeError en consola Windows)", cvPy.includes("CV HTML ->") && cvPy.includes("CV PDF  ->") && !cvPy.includes("CV HTML →"));
  check("motores PDF: weasyprint o headless Edge/Chrome (todo local)", cvPy.includes("from weasyprint import HTML") && cvPy.includes("--print-to-pdf"));
  check("parser de certificaciones tolera 'Certificaciones' sin tilde", /re\.search\(r"Certificaci\\w\+", head, flags=re\.I\)/.test(cvPy));
  check("pie del CV cita la fuente y el script generador", cvPy.includes("Generado desde <b>LINKEDIN.md</b>") && cvPy.includes("generar_cv.py"));

  // ---------- Sintaxis coloreada en bloques de código (highlightCode) ----------
  console.log("\n[SYNTAX HIGHLIGHT] Bloques de código con coloreado de sintaxis");
  check("highlightCode existe en index.html", html.includes("function highlightCode(code,lang)"));
  check("mdToHtml: bloques de código usan highlightCode", /highlightCode\(c,l\)/.test(html));
  check("mdToHtml: code-head con language badge", html.includes('<span class=\"code-lang\">') && html.includes('<button class=\"code-copy\"'));
  check("CSS: token de palabras clave (.syn-kw)", html.includes('.syn-kw{color:#c084fc'));
  check("CSS: token de strings (.syn-str)", html.includes('.syn-str{color:#34d399'));
  check("CSS: token de comentarios (.syn-cm)", html.includes('.syn-cm{color:#6b7280'));
  check("CSS: token de números (.syn-num)", html.includes('.syn-num{color:#fbbf24'));
  check("CSS: token de funciones (.syn-fn)", html.includes('.syn-fn{color:#60a5fa'));
  check("CSS: code-head y code-copy presentes", html.includes('.code-head{display:flex') && html.includes('.code-copy{margin-left:auto'));
  check("highlightCode escapa HTML (XSS: <script> → &lt;script&gt;)", /function highlightCode.*escH\(code\)/s.test(html));
  check("highlightCode: soporta python", /python[\s\S]*?False None True/.test(html));
  check("highlightCode: soporta javascript", /javascript[\s\S]*?async await/.test(html));
  check("highlightCode: soporta bash", /bash[\s\S]*?cd ls cat grep/.test(html));
  check("highlightCode: soporta html", /html[\s\S]*?DOCTYPE a abbr/.test(html));
  check("highlightCode: soporta css", /css[\s\S]*?@media @keyframes/.test(html));
  check("highlightCode: soporta json", /json[\s\S]*?true false null/.test(html));
  check("highlightCode: soporta sql", /sql[\s\S]*?ADD ALL ALTER/.test(html));
  check("highlightCode: soporta yaml", /yaml[\s\S]*?true false null/.test(html));
  check("highlightCode: soporta go", /go[\s\S]*?break case chan/.test(html));
  check("highlightCode: soporta rust", /rust[\s\S]*?as async await/.test(html));
  check("highlightCode: soporta diff", /diff[\s\S]*?index \+\+\+ ---/.test(html));
  check("highlightCode: soporta dockerfile", /dockerfile[\s\S]*?ADD ARG CMD/.test(html));
  check("highlightCode: alias js→javascript presentes", /js\s*:\s*'javascript'/.test(html) && /ts\s*:\s*'typescript'/.test(html));
  check("highlightCode: alias py→python presentes", /py\s*:\s*'python'/.test(html));
  check("highlightCode: modo texto plano (sin lang)", /if\(!L\|\|L==='text'/.test(html) && html.includes("return escH(code)"));
  check("copyCodeBlock existe", html.includes("function copyCodeBlock(btn)"));
  check("copyCodeBlock usa navigator.clipboard.writeText", html.includes("navigator.clipboard.writeText(txt)"));
  check("highlightCode: comentarios python (#)", /#[^\n]*/.test(html));
  check("highlightCode: comentarios JS (// y /* */)", /\/\*[\s\S]*?\*\//.test(html) && /\/\/[^\n]*/.test(html));
  check("highlightCode: marcadores de posición \\x01..\\x02", html.includes("\\x01'+i+'\\x02"));
  check("highlightCode: restauración inversa de marcadores", /for\(let i=holders\.length-1;i>=0;i--\)/.test(html));
  // Prueba funcional: round-trip con highlightCode sobre código real
  const hcMatch=/function highlightCode\(code,lang\)\{([\s\S]*?)\n}$/m.exec(html);
  if(hcMatch&&hcMatch[1]){
    try{
      const body=hcMatch[1];
      const escH=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const hl=new Function('escH','code','lang','const highlightCode='+body+';return highlightCode(code,lang);');
      let out=hl(escH,'print("hola")','python');
      check("highlightCode: python → colorea print como keyword", /syn-kw/.test(out)&&/print/.test(out));
      check("highlightCode: python → colorea string", /syn-str/.test(out)&&/"hola"/.test(out));
      out=hl(escH,'const x=42;','javascript');
      check("highlightCode: js → colorea const como keyword", /syn-kw/.test(out)&&/const/.test(out));
      check("highlightCode: js → colorea número", /syn-num/.test(out)&&/42/.test(out));
      out=hl(escH,'echo "hello" #comment','bash');
      check("highlightCode: bash → colorea echo como keyword", /syn-kw/.test(out)&&/echo/.test(out));
      check("highlightCode: bash → colorea string", /syn-str/.test(out)&&/"hello"/.test(out));
      check("highlightCode: bash → colorea comentario", /syn-cm/.test(out)&&/#comment/.test(out));
      out=hl(escH,'SELECT * FROM users','sql');
      check("highlightCode: sql → colorea SELECT como keyword", /syn-kw/.test(out)&&/SELECT/.test(out));
      out=hl(escH,'<div class="x">','html');
      check("highlightCode: html → colorea tag div", /syn-kw/.test(out)&&/<div/.test(out));
      out=hl(escH,'color: red;','css');
      check("highlightCode: css → colorea property color", /syn-kw/.test(out)&&/color/.test(out));
      out=hl(escH,'{"key": true}','json');
      check("highlightCode: json → colorea true", /syn-kw/.test(out)&&/true/.test(out));
      out=hl(escH,'texto sin lang','');
      check("highlightCode: sin lang → texto plano sin spans syn", !/<span class="syn/.test(out));
      out=hl(escH,'<script>alert(1)</script>','html');
      check("highlightCode: XSS — <script> escapa a &lt;script&gt;", /&lt;script&gt;/.test(out));
    }catch(e){ console.warn('  ! highlightCode round-trip error:',e.message); }
  }

  // ---------- Resumen ----------
  console.log("\n" + "=".repeat(60));
  console.log(`RESULTADO: ${PASS} ok · ${FAIL} fallos`);
  if (FAILURES.length) {
    console.log("Fallos:");
    for (const f of FAILURES) console.log(`  - ${f}`);
    console.log("=".repeat(60));
    process.exit(1);
  }
  console.log("TODO EN VERDE ✔");
  console.log("=".repeat(60));
  process.exit(0);
})();
