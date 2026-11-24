#!/usr/bin/env python3
"""Concatenate src/*.js in name order (audio last, as worker text) into one HTML. usage: build.py [out] [--studio]"""
import sys, os, glob, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else os.path.join(ROOT, 'index.html')
page = open(os.path.join(ROOT, 'src/page.html')).read()
main = sorted(glob.glob(os.path.join(ROOT, 'src/*.js')))
parts = []
for f in main:
    s = open(f).read()
    parts.append(f"// ---- {os.path.basename(f)} ----\n" + s)
# audio renderers travel as text: they run in Workers (and are never executed on the page)
aud = []
for f in ['src/01_score.js', 'src/audio/voice.js', 'src/audio/band.js', 'src/audio/foley.js', 'src/audio/mix.js', 'src/audio/worker.js']:
    p = os.path.join(ROOT, f)
    if os.path.exists(p): aud.append(open(p).read())
js = "\n".join(parts)
for tag in ("</script", "<!--"):
    assert tag not in js.lower(), f"{tag} inside script"
html = page.replace('<!--SCRIPTS-->', '<script type="text/plain" id="audio-src">\n' + "\n".join(aud).replace('</script', '<\\/script') + '\n</script>\n<script>\n"use strict";\n' + js + '\n</script>')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w').write(html)
print(out, len(html) // 1024, 'KB')
