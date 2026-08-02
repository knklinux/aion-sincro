#!/usr/bin/env node
/* patch-manifest.js — inyecta en el AndroidManifest.xml generado por
   `npx cap add android` los permisos que la app necesita:
     - RECORD_AUDIO          → micrófono para la hotword (Web Speech API)
     - INTERNET              → puente local / proxy / APIs
     - MODIFY_AUDIO_SETTINGS → control de volumen durante la voz
     - ACCESS_FINE_LOCATION  → GPS preciso (módulos OSINT/recon de ubicación)
     - ACCESS_COARSE_LOCATION→ WiFi/torre celular (OSINT pasivo)
     - CAMERA                → foto/vídeo (reconocimiento visual, QR, docs)
   Y habilita cleartext HTTP (127.0.0.1 / LAN) para el puente.
   Es idempotente: si ya están, no toca nada.
   Uso:  node patch-manifest.js   (o: npm run patch:manifest)
   Debe ejecutarse DESPUÉS de `npx cap add android`.
*/
const fs = require("fs");
const path = require("path");

const MF = path.join(__dirname, "android", "app", "src", "main", "AndroidManifest.xml");

if (!fs.existsSync(MF)) {
  console.error("✗ No existe " + MF);
  console.error("  Ejecuta primero:  npx cap add android   (o: npm run setup)");
  process.exit(1);
}

let xml = fs.readFileSync(MF, "utf8");
const PERMS = [
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.INTERNET" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.CAMERA" />',
];

let changed = false;

// 1) Permisos: se insertan justo después de la etiqueta <manifest ...>
for (const p of PERMS) {
  if (!xml.includes(p)) {
    xml = xml.replace(/>\s*<application/, ">\n    " + p + "\n    <application");
    changed = true;
  }
}

// 2) Cleartext HTTP (puente local en 127.0.0.1 o IP de la LAN)
if (xml.includes("<application") && !/android:usesCleartextTraffic\s*=\s*"true"/.test(xml)) {
  xml = xml.replace(/<application\b/, '<application android:usesCleartextTraffic="true"');
  changed = true;
}

fs.writeFileSync(MF, xml, "utf8");
console.log(changed
  ? "✓ AndroidManifest.xml actualizado (micrófono + ubicación + cámara + INTERNET + cleartext)"
  : "· AndroidManifest.xml ya tenía los permisos (nada que cambiar)");
