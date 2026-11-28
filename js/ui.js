// 画面・HUD・パネル・モーダル
import { settings, saveSettings, resetSettings, isTouchDevice } from './settings.js';
import { PEN_COLORS, SHAPES, FONTS, TOOL_ORDER, TOOL_INFO } from './tools.js';
import { CATALOG, TONES, TONE_KEYS, MOUNT_NAMES, currentMonth, tonesFor } from './furniture.js';
import { isNoteType } from './notes.js';
import { TRACKS } from './music.js';
import { PAGES as MONITOR_PAGES } from './monitors.js';
import { sfx } from './audio.js';
import { downloadBlob, thumbFileName } from './storage.js';

const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const ICONS = {
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v6"/><path d="M17 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4.3 14a1.6 1.6 0 0 1 2.6-1.9L8 13.5"/>'),
  pen: svg('<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z"/><path d="M13.5 6.5l4 4"/>'),
  eraser: svg('<path d="M8 20h12"/><path d="M4.6 15.6l9.9-9.9a2 2 0 0 1 2.8 0l2.1 2.1a2 2 0 0 1 0 2.8L12 18H7.4z"/><path d="M9.5 10.7l4.8 4.8"/>'),
  text: svg('<path d="M5 6V4.5h14V6"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="M20.5 15.5l-4.5-4.5-9 8.5"/>'),
  furniture: svg('<path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5"/><path d="M4 11h16v5H4z"/><path d="M6 16v4M18 16v4"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  undo: svg('<path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/>'),
  redo: svg('<path d="M15 7l4.5 4.5L15 16"/><path d="M19 11.5H9.5a5 5 0 0 0 0 10H12"/>'),
  zoom: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/><path d="M10.5 8v5M8 10.5h5"/>'),
  face: svg('<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="2.2"/>'),
  cursor: svg('<path d="M5 3.5l13 7-5.6 1.6L10 18z"/>'),
  crosshair: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><path d="M12 17.2v.1"/>'),
  move: svg('<path d="M12 3v18M3 12h18"/><path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  rotL: svg('<path d="M4 5v5h5"/><path d="M5 14a7.5 7.5 0 1 0 1.8-7.5L4 10"/>'),
  rotR: svg('<path d="M20 5v5h-5"/><path d="M19 14a7.5 7.5 0 1 1-1.8-7.5L20 10"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  fullscreenExit: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  camera: svg('<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  vr: svg('<path d="M3 8.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-4l-2-2.5h-3l-2 2.5h-4A1.5 1.5 0 0 1 3 15.5z"/><circle cx="8" cy="11.5" r="1.6"/><circle cx="16" cy="11.5" r="1.6"/>'),
  think: svg('<path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2v.5h5v-.5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M9.8 19.5h4.4M10.5 21.5h3"/>'),
  chevron: svg('<path d="M7 10l5 5 5-5"/>'),
};

// ダイアログを開いてから選べるようになるまでの時間
const ARM_MS = 450, ARM_AFTER_UP_MS = 250;
const downPointers = new Map(); // pointerId → 押した時刻
window.addEventListener('pointerdown', e => { downPointers.set(e.pointerId, performance.now()); }, true);
const forget = e => downPointers.delete(e.pointerId);
window.addEventListener('pointerup', forget, true);
window.addEventListener('pointercancel', forget, true);

const STICKY_COLORS = ['#fff1a6', '#ffd3dd', '#cfe5ff', '#d5f3cf', '#ffe1bd'];

export class UI {
  constructor(app) {
    this.app = app;
    this.modals = [];
    this.$ = id => document.getElementById(id);
    this.panelCollapsed = false;
    this.catalogMount = 'floor';
    this.thumbs = new Map();
    this.hudHidden = false;
    if (isTouchDevice) document.body.classList.add('touch');
    this.setupTitle();
    this.setupHud();
    this.applyDisplaySettings();
  }

  // ================= 共通 =================
  get modalOpen() { return this.modals.length > 0 || this.overlay; }

  openModal(build, { dismissable = true, onClose = null, className = '' } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal ' + className;
    back.appendChild(box);
    const entry = { back, box, onClose, dismissable };
    const close = (result) => {
      const i = this.modals.indexOf(entry);
      if (i < 0) return;
      this.modals.splice(i, 1);
      back.remove();
      onClose && onClose(result);
      if (!this.modals.length) this.app.onModalsClosed();
    };
    entry.close = close;
    // 開いた直後は操作を受け付けない（ドアなどをタップした指の「離す／クリック」で
    // 選択肢が押されてしまわないように）。指が離れてから少し待って有効にする。
    const opened = performance.now();
    // 開いた時点で押されていた指（1.5 秒以上前のものは取りこぼしとみなして無視）
    const held = new Set([...downPointers].filter(([, t]) => opened - t < 1500).map(([id]) => id));
    let releasedAt = 0;
    const onRelease = e => { if (held.delete(e.pointerId)) releasedAt = performance.now(); };
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('pointercancel', onRelease, true);
    const ready = () => {
      const now = performance.now();
      return now - opened >= ARM_MS && (held.size === 0 || now - opened > 2500) && now - releasedAt >= ARM_AFTER_UP_MS;
    };
    const guard = e => { if (!ready()) { e.stopPropagation(); e.preventDefault(); } };
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'touchstart', 'touchend']) back.addEventListener(t, guard, true);
    back.classList.add('arming');
    const arm = () => {
      if (!back.isConnected) return;
      if (ready()) {
        back.classList.remove('arming');
        window.removeEventListener('pointerup', onRelease, true);
        window.removeEventListener('pointercancel', onRelease, true);
      } else setTimeout(arm, 60);
    };
    setTimeout(arm, ARM_MS);
    if (dismissable) back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    build(box, close);
    this.$('modals').appendChild(back);
    this.modals.push(entry);
    this.app.onModalOpened();
    return { box, close };
  }

  closeTopModal() {
    const m = this.modals[this.modals.length - 1];
    if (m && m.dismissable) m.close();
  }

  closeAllModals() { [...this.modals].reverse().forEach(m => m.close()); }

  confirm(title, msg, okLabel = 'OK', danger = false) {
    return new Promise(resolve => {
      this.openModal((box, close) => {
        box.innerHTML = `<h3></h3><p></p><div class="row"><button class="btn" data-a="no">キャンセル</button><button class="btn primary ${danger ? 'danger-bg' : ''}" data-a="ok"></button></div>`;
        box.querySelector('h3').textContent = title;
        box.querySelector('p').textContent = msg;
        const ok = box.querySelector('[data-a=ok]'); ok.textContent = okLabel;
        if (danger) { ok.style.background = 'var(--danger)'; ok.style.borderColor = 'var(--danger)'; }
        box.querySelector('[data-a=no]').onclick = () => close(false);
        ok.onclick = () => close(true);
      }, { onClose: r => resolve(!!r) });
    });
  }

  prompt(title, msg, value = '', okLabel = 'OK') {
    return new Promise(resolve => {
      this.openModal((box, close) => {
        box.innerHTML = `<h3></h3><p></p><input type="text" maxlength="60"><div class="row"><button class="btn" data-a="no">キャンセル</button><button class="btn primary" data-a="ok"></button></div>`;
        box.querySelector('h3').textContent = title;
        const p = box.querySelector('p'); if (msg) p.textContent = msg; else p.remove();
        const inp = box.querySelector('input'); inp.value = value;
        box.querySelector('[data-a=ok]').textContent = okLabel;
        const submit = () => close(inp.value.trim() || value);
        box.querySelector('[data-a=no]').onclick = () => close(null);
        box.querySelector('[data-a=ok]').onclick = submit;
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
        setTimeout(() => { inp.focus(); inp.select(); }, 60);
      }, { onClose: r => resolve(r === undefined ? null : r) });
    });
  }

  toast(msg, ms = 2600) {
    if (this.app.xr && this.app.xr.active) this.app.xr.notify(msg);
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.textContent = msg;
    this.$('toast').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 420); }, ms);
  }

  busy(on, msg = '') {
    this.$('busy').classList.toggle('hidden', !on);
    this.$('busy').querySelector('p').textContent = msg;
  }

  pickFile(accept) {
    return new Promise(resolve => {
      const inp = this.$('file-input');
      inp.value = '';
      inp.accept = accept;
      let done = false;
      const finish = f => { if (done) return; done = true; window.removeEventListener('focus', onFocus); resolve(f); };
      const onFocus = () => setTimeout(() => { if (!inp.files || !inp.files.length) finish(null); }, 800);
      inp.onchange = () => finish(inp.files && inp.files[0] ? inp.files[0] : null);
      inp.oncancel = () => finish(null);
      window.addEventListener('focus', onFocus);
      this.app.input.exitLock();
      inp.click();
    });
  }

  fade(on) { this.$('fade').classList.toggle('on', on); }

  // ================= タイトル =================
  setupTitle() {
    const t = this.$('title');
    t.querySelectorAll('[data-action]').forEach(b => {
      b.addEventListener('pointerenter', () => sfx.hover());
      b.addEventListener('click', () => {
        sfx.click();
        const a = b.dataset.action;
        if (a === 'new') this.app.startNew();
        if (a === 'load') this.showScreen('load');
        if (a === 'settings') this.showScreen('settings');
        if (a === 'help') this.toggleHelp();
      });
    });
    this.$('load').querySelector('[data-action=back]').onclick = () => { sfx.click(); this.showScreen('title'); };
    this.$('load').querySelector('[data-action=import]').onclick = () => { sfx.click(); this.app.importBackup(); };
    this.$('settings').querySelector('[data-action=back]').onclick = () => {
      sfx.click();
      if (this.overlay) { this.overlay = false; this.showScreen(null); this.app.onModalsClosed(); }
      else this.showScreen('title');
    };
  }

  // ゲーム中に設定を開く
  openSettingsOverlay() {
    this.overlay = true;
    this.app.onModalOpened();
    this.showScreen('settings');
  }

  showScreen(name) {
    for (const id of ['title', 'load', 'settings']) this.$(id).classList.toggle('hidden', id !== name);
    if (name === 'load') this.renderPalaceList();
    if (name === 'settings') this.renderSettings(this.$('settings-form'));
  }

  async renderPalaceList() {
    const list = this.$('palace-list');
    list.innerHTML = '<div class="empty">読み込み中…</div>';
    let items = [];
    try { items = await this.app.listPalaces(); } catch (e) { console.warn(e); }
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="empty">保存された宮殿はまだありません。<br>新しい宮殿を作るか、バックアップファイルを読み込んでください。</div>';
      return;
    }
    for (const m of items) {
      const card = document.createElement('div');
      card.className = 'palace-card';
      card.innerHTML = `<div class="thumb"></div><div class="info"><div class="name"></div><div class="meta"></div></div>
        <div class="actions"><button class="btn primary" data-a="open">入る</button><button class="btn" data-a="backup">バックアップ</button><button class="btn" data-a="rename">名前</button><button class="btn" data-a="thumbimg">画像</button><button class="btn danger" data-a="del">削除</button></div>`;
      if (m.thumb) card.querySelector('.thumb').style.backgroundImage = `url("${m.thumb}")`;
      card.querySelector('.name').textContent = m.name;
      const c = m.counts || {};
      card.querySelector('.meta').textContent = `${formatDate(m.updated)} ・ 家具 ${c.furniture || 0} ・ 画像 ${c.images || 0}`;
      const on = (a, fn) => card.querySelector(`[data-a=${a}]`).onclick = () => { sfx.click(); fn(); };
      card.querySelector('.thumb').onclick = () => { sfx.click(); this.app.openPalace(m.id); };
      on('open', () => this.app.openPalace(m.id));
      on('backup', () => this.app.backupById(m.id));
      // 保存してあるサムネイルを画像として保存
      const tb = card.querySelector('[data-a=thumbimg]');
      tb.title = 'サムネイル画像を保存';
      if (!m.thumb) tb.disabled = true;
      on('thumbimg', async () => {
        const blob = await (await fetch(m.thumb)).blob();
        const r = await downloadBlob(blob, thumbFileName(m.updated).replace(/\.png$/, '.jpg'), 'image/jpeg');
        if (r !== 'cancelled') this.toast('サムネイル画像を保存しました');
      });
      on('rename', async () => {
        const n = await this.prompt('名前を変更', '', m.name);
        if (n) { await this.app.renamePalace(m.id, n); this.renderPalaceList(); }
      });
      on('del', async () => {
        if (await this.confirm('宮殿を削除', `「${m.name}」を削除します。元に戻せません。必要ならバックアップを作成してから削除してください。`, '削除', true)) {
          await this.app.deletePalace(m.id); sfx.remove(); this.renderPalaceList();
        }
      });
      list.appendChild(card);
    }
  }

  // ================= 設定 =================
  renderSettings(root) {
    root.innerHTML = '';
    const section = t => { const h = document.createElement('div'); h.className = 'set-section'; h.textContent = t; root.appendChild(h); };
    const row = (label, note, ctl) => {
      const r = document.createElement('div'); r.className = 'set-row';
      const l = document.createElement('label'); l.textContent = label;
      if (note) { const s = document.createElement('small'); s.textContent = note; l.appendChild(s); }
      const c = document.createElement('div'); c.className = 'ctl'; c.appendChild(ctl);
      r.append(l, c); root.appendChild(r);
    };
    const changed = () => { saveSettings(); this.app.applySettings(); };
    const range = (key, min, max, step, fmt = v => v.toFixed(1)) => {
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
      const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = settings[key];
      const o = document.createElement('output'); o.textContent = fmt(settings[key]);
      r.oninput = () => { settings[key] = parseFloat(r.value); o.textContent = fmt(settings[key]); changed(); };
      r.onchange = () => sfx.click();
      wrap.append(r, o); return wrap;
    };
    const toggle = key => {
      const l = document.createElement('label'); l.className = 'switch';
      l.innerHTML = '<input type="checkbox"><span></span>';
      const i = l.querySelector('input'); i.checked = !!settings[key];
      i.onchange = () => { settings[key] = i.checked; sfx.click(); changed(); };
      return l;
    };
    const seg = (key, opts) => {
      const s = document.createElement('div'); s.className = 'seg';
      for (const [v, name] of opts) {
        const b = document.createElement('button'); b.textContent = name;
        b.classList.toggle('on', settings[key] === v);
        b.onclick = () => { settings[key] = v; sfx.click(); s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); changed(); };
        s.appendChild(b);
      }
      return s;
    };
    const pct = v => Math.round(v * 100) + '%';

    section('視点');
    row('マウス感度', 'PC', range('mouseSensitivity', 0.2, 3, 0.1));
    row('タッチ感度', 'スマホ・タブレット', range('touchSensitivity', 0.2, 3, 0.1));
    row('上下反転', null, toggle('invertY'));
    row('視野角', null, range('fov', 50, 100, 1, v => Math.round(v) + '°'));
    row('描画中の視点感度', 'PCで照準を使って描くとき、細かく描けるよう視点を遅くします', range('drawSensitivity', 0.1, 1, 0.05, pct));
    section('移動');
    row('移動速度', null, range('moveSpeed', 0.4, 2, 0.1));
    row('移動スティック', 'スマホ・タブレット。「固定」は左下に常に薄く表示されます', seg('stickMode', [['float', '触った場所'], ['fixed', '固定']]));
    row('足音', null, toggle('footsteps'));
    section('描画');
    row('描画の解像度', '高いほど細かく描けますがメモリを使います（次に宮殿を開いたときに反映）', seg('quality', [['low', '低'], ['medium', '中'], ['high', '高'], ['ultra', '最高']]));
    row('手ぶれ補正（初期値）', 'ペンの線をなめらかにします', range('smoothing', 0, 0.9, 0.05, pct));
    section('表示');
    const fs = document.createElement('button'); fs.className = 'btn small';
    fs.textContent = isFullscreen() ? '全画面を終了' : '全画面にする';
    fs.onclick = async () => { sfx.click(); await toggleFullscreen(this); fs.textContent = isFullscreen() ? '全画面を終了' : '全画面にする'; };
    row('全画面表示', null, fs);
    row('照準を表示', null, toggle('showCrosshair'));
    row('操作ヒントを表示', null, toggle('showHints'));
    row('画質', '低いほど動作が軽くなります', seg('pixelRatio', [[1, '軽量'], [1.5, '標準'], [2, '高精細']]));
    section('音');
    row('効果音の音量', null, range('volume', 0, 1, 0.05, pct));
    row('環境音', '低音・風・雨などの音と、置いてある家具やドアから聞こえる音', toggle('ambient'));
    row('環境音の音量', null, range('ambientVolume', 0, 1, 0.05, pct));
    row('音楽の音量', 'グラモフォンの音楽', range('musicVolume', 0, 1, 0.05, pct));
    section('VR');
    row('VR の画質', 'VR ヘッドセットで入ったときの画質。次に VR に入ったときに反映されます', seg('vrQuality', [['low', '軽量'], ['standard', '標準'], ['high', '高精細'], ['ultra', '最高']]));
    section('保存');
    row('自動保存', '約1分ごとに自動で保存します', toggle('autosave'));
    const reset = document.createElement('button'); reset.className = 'btn small'; reset.textContent = '初期設定に戻す';
    reset.onclick = async () => {
      if (await this.confirm('設定をリセット', 'すべての設定を初期値に戻します。', '戻す')) { resetSettings(); this.app.applySettings(); this.renderSettings(root); }
    };
    row('リセット', null, reset);
  }

  applyDisplaySettings() {
    this.$('crosshair').classList.toggle('off', !settings.showCrosshair);
    this.$('hint').classList.toggle('hidden', !settings.showHints);
  }

  // ================= HUD =================
  setupHud() {
    const tb = this.$('toolbar');
    for (const name of TOOL_ORDER) {
      const b = document.createElement('button');
      b.className = 'tool-btn'; b.dataset.tool = name;
      b.innerHTML = `${ICONS[name]}<span>${TOOL_INFO[name].name}</span><kbd>${TOOL_INFO[name].key}</kbd>`;
      if (name === 'pen' || name === 'text') b.insertAdjacentHTML('beforeend', '<i class="swatch-dot"></i>');
      b.title = `${TOOL_INFO[name].name}（${TOOL_INFO[name].desc}） ${TOOL_INFO[name].key}`;
      b.onclick = () => { this.app.tools.select(name); };
      tb.appendChild(b);
    }
    // 思考モード（ツールではなく、画面を静かにするモード）
    const th = document.createElement('button');
    th.className = 'tool-btn think-btn'; th.id = 'btn-think';
    th.innerHTML = `${ICONS.think}<span>思考</span>`;
    th.title = '思考（ボタンを消して、歩き回りながら考える）';
    th.onclick = () => this.app.enterThink();
    tb.appendChild(th);
    const ib = (id, icon, fn) => { const b = this.$(id); b.innerHTML = ICONS[icon]; b.onclick = () => { sfx.click(); fn(); }; };
    ib('btn-menu', 'menu', () => this.app.openPauseMenu());
    ib('btn-undo', 'undo', () => this.app.undo());
    ib('btn-redo', 'redo', () => this.app.redo());
    ib('btn-face', 'face', () => this.app.faceSurface());
    ib('btn-zoom', 'zoom', () => this.app.toggleZoom());
    ib('btn-help', 'help', () => this.toggleHelp());
    ib('btn-fullscreen', 'fullscreen', () => toggleFullscreen(this));
    ib('btn-photo', 'camera', () => this.app.photo.toggle());
    ib('btn-vr', 'vr', () => this.app.xr.enter());
    const tfs = this.$('btn-title-fullscreen');
    tfs.innerHTML = ICONS.fullscreen;
    tfs.onclick = () => { sfx.click(); toggleFullscreen(this); };
    const onFs = () => {
      const on = isFullscreen();
      for (const b of [this.$('btn-fullscreen'), tfs]) {
        b.innerHTML = on ? ICONS.fullscreenExit : ICONS.fullscreen;
        b.title = on ? '全画面を終了' : '全画面にする';
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    ib('btn-mode', 'cursor', () => this.app.input.toggleMode());
    const dm = this.$('btn-drawmode');
    dm.onclick = () => { sfx.click(); this.setDrawMode(!this.app.input.drawMode); };
    // パネル上の操作が視点に伝わらないように
    for (const id of ['dock', 'topbar', 'side-buttons', 'btn-drawmode']) {
      this.$(id).addEventListener('pointerdown', e => e.stopPropagation());
    }
    if (isTouchDevice) this.$('door-hint').textContent = 'タップでドアを開く';
  }

  showHud(on) {
    this.$('hud').classList.toggle('hidden', !on);
    this.updateStick();
  }

  toggleHud() {
    this.hudHidden = !this.hudHidden;
    for (const id of ['topbar', 'side-buttons', 'dock', 'hint']) this.$(id).style.visibility = this.hudHidden ? 'hidden' : '';
  }

  setPalaceName(n) { this.$('palace-name').textContent = n; }
  setSaveStatus(t) { this.$('save-status').textContent = t; }

  updateUndo() {
    const h = this.app.history;
    this.$('btn-undo').disabled = !h.canUndo;
    this.$('btn-redo').disabled = !h.canRedo;
  }

  setLocked(locked) {
    this.$('lock-hint').classList.toggle('hidden', locked || isTouchDevice || this.app.input.mode !== 'lock' || !this.app.inGame || this.modalOpen);
  }

  refreshLockHint() { this.setLocked(this.app.input.locked); }

  setInputMode(mode) {
    this.$('crosshair').classList.toggle('cursor-mode', mode === 'cursor');
    this.$('btn-mode').classList.toggle('on', mode === 'cursor');
    this.$('btn-mode').innerHTML = mode === 'cursor' ? ICONS.cursor : ICONS.crosshair;
    this.$('btn-mode').title = mode === 'cursor' ? 'カーソルモード中（Fで照準モードへ）' : '照準モード中（Fでカーソルモードへ）';
    this.refreshLockHint();
    this.updateHint();
  }

  setDoorHint(on) {
    this.$('door-hint').classList.toggle('hidden', !on);
  }

  setDragging(on) { document.body.classList.toggle('dragging', on); }

  setXRAvailable(on) {
    this.$('btn-vr').classList.toggle('hidden', !on);
    document.body.classList.toggle('xr-ok', on);
  }

  setZoom(on) { this.$('btn-zoom').classList.toggle('on', on); }

  // ---- スティック ----
  showStick(x, y) {
    const s = this.$('stick');
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.classList.remove('hidden', 'idle');
    this.moveStick(0, 0);
  }
  moveStick(vx, vy) { this.$('stick-knob').style.transform = `translate(${vx * 36}px, ${vy * 36}px)`; }
  hideStick() {
    this.moveStick(0, 0);
    this.updateStick();
  }

  // 固定スティックの中心（画面座標）
  stickCenter() {
    const R = 56, m = 26;
    const w = window.innerWidth, h = window.innerHeight;
    const { l: sl, b: sb } = safeInsets();
    const x = R + m + sl;
    if (w > h) return { x, y: h - R - m - sb };
    const dock = this.$('dock').getBoundingClientRect();
    return { x, y: Math.min(h - R - m - sb, dock.top - R - 22) };
  }

  // 固定スティックは触っていないときも薄く表示する
  updateStick() {
    const input = this.app.input;
    if (!input || input.stick.active) return;
    const s = this.$('stick');
    const fixed = isTouchDevice && settings.stickMode === 'fixed' && this.app.inGame && !input.drawMode && !this.modalOpen;
    document.body.classList.toggle('fixed-stick', isTouchDevice && settings.stickMode === 'fixed');
    if (!fixed) { s.classList.add('hidden'); s.classList.remove('idle'); return; }
    const c = this.stickCenter();
    s.style.left = c.x + 'px'; s.style.top = c.y + 'px';
    s.classList.remove('hidden');
    s.classList.add('idle');
  }

  // ---- 描画モード（スマホ） ----
  setDrawMode(on) {
    this.app.input.drawMode = on;
    const b = this.$('btn-drawmode');
    b.classList.toggle('on', on);
    b.innerHTML = on ? `${ICONS.pen}<span>描画中</span>` : `${ICONS.move}<span>移動中</span>`;
    if (on) this.toast('描画モード：1本指で描く／2本指で視点', 1800);
    this.updateStick();
  }

  // ---- ツール ----
  onToolChange(name) {
    this.$('toolbar').querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
    const draw = name === 'pen' || name === 'eraser';
    if (isTouchDevice) {
      this.$('btn-drawmode').classList.toggle('hidden', !draw);
      this.setDrawMode(draw);
    }
    this.setDoorHint(false);
    this.updateToolPanel();
    this.updateHint();
    this.updateSwatchDots();
  }

  onSelectionChange() {
    if (this.app.tools && this.app.tools.current === 'hand') this.updateToolPanel();
  }

  showCatalog() { this.updateToolPanel(); }

  updateSwatchDots() {
    this.$('toolbar').querySelectorAll('.swatch-dot').forEach(d => { d.style.background = this.app.tools.state.color; });
  }

  updateToolPanel() {
    const p = this.$('tool-panel');
    const tools = this.app.tools;
    if (!tools) return;
    const st = tools.state;
    const name = tools.current;
    const sl = p.scrollLeft;
    p.innerHTML = '';
    p.classList.toggle('collapsed', this.panelCollapsed);

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const group = (...kids) => { const g = el('div', 'tp-group'); kids.forEach(k => k && g.appendChild(k)); p.appendChild(g); return g; };
    const sep = () => p.appendChild(el('div', 'tp-sep'));
    const label = t => el('span', 'tp-label', t);
    const chip = (text, on, fn, cls = '') => { const b = el('button', 'chip ' + cls + (on ? ' on' : ''), text); b.onclick = () => { sfx.click(); fn(); }; return b; };
    const slider = (min, max, value, fmt, onInput, log = false) => {
      const r = el('input', 'tp-range'); r.type = 'range';
      const toS = v => log ? (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min)) * 100 : (v - min) / (max - min) * 100;
      const fromS = s => log ? Math.exp(Math.log(min) + s / 100 * (Math.log(max) - Math.log(min))) : min + s / 100 * (max - min);
      r.min = 0; r.max = 100; r.step = 0.5; r.value = toS(value);
      const o = el('span', 'tp-val', fmt(value));
      r.oninput = () => { const v = fromS(parseFloat(r.value)); onInput(v); o.textContent = fmt(v); };
      return [r, o];
    };
    const colors = () => {
      const g = group();
      PEN_COLORS.forEach((c, i) => {
        const b = el('button', 'swatch' + (st.color === c.hex ? ' on' : ''));
        b.style.background = c.hex; b.title = `${c.name}（C）`;
        b.onclick = () => { st.color = c.hex; sfx.color(); this.updateToolPanel(); this.updateSwatchDots(); };
        g.appendChild(b);
      });
    };

    if (isTouchDevice) {
      const cb = el('button', 'chip collapse-btn');
      cb.innerHTML = this.panelCollapsed ? '▴ 設定' : '▾';
      cb.onclick = () => { this.panelCollapsed = !this.panelCollapsed; sfx.click(); this.updateToolPanel(); };
      p.appendChild(cb);
    }

    if (name === 'pen') {
      colors(); sep();
      group(label('形'), ...SHAPES.map(s => chip(s.name, st.shape === s.id, () => { st.shape = s.id; this.updateToolPanel(); })));
      sep();
      group(label('太さ'), ...slider(0.15, 15, st.penSize, v => v < 1 ? v.toFixed(2) + 'cm' : v.toFixed(1) + 'cm', v => { st.penSize = v; }, true));
      group(label('濃さ'), ...slider(0.1, 1, st.opacity, v => Math.round(v * 100) + '%', v => { st.opacity = v; }));
      group(label('補正'), ...slider(0, 0.9, st.smoothing, v => Math.round(v * 100) + '%', v => { st.smoothing = v; }));
    } else if (name === 'eraser') {
      group(label('太さ'), ...slider(0.5, 60, st.eraserSize, v => v.toFixed(1) + 'cm', v => { st.eraserSize = v; }, true));
      group(label(isTouchDevice ? '面の正面を向くと消しやすくなります' : 'Shift: 直線で消す ／ ホイール: 太さ'));
    } else if (name === 'text') {
      colors(); sep();
      group(label('大きさ'), ...slider(1, 80, st.textSize, v => v.toFixed(1) + 'cm', v => { st.textSize = v; }, true));
      group(label('書体'), ...FONTS.map(f => chip(f.name, st.font === f.id, () => { st.font = f.id; this.updateToolPanel(); })));
      group(label('画質'), chip('高画質', st.textHQ, () => { st.textHQ = true; this.updateToolPanel(); }), chip('面に直接', !st.textHQ, () => { st.textHQ = false; this.updateToolPanel(); }));
      group(label('濃さ'), ...slider(0.1, 1, st.opacity, v => Math.round(v * 100) + '%', v => { st.opacity = v; }));
    } else if (name === 'image') {
      const it = tools.tools.image;
      group(chip(it.pending && !it.pending.sticky ? '別の画像を選ぶ' : '画像ファイルを選ぶ', false, () => it.choose()));
      const sg = group(label('付箋'));
      for (const c of STICKY_COLORS) {
        const b = el('button', 'swatch' + (it.pending && it.pending.sticky && it.pending.src && it._stickyColor === c ? ' on' : ''));
        b.style.background = c; b.style.borderRadius = '4px'; b.title = '付箋';
        b.onclick = () => { it._stickyColor = c; it.sticky(c).then(() => this.updateToolPanel()); };
        sg.appendChild(b);
      }
      if (!it.pending || !it.pending.sticky) group(label('大きさ'), ...slider(0.15, 4, st.imageSize, v => v.toFixed(2) + 'm', v => { st.imageSize = v; }, true));
      if (it.pending) {
        if (isTouchDevice) group(chip('照準の位置に貼る', true, () => it.place()));
        group(label(isTouchDevice ? '貼りたい場所をタップ' : '貼りたい場所をクリック'));
      }
    } else if (name === 'furniture') {
      this.buildCatalog(p);
    } else if (name === 'hand') {
      const o = tools.selected;
      if (!o) {
        group(label(isTouchDevice ? 'タップで選択／選択中のものはドラッグで移動／ドアをタップで退出' : 'クリックで選択・ドラッグで移動／ドアをクリックで退出'));
      } else {
        const title = o.kind === 'image' ? (o.isText ? '文字' : o.isSticky ? '付箋' : '画像') : o.def.name;
        group(el('span', 'sel-title', title));
        sep();
        const ib = (icon, t, fn) => { const b = el('button', 'chip'); b.innerHTML = icon; b.title = t; b.style.padding = '4px 7px'; b.querySelector('svg').style.cssText = 'width:18px;height:18px;display:block'; b.onclick = () => { fn(); }; return b; };
        group(ib(ICONS.rotL, '左に回転 (Shift+R)', () => tools.rotateSelected(-1)), ib(ICONS.rotR, '右に回転 (R)', () => tools.rotateSelected(1)));
        group(chip('縮小', false, () => tools.scaleSelected(1 / 1.12)), chip('拡大', false, () => tools.scaleSelected(1.12)));
        if (o.kind === 'furniture') {
          sep();
          const g = group(label('色'));
          for (const k of tonesFor(o.def)) {
            const b = el('button', 'tone' + (o.tone === k ? ' on' : ''));
            b.style.background = '#' + TONES[k].color.toString(16).padStart(6, '0'); b.title = TONES[k].name;
            b.onclick = () => tools.setToneSelected(k);
            g.appendChild(b);
          }
        }
        sep();
        const world = this.app.world;
        // ノートと本棚
        if (this.app.notes.isNoteThing(o)) {
          const N = this.app.notes;
          if (isNoteType(o.type)) group(chip('読む', false, () => N.openReader({ furn: o })), chip('編集', false, () => N.openEditor({ furn: o })), chip('本棚にしまう', false, () => N.chooseShelf(o)));
          else group(chip('中のノート', false, () => N.openShelf(o)));
          sep();
        }
        if (this.app.monitors.isMonitor(o)) {
          sep();
          const cur = o.state.monitorPage || 'auto';
          group(label('画面'), ...MONITOR_PAGES.map(pg => chip(pg.name, cur === pg.id, () => { this.app.monitors.setPage(o, pg.id); this.updateToolPanel(); })));
        }
        if (o.kind === 'furniture' && o.type === 'gramophone') {
          sep();
          const playing = this.app.music.isPlaying(o) ? o.state.track : null;
          group(label('曲'), ...TRACKS.map(tr => chip(tr.name, playing === tr.id, () => { this.app.music.play(o, tr.id); this.updateToolPanel(); })),
            chip('停止', false, () => { this.app.music.stop(o); this.app.markDirty(); this.updateToolPanel(); }));
        }
        if (o.kind === 'furniture' && (world.isOpenable(o) || world.hasLight(o) || o.type === 'calendar')) {
          sep();
          if (world.isOpenable(o)) {
            const opened = world.anyOpen(o);
            group(chip(opened ? '閉める' : '開ける', false, () => {
              world.setAllOpen(o, !opened); (opened ? sfx.closeDrawer : sfx.openDrawer).call(sfx); this.app.markDirty(); this.updateToolPanel();
            }));
          }
          if (world.hasLight(o)) {
            const on = o.state.light !== false;
            const isMon = this.app.monitors.isMonitor(o);
            group(chip(isMon ? (on ? '電源を切る' : '電源を入れる') : (on ? '消灯' : '点灯'), false, () => {
              world.setLight(o, !on); (on ? sfx.lightOff : sfx.lightOn).call(sfx); this.app.markDirty(); this.updateToolPanel();
            }));
          }
          if (o.type === 'calendar') {
            const [y, m] = o.state.month.split('-').map(Number);
            const shift = d => { world.setProp(o, 'month', currentMonth(d, o.state.month)); sfx.click(); this.app.markDirty(); this.updateToolPanel(); };
            group(chip('‹ 前の月', false, () => shift(-1)), el('span', 'tp-val', `${y}/${m}`), chip('次の月 ›', false, () => shift(1)));
          }
        }
        const hasDraw = o.kind === 'image' || Object.keys(o.surfaces).length > 0;
        group(chip('複製', false, () => tools.duplicateSelected()), hasDraw ? chip('描いた線を消す', false, () => tools.clearSelectedDrawing()) : null, chip('削除', false, () => tools.deleteSelected(), 'danger'));
        group(chip('選択解除', false, () => tools.setSelected(null)));
      }
    }
    p.scrollLeft = sl;
  }

  buildCatalog(p) {
    const tools = this.app.tools, st = tools.state;
    const ft = tools.tools.furniture;
    const wrap = document.createElement('div'); wrap.id = 'catalog';
    const tabs = document.createElement('div'); tabs.className = 'cat-tabs';
    for (const m of ['floor', 'wall', 'ceiling', 'small']) {
      const b = document.createElement('button');
      b.className = 'chip' + (this.catalogMount === m ? ' on' : '');
      b.textContent = MOUNT_NAMES[m];
      b.onclick = () => { sfx.click(); this.catalogMount = m; this.updateToolPanel(); };
      tabs.appendChild(b);
    }
    const sepEl = document.createElement('div'); sepEl.className = 'tp-sep'; tabs.appendChild(sepEl);
    const toneLabel = document.createElement('span'); toneLabel.className = 'tp-label'; toneLabel.textContent = '色'; tabs.appendChild(toneLabel);
    const curDef = st.furnitureType ? CATALOG.find(c => c.id === st.furnitureType) : null;
    for (const k of tonesFor(curDef)) {
      const b = document.createElement('button');
      const cur = st.furnitureTone || (st.furnitureType ? CATALOG.find(c => c.id === st.furnitureType).tone : null);
      b.className = 'tone' + (cur === k ? ' on' : '');
      b.style.background = '#' + TONES[k].color.toString(16).padStart(6, '0'); b.title = TONES[k].name;
      b.onclick = () => { sfx.color(); st.furnitureTone = k; this.updateToolPanel(); };
      tabs.appendChild(b);
    }
    if (st.furnitureType) {
      const s2 = document.createElement('div'); s2.className = 'tp-sep'; tabs.appendChild(s2);
      const rl = document.createElement('button'); rl.className = 'chip'; rl.textContent = '回転'; rl.title = 'R / 右クリック / ホイール';
      rl.onclick = () => ft.rotate(1);
      tabs.appendChild(rl);
      if (isTouchDevice) {
        const pl = document.createElement('button'); pl.className = 'chip on'; pl.textContent = '照準の位置に置く';
        pl.onclick = () => { ft.hover({ x: 0, y: 0 }); ft.place(); };
        tabs.appendChild(pl);
      }
    }
    const grid = document.createElement('div'); grid.className = 'cat-grid';
    for (const c of CATALOG.filter(c => c.mount === this.catalogMount && !c.hidden)) {
      const b = document.createElement('button');
      b.className = 'cat-item' + (st.furnitureType === c.id ? ' on' : '');
      const img = document.createElement('img'); img.alt = '';
      img.src = this.thumb(c.id);
      const nm = document.createElement('span'); nm.textContent = c.name;
      const note = document.createElement('small'); note.textContent = c.note || '';
      b.append(img, nm, note);
      b.title = c.name + (c.note ? '（' + c.note + '）' : '');
      b.onclick = () => {
        sfx.click();
        if (st.furnitureType === c.id) { st.furnitureType = null; }
        else { st.furnitureType = c.id; st.furnitureTone = null; ft.rotOffset = 0; }
        st.furnitureState = null; st.fromShelf = null;
        this.updateToolPanel(); this.updateHint();
      };
      grid.appendChild(b);
    }
    wrap.append(tabs, grid);
    p.appendChild(wrap);
    const sl = this._catScroll || 0;
    requestAnimationFrame(() => { grid.scrollLeft = sl; });
    grid.addEventListener('scroll', () => { this._catScroll = grid.scrollLeft; });
  }

  thumb(type) {
    if (!this.thumbs.has(type)) this.thumbs.set(type, this.app.renderThumb(type));
    return this.thumbs.get(type);
  }

  cycleColor(dir) {
    const st = this.app.tools.state;
    const i = PEN_COLORS.findIndex(c => c.hex === st.color);
    st.color = PEN_COLORS[(i + dir + PEN_COLORS.length) % PEN_COLORS.length].hex;
    sfx.color();
    this.updateToolPanel(); this.updateSwatchDots();
    this.toast('色：' + PEN_COLORS.find(c => c.hex === st.color).name, 900);
  }

  adjustSize(dir) {
    const st = this.app.tools.state;
    if (this.app.tools.current === 'eraser') st.eraserSize = clamp(st.eraserSize * (dir > 0 ? 1.15 : 1 / 1.15), 0.5, 60);
    else st.penSize = clamp(st.penSize * (dir > 0 ? 1.15 : 1 / 1.15), 0.15, 15);
    this.updateToolPanel();
  }
  adjustTextSize(dir) { const st = this.app.tools.state; st.textSize = clamp(st.textSize * (dir > 0 ? 1.1 : 1 / 1.1), 1, 80); this.updateToolPanel(); }
  adjustImageSize(dir) { const st = this.app.tools.state; st.imageSize = clamp(st.imageSize * (dir > 0 ? 1.1 : 1 / 1.1), 0.15, 4); this.updateToolPanel(); }

  updateHint() {
    const h = this.$('hint');
    if (isTouchDevice || !this.app.tools) { h.innerHTML = ''; return; }
    const mode = this.app.input.mode;
    const lines = ['WASD 移動　Q/E・1〜6 ツール'];
    const n = this.app.tools.current;
    if (n === 'pen') lines.push('クリックで描く　Shift 直線　C 色　ホイール 太さ');
    if (n === 'eraser') lines.push('クリックで消す　ホイール 太さ');
    if (n === 'hand') lines.push('クリック 選択　ドラッグ 移動　R 回転　Del 削除');
    if (n === 'furniture') lines.push('クリックで置く　R・右クリック 回転');
    if (n === 'image') lines.push('クリックで貼る　ホイール 大きさ');
    if (n === 'text') lines.push('クリックした場所に文字を書く');
    lines.push(mode === 'lock' ? 'F カーソルモード（文字を書くのに便利）' : 'F 照準モード　右ドラッグ 視点');
    lines.push('G 正面を向く　Z ズーム　Ctrl+Z 元に戻す　H ヘルプ');
    h.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  }

  toggleHelp() {
    if (this.modals.find(m => m.box.classList.contains('help'))) { this.closeTopModal(); return; }
    const desk = [
      ['WASD / 矢印', '移動'], ['マウス', '視点'], ['クリック', 'ツールを使う'], ['Q / E', 'ツール切替'], ['1〜6', 'ツールを選ぶ'],
      ['F', '照準モード ⇄ カーソルモード'], ['右ドラッグ', '視点（カーソルモード）'], ['G', '見ている面の正面を向く'], ['Z', 'ズーム'],
      ['C / Shift+C', 'ペンの色'], ['ホイール / [ ]', '太さ・大きさ'], ['Shift+ドラッグ', '直線'], ['R / Shift+R', '回転'],
      ['T', '家具の色'], ['Delete / X', '削除'], ['Ctrl+D', '複製'], ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直す'], ['Ctrl+S', '保存'],
      ['思考ボタン', 'ボタンを消して歩き回る（ドアをクリックで戻る）'], ['P', '撮影モード（クリック／スペースで撮影・録画）'], ['V / C（撮影中）', '写真⇄動画 / カメラの切り替え'], ['VR のボタン', 'VR ヘッドセットで入る（対応端末のみ）'], ['クリック（手）', '扉・引き出し・ふたの開閉、明かりの点灯'],
      ['Tab', '表示を隠す'], ['H', '操作説明'], ['Esc', 'メニュー'],
    ];
    const touch = [
      ['画面の左側', 'タッチした場所にスティック → 移動'], ['画面の右側', 'スワイプで視点'], ['タップ', 'ツールを使う'],
      ['ペン・消しゴム', '描画モード：1本指で描く'], ['描画モード中', '2本指で視点'], ['「描画中／移動中」', 'モード切替'],
      ['手ツール', 'タップで選択、選択中のものをドラッグで移動。扉・引き出し・明かりはタップで開閉・点灯'], ['カメラのボタン', '撮影モード（写真・動画、定点・手ブレ・シアターカメラ）'], ['思考ボタン', 'ボタンを消して歩き回る（ドアをタップで戻る）'], ['VR のボタン', 'VR ヘッドセットで入る（対応端末のみ）'], ['右上のボタン', '正面を向く・ズーム・操作説明'], ['ドア', 'タップでバックアップ・退出'],
    ];
    const tools = [
      ['手', '家具・画像を選んで移動・回転・拡大縮小・色変更・複製・削除。ドアを開く'],
      ['ペン', '全8色。フリー・直線・矢印・四角・円。太さ・濃さ・手ぶれ補正'],
      ['消しゴム', '描いた線を消す'],
      ['文字', 'クリック／タップした場所に文字を書く（ゴシック・明朝・手書き風）'],
      ['画像', '画像ファイルを壁・床・家具に貼る。上からペンで描ける'],
      ['家具', '床・壁・天井・小物の家具を置く。テーブルや額縁などは描けて、写真を飾れて、小物を置ける'],
    ];
    const tabs = [['pc', 'PC'], ['touch', 'スマホ'], ['tools', 'ツール']];
    let cur = isTouchDevice ? 'touch' : 'pc';
    this.openModal((box, close) => {
      box.innerHTML = `<h3>操作説明</h3><div class="seg help-tabs"></div><div class="help-grid"></div>
        <p style="margin-top:16px">描いたものは自動で保存されます。ドアからはバックアップファイルを作成でき、タイトルの「宮殿を読み込む」から戻ってこられます。</p>
        <div class="row"><button class="btn primary" data-a="close">閉じる</button></div>`;
      const seg = box.querySelector('.help-tabs'), grid = box.querySelector('.help-grid');
      const render = () => {
        seg.innerHTML = '';
        for (const [id, name] of tabs) {
          const b = document.createElement('button'); b.textContent = name; b.classList.toggle('on', id === cur);
          b.onclick = () => { cur = id; sfx.click(); render(); };
          seg.appendChild(b);
        }
        const rows = cur === 'pc' ? desk : cur === 'touch' ? touch : tools;
        grid.innerHTML = rows.map(([k, v]) => `<div><kbd>${k}</kbd></div><div>${v}</div>`).join('');
      };
      render();
      box.querySelector('[data-a=close]').onclick = () => { sfx.click(); close(); };
    }, { className: 'help' });
  }

  // ---- 文字入力 ----
  openTextDialog(onSubmit) {
    const st = this.app.tools.state;
    this.openModal((box, close) => {
      box.innerHTML = `<h3>文字を書く</h3><textarea placeholder="ここに入力（改行できます）"></textarea>
        <div class="opts"></div>
        <div class="row"><button class="btn" data-a="no">キャンセル</button><button class="btn primary" data-a="ok">書く</button></div>`;
      const ta = box.querySelector('textarea');
      ta.value = this._lastText || '';
      const opts = box.querySelector('.opts');
      const renderOpts = () => {
        opts.innerHTML = '';
        PEN_COLORS.forEach(c => {
          const b = document.createElement('button'); b.className = 'swatch' + (st.color === c.hex ? ' on' : '');
          b.style.background = c.hex; b.onclick = () => { st.color = c.hex; sfx.color(); renderOpts(); this.updateToolPanel(); this.updateSwatchDots(); };
          opts.appendChild(b);
        });
        FONTS.forEach(f => {
          const b = document.createElement('button'); b.className = 'chip' + (st.font === f.id ? ' on' : ''); b.textContent = f.name;
          b.onclick = () => { st.font = f.id; sfx.click(); renderOpts(); this.updateToolPanel(); };
          opts.appendChild(b);
        });
        ta.style.fontFamily = (FONTS.find(f => f.id === st.font) || FONTS[0]).css;
        ta.style.color = st.color === '#ffffff' ? '#999' : st.color;
      };
      renderOpts();
      const submit = () => { const v = ta.value; this._lastText = ''; close(); onSubmit(v); };
      box.querySelector('[data-a=no]').onclick = () => { this._lastText = ta.value; close(); };
      box.querySelector('[data-a=ok]').onclick = submit;
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); });
      setTimeout(() => ta.focus(), 60);
    });
  }
}

// ---- 全画面 ----
export function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
export function canFullscreen() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
export async function toggleFullscreen(ui) {
  try {
    if (isFullscreen()) {
      await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    } else if (canFullscreen()) {
      const el = document.documentElement;
      await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen());
    } else {
      ui.toast('このブラウザでは全画面にできません。共有メニューの「ホーム画面に追加」から開くと、全画面で使えます', 5000);
    }
  } catch {
    ui.toast('全画面にできませんでした');
  }
}

// env(safe-area-inset-*) を実際のピクセルで取得
let insetProbe = null;
function safeInsets() {
  if (!insetProbe) {
    insetProbe = document.createElement('div');
    insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-left:env(safe-area-inset-left,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(insetProbe);
  }
  const cs = getComputedStyle(insetProbe);
  return { l: parseFloat(cs.paddingLeft) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function formatDate(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
