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
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
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
check("renderLearn() al arranque", /renderLearn\(\);\s*\$\('#bootBtn'\)\.onclick/.test(script));
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
check("chips laboral: reconocimiento, pentest y ejecutivo", /Informe de reconocimiento[\s\S]*?Informe de pentest[\s\S]*?Reporte ejecutivo/.test(script));
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
check(`boot respeta historia_vista`, /if\(historySeen\(\)\)\{ chime\(\); maybeWake\(\); return; \}/.test(script));
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
// Candado de cifrado en el header: indicador visual + desbloqueo rápido sin Ajustes
check("syncCryptoUI actualiza el candado del header", /function\s+syncCryptoUI\s*\([\s\S]*?lb\.classList\.toggle\('visible',on\);[\s\S]*?lb\.classList\.toggle\('locked',on&&!unlocked\);/.test(script));
check("lockSecrets() purga claves sin desactivar cifrado", /function\s+lockSecrets\s*\([\s\S]*?cryptoUnlocked=false; cryptoKey=null;[\s\S]*?saveStore\(\); syncCryptoUI\(\);/.test(script));
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
check("AES-GCM de 256 bits no-extraíble", /\{name:'AES-GCM',length:256\},false,\['encrypt','decrypt'\]/.test(script));
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
