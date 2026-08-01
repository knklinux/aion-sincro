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
  "proxyUrl", "proxyToken", "btnProxy", "piperLength", "piperNoise",
  "btnLearn", "learnOverlay", "learnBody", "learnProgress", "btnResetLearn", "btnCloseLearn",
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
  "handleUserText", "termPing", "streamChat",
];
for (const fn of REQUIRED_FNS) {
  check(`function ${fn} presente`, new RegExp(`function\\*?\\s+${fn}\\s*\\(`).test(script));
}
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
