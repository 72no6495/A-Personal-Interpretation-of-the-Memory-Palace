// 宮殿の保存（IndexedDB）とバックアップファイル
const DB_NAME = 'memory-palace';
const DB_VER = 1;
export const BACKUP_EXT = '.mpalace';
const FORMAT = 'memory-palace-backup';

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(stores, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  }));
}

function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function listPalaces() {
  const all = await tx(['meta'], 'readonly', t => reqP(t.objectStore('meta').getAll()));
  return (all || []).sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export async function savePalace(data, thumb) {
  const meta = {
    id: data.id, name: data.name, created: data.created, updated: data.updated,
    thumb: thumb || null,
    counts: { furniture: data.furniture.length, images: data.images.length },
  };
  await tx(['meta', 'data'], 'readwrite', t => {
    t.objectStore('meta').put(meta);
    t.objectStore('data').put({ id: data.id, data });
  });
  return meta;
}

export async function loadPalace(id) {
  const rec = await tx(['data'], 'readonly', t => reqP(t.objectStore('data').get(id)));
  return rec ? rec.data : null;
}

export async function deletePalace(id) {
  await tx(['meta', 'data'], 'readwrite', t => {
    t.objectStore('meta').delete(id);
    t.objectStore('data').delete(id);
  });
}

export async function renamePalace(id, name) {
  const data = await loadPalace(id);
  if (!data) return;
  data.name = name;
  await tx(['meta', 'data'], 'readwrite', async t => {
    const ms = t.objectStore('meta');
    const m = await reqP(ms.get(id));
    if (m) { m.name = name; ms.put(m); }
    t.objectStore('data').put({ id, data });
  });
}

// ---- バックアップ ----
export function makeBackupBlob(data) {
  const payload = { format: FORMAT, version: 1, exported: Date.now(), palace: data };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export function backupFileName(name) {
  // 一部のブラウザは日本語のファイル名を無視するため ASCII のみにする
  const ascii = (name || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  const safe = 'memory-palace' + (ascii ? '-' + ascii : '');
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${safe}-${stamp}${BACKUP_EXT}`;
}

export async function downloadBackup(data) {
  const blob = makeBackupBlob(data);
  const name = backupFileName(data.name);
  // 可能ならファイル共有（スマホ）を試す
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: data.name });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export async function readBackupFile(file) {
  const text = await file.text();
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('ファイルを読み込めませんでした（形式が違います）'); }
  const palace = obj && obj.format === FORMAT ? obj.palace : (obj && obj.surfaces && obj.furniture ? obj : null);
  if (!palace || !palace.surfaces) throw new Error('宮殿のバックアップファイルではありません');
  return palace;
}
