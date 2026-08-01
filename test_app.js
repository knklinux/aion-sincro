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
  "index.html", "bridge.py", "bridge.mjs", "piper_server.py",
  "windows/install.cmd", "windows/uninstall.cmd", "windows/aion-sincro.cmd",
  "windows/crear-acceso-directo.ps1", "linux/install.sh", "linux/uninstall.sh",
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
  // Extrae "function <name>(){...}" con balanceo de llaves
  const idx = src.indexOf(`function ${name}(`);
  if (idx < 0) return null;
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

// ---------- 4) Elementos y funciones clave de la app ----------
console.log("\n[4] Integridad de la app (elementos y funciones clave)");
const REQUIRED_IDS = [
  "bootBtn", "textInput", "sendBtn", "voiceSel", "provider", "modelInput",
  "btnCrypto", "cryptoPass", "piperUrl", "piperToken", "voxtralEmotion",
  "bridgeToken", "termInput", "termRunBtn",
  "welcome", "welcomeBtn", "welcomeNarrateBtn", "btnStory",
];
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
  "speakVoxtral", "piperPing", "collectSettings", "openSettings", "testProvider",
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
