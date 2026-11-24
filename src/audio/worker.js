// worker.js - glue that runs inside each audio Worker (never on the page).
// a finished stem travels as 16-bit with its own scale: half the memory, noise floor 96 dB under its own peak
function stem16(r) { if (!r.L || r.q) return r; const L = r.L, R = r.R || r.L, n = L.length; let p = 1e-9; for (let i = 0; i < n; i++) { const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i]; if (a > p) p = a; if (b > p) p = b; } const k = 32767 / p, A = new Int16Array(n), B = new Int16Array(n); for (let i = 0; i < n; i++) { A[i] = Math.round(L[i] * k); B[i] = Math.round(R[i] * k); } r.L = A; r.R = B; r.q = p / 32767; return r; }
if (typeof self !== 'undefined' && typeof document === 'undefined' && typeof importScripts === 'function') {
  self.onmessage = e => {
    const m = e.data;
    try {
      if (m.cmd === 'list') { const cost = id => { try { return VOICE.cost ? VOICE.cost(id) : 1; } catch (x) { return 1; } };
        self.postMessage({ cmd: 'list', voice: VOICE.jobs().map(id => [id, 1.5 + cost(id)]), band: BAND.jobs().map(id => [id, 4]), foley: FOLEY.jobs().map(id => [id, .4]), marks: JSON.parse(JSON.stringify(FOLEY.marks, (k, v) => typeof v === 'function' ? undefined : v)) });
      } else if (m.cmd === 'job') { const r = m.lane === 'voice' ? VOICE.render(m.id) : m.lane === 'band' ? BAND.render(m.id) : FOLEY.render(m.id); r.lane = m.lane; r.id = r.id || m.id; stem16(r); const tr = new Set(); for (const k of ['pcm', 'L', 'R']) if (r[k] && r[k].buffer) tr.add(r[k].buffer); self.postMessage({ cmd: 'job', lane: m.lane, id: m.id, r }, [...tr]);
      } else if (m.cmd === 'shots') { const out = {}, tr = []; for (const k of m.kinds) for (let s = 0; s < (m.n[k] || 1); s++) { const o = FOLEY.oneshot(k, 11 + s * 7), L = Float32Array.from(o.L), Rr = Float32Array.from(o.R || o.L); out[k + s] = { L, R: Rr }; tr.push(L.buffer, Rr.buffer); } for (let v = 0; v < 8; v++) { const o = VOICE.reply(v), L = Float32Array.from(o.pcm); out['reply' + v] = { L, R: L.slice(), vis: o.vis }; tr.push(L.buffer, out['reply' + v].R.buffer); } self.postMessage({ cmd: 'shots', out }, tr);
      } else if (m.cmd === 'loop') { const o = BAND.loop(); self.postMessage({ cmd: 'loop', L: o.L, R: o.R, bars: o.bars, bpm: o.bpm }, [o.L.buffer, o.R.buffer]);
      } else if (m.cmd === 'mix') { const o = MIX.master(m.stems, 44100, { free: true }); self.postMessage({ cmd: 'mix', L: o.L, R: o.R }, [o.L.buffer, o.R.buffer]); }
    } catch (err) { self.postMessage({ cmd: 'error', what: m.cmd + ' ' + (m.id || ''), msg: String(err && err.stack || err).slice(0, 500) }); }
  };
}
