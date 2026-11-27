// 撮影モード（写真・動画、カメラの種類、効果）
import * as THREE from './lib/three.module.min.js';
import { sfx, audioContext, buses } from './audio.js';
import { isTouchDevice } from './settings.js';
import { downloadBlob } from './storage.js';
import { prepareImage } from './tools.js';
import { ROOM } from './world.js';

export const FILTERS = [
  { id: 'none', name: 'なし', css: 'none' },
  { id: 'mono', name: 'モノクロ', css: 'grayscale(1)' },
  { id: 'sepia', name: 'セピア', css: 'sepia(0.8)' },
  { id: 'warm', name: 'あたたか', css: 'sepia(0.25) saturate(1.15) brightness(1.02)' },
  { id: 'cool', name: 'ひんやり', css: 'hue-rotate(12deg) saturate(0.9) brightness(1.03)' },
  { id: 'soft', name: 'やわらか', css: 'contrast(0.86) brightness(1.06)' },
];
export const ASPECTS = [
  { id: 'full', name: '画面', r: 0 },
  { id: '16:9', name: '16:9', r: 16 / 9 },
  { id: '2.39:1', name: 'シネマ', r: 2.39 },
  { id: '4:3', name: '4:3', r: 4 / 3 },
  { id: '1:1', name: '1:1', r: 1 },
  { id: '3:4', name: '3:4', r: 3 / 4 },
  { id: '9:16', name: '9:16', r: 9 / 16 },
];
export const CAMERAS = [
  { id: 'free', name: '通常' },
  { id: 'fixed', name: '定点' },
  { id: 'handheld', name: '手ブレ' },
  { id: 'theater', name: 'シアター' },
];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const ease = t => t * t * (3 - 2 * t);

export class PhotoMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.media = 'photo';     // 'photo' | 'video'
    this.camMode = 'free';
    this.filter = 'none';
    this.aspect = 'full';
    this.grid = true;
    this.vignette = false;
    this.grain = false;
    this.shake = 1;           // 手ブレの強さ
    this.pace = 'slow';       // シアターのテンポ
    this.res = 1080;          // 動画の解像度（短い辺）
    this.fps = 30;
    this.recAudio = true;
    this.showOpts = !isTouchDevice;
    this.photos = [];         // 写真 { blob, url, time }
    this.videos = [];         // 動画 { blob, url, time, ext }
    this.recording = null;
    this.el = document.getElementById('photo-ui');
    this.frame = document.getElementById('photo-frame');
    this.build();
    window.addEventListener('resize', () => this.layout());
  }

  // ================= 画面 =================
  build() {
    const el = this.el;
    el.querySelector('[data-a=exit]').onclick = () => { sfx.click(); this.exit(); };
    el.querySelector('[data-a=shutter]').onclick = () => this.shutter();
    el.querySelector('[data-a=last]').onclick = () => this.openLast();
    el.querySelector('[data-a=opts]').onclick = () => { this.showOpts = !this.showOpts; sfx.click(); this.render(); };
    const zoom = el.querySelector('[data-a=zoom]');
    zoom.oninput = () => { this.app.player.zoomTarget = parseFloat(zoom.value); };
    el.addEventListener('pointerdown', e => { if (e.target !== this.frame && !this.frame.contains(e.target)) e.stopPropagation(); });
    this.render();
  }

  render() {
    const el = this.el;
    const chips = (sel, list, cur, fn) => {
      const box = el.querySelector(sel); box.innerHTML = '';
      for (const it of list) {
        const b = document.createElement('button'); b.className = 'chip' + (cur === it.id ? ' on' : ''); b.textContent = it.name;
        b.onclick = () => { fn(it.id); sfx.click(); this.render(); };
        box.appendChild(b);
      }
      return box;
    };
    chips('.photo-media', [{ id: 'photo', name: '写真' }, { id: 'video', name: '動画' }], this.media, v => { if (!this.recording) this.media = v; });
    chips('.photo-cams', CAMERAS, this.camMode, v => this.setCamera(v));
    chips('.photo-filters', FILTERS, this.filter, v => { this.filter = v; });
    const as = chips('.photo-aspects', ASPECTS, this.aspect, v => { if (!this.recording) this.aspect = v; });
    // 効果・動画の設定
    const ex = el.querySelector('.photo-extra'); ex.innerHTML = '';
    const tog = (name, on, fn) => { const b = document.createElement('button'); b.className = 'chip' + (on ? ' on' : ''); b.textContent = name; b.onclick = () => { fn(); sfx.click(); this.render(); }; ex.appendChild(b); };
    const label = t => { const s = document.createElement('span'); s.className = 'tp-label'; s.textContent = t; ex.appendChild(s); };
    tog('グリッド', this.grid, () => { this.grid = !this.grid; });
    tog('ビネット', this.vignette, () => { this.vignette = !this.vignette; });
    tog('フィルム粒子', this.grain, () => { this.grain = !this.grain; });
    if (this.camMode === 'handheld') {
      label('手ブレ');
      const r = document.createElement('input'); r.type = 'range'; r.min = 0.2; r.max = 3; r.step = 0.1; r.value = this.shake; r.className = 'tp-range';
      r.oninput = () => { this.shake = parseFloat(r.value); };
      ex.appendChild(r);
    }
    if (this.camMode === 'theater') {
      label('テンポ');
      tog('ゆっくり', this.pace === 'slow', () => { this.pace = 'slow'; });
      tog('ふつう', this.pace === 'normal', () => { this.pace = 'normal'; });
      tog('次のカット', false, () => { this.shot = null; });
    }
    if (this.media === 'video') {
      label('動画');
      tog('720p', this.res === 720, () => { if (!this.recording) this.res = 720; });
      tog('1080p', this.res === 1080, () => { if (!this.recording) this.res = 1080; });
      tog('30fps', this.fps === 30, () => { if (!this.recording) this.fps = 30; });
      tog('60fps', this.fps === 60, () => { if (!this.recording) this.fps = 60; });
      tog('音も録る', this.recAudio, () => { if (!this.recording) this.recAudio = !this.recAudio; });
    }
    el.querySelectorAll('.photo-opt-row').forEach(r => r.classList.toggle('hidden', !this.showOpts));
    el.querySelector('[data-a=opts]').classList.toggle('on', this.showOpts);
    el.querySelector('[data-a=zoom]').parentElement.classList.toggle('disabled', this.camMode === 'theater');
    const sh = el.querySelector('[data-a=shutter]');
    sh.classList.toggle('video', this.media === 'video');
    sh.classList.toggle('rec', !!this.recording);
    sh.setAttribute('aria-label', this.media === 'video' ? (this.recording ? '録画を止める' : '録画を始める') : '撮影');
    this.frame.classList.toggle('grid', this.grid);
    this.frame.classList.toggle('vignette', this.vignette);
    this.frame.classList.toggle('grain', this.grain);
    document.getElementById('view').style.filter = this.active ? FILTERS.find(f => f.id === this.filter).css : '';
    this.layout();
  }

  frameRect() {
    const w = window.innerWidth, h = window.innerHeight;
    const a = ASPECTS.find(x => x.id === this.aspect);
    if (!a || !a.r) return { x: 0, y: 0, w, h };
    const m = 0.92;
    let fw = w * m, fh = fw / a.r;
    if (fh > h * m) { fh = h * m; fw = fh * a.r; }
    return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
  }

  layout() {
    const r = this.frameRect();
    Object.assign(this.frame.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    this.frame.classList.toggle('masked', this.aspect !== 'full');
  }

  // ================= 出入り =================
  enter() {
    if (this.active || !this.app.inGame || (this.app.xr && this.app.xr.active)) return;
    const app = this.app;
    app.tools.active.cancel();
    app.tools.setSelected(null);
    app.tools.setHover(null);
    for (const t of [app.tools.tools.pen, app.tools.tools.eraser]) t.cursor.visible = false;
    if (app.tools.current === 'furniture' || app.tools.current === 'image') app.tools.select('hand');
    this.active = true;
    this.prevDrawMode = app.input.drawMode;
    if (app.input.drawMode) app.ui.setDrawMode(false);
    document.body.classList.add('photo');
    this.el.classList.remove('hidden');
    this.el.querySelector('[data-a=zoom]').value = app.player.zoomTarget;
    this.updateLast();
    this.render();
    app.ui.setDoorHint(false);
    sfx.tool();
    if (!isTouchDevice && app.input.mode === 'lock' && !app.input.locked) app.input.requestLock();
    app.ui.toast(isTouchDevice ? '撮影モード：右下のボタンで撮影・録画' : '撮影モード：クリック／スペースで撮影・録画、V で写真⇄動画、C でカメラ、P で終了', 2600);
  }

  exit() {
    if (!this.active) return;
    if (this.recording) this.stopRecording();
    this.setCamera('free');
    this.active = false;
    document.body.classList.remove('photo');
    this.el.classList.add('hidden');
    document.getElementById('view').style.filter = '';
    this.app.player.zoomTarget = 1;
    this.app.ui.setZoom(false);
    const t = this.app.tools.current;
    if (isTouchDevice && (t === 'pen' || t === 'eraser')) this.app.ui.setDrawMode(this.prevDrawMode);
    this.app.ui.onToolChange(this.app.tools.current);
  }

  toggle() { this.active ? this.exit() : this.enter(); }
  toggleMedia() { if (this.recording) return; this.media = this.media === 'photo' ? 'video' : 'photo'; sfx.click(); this.render(); }
  cycleCamera() { const i = CAMERAS.findIndex(c => c.id === this.camMode); this.setCamera(CAMERAS[(i + 1) % CAMERAS.length].id); sfx.click(); this.render(); this.app.ui.toast('カメラ：' + CAMERAS.find(c => c.id === this.camMode).name, 1200); }

  shutter() {
    if (this.media === 'video') { this.recording ? this.stopRecording() : this.startRecording(); }
    else this.shoot();
  }

  // ================= カメラ =================
  setCamera(mode) {
    const p = this.app.player, cam = this.app.camera;
    this.camMode = mode;
    this.shot = null;
    // 定点・シアターでは、プレイヤーは動かない（カメラだけが動く）
    p.frozen = mode === 'fixed' || mode === 'theater';
    p.lookLocked = p.frozen;
    if (mode === 'fixed') this.fixed = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
    if (mode !== 'fixed' && mode !== 'theater' && this.active) p.apply();
    this.seed = Array.from({ length: 12 }, () => rnd(0, 100));
  }

  // 毎フレーム：プレイヤーの更新のあと、描画の前に呼ぶ
  updateCamera(dt, time) {
    if (!this.active) return;
    const cam = this.app.camera;
    if (this.camMode === 'fixed' && this.fixed) {
      cam.position.copy(this.fixed.pos); cam.quaternion.copy(this.fixed.quat);
      this.setFov(this.fixed.fov);
    } else if (this.camMode === 'handheld') {
      // 手持ちの揺れ：周期の違う揺れを重ねる（ゆっくりした揺れ＋細かい震え）
      const s = this.shake, k = this.seed, t = time;
      const n = (i, f) => Math.sin(t * f + k[i]) * 0.6 + Math.sin(t * f * 2.31 + k[i + 1]) * 0.3 + Math.sin(t * f * 5.7 + k[i + 2]) * 0.1;
      cam.rotation.x += n(0, 0.9) * 0.010 * s;
      cam.rotation.y += n(3, 0.7) * 0.012 * s;
      cam.rotation.z += n(6, 0.5) * 0.006 * s;
      cam.position.y += n(9, 1.6) * 0.006 * s;
      cam.position.x += n(1, 0.8) * 0.004 * s;
    } else if (this.camMode === 'theater') {
      this.theater(dt);
    }
  }

  setFov(f) { const cam = this.app.camera; if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } }

  // ---- シアターカメラ：部屋のあちこち・小物へ、ゆっくり動くカットを切り替えていく ----
  theater(dt) {
    if (!this.shot || this.shot.t >= this.shot.dur) this.shot = this.nextShot();
    const s = this.shot;
    s.t += dt;
    const k = ease(Math.min(1, s.t / s.dur));
    const pos = s.p0.clone().lerp(s.p1, k), tgt = s.t0.clone().lerp(s.t1, k);
    clampInRoom(pos);
    const cam = this.app.camera;
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(tgt);
    this.setFov(s.fov0 + (s.fov1 - s.fov0) * k);
  }

  // 見どころ（家具・画像・描いた壁）を集める
  interests() {
    const w = this.app.world, list = [];
    const V = () => new THREE.Vector3();
    for (const f of w.furniture.values()) {
      if (!f.root.parent) continue;
      const box = new THREE.Box3().setFromObject(f.inner);
      const size = box.getSize(V()).length();
      const c = box.getCenter(V());
      const front = new THREE.Vector3(0, 0, 1).applyQuaternion(f.inner.getWorldQuaternion(new THREE.Quaternion()));
      if (f.def.mount === 'wall') front.copy(f.host.worldNormal());
      if (f.def.mount === 'ceiling') front.set(Math.sin(rnd(0, 6.28)), 0, Math.cos(rnd(0, 6.28)));
      front.y = f.def.mount === 'wall' ? front.y : 0;
      if (front.lengthSq() < 1e-4) front.set(0, 0, 1);
      front.normalize();
      list.push({ c, size: Math.max(0.15, size), front, flat: f.def.mount === 'wall', obj: f });
    }
    for (const im of w.images.values()) {
      if (!im.root.parent) continue;
      const c = im.root.getWorldPosition(V());
      list.push({ c, size: Math.max(im.w, im.h) * im.scale, front: im.surface.worldNormal(), flat: true, obj: im });
    }
    for (const s of w.surfaces.values()) {
      if (s.kind === 'room' && s.hasContent && s.mount === 'wall') {
        list.push({ c: s.group.getWorldPosition(V()).setY(1.5), size: 2.5, front: s.worldNormal(), flat: true, obj: s });
      }
    }
    return list;
  }

  nextShot() {
    const boxes = this.app.world.colliders().map(b => b.clone().expandByScalar(0.12));
    const inside = p => boxes.some(b => b.containsPoint(p));
    for (let tries = 0; tries < 12; tries++) {
      const s = this.makeShot();
      if (!inside(s.p0) && !inside(s.p1) && !inside(s.p0.clone().lerp(s.p1, 0.5))) return s;
    }
    return this.makeShot();
  }

  makeShot() {
    const pts = this.interests();
    const slow = this.pace === 'slow' ? 1.45 : 1;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const W = ROOM.W / 2 - 0.45, D = ROOM.D / 2 - 0.45;
    const kinds = pts.length ? ['overview', 'orbit', 'orbit', 'push', 'flat', 'crane', 'detail'] : ['overview', 'crane', 'overview'];
    let kind = pick(kinds);
    let poi = pts.length ? pick(pts.filter(p => !this.lastPoi || p.obj !== this.lastPoi.obj)) || pick(pts) : null;
    if (kind === 'flat' && poi && !poi.flat) poi = pts.find(p => p.flat) || poi;
    if (kind === 'flat' && poi && !poi.flat) kind = 'orbit';
    this.lastPoi = poi;
    const shot = { t: 0, dur: rnd(5, 8) * slow, fov0: 55, fov1: 55 };
    if (kind === 'overview') { // 部屋の隅の高いところから、全体をゆっくり見渡す
      const sx = pick([-1, 1]), sz = pick([-1, 1]);
      shot.p0 = V(sx * W, rnd(2.2, 2.7), sz * D);
      shot.p1 = shot.p0.clone().add(V(-sx * rnd(0.3, 0.8), rnd(-0.2, 0.1), -sz * rnd(0.2, 0.6)));
      shot.t0 = V(rnd(-1.5, 1.5), 0.9, rnd(-1.5, 1.5));
      shot.t1 = shot.t0.clone().add(V(rnd(-1.5, 1.5), rnd(-0.2, 0.3), rnd(-1.5, 1.5)));
      shot.fov0 = shot.fov1 = 66;
    } else if (kind === 'crane') { // 低い位置から高い位置へ、部屋の中心を見ながら上がる
      const a = rnd(0, Math.PI * 2), r = rnd(1.6, 2.6);
      shot.p0 = V(Math.sin(a) * r, 0.45, Math.cos(a) * r);
      shot.p1 = V(Math.sin(a + 0.3) * r, 2.6, Math.cos(a + 0.3) * r);
      shot.t0 = V(0, 1.0, 0); shot.t1 = V(0, 0.7, 0);
      shot.fov0 = 60; shot.fov1 = 62;
    } else if (kind === 'orbit') { // 物のまわりを、ゆっくり回り込む
      const r = Math.min(2.4, Math.max(0.6, poi.size * 1.7 + 0.35));
      const base = Math.atan2(poi.front.x, poi.front.z);
      const a0 = base + rnd(-0.9, 0.9), a1 = a0 + pick([-1, 1]) * rnd(0.35, 0.75);
      const y = Math.max(0.35, poi.c.y + rnd(0.05, 0.45) * Math.max(0.6, poi.size));
      shot.p0 = V(poi.c.x + Math.sin(a0) * r, y, poi.c.z + Math.cos(a0) * r);
      shot.p1 = V(poi.c.x + Math.sin(a1) * r, y + rnd(-0.1, 0.15), poi.c.z + Math.cos(a1) * r);
      shot.t0 = poi.c.clone(); shot.t1 = poi.c.clone();
      shot.fov0 = 50; shot.fov1 = 46;
    } else if (kind === 'push' || kind === 'detail') { // 物に向かって、ゆっくり近づく（detail は小さな物に寄る）
      const near = kind === 'detail';
      const r = Math.min(2.2, Math.max(near ? 0.25 : 0.6, poi.size * (near ? 0.9 : 1.4) + (near ? 0.1 : 0.3)));
      const a = Math.atan2(poi.front.x, poi.front.z) + rnd(-0.5, 0.5);
      const dir = V(Math.sin(a), rnd(0.15, 0.45), Math.cos(a)).normalize();
      shot.p0 = poi.c.clone().addScaledVector(dir, r * 1.7);
      shot.p1 = poi.c.clone().addScaledVector(dir, r * 0.9);
      shot.t0 = poi.c.clone(); shot.t1 = poi.c.clone();
      shot.fov0 = near ? 40 : 50; shot.fov1 = near ? 32 : 42;
    } else { // flat：壁の絵や画像の前を、横にすべるように動く
      const n = poi.front.clone(); n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize();
      const side = V(-n.z, 0, n.x);
      const dist = Math.min(3.2, Math.max(0.7, poi.size * 1.3));
      const center = poi.c.clone().addScaledVector(n, dist);
      const sw = Math.min(1.2, poi.size * 0.5 + 0.2);
      shot.p0 = center.clone().addScaledVector(side, -sw); shot.p1 = center.clone().addScaledVector(side, sw);
      if (Math.random() < 0.5) [shot.p0, shot.p1] = [shot.p1, shot.p0];
      shot.t0 = poi.c.clone().addScaledVector(side, -sw * 0.4); shot.t1 = poi.c.clone().addScaledVector(side, sw * 0.4);
      if (shot.p0.distanceTo(shot.p1) > 0 && Math.random() < 0.5) [shot.t0, shot.t1] = [shot.t1, shot.t0];
      shot.fov0 = 50; shot.fov1 = 47;
    }
    for (const p of [shot.p0, shot.p1]) clampInRoom(p);
    return shot;
  }

  // ================= 写真 =================
  async shoot() {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      const blob = await this.capture();
      const url = URL.createObjectURL(blob);
      this.photos.push({ blob, url, time: Date.now() });
      this.lastKind = 'photo';
      sfx.shutter();
      const fl = document.getElementById('photo-flash');
      fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
      this.updateLast();
    } catch (e) {
      console.error(e);
      this.app.ui.toast('撮影できませんでした'); sfx.error();
    } finally { this.busy = false; }
  }

  // 高解像度でレンダリングして切り抜き、フィルターと効果をかける
  async capture() {
    const app = this.app, R = app.renderer;
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const prevPR = R.getPixelRatio();
    const pr = Math.max(prevPR, Math.min(3, 2400 / Math.max(cssW, cssH)));
    R.setPixelRatio(pr);
    R.setSize(cssW, cssH, false);
    R.render(app.world.scene, app.camera);
    const src = R.domElement;
    const f = this.frameRect();
    const sx = src.width / cssW, sy = src.height / cssH;
    const out = document.createElement('canvas');
    out.width = Math.round(f.w * sx); out.height = Math.round(f.h * sy);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, f.x * sx, f.y * sy, f.w * sx, f.h * sy, 0, 0, out.width, out.height);
    R.setPixelRatio(prevPR);
    R.setSize(cssW, cssH, false);
    R.render(app.world.scene, app.camera);
    applyFilter(ctx, out.width, out.height, this.filter);
    this.postEffects(ctx, out.width, out.height);
    return await new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.92));
  }

  // ビネット（四隅を暗く）とフィルム粒子
  postEffects(ctx, w, h) {
    if (this.vignette) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,16,12,0.55)');
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    if (this.grain) {
      const tile = grainTile();
      ctx.save(); ctx.globalAlpha = 0.11; ctx.globalCompositeOperation = 'overlay';
      const ox = Math.floor(Math.random() * 256), oy = Math.floor(Math.random() * 256);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, w + 256, h + 256);
      ctx.restore();
    }
  }

  // ================= 動画 =================
  startRecording() {
    if (this.recording || !this.active) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { this.app.ui.toast('このブラウザでは録画できません'); sfx.error(); return; }
    const f = this.frameRect(), r = f.w / f.h;
    let w, h;
    if (r >= 1) { h = this.res; w = Math.round(h * r); } else { w = this.res; h = Math.round(w / r); }
    w -= w % 2; h -= h % 2;
    const comp = document.createElement('canvas'); comp.width = w; comp.height = h;
    const cctx = comp.getContext('2d');
    const stream = comp.captureStream(this.fps);
    if (this.recAudio) {
      const c = audioContext();
      if (c && buses.record) stream.addTrack(buses.record.stream.getAudioTracks()[0]);
    }
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
    const mime = types.find(t => MediaRecorder.isTypeSupported(t));
    let rec;
    try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: this.res >= 1080 ? 10e6 : 6e6, audioBitsPerSecond: 160000 } : undefined); }
    catch (e) { this.app.ui.toast('録画を始められませんでした'); sfx.error(); return; }
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const ext = (rec.mimeType || mime || '').includes('mp4') ? 'mp4' : 'webm';
    this.recording = { rec, chunks, comp, cctx, start: performance.now(), ext, w, h };
    const startedAt = performance.now();
    rec.onstop = () => this.onRecorded(chunks, rec.mimeType || mime || 'video/webm', ext, performance.now() - startedAt);
    rec.start(500);
    sfx.tool();
    if (ext !== 'webm') this.app.ui.toast('このブラウザは WebM の録画に対応していないため、MP4 で保存します', 3500);
    this.render();
  }

  stopRecording() {
    const r = this.recording;
    if (!r) return;
    this.recording = null;
    try { r.rec.stop(); } catch { /* 無視 */ }
    sfx.save();
    this.el.querySelector('.photo-timer').textContent = '';
    this.render();
  }

  async onRecorded(chunks, mime, ext, durationMs) {
    if (!chunks.length) { this.app.ui.toast('録画できませんでした'); return; }
    let blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (ext === 'webm') { try { blob = await fixWebmDuration(blob, durationMs); } catch (e) { console.warn(e); } }
    const url = URL.createObjectURL(blob);
    this.videos.push({ blob, url, time: Date.now(), ext });
    this.lastKind = 'video';
    this.updateLast();
    this.openVideo(this.videos.length - 1);
  }

  // 描画のあと：録画中なら、撮影範囲を録画用の画面へ写す
  afterRender() {
    const r = this.recording;
    if (!r) return;
    const src = this.app.renderer.domElement;
    const f = this.frameRect();
    const sx = src.width / window.innerWidth, sy = src.height / window.innerHeight;
    const ctx = r.cctx;
    const css = FILTERS.find(x => x.id === this.filter).css;
    if ('filter' in ctx) ctx.filter = css;
    ctx.drawImage(src, f.x * sx, f.y * sy, f.w * sx, f.h * sy, 0, 0, r.w, r.h);
    if ('filter' in ctx) ctx.filter = 'none';
    this.postEffects(ctx, r.w, r.h);
    const sec = Math.floor((performance.now() - r.start) / 1000);
    const tm = this.el.querySelector('.photo-timer');
    const txt = `● ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    if (tm.textContent !== txt) tm.textContent = txt;
  }

  openVideo(i) {
    const v = this.videos[i];
    if (!v) return;
    this.app.ui.openModal((box, close) => {
      box.innerHTML = `<h3>動画</h3><video class="photo-preview" controls playsinline></video>
        <p class="video-meta"></p>
        <div class="stack">
          <button class="btn primary" data-a="save">端末に保存</button>
          <button class="btn danger" data-a="del">この動画を削除</button>
          <button class="btn" data-a="close">閉じる</button>
        </div>`;
      const vid = box.querySelector('video'); vid.src = v.url;
      box.querySelector('.video-meta').textContent = `${v.ext.toUpperCase()} ・ ${(v.blob.size / 1048576).toFixed(1)} MB`;
      box.querySelector('[data-a=save]').onclick = async () => {
        sfx.click();
        const d = new Date(v.time), z = n => String(n).padStart(2, '0');
        const name = `memory-palace-video-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.${v.ext}`;
        const r = await downloadBlob(v.blob, name, v.blob.type || 'video/webm');
        if (r !== 'cancelled') { this.app.ui.toast('動画を保存しました'); sfx.save(); }
      };
      box.querySelector('[data-a=del]').onclick = () => {
        sfx.remove(); vid.pause(); URL.revokeObjectURL(v.url);
        this.videos.splice(this.videos.indexOf(v), 1);
        if (this.lastKind === 'video' && !this.videos.length) this.lastKind = this.photos.length ? 'photo' : null;
        this.updateLast(); close();
      };
      box.querySelector('[data-a=close]').onclick = () => { sfx.click(); vid.pause(); close(); };
    }, { className: 'photo-modal' });
  }

  updateLast() {
    const b = this.el.querySelector('[data-a=last]');
    const showVideo = this.lastKind === 'video' && this.videos.length;
    const last = showVideo ? null : this.photos[this.photos.length - 1];
    b.classList.toggle('hidden', !showVideo && !last);
    b.classList.toggle('is-video', !!showVideo);
    if (showVideo) { b.style.backgroundImage = ''; b.dataset.count = this.videos.length; }
    else if (last) { b.style.backgroundImage = `url("${last.url}")`; b.dataset.count = this.photos.length; }
  }

  openLast() {
    if (this.lastKind === 'video' && this.videos.length) this.openVideo(this.videos.length - 1);
    else this.openGallery();
  }

  openGallery(index = this.photos.length - 1) {
    if (!this.photos.length) return;
    let i = index;
    this.app.ui.openModal((box, close) => {
      const draw = () => {
        const p = this.photos[i];
        box.innerHTML = `<h3>写真</h3><img class="photo-preview" alt="">
          <div class="photo-strip"></div>
          <div class="stack">
            <button class="btn primary" data-a="save">端末に保存</button>
            <button class="btn" data-a="paste">この写真を宮殿に貼る</button>
            <button class="btn danger" data-a="del">この写真を削除</button>
            <button class="btn" data-a="close">閉じる</button>
          </div>`;
        box.querySelector('img').src = p.url;
        const strip = box.querySelector('.photo-strip');
        this.photos.forEach((q, j) => {
          const t = document.createElement('button'); t.className = 'photo-thumb' + (j === i ? ' on' : '');
          t.style.backgroundImage = `url("${q.url}")`;
          t.onclick = () => { i = j; sfx.click(); draw(); };
          strip.appendChild(t);
        });
        if (this.photos.length < 2) strip.remove();
        box.querySelector('[data-a=save]').onclick = async () => {
          sfx.click();
          const d = new Date(p.time), z = n => String(n).padStart(2, '0');
          const r = await downloadBlob(p.blob, `memory-palace-photo-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.jpg`, 'image/jpeg');
          if (r !== 'cancelled') { this.app.ui.toast('写真を保存しました'); sfx.save(); }
        };
        box.querySelector('[data-a=paste]').onclick = async () => {
          sfx.click(); close();
          this.exit();
          const it = this.app.tools.tools.image;
          this.app.tools.select('image');
          it.setPending(await prepareImage(new File([p.blob], 'photo.jpg', { type: 'image/jpeg' })));
          this.app.ui.toast(isTouchDevice ? '貼りたい場所をタップしてください' : '貼りたい場所をクリックしてください');
        };
        box.querySelector('[data-a=del]').onclick = () => {
          sfx.remove();
          URL.revokeObjectURL(p.url);
          this.photos.splice(i, 1);
          this.updateLast();
          if (!this.photos.length) { close(); return; }
          i = Math.min(i, this.photos.length - 1); draw();
        };
        box.querySelector('[data-a=close]').onclick = () => { sfx.click(); close(); };
      };
      draw();
    }, { className: 'photo-modal' });
  }
}

// ブラウザが書き出す WebM には長さ（Duration）が入っていないため、Segment Info に書き足す
async function fixWebmDuration(blob, durationMs) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const find = (id, from, to) => {
    for (let i = from; i < Math.min(to, buf.length - id.length); i++) {
      let ok = true;
      for (let k = 0; k < id.length; k++) if (buf[i + k] !== id[k]) { ok = false; break; }
      if (ok) return i;
    }
    return -1;
  };
  const vint = pos => {
    const first = buf[pos]; let len = 1, mask = 0x80;
    while (len <= 8 && !(first & mask)) { len++; mask >>= 1; }
    let v = first & (mask - 1);
    for (let k = 1; k < len; k++) v = v * 256 + buf[pos + k];
    return { len, v };
  };
  const info = find([0x15, 0x49, 0xa9, 0x66], 0, 4096);
  if (info < 0) return blob;
  const sz = vint(info + 4);
  const start = info + 4 + sz.len, end = start + sz.v;
  const f64 = new Uint8Array(8); new DataView(f64.buffer).setFloat64(0, durationMs);
  const dur = find([0x44, 0x89], start, end);
  if (dur >= 0) { // すでにある場合は値だけ書き換える（8 バイトのとき）
    const ds = vint(dur + 2);
    if (ds.v === 8) { buf.set(f64, dur + 2 + ds.len); return new Blob([buf], { type: blob.type }); }
    return blob;
  }
  const add = new Uint8Array([0x44, 0x89, 0x88, ...f64]);
  const newSize = sz.v + add.length;
  if (newSize >= Math.pow(2, 7 * sz.len) - 1) return blob;
  const sizeBytes = new Uint8Array(sz.len);
  let v = newSize;
  for (let k = sz.len - 1; k >= 0; k--) { sizeBytes[k] = v & 0xff; v = Math.floor(v / 256); }
  sizeBytes[0] |= 0x80 >> (sz.len - 1);
  return new Blob([buf.subarray(0, info + 4), sizeBytes, buf.subarray(start, end), add, buf.subarray(end)], { type: blob.type });
}

function clampInRoom(p) {
  const W = ROOM.W / 2 - 0.2, D = ROOM.D / 2 - 0.2;
  p.x = Math.max(-W, Math.min(W, p.x));
  p.z = Math.max(-D, Math.min(D, p.z));
  p.y = Math.max(0.25, Math.min(ROOM.H - 0.15, p.y));
  return p;
}

let grain = null;
function grainTile() {
  if (!grain) {
    grain = document.createElement('canvas'); grain.width = grain.height = 256;
    const x = grain.getContext('2d'), img = x.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
  }
  return grain;
}

// フィルター（全ブラウザで同じ結果になるよう画素を直接処理）
function applyFilter(ctx, w, h, id) {
  if (id === 'none') return;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (id === 'mono') { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = g = b = y; }
    else if (id === 'sepia') {
      const nr = 0.393 * r + 0.769 * g + 0.189 * b, ng = 0.349 * r + 0.686 * g + 0.168 * b, nb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * 0.2 + nr * 0.8; g = g * 0.2 + ng * 0.8; b = b * 0.2 + nb * 0.8;
    } else if (id === 'warm') { r = r * 1.05 + 4; g = g * 1.0 + 1; b = b * 0.9; }
    else if (id === 'cool') { r = r * 0.93; g = g * 1.0 + 1; b = b * 1.06 + 4; }
    else if (id === 'soft') { r = (r - 128) * 0.86 + 128 + 12; g = (g - 128) * 0.86 + 128 + 12; b = (b - 128) * 0.86 + 128 + 12; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
}
