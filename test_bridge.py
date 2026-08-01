#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aion Sincro — Suite de pruebas del puente y servidores locales
==============================================================
Valida que cada cambio en los puentes no rompa la seguridad:
  1) /ping del puente responde ok
  2) Host forjado (localhost.evil.com) -> 403   [DNS rebinding]
  3) Origin forjado (http://evil.com) -> 403    [CSRF desde webs externas]
  4) POST /run sin token -> 403
  5) POST /run con token -> 200 + salida ndjson + exit
  6) POST /kill con token -> 200 ok
  7) Funciones puras origin_allowed / host_allowed
  8) piper_server.py: /ping con token, Host/Origin forjados, slug malicioso

Uso:
    python test_bridge.py
    (o desde test_all.cmd / test_all.sh)
"""
import importlib.util
import json
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PASS = 0
FAIL = 0
FAILURES = []


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✔ {name}")
    else:
        FAIL += 1
        FAILURES.append(name)
        print(f"  ✘ {name}  {extra}")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def start_server(script, port, token=""):
    """Arranca un servidor local en un puerto libre y devuelve el subproceso."""
    cmd = [sys.executable, str(ROOT / script), "--port", str(port)]
    if token:
        cmd += ["--token", token]
    p = subprocess.Popen(
        cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
    )
    for _ in range(60):
        if p.poll() is not None:
            out = p.stdout.read().decode("utf-8", "replace") if p.stdout else ""
            raise RuntimeError(f"{script} murió al arrancar:\n{out}")
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return p
        except OSError:
            time.sleep(0.1)
    p.kill()
    raise RuntimeError(f"{script} no arrancó en {port}")


def stop(p):
    try:
        p.terminate()
    except Exception:
        pass
    try:
        p.kill()
    except Exception:
        pass
    try:
        p.wait(timeout=3)
    except Exception:
        pass


def raw_http(port, path, method="GET", host=None, origin=None, body=None, timeout=6, extra_headers=None):
    """Petición HTTP por socket con cabeceras controladas (Host/Origin forjados).

    Devuelve (status_code, body_bytes). El Host por defecto es 127.0.0.1:port.
    extra_headers: lista opcional de "Nombre: valor" para añadir (p. ej. X-Proxy-Token).
    """
    host = host or f"127.0.0.1:{port}"
    sock = socket.create_connection(("127.0.0.1", port), timeout=timeout)
    sock.settimeout(timeout)
    body_b = body.encode("utf-8") if isinstance(body, str) else (body or b"")
    lines = [
        f"{method} {path} HTTP/1.1",
        f"Host: {host}",
        "Connection: close",
    ]
    if origin is not None:
        lines.append(f"Origin: {origin}")
    for h in (extra_headers or []):
        lines.append(h)
    if body_b:
        lines.append("Content-Type: application/json")
        lines.append(f"Content-Length: {len(body_b)}")
    req = ("\r\n".join(lines) + "\r\n\r\n").encode("utf-8") + body_b
    sock.sendall(req)
    data = b""
    while True:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
    sock.close()
    head, _, body = data.partition(b"\r\n\r\n")
    try:
        status = int(head.split(b"\r\n")[0].split()[1])
    except Exception:
        status = 0
    return status, body


def test_pure_functions():
    print("\n[1] Funciones puras origin_allowed / host_allowed")
    spec = importlib.util.spec_from_file_location("bridge_mod", ROOT / "bridge.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ok_hosts = ["127.0.0.1", "127.0.0.1:8765", "localhost", "localhost:8765"]
    bad_hosts = [
        "localhost.evil.com", "127.0.0.1.evil.com", "evil.com",
        "127.0.0.1:8765.evil.com", "a.localhost", "",
    ]
    for h in ok_hosts:
        check(f"host_allowed({h!r})", mod.host_allowed(h) is True)
    for h in bad_hosts:
        check(f"host_allowed({h!r}) bloqueado", mod.host_allowed(h) is False)
    for o in [None, "", "null", "http://localhost:8080", "http://127.0.0.1:8080", "https://localhost"]:
        check(f"origin_allowed({o!r})", mod.origin_allowed(o) is True)
    for o in ["http://localhost.evil.com", "http://evil.com", "https://evil.com:8443", "file:///x"]:
        check(f"origin_allowed({o!r}) bloqueado", mod.origin_allowed(o) is False)


def test_bridge():
    print("\n[2] Puente HTTP (bridge.py)")
    port = free_port()
    token = "test-token-bridge-123"
    p = start_server("bridge.py", port, token)
    try:
        # 2.1 /ping con Host válido (el ping NO exige token por diseño)
        st, body = raw_http(port, "/ping")
        check("/ping → 200", st == 200)
        check("/ping → ok:true", st == 200 and b'"ok": true' in body)
        # 2.2 Host forjado (DNS rebinding)
        st, _ = raw_http(port, "/ping", host="localhost.evil.com")
        check("Host forjado → 403", st == 403, f"got {st}")
        st, _ = raw_http(port, "/ping", host="127.0.0.1.evil.com")
        check("Host forjado IP → 403", st == 403, f"got {st}")
        # 2.3 Origin forjado (CSRF)
        st, _ = raw_http(port, "/ping", origin="http://evil.com")
        check("Origin forjado → 403", st == 403, f"got {st}")
        st, _ = raw_http(port, "/ping", origin="http://localhost.evil.com")
        check("Origin falsificado localhost → 403", st == 403, f"got {st}")
        # 2.4 POST /run sin token → 403
        st, _ = raw_http(port, "/run", method="POST", body=json.dumps({"cmd": "echo x"}))
        check("/run sin token → 403", st == 403, f"got {st}")
        # 2.5 POST /run con token → 200 + salida
        st, body = raw_http(port, "/run", method="POST",
                            body=json.dumps({"token": token, "cmd": "echo hola-mundo"}))
        check("/run con token → 200", st == 200, f"got {st}")
        txt = body.decode("utf-8", "replace")
        check("/run devuelve la salida", "hola-mundo" in txt, txt[:120])
        check("/run devuelve exit:0", '"exit": 0' in txt, txt[:120])
        # 2.6 POST /run con cmd vacío → 400
        st, _ = raw_http(port, "/run", method="POST", body=json.dumps({"token": token, "cmd": "  "}))
        check("/run cmd vacío → 400", st == 400, f"got {st}")
        # 2.7 POST /kill con token → 200
        st, body = raw_http(port, "/kill", method="POST", body=json.dumps({"token": token}))
        check("/kill → 200", st == 200, f"got {st}")
        check("/kill → ok:true", st == 200 and b'"ok": true' in body)
        # 2.8 Ruta desconocida → 403
        st, _ = raw_http(port, "/otra-cosa")
        check("ruta desconocida → 403", st == 403, f"got {st}")
    finally:
        stop(p)


def test_piper():
    print("\n[3] Servidor de voz local (piper_server.py)")
    port = free_port()
    token = "piper-token-456"
    p = start_server("piper_server.py", port, token)
    try:
        # 3.1 /ping con token → 200 + piper
        st, body = raw_http(port, f"/ping?token={token}")
        check("/ping con token → 200", st == 200, f"got {st}")
        check("/ping → ok:true", st == 200 and b'"ok": true' in body)
        # 3.2 /ping sin token → 403
        st, _ = raw_http(port, "/ping")
        check("/ping sin token → 403", st == 403, f"got {st}")
        # 3.3 Host forjado con token válido → 403
        st, _ = raw_http(port, f"/ping?token={token}", host="localhost.evil.com")
        check("Host forjado → 403", st == 403, f"got {st}")
        # 3.4 Origin forjado con token válido → 403
        st, _ = raw_http(port, f"/ping?token={token}", origin="http://evil.com")
        check("Origin forjado → 403", st == 403, f"got {st}")
        # 3.5 Slug malicioso (path traversal) → 400
        st, _ = raw_http(port, f"/synthesize?token={token}&text=hola&voice=..%2F..%2Fetc%2Fpasswd")
        check("slug path-traversal → 400", st == 400, f"got {st}")
        # 3.6 Slug inválido simple → 400
        st, _ = raw_http(port, f"/synthesize?token={token}&text=hola&voice=../../etc/passwd")
        check("slug inválido → 400", st == 400, f"got {st}")
        # 3.7 Ruta desconocida → 403
        st, _ = raw_http(port, f"/nada?token={token}")
        check("ruta desconocida → 403", st == 403, f"got {st}")
    finally:
        stop(p)


def test_proxy():
    print("\n[4] Proxy de claves (proxy.py — las claves nunca viajan al navegador)")
    port = free_port()
    token = "proxy-token-789"
    p = start_server("proxy.py", port, token)
    try:
        # 4.1 /ping es libre (por diseño) → 200 + ok:true + providers booleanos
        st, body = raw_http(port, "/ping")
        check("/ping libre → 200", st == 200, f"got {st}")
        check("/ping → ok:true + providers", st == 200 and b'"ok": true' in body and b'"providers"' in body)
        # 4.2 Host forjado en /ping → 403
        st, _ = raw_http(port, "/ping", host="localhost.evil.com")
        check("/ping Host forjado → 403", st == 403, f"got {st}")
        # 4.3 Origin forjado en /ping → 403
        st, _ = raw_http(port, "/ping", origin="http://evil.com")
        check("/ping Origin forjado → 403", st == 403, f"got {st}")
        # 4.4 /providers sin token → 403
        st, _ = raw_http(port, "/providers")
        check("/providers sin token → 403", st == 403, f"got {st}")
        # 4.5 /v1/chat/completions sin token → 403
        st, _ = raw_http(port, "/v1/chat/completions", method="POST",
                         body='{"provider":"mistral","model":"x","messages":[]}')
        check("/v1/chat/completions sin token → 403", st == 403, f"got {st}")
        # 4.6 /v1/audio/speech sin token → 403
        st, _ = raw_http(port, "/v1/audio/speech", method="POST", body='{"input":"hola"}')
        check("/v1/audio/speech sin token → 403", st == 403, f"got {st}")
        # 4.7 Ruta desconocida → 403
        st, _ = raw_http(port, "/nada")
        check("ruta desconocida → 403", st == 403, f"got {st}")
        # 4.8 /providers con token (sin claves configuradas) → 200 con booleanos false
        st, body = raw_http(port, "/providers", method="GET",
                            extra_headers=[f"X-Proxy-Token: {token}"])
        check("/providers con token → 200", st == 200, f"got {st}")
        check("/providers → booleanos sin exponer claves", st == 200 and b'"mistral": false' in body and b"sk-" not in body)
        # 4.9 /v1/chat/completions con token pero sin clave configurada → 502 limpio
        st, body = raw_http(port, "/v1/chat/completions", method="POST",
                            extra_headers=[f"X-Proxy-Token: {token}"],
                            body='{"provider":"mistral","model":"x","messages":[{"role":"user","content":"hola"}],"stream":false}')
        check("/v1 con token sin clave → 502", st == 502, f"got {st}")
        check("error claro sin clave", st == 502 and b"no hay clave" in body, f"got {body[:80]}")
        # 4.10 Body malformado → 400
        st, _ = raw_http(port, "/v1/chat/completions", method="POST",
                         extra_headers=[f"X-Proxy-Token: {token}"], body="esto-no-es-json")
        check("JSON inválido → 400", st == 400, f"got {st}")
        # 4.11 Proveedor desconocido → 400
        st, _ = raw_http(port, "/v1/chat/completions", method="POST",
                         extra_headers=[f"X-Proxy-Token: {token}"],
                         body='{"provider":"nasa","model":"x","messages":[]}')
        check("proveedor desconocido → 400", st == 400, f"got {st}")
        # 4.12 Body demasiado grande (> 1 MB) → 400
        big = '{"provider":"mistral","model":"x","messages":[{"role":"user","content":"' + "a" * 1_100_000 + '"}]}'
        st, _ = raw_http(port, "/v1/chat/completions", method="POST",
                         extra_headers=[f"X-Proxy-Token: {token}"], body=big, timeout=10)
        check("body > 1 MB → 400", st == 400, f"got {st}")
    finally:
        stop(p)


def main():
    print("=" * 60)
    print("Aion Sincro — Suite de pruebas de seguridad (puentes)")
    print("=" * 60)
    test_pure_functions()
    test_bridge()
    test_piper()
    test_proxy()
    print("\n" + "=" * 60)
    print(f"RESULTADO: {PASS} ok · {FAIL} fallos")
    if FAILURES:
        print("Fallos:")
        for f in FAILURES:
            print(f"  - {f}")
        print("=" * 60)
        sys.exit(1)
    print("TODO EN VERDE ✔")
    print("=" * 60)
    sys.exit(0)


if __name__ == "__main__":
    main()
