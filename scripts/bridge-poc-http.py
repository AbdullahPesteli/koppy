#!/usr/bin/env python3
"""K07 PoC: GERCEK KoppyBridge ikilisini kendi surecinde (port 47652, gecici token dosyasi) baslatir,
HTTP+X-Koppy-Token ile 2 PNG gonderir, panoda 2 ayri oge oldugunu sayar. Pano once yedeklenir, sonda geri yuklenir.
Calisan LaunchAgent (47651) ve ~/.koppy dokunulmaz. Ayrica 401 / 429 yollarini dener."""
import os, struct, zlib, subprocess, sys, tempfile, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = tempfile.mkdtemp(prefix="bridgepoc-http-", dir=os.environ.get("TMPDIR"))
PORT = 47652
def png(r, g, b, n=8):
    raw = b"".join(b"\x00" + bytes([r, g, b, 255]) * n for _ in range(n))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")
def run(*a): return subprocess.run(a, check=True, capture_output=True, text=True).stdout
def post(body, token):
    h = {"Content-Type": "application/vnd.koppy.images+binary"}
    if token is not None: h["X-Koppy-Token"] = token
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/images", data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()
bridge, pbt, tokfile = f"{W}/KoppyBridge", f"{W}/pb", f"{W}/dir/bridge-token"
run("swiftc", "-O", f"{ROOT}/bridge/KoppyBridge.swift", "-framework", "AppKit", "-framework", "Security", "-o", bridge)
run("swiftc", "-O", f"{ROOT}/scripts/bridge-poc-pb.swift", "-framework", "AppKit", "-o", pbt)
print("onceki pano:", run(pbt, "backup", f"{W}/bak").strip())
proc = None; ok = False
try:
    proc = subprocess.Popen([bridge, "--port", str(PORT), "--token-file", tokfile], stdout=open(f"{W}/bridge.out", "w"), stderr=subprocess.STDOUT)
    for _ in range(40):
        if os.path.exists(tokfile): break
        time.sleep(0.1)
    time.sleep(0.3)
    token = open(tokfile).read().strip()
    mode = oct(os.stat(tokfile).st_mode & 0o777)
    print("token dosya modu:", mode, "| --print-token ayni mi:", run(bridge, "--print-token", "--token-file", tokfile).strip() == token)
    body = b"".join(struct.pack(">I", len(p)) + p for p in (png(255, 0, 0), png(0, 0, 255)))
    s_none, b_none = post(body, None); print("token YOK  ->", s_none, b_none)
    s_bad, b_bad = post(body, "yanlis"); print("token YANLIS ->", s_bad, b_bad)
    cnt0 = run(pbt, "count").strip(); print("401'lerden sonra pano:", cnt0)
    s_ok, b_ok = post(body, token); print("token DOGRU ->", s_ok, b_ok)
    cnt = run(pbt, "count"); print(cnt.strip())
    health = urllib.request.urlopen(f"http://127.0.0.1:{PORT}/v1/health", timeout=5).read().decode()
    try: urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/clipboard"), timeout=5); read_status = 200
    except urllib.error.HTTPError as e: read_status = e.code
    print("pano okuma rotasi (/v1/clipboard) ->", read_status, "| token sizintisi health'te:", token in health)
    # rate limit: 3 istek harcandi (none,bad,ok); 7 tane daha sonra 429 beklenir
    codes = [post(body, "yanlis")[0] for _ in range(9)]
    print("hiz siniri kodlari:", codes)
    ok = (s_none == 401 and s_bad == 401 and s_ok == 200 and "items=2 png=2" in cnt and mode == "0o600"
          and 429 in codes and read_status in (401, 404, 429) and token not in health)
finally:
    if proc:
        proc.terminate(); time.sleep(0.3)
        print("kopru ciktisi:", open(f"{W}/bridge.out").read()[-500:].strip())
    print("geri yukleme:", run(pbt, "restore", f"{W}/bak").strip(), "|", run(pbt, "count").splitlines()[0])
print("SONUC:", "token yok->401, token var->2 ayri pano ogesi (gercek kopru), hiz siniri 429" if ok else "BASARISIZ"); sys.exit(0 if ok else 1)
