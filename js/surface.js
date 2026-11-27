// 描画できる面（壁・床・天井・家具の天板・画像など）
import * as THREE from './lib/three.module.min.js';

const MAX_TEX = 4096;
let anisotropy = 4;
export function setAnisotropy(a) { anisotropy = a; }

// ストローク用の共有スクラッチキャンバス
const scratch = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d');

export const OVERLAY_Z = 0.0015;

export class Surface {
  /**
   * @param {object} o
   * @param {string} o.key 保存用キー
   * @param {number} o.width 幅(m)
   * @param {number} o.height 高さ(m)
   * @param {number} o.ppm 1mあたりのピクセル数
   * @param {'room'|'furniture'|'image'} o.kind
   * @param {string} o.mount 'floor'|'wall'|'ceiling'|'top'|'face'|'image'
   * @param {THREE.Material} [o.baseMaterial] 下地の面（あれば）
   */
  constructor(o) {
    this.key = o.key;
    this.width = o.width;
    this.height = o.height;
    this.kind = o.kind;
    this.mount = o.mount;
    this.acceptsImages = o.acceptsImages !== false;
    this.acceptsSmall = !!o.acceptsSmall;
    this.owner = o.owner || null; // 家具 or 画像
    this.label = o.label || '';

    const cw = Math.max(16, Math.min(MAX_TEX, Math.round(o.width * o.ppm)));
    const ch = Math.max(16, Math.min(MAX_TEX, Math.round(o.height * o.ppm)));
    this.canvas = document.createElement('canvas');
    this.canvas.width = cw; this.canvas.height = ch;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.premultiplyAlpha = true;
    this.texture.anisotropy = anisotropy;

    this.group = new THREE.Group();
    this.group.name = 'surface:' + this.key;
    this.group.userData.surface = this;

    const target = { type: 'surface', surface: this };
    const geo = new THREE.PlaneGeometry(o.width, o.height);
    if (o.baseMaterial) {
      this.base = new THREE.Mesh(geo, o.baseMaterial);
      this.base.userData.target = target;
      this.group.add(this.base);
    }
    this.overlayMaterial = new THREE.MeshLambertMaterial({
      map: this.texture, transparent: true, depthWrite: false, premultipliedAlpha: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.overlay = new THREE.Mesh(geo, this.overlayMaterial);
    this.overlay.position.z = OVERLAY_Z;
    this.overlay.userData.target = target;
    this.overlay.renderOrder = 1;
    this.group.add(this.overlay);

    this.hasContent = false;
    this.version = 0; // 描くたびに増える（統計の数え直しに使う）
    this.encodeDirty = false;
    this.needsUpload = false;
    this._cache = null;
    this.imageCount = 0; // この面に貼られた画像数（重なり順用）
  }

  get cw() { return this.canvas.width; }
  get ch() { return this.canvas.height; }

  // 1m あたりのピクセル（家具や画像の拡大を考慮）
  pxPerMeter() {
    const s = new THREE.Vector3();
    this.group.getWorldScale(s);
    return this.cw / (this.width * Math.abs(s.x || 1));
  }

  uvToPx(uv) { return { x: uv.x * this.cw, y: (1 - uv.y) * this.ch }; }

  localToPx(x, y) {
    return { x: (x / this.width + 0.5) * this.cw, y: (0.5 - y / this.height) * this.ch };
  }

  worldToLocal(p) { return this.group.worldToLocal(p.clone()); }

  worldNormal() {
    const q = new THREE.Quaternion();
    this.group.getWorldQuaternion(q);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  }

  markDrawn() {
    this.version++;
    this.hasContent = true;
    this.encodeDirty = true;
    this.needsUpload = true;
  }

  flush() {
    if (this.needsUpload) { this.texture.needsUpdate = true; this.needsUpload = false; }
  }

  // ストローク開始時のスナップショット
  snapshot() {
    if (scratch.width !== this.cw || scratch.height !== this.ch) {
      scratch.width = this.cw; scratch.height = this.ch;
    } else {
      scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    }
    scratchCtx.drawImage(this.canvas, 0, 0);
    return scratch;
  }

  restoreRegion(rect) {
    const { x, y, w, h } = rect;
    if (w <= 0 || h <= 0) return;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(x, y, w, h);
    this.ctx.drawImage(scratch, x, y, w, h, x, y, w, h);
    this.ctx.restore();
  }

  snapshotRegion(rect) {
    return scratchCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
  }

  getRegion(rect) { return this.ctx.getImageData(rect.x, rect.y, rect.w, rect.h); }

  putRegion(data, rect) {
    this.ctx.putImageData(data, rect.x, rect.y);
    this.markDrawn();
  }

  clampRect(r) {
    const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
    const x2 = Math.min(this.cw, Math.ceil(r.x + r.w)), y2 = Math.min(this.ch, Math.ceil(r.y + r.h));
    return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.cw, this.ch);
    this.markDrawn();
  }

  // 保存用
  toData() {
    if (!this.hasContent) return null;
    if (!this.encodeDirty && this._cache !== null) return this._cache;
    this._cache = this.canvas.toDataURL('image/png');
    this.encodeDirty = false;
    return this._cache;
  }

  async loadData(dataURL) {
    if (!dataURL) return;
    const img = await loadImage(dataURL);
    this.ctx.drawImage(img, 0, 0, this.cw, this.ch);
    this.markDrawn();
    this._cache = dataURL;
    this.encodeDirty = false;
  }

  dispose() {
    this.texture.dispose();
    this.overlayMaterial.dispose();
    this.overlay.geometry.dispose();
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}
