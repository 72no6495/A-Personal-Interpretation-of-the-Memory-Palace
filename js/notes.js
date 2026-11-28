// ノート：長い文章を書いておける小物と、ノートを縦に並べてしまえる本棚
//   ノートの中身（見出し・本文・開いているページ）は家具の状態として保存する
//   本文は自動でページに分ける（「---」だけの行で改ページ）
import * as THREE from './lib/three.module.min.js';
import { sfx } from './audio.js';
import { isTouchDevice } from './settings.js';

// ---------- 種類と本棚 ----------
// W：横幅、H：縦の長さ、T：厚み（m）
export const NOTE_KINDS = {
  notebook: { name: 'ノート', W: 0.17, H: 0.24, T: 0.012, paper: 'ruled' },
  diary: { name: '日記帳', W: 0.15, H: 0.21, T: 0.03, paper: 'plain', ribbon: true },
  techo: { name: '手帳', W: 0.1, H: 0.15, T: 0.02, paper: 'dots', band: true },
};
export const NOTE_TONE_KEYS = ['navy', 'wine', 'forest', 'mustard', 'sky', 'pink', 'ink', 'cream'];
export const NOTE_TONES = {
  navy: { name: '紺', color: 0x34495e },
  wine: { name: 'えんじ', color: 0x8e3b46 },
  forest: { name: '深緑', color: 0x3f6b4f },
  mustard: { name: 'からし', color: 0xc9a13b },
  sky: { name: '水色', color: 0x86aecf },
  pink: { name: '桜', color: 0xe3a6b4 },
  ink: { name: '黒', color: 0x2f2f31 },
  cream: { name: 'クリーム', color: 0xeee6d2 },
};
// 本棚ごとの、しまえるノートの数
export const CASE_CAPACITY = { notecase: 30, notecaseW: 12, notecaseS: 6 };

export const isNoteType = type => !!NOTE_KINDS[type];
export const isNoteCase = type => !!CASE_CAPACITY[type];

const hex = c => '#' + c.toString(16).padStart(6, '0');
const light = c => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150; };

// ---------- 文字のページ割り ----------
const PAGE_W = 600, PAGE_H = 848;
const MARGIN_X = 56, TOP = 74, LINE_H = 42, LINES = 16;
const PAGE_FONT = '600 24px "Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif';
const TITLE_FONT = '"Shippori Mincho", "Hiragino Mincho ProN", "Yu Mincho", serif';

let measureCtx = null;
function measure() {
  if (!measureCtx) { measureCtx = document.createElement('canvas').getContext('2d'); }
  measureCtx.font = PAGE_FONT;
  return measureCtx;
}

const pageCache = new Map();
// 本文 → ページ（行の配列）の配列
export function paginate(text) {
  const key = text || '';
  if (pageCache.has(key)) return pageCache.get(key);
  const x = measure(), maxW = PAGE_W - MARGIN_X * 2;
  const pages = [[]];
  const push = line => { if (pages[pages.length - 1].length >= LINES) pages.push([]); pages[pages.length - 1].push(line); };
  for (const para of key.split('\n')) {
    if (para.trim() === '---') { if (pages[pages.length - 1].length) pages.push([]); continue; }
    if (!para) { push(''); continue; }
    let line = '';
    for (const ch of Array.from(para)) {
      // 句読点などは行頭に来ないよう、はみ出しても前の行に付ける
      if (x.measureText(line + ch).width > maxW && line && !'、。，．）」』！？ー…'.includes(ch)) { push(line); line = ''; }
      line += ch;
    }
    push(line);
  }
  if (pageCache.size > 200) pageCache.clear();
  pageCache.set(key, pages);
  return pages;
}
export const pageCount = text => paginate(text).length;

// 1ページを描く（ctx の大きさは PAGE_W × PAGE_H を基準に拡大縮小）
export function drawPage(ctx, text, index, kind = 'notebook') {
  const pages = paginate(text), lines = pages[index] || [], blank = index >= pages.length;
  const k = NOTE_KINDS[kind] || NOTE_KINDS.notebook;
  ctx.save();
  ctx.fillStyle = '#fdfcf7'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  // 罫線・方眼など
  if (k.paper === 'ruled') {
    ctx.strokeStyle = 'rgba(120,150,190,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i <= LINES; i++) { const y = TOP + 10 + i * LINE_H; ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(PAGE_W - 32, y); ctx.stroke(); }
  } else if (k.paper === 'dots') {
    ctx.fillStyle = 'rgba(120,120,130,0.35)';
    for (let y = TOP + 10; y < PAGE_H - 60; y += LINE_H / 2) for (let x0 = 40; x0 < PAGE_W - 30; x0 += LINE_H / 2) { ctx.beginPath(); ctx.arc(x0, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = '#2d2b28'; ctx.font = PAGE_FONT; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, MARGIN_X, TOP + i * LINE_H));
  ctx.fillStyle = '#a5a19a'; ctx.font = '500 18px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center';
  if (!blank) ctx.fillText(`${index + 1} / ${pages.length}`, PAGE_W / 2, PAGE_H - 32);
  ctx.restore();
}

// ---------- 3D 用のテクスチャ ----------
const texCache = new Map();
function cachedTexture(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (texCache.size > 300) { for (const t of texCache.values()) t.dispose(); texCache.clear(); }
  texCache.set(key, tex);
  return tex;
}

export function pageTexture(text, index, kind) {
  return cachedTexture(`p|${kind}|${index}|${fontsReady}|${text}`, 384, 543, (x) => { x.scale(384 / PAGE_W, 543 / PAGE_H); drawPage(x, text, index, kind); });
}

// 表紙：色の上に見出しのラベル
export function coverTexture(title, color, kind) {
  return cachedTexture(`c|${kind}|${color}|${fontsReady}|${title}`, 512, 724, (x, c) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, c.width, c.height);
    // 布のような細かい模様
    x.globalAlpha = 0.06; x.fillStyle = light(color) ? '#000' : '#fff';
    for (let i = 0; i < 900; i++) x.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
    x.globalAlpha = 1;
    const lw = c.width * 0.8, lh = 260, lx = (c.width - lw) / 2, ly = kind === 'diary' ? 120 : 96;
    x.fillStyle = light(color) ? 'rgba(255,255,255,0.75)' : '#f8f5ee';
    roundRect(x, lx, ly, lw, lh, 12); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#2d2b28'; x.textAlign = 'center'; x.textBaseline = 'middle';
    fitText(x, title || '', c.width / 2, ly + lh / 2, lw - 36, lh - 40, 500, TITLE_FONT);
    if (kind === 'diary') { x.strokeStyle = light(color) ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)'; x.lineWidth = 3; x.strokeRect(26, 26, c.width - 52, c.height - 52); }
  });
}

// 背表紙：縦書きの見出し
export function spineTexture(title, color) {
  return cachedTexture(`s|${color}|${fontsReady}|${title}`, 64, 512, (x, c) => {
    x.fillStyle = hex(color); x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = light(color) ? 'rgba(255,255,255,0.7)' : '#f3efe6';
    x.fillRect(6, 40, c.width - 12, c.height - 120);
    x.fillStyle = '#2d2b28'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const chars = Array.from(title || '').slice(0, 12);
    const fs = Math.min(40, (c.height - 150) / Math.max(1, chars.length));
    x.font = `500 ${fs}px ${TITLE_FONT}`;
    chars.forEach((ch, i) => x.fillText(ch, c.width / 2, 40 + 15 + fs / 2 + i * fs));
  });
}

// 枠に収まるいちばん大きな文字で書く（1行で小さくなりすぎるときは2〜3行に分ける）
function fitText(x, t, cx, cy, maxW, maxH, weight, family) {
  const chars = Array.from(t);
  let best = null;
  for (let lines = 1; lines <= 3; lines++) {
    const per = Math.ceil(chars.length / lines);
    const rows = [];
    for (let i = 0; i < chars.length; i += per) rows.push(chars.slice(i, i + per).join(''));
    x.font = `${weight} 100px ${family}`;
    const wMax = Math.max(1, ...rows.map(r => x.measureText(r).width));
    const fs = Math.min(84, 100 * maxW / wMax, maxH / (rows.length * 1.25));
    if (!best || fs > best.fs * 1.15) best = { fs, rows };
  }
  x.font = `${weight} ${Math.floor(best.fs)}px ${family}`;
  best.rows.forEach((r, i) => x.fillText(r, cx, cy + (i - (best.rows.length - 1) / 2) * best.fs * 1.25));
}

function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}

// ---------- 文字の読み込み ----------
// Web フォントが読み込まれる前に描いた文字は、読み込み後に描き直す
let fontsReady = 0;
const fontListeners = new Set();
export function onFontsReady(fn) { fontListeners.add(fn); }
if (document.fonts) {
  Promise.all([
    document.fonts.load(PAGE_FONT, 'あ'),
    document.fonts.load(`500 40px ${TITLE_FONT}`, 'あ'),
  ]).catch(() => {}).then(() => { fontsReady = 1; pageCache.clear(); measureCtx = null; fontListeners.forEach(f => f()); });
}

// ---------- 画面（読む・編集・本棚） ----------
export class NotesUI {
  constructor(app) {
    this.app = app;
    onFontsReady(() => this.refreshAll());
  }

  get world() { return this.app.world; }

  refreshAll() {
    const w = this.world;
    if (!w) return;
    for (const f of w.furniture.values()) if (isNoteType(f.type) || isNoteCase(f.type)) w.rebuild(f);
  }

  isNoteThing(obj) { return !!obj && obj.kind === 'furniture' && ((isNoteType(obj.type) && !obj.state.legacy) || isNoteCase(obj.type)); }

  // 手ツールでタップしたとき。ノートや本棚なら開いて true を返す
  handleTap(obj, part) {
    if (!obj || obj.kind !== 'furniture') return false;
    if (isNoteType(obj.type) && !obj.state.legacy) { this.openReader({ furn: obj }); return true; }
    if (isNoteCase(obj.type)) {
      const i = part && part.startsWith('note:') ? parseInt(part.slice(5), 10) : -1;
      if (i >= 0 && obj.state.notes && obj.state.notes[i]) this.openReader({ shelf: obj, noteId: obj.state.notes[i].id });
      else this.openShelf(obj);
      return true;
    }
    return false;
  }

  // ---------- 状態の書き換え（元に戻せる） ----------
  setState(furn, patch, label) {
    const w = this.world, before = JSON.parse(JSON.stringify(furn.state));
    const after = { ...JSON.parse(JSON.stringify(furn.state)), ...patch };
    w.setState(furn, after);
    this.app.history.push({ undo: () => w.setState(furn, before), redo: () => w.setState(furn, after) });
    this.app.markDirty();
    if (label) this.app.ui.toast(label, 1500);
  }

  // 本棚にしまってあるノートの書き換え
  setStored(shelf, noteId, patch) {
    const notes = (shelf.state.notes || []).map(n => n.id === noteId ? { ...n, state: { ...n.state, ...patch } } : n);
    this.setState(shelf, { notes });
  }

  // 読む対象 { furn } または { shelf, noteId } → { type, tone, state }
  resolve(ref) {
    if (ref.furn) return this.world.furniture.has(ref.furn.id) ? { type: ref.furn.type, tone: ref.furn.tone, state: ref.furn.state } : null;
    const n = (ref.shelf.state.notes || []).find(n => n.id === ref.noteId);
    return n || null;
  }

  // 置いたとき：見出しを決める
  askTitle(furn) {
    if (this.app.xr.active) {
      this.app.xr.openText(t => this.setState(furn, { title: t.trim() }), { title: 'ノートの見出し（表紙の題名）', oneLine: true, max: 30, okLabel: '決定' });
      return;
    }
    this.app.ui.prompt('ノートの見出し', '表紙に書く題名を決めてください。あとから編集で変えられます。', '', '決定').then(t => {
      if (t && t.trim() && this.world.furniture.has(furn.id)) this.setState(furn, { title: t.trim().slice(0, 30) });
    });
  }

  shelves() { return this.world ? [...this.world.furniture.values()].filter(f => isNoteCase(f.type)) : []; }
  shelfName(s) { const n = (s.state.notes || []).length; return `${s.def.name}（${n} / ${CASE_CAPACITY[s.type]}冊）`; }

  // ノートを本棚にしまう
  store(furn, shelf) {
    const w = this.world, notes = shelf.state.notes || [];
    if (notes.length >= CASE_CAPACITY[shelf.type]) { sfx.error(); this.app.ui.toast('この本棚はいっぱいです'); return false; }
    const item = { id: furn.id, type: furn.type, tone: furn.tone, state: JSON.parse(JSON.stringify({ ...furn.state, page: -1 })) };
    const before = JSON.parse(JSON.stringify(shelf.state)), after = { ...before, notes: [...notes, item] };
    this.app.tools.deselectIf(furn);
    let bundle = w.removeObject(furn);
    w.setState(shelf, after);
    this.app.history.push({
      undo: () => { w.setState(shelf, before); if (bundle) w.restoreObject(bundle); },
      redo: () => { bundle = w.removeObject(furn); this.app.tools.deselectIf(furn); w.setState(shelf, after); },
    });
    this.app.markDirty();
    sfx.closeDrawer();
    this.app.ui.toast(`「${item.state.title || 'ノート'}」を本棚にしまいました`);
    return true;
  }

  // しまう本棚を選ぶ
  chooseShelf(furn, done) {
    const list = this.shelves().filter(s => (s.state.notes || []).length < CASE_CAPACITY[s.type]);
    if (!this.shelves().length) { sfx.error(); this.app.ui.toast('ノートをしまう本棚がありません。家具から「ノート棚」を置いてください'); return; }
    if (!list.length) { sfx.error(); this.app.ui.toast('どの本棚もいっぱいです'); return; }
    if (list.length === 1) { if (this.store(furn, list[0])) done && done(); return; }
    // 近い順
    const p = new THREE.Vector3(); this.app.camera.getWorldPosition(p);
    const wp = new THREE.Vector3();
    const dist = s => { s.root.getWorldPosition(wp); return Math.hypot(wp.x - p.x, wp.z - p.z); };
    list.sort((a, b) => dist(a) - dist(b));
    if (this.app.xr.active) { this.app.xr.openShelfPick(furn, list); return; }
    this.app.ui.openModal((box, close) => {
      box.innerHTML = '<h3>どの本棚にしまいますか</h3><p>近い順に並んでいます。</p><div class="stack"></div>';
      const st = box.querySelector('.stack');
      list.forEach((s, i) => {
        const b = document.createElement('button'); b.className = 'btn' + (i === 0 ? ' primary' : '');
        b.textContent = this.shelfName(s) + (i === 0 ? '・いちばん近い' : '');
        b.onclick = () => { close(); if (this.store(furn, s)) done && done(); };
        st.appendChild(b);
      });
      const c = document.createElement('button'); c.className = 'btn'; c.textContent = 'やめる'; c.onclick = () => close(); st.appendChild(c);
    }, { className: 'center' });
  }

  // 本棚から取り出す：家具ツールで置く場所を選ぶ
  takeOut(shelf, noteId) {
    const n = (shelf.state.notes || []).find(n => n.id === noteId);
    if (!n) return;
    const t = this.app.tools;
    t.select('furniture');
    t.state.furnitureType = n.type; t.state.furnitureTone = n.tone;
    t.state.furnitureState = JSON.parse(JSON.stringify(n.state));
    t.state.fromShelf = { shelfId: shelf.id, noteId };
    t.tools.furniture.rotOffset = 0;
    this.app.ui.updateToolPanel && this.app.ui.updateToolPanel();
    sfx.openDrawer();
    this.app.ui.toast('置きたい場所を選んでください（開いたページのまま置くこともできます）', 3200);
  }

  // 取り出したノートを置いたとき：本棚から外す（置くのと一緒に元に戻せる）
  removeFromShelf(shelfId, noteId) {
    const shelf = this.world.furniture.get(shelfId);
    if (!shelf) return null;
    const before = JSON.parse(JSON.stringify(shelf.state));
    const after = { ...before, notes: (before.notes || []).filter(n => n.id !== noteId) };
    this.world.setState(shelf, after);
    return { undo: () => this.world.setState(shelf, before), redo: () => this.world.setState(shelf, after) };
  }

  // ---------- 読む ----------
  openReader(ref, page = null) {
    const note = this.resolve(ref);
    if (!note) return;
    if (this.app.xr.active) { this.app.xr.openNote(ref, page); return; }
    const kind = note.type;
    let idx = page != null ? page : Math.max(0, note.state.page >= 0 ? note.state.page : 0);
    sfx.open();
    this.app.ui.openModal((box, close) => {
      box.innerHTML = `
        <div class="note-head"><h3></h3><button class="icon-btn note-x" aria-label="閉じる">✕</button></div>
        <div class="note-stage"><button class="note-nav prev" aria-label="前のページ">‹</button><canvas class="note-page"></canvas><button class="note-nav next" aria-label="次のページ">›</button></div>
        <div class="note-count"></div>
        <div class="note-foot"><div class="note-left"></div><button class="btn primary note-edit">編集</button></div>`;
      const h3 = box.querySelector('h3'), cv = box.querySelector('canvas'), count = box.querySelector('.note-count'), left = box.querySelector('.note-left');
      const render = () => {
        const n = this.resolve(ref);
        if (!n) { close(); return; }
        const total = pageCount(n.state.text || '');
        idx = Math.max(0, Math.min(total - 1, idx));
        h3.textContent = n.state.title || '（見出しなし）';
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        cv.width = Math.round(PAGE_W * dpr * 0.8); cv.height = Math.round(PAGE_H * dpr * 0.8);
        const x = cv.getContext('2d'); x.setTransform(cv.width / PAGE_W, 0, 0, cv.height / PAGE_H, 0, 0);
        drawPage(x, n.state.text || '', idx, kind);
        count.textContent = `${idx + 1} / ${total} ページ`;
        box.querySelector('.prev').disabled = idx <= 0;
        box.querySelector('.next').disabled = idx >= total - 1;
        // 置き方・しまう・取り出す
        left.innerHTML = '';
        const btn = (t, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.textContent = t; b.onclick = fn; left.appendChild(b); return b; };
        if (ref.furn) {
          const spread = idx - (idx % 2);
          const openHere = n.state.page === spread;
          btn(openHere ? '閉じて置く' : 'このページを開いて置く', () => {
            this.setState(ref.furn, { page: openHere ? -1 : spread }, openHere ? '閉じて置きました' : `${spread + 1}〜${spread + 2}ページを開いて置きました`);
            sfx.click(); render();
          });
          if (this.shelves().length) btn('本棚にしまう', () => this.chooseShelf(ref.furn, () => close()));
        } else {
          btn('取り出す', () => { close(); this.takeOut(ref.shelf, ref.noteId); }, 'primary');
        }
      };
      const go = d => { const n = this.resolve(ref); const total = pageCount((n && n.state.text) || ''); const ni = Math.max(0, Math.min(total - 1, idx + d)); if (ni !== idx) { idx = ni; sfx.page ? sfx.page() : sfx.click(); render(); } };
      box.querySelector('.prev').onclick = () => go(-1);
      box.querySelector('.next').onclick = () => go(1);
      box.querySelector('.note-x').onclick = () => { sfx.click(); close(); };
      box.querySelector('.note-edit').onclick = () => { sfx.click(); this.openEditor(ref, () => render(), idx); };
      // めくる：スワイプ・キー・ページの左右をタップ
      let sx = null;
      cv.addEventListener('pointerdown', e => { sx = e.clientX; });
      cv.addEventListener('pointerup', e => {
        if (sx === null) return;
        const dx = e.clientX - sx; sx = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        else { const r = cv.getBoundingClientRect(); go(e.clientX - r.left > r.width / 2 ? 1 : -1); }
      });
      const onKey = e => {
        if (!box.isConnected) { window.removeEventListener('keydown', onKey); return; }
        if (box.querySelector('.note-editor')) return;
        if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1);
      };
      window.addEventListener('keydown', onKey);
      render();
    }, { className: 'note-modal', onClose: () => window.dispatchEvent(new Event('note-closed')) });
  }

  // ---------- 編集 ----------
  openEditor(ref, after, page = 0) {
    const n = this.resolve(ref);
    if (!n) return;
    this.app.ui.openModal((box, close) => {
      box.innerHTML = `
        <h3>ノートを編集</h3>
        <label class="note-label">見出し（表紙の題名）<input type="text" class="input note-title" maxlength="30"></label>
        <label class="note-label">本文<textarea class="input note-text" rows="10" placeholder="ここに書いた文章が、自動でページに分かれます。&#10;「---」だけの行を入れると、そこで改ページします。"></textarea></label>
        <div class="note-edit-bar"><button class="btn small note-break">改ページを入れる</button><span class="note-pages"></span></div>
        <div class="row"><button class="btn" data-a="cancel">やめる</button><button class="btn primary" data-a="ok">保存</button></div>`;
      const ti = box.querySelector('.note-title'), ta = box.querySelector('.note-text'), info = box.querySelector('.note-pages');
      ti.value = n.state.title || ''; ta.value = n.state.text || '';
      const upd = () => { info.textContent = `${pageCount(ta.value)} ページ・${Array.from(ta.value).length} 文字`; };
      ta.addEventListener('input', upd); upd();
      // 読んでいたページのあたりにカーソルを置く
      const pages = paginate(ta.value);
      let pos = 0;
      for (let i = 0; i < Math.min(page, pages.length); i++) pos += pages[i].join('').length;
      requestAnimationFrame(() => { try { if (!isTouchDevice) { ta.focus(); ta.setSelectionRange(Math.min(pos, ta.value.length), Math.min(pos, ta.value.length)); } } catch { /* 無視 */ } });
      box.querySelector('.note-break').onclick = () => {
        const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
        const ins = (s > 0 && ta.value[s - 1] !== '\n' ? '\n' : '') + '---\n';
        ta.value = ta.value.slice(0, s) + ins + ta.value.slice(e);
        ta.focus(); ta.setSelectionRange(s + ins.length, s + ins.length); upd(); sfx.click();
      };
      box.querySelector('[data-a=cancel]').onclick = () => { sfx.click(); close(); };
      box.querySelector('[data-a=ok]').onclick = () => {
        const patch = { title: ti.value.trim().slice(0, 30), text: ta.value };
        if (ref.furn) this.setState(ref.furn, patch, '保存しました'); else this.setStored(ref.shelf, ref.noteId, patch);
        sfx.save(); close(); after && after();
      };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); box.querySelector('[data-a=ok]').click(); } });
    }, { className: 'note-modal note-editor', dismissable: false });
  }

  // ---------- 本棚 ----------
  openShelf(shelf) {
    if (this.app.xr.active) { this.app.xr.openShelf(shelf); return; }
    sfx.open();
    this.app.ui.openModal((box, close) => {
      const notes = shelf.state.notes || [];
      box.innerHTML = `<div class="note-head"><h3></h3><button class="icon-btn note-x" aria-label="閉じる">✕</button></div><p></p><div class="shelf-grid"></div>`;
      box.querySelector('h3').textContent = this.shelfName(shelf);
      box.querySelector('p').textContent = notes.length ? '読みたいノートを選んでください。' : 'まだノートがありません。ノートを手ツールで選んで、「本棚にしまう」でしまえます。';
      const grid = box.querySelector('.shelf-grid');
      notes.forEach(n => {
        const b = document.createElement('button'); b.className = 'shelf-book';
        const c = (NOTE_TONES[n.tone] || NOTE_TONES.navy).color;
        b.style.background = hex(c); b.style.color = light(c) ? '#2d2b28' : '#fff';
        const kind = NOTE_KINDS[n.type] || NOTE_KINDS.notebook;
        b.style.height = Math.round(120 * kind.H / 0.24) + 'px';
        b.innerHTML = '<span></span><small></small>';
        b.querySelector('span').textContent = n.state.title || '（見出しなし）';
        b.querySelector('small').textContent = kind.name;
        b.onclick = () => { sfx.click(); close(); this.openReader({ shelf, noteId: n.id }); };
        grid.appendChild(b);
      });
      box.querySelector('.note-x').onclick = () => { sfx.click(); close(); };
    }, { className: 'note-modal' });
  }
}
