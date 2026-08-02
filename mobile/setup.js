#!/usr/bin/env node
/* setup.js — orquestador cross-platform del flujo Android de Aion Sincro.
   Equivalente a:  build:web + cap:add (solo si falta android/) + patch:manifest + cap:sync
   Re-ejecutable sin errores: si android/ ya existe, omite `npx cap add android`.
   Uso:  node setup.js   (o: npm run setup)
*/
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const run = (cmd) => {
  console.log(">", cmd);
  execSync(cmd, { stdio: "inherit" });
};
const ANDROID_DIR = path.join(__dirname, "android");

// 1) Copiar la app web a www/
run("node build-web.js");

// 2) Generar el proyecto nativo (una sola vez)
if (!fs.existsSync(ANDROID_DIR)) {
  run("npx cap add android");
} else {
  console.log("· mobile/android/ ya existe — omitiendo 'npx cap add android'");
}

// 3) Permisos de micrófono/hotword + cleartext en el manifest
run("node patch-manifest.js");

// 4) Sincronizar www/ con el proyecto nativo
run("npx cap sync android");

console.log("✔ Listo. Abre Android Studio con: npm run cap:open  (o compila con: npm run apk)");
