// ============================================================================
// 01_score.js - the one clock. Tempo, melody, words, chords, crank, cues.
// Plain script: runs in the page, in a Worker and in node (module.exports).
// Every time is film seconds. Audio and picture read nothing else.
// ============================================================================
const SCORE = (() => {
const DUR = 240;
// ---------- tempo -----------------------------------------------------------
// every section is 3/4. t0 = bar 0 beat 0.
const sec = {
  then:  { t0: 1.5,     bpm: 108, bars: 20 },   // ends (the match cut) at 34.8333
  now:   { t0: 34.8333, bpm: 80,  bars: 21 },   // ends 82.0833
  storm: { t0: 85.5,    bpm: 132, bars: 16 },   // the wave breaks at 107.3182
  night: { t0: 116,     bpm: 60,  bars: 12 },   // ends 152
  ride:  { t0: 184,     bpm: 112, bars: 28 },
};
// ride: beats 60..72 (the last line again) slow down by up to 45%
const rideBeat = [0];
for (let b = 0; b < 100; b++) {
  const k = b < 60 ? 0 : b < 72 ? (b - 60) / 12 * .45 : .45;
  rideBeat.push(rideBeat[b] + 60 / sec.ride.bpm * (1 + k));
}
function T(s, bar, beat = 0) {
  const S = sec[s], x = bar * 3 + beat;
  if (s === 'ride') { const i = Math.max(0, Math.min(98, Math.floor(x))), f = x - i; return S.t0 + rideBeat[i] + (rideBeat[i + 1] - rideBeat[i]) * f; }
  return S.t0 + x * 60 / S.bpm;
}
const TIME = {
  matchCut: T('then', 20),          // 34.8333
  title: T('now', 2, 2),            // 41.6
  wave: T('storm', 16),             // 107.318
  catch_: 111.6, black: 114.2,
  nightIn: 115.2,
  nightEnd: 152,
  crack1: 157.6, crack2: 160.4, crack3: 163.2, hatch: 165.2,
  ask: 170.0, answer: 180.4, answer2: 183.0 - 0.2,
  rideGo: 184, key: T('ride', 12), bellEnd: 0, end: 232,
};
TIME.bellEnd = T('ride', 25, 1);
// ---------- voices ----------------------------------------------------------
// n(syllable phones, midi, section, bar, beat, beats)  phones: ARPAbet, the vowel is the nucleus. 'MM' = hum nucleus.
const N = (syl, ph, midi, s, bar, beat, beats) => ({ syl, ph: ph.split(' '), midi, t0: T(s, bar, beat), t1: T(s, bar, beat + beats) });
const lines = [];
const line = (id, who, sect, feel, notes) => { lines.push({ id, who, sec: sect, feel, notes, t0: notes[0].t0, t1: notes[notes.length - 1].t1 }); };
// the verse as a template: start bar B, transposition x, section s
const P1 = (s, B, x) => [N('who','HH UW',50+x,s,B,0,1), N('rides','R AY D Z',54+x,s,B,1,1), N('the','DH AH',57+x,s,B,2,1), N('mor','M AO R',59+x,s,B+1,0,2), N('ning','N IH NG',57+x,s,B+1,2,1.4)];
const P2 = (s, B, x) => [N('who','HH UW',50+x,s,B,0,1), N('wakes','W EY K S',55+x,s,B,1,1), N('the','DH AH',59+x,s,B,2,1), N('sea','S IY',62+x,s,B+1,0,3.3)];
const A1 = (s, B, x) => [N('we','W IY',69+x,s,B,0,1), N('two','T UW',66+x,s,B,1,2.2)];
const A2 = (s, B, x) => [N('we','W IY',71+x,s,B,0,1), N('two','T UW',67+x,s,B,1,2.2)];
const L3 = (s, B, x) => [N('the','DH AH',57+x,s,B-1,2,1), N('road','R OW D',62+x,s,B,0,1), N('is','IH Z',61+x,s,B,1,1), N('a','AH',59+x,s,B,2,1), N('rib','R IH',57+x,s,B+1,0,1), N('bon','B AH N',54+x,s,B+1,1,1), N('the','DH AH',54+x,s,B+1,2,1), N('world','W ER L D',55+x,s,B+2,0,1), N('is','IH Z',57+x,s,B+2,1,1), N('a','AH',59+x,s,B+2,2,1), N('wheel','W IY L',57+x,s,B+3,0,1.9)];
const L3h = (s, B, x) => [N('the','DH AH',61+x,s,B-1,2,1), N('road','R OW D',66+x,s,B,0,1), N('is','IH Z',64+x,s,B,1,1), N('a','AH',62+x,s,B,2,1), N('rib','R IH',61+x,s,B+1,0,1), N('bon','B AH N',57+x,s,B+1,1,1), N('the','DH AH',57+x,s,B+1,2,1), N('world','W ER L D',59+x,s,B+2,0,1), N('is','IH Z',61+x,s,B+2,1,1), N('a','AH',62+x,s,B+2,2,1), N('wheel','W IY L',61+x,s,B+3,0,1.9)];
const L4 = (s, B, x, upto = 99, last = 3) => [N('and','AE N D',57+x,s,B-1,2,.5), N('it','IH T',59+x,s,B-1,2.5,.5), N('turns','T ER N Z',61+x,s,B,0,1.8), N('and','AE N D',59+x,s,B,2,.5), N('it','IH T',61+x,s,B,2.5,.5), N('turns','T ER N Z',62+x,s,B+1,0,1.8), N('for','F AO R',62+x,s,B+1,2,1), N('you','Y UW',66+x,s,B+2,0,1), N('and','AE N D',64+x,s,B+2,1,1), N('for','F AO R',61+x,s,B+2,2,1), N('me','M IY',62+x,s,B+3,0,last)].slice(0, upto);
const L4h = (s, B, x, last = 3) => [N('and','AE N D',61+x,s,B-1,2,.5), N('it','IH T',62+x,s,B-1,2.5,.5), N('turns','T ER N Z',64+x,s,B,0,1.8), N('and','AE N D',62+x,s,B,2,.5), N('it','IH T',64+x,s,B,2.5,.5), N('turns','T ER N Z',66+x,s,B+1,0,1.8), N('for','F AO R',66+x,s,B+1,2,1), N('you','Y UW',69+x,s,B+2,0,1), N('and','AE N D',67+x,s,B+2,1,1), N('for','F AO R',64+x,s,B+2,2,1), N('me','M IY',66+x,s,B+3,0,last)];

// --- THEN (bars 4..19): a duet, easy, smiling, young in the voice
line('t1', 'he',  'then', { dyn: -3, breath: .25, smile: .8, vib: .5, push: .02, note: 'warm, playful, offering the question' }, P1('then', 4, 0));
line('t1a','she', 'then', { dyn: -3, breath: .30, smile: 1., vib: .5, note: 'light, quick, laughing through it' }, A1('then', 6, 0));
line('t2', 'he',  'then', { dyn: -2, breath: .25, smile: .8, vib: .5, note: 'bigger, showing off' }, P2('then', 8, 0));
line('t2a','she', 'then', { dyn: -2, breath: .30, smile: 1., vib: .5, note: 'teasing' }, A2('then', 10, 0));
line('t3', 'he',  'then', { dyn: -2, breath: .22, smile: .7, vib: .55, note: 'both, rolling along in thirds' }, L3('then', 12, 0));
line('t3h','she', 'then', { dyn: -4, breath: .28, smile: .9, vib: .5, note: 'third above, blended' }, L3h('then', 12, 0));
line('t4', 'he',  'then', { dyn: -1, breath: .20, smile: .7, vib: .6, note: 'the top note "you" is sung TO her; "me" is cut off by the edit at 34.83 (voice simply stops, the reverb rings on)' }, L4('then', 16, 0, 99, 3));
line('t4h','she', 'then', { dyn: -3, breath: .25, smile: .9, vib: .55, note: 'third above; cut off with him' }, L4h('then', 16, 0, 3));
// --- NOW (verse at bar 5): old, thin, careful. The holes are bars 7-8 and 11-12.
line('n1', 'he',  'now',  { dyn: -11, breath: .55, smile: 0, vib: .25, tremor: .4, lag: .05, note: 'almost to himself, the last syllable does not want to end because the answer is next' }, P1('now', 5, 0));
line('n2', 'he',  'now',  { dyn: -9, breath: .50, smile: 0, vib: .25, tremor: .5, lag: .07, note: 'braver, calls over his shoulder; the long note thins to air while he listens' }, P2('now', 9, 0));
line('n3', 'he',  'now',  { dyn: -10, breath: .5, smile: .1, vib: .3, tremor: .3, lag: .04, note: 'to the egg, a storyteller, tender' }, L3('now', 13, 0));
line('n4', 'he',  'now',  { dyn: -7, breath: .45, smile: 0, vib: .35, tremor: .8, lag: .03, broken: true, note: 'climbs, voice starts to shake; on "for" it catches (glottal catch, creak) and stops. "you" is never sung. What follows is one held breath and a shaky exhale.' }, L4('now', 17, 0, 7));
// --- STORM (bar 4..15), B minor: shouted singing, big voice, effort, wind
const s = 'storm';
line('s1', 'he', s, { dyn: 1, breath: .18, effort: .7, vib: .3, note: 'a father being brave out loud' }, [
  N('hold','HH OW L D',59,s,4,0,1), N('on','AA N',62,s,4,1,1), N('lit','L IH',61,s,4,2,.5), N('tle','T AH L',59,s,4,2.5,.5), N('heart','HH AA R T',61,s,5,0,2), N('it','IH T',59,s,5,2,.5), N('is','IH Z',61,s,5,2.5,.5), N('on','OW N',62,s,6,0,1), N('ly','L IY',61,s,6,1,1), N('the','DH AH',57,s,6,2,1), N('wind','W IH N D',59,s,7,0,2)]);
line('s2', 'he', s, { dyn: 2, breath: .16, effort: .8, vib: .3, note: 'louder than the sea' }, [
  N('the','DH AH',59,s,7,2,1), N('tide','T AY D',62,s,8,0,1), N('that','DH AE T',62,s,8,1,1), N('goes','G OW Z',62,s,8,2,1), N('out','AW T',64,s,9,0,1.5), N('is','IH Z',62,s,9,1.5,.5), N('the','DH AH',61,s,9,2,1), N('tide','T AY D',62,s,10,0,1), N('that','DH AE T',61,s,10,1,1), N('comes','K AH M Z',59,s,10,2,1), N('in','IH N',61,s,11,0,2)]);
line('s3', 'he', s, { dyn: 4, breath: .12, effort: 1, vib: .35, note: 'three steps up; the last "on" is a cry that the wave cuts off at 107.318 (voice stops dead into the crash)' }, [
  N('hold','HH OW L D',61,s,11,2,1), N('on','AA N',62,s,12,0,2), N('hold','HH OW L D',62,s,12,2,1), N('on','AA N',64,s,13,0,2), N('hold','HH OW L D',64,s,13,2,1), N('on','AA N',66,s,14,0,6)]);
// --- NIGHT: closed bill, hum. The egg is in his mouth. Answer 1 is late (bar 5), answer 2 is on time.
line('h1', 'he', 'night', { dyn: -13, breath: .35, hum: true, vib: .3, note: 'a lullaby through the nose, breath after the storm still in it' }, [
  N('mm','MM',50,'night',2,0,1), N('mm','MM',54,'night',2,1,1), N('mm','MM',57,'night',2,2,1), N('mm','MM',59,'night',3,0,2), N('mm','MM',57,'night',3,2,1.3)]);
line('h1a','he', 'night', { dyn: -15, breath: .45, hum: true, vib: .2, tremor: .7, note: 'THE TURN OF THE FILM: after a whole bar of waiting he hums her two notes himself, for the first time, barely' }, [
  N('mm','MM',57,'night',5,0,1), N('mm','MM',54,'night',5,1,1.9)]);
line('h2', 'he', 'night', { dyn: -12, breath: .32, hum: true, vib: .35, note: 'steadier' }, [
  N('mm','MM',50,'night',6,0,1), N('mm','MM',55,'night',6,1,1), N('mm','MM',59,'night',6,2,1), N('mm','MM',62,'night',7,0,2.6)]);
line('h2a','he', 'night', { dyn: -12, breath: .35, hum: true, vib: .35, note: 'her notes again, on time, given away gladly' }, [
  N('mm','MM',59,'night',8,0,1), N('mm','MM',55,'night',8,1,2.4)]);
line('h3', 'he', 'night', { dyn: -17, breath: .5, hum: true, vib: .25, note: 'the end of the verse he could not finish, hummed low, falling asleep: you-and-for-me' }, [
  N('mm','MM',54,'night',10,0,1), N('mm','MM',52,'night',10,1,1), N('mm','MM',49,'night',10,2,1), N('mm','MM',50,'night',11,0,2.2)]);
// --- DAWN: free time, half spoken. The bill opens for the first time since the wave.
const a0 = TIME.ask, n2 = (syl, ph, midi, t0, t1) => ({ syl, ph: ph.split(' '), midi, t0: a0 + t0, t1: a0 + t1 });
line('d1', 'he', 'dawn', { dyn: -12, breath: .6, vib: .15, tremor: .6, crack: true, spoken: .3, note: 'hoarse, unused, afraid to ask; cracks on "mor"; the last syllable rises a little, a real question' }, [
  n2('who','HH UW',50,0,.55), n2('rides','R AY D Z',54,.62,1.2), n2('the','DH AH',57,1.2,1.55), n2('mor','M AO R',59,1.58,2.55), n2('ning','N IH NG',57,2.55,3.6)]);
line('c0', 'chick', 'dawn', { note: 'the first answer: small, wet, not sure, but exactly her two notes' }, [
  { syl: 'wee', ph: ['W','IY'], midi: 93, t0: TIME.answer, t1: TIME.answer + .34 }, { syl: 'two', ph: ['T','UW'], midi: 90, t0: TIME.answer + .40, t1: TIME.answer + 1.0 }]);
line('c00','chick', 'dawn', { note: 'again, proud, louder' }, [
  { syl: 'wee', ph: ['W','IY'], midi: 93, t0: TIME.answer2, t1: TIME.answer2 + .26 }, { syl: 'two', ph: ['T','UW'], midi: 90, t0: TIME.answer2 + .30, t1: TIME.answer2 + .85 }]);
// --- RIDE (verse at bar 4, D; from bar 12 up a whole tone to E; tag at bar 20 slowing)
line('r1', 'he',  'ride', { dyn: -2, breath: .28, smile: .8, vib: .5, note: 'the old voice, young again, laughing at the edges' }, P1('ride', 4, 0));
line('r1a','chick','ride', { note: 'instant, too loud' }, [{ syl:'wee', ph:['W','IY'], midi:93, t0:T('ride',6,0), t1:T('ride',6,.8) }, { syl:'two', ph:['T','UW'], midi:90, t0:T('ride',6,1), t1:T('ride',6,2.3) }]);
line('r2', 'he',  'ride', { dyn: -1, breath: .25, smile: .9, vib: .55, note: 'big and free' }, P2('ride', 8, 0));
line('r2a','chick','ride', { note: 'trills the last note' }, [{ syl:'wee', ph:['W','IY'], midi:95, t0:T('ride',10,0), t1:T('ride',10,.8) }, { syl:'two', ph:['T','UW'], midi:91, t0:T('ride',10,1), t1:T('ride',10,2.5) }]);
line('r3', 'he',  'ride', { dyn: 0, breath: .2, smile: .7, vib: .6, effort: .25, note: 'key lifts to E, the whole band under him' }, L3('ride', 12, 2));
line('r4', 'he',  'ride', { dyn: 2, breath: .18, smile: .6, vib: .7, effort: .45, note: 'the line he could not finish. "you" is the top of the film, full voice, held a hair long' }, L4('ride', 16, 2, 99, 1.7));
line('r5', 'he',  'ride', { dyn: -2, breath: .28, smile: .7, vib: .6, note: 'once more, quieter, slowing, to the two of them' }, L4('ride', 20, 2, 99, 5));
line('r5h','she', 'ride', { dyn: -13, breath: .5, smile: .6, vib: .5, ghost: true, note: 'her voice, far away in the reverb, a third above: while the water shows her' }, L4h('ride', 20, 2, 5));
line('r5c','chick','ride', { note: 'last word' }, [{ syl:'wee', ph:['W','IY'], midi:95, t0:T('ride',24,1), t1:T('ride',24,1.7) }, { syl:'two', ph:['T','UW'], midi:92, t0:T('ride',24,2), t1:T('ride',25,.4) }]);
// non-sung human sounds (tract noise): t, kind, seconds, level dB
const sounds = [
  { t: T('now', 19, 1.1), kind: 'shaky-exhale', dur: 1.9, db: -18 }, { t: T('now', 20, 2), kind: 'sniff', dur: .4, db: -24 },
  { t: TIME.wave + .15, kind: 'gasp', dur: .5, db: -8 }, { t: TIME.catch_ + .9, kind: 'nose-pant', dur: 2.2, db: -20 },
  { t: 119.2, kind: 'shaky-exhale', dur: 1.6, db: -24 }, { t: 168.6, kind: 'inhale-shaky', dur: 1.2, db: -19 },
  { t: 175.6, kind: 'sigh', dur: 1.6, db: -22 }, { t: TIME.answer + 1.35, kind: 'gasp-soft', dur: .6, db: -18 },
  { t: 183.75, kind: 'laugh', dur: 1.5, db: -13 },
];
// ---------- harmony, one chord symbol per bar (band) ------------------------
const chords = {
  then: ['D','D','G/D','A7/D',  'D','G','D/F#','A7',  'G','Bm','Em7','A7',  'D','F#m','G','A7sus4',  'A/C#','Bm','Em7 A7','D'],
  now:  ['-','-','-','-','-',  'Bm7','Gmaj7','-','-',  'G','Bm/F#','-','-',  'D/F#','F#m','G','A7sus4',  'A/C#','Bm','A7sus4','-'],
  storm:['Bm','Bm/A','G','F#7',  'Bm','F#m/A','G','Bm',  'G','Em','G','F#7',  'Bm','Em','F#','F#7'],
  night:['D5','D5',  'D','G','-','D/F#',  'G','Bm','Em7','A7sus4',  'Em7 A7','D'],
  ride: ['D','D','G/D','A7/D',  'D','G','D/F#','A7',  'G','Bm','Em7','B7',  'E','G#m','A','B7sus4',  'B/D#','C#m','F#m7 B7','E',  'B/D#','C#m','F#m7 B7','E', 'E','E','E','E'],
};
// ---------- the machine: crank, wheel, road ---------------------------------
// one crank revolution per bar while pedalling. turns(t) = crank revolutions since film start; speed(t) m/s.
const GEAR = 2.15, WHEEL_R = .345;                    // wheel revolutions per crank revolution
const seg = [                                          // [t0, t1, rev/s at t0, rev/s at t1]
  [0, T('now', 0), 1/1.66667, 1/1.66667],
  [T('now', 0), 82.1, 1/2.25, 1/2.25], [82.1, 85.5, 1/2.25, .62],
  [85.5, 101.8, .62, .70], [101.8, 106.6, .70, .34], [106.6, 107.35, .34, 0], [107.35, 185.4, 0, 0],
  [185.4, 189.5, 0, 1/1.60714], [189.5, T('ride', 20), 1/1.60714, 1/1.60714], [T('ride', 20), 236, 1/1.60714, .40], [236, 400, .40, .40],
];
function rate(t) { for (const [a, b, r0, r1] of seg) if (t < b) return r0 + (r1 - r0) * Math.max(0, t - a) / (b - a); return .40; }
function turns(t) { let n = 0; for (const [a, b, r0, r1] of seg) { if (t <= a) break; const x = Math.min(t, b) - a, r = r0 + (r1 - r0) * x / (b - a); n += (r0 + r) * .5 * x; } return n; }
// phase offsets so the left pedal is down exactly on beat one of a bar in every riding section
const phase0 = t => t < sec.now.t0 - 1e-4 ? -turns(sec.then.t0) : t < 108 ? -turns(sec.now.t0) : -turns(T('ride', 4));
function crank(t) { const x = turns(t) + phase0(t); return x; }       // revolutions; frac = 0 at the downbeat
const speed = t => rate(t) * GEAR * 2 * Math.PI * WHEEL_R;             // metres per second
const dist = t => turns(t) * GEAR * 2 * Math.PI * WHEEL_R;             // metres along the road
// ---------- sound cues (foley). Data, so the edit can move. kind, t, {options}
const cues = [];
const cue = (t, kind, o = {}) => cues.push(Object.assign({ t, kind }, o));
// her bell rings with each answer THEN (two strokes), and the chick's, last
cue(T('then', 6), 'bell', { db: -14 }); cue(T('then', 6, 1), 'bell', { db: -13 });
cue(T('then', 10), 'bell', { db: -14 }); cue(T('then', 10, 1), 'bell', { db: -13 });
cue(T('storm', 2, 1), 'bell', { db: -20, loose: 1 }); cue(T('storm', 10, 1), 'bell', { db: -18, loose: 1 });
cue(T('ride', 6), 'bell', { db: -15 }); cue(T('ride', 6, 1), 'bell', { db: -14 });
cue(T('ride', 10), 'bell', { db: -15 }); cue(T('ride', 10, 1), 'bell', { db: -14 });
cue(TIME.bellEnd, 'bell', { db: -10 }); cue(TIME.bellEnd + .55, 'bell', { db: -9 });
// the lighthouse: one pass every two bars of the lullaby, timed so it lights him on the notes that matter
const SWEEP = { t0: sec.night.t0 + 3.6, P: 6 };
return { SWEEP, DUR, sec, T, TIME, lines, sounds, chords, GEAR, WHEEL_R, rate, turns, crank, speed, dist, cues, seg };
})();
if (typeof module !== 'undefined') module.exports = SCORE;
