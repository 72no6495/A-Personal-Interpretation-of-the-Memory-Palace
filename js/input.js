// 入力（PC：WASD＋マウス、スマホ：スティック＋スワイプ）
import { settings, isTouchDevice } from './settings.js';
import { TOOL_ORDER } from './tools.js';
import { sfx, unlockAudio } from './audio.js';

const CENTER = { x: 0, y: 0 };

export class Input {
  constructor(app) {
    this.app = app;
    this.el = app.renderer.domElement;
    this.keys = new Set();
    this.mode = 'lock';            // 'lock' | 'cursor'
    this.locked = false;
    this.wantLock = false;
    this.mouse = null;             // 最後のマウス位置（NDC）
    this.primary = false;          // 左ボタン（ロックモード）
    this.rightDrag = false;
    this.touch = isTouchDevice;
    this.drawMode = false;         // スマホの描画モード
    this.pointers = new Map();     // タッチ
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.enabled = false;

    this._bind();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => this.onPointerDown(e));
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
    window.addEventListener('pointercancel', e => this.onPointerUp(e, true));
    el.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', e => this.onKeyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.app.player.move.x = 0; this.app.player.move.y = 0; });
    document.addEventListener('pointerlockchange', () => this.onLockChange());
  }

  enable(on) {
    this.enabled = on;
    if (!on) {
      this.keys.clear();
      this.releasePrimary();
      this.pointers.clear();
      this.resetStick();
      if (document.pointerLockElement) { this.wantLock = false; document.exitPointerLock(); }
    }
  }

  // ---------- ポインタロック ----------
  requestLock() {
    if (this.touch || this.mode !== 'lock') return;
    this.wantLock = true;
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: false });
      if (p && p.catch) p.catch(() => {});
    } catch { /* 無視 */ }
  }
  exitLock() {
    this.wantLock = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  onLockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.el;
    this.app.ui.setLocked(this.locked);
    if (was && !this.locked) {
      this.releasePrimary();
      // 意図しない解除（Esc）→ 一時停止メニュー
      if (this.wantLock && this.enabled && this.mode === 'lock' && !this.app.ui.modalOpen) this.app.openPauseMenu();
      this.wantLock = false;
    }
  }

  setMode(mode) {
    if (this.touch) return;
    this.mode = mode;
    this.releasePrimary();
    if (mode === 'cursor') this.exitLock();
    else this.requestLock();
    this.app.ui.setInputMode(mode);
  }
  toggleMode() {
    this.setMode(this.mode === 'lock' ? 'cursor' : 'lock');
    sfx.click();
  }

  ndcFromEvent(e) {
    const r = this.el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }

  get tool() { return this.app.tools.active; }
  get toolName() { return this.app.tools.current; }

  releasePrimary() {
    if (this.primary) { this.primary = false; this.tool.up(); }
    this.rightDrag = false;
  }

  // ---------- ポインタ ----------
  onPointerDown(e) {
    unlockAudio();
    if (!this.enabled || this.app.ui.modalOpen) return;
    if (e.pointerType === 'mouse') return this.mouseDown(e);
    e.preventDefault();
    this.touchDown(e);
  }
  onPointerMove(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') return this.mouseMove(e);
    if (this.pointers.has(e.pointerId)) { e.preventDefault(); this.touchMove(e); }
  }
  onPointerUp(e, cancel = false) {
    if (e.pointerType === 'mouse') return this.mouseUp(e);
    if (this.pointers.has(e.pointerId)) this.touchUp(e, cancel);
  }

  // ---- マウス ----
  mouseDown(e) {
    if (e.target !== this.el) return;
    if (this.app.thinking) { // 思考モード：ドアのクリックだけ受け付ける
      if (this.mode === 'lock') {
        if (!this.locked) { this.requestLock(); return; }
        if (e.button === 0) this.app.thinkClick(CENTER);
      } else if (e.button === 0) this.app.thinkClick(this.ndcFromEvent(e));
      else if (e.button === 2) { this.rightDrag = true; this.rightMoved = 0; }
      return;
    }
    if (this.app.photo.active) {
      if (this.mode === 'lock') {
        if (!this.locked) { this.requestLock(); return; }
        if (e.button === 0) this.app.photo.shutter();
      } else if (e.button === 0) this.app.photo.shutter();
      else if (e.button === 2) { this.rightDrag = true; this.rightMoved = 0; }
      return;
    }
    if (this.mode === 'lock') {
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.primary = true; this.tool.down(CENTER, e); }
      else if (e.button === 2) this.secondary();
    } else {
      this.mouse = this.ndcFromEvent(e);
      if (e.button === 0) {
        this.primary = true;
        try { this.el.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
        this.tool.down(this.mouse, e);
      } else if (e.button === 2) {
        this.rightDrag = true;
        this.rightMoved = 0;
      }
    }
  }

  mouseMove(e) {
    const sens = 0.0022 * settings.mouseSensitivity;
    if (this.mode === 'lock') {
      if (!this.locked) return;
      const drawing = this.primary && (this.toolName === 'pen' || this.toolName === 'eraser');
      const k = drawing ? settings.drawSensitivity : 1;
      this.app.player.look(e.movementX * sens * k, e.movementY * sens * k);
      if (this.primary) this.tool.move(CENTER, e);
    } else {
      if (e.target === this.el || this.primary || this.rightDrag) this.mouse = this.ndcFromEvent(e);
      if (this.rightDrag) {
        this.rightMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.app.player.look(e.movementX * sens, e.movementY * sens);
      }
      if (this.primary) this.tool.move(this.mouse, e);
    }
  }

  mouseUp(e) {
    if (e.button === 0 && this.primary) {
      this.primary = false;
      this.tool.up(this.mode === 'lock' ? CENTER : this.mouse, e);
    }
    if (e.button === 2 && this.rightDrag) {
      this.rightDrag = false;
      if (this.rightMoved < 4) this.secondary();
    }
  }

  // 右クリック：回転
  secondary() {
    const n = this.toolName;
    if (n === 'furniture') this.app.tools.tools.furniture.rotate(1);
    else if (n === 'hand' && this.app.tools.selected) this.app.tools.rotateSelected(1);
  }

  onWheel(e) {
    if (!this.enabled || this.app.ui.modalOpen) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    if (this.app.photo.active) {
      const p = this.app.player;
      p.zoomTarget = Math.max(1, Math.min(4, p.zoomTarget * (dir > 0 ? 1.1 : 1 / 1.1)));
      this.app.photo.el.querySelector('[data-a=zoom]').value = p.zoomTarget;
      return;
    }
    const n = this.toolName, t = this.app.tools;
    if (n === 'pen' || n === 'eraser') this.app.ui.adjustSize(dir);
    else if (n === 'furniture') t.tools.furniture.rotate(dir);
    else if (n === 'hand' && t.selected) {
      if (e.shiftKey) t.rotateSelected(dir); else t.scaleSelected(dir > 0 ? 1.08 : 1 / 1.08);
    } else if (n === 'text') this.app.ui.adjustTextSize(dir);
    else if (n === 'image') this.app.ui.adjustImageSize(dir);
  }

  // ---- タッチ ----
  touchDown(e) {
    if (e.target !== this.el) return;
    const ndc = this.ndcFromEvent(e);
    const p = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), role: 'pending', ndc };
    this.pointers.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
    const n = this.toolName;
    const photo = this.app.photo.active || this.app.thinking;
    const drawTool = !photo && (n === 'pen' || n === 'eraser');

    if (drawTool && (this.drawMode || e.pointerType === 'pen')) {
      const drawing = [...this.pointers.values()].filter(q => q.role === 'draw');
      const others = [...this.pointers.values()].filter(q => q !== p && q.role !== 'stick');
      if (others.length === 0 && drawing.length === 0) {
        p.role = 'draw';
        this.tool.down(ndc, {});
      } else {
        // 2本指 → 視点移動
        for (const q of this.pointers.values()) if (q.role === 'draw') { this.tool.up(); }
        for (const q of this.pointers.values()) if (q.role !== 'stick') q.role = 'look2';
      }
      return;
    }

    if (!this.stick.active && !this.drawMode) {
      if (settings.stickMode === 'fixed') {
        // 固定スティック：スティックの周りを触ったときだけ
        const c = this.app.ui.stickCenter();
        if (Math.hypot(e.clientX - c.x, e.clientY - c.y) < 56 * 1.6) {
          p.role = 'stick';
          this.stick = { active: true, id: e.pointerId, ox: c.x, oy: c.y, x: 0, y: 0 };
          this.app.ui.showStick(c.x, c.y);
          this.touchMove(e);
          return;
        }
      } else if (e.clientX < this.leftZoneWidth()) {
        p.role = 'stick';
        this.stick = { active: true, id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
        this.app.ui.showStick(e.clientX, e.clientY);
        return;
      }
    }
    if (!photo && n === 'hand' && this.tool.canDragAt(ndc)) {
      p.role = 'objdrag';
      this.tool.down(ndc, {});
      return;
    }
    p.role = 'pending';
  }

  touchMove(e) {
    const p = this.pointers.get(e.pointerId);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    p.ndc = this.ndcFromEvent(e);
    const sens = 0.0052 * settings.touchSensitivity;
    switch (p.role) {
      case 'stick': {
        const R = 56;
        let vx = (e.clientX - this.stick.ox) / R, vy = (e.clientY - this.stick.oy) / R;
        const l = Math.hypot(vx, vy);
        if (l > 1) { vx /= l; vy /= l; }
        this.stick.x = vx; this.stick.y = vy;
        this.app.ui.moveStick(vx, vy);
        break;
      }
      case 'pending':
        if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 9) p.role = 'look';
        else break;
      // fallthrough
      case 'look':
        this.app.player.look(dx * sens, dy * sens);
        break;
      case 'look2': {
        const n = [...this.pointers.values()].filter(q => q.role === 'look2').length || 1;
        this.app.player.look(dx * sens / n, dy * sens / n);
        break;
      }
      case 'draw':
      case 'objdrag':
        this.tool.move(p.ndc, {});
        break;
    }
  }

  touchUp(e, cancel) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    switch (p.role) {
      case 'stick': this.resetStick(); break;
      case 'draw': case 'objdrag': this.tool.up(p.ndc, {}); break;
      case 'pending': {
        if (cancel) break;
        const dt = performance.now() - p.t;
        if (dt < 500) this.tap(p.ndc);
        break;
      }
    }
  }

  // 移動スティックが出る左側の範囲（横持ちは狭め）
  leftZoneWidth() {
    const w = window.innerWidth, h = window.innerHeight;
    return w > h ? Math.min(w * 0.3, 300) : w * 0.45;
  }

  tap(ndc) {
    if (this.app.thinking) { this.app.thinkClick(ndc); return; }
    if (this.app.photo.active) return;
    const n = this.toolName;
    if (n === 'hand') this.tool.tap(ndc);
    else { this.tool.down(ndc, {}); this.tool.up(ndc, {}); }
  }

  resetStick() {
    this.stick = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.app.ui.hideStick();
  }

  // ---------- キーボード ----------
  onKeyDown(e) {
    if (this.app.xr && this.app.xr.active) return; // VR 中のキーボードは文字入力に使う
    if (!this.enabled) {
      // タイトル画面などでも Esc でダイアログを閉じる
      if (e.code === 'Escape' && this.app.ui.modals.length) this.app.ui.closeTopModal();
      return;
    }
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (this.app.ui.modalOpen) {
      if (e.code === 'Escape') this.app.ui.closeTopModal();
      return;
    }
    const t = this.app.tools, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? this.app.redo() : this.app.undo(); return; }
    if (ctrl && e.code === 'KeyY') { e.preventDefault(); this.app.redo(); return; }
    if (ctrl && e.code === 'KeyS') { e.preventDefault(); this.app.save(true); return; }
    if (ctrl && e.code === 'KeyD') { e.preventDefault(); t.duplicateSelected(); return; }
    if (ctrl) return;
    this.keys.add(e.code);
    if (this.app.photo.active) {
      if (e.code === 'KeyP' || (e.code === 'Escape' && this.mode === 'cursor')) this.app.photo.exit();
      else if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.app.photo.shutter(); }
      else if (e.code === 'KeyV') this.app.photo.toggleMedia();
      else if (e.code === 'KeyC') this.app.photo.cycleCamera();
      else if (e.code === 'KeyF') this.toggleMode();
      else if (e.code === 'KeyH') this.app.ui.toggleHelp();
      return;
    }
    if (this.app.thinking) { // 思考モード：移動のキーとメニューだけ
      if (e.code === 'Escape' && this.mode === 'cursor') this.app.openPauseMenu();
      if (e.code === 'KeyF') this.toggleMode();
      return;
    }
    if (e.code === 'KeyP') { this.app.photo.enter(); return; }
    switch (e.code) {
      case 'KeyQ': t.cycle(-1); break;
      case 'KeyE': t.cycle(1); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': case 'Digit6':
        t.select(TOOL_ORDER[Number(e.code.slice(5)) - 1]); break;
      case 'KeyR':
        if (t.current === 'furniture') t.tools.furniture.rotate(e.shiftKey ? -1 : 1);
        else if (t.selected) t.rotateSelected(e.shiftKey ? -1 : 1);
        break;
      case 'KeyC': this.app.ui.cycleColor(e.shiftKey ? -1 : 1); break;
      case 'KeyF': this.toggleMode(); break;
      case 'KeyG': this.app.faceSurface(); break;
      case 'KeyZ': this.app.toggleZoom(); break;
      case 'KeyT': t.cycleTone(); break;
      case 'KeyH': this.app.ui.toggleHelp(); break;
      case 'BracketLeft': this.sizeKey(-1); break;
      case 'BracketRight': this.sizeKey(1); break;
      case 'Delete': case 'Backspace': case 'KeyX': if (t.selected) t.deleteSelected(); break;
      case 'Escape':
        if (this.mode === 'cursor') this.app.openPauseMenu();
        break;
      case 'Tab': e.preventDefault(); this.app.ui.toggleHud(); break;
    }
  }

  sizeKey(dir) {
    const n = this.toolName, t = this.app.tools;
    if (n === 'pen' || n === 'eraser') this.app.ui.adjustSize(dir);
    else if (n === 'text') this.app.ui.adjustTextSize(dir);
    else if (n === 'image') this.app.ui.adjustImageSize(dir);
    else if (t.selected) t.scaleSelected(dir > 0 ? 1.1 : 1 / 1.1);
  }

  // ---------- 毎フレーム ----------
  update() {
    if (!this.enabled) return;
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (this.stick.active) { x = this.stick.x; y = -this.stick.y; }
    this.app.player.move.x = x;
    this.app.player.move.y = y;

    // ホバー（照準 or カーソル）
    let ndc = null;
    if (this.touch || this.mode === 'lock') ndc = CENTER;
    else if (this.mouse) ndc = this.mouse;
    if (ndc && !this.app.photo.active && !this.app.thinking) this.tool.hover(ndc);
    // ロック中に描きながら移動
    if (this.primary && this.mode === 'lock' && (x || y)) this.tool.move(CENTER, {});
  }
}
