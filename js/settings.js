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
  stickMode: 'float',
  ambient: true,           // 環境音
  ambientVolume: 0.5,      // 環境音の音量
  musicVolume: 0.6,        // 音楽（グラモフォン）の音量
  vrHeight: 0,             // VR：視点の高さの調整（m、-0.5〜+0.4）
  vrTurn: 'snap30',        // VR：向きの変え方 'snap30' | 'snap45' | 'smooth'
  vrPanelHand: 'left',     // VR：パレットを持つ手 'left' | 'right'
  vrPanelFollow: 'hand',   // VR：パレットの位置 'hand'（手につく）| 'view'（視線についてくる）| 'world'（その場に置く）
  vrPanelSize: 1,          // VR：パレットの大きさ
  vrKeyboard: false,       // VR：パレットのキーボード（Quest のキーボードが使えないときの代わり）
  vrQuality: 'standard',   // VR：画質 'low' | 'standard' | 'high' | 'ultra'
};

// VR の画質：描画の解像度（倍率）と、視野の端を粗く描く度合い（フォービエーション）
export const VR_QUALITY = {
  low: { name: '軽量', scale: 0.8, foveation: 1 },
  standard: { name: '標準', scale: 1, foveation: 0.6 },
  high: { name: '高精細', scale: 1.25, foveation: 0.3 },
  ultra: { name: '最高', scale: 1.5, foveation: 0 },
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
