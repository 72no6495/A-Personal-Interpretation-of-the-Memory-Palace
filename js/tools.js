// ツール（手・ペン・消しゴム・文字・画像・家具）
import * as THREE from './lib/three.module.min.js';
import { buildModel, CATALOG_BY_ID, mountRotationX, footprintHalf, TONE_KEYS } from './furniture.js';
import { disableRaycast } from './world.js';
import { sfx } from './audio.js';
import { settings } from './settings.js';

export const PEN_COLORS = [
  { name: '黒', hex: '#2a2a2c' },
  { name: '赤', hex: '#d2473f' },
  { name: '橙', hex: '#eb8f2d' },
  { name: '黄', hex: '#e6c02a' },
  { name: '緑', hex: '#3f9a5c' },
  { name: '青', hex: '#3473d1' },
  { name: '紫', hex: '#8657c9' },
  { name: '白', hex: '#ffffff' },
];

export const SHAPES = [
  { id: 'free', name: 'フリー' },
  { id: 'line', name: '直線' },
  { id: 'arrow', name: '矢印' },
  { id: 'rect', name: '四角' },
  { id: 'ellipse', name: '円' },
];

export const FONTS = [
  { id: 'gothic', name: 'ゴシック', css: '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif', weight: 500 },
  { id: 'mincho', name: '明朝', css: '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif', weight: 500 },
  { id: 'hand', name: '手書き風', css: '"Klee One", "Zen Kurenaido", cursive', weight: 600 },
];

export const TOOL_ORDER = ['hand', 'pen', 'eraser', 'text', 'image', 'furniture'];
export const TOOL_INFO = {
  hand: { name: '手', key: '1', desc: '選択・移動・ドア' },
  pen: { name: 'ペン', key: '2', desc: '描く' },
  eraser: { name: '消しゴム', key: '3', desc: '消す' },
  text: { name: '文字', key: '4', desc: '文字を書く' },
  image: { name: '画像', key: '5', desc: '画像・付箋を貼る' },
  furniture: { name: '家具', key: '6', desc: '家具を置く' },
};

const ROT_STEP = Math.PI / 12;

// ------------------------------------------------------------
class StrokeTool {
  constructor(app, tools, eraser) {
    this.app = app; this.tools = tools; this.eraser = eraser;
    this.stroke = null;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 40),
      new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide })
    );
    ring.renderOrder = 10;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32), new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.25, depthTest: false }));
    dot.renderOrder = 9;
    this.cursor = new THREE.Group(); this.cursor.add(dot, ring);
    this.cursorDot = dot; this.cursorRing = ring;
    disableRaycast(this.cursor);
    this.cursor.visible = false;
  }

  get sizeM() { const s = this.tools.state; return (this.eraser ? s.eraserSize : s.penSize) / 100; }

  activate() { this.app.scene.add(this.cursor); }
  deactivate() { this.cancel(); this.cursor.visible = false; this.cursor.parent && this.cursor.parent.remove(this.cursor); }

  hover(ndc) {
    const t = this.app.pickAt(ndc);
    if (!t || t.target.type !== 'surface') { this.cursor.visible = false; return; }
    const n = t.hit.face.normal.clone().transformDirection(t.hit.object.matrixWorld);
    this.cursor.position.copy(t.hit.point).addScaledVector(n, 0.004);
    this.cursor.lookAt(t.hit.point.clone().add(n));
    const s = Math.max(this.sizeM, 0.004);
    this.cursor.scale.setScalar(s);
    const col = this.eraser ? 0xffffff : new THREE.Color(this.tools.state.color);
    this.cursorDot.material.color.set(col);
    this.cursorDot.material.opacity = this.eraser ? 0.6 : 0.5;
    this.cursorRing.material.color.set(this.eraser || this.tools.state.color === '#ffffff' ? 0x555555 : 0xffffff);
    this.cursor.visible = true;
  }

  down(ndc, e = {}) {
    const t = this.app.pickAt(ndc);
    if (!t) return;
    if (t.target.type === 'door') { this.app.openDoorMenu(); return; }
    if (t.target.type !== 'surface') return;
    this.shift = !!e.shiftKey;
    this.begin(t);
    sfx.scratchStart(this.eraser);
  }

  begin(t) {
    const s = t.target.surface;
    s.snapshot();
    const p = s.uvToPx(t.hit.uv);
    this.stroke = { surface: s, points: [p], sm: { ...p }, rect: null, last: p, lifted: false, time: performance.now() };
    this.redraw();
  }

  move(ndc, e = {}) {
    const st = this.stroke;
    if (!st) return;
    if (e.shiftKey !== undefined) this.shift = !!e.shiftKey;
    const t = this.app.pickAt(ndc);
    if (!t || t.target.type !== 'surface') { st.lifted = true; return; }
    if (t.target.surface !== st.surface) {
      this.commit();
      this.begin(t);
      return;
    }
    const p = st.surface.uvToPx(t.hit.uv);
    const shape = this.shape();
    const now = performance.now();
    const dist = Math.hypot(p.x - st.last.x, p.y - st.last.y);
    sfx.scratchSpeed(dist / Math.max(1, now - st.time) * 16 / st.surface.pxPerMeter() * 100);
    st.time = now;
    st.last = p;
    if (shape === 'free') {
      if (st.lifted) { st.points.push(null); st.sm = { ...p }; st.lifted = false; st.points.push({ ...p }); }
      else {
        const k = 1 - Math.min(0.92, this.tools.state.smoothing);
        st.sm.x += (p.x - st.sm.x) * k;
        st.sm.y += (p.y - st.sm.y) * k;
        const prev = st.points[st.points.length - 1];
        if (!prev || Math.hypot(prev.x - st.sm.x, prev.y - st.sm.y) > 0.6) st.points.push({ ...st.sm });
      }
    } else {
      st.points[1] = p;
    }
    this.redraw();
  }

  up() {
    const st = this.stroke;
    if (!st) return;
    if (this.shape() === 'free' && st.last && !st.lifted) {
      const prev = st.points[st.points.length - 1];
      if (prev && Math.hypot(prev.x - st.last.x, prev.y - st.last.y) > 0.5) st.points.push({ ...st.last });
      this.redraw();
    }
    this.commit();
    sfx.scratchStop();
  }

  cancel() {
    if (!this.stroke) return;
    this.commit();
    sfx.scratchStop();
  }

  shape() {
    if (this.eraser) return this.shift ? 'line' : 'free';
    const sh = this.tools.state.shape;
    return (this.shift && sh === 'free') ? 'line' : sh;
  }

  redraw() {
    const st = this.stroke, s = st.surface, ctx = s.ctx;
    const w = Math.max(1, this.sizeM * s.pxPerMeter());
    const pts = st.points.filter(Boolean);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const shape = this.shape();
    const pad = w * (shape === 'arrow' ? 4 : 1) + 4;
    let rect = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    if (st.rect) rect = union(rect, st.rect);
    rect = s.clampRect(rect);
    s.restoreRegion(rect);
    st.rect = rect;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    if (this.eraser) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = ctx.fillStyle = '#000';
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = ctx.fillStyle = this.tools.state.color;
      ctx.globalAlpha = this.tools.state.opacity;
    }
    const path = new Path2D();
    if (shape === 'free') {
      // 連続区間ごとに描く
      let seg = [];
      const flush = () => {
        if (!seg.length) return;
        if (seg.length === 1) {
          path.moveTo(seg[0].x + w / 2, seg[0].y);
          path.arc(seg[0].x, seg[0].y, w / 2, 0, Math.PI * 2);
          ctx.fill(path);
          seg = []; return;
        }
        const sp = new Path2D();
        sp.moveTo(seg[0].x, seg[0].y);
        for (let i = 1; i < seg.length - 1; i++) {
          const mx = (seg[i].x + seg[i + 1].x) / 2, my = (seg[i].y + seg[i + 1].y) / 2;
          sp.quadraticCurveTo(seg[i].x, seg[i].y, mx, my);
        }
        sp.lineTo(seg[seg.length - 1].x, seg[seg.length - 1].y);
        path.addPath(sp);
        seg = [];
      };
      for (const p of st.points) { if (p === null) flush(); else seg.push(p); }
      flush();
      ctx.stroke(path);
    } else {
      const a = st.points[0], b = st.points[1] || a;
      if (shape === 'line' || shape === 'arrow') {
        path.moveTo(a.x, a.y); path.lineTo(b.x, b.y);
        if (shape === 'arrow') {
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const len = Math.min(Math.hypot(b.x - a.x, b.y - a.y) * 0.4, w * 4 + 10);
          path.moveTo(b.x - Math.cos(ang - 0.5) * len, b.y - Math.sin(ang - 0.5) * len);
          path.lineTo(b.x, b.y);
          path.lineTo(b.x - Math.cos(ang + 0.5) * len, b.y - Math.sin(ang + 0.5) * len);
        }
      } else if (shape === 'rect') {
        path.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      } else if (shape === 'ellipse') {
        path.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2 + 0.01, Math.abs(b.y - a.y) / 2 + 0.01, 0, 0, Math.PI * 2);
      }
      ctx.stroke(path);
    }
    ctx.restore();
    s.markDrawn();
  }

  commit() {
    const st = this.stroke;
    this.stroke = null;
    if (!st || !st.rect || st.rect.w <= 0 || st.rect.h <= 0) return;
    const s = st.surface, rect = st.rect;
    const before = s.snapshotRegion(rect);
    const after = s.getRegion(rect);
    this.app.history.push({
      undo: () => s.putRegion(before, rect),
      redo: () => s.putRegion(after, rect),
    });
    s.markDrawn();
    this.app.markDirty();
  }
}

// ------------------------------------------------------------
class TextTool {
  constructor(app, tools) { this.app = app; this.tools = tools; }
  activate() {}
  deactivate() {}
  hover() {}
  move() {}
  up() {}
  cancel() {}
  down(ndc) {
    const t = this.app.pickAt(ndc);
    if (!t) return;
    if (t.target.type === 'door') { this.app.openDoorMenu(); return; }
    if (t.target.type !== 'surface') return;
    const target = { surface: t.target.surface, uv: t.hit.uv.clone(), point: t.hit.point.clone() };
    const camFwd = new THREE.Vector3();
    this.app.camera.getWorldDirection(camFwd);
    this.app.ui.openTextDialog(text => this.place(target, text, camFwd));
  }

  // 面の上での文字の回転（キャンバス座標、時計回り）
  textAngle(s, camFwd) {
    const n = s.worldNormal();
    const upWorld = Math.abs(n.y) > 0.7 ? camFwd.clone().setY(0).normalize() : new THREE.Vector3(0, 1, 0);
    if (upWorld.lengthSq() < 0.01) upWorld.set(0, 0, -1);
    const q = new THREE.Quaternion(); s.group.getWorldQuaternion(q);
    const local = upWorld.applyQuaternion(q.invert());
    return Math.atan2(local.x, local.y);
  }

  async place(target, text, camFwd) {
    text = (text || '').replace(/\s+$/, '');
    if (!text) return;
    const st = this.tools.state;
    const font = FONTS.find(f => f.id === st.font) || FONTS[0];
    try { await document.fonts.load(`${font.weight} 40px ${font.css}`, text); } catch { /* 無視 */ }
    if (st.textHQ) return this.placeObject(target, text, camFwd, font);

    const { surface: s, uv } = target;
    const p = s.uvToPx(uv);
    const ppm = s.pxPerMeter();
    const sizePx = Math.max(6, st.textSize / 100 * ppm);
    const ang = this.textAngle(s, camFwd);

    const ctx = s.ctx;
    ctx.save();
    ctx.font = `${font.weight} ${sizePx}px ${font.css}`;
    const lines = text.split('\n');
    const lh = sizePx * 1.3;
    const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
    ctx.restore();
    const r = Math.hypot(maxW / 2, lines.length * lh / 2) + sizePx * 0.4;
    const rect = s.clampRect({ x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 });
    if (rect.w <= 0 || rect.h <= 0) return;
    const before = s.getRegion(rect);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.font = `${font.weight} ${sizePx}px ${font.css}`;
    ctx.fillStyle = st.color;
    ctx.globalAlpha = st.opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
    ctx.restore();
    s.markDrawn();
    const after = s.getRegion(rect);
    this.app.history.push({ undo: () => s.putRegion(before, rect), redo: () => s.putRegion(after, rect) });
    this.app.markDirty();
    sfx.paste();
  }

  // 高画質：文字だけの高解像度オブジェクトとして貼る（小さい文字もくっきり）
  async placeObject(target, text, camFwd, font) {
    const st = this.tools.state;
    let host = target.surface;
    if (host.kind === 'image') host = host.owner.host;
    if (!host || !this.app.world.surfaces.has(host.key)) return;
    const sizeM = st.textSize / 100;
    const lines = text.split('\n');
    const measure = document.createElement('canvas').getContext('2d');
    // 文字の高さが最低 160px になる解像度（最大 2048px に収める）
    let ppm = Math.max(host.pxPerMeter() * 2, 160 / sizeM);
    const layout = ppm => {
      const px = sizeM * ppm;
      measure.font = `${font.weight} ${px}px ${font.css}`;
      const maxW = Math.max(...lines.map(l => measure.measureText(l).width), px * 0.5);
      const pad = px * 0.25;
      return { px, lh: px * 1.3, w: Math.ceil(maxW + pad * 2), h: Math.ceil(lines.length * px * 1.3 + pad * 2 - px * 0.3) };
    };
    let L = layout(ppm);
    const big = Math.max(L.w, L.h);
    if (big > 2048) { ppm *= 2048 / big; L = layout(ppm); }
    const c = document.createElement('canvas');
    c.width = L.w; c.height = L.h;
    const ctx = c.getContext('2d');
    ctx.font = `${font.weight} ${L.px}px ${font.css}`;
    ctx.fillStyle = st.color;
    ctx.globalAlpha = st.opacity;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, L.w / 2, L.h / 2 + (i - (lines.length - 1) / 2) * L.lh));
    const src = c.toDataURL('image/png');
    const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const lp = host.worldToLocal(target.point);
    const w = this.app.world;
    const obj = await w.addImageFromElement({ src, el, host, x: lp.x, y: lp.y, rot: -this.textAngle(host, camFwd), w: L.w / ppm, h: L.h / ppm, isText: true });
    let bundle = null;
    this.app.history.push({
      undo: () => { bundle = w.removeObject(obj); this.tools.deselectIf(obj); },
      redo: () => { if (bundle) w.restoreObject(bundle); },
    });
    this.app.markDirty();
    sfx.paste();
  }
}

// ------------------------------------------------------------
function makeGhostMaterials(obj, opacity = 0.5) {
  obj.traverse(o => {
    if (o.isMesh) {
      const m = o.material.clone();
      m.transparent = true; m.opacity = opacity; m.depthWrite = false;
      o.material = m;
    }
  });
  disableRaycast(obj);
}

// 置き場所を探す
function findHost(app, hits, obj, mode) {
  for (let i = 0; i < hits.length; i++) {
    const { target } = hits[i];
    if (target.type === 'surface' && app.world.canHost(obj, target.surface)) return hits[i];
    if (mode === 'first') return null;
    // 床・壁・天井の家具は手前の物を通り抜けて探す。ただし壁を越えない
    if (target.type === 'surface' && target.surface.kind === 'room') return null;
    if (target.type === 'door') return null;
  }
  return null;
}

function autoRotation(app, host, mount) {
  if (mount === 'wall') return 0;
  const cam = new THREE.Vector3(); app.camera.getWorldDirection(cam);
  const d = cam.negate(); d.y = 0;
  if (d.lengthSq() < 1e-6) return 0;
  d.normalize();
  const q = new THREE.Quaternion(); host.group.getWorldQuaternion(q);
  const l = d.applyQuaternion(q.invert());
  const f0 = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(mountRotationX(mount), 0, 0));
  return snapAngle(Math.atan2(l.y, l.x) - Math.atan2(f0.y, f0.x));
}
function snapAngle(a) { return Math.round(a / ROT_STEP) * ROT_STEP; }

class FurnitureTool {
  constructor(app, tools) {
    this.app = app; this.tools = tools;
    this.ghost = null; this.ghostType = null; this.ghostTone = null;
    this.rotOffset = 0;
    this.valid = null;
  }
  activate() { this.app.ui.showCatalog(true); }
  deactivate() { this.removeGhost(); this.app.ui.showCatalog(false); }
  cancel() {}
  move() {}
  up() {}

  ensureGhost() {
    const st = this.tools.state;
    if (!st.furnitureType) { this.removeGhost(); return null; }
    if (this.ghost && this.ghostType === st.furnitureType && this.ghostTone === st.furnitureTone) return this.ghost;
    this.removeGhost();
    const def = CATALOG_BY_ID[st.furnitureType];
    const built = buildModel(st.furnitureType, st.furnitureTone || def.tone);
    const root = new THREE.Group();
    built.group.rotation.x = mountRotationX(def.mount);
    root.add(built.group);
    makeGhostMaterials(root, 0.55);
    this.ghost = root; this.ghostType = st.furnitureType; this.ghostTone = st.furnitureTone;
    this.ghostInfo = { kind: 'furniture', def, half: footprintHalf(def.mount, built.bounds), root: null };
    return root;
  }
  removeGhost() {
    if (this.ghost) { this.ghost.parent && this.ghost.parent.remove(this.ghost); this.ghost = null; }
    this.valid = null;
  }
  rotate(dir) { this.rotOffset += dir * ROT_STEP; sfx.click(); }

  hover(ndc) {
    const g = this.ensureGhost();
    if (!g) return;
    const hits = this.app.pickAll(ndc);
    const mount = this.ghostInfo.def.mount;
    const h = findHost(this.app, hits, this.ghostInfo, mount === 'small' ? 'first' : 'pass');
    if (!h) { g.visible = false; this.valid = null; return; }
    const host = h.target.surface;
    const lp = host.worldToLocal(h.hit.point);
    const rot = autoRotation(this.app, host, mount) + this.rotOffset;
    const c = this.app.world.clampToHost(this.ghostInfo, host, lp.x, lp.y, rot, 1);
    if (g.parent !== host.group) host.group.add(g);
    g.position.set(c.x, c.y, 0.002);
    g.rotation.set(0, 0, rot);
    g.visible = true;
    this.valid = { host, x: c.x, y: c.y, rot };
  }

  down(ndc) {
    if (!this.tools.state.furnitureType) {
      const t = this.app.pickAt(ndc);
      if (t && t.target.type === 'door') this.app.openDoorMenu();
      return;
    }
    this.hover(ndc);
    this.place();
  }

  place() {
    const v = this.valid;
    if (!v) { sfx.error(); this.app.ui.toast('ここには置けません'); return; }
    const st = this.tools.state;
    const furn = this.app.world.addFurniture({ type: st.furnitureType, tone: st.furnitureTone, host: v.host, x: v.x, y: v.y, rot: v.rot });
    if (!furn) return;
    const w = this.app.world;
    let bundle = null;
    this.app.history.push({
      undo: () => { bundle = w.removeObject(furn); this.tools.deselectIf(furn); },
      redo: () => { if (bundle) w.restoreObject(bundle); },
    });
    this.app.markDirty();
    sfx.place();
  }
}

// ------------------------------------------------------------
class ImageTool {
  constructor(app, tools) { this.app = app; this.tools = tools; this.pending = null; this.ghost = null; this.valid = null; }
  activate() {
    this.app.ui.updateToolPanel();
  }

  // 付箋（色付きの紙）を貼る準備
  async sticky(color) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 256, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0.06)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,0.08)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const src = c.toDataURL('image/jpeg', 0.92);
    const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    this.setPending({ src, el, aspect: 1, sticky: true, size: 0.12 });
    sfx.open();
  }
  deactivate() { this.removeGhost(); }
  cancel() {}
  move() {}
  up() {}

  async choose() {
    const file = await this.app.ui.pickFile('image/*');
    if (!file) return;
    try {
      this.app.ui.busy(true, '画像を読み込み中…');
      this.setPending(await prepareImage(file));
      sfx.open();
    } catch (e) {
      this.app.ui.toast(e.message || '画像を読み込めませんでした'); sfx.error();
    } finally { this.app.ui.busy(false); }
  }

  setPending(p) {
    this.removeGhost();
    this.pending = p;
    const tex = new THREE.Texture(p.el); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.7, depthWrite: false }));
    disableRaycast(m);
    this.ghost = m;
    this.app.ui.updateToolPanel();
  }

  removeGhost() {
    if (this.ghost) { this.ghost.parent && this.ghost.parent.remove(this.ghost); this.ghost.material.map.dispose(); this.ghost = null; }
    this.valid = null;
  }

  sizeFor(host) {
    const a = this.pending.aspect;
    const longest = Math.min(this.pending.size || this.tools.state.imageSize, Math.max(host.width, host.height) * 0.9);
    let w, h;
    if (a >= 1) { w = longest; h = longest / a; } else { h = longest; w = longest * a; }
    if (h > host.height * 0.95) { h = host.height * 0.95; w = h * a; }
    if (w > host.width * 0.95) { w = host.width * 0.95; h = w / a; }
    return { w, h };
  }

  hover(ndc) {
    if (!this.ghost) return;
    const hits = this.app.pickAll(ndc);
    const probe = { kind: 'image', w: 1, h: 1 };
    const h = findHost(this.app, hits, probe, 'first') || (hits[0] && hits[0].target.type === 'surface' && hits[0].target.surface.kind === 'image' ? findHost(this.app, hits.slice(1), probe, 'first') : null);
    if (!h) { this.ghost.visible = false; this.valid = null; return; }
    const host = h.target.surface;
    const { w, h: hh } = this.sizeFor(host);
    probe.w = w; probe.h = hh;
    const lp = host.worldToLocal(h.hit.point);
    const c = this.app.world.clampToHost(probe, host, lp.x, lp.y, 0, 1);
    if (this.ghost.parent !== host.group) host.group.add(this.ghost);
    this.ghost.position.set(c.x, c.y, 0.02);
    this.ghost.scale.set(w, hh, 1);
    this.ghost.visible = true;
    this.valid = { host, x: c.x, y: c.y, w, h: hh };
  }

  down(ndc) {
    if (!this.pending) {
      const t = this.app.pickAt(ndc);
      if (t && t.target.type === 'door') { this.app.openDoorMenu(); return; }
      this.choose(); return;
    }
    this.hover(ndc);
    this.place();
  }

  async place() {
    const v = this.valid;
    if (!v || !this.pending) { sfx.error(); this.app.ui.toast('ここには貼れません'); return; }
    const p = this.pending;
    const w = this.app.world;
    const obj = await w.addImageFromElement({ src: p.src, el: p.el, host: v.host, x: v.x, y: v.y, rot: 0, w: v.w, h: v.h, isSticky: !!p.sticky });
    let bundle = null;
    this.app.history.push({
      undo: () => { bundle = w.removeObject(obj); this.tools.deselectIf(obj); },
      redo: () => { if (bundle) w.restoreObject(bundle); },
    });
    this.app.markDirty();
    sfx.paste();
    this.removeGhost();
    this.pending = null;
    this.tools.select('hand');
    this.tools.setSelected(obj);
    this.app.ui.toast(p.sticky ? '付箋を貼りました。ペンや文字で書き込めます' : '貼り付けました。ペンで上に描いたり、手ツールで動かせます');
    if (p.sticky) this.tools.select('pen');
  }
}

export async function prepareImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('画像を読み込めませんでした')); i.src = url; });
    const MAX = 2048;
    const sc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const cw = Math.max(1, Math.round(img.naturalWidth * sc)), ch = Math.max(1, Math.round(img.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, cw, ch);
    const png = /png|gif|webp|svg/i.test(file.type);
    const src = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
    const el = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    return { src, el, aspect: cw / ch };
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------------------
class HandTool {
  constructor(app, tools) { this.app = app; this.tools = tools; this.drag = null; }
  activate() {}
  deactivate() { this.cancel(); this.tools.setHover(null); }
  cancel() { if (this.drag) this.up(); }

  resolve(t) {
    if (!t) return null;
    if (t.target.type === 'object') return t.target.object;
    if (t.target.type === 'surface' && t.target.surface.owner) return t.target.surface.owner;
    return null;
  }

  hover(ndc) {
    if (this.drag) return;
    const t = this.app.pickAt(ndc);
    const obj = this.resolve(t);
    this.tools.setHover(obj && obj !== this.tools.selected ? obj : null);
    this.app.ui.setDoorHint(!!(t && t.target.type === 'door'));
  }

  // スマホ：この位置からドラッグで動かせるか
  canDragAt(ndc) {
    const t = this.app.pickAt(ndc);
    const obj = this.resolve(t);
    return !!obj && obj === this.tools.selected;
  }

  // クリックした部分（扉・引き出し・ふた・明かり）の名前
  partAt(t, obj) {
    if (!t || !obj || obj.kind !== 'furniture' || t.target.type !== 'object') return null;
    let o = t.hit.object;
    while (o && o !== obj.root) {
      if (o.userData.partName) return o.userData.partName;
      o = o.parent;
    }
    return null;
  }

  togglePart(obj, part) {
    if (part === 'music') { this.app.music.toggle(obj); this.app.ui.onSelectionChange(obj); return; }
    const r = this.app.world.togglePart(obj, part);
    if (!r) return;
    if (r === 'light') (obj.state.light ? sfx.lightOn : sfx.lightOff).call(sfx);
    else (r === 'open' ? sfx.openDrawer : sfx.closeDrawer).call(sfx);
    this.app.markDirty();
    this.app.ui.onSelectionChange(obj);
  }

  tap(ndc) {
    const t = this.app.pickAt(ndc);
    if (t && t.target.type === 'door') { this.app.openDoorMenu(); return; }
    const obj = this.resolve(t);
    const part = this.partAt(t, obj);
    if (obj !== this.tools.selected) { this.tools.setSelected(obj); if (obj && !part) sfx.pick(); }
    if (part) this.togglePart(obj, part);
  }

  down(ndc) {
    const t = this.app.pickAt(ndc);
    if (t && t.target.type === 'door') { this.app.openDoorMenu(); return; }
    const obj = this.resolve(t);
    if (obj !== this.tools.selected) { this.tools.setSelected(obj); if (obj) sfx.pick(); }
    if (!obj) return;
    const lp = obj.host.worldToLocal(t.hit.point);
    this.drag = {
      obj, moved: false, startPoint: t.hit.point.clone(), part: this.partAt(t, obj),
      before: { host: obj.host, x: obj.x, y: obj.y, rot: obj.rot, scale: obj.scale },
      offset: { x: lp.x - obj.x, y: lp.y - obj.y }, offsetHost: obj.host,
    };
  }

  move(ndc) {
    const d = this.drag;
    if (!d) return;
    const hits = this.app.pickAll(ndc, d.obj.root);
    const mode = d.obj.kind === 'image' || (d.obj.def && d.obj.def.mount === 'small') ? 'first' : 'pass';
    const h = findHost(this.app, hits, d.obj, mode);
    if (!h) return;
    if (!d.moved && h.hit.point.distanceTo(d.startPoint) < 0.03) return;
    if (!d.moved) { d.moved = true; this.app.ui.setDragging(true); }
    const host = h.target.surface;
    const lp = host.worldToLocal(h.hit.point);
    const off = host === d.offsetHost ? d.offset : { x: 0, y: 0 };
    if (host !== d.offsetHost) d.offset = { x: 0, y: 0 }, d.offsetHost = host;
    this.app.world.attach(d.obj, host, lp.x - off.x, lp.y - off.y, d.obj.rot, d.obj.scale);
  }

  up() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    this.app.ui.setDragging(false);
    if (!d.moved) { if (d.part) this.togglePart(d.obj, d.part); return; }
    const o = d.obj;
    this.tools.pushTransform(o, d.before, { host: o.host, x: o.x, y: o.y, rot: o.rot, scale: o.scale });
    sfx.place();
  }
}

// ------------------------------------------------------------
export class Tools {
  constructor(app) {
    this.app = app;
    this.state = {
      color: PEN_COLORS[0].hex,
      penSize: 0.8,    // cm
      eraserSize: 6,   // cm
      opacity: 1,
      smoothing: settings.smoothing,
      shape: 'free',
      textSize: 10,    // cm
      textHQ: true,    // 文字を高画質オブジェクトとして貼る
      font: 'gothic',
      imageSize: 0.8,  // m
      furnitureType: null,
      furnitureTone: null,
      furnitureMount: 'floor',
    };
    this.tools = {
      hand: new HandTool(app, this),
      pen: new StrokeTool(app, this, false),
      eraser: new StrokeTool(app, this, true),
      text: new TextTool(app, this),
      image: new ImageTool(app, this),
      furniture: new FurnitureTool(app, this),
    };
    this.current = 'hand';
    this.selected = null;
    this.hovered = null;
    this.selHelper = new THREE.BoxHelper(undefined, 0x4d8dff);
    this.selHelper.material.depthTest = false; this.selHelper.material.transparent = true; this.selHelper.renderOrder = 20;
    this.hovHelper = new THREE.BoxHelper(undefined, 0x9aa7b8);
    this.hovHelper.material.depthTest = false; this.hovHelper.material.transparent = true; this.hovHelper.material.opacity = 0.6; this.hovHelper.renderOrder = 19;
    disableRaycast(this.selHelper); disableRaycast(this.hovHelper);
    this.selHelper.visible = false; this.hovHelper.visible = false;
  }

  attachScene(scene) {
    scene.add(this.selHelper, this.hovHelper);
    this.active.activate();
  }

  // 宮殿を出入りするときの初期化
  reset() {
    this.active.deactivate();
    this.selHelper.parent && this.selHelper.parent.remove(this.selHelper);
    this.hovHelper.parent && this.hovHelper.parent.remove(this.hovHelper);
    this.selected = null; this.hovered = null;
    this.selHelper.visible = false; this.hovHelper.visible = false;
    this.tools.image.pending = null;
    this.current = 'hand';
  }

  get active() { return this.tools[this.current]; }

  select(name) {
    if (!this.tools[name]) return;
    if (name === this.current) {
      if (name === 'image') this.tools.image.choose();
      return;
    }
    this.active.deactivate();
    this.current = name;
    if (name !== 'hand') this.setSelected(null);
    this.active.activate();
    this.app.ui.onToolChange(name);
    sfx.tool();
  }

  cycle(dir) {
    const i = TOOL_ORDER.indexOf(this.current);
    this.select(TOOL_ORDER[(i + dir + TOOL_ORDER.length) % TOOL_ORDER.length]);
  }

  setSelected(obj) {
    this.selected = obj;
    if (obj) { this.selHelper.setFromObject(obj.root); this.selHelper.visible = true; }
    else this.selHelper.visible = false;
    if (this.hovered === obj) this.setHover(null);
    this.app.ui.onSelectionChange(obj);
  }
  deselectIf(obj) { if (this.selected === obj) this.setSelected(null); }

  setHover(obj) {
    if (this.hovered === obj) return;
    this.hovered = obj;
    if (obj) { this.hovHelper.setFromObject(obj.root); this.hovHelper.visible = true; }
    else this.hovHelper.visible = false;
  }

  update() {
    if (this.selected) {
      if (!this.selected.root.parent) { this.setSelected(null); return; }
      this.selHelper.setFromObject(this.selected.root);
    }
    if (this.hovered) {
      if (!this.hovered.root.parent) this.setHover(null);
      else this.hovHelper.setFromObject(this.hovered.root);
    }
  }

  pushTransform(obj, before, after) {
    const w = this.app.world;
    this.app.history.push({
      undo: () => w.attach(obj, before.host, before.x, before.y, before.rot, before.scale),
      redo: () => w.attach(obj, after.host, after.x, after.y, after.rot, after.scale),
    });
    this.app.markDirty();
  }

  // ---- 選択中の物の操作 ----
  rotateSelected(dir) {
    const o = this.selected; if (!o) return;
    const before = { host: o.host, x: o.x, y: o.y, rot: o.rot, scale: o.scale };
    this.app.world.attach(o, o.host, o.x, o.y, snapAngle(o.rot + dir * ROT_STEP), o.scale);
    this.pushTransform(o, before, { host: o.host, x: o.x, y: o.y, rot: o.rot, scale: o.scale });
    sfx.click();
  }

  scaleSelected(factor) {
    const o = this.selected; if (!o) return;
    const [lo, hi] = o.kind === 'image' ? [0.15, 6] : [0.4, 2.5];
    const ns = Math.max(lo, Math.min(hi, o.scale * factor));
    if (Math.abs(ns - o.scale) < 1e-4) return;
    const before = { host: o.host, x: o.x, y: o.y, rot: o.rot, scale: o.scale };
    this.app.world.attach(o, o.host, o.x, o.y, o.rot, ns);
    this.pushTransform(o, before, { host: o.host, x: o.x, y: o.y, rot: o.rot, scale: o.scale });
    sfx.click();
  }

  deleteSelected() {
    const o = this.selected; if (!o) return;
    const w = this.app.world;
    let bundle = w.removeObject(o);
    this.setSelected(null);
    this.app.history.push({
      undo: () => { w.restoreObject(bundle); },
      redo: () => { bundle = w.removeObject(o); this.deselectIf(o); },
    });
    this.app.markDirty();
    sfx.remove();
  }

  cycleTone() {
    const o = this.selected; if (!o || o.kind !== 'furniture') return;
    const prev = o.tone;
    const next = TONE_KEYS[(TONE_KEYS.indexOf(prev) + 1) % TONE_KEYS.length];
    this.setToneSelected(next);
  }

  setToneSelected(tone) {
    const o = this.selected; if (!o || o.kind !== 'furniture' || o.tone === tone) return;
    const prev = o.tone, w = this.app.world;
    w.setTone(o, tone);
    this.app.history.push({ undo: () => w.setTone(o, prev), redo: () => w.setTone(o, tone) });
    this.app.markDirty();
    this.app.ui.onSelectionChange(o);
    sfx.color();
  }

  async duplicateSelected() {
    const o = this.selected; if (!o) return;
    const w = this.app.world;
    const dx = Math.min(0.3, o.host.width * 0.1), dy = -Math.min(0.3, o.host.height * 0.1);
    let copy;
    if (o.kind === 'image') {
      copy = await w.addImage({ isText: o.isText, isSticky: o.isSticky, src: o.src, host: o.host, x: o.x + dx, y: o.y + dy, rot: o.rot, w: o.w, h: o.h, scale: o.scale, draw: o.surface.hasContent ? o.surface.canvas.toDataURL() : null });
    } else {
      copy = w.addFurniture({ type: o.type, tone: o.tone, host: o.host, x: o.x + dx, y: o.y + dy, rot: o.rot, scale: o.scale, state: { ...o.state, track: null } });
      for (const [n, s] of Object.entries(o.surfaces)) {
        if (s.hasContent && copy.surfaces[n]) { copy.surfaces[n].ctx.drawImage(s.canvas, 0, 0); copy.surfaces[n].markDrawn(); }
      }
    }
    let bundle = null;
    this.app.history.push({
      undo: () => { bundle = w.removeObject(copy); this.deselectIf(copy); },
      redo: () => { if (bundle) w.restoreObject(bundle); },
    });
    this.setSelected(copy);
    this.app.markDirty();
    sfx.place();
  }

  clearSelectedDrawing() {
    const o = this.selected; if (!o) return;
    const surfs = o.kind === 'image' ? [o.surface] : Object.values(o.surfaces);
    const items = surfs.filter(s => s.hasContent).map(s => {
      const rect = { x: 0, y: 0, w: s.cw, h: s.ch };
      return { s, rect, before: s.getRegion(rect) };
    });
    if (!items.length) return;
    for (const it of items) it.s.clear();
    this.app.history.push({
      undo: () => items.forEach(it => it.s.putRegion(it.before, it.rect)),
      redo: () => items.forEach(it => it.s.clear()),
    });
    this.app.markDirty();
    sfx.remove();
  }
}

function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
