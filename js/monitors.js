// モニターの画面：その宮殿の情報や統計を映す
import * as THREE from './lib/three.module.min.js';
import { TRACKS } from './music.js';
import { MOUNT_NAMES } from './furniture.js';

export const MONITOR_TYPES = new Set(['monitor', 'wallmonitor', 'wallmonitorL']);
export const PAGES = [
  { id: 'auto', name: '自動' },
  { id: 'overview', name: '概要' },
  { id: 'furniture', name: '家具' },
  { id: 'drawing', name: '描画' },
  { id: 'clock', name: '時計' },
];
const CYCLE = ['overview', 'furniture', 'drawing', 'clock'];
const AUTO_SEC = 9;
const ROOM_LABELS = { floor: '床', ceiling: '天井', wall_n: '正面の壁', wall_s: 'ドアの壁', wall_w: '左の壁', wall_e: '右の壁' };
const FONT = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';
const C = { bg: '#14161a', panel: '#1d2026', line: '#2a2e36', text: '#f2f3f5', sub: '#8b909a', accent: '#5b9bff', warm: '#f2b632', green: '#6fcf6a' };

export class Monitors {
  constructor(app) {
    this.app = app;
    this.screens = new Map(); // furn.id → { canvas, ctx, tex, mesh }
    this.t = 0;
    this.lastDraw = 0;
    this.statsCache = null;
    this.inkCache = new Map(); // surface.key → { version, ratio }
  }

  isMonitor(f) { return !!f && f.kind === 'furniture' && MONITOR_TYPES.has(f.type); }

  // ページ（auto のときは時間で切り替わる）
  pageOf(f) {
    const p = f.state.monitorPage || 'auto';
    if (p !== 'auto') return p;
    return CYCLE[Math.floor(this.t / AUTO_SEC + (f.state.autoOffset || 0)) % CYCLE.length];
  }
  setPage(f, page) { f.state.monitorPage = page; this.app.markDirty(); this.drawAll(true); }
  next(f) {
    const cur = this.pageOf(f);
    f.state.monitorPage = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    this.app.markDirty();
    this.drawAll(true);
  }

  update(dt) {
    const w = this.app.world;
    if (!w) return;
    this.t += dt;
    w.stats.timeMs += dt * 1000;
    if (this.t - this.lastDraw < 1) return;
    this.drawAll(false);
  }

  drawAll(force) {
    const w = this.app.world;
    if (!w) return;
    this.lastDraw = this.t;
    const live = new Set();
    let stats = null;
    for (const f of w.furniture.values()) {
      if (!MONITOR_TYPES.has(f.type) || !f.root.parent) continue;
      live.add(f.id);
      const scr = this.screenFor(f);
      if (!scr) continue;
      stats = stats || this.collect();
      this.draw(scr, f, stats);
    }
    for (const id of [...this.screens.keys()]) if (!live.has(id)) { this.screens.get(id).tex.dispose(); this.screens.delete(id); }
  }

  // 家具の作り直し（色の変更など）で画面のメッシュが替わっても付け直す
  screenFor(f) {
    const mesh = f.inner.getObjectByName('screen-display');
    if (!mesh) return null;
    let s = this.screens.get(f.id);
    if (!s) {
      const g = mesh.geometry.parameters, ar = g.width / g.height;
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = Math.round(1280 / ar);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      s = { canvas, ctx: canvas.getContext('2d'), tex, mesh: null };
      this.screens.set(f.id, s);
      if (f.state.autoOffset === undefined) f.state.autoOffset = Math.floor(Math.random() * CYCLE.length);
    }
    if (s.mesh !== mesh) {
      mesh.material = new THREE.MeshBasicMaterial({ map: s.tex, toneMapped: false });
      s.mesh = mesh;
    }
    return s;
  }

  // ---------- 統計を集める ----------
  collect() {
    const app = this.app, w = app.world;
    const furn = [...w.furniture.values()].filter(f => f.root.parent);
    const byMount = { floor: 0, wall: 0, ceiling: 0, small: 0 };
    const byType = new Map();
    let lightsOn = 0, lights = 0, openParts = 0;
    for (const f of furn) {
      byMount[f.def.mount]++;
      byType.set(f.def.name, (byType.get(f.def.name) || 0) + 1);
      if (w.hasLight(f) && !MONITOR_TYPES.has(f.type)) { lights++; if (f.state.light !== false) lightsOn++; }
      openParts += Object.values(f.state.open || {}).filter(Boolean).length;
    }
    const imgs = [...w.images.values()].filter(i => i.root.parent);
    const ink = [];
    for (const key of Object.keys(ROOM_LABELS)) {
      const s = w.surfaces.get(key);
      ink.push({ label: ROOM_LABELS[key], ratio: s ? this.inkRatio(s) : 0 });
    }
    let furnDrawn = 0;
    for (const s of w.surfaces.values()) if (s.kind !== 'room' && s.hasContent && this.inkRatio(s) > 0) furnDrawn++;
    const playing = app.music.furn && app.music.player ? (TRACKS.find(t => t.id === app.music.furn.state.track) || {}).name : null;
    return {
      name: w.name, created: w.created, saved: app.lastSaved || null,
      furniture: furn.length - byMount.small, small: byMount.small,
      images: imgs.filter(i => !i.isText && !i.isSticky).length, texts: imgs.filter(i => i.isText).length, stickies: imgs.filter(i => i.isSticky).length,
      byMount, top: [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      ink, furnDrawn, strokes: w.stats.strokes || 0, visits: w.stats.visits || 1, timeMs: w.stats.timeMs || 0,
      lights, lightsOn, openParts, playing,
    };
  }

  // 面にどれくらい描いてあるか（縮小して不透明な画素の割合を数える。描き直したときだけ数え直す）
  inkRatio(s) {
    if (!s.hasContent) return 0;
    const c = this.inkCache.get(s.key);
    if (c && c.version === s.version) return c.ratio;
    if (!this.probe) { this.probe = document.createElement('canvas'); this.probe.width = this.probe.height = 96; this.pctx = this.probe.getContext('2d', { willReadFrequently: true }); }
    const p = this.pctx;
    p.clearRect(0, 0, 96, 96);
    p.drawImage(s.canvas, 0, 0, 96, 96);
    const d = p.getImageData(0, 0, 96, 96).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 12) n++;
    const ratio = n / (96 * 96);
    this.inkCache.set(s.key, { version: s.version, ratio });
    return ratio;
  }

  // ---------- 描く ----------
  draw(scr, f, st) {
    const x = scr.ctx, W = scr.canvas.width, H = scr.canvas.height;
    const u = W / 100; // 幅の 1%
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    if (f.state.light === false) { scr.tex.needsUpdate = true; return; } // 電源オフ
    const page = this.pageOf(f);
    x.textBaseline = 'middle';
    // ヘッダー
    const title = { overview: '概要', furniture: '家具', drawing: '描画', clock: '時計' }[page];
    text(x, st.name, 4 * u, 6 * u, 3.2 * u, C.text, 500, 'left', 60 * u);
    text(x, title, W - 4 * u, 6 * u, 2.6 * u, C.sub, 400, 'right');
    CYCLE.forEach((p, i) => { x.fillStyle = p === page ? C.accent : C.line; x.beginPath(); x.arc(W - 4 * u - (CYCLE.length - 1 - i) * 2.2 * u, 10 * u, 0.6 * u, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = C.line; x.fillRect(4 * u, 12.5 * u, W - 8 * u, 0.15 * u);
    const top = 15 * u, bottom = H - 4 * u;
    if (page === 'overview') this.overview(x, st, u, W, top, bottom);
    else if (page === 'furniture') this.furniturePage(x, st, u, W, top, bottom);
    else if (page === 'drawing') this.drawingPage(x, st, u, W, top, bottom);
    else this.clockPage(x, st, u, W, H, top, bottom);
    scr.tex.needsUpdate = true;
  }

  overview(x, st, u, W, top, bottom) {
    const items = [
      ['家具', st.furniture], ['小物', st.small], ['画像', st.images], ['文字', st.texts],
      ['付箋', st.stickies], ['描いた線', st.strokes], ['訪れた回数', st.visits], ['過ごした時間', fmtDuration(st.timeMs)],
    ];
    const cols = 4, rows = 2, gx = 4 * u, gw = (W - 8 * u - (cols - 1) * 2 * u) / cols;
    const ch = (bottom - top - 9 * u - (rows - 1) * 2 * u) / rows;
    items.forEach(([label, v], i) => {
      const cx = gx + (i % cols) * (gw + 2 * u), cy = top + Math.floor(i / cols) * (ch + 2 * u);
      x.fillStyle = C.panel; rr(x, cx, cy, gw, ch, 1.2 * u); x.fill();
      text(x, label, cx + 2 * u, cy + 3.6 * u, 2.1 * u, C.sub, 400, 'left');
      text(x, String(v), cx + 2 * u, cy + ch * 0.62, Math.min(ch * 0.42, 6.5 * u), C.text, 500, 'left', gw - 4 * u);
    });
    const d = new Date(st.created);
    text(x, `作成 ${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, 4 * u, bottom - 2.5 * u, 2.1 * u, C.sub, 400, 'left');
    if (st.saved) { const s = new Date(st.saved); text(x, `最終保存 ${pad(s.getHours())}:${pad(s.getMinutes())}`, W - 4 * u, bottom - 2.5 * u, 2.1 * u, C.sub, 400, 'right'); }
  }

  furniturePage(x, st, u, W, top, bottom) {
    // 左：置き場所ごとの数、右：多い家具
    const half = W / 2;
    text(x, '置き場所ごと', 4 * u, top + 2 * u, 2.2 * u, C.sub, 400, 'left');
    const ms = ['floor', 'wall', 'ceiling', 'small'], max = Math.max(1, ...ms.map(m => st.byMount[m]));
    const rowH = (bottom - top - 6 * u) / ms.length;
    ms.forEach((m, i) => {
      const y = top + 6 * u + i * rowH + rowH / 2;
      text(x, MOUNT_NAMES[m], 4 * u, y, 2.4 * u, C.text, 400, 'left');
      const bx = 12 * u, bw = half - 20 * u;
      x.fillStyle = C.panel; rr(x, bx, y - 1.4 * u, bw, 2.8 * u, 1.4 * u); x.fill();
      if (st.byMount[m] > 0) { x.fillStyle = C.accent; rr(x, bx, y - 1.4 * u, Math.max(2.8 * u, bw * st.byMount[m] / max), 2.8 * u, 1.4 * u); x.fill(); }
      text(x, String(st.byMount[m]), half - 4 * u, y, 2.4 * u, C.text, 500, 'right');
    });
    text(x, '多い家具', half + 2 * u, top + 2 * u, 2.2 * u, C.sub, 400, 'left');
    if (!st.top.length) text(x, 'まだ何も置いていません', half + 2 * u, top + 9 * u, 2.4 * u, C.sub, 400, 'left');
    const th = (bottom - top - 6 * u) / 5;
    st.top.forEach(([name, n], i) => {
      const y = top + 6 * u + i * th + th / 2;
      text(x, `${i + 1}`, half + 2 * u, y, 2.4 * u, C.accent, 500, 'left');
      text(x, name, half + 6 * u, y, 2.6 * u, C.text, 400, 'left', W / 2 - 18 * u);
      text(x, `× ${n}`, W - 4 * u, y, 2.6 * u, C.sub, 500, 'right');
    });
  }

  drawingPage(x, st, u, W, top, bottom) {
    text(x, '描き込みの量（面のうち描いてある割合）', 4 * u, top + 2 * u, 2.2 * u, C.sub, 400, 'left');
    const rowH = (bottom - top - 12 * u) / st.ink.length;
    const max = Math.max(0.02, ...st.ink.map(i => i.ratio));
    st.ink.forEach((it, i) => {
      const y = top + 6 * u + i * rowH + rowH / 2;
      text(x, it.label, 4 * u, y, 2.4 * u, C.text, 400, 'left');
      const bx = 20 * u, bw = W - 36 * u;
      x.fillStyle = C.panel; rr(x, bx, y - 1.4 * u, bw, 2.8 * u, 1.4 * u); x.fill();
      if (it.ratio > 0) { x.fillStyle = C.warm; rr(x, bx, y - 1.4 * u, Math.max(2.8 * u, bw * it.ratio / max), 2.8 * u, 1.4 * u); x.fill(); }
      text(x, (it.ratio * 100).toFixed(it.ratio < 0.1 ? 1 : 0) + '%', W - 4 * u, y, 2.4 * u, C.text, 500, 'right');
    });
    text(x, `描いた線 ${st.strokes} 本 ・ 家具や画像の上の描き込み ${st.furnDrawn} 面`, 4 * u, bottom - 2.5 * u, 2.1 * u, C.sub, 400, 'left');
  }

  clockPage(x, st, u, W, H, top, bottom) {
    const now = new Date();
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const mid = top + (bottom - top) * 0.34;
    text(x, `${pad(now.getHours())}:${pad(now.getMinutes())}`, W / 2 - 3 * u, mid, Math.min(17 * u, (bottom - top) * 0.45), C.text, 400, 'center');
    text(x, pad(now.getSeconds()), W / 2 + 22 * u, mid + 3 * u, 5 * u, C.sub, 400, 'left');
    text(x, `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${days[now.getDay()]}）`, W / 2, mid + (bottom - top) * 0.36, 3 * u, C.sub, 400, 'center');
    const info = [
      st.playing ? `♪ ${st.playing}` : '♪ 停止中',
      `明かり ${st.lightsOn} / ${st.lights}`,
      `開いている扉・引き出し ${st.openParts}`,
    ];
    text(x, info.join('　・　'), W / 2, bottom - 2.5 * u, 2.2 * u, st.playing ? C.green : C.sub, 400, 'center', W - 8 * u);
  }
}

function text(x, s, px, py, size, color, weight, align, maxW) {
  x.font = `${weight} ${Math.round(size)}px ${FONT}`;
  x.fillStyle = color; x.textAlign = align;
  if (maxW) x.fillText(s, px, py, maxW); else x.fillText(s, px, py);
}
function rr(x, a, b, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
function pad(n) { return String(n).padStart(2, '0'); }
function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return '1分未満';
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}
