// 撮影モード
import { sfx } from './audio.js';
import { isTouchDevice } from './settings.js';
import { downloadBlob } from './storage.js';
import { prepareImage } from './tools.js';

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
  { id: '4:3', name: '4:3', r: 4 / 3 },
  { id: '1:1', name: '1:1', r: 1 },
  { id: '16:9', name: '16:9', r: 16 / 9 },
  { id: '3:4', name: '3:4', r: 3 / 4 },
];

export class PhotoMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.filter = 'none';
    this.aspect = 'full';
    this.grid = true;
    this.photos = []; // このセッションで撮った写真 { blob, url, time }
    this.el = document.getElementById('photo-ui');
    this.frame = document.getElementById('photo-frame');
    this.build();
    window.addEventListener('resize', () => this.layout());
  }

  build() {
    const el = this.el;
    el.querySelector('[data-a=exit]').onclick = () => { sfx.click(); this.exit(); };
    el.querySelector('[data-a=shutter]').onclick = () => this.shoot();
    el.querySelector('[data-a=last]').onclick = () => this.openGallery();
    el.querySelector('[data-a=grid]').onclick = () => { this.grid = !this.grid; sfx.click(); this.render(); };
    const zoom = el.querySelector('[data-a=zoom]');
    zoom.oninput = () => { this.app.player.zoomTarget = parseFloat(zoom.value); };
    for (const id of ['photo-ui']) document.getElementById(id).addEventListener('pointerdown', e => { if (e.target !== this.frame && !this.frame.contains(e.target)) e.stopPropagation(); });
    this.render();
  }

  render() {
    const fl = this.el.querySelector('.photo-filters');
    fl.innerHTML = '';
    for (const f of FILTERS) {
      const b = document.createElement('button'); b.className = 'chip' + (this.filter === f.id ? ' on' : ''); b.textContent = f.name;
      b.onclick = () => { this.filter = f.id; sfx.click(); this.render(); };
      fl.appendChild(b);
    }
    const as = this.el.querySelector('.photo-aspects');
    as.innerHTML = '';
    for (const a of ASPECTS) {
      const b = document.createElement('button'); b.className = 'chip' + (this.aspect === a.id ? ' on' : ''); b.textContent = a.name;
      b.onclick = () => { this.aspect = a.id; sfx.click(); this.render(); };
      as.appendChild(b);
    }
    this.el.querySelector('[data-a=grid]').classList.toggle('on', this.grid);
    this.frame.classList.toggle('grid', this.grid);
    document.getElementById('view').style.filter = this.active ? (FILTERS.find(f => f.id === this.filter).css) : '';
    this.layout();
  }

  // 撮影範囲（画面座標）
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

  enter() {
    if (this.active || !this.app.inGame) return;
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
    app.ui.toast(isTouchDevice ? '撮影モード：右下のボタンで撮影' : '撮影モード：クリック／スペースで撮影、P で終了', 2200);
  }

  exit() {
    if (!this.active) return;
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

  async shoot() {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      const blob = await this.capture();
      const url = URL.createObjectURL(blob);
      this.photos.push({ blob, url, time: Date.now() });
      sfx.shutter();
      const fl = document.getElementById('photo-flash');
      fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
      this.updateLast();
    } catch (e) {
      console.error(e);
      this.app.ui.toast('撮影できませんでした'); sfx.error();
    } finally { this.busy = false; }
  }

  // 高解像度でレンダリングして切り抜き、フィルターをかける
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
    return await new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/jpeg', 0.92));
  }

  updateLast() {
    const b = this.el.querySelector('[data-a=last]');
    const last = this.photos[this.photos.length - 1];
    b.classList.toggle('hidden', !last);
    if (last) { b.style.backgroundImage = `url("${last.url}")`; b.dataset.count = this.photos.length; }
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
