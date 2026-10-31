#!/usr/bin/env python3
"""K03 PoC: KoppyNativeHost'u CLI'dan (Native Messaging cercevesi) cagir, 2 PNG'yi ayri pano ogesi yaz.
Pano once yedeklenir, sonunda geri yuklenir. Calisan Zen/LaunchAgent'a dokunulmaz."""
import os, struct, zlib, json, subprocess, sys, tempfile, secrets, base64
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = tempfile.mkdtemp(prefix="bridgepoc-", dir=os.environ.get("TMPDIR"))
def png(r, g, b, n=8):
    raw = b"".join(b"\x00" + bytes([r, g, b, 255]) * n for _ in range(n))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")
def frame(o):
    j = json.dumps(o).encode(); return struct.pack("<I", len(j)) + j
def run(*a, **k): return subprocess.run(a, check=True, capture_output=True, text=True, **k).stdout
host, pbt = f"{W}/host", f"{W}/pb"
run("swiftc", "-O", f"{ROOT}/bridge/KoppyNativeHost.swift", "-framework", "AppKit", "-o", host)
run("swiftc", "-O", f"{ROOT}/scripts/bridge-poc-pb.swift", "-framework", "AppKit", "-o", pbt)
print("onceki pano:", run(pbt, "backup", f"{W}/bak").strip())
ok = False
try:
    id_ = secrets.token_hex(16); imgs = [png(255, 0, 0), png(0, 0, 255)]
    msgs = [{"action": "begin", "id": id_, "count": 2}]
    msgs += [{"action": "chunk", "id": id_, "index": i, "data": base64.b64encode(d).decode()} for i, d in enumerate(imgs)]
    msgs.append({"action": "end", "id": id_})
    p = subprocess.run([host], input=b"".join(frame(m) for m in msgs), capture_output=True, timeout=30)
    reply = json.loads(p.stdout[4:4 + struct.unpack("<I", p.stdout[:4])[0]])
    print("host yaniti:", reply)
    cnt = run(pbt, "count"); print(cnt.strip())
    osa = run("osascript", "-e", 'the clipboard as «class PNGf»')[:40].strip()  # en az 1 PNG okunabiliyor mu
    print("osascript PNGf:", osa[:30] + "...")
    ok = reply.get("ok") is True and "items=2 png=2" in cnt
finally:
    print("geri yukleme:", run(pbt, "restore", f"{W}/bak").strip(), "|", run(pbt, "count").splitlines()[0])
print("SONUC:", "2 ayri pano ogesi yazildi, dogrulandi" if ok else "BASARISIZ"); sys.exit(0 if ok else 1)
