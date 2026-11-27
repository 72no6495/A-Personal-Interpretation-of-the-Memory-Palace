// A Personal Interpretation of the Memory Palace
import * as THREE from './lib/three.module.min.js';
import { loadSettings, settings, QUALITY_PPM, isTouchDevice } from './settings.js';
import { Palace, ROOM, disableRaycast } from './world.js';
import { Player } from './player.js';
import { History } from './history.js';
import { Tools } from './tools.js';
import { Input } from './input.js';
import { UI, toggleFullscreen } from './ui.js';
import { PhotoMode } from './photo.js';
import { XRMode } from './xr.js';
import { MusicManager, TRACKS } from './music.js';
import { TitleLogo } from './logo.js';
import { Monitors } from './monitors.js';
import { applyVolumes } from './audio.js';
import { sfx, unlockAudio } from './audio.js';
import { buildModel, CATALOG_BY_ID } from './furniture.js';
import * as store from './storage.js';

const AUTOSAVE_MS = 60000;

class App {
  constructor() {
    loadSettings();
    const canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.03, 60);
    this.player = new Player(this.camera);
    this.history = new History(80);
    this.raycaster = new THREE.Raycaster();
    this.world = null;
    this.inGame = false;
    this.exiting = false;
    this.saving = null;

    this.ui = new UI(this);
    this.tools = new Tools(this);
    this.input = new Input(this);
    this.photo = new PhotoMode(this);
    this.xr = new XRMode(this);
    this.music = new MusicManager(this);
    this.monitors = new Monitors(this);
    this.history.onChange = () => this.ui.updateUndo();

    this.logo = new TitleLogo(document.getElementById('title-logo'));
    this.titleWorld = new Palace(this.renderer, { ppm: 24, name: 'title' });
    this.time = 0;
    this.clock = new THREE.Clock();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.inGame && this.world && this.world.dirty) this.save(false); });
    window.addEventListener('beforeunload', () => { if (this.inGame && this.world && this.world.dirty) this.save(false); });
    document.addEventListener('pointerdown', () => unlockAudio(), { once: true });

    this.resize();
    this.ui.showScreen('title');
    this.loop();
    setInterval(() => { if (settings.autosave && this.inGame && this.world && this.world.dirty && !this.exiting) this.save(false); }, AUTOSAVE_MS);
  }

  get scene() { return this.world ? this.world.scene : this.titleWorld.scene; }

  resize() {
    if (this.renderer.xr.isPresenting) return; // VR 中はヘッドセット側が大きさを決める
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    applyVolumes();
    if (this.renderer.xr.isPresenting) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.resize();
    this.ui.applyDisplaySettings();
  }

  // ---------- ループ ----------
  loop() {
    // WebXR ではヘッドセットの描画タイミングに合わせる必要があるため setAnimationLoop を使う
    this.renderer.setAnimationLoop(() => this.frame());
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.inGame && this.world) {
      if (this.xr.active) this.xr.update(dt);
      else this.input.update(dt);
      this.player.update(dt, this.world.colliders());
      this.world.update(dt, this.time);
      this.tools.update();
      this.photo.updateCamera(dt, this.time);
      this.music.update();
      this.monitors.update(dt);
      if ((this.frameCount = (this.frameCount || 0) + 1) % 12 === 0) this.ui.updateStick();
      this.renderer.render(this.world.scene, this.camera);
      this.photo.afterRender();
    } else {
      // タイトル背景：白い部屋をゆっくり見回す
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 0.6, 1.6, 1.2 + Math.cos(t) * 0.4);
      this.camera.rotation.set(-0.06 + Math.sin(t * 1.7) * 0.05, Math.PI + Math.sin(t) * 0.5, 0, 'YXZ');
      if (this.camera.fov !== settings.fov) { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
      this.titleWorld.update(dt, this.time);
      this.logo.update(!document.getElementById('title').classList.contains('hidden'));
      this.renderer.render(this.titleWorld.scene, this.camera);
    }
  }

  // ---------- ピック ----------
  // ndc：画面上の位置 {x, y}、または VR コントローラーの光線 {ray: {origin, direction}}
  setRay(ndc) {
    if (ndc.ray) this.raycaster.set(ndc.ray.origin, ndc.ray.direction);
    else this.raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), this.camera);
  }
  pickAll(ndc, ignoreRoot = null) {
    if (!this.world) return [];
    this.setRay(ndc);
    return this.world.pick(this.raycaster, ignoreRoot);
  }
  pickAt(ndc) { return this.pickAll(ndc)[0] || null; }

  // ---------- 宮殿の出入り ----------
  async startNew() {
    const list = await this.listPalaces().catch(() => []);
    const name = await this.ui.prompt('新しい宮殿', 'この宮殿の名前を決めてください。', `宮殿 ${list.length + 1}`, '作る');
    if (!name) return;
    const world = new Palace(this.renderer, { name, ppm: QUALITY_PPM[settings.quality] || 160 });
    await this.enterGame(world, null, true);
    this.save(false);
  }

  async openPalace(id) {
    this.ui.busy(true, '宮殿を開いています…');
    try {
      const data = await store.loadPalace(id);
      if (!data) throw new Error('宮殿が見つかりません');
      const world = await Palace.deserialize(this.renderer, data, QUALITY_PPM[settings.quality] || 160);
      await this.enterGame(world, data.player, false);
    } catch (e) {
      console.error(e);
      this.ui.toast('開けませんでした：' + (e.message || e)); sfx.error();
    } finally { this.ui.busy(false); }
  }

  async enterGame(world, playerState, isNew) {
    this.world = world;
    this.history.clear();
    this.tools.reset();
    this.tools.attachScene(world.scene);
    this.player.set(playerState || { x: 0, z: 2.6, yaw: 0, pitch: 0 });
    this.player.vel.set(0, 0, 0);
    this.player.zoom = this.player.zoomTarget = 1;
    this.player.frozen = false;
    this.ui.setZoom(false);
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.ui.setPalaceName(world.name);
    this.ui.setSaveStatus(isNew ? '新しい宮殿' : '読み込みました');
    this.ui.onToolChange(this.tools.current);
    this.ui.updateUndo();
    this.inGame = true;
    this.exiting = false;
    this.input.enable(true);
    this.input.mode = 'lock';
    this.ui.setInputMode('lock');
    // 降り立つ演出
    this.player.eyeOffset = isNew ? 1.1 : 0.25;
    const fade = document.getElementById('fade');
    fade.style.transition = 'none'; fade.classList.add('on');
    void fade.offsetWidth;
    fade.style.transition = ''; fade.classList.remove('on');
    sfx.arrive();
    this.music.syncFromWorld();
    world.stats.visits++;
    this.lastSaved = isNew ? null : (this.lastSaved || null);
    this.ui.refreshLockHint();
    if (isNew) setTimeout(() => this.ui.toast(isTouchDevice ? '左側で移動、右側で見回し。下のボタンからツールを選べます' : 'クリックで開始。WASDで移動、マウスで見回し。H で操作説明', 4200), 900);
  }

  leaveGame() {
    this.music.stopAll();
    this.photo.exit();
    this.xr.exit();
    this.input.enable(false);
    this.tools.reset();
    this.inGame = false;
    if (this.world) { this.world.dispose(); this.world = null; }
    this.history.clear();
    this.ui.closeAllModals();
    this.ui.showHud(false);
    this.ui.showScreen('title');
  }

  // ---------- 保存 ----------
  captureThumb() {
    if (this.renderer.xr.isPresenting) return null; // VR 中は撮れない（前のサムネイルを使う）
    try {
      const hide = [this.tools.selHelper, this.tools.hovHelper, this.tools.tools.pen.cursor, this.tools.tools.eraser.cursor];
      const vis = hide.map(o => o.visible);
      hide.forEach(o => { o.visible = false; });
      this.renderer.render(this.world.scene, this.camera);
      hide.forEach((o, i) => { o.visible = vis[i]; });
      const src = this.renderer.domElement;
      const c = document.createElement('canvas'); c.width = 384; c.height = 216;
      const sw = src.width, sh = src.height;
      const ar = 384 / 216;
      let w = sw, h = sw / ar;
      if (h > sh) { h = sh; w = sh * ar; }
      c.getContext('2d').drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, 384, 216);
      return c.toDataURL('image/jpeg', 0.75);
    } catch { return null; }
  }

  async save(manual) {
    if (!this.world) return;
    if (this.saving) { await this.saving; if (!manual) return; }
    const world = this.world;
    this.saving = (async () => {
      try {
        this.ui.setSaveStatus('保存中…');
        const thumb = this.captureThumb();
        const data = world.serialize(this.player.state());
        await store.savePalace(data, thumb);
        world.dirty = false;
        this.lastSaved = Date.now();
        const d = new Date();
        this.ui.setSaveStatus(`保存済み ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        if (manual) { this.ui.toast('保存しました'); sfx.save(); }
      } catch (e) {
        console.error(e);
        this.ui.setSaveStatus('保存できませんでした');
        this.ui.toast('保存できませんでした：' + (e.message || e) + '（バックアップの作成をおすすめします）', 5000);
        sfx.error();
      } finally { this.saving = null; }
    })();
    return this.saving;
  }

  markDirty() {
    if (!this.world) return;
    this.world.dirty = true;
    this.ui.setSaveStatus('未保存の変更あり');
  }

  async createBackup() {
    if (!this.world) return;
    this.ui.busy(true, 'バックアップを作成中…');
    try {
      await this.save(false);
      const data = this.world.serialize(this.player.state());
      const r = await store.downloadBackup(data);
      if (r !== 'cancelled') { this.ui.toast('バックアップを作成しました'); sfx.save(); }
    } catch (e) {
      this.ui.toast('バックアップを作成できませんでした：' + (e.message || e)); sfx.error();
    } finally { this.ui.busy(false); }
  }

  // ---------- タイトル画面用 ----------
  listPalaces() { return store.listPalaces(); }
  async renamePalace(id, name) { await store.renamePalace(id, name); }
  async deletePalace(id) { await store.deletePalace(id); }
  async backupById(id) {
    try {
      const data = await store.loadPalace(id);
      if (!data) throw new Error('見つかりません');
      const r = await store.downloadBackup(data);
      if (r !== 'cancelled') { this.ui.toast('バックアップを作成しました'); sfx.save(); }
    } catch (e) { this.ui.toast('作成できませんでした：' + (e.message || e)); sfx.error(); }
  }

  async importBackup() {
    const file = await this.ui.pickFile(`${store.BACKUP_EXT},.json,application/json`);
    if (!file) return;
    let data;
    try { data = await store.readBackupFile(file); } catch (e) { this.ui.toast(e.message); sfx.error(); return; }
    const list = await this.listPalaces().catch(() => []);
    const exists = list.find(m => m.id === data.id);
    if (exists) {
      const choice = await new Promise(resolve => {
        this.ui.openModal((box, close) => {
          box.innerHTML = `<h3>同じ宮殿があります</h3><p></p><div class="stack">
            <button class="btn primary" data-a="over">上書きして読み込む</button>
            <button class="btn" data-a="copy">別の宮殿として読み込む</button>
            <button class="btn" data-a="no">キャンセル</button></div>`;
          box.querySelector('p').textContent = `「${exists.name}」はすでに保存されています。バックアップの内容で上書きしますか？`;
          box.querySelectorAll('[data-a]').forEach(b => { b.onclick = () => close(b.dataset.a); });
        }, { onClose: r => resolve(r || 'no') });
      });
      if (choice === 'no') return;
      if (choice === 'copy') { data.id = store.newId(); data.name = data.name + '（コピー）'; }
    }
    this.ui.busy(true, 'バックアップを読み込み中…');
    try {
      await store.savePalace(data, null);
      this.ui.busy(false);
      sfx.open();
      await this.openPalace(data.id);
      // サムネイルを更新
      setTimeout(() => this.save(false), 1500);
    } catch (e) {
      this.ui.busy(false);
      this.ui.toast('読み込めませんでした：' + (e.message || e)); sfx.error();
    }
  }

  // ---------- ゲーム内の操作 ----------
  undo() { this.tools.active.cancel(); if (this.history.undo()) { sfx.undo(); this.markDirty(); } }
  redo() { this.tools.active.cancel(); if (this.history.redo()) { sfx.redo(); this.markDirty(); } }

  faceSurface() {
    const ndc = (!isTouchDevice && this.input.mode === 'cursor' && this.input.mouse) ? this.input.mouse : { x: 0, y: 0 };
    const t = this.pickAt(ndc);
    if (!t || !t.hit.face) return;
    const n = t.hit.face.normal.clone().transformDirection(t.hit.object.matrixWorld);
    this.player.faceDirection(n.negate());
    sfx.click();
  }

  toggleZoom() {
    const on = this.player.zoomTarget === 1;
    this.player.zoomTarget = on ? 2.4 : 1;
    this.ui.setZoom(on);
    sfx.click();
  }

  onModalOpened() {
    this.input.releasePrimary();
    this.input.exitLock();
    this.input.keys.clear();
    this.ui.refreshLockHint();
  }

  onModalsClosed() {
    if (this.inGame && !this.exiting && !isTouchDevice && this.input.mode === 'lock' && !this.ui.overlay) this.input.requestLock();
    this.ui.refreshLockHint();
  }

  // グラモフォンを置いたとき：曲を選ぶ
  chooseTrack(furn) {
    if (this.xr.active) { this.xr.openTrackPanel(furn); return; }
    this.ui.openModal((box, close) => {
      box.innerHTML = `<h3>グラモフォン</h3><p>流す曲を選んでください。あとから手ツールでグラモフォンを選んでも変えられます。</p><div class="stack"></div>`;
      const st = box.querySelector('.stack');
      for (const tr of TRACKS) {
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = tr.name;
        b.onclick = () => { close(); this.music.play(furn, tr.id); this.ui.onSelectionChange(furn); };
        st.appendChild(b);
      }
      const later = document.createElement('button'); later.className = 'btn'; later.textContent = '今は流さない';
      later.style.color = 'var(--sub)';
      later.onclick = () => { sfx.click(); close(); };
      st.appendChild(later);
    }, { className: 'center' });
  }

  openDoorMenu() {
    if (this.xr.active) { this.xr.openDoorPanel(); return; }
    if (this.ui.modalOpen || this.exiting) return;
    sfx.open();
    this.ui.openModal((box, close) => {
      box.innerHTML = `<div class="door-art"></div><h3>ドア</h3>
        <p>この宮殿のバックアップファイルを作成できます。ドアから出たあとも、タイトルの「宮殿を読み込む」からバックアップを読み込めば、またここへ戻ってこられます。</p>
        <div class="stack">
          <button class="btn primary" data-a="backup">バックアップを作成</button>
          <button class="btn" data-a="exit">ドアから出る（保存して退出）</button>
          <button class="btn" data-a="stay">部屋に戻る</button>
        </div>`;
      box.querySelector('[data-a=backup]').onclick = () => { close(); this.createBackup(); };
      box.querySelector('[data-a=exit]').onclick = () => { this.exiting = true; close(); this.exitThroughDoor(); };
      box.querySelector('[data-a=stay]').onclick = () => { sfx.click(); close(); };
    }, { className: 'center' });
  }

  async exitThroughDoor() {
    this.exiting = true;
    this.photo.exit();
    this.input.enable(false);
    this.tools.active.cancel();
    this.tools.setSelected(null);
    this.player.frozen = true;
    // ドアの方を向く
    const doorPos = new THREE.Vector3();
    this.world.door.getWorldPosition(doorPos);
    doorPos.y = 1.5;
    this.player.faceDirection(doorPos.sub(this.camera.position).normalize());
    this.world.doorTarget = 1;
    sfx.door();
    await wait(700);
    this.ui.fade(true);
    await this.save(false);
    await wait(1100);
    this.leaveGame();
    await wait(80);
    this.ui.fade(false);
  }

  openPauseMenu() {
    if (this.ui.modalOpen || this.exiting || !this.inGame) return;
    this.ui.openModal((box, close) => {
      box.innerHTML = `<h3></h3><p class="pm-sub"></p><div class="stack">
        <button class="btn primary" data-a="resume">再開</button>
        <button class="btn" data-a="save">保存する</button>
        <button class="btn" data-a="backup">バックアップを作成</button>
        <button class="btn" data-a="rename">名前を変更</button>
        <button class="btn" data-a="vr">VR で入る</button>
        <button class="btn" data-a="photo">撮影モード</button>
        <button class="btn" data-a="fullscreen">全画面表示の切り替え</button>
        <button class="btn" data-a="settings">設定</button>
        <button class="btn" data-a="help">操作説明</button>
        <button class="btn" data-a="exit">保存してタイトルへ</button>
      </div>`;
      box.querySelector('h3').textContent = this.world.name;
      box.querySelector('.pm-sub').textContent = `家具 ${this.world.furniture.size} ・ 画像 ${this.world.images.size}`;
      const on = (a, fn) => { box.querySelector(`[data-a=${a}]`).onclick = () => { sfx.click(); fn(); }; };
      on('resume', () => close());
      on('save', () => { close(); this.save(true); });
      on('backup', () => { close(); this.createBackup(); });
      on('rename', async () => {
        const n = await this.ui.prompt('名前を変更', '', this.world.name);
        if (n && this.world) { this.world.name = n; this.ui.setPalaceName(n); box.querySelector('h3').textContent = n; this.markDirty(); }
      });
      on('fullscreen', () => { close(); toggleFullscreen(this.ui); });
      on('photo', () => { close(); this.photo.enter(); });
      on('vr', () => { close(); this.xr.enter(); });
      if (!this.xr.supported) box.querySelector('[data-a=vr]').remove();
      on('settings', () => { close(); this.ui.openSettingsOverlay(); });
      on('help', () => { close(); this.ui.toggleHelp(); });
      on('exit', () => { this.exiting = true; close(); this.exitThroughDoor(); });
    }, { className: 'center' });
  }

  // ---------- 家具のサムネイル ----------
  renderThumb(type) {
    const def = CATALOG_BY_ID[type];
    if (!this._thumb) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xdedede, 2.4));
      const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(2, 3, 4); scene.add(d);
      const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
      const out = document.createElement('canvas'); out.width = out.height = 140;
      this._thumb = { scene, cam, out };
    }
    const { scene, cam, out } = this._thumb;
    const built = buildModel(type, def.tone);
    const g = built.group;
    scene.add(g);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.01;
    const dir = def.mount === 'wall' ? new THREE.Vector3(0.45, 0.15, 1) : def.mount === 'ceiling' ? new THREE.Vector3(0.9, -0.35, 1.3) : new THREE.Vector3(1, 0.75, 1.5);
    dir.normalize();
    const dist = r / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
    cam.near = dist / 20; cam.far = dist * 4; cam.updateProjectionMatrix();

    const R = this.renderer;
    const pr = R.getPixelRatio();
    const S = Math.round(140 / pr);
    R.setScissorTest(true);
    R.setViewport(0, 0, S, S);
    R.setScissor(0, 0, S, S);
    R.render(scene, cam);
    const ctx = out.getContext('2d');
    ctx.clearRect(0, 0, 140, 140);
    const px = Math.round(S * pr);
    ctx.drawImage(R.domElement, 0, R.domElement.height - px, px, px, 0, 0, 140, 140);
    R.setScissorTest(false);
    const size2 = R.getSize(new THREE.Vector2());
    R.setViewport(0, 0, size2.x, size2.y);
    scene.remove(g);
    g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    return out.toDataURL('image/png');
  }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

window.app = new App();
