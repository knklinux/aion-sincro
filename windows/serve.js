#!/usr/bin/env node
/* serve.js — mini servidor web estático de Aion Sincro.
   Uso:  node serve.js [puerto]        (por defecto 8080)
   Sirve SOLO en 127.0.0.1 (necesario para el micrófono / Web Speech).
   Es el respaldo sin Python del lanzador windows/aion-sincro.cmd.
*/
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.argv[2]) || 8080;
const ROOT = process.cwd();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
};

http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    } catch {
      res.writeHead(400);
      return res.end("400 Bad Request");
    }
    let f = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    f = path.normalize(path.join(ROOT, f));
    // Barrera de path traversal: nada fuera de la carpeta de la app.
    if (!f.startsWith(ROOT + path.sep)) {
      res.writeHead(403);
      return res.end("403 Forbidden");
    }
    fs.readFile(f, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end("404 Not Found");
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log("Aion Sincro Web en http://127.0.0.1:" + PORT + "/");
  });
