// 環境音と音楽（すべて WebAudio でその場で合成。音声ファイルは使わない）
import * as THREE from './lib/three.module.min.js';
import { audioContext, onAudioReady, buses } from './audio.js';
import { settings } from './settings.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

let noiseBuf = null;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// ============================================================
// 楽器（out：出力先ノード, t：開始時刻）
// ============================================================
function env(c, g, t, a, peak, d, sustain = 0, rel = null) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  if (rel === null) g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  else {
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0002), t + a + d);
    g.gain.setValueAtTime(Math.max(sustain, 0.0002), t + rel);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rel + 0.25);
  }
}

function osc(c, type, f, t, stop, out) {
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  o.connect(out); o.start(t); o.stop(stop);
  return o;
}

function noiseSrc(c, t, dur, out) {
  const s = c.createBufferSource(); s.buffer = noise(c);
  s.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur);
  return s;
}

const I = {
  kick(c, out, t, vol = 1, hard = false) {
    const g = c.createGain(); g.connect(out);
    const o = osc(c, 'sine', hard ? 170 : 130, t, t + 0.5, g);
    o.frequency.exponentialRampToValueAtTime(hard ? 42 : 48, t + (hard ? 0.09 : 0.12));
    env(c, g, t, 0.002, 0.9 * vol, hard ? 0.38 : 0.3);
    if (hard) { // アタックのクリック
      const cg = c.createGain(); cg.connect(out);
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; f.connect(cg);
      noiseSrc(c, t, 0.02, f); env(c, cg, t, 0.001, 0.35 * vol, 0.015);
    }
  },
  snare(c, out, t, vol = 1, tight = false) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = tight ? 2600 : 1900; f.Q.value = 0.7; f.connect(g);
    noiseSrc(c, t, 0.3, f); env(c, g, t, 0.001, 0.55 * vol, tight ? 0.12 : 0.2);
    const tg = c.createGain(); tg.connect(out);
    osc(c, 'triangle', 190, t, t + 0.15, tg); env(c, tg, t, 0.001, 0.3 * vol, 0.08);
  },
  hat(c, out, t, vol = 1, open = false) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200; f.connect(g);
    noiseSrc(c, t, open ? 0.4 : 0.08, f); env(c, g, t, 0.001, 0.28 * vol, open ? 0.28 : 0.045);
  },
  ride(c, out, t, vol = 1) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 6200; f.Q.value = 0.6; f.connect(g);
    noiseSrc(c, t, 0.9, f); env(c, g, t, 0.002, 0.16 * vol, 0.7);
    const pg = c.createGain(); pg.connect(out);
    for (const r of [1, 1.47, 2.09]) osc(c, 'square', 420 * r, t, t + 0.6, pg);
    env(c, pg, t, 0.002, 0.012 * vol, 0.5);
  },
  crash(c, out, t, vol = 1) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 4000; f.connect(g);
    noiseSrc(c, t, 2, f); env(c, g, t, 0.003, 0.35 * vol, 1.6);
  },
  brush(c, out, t, dur, vol = 1) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 0.4; f.connect(g);
    noiseSrc(c, t, dur + 0.1, f);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05 * vol, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  },
  tom(c, out, t, f0, vol = 1) {
    const g = c.createGain(); g.connect(out);
    const o = osc(c, 'sine', f0 * 1.6, t, t + 0.5, g); o.frequency.exponentialRampToValueAtTime(f0, t + 0.08);
    env(c, g, t, 0.002, 0.7 * vol, 0.32);
  },
  bass(c, out, t, m, dur, vol = 1) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(g);
    osc(c, 'triangle', mtof(m), t, t + dur + 0.3, f);
    osc(c, 'sine', mtof(m - 12), t, t + dur + 0.3, f);
    env(c, g, t, 0.006, 0.5 * vol, 0.12, 0.25 * vol, t + dur);
  },
  epiano(c, out, t, notes, dur, vol = 1) {
    for (const m of notes) {
      const g = c.createGain(); g.connect(out);
      osc(c, 'sine', mtof(m), t, t + dur + 0.6, g);
      const hg = c.createGain(); hg.gain.value = 0.25; hg.connect(g);
      osc(c, 'sine', mtof(m) * 2.001, t, t + dur + 0.6, hg);
      env(c, g, t, 0.005, 0.09 * vol, 0.4, 0.04 * vol, t + dur);
    }
  },
  pluck(c, out, t, m, vol = 1, type = 'triangle', dur = 0.5) {
    const g = c.createGain(); g.connect(out);
    osc(c, type, mtof(m), t, t + dur + 0.1, g);
    env(c, g, t, 0.004, 0.12 * vol, dur);
  },
  vibe(c, out, t, m, vol = 1) {
    const g = c.createGain(); g.connect(out);
    osc(c, 'sine', mtof(m), t, t + 1.6, g);
    const h = c.createGain(); h.gain.value = 0.18; h.connect(g); osc(c, 'sine', mtof(m) * 4, t, t + 0.4, h);
    env(c, g, t, 0.003, 0.13 * vol, 1.4);
  },
  pad(c, out, t, notes, dur, vol = 1) {
    for (const m of notes) {
      const g = c.createGain(); g.connect(out);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(g);
      for (const d of [-6, 6]) { const o = osc(c, 'sawtooth', mtof(m), t, t + dur + 3, f); o.detune.value = d; }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.03 * vol, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 2.5);
    }
  },
  bell(c, out, t, m, vol = 1) {
    const g = c.createGain(); g.connect(out);
    for (const [r, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const hg = c.createGain(); hg.gain.value = a; hg.connect(g);
      osc(c, 'sine', mtof(m) * r, t, t + 4, hg);
    }
    env(c, g, t, 0.004, 0.07 * vol, 3.5);
  },
  acid(c, out, t, m, dur, cutoff, accent, slideFrom = null) {
    const g = c.createGain(); g.connect(out);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = accent ? 18 : 12; f.connect(g);
    const o = osc(c, 'sawtooth', mtof(slideFrom ?? m), t, t + dur + 0.05, f);
    if (slideFrom !== null) o.frequency.exponentialRampToValueAtTime(mtof(m), t + dur * 0.6);
    f.frequency.setValueAtTime(cutoff * (accent ? 5 : 3), t);
    f.frequency.exponentialRampToValueAtTime(cutoff, t + dur * 0.9);
    env(c, g, t, 0.003, (accent ? 0.26 : 0.17), dur * 0.95);
  },
};

// ============================================================
// 曲
// ============================================================
// 各曲は bpm と 1拍あたりの刻み数を持ち、step(i, t, d) で i 番目の刻みを予約する
class Track {
  constructor(player) { this.p = player; this.c = player.c; }
  get out() { return this.p.dry; }
  get wet() { return this.p.wet; }
}

// ---- 1. アンビエント ----
class AmbientTrack extends Track {
  constructor(p) { super(p); this.bpm = 60; this.spb = 1; this.chords = [[50, 57, 62, 64, 69], [48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [47, 54, 59, 62, 66]]; }
  step(i, t, d) {
    const c = this.c;
    if (i % 8 === 0) {
      const ch = this.chords[(i / 8) % this.chords.length];
      I.pad(c, this.wet, t, ch, d * 8, 1);
      I.bass(c, this.wet, t, ch[0] - 12, d * 7, 0.35);
    }
    if (Math.random() < 0.45) {
      const ch = this.chords[Math.floor(i / 8) % this.chords.length];
      I.bell(c, this.wet, t + rnd(0, d * 0.5), pick(ch) + 24, 0.8);
    }
    if (i % 16 === 12 && Math.random() < 0.6) I.brush(c, this.wet, t, d * 3, 0.6);
  }
}

// ---- 2. スロージャズ（三連の刻み） ----
const JAZZ_SLOW = [ // Fメジャー：| Gm7 | C7 | Fmaj7 | D7 | Gm7 | C7 | Am7 D7 | Gm7 C7 |
  [[55, 58, 62, 65], 43], [[52, 58, 60, 64], 36], [[53, 57, 60, 64], 41], [[54, 57, 60, 62], 38],
  [[55, 58, 62, 65], 43], [[52, 58, 60, 64], 36], [[55, 60, 64, 67], 45], [[52, 58, 60, 64], 36],
];
class SlowJazz extends Track {
  constructor(p) { super(p); this.bpm = 72; this.spb = 3; }
  step(i, t, d) {
    const c = this.c, beat = Math.floor(i / 3), sub = i % 3, bar = Math.floor(beat / 4), b = beat % 4;
    const [chord, root] = JAZZ_SLOW[bar % JAZZ_SLOW.length];
    const [, nextRoot] = JAZZ_SLOW[(bar + 1) % JAZZ_SLOW.length];
    // ライド：チン、チンチキ、チン、チンチキ
    if (sub === 0) I.ride(c, this.out, t, 0.55);
    if (sub === 2 && (b === 1 || b === 3)) I.ride(c, this.out, t, 0.4);
    if (sub === 0 && (b === 1 || b === 3)) I.hat(c, this.out, t, 0.35);
    if (sub === 0) I.brush(c, this.out, t, d * 2.6, 0.7);
    // ウォーキングベース
    if (sub === 0) {
      const tones = [root, root + 4 + (chord[1] - chord[0] === 3 ? -1 : 0), root + 7, nextRoot + pick([-1, 1, -2])];
      I.bass(c, this.out, t, b === 3 ? tones[3] : b === 0 ? root : tones[b] + (Math.random() < 0.3 ? 12 : 0), d * 2.6, 0.9);
    }
    // エレピのコンピング
    if ((b === 0 && sub === 2 && Math.random() < 0.6) || (b === 1 && sub === 2 && Math.random() < 0.5) || (b === 3 && sub === 0 && Math.random() < 0.35)) {
      I.epiano(c, this.wet, t, chord, d * rnd(2, 5), 1);
    }
    // ときどきビブラフォンのメロディ
    if (sub !== 1 && Math.random() < 0.18 && bar % 4 !== 3) {
      const scale = [65, 67, 69, 70, 72, 74, 76, 77];
      I.vibe(c, this.wet, t, pick(chord) + 12 + (Math.random() < 0.3 ? pick([2, -1]) : 0) || pick(scale), 0.9);
    }
  }
}

// ---- 3. 速いスウィング ----
const SWING = [ // B♭：| B♭maj7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | E♭maj7 E°7 | B♭/F G7 | Cm7 F7 | B♭6 |
  [[50, 53, 57, 58], 46], [[53, 55, 59, 62], 43], [[51, 55, 58, 60], 48], [[51, 53, 57, 58], 41],
  [[53, 57, 60, 62], 50], [[53, 55, 59, 62], 43], [[51, 55, 58, 60], 48], [[51, 53, 57, 58], 41],
  [[50, 55, 58, 63], 51], [[49, 55, 58, 64], 52], [[50, 53, 58, 62], 53], [[53, 55, 59, 62], 43],
  [[51, 55, 58, 60], 48], [[51, 53, 57, 58], 41], [[50, 53, 55, 58], 46], [[50, 53, 55, 58], 46],
];
class FastSwing extends Track {
  constructor(p) { super(p); this.bpm = 208; this.spb = 3; this.melody = 70; }
  step(i, t, d) {
    const c = this.c, beat = Math.floor(i / 3), sub = i % 3, b = beat % 4;
    const half = Math.floor(beat / 2); // 2拍ごとにコード
    const [chord, root] = SWING[half % SWING.length];
    const [, nextRoot] = SWING[(half + 1) % SWING.length];
    if (sub === 0) I.ride(c, this.out, t, 0.6);
    if (sub === 2 && (b === 1 || b === 3)) I.ride(c, this.out, t, 0.45);
    if (sub === 0 && (b === 1 || b === 3)) I.hat(c, this.out, t, 0.45);
    if (sub === 0) I.kick(c, this.out, t, 0.18);
    // スネアのコンピング（三連の裏）
    if (sub === 2 && Math.random() < 0.22) I.snare(c, this.out, t, 0.35, true);
    if (beat % 32 === 31 && sub === 0) I.crash(c, this.out, t + d * 3, 0.6);
    // ウォーキングベース（4分音符）
    if (sub === 0) {
      const opts = beat % 2 === 0 ? [root, root + 12] : [nextRoot + pick([-1, 1]), root + 7, root + pick([3, 4])];
      I.bass(c, this.out, t, pick(opts), d * 2.4, 1);
    }
    // チャールストンのリズムでピアノ
    if ((b === 0 && sub === 0) || (b === 1 && sub === 2)) I.epiano(c, this.out, t, chord.map(m => m + 12), d * 1.4, 0.9);
    // ビバップ風の8分音符のライン（2小節ごとに休む）
    const bar = Math.floor(beat / 4);
    if (bar % 4 < 3 && sub !== 1) {
      const scale = chord.map(m => m + 12).concat(chord.map(m => m + 24));
      if (Math.random() < 0.85) {
        let target = pick(scale);
        if (Math.abs(target - this.melody) > 7) target = this.melody + Math.sign(target - this.melody) * pick([1, 2, 3, 4]);
        this.melody = Math.max(65, Math.min(86, target));
        I.pluck(c, this.wet, t + (sub === 2 ? d * 0.08 : 0), this.melody, sub === 0 ? 1 : 0.7, 'triangle', 0.22);
      }
    }
  }
}

// ---- 4. サイケデリックテクノ（16分・ドラムを激しく） ----
class PsyTechno extends Track {
  constructor(p) {
    super(p);
    this.bpm = 144; this.spb = 4;
    const c = this.c;
    // 歪み
    this.drive = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) { const x = k / 512 - 1; curve[k] = Math.tanh(x * 3.2); }
    this.drive.curve = curve;
    this.drive.connect(p.dry);
    // ディレイ（サイケなアルペジオ用）
    this.delay = c.createDelay(1); this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = c.createGain(); fb.gain.value = 0.45;
    const df = c.createBiquadFilter(); df.type = 'bandpass'; df.frequency.value = 1800;
    this.delay.connect(df); df.connect(fb); fb.connect(this.delay); df.connect(p.wet);
    this.arpIn = c.createGain(); this.arpIn.connect(this.delay); this.arpIn.connect(p.dry);
    this.newPattern();
  }
  newPattern() {
    const scale = [33, 34, 36, 38, 40, 41, 43, 45]; // A フリジアン
    this.bassPat = Array.from({ length: 16 }, (_, i) => ({
      on: i % 4 === 2 || Math.random() < 0.55,
      m: i % 4 === 2 ? 33 : pick(scale) + (Math.random() < 0.25 ? 12 : 0),
      acc: Math.random() < 0.3, slide: Math.random() < 0.2,
    }));
    this.arpPat = Array.from({ length: 16 }, () => pick([57, 58, 60, 64, 65, 69, 70, 72, 76]));
  }
  step(i, t, d) {
    const c = this.c, s = i % 16, bar = Math.floor(i / 16), phrase = bar % 8, D = this.drive;
    if (s === 0 && bar % 4 === 0) this.newPattern();
    const fill = phrase === 7 && s >= 8;
    const breakdown = bar % 32 >= 28;
    // キック：4つ打ち＋フィルで連打
    if (!breakdown && (s % 4 === 0 || (fill && s % 2 === 0) || (Math.random() < 0.08 && s % 4 === 3))) I.kick(c, D, t, 1, true);
    if (s === 0 && phrase === 0) I.crash(c, this.out, t, 0.9);
    // ハイハット：16分＋32分のロール＋裏のオープン
    if (!fill) {
      I.hat(c, this.out, t, s % 2 ? 0.55 : 0.85, s % 4 === 2);
      if (Math.random() < 0.35) I.hat(c, this.out, t + d / 2, 0.45);
      if (Math.random() < 0.12) { I.hat(c, this.out, t + d / 3, 0.4); I.hat(c, this.out, t + d * 2 / 3, 0.4); }
    }
    // スネア：2・4拍＋ゴースト＋小節の終わりのロール
    if (s === 4 || s === 12) I.snare(c, D, t, 1, true);
    else if (Math.random() < 0.18) I.snare(c, this.out, t, 0.3, true);
    if (bar % 2 === 1 && s >= 14) { I.snare(c, D, t, 0.6, true); I.snare(c, D, t + d / 2, 0.7, true); }
    // フィル：スネアの32分連打とタムの駆け下り
    if (fill) {
      const k = (s - 8) / 8;
      I.snare(c, D, t, 0.5 + k * 0.5, true); I.snare(c, D, t + d / 2, 0.5 + k * 0.5, true);
      if (s >= 12) I.tom(c, D, t, [220, 180, 150, 120][s - 12], 0.9);
    }
    if (Math.random() < 0.06) I.tom(c, D, t, pick([130, 170, 210]), 0.6);
    // アシッドベース：カットオフをゆっくり揺らしてうねらせる
    if (!breakdown || bar % 2 === 1) {
      const n = this.bassPat[s];
      if (n.on) {
        const lfo = 300 + 1400 * (0.5 + 0.5 * Math.sin((i / 64) * Math.PI * 2));
        const prev = this.bassPat[(s + 15) % 16];
        I.acid(c, D, t, n.m, d * (n.slide ? 1.6 : 0.9), lfo, n.acc, n.slide && prev.on ? prev.m : null);
      }
    }
    // サイケなアルペジオ（後半8小節だけ）
    if (bar % 16 >= 8) I.pluck(c, this.arpIn, t, this.arpPat[s] + (bar % 2 ? 12 : 0), 0.7, 'square', 0.12);
    // ブレイク前のノイズの上昇音
    if (bar % 8 === 7 && s === 0) {
      const g = c.createGain(); g.connect(this.wet);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.connect(g);
      f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(8000, t + d * 16);
      noiseSrc(c, t, d * 16, f);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + d * 15.5); g.gain.linearRampToValueAtTime(0.0001, t + d * 16);
    }
  }
}

export const TRACKS = [
  { id: 'ambient', name: 'アンビエント', cls: AmbientTrack },
  { id: 'slowjazz', name: 'スロージャズ', cls: SlowJazz },
  { id: 'swing', name: 'スウィング', cls: FastSwing },
  { id: 'psytechno', name: 'サイケテクノ', cls: PsyTechno },
];

// ============================================================
// 1台のグラモフォンの再生
// ============================================================
class Player {
  constructor(c, trackId) {
    this.c = c;
    // 出力：dry/wet → 音量 → 立体音響（家具の位置から聞こえる） → 音楽の出力
    this.panner = c.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1.4; this.panner.rolloffFactor = 0.9; this.panner.maxDistance = 30;
    this.panner.connect(buses.music);
    // 曲ごとの音量差をならす
    const level = { ambient: 2.8, slowjazz: 1.45, swing: 0.8, psytechno: 0.85 }[trackId] || 1;
    this.out = c.createGain(); this.out.gain.value = 0.0001; this.out.connect(this.panner);
    this.out.gain.setTargetAtTime(level, c.currentTime, 0.4);
    // 蓄音機らしく少しだけ帯域を絞る
    const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = trackId === 'psytechno' ? 16000 : 9000; tone.connect(this.out);
    this.dry = c.createGain(); this.dry.connect(tone);
    const rev = c.createConvolver(); rev.buffer = buses.reverb.buffer;
    this.wet = c.createGain(); this.wet.connect(this.dry); this.wet.connect(rev);
    const rg = c.createGain(); rg.gain.value = 0.35; rev.connect(rg); rg.connect(tone);
    const T = TRACKS.find(x => x.id === trackId) || TRACKS[0];
    this.track = new T.cls(this);
    this.step = 0;
    this.next = c.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  schedule() {
    const c = this.c, d = 60 / this.track.bpm / this.track.spb;
    while (this.next < c.currentTime + 0.12) {
      try { this.track.step(this.step, this.next, d); } catch (e) { console.warn(e); }
      this.step++; this.next += d;
    }
  }
  setPosition(p) {
    const t = this.c.currentTime;
    this.panner.positionX.setTargetAtTime(p.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(p.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(p.z, t, 0.05);
  }
  stop() {
    clearInterval(this.timer);
    const t = this.c.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.0001, t, 0.15);
    setTimeout(() => { try { this.panner.disconnect(); } catch { /* 無視 */ } }, 1500);
  }
}

// ============================================================
// グラモフォンの管理（同時に鳴らすのは1台）
// ============================================================
export class MusicManager {
  constructor(app) {
    this.app = app;
    this.furn = null;
    this.player = null;
    this.ambient = new AmbientEngine();
  }
  isPlaying(furn) { return this.furn === furn && !!this.player; }

  play(furn, trackId) {
    const c = audioContext();
    if (!c) return;
    // ほかのグラモフォンは止める
    for (const f of this.app.world ? this.app.world.furniture.values() : []) if (f !== furn && f.state.track) f.state.track = null;
    this.stopPlayer();
    furn.state.track = trackId;
    furn.state.lastTrack = trackId;
    this.furn = furn;
    const start = () => {
      if (this.furn !== furn || furn.state.track !== trackId || this.player) return;
      this.player = new Player(c, trackId);
      this.update();
      this.ambient.duck(true);
    };
    if (c.state === 'running') start(); else onAudioReady(start);
    this.app.markDirty && this.app.markDirty();
  }

  stop(furn = this.furn) {
    if (furn) furn.state.track = null;
    if (furn === this.furn) { this.stopPlayer(); this.furn = null; }
  }

  stopPlayer() {
    if (this.player) { this.player.stop(); this.player = null; }
    this.ambient.duck(false);
  }

  toggle(furn) {
    if (furn.state.track) this.stop(furn);
    else this.play(furn, furn.state.lastTrack || TRACKS[0].id);
    this.app.markDirty();
  }

  // 宮殿に入ったとき：再生中だったグラモフォンを鳴らし直す
  syncFromWorld() {
    this.stopAll();
    if (!this.app.world) return;
    const f = [...this.app.world.furniture.values()].find(f => f.type === 'gramophone' && f.state.track);
    if (f) this.play(f, f.state.track);
  }

  stopAll() { this.stopPlayer(); this.furn = null; }

  // 毎フレーム：聞く位置（カメラ）と音の出る位置（ラッパ）を更新
  update() {
    const c = audioContext && this.player ? this.player.c : null;
    if (this.furn) {
      const w = this.app.world;
      if (!w || !w.furniture.has(this.furn.id) || !this.furn.root.parent) { this.stop(); return; }
      if (!this.furn.state.track) { this.stop(); return; }
    }
    if (!c) return;
    const cam = this.app.camera;
    const p = new THREE.Vector3(); cam.getWorldPosition(p);
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const L = c.listener, t = c.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.03); L.positionY.setTargetAtTime(p.y, t, 0.03); L.positionZ.setTargetAtTime(p.z, t, 0.03);
      L.forwardX.setTargetAtTime(f.x, t, 0.03); L.forwardY.setTargetAtTime(f.y, t, 0.03); L.forwardZ.setTargetAtTime(f.z, t, 0.03);
      L.upX.setTargetAtTime(u.x, t, 0.03); L.upY.setTargetAtTime(u.y, t, 0.03); L.upZ.setTargetAtTime(u.z, t, 0.03);
    } else {
      L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    const src = this.furn.inner.getObjectByName('horn-mouth') || this.furn.root;
    const sp = new THREE.Vector3(); src.getWorldPosition(sp);
    this.player.setPosition(sp);
  }
}

// ============================================================
// 環境音：ときどき、断片的な音がどこからともなく鳴る
// ============================================================
class AmbientEngine {
  constructor() {
    this.ducked = false;
    this.started = false;
    onAudioReady(c => this.start(c));
  }
  start(c) {
    if (this.started) return;
    this.started = true;
    this.c = c;
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(buses.ambient);
    this.timer = setTimeout(() => this.tick(), rnd(4000, 9000));
  }
  duck(on) {
    this.ducked = on;
    if (this.out) this.out.gain.setTargetAtTime(on ? 0.25 : 1, this.c.currentTime, 1.5);
  }
  tick() {
    try { if (settings.ambient && settings.ambientVolume > 0 && document.visibilityState === 'visible') this.fragment(); } catch (e) { console.warn(e); }
    this.timer = setTimeout(() => this.tick(), rnd(14000, 38000));
  }
  // 断片の種類：鐘・和音のふくらみ・風・低い響き・まばらな音
  fragment() {
    const c = this.c, t = c.currentTime + 0.1;
    const dest = this.out, wet = buses.reverb;
    const keys = [50, 52, 55, 57, 59, 62, 64, 67, 69, 71, 74];
    const kind = pick(['bells', 'bells', 'swell', 'wind', 'drone', 'plucks']);
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const out = c.createGain(); out.gain.value = 1;
    if (pan) { pan.pan.value = rnd(-0.7, 0.7); out.connect(pan); pan.connect(dest); pan.connect(wet); }
    else { out.connect(dest); out.connect(wet); }
    if (kind === 'bells') {
      let tt = t; const n = Math.floor(rnd(2, 5));
      for (let k = 0; k < n; k++) { I.bell(c, out, tt, pick(keys) + 12, 0.7); tt += rnd(0.4, 1.3); }
    } else if (kind === 'swell') {
      const root = pick([45, 47, 48, 50, 52]);
      I.pad(c, out, t, [root, root + 7, root + pick([14, 16]), root + pick([19, 21])], rnd(5, 9), 0.9);
    } else if (kind === 'wind') {
      const g = c.createGain(); g.connect(out);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.connect(g);
      f.frequency.setValueAtTime(rnd(300, 600), t); f.frequency.linearRampToValueAtTime(rnd(700, 1400), t + 3); f.frequency.linearRampToValueAtTime(rnd(300, 600), t + 6.5);
      noiseSrc(c, t, 7, f);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 3); g.gain.linearRampToValueAtTime(0.0001, t + 7);
    } else if (kind === 'drone') {
      const g = c.createGain(); g.connect(out);
      const r = pick([38, 40, 43]);
      for (const m of [r, r + 7]) { const o = osc(c, 'sine', mtof(m), t, t + 9, g); o.detune.value = rnd(-4, 4); }
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 3.5); g.gain.linearRampToValueAtTime(0.0001, t + 9);
    } else {
      let tt = t; let m = pick(keys) + 12;
      for (let k = 0; k < 4; k++) { I.vibe(c, out, tt, m, 0.6); m -= pick([2, 3, 5]); tt += rnd(0.5, 0.9); }
    }
  }
}
