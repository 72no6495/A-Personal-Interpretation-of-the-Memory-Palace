// 宮殿（シーン・部屋・ドア・家具・画像の管理と保存形式）
import * as THREE from './lib/three.module.min.js';
import { Surface, setAnisotropy, loadImage } from './surface.js';
import { buildModel, CATALOG_BY_ID, mountRotationX, footprintHalf, TONES } from './furniture.js';
import { newId } from './storage.js';

export const ROOM = { W: 8, D: 8, H: 3.2 };
export const DOOR = { w: 0.95, h: 2.12 };

const noRaycast = () => {};
export function disableRaycast(obj) { obj.traverse(o => { o.raycast = noRaycast; }); }

export class Palace {
  constructor(renderer, { id, name, ppm, created }) {
    this.renderer = renderer;
    this.id = id || newId();
    this.name = name || '無題の宮殿';
    this.created = created || Date.now();
    this.ppm = ppm;
    setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    this.surfaces = new Map();
    this.furniture = new Map();
    this.images = new Map();
    this.dirty = false;
    this._colliders = null;
    this.doorOpen = 0; this.doorTarget = 0;

    this.setupLights();
    this.buildRoom();
    this.buildDoor();
  }

  setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf0efec, 2.35);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(2.5, 6, 3.5);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.25);
    dir2.position.set(-3, 2, -4);
    this.scene.add(dir2);
    const p = new THREE.PointLight(0xffffff, 3.2, 0, 1.4);
    p.position.set(0, ROOM.H - 0.4, 0);
    this.scene.add(p);
  }

  buildRoom() {
    const { W, D, H } = ROOM;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.roomMaterial = mat;
    const specs = [
      { key: 'floor', w: W, h: D, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0], mount: 'floor', label: '床' },
      { key: 'ceiling', w: W, h: D, pos: [0, H, 0], rot: [Math.PI / 2, 0, 0], mount: 'ceiling', label: '天井' },
      { key: 'wall_n', w: W, h: H, pos: [0, H / 2, -D / 2], rot: [0, 0, 0], mount: 'wall', label: '正面の壁' },
      { key: 'wall_s', w: W, h: H, pos: [0, H / 2, D / 2], rot: [0, Math.PI, 0], mount: 'wall', label: 'ドアの壁' },
      { key: 'wall_w', w: D, h: H, pos: [-W / 2, H / 2, 0], rot: [0, Math.PI / 2, 0], mount: 'wall', label: '左の壁' },
      { key: 'wall_e', w: D, h: H, pos: [W / 2, H / 2, 0], rot: [0, -Math.PI / 2, 0], mount: 'wall', label: '右の壁' },
    ];
    for (const s of specs) {
      const surf = new Surface({ key: s.key, width: s.w, height: s.h, ppm: this.ppm, kind: 'room', mount: s.mount, baseMaterial: mat, label: s.label, acceptsSmall: s.mount === 'floor' });
      surf.group.position.set(...s.pos);
      surf.group.rotation.set(...s.rot);
      this.scene.add(surf.group);
      this.surfaces.set(s.key, surf);
    }
    this.scene.updateMatrixWorld(true);
  }

  buildDoor() {
    const wall = this.surfaces.get('wall_s');
    const g = new THREE.Group();
    g.position.set(0, -ROOM.H / 2, 0);
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const soft = new THREE.MeshLambertMaterial({ color: 0xf7f7f6 });
    const metal = new THREE.MeshLambertMaterial({ color: 0xcfcfcd });
    const { w, h } = DOOR;
    const c = 0.07;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    // 枠
    add(new THREE.BoxGeometry(c, h + c, 0.05), white, -w / 2 - c / 2, (h + c) / 2, 0.025);
    add(new THREE.BoxGeometry(c, h + c, 0.05), white, w / 2 + c / 2, (h + c) / 2, 0.025);
    add(new THREE.BoxGeometry(w + 2 * c, c, 0.05), white, 0, h + c / 2, 0.025);
    // 向こう側の光
    const light = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, h / 2, 0.004);
    light.visible = false;
    this.doorLight = light;
    // 扉
    const pivot = new THREE.Group();
    pivot.position.set(-w / 2, 0, 0.012);
    g.add(pivot);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, 0.04), white);
    panel.position.set(w / 2, h / 2, 0.02);
    pivot.add(panel);
    for (const [py, ph] of [[h * 0.72, h * 0.4], [h * 0.27, h * 0.38]]) {
      const inset = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, ph, 0.006), soft);
      inset.position.set(w / 2, py, 0.042);
      pivot.add(inset);
    }
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.022), metal);
    lever.position.set(w - 0.15, 1.0, 0.075);
    pivot.add(lever);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 20), metal);
    rose.rotation.x = Math.PI / 2; rose.position.set(w - 0.09, 1.0, 0.05);
    pivot.add(rose);
    this.doorPivot = pivot;
    g.traverse(o => { o.userData.target = { type: 'door' }; });
    light.raycast = noRaycast;
    wall.group.add(g);
    this.door = g;
  }

  // ---------- 家具 ----------
  addFurniture({ id, type, tone, host, x, y, rot = 0, scale = 1 }) {
    const def = CATALOG_BY_ID[type];
    if (!def) return null;
    const furn = {
      kind: 'furniture', id: id || newId(), type, def, tone: tone || def.tone,
      root: new THREE.Group(), surfaces: {}, host: null, x: 0, y: 0, rot: 0, scale: 1,
    };
    furn.root.userData.object = furn;
    this._buildFurnitureModel(furn, true);
    this.furniture.set(furn.id, furn);
    this.attach(furn, host, x, y, rot, scale);
    return furn;
  }

  _buildFurnitureModel(furn, createSurfaces) {
    const built = buildModel(furn.type, furn.tone);
    const inner = built.group;
    inner.rotation.x = mountRotationX(furn.def.mount);
    inner.traverse(o => { if (o.isMesh) o.userData.target = { type: 'object', object: furn }; });
    for (const spec of built.surfaces) {
      let s = furn.surfaces[spec.name];
      if (!s && createSurfaces) {
        s = new Surface({
          key: `${furn.id}:${spec.name}`, width: spec.w, height: spec.h, ppm: this.ppm, kind: 'furniture',
          mount: spec.mount, acceptsImages: spec.acceptsImages, acceptsSmall: spec.acceptsSmall, owner: furn, label: spec.label,
        });
        furn.surfaces[spec.name] = s;
        this.surfaces.set(s.key, s);
      }
      if (s) {
        s.group.position.set(...spec.pos);
        s.group.rotation.set(...spec.rot);
        inner.add(s.group);
      }
    }
    if (furn.inner) {
      furn.root.remove(furn.inner);
      furn.inner.traverse(o => { if (o.isMesh && !o.userData.target?.surface) o.geometry.dispose(); });
    }
    furn.inner = inner;
    furn.root.add(inner);
    furn.bounds = built.bounds;
    furn.half = footprintHalf(furn.def.mount, built.bounds);
    furn.animate = built.animate || null;
  }

  setTone(furn, tone) {
    if (!TONES[tone]) return;
    furn.tone = tone;
    this._buildFurnitureModel(furn, false);
    this._colliders = null;
    this.dirty = true;
  }

  // ---------- 画像 ----------
  async addImage({ id, src, host, x, y, rot = 0, w, h, draw = null, scale = 1, isText = false }) {
    const img = await loadImage(src);
    return this.addImageFromElement({ id, src, el: img, host, x, y, rot, w, h, draw, scale, isText });
  }

  async addImageFromElement({ id, src, el, host, x, y, rot = 0, w, h, draw = null, scale = 1, isText = false }) {
    const tex = new THREE.Texture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.premultiplyAlpha = true;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    const alpha = isText || /^data:image\/(png|webp|gif)/.test(src);
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: alpha, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const obj = { kind: 'image', id: id || newId(), src, w, h, host: null, x: 0, y: 0, rot: 0, scale: 1, isText };
    const ppm = Math.min(this.ppm, 2048 / Math.max(w, h));
    const s = new Surface({ key: `${obj.id}:img`, width: w, height: h, ppm, kind: 'image', mount: 'image', baseMaterial: mat, owner: obj, label: isText ? '文字' : '画像', acceptsImages: false });
    // 画像の縁（ごく薄い影）
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.012, h + 0.012), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.06, depthWrite: false }));
    edge.position.z = -0.0006; edge.raycast = noRaycast;
    if (!alpha) s.group.add(edge);
    s.group.userData.object = obj;
    obj.surface = s;
    obj.root = s.group;
    obj.texture = tex;
    s.base.userData.target = { type: 'surface', surface: s };
    this.surfaces.set(s.key, s);
    this.images.set(obj.id, obj);
    if (draw) await s.loadData(draw);
    this.attach(obj, host, x, y, rot, scale);
    return obj;
  }

  // ---------- 配置 ----------
  attach(obj, host, x, y, rot, scale = obj.scale) {
    const c = this.clampToHost(obj, host, x, y, rot, scale);
    if (obj.host !== host) {
      if (obj.kind === 'image') {
        host.imageCount++;
        obj.layer = host.imageCount;
      }
      host.group.add(obj.root);
    }
    obj.host = host; obj.x = c.x; obj.y = c.y; obj.rot = rot; obj.scale = scale;
    const z = obj.kind === 'image' ? 0.0035 + ((obj.layer || 0) % 24) * 0.0009 : 0;
    obj.root.position.set(c.x, c.y, z);
    obj.root.rotation.set(0, 0, rot);
    obj.root.scale.setScalar(scale);
    obj.root.updateMatrixWorld(true);
    this._colliders = null;
    this.dirty = true;
  }

  halfExtents(obj, rot, scale) {
    let hx, hy;
    if (obj.kind === 'image') { hx = obj.w / 2; hy = obj.h / 2; }
    else { hx = obj.half.hx; hy = obj.half.hy; }
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    return { ex: (c * hx + s * hy) * scale, ey: (s * hx + c * hy) * scale };
  }

  clampToHost(obj, host, x, y, rot, scale) {
    const { ex, ey } = this.halfExtents(obj, rot, scale);
    const lim = (v, half, size) => {
      const m = size / 2 - half;
      if (m <= 0) return 0;
      return Math.max(-m, Math.min(m, v));
    };
    // 画像・小物は面からはみ出しても中心だけは収める
    const loose = obj.kind === 'image' ? 0.5 : (obj.def && obj.def.mount === 'small' && host.kind === 'furniture') ? 0.15 : 1;
    return { x: lim(x, ex * loose, host.width), y: lim(y, ey * loose, host.height) };
  }

  canHost(obj, host) {
    if (!host) return false;
    if (obj.kind === 'image') return host.acceptsImages && host.kind !== 'image' && !this.isDescendantSurface(host, obj);
    const m = obj.def.mount;
    if (m === 'floor') return host.key === 'floor';
    if (m === 'wall') return host.mount === 'wall';
    if (m === 'ceiling') return host.mount === 'ceiling';
    if (m === 'small') return (host.key === 'floor' || host.acceptsSmall) && !this.isDescendantSurface(host, obj);
    return false;
  }

  // host がobj自身（またはその子孫）の面かどうか
  isDescendantSurface(host, obj) {
    if (!obj || !obj.root) return false;
    let o = host.group;
    while (o) { if (o === obj.root) return true; o = o.parent; }
    return false;
  }

  // 依存（この物の面の上に載っているもの）を集める
  collectTree(obj) {
    const list = [obj];
    const surfs = obj.kind === 'image' ? [obj.surface] : Object.values(obj.surfaces);
    for (const s of surfs) {
      for (const f of this.furniture.values()) if (f.host === s) list.push(...this.collectTree(f));
      for (const im of this.images.values()) if (im.host === s) list.push(...this.collectTree(im));
    }
    return list;
  }

  removeObject(obj) {
    const tree = this.collectTree(obj);
    for (const o of tree) {
      if (o.kind === 'image') { this.images.delete(o.id); this.surfaces.delete(o.surface.key); }
      else { this.furniture.delete(o.id); for (const s of Object.values(o.surfaces)) this.surfaces.delete(s.key); }
    }
    obj.root.parent && obj.root.parent.remove(obj.root);
    this._colliders = null;
    this.dirty = true;
    return { top: obj, tree };
  }

  restoreObject(bundle) {
    for (const o of bundle.tree) {
      if (o.kind === 'image') { this.images.set(o.id, o); this.surfaces.set(o.surface.key, o.surface); }
      else { this.furniture.set(o.id, o); for (const s of Object.values(o.surfaces)) this.surfaces.set(s.key, s); }
    }
    bundle.top.host.group.add(bundle.top.root);
    this._colliders = null;
    this.dirty = true;
  }

  // ---------- 当たり判定 ----------
  colliders() {
    if (!this._colliders) {
      this._colliders = [];
      for (const f of this.furniture.values()) {
        if (f.def.collide && f.host && f.host.key === 'floor') {
          const b = new THREE.Box3().setFromObject(f.inner);
          if (b.max.y > 0.15) this._colliders.push(b);
        }
      }
    }
    return this._colliders;
  }

  // ---------- レイキャスト ----------
  pick(raycaster, ignoreRoot = null) {
    const hits = raycaster.intersectObjects(this.scene.children, true);
    const out = [];
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o = h.object, target = null, ignored = false, hidden = false;
      while (o) {
        if (!target && o.userData.target) target = o.userData.target;
        if (ignoreRoot && o === ignoreRoot) ignored = true;
        if (!o.visible) hidden = true;
        o = o.parent;
      }
      if (!target || ignored || hidden) continue;
      out.push({ hit: h, target });
    }
    return out;
  }

  // ---------- 毎フレーム ----------
  update(dt, time) {
    for (const f of this.furniture.values()) if (f.animate) f.animate(time, dt);
    for (const s of this.surfaces.values()) s.flush();
    if (this.doorOpen !== this.doorTarget) {
      const d = this.doorTarget - this.doorOpen;
      this.doorOpen += Math.sign(d) * Math.min(Math.abs(d), dt * 1.1);
      this.doorPivot.rotation.y = -this.doorOpen * 1.6;
      this.doorLight.visible = this.doorOpen > 0.01;
    }
  }

  // ---------- 保存 ----------
  serialize(player) {
    const surfaces = {};
    for (const s of this.surfaces.values()) if (s.kind === 'room') { const d = s.toData(); if (d) surfaces[s.key] = d; }
    const furniture = [];
    for (const f of this.furniture.values()) {
      const sd = {};
      for (const [n, s] of Object.entries(f.surfaces)) { const d = s.toData(); if (d) sd[n] = d; }
      furniture.push({ id: f.id, type: f.type, tone: f.tone, host: f.host.key, x: r4(f.x), y: r4(f.y), rot: r4(f.rot), scale: r4(f.scale), surfaces: sd });
    }
    const images = [];
    for (const im of this.images.values()) {
      images.push({ id: im.id, host: im.host.key, x: r4(im.x), y: r4(im.y), rot: r4(im.rot), scale: r4(im.scale), w: im.w, h: im.h, src: im.src, layer: im.layer || 0, draw: im.surface.toData(), isText: !!im.isText });
    }
    images.sort((a, b) => a.layer - b.layer);
    return {
      version: 1, id: this.id, name: this.name, created: this.created, updated: Date.now(), ppm: this.ppm,
      player: player || null, surfaces, furniture, images,
    };
  }

  static async deserialize(renderer, data, ppm, onProgress) {
    const p = new Palace(renderer, { id: data.id, name: data.name, ppm, created: data.created });
    const jobs = [];
    for (const [k, v] of Object.entries(data.surfaces || {})) {
      const s = p.surfaces.get(k);
      if (s) jobs.push(s.loadData(v));
    }
    // 家具（ホストが解決できるまで繰り返す）
    let pending = [...(data.furniture || [])];
    let guard = 0;
    while (pending.length && guard++ < 20) {
      const next = [];
      for (const f of pending) {
        const host = p.surfaces.get(f.host);
        if (!host) { next.push(f); continue; }
        if (!CATALOG_BY_ID[f.type]) continue;
        const furn = p.addFurniture({ id: f.id, type: f.type, tone: f.tone, host, x: f.x, y: f.y, rot: f.rot, scale: f.scale || 1 });
        for (const [n, d] of Object.entries(f.surfaces || {})) if (furn.surfaces[n]) jobs.push(furn.surfaces[n].loadData(d));
      }
      if (next.length === pending.length) break;
      pending = next;
    }
    onProgress && onProgress(0.5);
    for (const im of data.images || []) {
      const host = p.surfaces.get(im.host);
      if (!host) continue;
      try {
        await p.addImage({ id: im.id, src: im.src, host, x: im.x, y: im.y, rot: im.rot, w: im.w, h: im.h, draw: im.draw, scale: im.scale || 1, isText: !!im.isText });
      } catch (e) { console.warn(e); }
    }
    await Promise.all(jobs.map(j => j.catch(e => console.warn(e))));
    p.dirty = false;
    return p;
  }

  dispose() {
    for (const s of this.surfaces.values()) s.dispose();
    for (const im of this.images.values()) im.texture.dispose();
    this.scene.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}

function r4(v) { return Math.round(v * 10000) / 10000; }
