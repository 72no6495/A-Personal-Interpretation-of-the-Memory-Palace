// 静かな効果音（WebAudio で合成）
import { settings } from './settings.js';

let ctx = null;
let master = null;   // 効果音
let scratch = null;  // ペン描画中の擦れ音
// 環境音・音楽用の出力（音量は設定で別々に調整）
export const buses = { ambient: null, music: null, reverb: null };
const unlockListeners = [];

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    // 音楽：最後に軽くコンプレッサーをかけて音割れを防ぐ
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ctx.destination);
    buses.music = ctx.createGain(); buses.music.connect(comp);
    buses.ambient = ctx.createGain(); buses.ambient.connect(ctx.destination);
    // 録画用：聞こえている音（効果音・環境音・音楽）をまとめて取り出す
    if (ctx.createMediaStreamDestination) {
      buses.record = ctx.createMediaStreamDestination();
      master.connect(buses.record); buses.ambient.connect(buses.record); comp.connect(buses.record);
    }
    // モニターの波形表示用：聞こえている音をまとめて分析する
    buses.analyser = ctx.createAnalyser();
    buses.analyser.fftSize = 2048; buses.analyser.smoothingTimeConstant = 0.78;
    master.connect(buses.analyser); buses.ambient.connect(buses.analyser); comp.connect(buses.analyser);
    // 共有の残響
    buses.reverb = ctx.createConvolver();
    buses.reverb.buffer = impulse(ctx, 3.2, 2.4);
    buses.reverbOut = ctx.createGain(); buses.reverbOut.gain.value = 1;
    buses.reverb.connect(buses.reverbOut);
    buses.reverbOut.connect(buses.ambient);
  }
  if (ctx.state === 'suspended') ctx.resume();
  applyVolumes();
  if (ctx.state === 'running' && unlockListeners.length) unlockListeners.splice(0).forEach(f => f(ctx));
  return ctx;
}

export function applyVolumes() {
  if (!ctx) return;
  master.gain.value = settings.volume * 0.6;
  const t = ctx.currentTime;
  buses.ambient.gain.setTargetAtTime(settings.ambient ? settings.ambientVolume * 0.9 : 0, t, 0.3);
  buses.music.gain.setTargetAtTime(settings.musicVolume * 0.9, t, 0.1);
}

export function audioContext() { return ensure(); }
// 音が鳴らせる状態になったら呼ぶ（初回のタップ後など）
export function onAudioReady(fn) {
  if (ctx && ctx.state === 'running') fn(ctx); else unlockListeners.push(fn);
}

// 残響用のインパルス応答（減衰するノイズ）
function impulse(c, seconds, decay) {
  const len = Math.floor(c.sampleRate * seconds);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state !== 'running') c.resume().then(() => ensure());
}

function tone(freq, { dur = 0.12, type = 'sine', gain = 0.12, attack = 0.005, delay = 0, slideTo = null } = {}) {
  const c = ensure(); if (!c || settings.volume <= 0) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noiseBuffer() {
  const c = ensure(); if (!c) return null;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.0, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function noise({ dur = 0.08, gain = 0.05, freq = 1200, q = 0.8, type = 'bandpass', delay = 0 } = {}) {
  const c = ensure(); if (!c || settings.volume <= 0) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer();
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

export const sfx = {
  click() { tone(880, { dur: 0.06, gain: 0.05 }); },
  hover() { tone(1320, { dur: 0.03, gain: 0.015 }); },
  tool() { tone(660, { dur: 0.07, gain: 0.05 }); tone(990, { dur: 0.08, gain: 0.03, delay: 0.04 }); },
  color() { tone(1046, { dur: 0.05, gain: 0.035 }); },
  place() { tone(180, { dur: 0.18, gain: 0.12, slideTo: 120 }); noise({ dur: 0.06, gain: 0.03, freq: 400 }); },
  pick() { tone(520, { dur: 0.06, gain: 0.05, slideTo: 700 }); },
  remove() { tone(600, { dur: 0.16, gain: 0.05, slideTo: 300 }); },
  paste() { tone(740, { dur: 0.08, gain: 0.05 }); tone(1110, { dur: 0.1, gain: 0.035, delay: 0.05 }); },
  undo() { tone(500, { dur: 0.07, gain: 0.04, slideTo: 420 }); },
  redo() { tone(420, { dur: 0.07, gain: 0.04, slideTo: 500 }); },
  save() { tone(784, { dur: 0.25, gain: 0.05 }); tone(1175, { dur: 0.35, gain: 0.04, delay: 0.09 }); },
  error() { tone(220, { dur: 0.15, gain: 0.06, type: 'triangle' }); },
  step() { if (settings.footsteps) noise({ dur: 0.07, gain: 0.025, freq: 260 + Math.random() * 60, q: 1.2, type: 'lowpass' }); },
  door() { tone(392, { dur: 0.6, gain: 0.05 }); tone(523, { dur: 0.7, gain: 0.04, delay: 0.15 }); tone(659, { dur: 0.9, gain: 0.03, delay: 0.3 }); },
  arrive() { tone(523, { dur: 1.2, gain: 0.035 }); tone(784, { dur: 1.4, gain: 0.025, delay: 0.2 }); tone(1046, { dur: 1.6, gain: 0.018, delay: 0.4 }); },
  open() { tone(660, { dur: 0.1, gain: 0.04 }); },
  openDrawer() { noise({ dur: 0.22, gain: 0.03, freq: 520, q: 0.7 }); tone(300, { dur: 0.1, gain: 0.03, delay: 0.16 }); },
  closeDrawer() { noise({ dur: 0.16, gain: 0.03, freq: 420, q: 0.7 }); tone(170, { dur: 0.12, gain: 0.07, delay: 0.12 }); },
  lightOn() { tone(1200, { dur: 0.04, gain: 0.04, type: 'triangle' }); tone(900, { dur: 0.05, gain: 0.02, delay: 0.03 }); },
  lightOff() { tone(800, { dur: 0.04, gain: 0.04, type: 'triangle' }); tone(600, { dur: 0.05, gain: 0.02, delay: 0.03 }); },
  shutter() { noise({ dur: 0.05, gain: 0.06, freq: 3000, q: 0.6 }); noise({ dur: 0.07, gain: 0.05, freq: 1800, q: 0.6, delay: 0.07 }); },

  // ペンの擦れ音（ごく小さく）
  scratchStart(eraser = false) {
    const c = ensure(); if (!c || settings.volume <= 0) return;
    this.scratchStop();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(); src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = eraser ? 900 : 2600; f.Q.value = 0.9;
    const g = c.createGain(); g.gain.value = 0.0001;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
    scratch = { src, g };
  },
  scratchSpeed(v) {
    if (!scratch || !ctx) return;
    const target = Math.min(0.022, v * 0.0009);
    scratch.g.gain.setTargetAtTime(target, ctx.currentTime, 0.03);
  },
  scratchStop() {
    if (!scratch || !ctx) return;
    const s = scratch; scratch = null;
    s.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
    setTimeout(() => { try { s.src.stop(); } catch { /* 無視 */ } }, 200);
  },
};
