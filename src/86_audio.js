// ============================================================================
// 86_audio.js - hires a room of Workers, has the song sung, played and mixed,
// then plays it. The audio clock is the film clock.
// ============================================================================
const AU = { SR: 44100, ready: false, silent: false, how: '', progress: 0, shots: {}, stage: 'waking the band', t0: 0, off: 0, playing: false, vol: 1, log: [], lastT: 0 };
AU.src = document.getElementById('audio-src').textContent; AU.nonce = (document.currentScript && document.currentScript.nonce) || '';
const NAMES = { voice: 'the pelican is clearing his throat', band: 'the band is tuning', foley: 'oiling both chains' };
AU.finish = (M, shots, loop, t0) => { AU.master = M; AU.shotData = shots || null; AU.loopData = loop || null; AU.progress = 1; AU.ready = true; AU.ms = performance.now() - t0; AU.log.push('audio ready in ' + Math.round(AU.ms) + ' ms, ' + AU.how); };
// way one: a room of Workers
AU.viaWorkers = async () => {
  const t0 = performance.now(), url = URL.createObjectURL(new Blob([AU.src], { type: 'text/javascript' })), phone = matchMedia('(pointer: coarse)').matches; const n = Math.max(2, Math.min(phone ? 3 : 8, (navigator.hardwareConcurrency || 4) - 1)); const W = [];
  const ask = (w, msg, tr = [], ms = 120000) => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('worker silent: ' + msg.cmd + ' ' + (msg.id || ''))), ms); w.onmessage = e => { clearTimeout(to); e.data.cmd === 'error' ? rej(new Error(e.data.what + ': ' + e.data.msg)) : res(e.data); }; w.onerror = e => { clearTimeout(to); e.preventDefault && e.preventDefault(); rej(new Error('worker blocked ' + (e.message || ''))); }; try { w.postMessage(msg, tr); } catch (x) { clearTimeout(to); rej(x); } });
  try {
    W.push(new Worker(url)); const L = await ask(W[0], { cmd: 'list' }, [], 9000); for (let i = 1; i < n; i++) W.push(new Worker(url)); AU.how = n + ' workers'; AU.marks = L.marks;
    const jobs = []; for (const lane of ['voice', 'band', 'foley']) for (const [id, c] of L[lane]) jobs.push({ lane, id, c }); jobs.sort((x, y) => y.c - x.c); const total = jobs.length + 4; let done = 0; const stems = [];
    await Promise.all(W.map(async (w, wi) => { for (;;) { const j = jobs.shift(); if (!j) { if (wi > 1) w.terminate(); return; } AU.stage = NAMES[j.lane]; const r = await ask(w, { cmd: 'job', lane: j.lane, id: j.id }); if (j.lane === 'voice' && r.r.vis) ST.VIS[r.r.id] = r.r.vis; delete r.r.vis; stems.push(r.r); done++; AU.progress = done / total; } }));
    AU.log.push('sung and played by ' + Math.round(performance.now() - t0)); AU.stage = 'mixing'; const tr = [...new Set(stems.flatMap(x => ['pcm', 'L', 'R'].filter(k => x[k] && x[k].buffer).map(k => x[k].buffer)))]; const shotP = ask(W[1 % W.length], { cmd: 'shots', kinds: AU.KINDS, n: AU.KN }), loopP = shotP.catch(() => 0).then(() => ask(W[1 % W.length], { cmd: 'loop' })); const M = await ask(W[0], { cmd: 'mix', stems }, tr); AU.log.push('mixed by ' + Math.round(performance.now() - t0)); AU.finish(M, null, null, t0); // the film can start; bells and the ride-on waltz follow
    const all = () => { W.forEach(w => w.terminate()); URL.revokeObjectURL(url); }; W[0].terminate(); shotP.then(S => { AU.shotData = S.out; }).catch(() => {}).then(() => loopP).then(l => { AU.loopData = l; }).catch(() => {}).then(all);
  } catch (e) { W.forEach(w => w.terminate()); URL.revokeObjectURL(url); throw e; }
};
AU.KINDS = ['bell', 'splash', 'plink', 'ruffle', 'hop', 'gust', 'pop']; AU.KN = { bell: 3, plink: 4, splash: 2 };
// way two: no Workers here (a locked-down preview): the same code on this thread, one job between frames
AU.viaPage = async () => {
  const t0 = performance.now(); AU.how = 'this page'; const rest = () => new Promise(r => setTimeout(r, 12)); const s = document.createElement('script'); if (AU.nonce) s.nonce = AU.nonce; s.textContent = 'window.__AUD=(()=>{' + AU.src + '\n;return{VOICE,BAND,FOLEY,MIX,stem16};})();'; document.head.appendChild(s); s.remove(); const X = window.__AUD; if (!X) throw new Error('page refused the sound code');
  const jobs = []; for (const id of X.VOICE.jobs()) jobs.push(['voice', id]); for (const id of X.BAND.jobs()) jobs.push(['band', id]); for (const id of X.FOLEY.jobs()) jobs.push(['foley', id]); const stems = []; for (let i = 0; i < jobs.length; i++) { const [lane, id] = jobs[i]; AU.stage = NAMES[lane]; await rest(); const r = (lane === 'voice' ? X.VOICE : lane === 'band' ? X.BAND : X.FOLEY).render(id); r.lane = lane; r.id = r.id || id; if (r.vis) { if (lane === 'voice') ST.VIS[r.id] = r.vis; delete r.vis; } stems.push(X.stem16(r)); AU.progress = i / (jobs.length + 6); }
  AU.stage = 'mixing'; await rest(); await rest(); const M = X.MIX.master(stems, 44100, { free: true }); stems.length = 0; AU.progress = .97; await rest(); const out = {}; for (const k of AU.KINDS) for (let q = 0; q < (AU.KN[k] || 1); q++) { const o = X.FOLEY.oneshot(k, 11 + q * 7); out[k + q] = { L: Float32Array.from(o.L), R: Float32Array.from(o.R || o.L) }; } for (let v = 0; v < 8; v++) { const o = X.VOICE.reply(v); out['reply' + v] = { L: Float32Array.from(o.pcm), R: Float32Array.from(o.pcm) }; } await rest(); let lp = null; try { lp = X.BAND.loop(); } catch (e) {} AU.finish(M, out, lp, t0); window.__AUD = null;
};
AU.load = async () => {
  try { await AU.viaWorkers(); return; } catch (e) { AU.log.push('workers: ' + (e.message || e)); console.warn('sound: no workers here, using the page (' + (e.message || e) + ')'); }
  AU.progress = 0; try { await AU.viaPage(); return; } catch (e) { AU.log.push('page: ' + (e.message || e)); console.warn('sound: ' + (e.stack || e)); }
  AU.silent = true; AU.how = 'silent'; AU.progress = 1; AU.ready = true; AU.stage = 'no sound here';
};
AU.ctx = null;
AU.open = () => { try { if (AU.ctx) { const p = AU.ctx.resume(); return p; } const C2 = window.AudioContext || window.webkitAudioContext; if (!C2) { AU.silent = true; return; } try { AU.ctx = new C2({ sampleRate: 44100, latencyHint: 'playback' }); } catch (e) { AU.ctx = new C2(); } AU.out = AU.ctx.createGain(); AU.out.gain.value = AU.vol; AU.out.connect(AU.ctx.destination); AU.fx = AU.ctx.createGain(); AU.fx.gain.value = .9; AU.fx.connect(AU.out); return AU.ctx.resume(); } catch (e) { AU.silent = true; AU.log.push('context: ' + e.message); } };
AU.buf = d => { const b = AU.ctx.createBuffer(2, d.L.length, AU.SR); if (b.copyToChannel) { b.copyToChannel(d.L, 0); b.copyToChannel(d.R || d.L, 1); } else { b.getChannelData(0).set(d.L); b.getChannelData(1).set(d.R || d.L); } return b; };
AU.lat = () => { const l = AU.ctx.outputLatency; return l > 0 && l < .6 ? l : (AU.ctx.baseLatency > 0 && AU.ctx.baseLatency < .6 ? AU.ctx.baseLatency : .012); };
AU.play = t => {
  AU.stop(); const now = performance.now(); AU.lastT = t; AU.lastW = now; AU.wall = null; AU.playing = true;
  if (AU.silent || !AU.ctx) { AU.wall = { t, w: now, hard: true }; return; }
  try { if (!AU.mb && AU.master) { AU.mb = AU.buf(AU.master); AU.master = null; } const s = AU.ctx.createBufferSource(); s.buffer = AU.mb; const g = AU.ctx.createGain(); s.connect(g); g.connect(AU.out); const w = AU.ctx.currentTime + .06; g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(1, w + .04); if (t < AU.mb.duration - .05) s.start(w, Math.max(0, t)); AU.srcN = s; AU.sg = g; AU.t0 = w - t; AU.lastC = AU.ctx.currentTime; } catch (e) { AU.log.push('play: ' + e.message); AU.wall = { t, w: now, hard: true }; }
};
AU.stop = () => { if (AU.srcN) { const g = AU.sg, s = AU.srcN; try { g.gain.setTargetAtTime(0, AU.ctx.currentTime, .02); s.stop(AU.ctx.currentTime + .15); } catch (e) {} AU.srcN = null; } AU.playing = false; };
// the film clock: the sound card when it is really running, the wall clock whenever it is not
AU.time = () => {
  const now = performance.now(); const wallT = () => AU.wall.t + (now - AU.wall.w) / 1000; if (AU.wall && AU.wall.hard) return AU.lastT = wallT(); const c = AU.ctx.currentTime;
  if (c !== AU.lastC) { AU.lastC = c; AU.lastW = now; if (AU.wall) { const t = wallT(); AU.play(t); return t; } } else if (!AU.wall && now - AU.lastW > 500) AU.wall = { t: AU.lastT, w: now };
  return AU.lastT = AU.wall ? wallT() : c - AU.t0 - AU.lat();
};
AU.shot = (k, { gain = 1, pan = 0, rate = 1, when = 0 } = {}) => { if (AU.silent || !AU.ctx || !AU.shotData || !AU.shotData[k]) return; AU.sb = AU.sb || {}; if (!AU.sb[k]) AU.sb[k] = AU.buf(AU.shotData[k]); const s = AU.ctx.createBufferSource(), g = AU.ctx.createGain(), p = AU.ctx.createStereoPanner ? AU.ctx.createStereoPanner() : AU.ctx.createGain(); s.buffer = AU.sb[k]; s.playbackRate.value = rate; g.gain.value = gain; if (p.pan) p.pan.value = pan; s.connect(g); g.connect(p); p.connect(AU.fx); s.start(AU.ctx.currentTime + when); };
AU.startLoop = () => { if (AU.silent || !AU.ctx || !AU.loopData || AU.ls) return; AU.lb = AU.lb || AU.buf(AU.loopData); const s = AU.ctx.createBufferSource(), g = AU.ctx.createGain(); s.buffer = AU.lb; s.loop = true; g.gain.setValueAtTime(0, AU.ctx.currentTime); g.gain.linearRampToValueAtTime(.8, AU.ctx.currentTime + 2.5); s.connect(g); g.connect(AU.out); s.start(); AU.ls = s; AU.lg = g; AU.lt0 = AU.ctx.currentTime; };
AU.stopLoop = () => { if (AU.ls) { const s = AU.ls; AU.lg.gain.setTargetAtTime(0, AU.ctx.currentTime, .3); s.stop(AU.ctx.currentTime + 1.5); AU.ls = null; } };
