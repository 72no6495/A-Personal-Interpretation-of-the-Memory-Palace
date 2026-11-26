// 設定の読み書き（localStorage）
const KEY = 'memory-palace-settings-v1';

export const isTouchDevice = (() => {
  try {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  } catch { return false; }
})();

export const DEFAULTS = {
  mouseSensitivity: 1.0,   // マウス感度
  touchSensitivity: 1.0,   // タッチ視点感度
  invertY: false,          // 上下反転
  moveSpeed: 1.0,          // 移動速度倍率
  fov: 70,                 // 視野角
  volume: 0.5,             // 効果音音量
  footsteps: true,         // 足音
  drawSensitivity: 0.5,    // 描画中の視点感度（ロックモード）
  smoothing: 0.35,         // 手ぶれ補正の初期値
  quality: isTouchDevice ? 'medium' : 'high', // 描画解像度
  showCrosshair: true,
  showHints: true,
  pixelRatio: isTouchDevice ? 1.5 : 2,
  autosave: true,
  stickMode: 'float',      // 'float'：触った場所に出る / 'fixed'：位置を固定
};

export const QUALITY_PPM = { low: 112, medium: 160, high: 224, ultra: 320 };

export const settings = { ...DEFAULTS };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(settings, DEFAULTS, JSON.parse(raw));
  } catch { /* 無視 */ }
  return settings;
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* 無視 */ }
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}
