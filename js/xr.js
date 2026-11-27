// WebXR（VR ヘッドセットで宮殿に入る）
// - 左スティック：移動 / 右スティック：30° ずつ向きを変える
// - トリガー（ハンドトラッキングではつまむ）：ツールを使う・メニューを押す
// - 右 A：回転 / 右 B：メニューを目の前に / 左 X：元に戻す / 左 Y：やり直す
// - 左手にメニュー板（ツール・色・太さ・家具・保存・VR終了）
import * as THREE from './lib/three.module.min.js';
import { settings, saveSettings } from './settings.js';
import { applyVolumes } from './audio.js';
import { sfx } from './audio.js';
import { disableRaycast } from './world.js';
import { PEN_COLORS } from './tools.js';
import { CATALOG, MOUNT_NAMES } from './furniture.js';
import { TRACKS } from './music.js';

const VR_TOOLS = ['hand', 'pen', 'eraser', 'text', 'furniture'];
const TOOL_NAMES = { hand: '手', pen: 'ペン', eraser: '消しゴム', text: '文字', furniture: '家具' };
const HEIGHT_MIN = -0.5, HEIGHT_MAX = 0.4; // 視点の高さの調整範囲（高くなりすぎないように）

// パレットのキーボード
const KANA = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や　ゆ　よ', 'らりるれろ', 'わをんー〜'];
const KANA_EXTRA = ['゛', '゜', '小', '、', '。', '！', '？', '・', '「', '」'];
const ABC = ['1234567890', 'qwertyuiop', 'asdfghjkl-', 'zxcvbnm,.?'];
const ABC_EXTRA = ['!', '@', '#', '/', ':', ';', '(', ')', '&', '+'];
const DAKU = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ', う: 'ゔ' };
const HANDAKU = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const SMALL = { あ: 'ぁ', い: 'ぃ', う: 'ぅ', え: 'ぇ', お: 'ぉ', つ: 'っ', や: 'ゃ', ゆ: 'ゅ', よ: 'ょ', わ: 'ゎ' };
const invert = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const UNDAKU = invert(DAKU), UNHANDAKU = invert(HANDAKU), UNSMALL = invert(SMALL);
const PANEL_W = 0.3, PANEL_H = 0.225, CW = 1024, CH = 768;

export class XRMode {
  constructor(app) {
    this.app = app;
    this.supported = false;
    this.active = false;
    this.session = null;
    this.controllers = [];
    this.message = '';
    this.mode = 'main';
    this.catMount = 'floor';
    this.catIndex = 0;
    this.thumbImgs = new Map();
    this.checkSupport();
  }

  async checkSupport() {
    try {
      this.supported = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'));
    } catch { this.supported = false; }
    this.app.ui.setXRAvailable(this.supported);
  }

  // ---------- 開始・終了 ----------
  async enter() {
    if (this.active || !this.app.inGame) return;
    if (!this.supported) { this.app.ui.toast('この端末・ブラウザでは VR を使えません'); return; }
    // VR 中は通常の画面に描けないので、家具のサムネイルを先に作っておく
    for (const c of CATALOG) this.app.ui.thumb(c.id);
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      const R = this.app.renderer;
      R.xr.enabled = true;
      R.xr.setReferenceSpaceType('local-floor');
      await R.xr.setSession(session);
      this.session = session;
      session.addEventListener('end', () => this.onEnd());
      this.onStart();
    } catch (e) {
      console.error(e);
      this.app.ui.toast('VR を開始できませんでした：' + (e.message || e));
    }
  }

  exit() { if (this.session) this.session.end(); }

  onStart() {
    const app = this.app;
    this.active = true;
    app.photo.exit();
    app.input.exitLock();
    app.input.releasePrimary();
    app.ui.closeAllModals();
    if (!VR_TOOLS.includes(app.tools.current)) app.tools.select('hand');
    document.body.classList.add('xr');

    // プレイヤーの「台座」：カメラとコントローラーはこの中で動く
    const rig = new THREE.Group();
    rig.position.set(app.player.pos.x, settings.vrHeight || 0, app.player.pos.z);
    rig.rotation.y = app.player.yaw;
    rig.add(app.camera);
    app.camera.position.set(0, 0, 0);
    app.camera.rotation.set(0, 0, 0);
    app.world.scene.add(rig);
    this.rig = rig;
    app.player.xr = true;

    this.buildControllers();
    this.buildPanel();
    this.mode = 'main';
    this.notify('VR で宮殿に入りました');
    sfx.arrive();
  }

  onEnd() {
    const app = this.app;
    this.active = false;
    this.session = null;
    document.body.classList.remove('xr');
    for (const c of this.controllers) {
      c.ray.parent && c.ray.parent.remove(c.ray);
      c.grip.parent && c.grip.parent.remove(c.grip);
    }
    this.controllers = [];
    if (this.panel) { this.panel.parent && this.panel.parent.remove(this.panel); this.panel.geometry.dispose(); this.panel.material.map.dispose(); this.panel = null; }
    if (this.rig) {
      // 頭の位置と向きを、通常のカメラへ引き継ぐ
      const head = new THREE.Vector3(); app.camera.getWorldPosition(head);
      const dir = new THREE.Vector3(); app.camera.getWorldDirection(dir);
      this.rig.remove(app.camera);
      this.rig.parent && this.rig.parent.remove(this.rig);
      this.rig = null;
      app.player.pos.x = head.x; app.player.pos.z = head.z;
      app.player.yaw = Math.atan2(-dir.x, -dir.z);
      app.player.pitch = 0;
    }
    app.player.xr = false;
    app.player.collide(app.world ? app.world.colliders() : []);
    app.player.apply();
    // three.js 側の後片付けが終わってから通常表示に戻す
    setTimeout(() => { app.renderer.xr.enabled = false; app.resize(); }, 0);
    if (this.pendingExitDoor) { this.pendingExitDoor = false; app.exitThroughDoor(); }
    else if (app.world && app.world.dirty) app.save(false);
  }

  // ---------- コントローラー ----------
  buildControllers() {
    const R = this.app.renderer;
    for (let i = 0; i < 2; i++) {
      const ray = R.xr.getController(i);
      const grip = R.xr.getControllerGrip(i);
      const c = { ray, grip, index: i, source: null, down: false, buttons: [], turnArmed: true };
      // レーザー
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x4d8dff, transparent: true, opacity: 0.7 }));
      line.scale.z = 3;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4d8dff }));
      dot.visible = false;
      ray.add(line);
      c.line = line; c.dot = dot;
      this.rig.add(dot);
      // 手元の簡単なモデル
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.025, 0.11), new THREE.MeshLambertMaterial({ color: 0xdedede }));
      body.position.z = 0.02;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 24), new THREE.MeshLambertMaterial({ color: 0xcfcfcf }));
      ring.position.set(0, 0.01, -0.035); ring.rotation.x = Math.PI / 2.4;
      grip.add(body, ring);
      disableRaycast(ray); disableRaycast(grip); disableRaycast(dot);
      ray.addEventListener('connected', e => { c.source = e.data; c.hand = !!e.data.hand; body.visible = ring.visible = !c.hand; this.placePanel(); });
      ray.addEventListener('disconnected', () => { c.source = null; this.placePanel(); });
      ray.addEventListener('selectstart', () => this.onSelectStart(c));
      ray.addEventListener('selectend', () => this.onSelectEnd(c));
      this.rig.add(ray, grip);
      this.controllers.push(c);
    }
  }

  handed(side) { return this.controllers.find(c => c.source && c.source.handedness === side); }
  // レーザーで指す手（パレットを持たないほうの手）
  pointer() {
    const other = settings.vrPanelHand === 'right' ? 'left' : 'right';
    return this.handed(other) || this.controllers.find(c => c.source) || null;
  }

  rayOf(c) {
    const origin = new THREE.Vector3().setFromMatrixPosition(c.ray.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(c.ray.matrixWorld);
    return { ray: { origin, direction: dir } };
  }

  onSelectStart(c) {
    c.down = true;
    const r = this.rayOf(c);
    const p = this.panelHit(r);
    if (p) { c.onPanel = true; this.pressPanel(p); return; }
    c.onPanel = false;
    this.toolOwner = c;
    this.app.tools.active.down(r, {});
  }

  onSelectEnd(c) {
    c.down = false;
    if (c.onPanel) { c.onPanel = false; return; }
    if (this.toolOwner === c) { this.app.tools.active.up(this.rayOf(c), {}); this.toolOwner = null; }
  }

  // ---------- 毎フレーム ----------
  update(dt) {
    if (!this.active || !this.rig) return;
    const app = this.app;
    this.rig.updateMatrixWorld(true);

    // スティック・ボタン
    for (const c of this.controllers) {
      const gp = c.source && c.source.gamepad;
      if (!gp) continue;
      const side = c.source.handedness;
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      if (side === 'left') this.locomote(ax[0], ax[1], dt);
      else if (settings.vrTurn === 'smooth') this.smoothTurn(ax[0], dt);
      else this.snapTurn(c, ax[0]);
      const pressed = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      for (const i of [4, 5]) {
        const now = pressed(i), was = !!c.buttons[i];
        c.buttons[i] = now;
        if (now && !was) this.onButton(side, i);
      }
    }

    // レーザーとホバー
    const ptr = this.pointer();
    let panelHover = null;
    for (const c of this.controllers) {
      if (!c.source) { c.line.visible = false; c.dot.visible = false; continue; }
      const r = this.rayOf(c);
      const ph = this.panelHit(r);
      let dist = 3, hitPoint = null;
      if (ph) { dist = ph.distance; hitPoint = ph.point; if (c === ptr || !panelHover) panelHover = ph; }
      else {
        const t = app.pickAll(r)[0];
        if (t) { dist = t.hit.distance; hitPoint = t.hit.point; }
      }
      const isLeftWithPanel = this.panel && this.panelOn === c;
      c.line.visible = !isLeftWithPanel;
      c.line.scale.z = Math.max(0.05, dist);
      c.dot.visible = !!hitPoint && !isLeftWithPanel;
      if (hitPoint) c.dot.position.copy(this.rig.worldToLocal(hitPoint.clone()));
    }
    this.setHover(panelHover);
    this.followView(dt);

    // ツール：ホバーとドラッグ中の移動
    const owner = this.toolOwner;
    if (owner && owner.down) app.tools.active.move(this.rayOf(owner), {});
    else if (ptr && !panelHover) app.tools.active.hover(this.rayOf(ptr));
    if (this.panelDirty) this.drawPanel();
  }

  locomote(x, y, dt) {
    const dead = 0.18;
    if (Math.hypot(x, y) < dead) return;
    const p = this.app.player;
    const fwd = new THREE.Vector3(); this.app.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) return;
    fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const sp = 2.0 * settings.moveSpeed * dt;
    const head = new THREE.Vector3(); this.app.camera.getWorldPosition(head);
    const off = head.clone().sub(this.rig.position); off.y = 0;
    // 頭の位置で当たり判定してから台座を動かす
    p.pos.x = head.x + (fwd.x * -y + right.x * x) * sp;
    p.pos.z = head.z + (fwd.z * -y + right.z * x) * sp;
    p.collide(this.app.world.colliders());
    this.rig.position.x = p.pos.x - off.x;
    this.rig.position.z = p.pos.z - off.z;
    p.stepDist = (p.stepDist || 0) + sp;
    if (p.stepDist > 0.7) { p.stepDist = 0; sfx.step(); }
  }

  snapTurn(c, x) {
    if (Math.abs(x) < 0.3) { c.turnArmed = true; return; }
    if (!c.turnArmed || Math.abs(x) < 0.7) return;
    c.turnArmed = false;
    const a = -Math.sign(x) * (settings.vrTurn === 'snap45' ? Math.PI / 4 : Math.PI / 6);
    this.turnAround(a);
    sfx.click();
  }

  smoothTurn(x, dt) {
    if (Math.abs(x) < 0.2) return;
    this.turnAround(-Math.sign(x) * (Math.abs(x) - 0.2) / 0.8 * 1.7 * dt); // 最大 約 100°/秒
  }

  // 頭の位置を中心に向きを変える
  turnAround(a) {
    const head = new THREE.Vector3(); this.app.camera.getWorldPosition(head);
    this.rig.rotation.y += a;
    this.rig.updateMatrixWorld(true);
    const head2 = new THREE.Vector3(); this.app.camera.getWorldPosition(head2);
    this.rig.position.x += head.x - head2.x;
    this.rig.position.z += head.z - head2.z;
    this.app.player.yaw = this.rig.rotation.y;
  }

  onButton(side, i) {
    const t = this.app.tools;
    if (side === 'left' && i === 4) this.app.undo();
    else if (side === 'left' && i === 5) this.app.redo();
    else if (i === 4) {
      if (t.current === 'furniture') t.tools.furniture.rotate(1);
      else if (t.selected) t.rotateSelected(1);
    } else if (i === 5) { // パレットを目の前に呼ぶ（手につくときは、手に戻す）
      if (this.panelOn || settings.vrPanelFollow === 'hand') { if (this.panelOn) this.recenterPanel(); else this.placePanel(); }
      else this.recenterPanel();
      sfx.click();
    }
    this.panelDirty = true;
  }

  // ---------- メニュー板 ----------
  buildPanel() {
    const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
    this.pctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: true }));
    mesh.renderOrder = 30;
    this.panel = mesh;
    this.panelDirty = true;
    this.placePanel();
    this.drawPanel();
  }

  // パレットの位置：手につく／視線についてくる／その場に置く
  placePanel() {
    if (!this.panel) return;
    const holder = this.handed(settings.vrPanelHand);
    if (settings.vrPanelFollow === 'hand' && holder && !holder.hand) {
      holder.grip.add(this.panel);
      this.panel.position.set(0, 0.07, -0.06);
      this.panel.rotation.set(-Math.PI / 3, 0, 0);
      this.panel.scale.setScalar(settings.vrPanelSize || 1);
      this.panelOn = holder;
    } else {
      this.panelOn = null;
      this.recenterPanel();
    }
  }

  // 目の前（少し下）に呼ぶ
  panelTarget() {
    const cam = this.app.camera;
    const head = new THREE.Vector3(); cam.getWorldPosition(head);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir); dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1);
    dir.normalize();
    const pos = head.clone().addScaledVector(dir, 0.55); pos.y = head.y - 0.25;
    return { pos, head, dir };
  }

  recenterPanel() {
    if (!this.panel) return;
    this.panelOn = null;
    const { pos, head } = this.panelTarget();
    this.rig.add(this.panel);
    this.panel.position.copy(this.rig.worldToLocal(pos.clone()));
    this.panel.scale.setScalar(1.5 * (settings.vrPanelSize || 1));
    this.panel.lookAt(head.x, head.y - 0.1, head.z);
  }

  // 「視線についてくる」：視線が大きくそれたら、ゆっくり目の前へ戻る
  followView(dt) {
    if (!this.panel || this.panelOn || settings.vrPanelFollow !== 'view') return;
    const { pos, head, dir } = this.panelTarget();
    const cur = this.panel.getWorldPosition(new THREE.Vector3());
    const toPanel = cur.clone().sub(head); toPanel.y = 0;
    const ang = toPanel.lengthSq() > 1e-4 ? toPanel.normalize().angleTo(dir) : 0;
    if (ang > 0.6 || cur.distanceTo(pos) > 0.45) this.following = true;
    if (!this.following) return;
    const k = 1 - Math.exp(-dt * 4);
    cur.lerp(pos, k);
    this.panel.position.copy(this.rig.worldToLocal(cur.clone()));
    this.panel.lookAt(head.x, head.y - 0.1, head.z);
    if (cur.distanceTo(pos) < 0.02) this.following = false;
  }

  panelHit(r) {
    if (!this.panel || !this.panel.parent) return null;
    const rc = this.app.raycaster;
    rc.set(r.ray.origin, r.ray.direction);
    const h = rc.intersectObject(this.panel, false)[0];
    if (!h) return null;
    const x = h.uv.x * CW, y = (1 - h.uv.y) * CH;
    const btn = (this.buttons || []).find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
    return { distance: h.distance, point: h.point, btn };
  }

  setHover(p) {
    const b = p ? p.btn : null;
    if (b !== this.hoverBtn) { this.hoverBtn = b; this.panelDirty = true; }
  }

  pressPanel(p) {
    if (!p.btn || p.btn.disabled) return;
    sfx.click();
    p.btn.action();
    this.panelDirty = true;
  }

  notify(msg) {
    this.message = msg;
    this.panelDirty = true;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { this.message = ''; this.panelDirty = true; }, 4000);
  }

  // ---------- 文字入力 ----------
  openText(onSubmit) {
    this.mode = 'text';
    this.textCb = onSubmit;
    this.kbd = this.kbd || 'kana';
    this.shift = false;
    const ta = this.textArea();
    ta.value = '';
    try { ta.focus({ preventScroll: true }); } catch { /* 無視 */ }
    if (!this.panelOn) this.recenterPanel();
    this.panelDirty = true;
    sfx.open();
  }

  // Quest のキーボード（システムキーボード）や Bluetooth キーボードの入力先
  textArea() {
    if (!this.ta) {
      const ta = document.createElement('textarea');
      ta.id = 'xr-text-input';
      ta.setAttribute('aria-label', 'VR の文字入力');
      ta.style.cssText = 'position:fixed;left:-1000px;top:0;width:200px;height:40px;opacity:0.01;';
      ta.addEventListener('input', () => { this.panelDirty = true; });
      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.submitText(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.cancelText(); }
      });
      document.body.appendChild(ta);
      this.ta = ta;
    }
    return this.ta;
  }

  get textValue() { return this.ta ? this.ta.value : ''; }
  typeKey(ch) {
    const ta = this.textArea();
    if (ch === '゛' || ch === '゜' || ch === '小') {
      const last = ta.value.slice(-1);
      let rep = null;
      if (ch === '゛') rep = DAKU[last] || UNDAKU[last] || (UNHANDAKU[last] && DAKU[UNHANDAKU[last]]);
      if (ch === '゜') rep = HANDAKU[last] || UNHANDAKU[last] || (UNDAKU[last] && HANDAKU[UNDAKU[last]]);
      if (ch === '小') rep = SMALL[last] || UNSMALL[last];
      if (rep) ta.value = ta.value.slice(0, -1) + rep;
    } else ta.value += ch;
    if (this.shift && this.kbd === 'abc') this.shift = false;
    this.panelDirty = true;
  }
  backspace() { const ta = this.textArea(); ta.value = Array.from(ta.value).slice(0, -1).join(''); this.panelDirty = true; }
  submitText() {
    const v = this.textValue, cb = this.textCb;
    this.textCb = null; this.mode = 'main';
    if (this.ta) this.ta.blur();
    this.panelDirty = true;
    if (cb && v.trim()) cb(v);
  }
  cancelText() { this.textCb = null; this.mode = 'main'; if (this.ta) this.ta.blur(); this.panelDirty = true; }
  showSystemKeyboard() {
    const ta = this.textArea();
    try { ta.blur(); ta.focus({ preventScroll: true }); } catch { /* 無視 */ }
    const ok = this.session && this.session.isSystemKeyboardSupported;
    this.notify(ok === false ? 'この端末ではシステムキーボードが使えません' : 'キーボードが出ないときはパレットで入力');
  }

  openTrackPanel(furn) {
    this.mode = 'tracks';
    this.trackFurn = furn;
    if (!this.panelOn) this.recenterPanel();
    this.panelDirty = true;
  }

  openDoorPanel() {
    this.mode = 'door';
    if (!this.panelOn) this.recenterPanel();
    this.panelDirty = true;
    sfx.open();
  }

  drawPanel() {
    this.panelDirty = false;
    const x = this.pctx, app = this.app, tools = app.tools, st = tools.state;
    const font = '"Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif';
    const btns = [];
    this._btnsRef = btns;
    const B = (bx, by, bw, bh, label, action, o = {}) => btns.push({ x: bx, y: by, w: bw, h: bh, label, action, ...o });
    x.clearRect(0, 0, CW, CH);
    rr(x, 4, 4, CW - 8, CH - 8, 36); x.fillStyle = 'rgba(255,255,255,0.94)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.08)'; x.stroke();
    x.textBaseline = 'middle';
    x.fillStyle = '#2b2b2e'; x.font = `500 34px ${font}`; x.textAlign = 'left';
    x.fillText(app.world ? app.world.name : '', 36, 50);
    if (this.message) { x.fillStyle = '#4d8dff'; x.font = `500 26px ${font}`; x.textAlign = 'right'; x.fillText(this.message.slice(0, 26), CW - 36, 50); }

    if (this.mode === 'text') {
      this.drawTextMode(x, B, font);
    } else if (this.mode === 'settings') {
      this.drawSettings(x, B, font);
    } else if (this.mode === 'tracks') {
      const furn = this.trackFurn;
      x.fillStyle = '#2b2b2e'; x.textAlign = 'center'; x.font = `500 44px ${font}`; x.fillText('グラモフォン', CW / 2, 140);
      x.fillStyle = '#85858b'; x.font = `400 26px ${font}`; x.fillText('流す曲を選んでください', CW / 2, 190);
      TRACKS.forEach((tr, k) => B(36 + (k % 2) * 482, 230 + Math.floor(k / 2) * 130, 470, 110, tr.name, () => { this.mode = 'main'; app.music.play(furn, tr.id); }));
      B(262, 500, 500, 100, '今は流さない', () => { this.mode = 'main'; });
    } else if (this.mode === 'door') {
      x.fillStyle = '#2b2b2e'; x.textAlign = 'center'; x.font = `500 44px ${font}`; x.fillText('ドア', CW / 2, 150);
      x.fillStyle = '#85858b'; x.font = `400 26px ${font}`;
      x.fillText('バックアップの作成は VR を終えてから、ドアやメニューで行えます', CW / 2, 205);
      B(162, 260, 700, 110, '保存して VR を終了', () => { this.mode = 'main'; app.save(false); this.exit(); }, { primary: true });
      B(162, 390, 700, 110, 'ドアから出る（タイトルへ）', () => { this.mode = 'main'; this.pendingExitDoor = true; this.exit(); });
      B(162, 520, 700, 110, '部屋に戻る', () => { this.mode = 'main'; });
    } else {
      // ツール
      VR_TOOLS.forEach((t, i) => B(36 + i * 192, 90, 180, 100, TOOL_NAMES[t], () => {
        tools.select(t);
        if (t === 'furniture' && !st.furnitureType) this.selectCatalog();
      }, { on: tools.current === t }));
      const cy = 210;
      const cur = tools.current;
      if (cur === 'text') {
        PEN_COLORS.forEach((c, i) => B(36 + i * 120, cy, 108, 84, '', () => { st.color = c.hex; app.ui.updateSwatchDots(); }, { color: c.hex, on: st.color === c.hex }));
        B(36, cy + 104, 150, 90, '小さく', () => { st.textSize = Math.max(1, st.textSize / 1.25); });
        B(616, cy + 104, 150, 90, '大きく', () => { st.textSize = Math.min(80, st.textSize * 1.25); });
        x.fillStyle = '#2b2b2e'; x.textAlign = 'center'; x.font = `500 32px ${font}`;
        x.fillText(`文字の大きさ ${st.textSize.toFixed(1)} cm`, 401, cy + 149);
        x.fillStyle = '#85858b'; x.font = `400 24px ${font}`; x.textAlign = 'left';
        x.fillText('書きたい場所をトリガーで選ぶと、文字の入力画面になります', 40, cy + 230);
      } else if (cur === 'pen' || cur === 'eraser') {
        if (cur === 'pen') PEN_COLORS.forEach((c, i) => B(36 + i * 120, cy, 108, 84, '', () => { st.color = c.hex; app.ui.updateSwatchDots(); }, { color: c.hex, on: st.color === c.hex }));
        const ry = cur === 'pen' ? cy + 104 : cy;
        const key = cur === 'pen' ? 'penSize' : 'eraserSize';
        const [lo, hi] = cur === 'pen' ? [0.15, 15] : [0.5, 60];
        B(36, ry, 150, 90, '細く', () => { st[key] = Math.max(lo, st[key] / 1.3); });
        B(616, ry, 150, 90, '太く', () => { st[key] = Math.min(hi, st[key] * 1.3); });
        x.fillStyle = '#2b2b2e'; x.textAlign = 'center'; x.font = `500 32px ${font}`;
        x.fillText(`太さ ${st[key] < 1 ? st[key].toFixed(2) : st[key].toFixed(1)} cm`, 401, ry + 45);
        if (cur === 'pen') B(786, ry, 202, 90, st.smoothing > 0.2 ? '補正 あり' : '補正 なし', () => { st.smoothing = st.smoothing > 0.2 ? 0 : 0.35; });
      } else if (cur === 'furniture') {
        ['floor', 'wall', 'ceiling', 'small'].forEach((m, i) => B(36 + i * 160, cy, 148, 70, MOUNT_NAMES[m], () => { this.catMount = m; this.catIndex = 0; this.selectCatalog(); }, { on: this.catMount === m }));
        const list = CATALOG.filter(c => c.mount === this.catMount && !c.hidden);
        const item = list[this.catIndex % list.length];
        B(36, cy + 90, 110, 170, '‹', () => { this.catIndex = (this.catIndex - 1 + list.length) % list.length; this.selectCatalog(); }, { big: true });
        B(632, cy + 90, 110, 170, '›', () => { this.catIndex = (this.catIndex + 1) % list.length; this.selectCatalog(); }, { big: true });
        B(762, cy, 226, 70, '回転 (A)', () => tools.tools.furniture.rotate(1));
        B(762, cy + 90, 226, 170, st.furnitureType ? '選択中' : 'これを置く', () => this.selectCatalog(), { on: !!st.furnitureType });
        const img = this.thumb(item.id);
        rr(x, 160, cy + 90, 458, 170, 20); x.fillStyle = '#f4f4f6'; x.fill();
        if (img && img.complete) x.drawImage(img, 172, cy + 98, 154, 154);
        x.fillStyle = '#2b2b2e'; x.textAlign = 'left'; x.font = `500 34px ${font}`; x.fillText(item.name, 340, cy + 155);
        x.fillStyle = '#85858b'; x.font = `400 22px ${font}`; x.fillText(item.note || '', 340, cy + 200);
      } else if (cur === 'hand') {
        const o = tools.selected, w = app.world;
        if (o) {
          x.fillStyle = '#2b2b2e'; x.textAlign = 'left'; x.font = `500 32px ${font}`;
          x.fillText(o.kind === 'image' ? (o.isText ? '文字' : o.isSticky ? '付箋' : '画像') : o.def.name, 40, cy + 30);
          let bx = 36;
          const add = (label, fn, wdt = 180) => { B(bx, cy + 70, wdt, 90, label, fn); bx += wdt + 12; };
          add('回転', () => tools.rotateSelected(1));
          if (o.kind === 'furniture' && w.isOpenable(o)) add(w.anyOpen(o) ? '閉める' : '開ける', () => { const op = w.anyOpen(o); w.setAllOpen(o, !op); (op ? sfx.closeDrawer : sfx.openDrawer).call(sfx); app.markDirty(); });
          if (o.kind === 'furniture' && w.hasLight(o)) add(o.state.light !== false ? '消灯' : '点灯', () => { w.setLight(o, o.state.light === false); app.markDirty(); });
          if (app.monitors.isMonitor(o)) add('次の画面', () => app.monitors.next(o), 180);
          if (o.kind === 'furniture' && o.type === 'gramophone') {
            const playing = app.music.isPlaying(o) ? o.state.track : null;
            TRACKS.forEach((tr, k) => B(36 + k * 192, cy + 200, 180, 84, tr.name, () => app.music.play(o, tr.id), { on: playing === tr.id }));
            B(36 + 4 * 192, cy + 200, 180, 84, '停止', () => { app.music.stop(o); app.markDirty(); });
          }
          add('削除', () => tools.deleteSelected(), 150);
          add('解除', () => tools.setSelected(null), 150);
          if (o.type !== 'gramophone') { x.fillStyle = '#85858b'; x.font = `400 24px ${font}`; x.fillText('トリガーを押したまま動かすと移動できます', 40, cy + 200); }
        } else {
          x.fillStyle = '#85858b'; x.textAlign = 'left'; x.font = `400 28px ${font}`;
          x.fillText('トリガーで選択・押したまま動かして移動', 40, cy + 40);
          x.fillText('扉や引き出し、明かりはトリガーで開閉・点灯', 40, cy + 90);
          x.fillText('ドアを選ぶと退出メニュー', 40, cy + 140);
        }
      }
      // 下段
      B(36, 520, 180, 96, '元に戻す (X)', () => app.undo(), { disabled: !app.history.canUndo });
      B(228, 520, 180, 96, 'やり直す (Y)', () => app.redo(), { disabled: !app.history.canRedo });
      B(420, 520, 180, 96, '保存', () => app.save(true));
      B(612, 520, 180, 96, '設定', () => { this.mode = 'settings'; });
      B(804, 520, 184, 96, 'VR を終了', () => this.exit(), { primary: true });
      x.fillStyle = '#9a9aa0'; x.textAlign = 'left'; x.font = `400 22px ${font}`;
      x.fillText('左スティック：移動　右スティック：向きを変える　B：パレットを呼ぶ', 40, 660);
      x.fillText('画像・撮影・バックアップは、VR を終えてから使えます', 40, 700);
    }

    for (const b of btns) {
      const hover = this.hoverBtn && this.hoverBtn.x === b.x && this.hoverBtn.y === b.y && this.hoverBtn.label === b.label;
      rr(x, b.x, b.y, b.w, b.h, 18);
      if (b.color) {
        x.fillStyle = b.color; x.fill();
        x.lineWidth = b.on ? 8 : 3; x.strokeStyle = b.on ? '#2b2b2e' : 'rgba(0,0,0,0.15)'; x.stroke();
      } else {
        x.fillStyle = b.on || b.primary ? '#2b2b2e' : hover ? '#ececef' : '#ffffff'; x.fill();
        x.lineWidth = 3; x.strokeStyle = hover ? '#4d8dff' : '#e2e2e6'; x.stroke();
        x.fillStyle = b.on || b.primary ? '#ffffff' : b.disabled ? '#c4c4c8' : '#2b2b2e';
        x.textAlign = 'center'; x.font = `500 ${b.big ? 64 : b.key ? 34 : b.small ? 24 : 30}px ${font}`;
        x.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
      if (hover && b.color) { x.lineWidth = 4; x.strokeStyle = '#4d8dff'; x.stroke(); }
    }
    // ホバー判定用に、描いたボタンを保存（同じ並び＝同じ物として比較）
    this.buttons = btns;
    if (this.hoverBtn) this.hoverBtn = btns.find(b => b.x === this.hoverBtn.x && b.y === this.hoverBtn.y && b.label === this.hoverBtn.label) || null;
    this.panel.material.map.needsUpdate = true;
  }

  // ---------- 文字入力の画面 ----------
  drawTextMode(x, B, font) {
    const st = this.app.tools.state;
    // 入力中の文字
    rr(x, 36, 80, 740, 150, 18); x.fillStyle = '#f4f4f6'; x.fill();
    const v = this.textValue;
    const lines = v.split('\n').slice(-2);
    x.textAlign = 'left'; x.fillStyle = v ? (st.color === '#ffffff' ? '#777' : st.color) : '#a0a0a6'; x.font = `500 40px ${font}`;
    if (!v) x.fillText('ここに文字が入ります', 60, 155);
    else lines.forEach((l, i) => { const t = l.length > 22 ? '…' + l.slice(-21) : l; x.fillText(t + (i === lines.length - 1 ? '｜' : ''), 60, 125 + i * 56 + (lines.length === 1 ? 28 : 0)); });
    x.fillStyle = '#85858b'; x.font = `400 20px ${font}`; x.textAlign = 'right';
    x.fillText(`大きさ ${st.textSize.toFixed(1)}cm`, 764, 216);
    B(792, 80, 196, 70, '大きく', () => { st.textSize = Math.min(80, st.textSize * 1.25); });
    B(792, 160, 196, 70, '小さく', () => { st.textSize = Math.max(1, st.textSize / 1.25); });
    // キーボード
    const kw = 95, kh = 56, gx = 36, gy = 246, gap = 0;
    if (this.kbd === 'kana') {
      for (let col = 0; col < 10; col++) for (let row = 0; row < 5; row++) {
        const ch = KANA[col][row];
        if (ch === '　') continue;
        B(gx + col * kw, gy + row * (kh + 4), kw - 6, kh, ch, () => this.typeKey(ch), { key: true });
      }
      KANA_EXTRA.forEach((ch, i) => B(gx + i * kw, gy + 5 * (kh + 4), kw - 6, kh, ch, () => this.typeKey(ch), { key: true }));
    } else {
      ABC.forEach((row, r) => Array.from(row).forEach((ch0, i) => {
        const ch = this.shift ? ch0.toUpperCase() : ch0;
        B(gx + i * kw, gy + r * (kh + 4), kw - 6, kh, ch, () => this.typeKey(ch), { key: true });
      }));
      ABC_EXTRA.forEach((ch, i) => B(gx + i * kw, gy + 4 * (kh + 4), kw - 6, kh, ch, () => this.typeKey(ch), { key: true }));
      B(gx, gy + 5 * (kh + 4), kw * 2 - 6, kh, this.shift ? '⇧ 大文字' : '⇧', () => { this.shift = !this.shift; }, { key: true, on: this.shift });
    }
    const by = 612 + gap, bh = 76;
    B(36, by, 120, bh, this.kbd === 'kana' ? 'ABC' : 'かな', () => { this.kbd = this.kbd === 'kana' ? 'abc' : 'kana'; this.shift = false; });
    B(164, by, 120, bh, '⌫', () => this.backspace());
    B(292, by, 140, bh, '空白', () => this.typeKey(' '));
    B(440, by, 120, bh, '改行', () => this.typeKey('\n'));
    B(568, by, 200, bh, 'Questキーボード', () => this.showSystemKeyboard(), { small: true });
    B(776, by, 100, bh, 'やめる', () => this.cancelText());
    B(884, by, 104, bh, '書く', () => this.submitText(), { primary: true });
  }

  // ---------- VR の設定 ----------
  drawSettings(x, B, font) {
    const set = (k, v) => { settings[k] = v; saveSettings(); this.applySettings(k); };
    x.fillStyle = '#2b2b2e'; x.textAlign = 'left'; x.font = `500 36px ${font}`; x.fillText('VR の設定', 36, 108);
    const rows = [
      ['視点の高さ', () => {
        const h = settings.vrHeight || 0;
        B(400, 0, 90, 58, '−', () => set('vrHeight', Math.max(HEIGHT_MIN, Math.round((h - 0.05) * 100) / 100)), { disabled: h <= HEIGHT_MIN + 1e-6 });
        B(620, 0, 90, 58, '＋', () => set('vrHeight', Math.min(HEIGHT_MAX, Math.round((h + 0.05) * 100) / 100)), { disabled: h >= HEIGHT_MAX - 1e-6 });
        B(730, 0, 150, 58, 'もとに戻す', () => set('vrHeight', 0));
        return `${h > 0 ? '+' : ''}${Math.round(h * 100)} cm`;
      }],
      ['移動の速さ', () => {
        const v = settings.moveSpeed;
        B(400, 0, 90, 58, '−', () => set('moveSpeed', Math.max(0.4, Math.round((v - 0.1) * 10) / 10)));
        B(620, 0, 90, 58, '＋', () => set('moveSpeed', Math.min(2, Math.round((v + 0.1) * 10) / 10)));
        return `× ${v.toFixed(1)}`;
      }],
      ['向きの変え方', () => {
        [['snap30', '30°ずつ'], ['snap45', '45°ずつ'], ['smooth', 'なめらか']].forEach(([k, n], i) => B(400 + i * 196, 0, 184, 58, n, () => set('vrTurn', k), { on: settings.vrTurn === k }));
      }],
      ['パレットを持つ手', () => {
        [['left', '左手'], ['right', '右手']].forEach(([k, n], i) => B(400 + i * 196, 0, 184, 58, n, () => set('vrPanelHand', k), { on: settings.vrPanelHand === k }));
      }],
      ['パレットの位置', () => {
        [['hand', '手につく'], ['view', '視線について'], ['world', 'その場に置く']].forEach(([k, n], i) => B(400 + i * 196, 0, 184, 58, n, () => set('vrPanelFollow', k), { on: settings.vrPanelFollow === k }));
      }],
      ['パレットの大きさ', () => {
        [[0.8, '小'], [1, '中'], [1.25, '大']].forEach(([k, n], i) => B(400 + i * 196, 0, 184, 58, n, () => set('vrPanelSize', k), { on: (settings.vrPanelSize || 1) === k }));
      }],
      ['環境音', () => {
        [[true, 'オン'], [false, 'オフ']].forEach(([k, n], i) => B(400 + i * 196, 0, 184, 58, n, () => set('ambient', k), { on: !!settings.ambient === k }));
      }],
    ];
    const y0 = 140, rh = 70;
    rows.forEach(([label, fn], i) => {
      const y = y0 + i * rh;
      const before = this._btnsRef.length;
      const val = fn();
      for (let k = before; k < this._btnsRef.length; k++) this._btnsRef[k].y += y;
      x.fillStyle = '#2b2b2e'; x.textAlign = 'left'; x.font = `400 28px ${font}`; x.fillText(label, 40, y + 30);
      if (val) { x.textAlign = 'center'; x.font = `500 28px ${font}`; x.fillText(val, 555, y + 30); }
    });
    B(36, 650, 952, 84, '戻る', () => { this.mode = 'main'; }, { primary: true });
  }

  applySettings(key) {
    if (key === 'vrHeight' && this.rig) this.rig.position.y = settings.vrHeight;
    if (key === 'vrPanelHand' || key === 'vrPanelFollow' || key === 'vrPanelSize') this.placePanel();
    if (key === 'ambient') applyVolumes();
    sfx.click();
  }

  selectCatalog() {
    const list = CATALOG.filter(c => c.mount === this.catMount && !c.hidden);
    const item = list[this.catIndex % list.length];
    const st = this.app.tools.state;
    st.furnitureType = item.id; st.furnitureTone = null;
    this.app.tools.tools.furniture.rotOffset = 0;
  }

  thumb(type) {
    if (!this.thumbImgs.has(type)) {
      const img = new Image();
      img.onload = () => { this.panelDirty = true; };
      img.src = this.app.ui.thumb(type);
      this.thumbImgs.set(type, img);
    }
    return this.thumbImgs.get(type);
  }
}

function rr(x, a, b, w, h, r) {
  x.beginPath();
  x.moveTo(a + r, b); x.lineTo(a + w - r, b); x.quadraticCurveTo(a + w, b, a + w, b + r);
  x.lineTo(a + w, b + h - r); x.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
  x.lineTo(a + r, b + h); x.quadraticCurveTo(a, b + h, a, b + h - r);
  x.lineTo(a, b + r); x.quadraticCurveTo(a, b, a + r, b);
  x.closePath();
}
