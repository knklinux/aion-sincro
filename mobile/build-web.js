#!/usr/bin/env node
/* build-web.js — copia la app web de Aion Sincro a mobile/www/ para que
   Capacitor la empaquete en el APK.
   Uso:  node build-web.js   (o: npm run build:web)
   Fuente: ../index.html, ../manifest.webmanifest, ../sw.js, ../icons/
   Destino: www/
*/
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SRC = path.join(ROOT, "..");
const DST = path.join(ROOT, "www");

const FILES = ["index.html", "manifest.webmanifest", "sw.js"];
const DIRS = ["icons"];

function copyFile(src, dst) {
  fs.copyFileSync(src, dst);
  console.log("  ✓", path.relative(ROOT, dst));
}

function copyDir(src, dst) {
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else copyFile(s, d);
  }
}

// Limpieza previa: evita artefactos stale (assets eliminados) en el APK.
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
console.log("Copiando app web → mobile/www/ ...");

for (const f of FILES) {
  const src = path.join(SRC, f);
  if (!fs.existsSync(src)) {
    console.error("  ✗ falta " + f + " — ejecuta build-web desde mobile/ (npm run build:web)");
    process.exit(1);
  }
  copyFile(src, path.join(DST, f));
}
for (const d of DIRS) {
  const src = path.join(SRC, d);
  if (fs.existsSync(src)) copyDir(src, path.join(DST, d));
}

console.log("Listo. Ejecuta: npx cap sync android  (o: npm run setup)");
