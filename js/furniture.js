// シンプルな家具のカタログ
// 座標系:
//   floor / small: Y が上、原点は底面の中心
//   wall:  Y が上、Z が壁から手前、原点は壁との接点
//   ceiling: 原点は天井との接点、物体は -Y 方向へ下がる
import * as THREE from './lib/three.module.min.js';

export const TONES = {
  white: { name: 'ホワイト', color: 0xf3f1ed },
  oak: { name: 'オーク', color: 0xd6bc98 },
  walnut: { name: 'ウォルナット', color: 0x7f5d45 },
  gray: { name: 'グレー', color: 0x9d9d9a },
  black: { name: 'ブラック', color: 0x3b3b3b },
};
export const TONE_KEYS = Object.keys(TONES);

const matCache = new Map();
function M(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, ...(extra || {}) }));
  return matCache.get(key);
}
const glow = (color, intensity = 1) => M(0xffffff, { emissive: color, emissiveIntensity: intensity });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 28) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}
function sphere(r, mat, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6 | 0)), mat);
  m.position.set(x, y, z);
  return m;
}
function lathe(points, mat, seg = 32) {
  return new THREE.Mesh(new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg), mat);
}
function group(...children) { const g = new THREE.Group(); children.forEach(c => g.add(c)); return g; }

// 上向きの面（天板など）
const top = (name, w, h, y, x = 0, z = 0, opts = {}) => ({ name, w, h, pos: [x, y, z], rot: [-Math.PI / 2, 0, 0], mount: 'top', acceptsImages: true, acceptsSmall: true, ...opts });
// 正面向きの面（額縁・ボードなど）
const face = (name, w, h, x, y, z, opts = {}) => ({ name, w, h, pos: [x, y, z], rot: [0, 0, 0], mount: 'face', acceptsImages: true, acceptsSmall: false, ...opts });

const ACCENT = 0x8c8c8a;
const DARK = 0x4a4a4a;

const BUILDERS = {
  // ---------- 床に置く家具 ----------
  table(t) {
    const m = M(t), g = group(box(1.2, 0.04, 0.7, m, 0, 0.71, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.045, 0.69, 0.045, m, sx * 0.54, 0.345, sz * 0.29));
    return { group: g, surfaces: [top('top', 1.18, 0.68, 0.7301, 0, 0, { label: '天板' })] };
  },
  lowtable(t) {
    const m = M(t), g = group(box(1.0, 0.035, 0.56, m, 0, 0.365, 0));
    for (const sx of [-1, 1]) g.add(box(0.035, 0.35, 0.5, m, sx * 0.46, 0.175, 0));
    return { group: g, surfaces: [top('top', 0.98, 0.54, 0.3826, 0, 0, { label: '天板' })] };
  },
  desk(t) {
    const m = M(t), g = group(box(1.3, 0.035, 0.65, m, 0, 0.72, 0));
    g.add(box(0.035, 0.7, 0.6, m, -0.63, 0.35, 0), box(0.035, 0.7, 0.6, m, 0.63, 0.35, 0));
    g.add(box(0.42, 0.42, 0.6, m, 0.4, 0.49, 0));
    g.add(box(0.36, 0.006, 0.01, M(ACCENT), 0.4, 0.6, 0.302), box(0.36, 0.006, 0.01, M(ACCENT), 0.4, 0.42, 0.302));
    return { group: g, surfaces: [top('top', 1.28, 0.63, 0.7376, 0, 0, { label: '天板' })] };
  },
  chair(t) {
    const m = M(t), g = group(box(0.44, 0.04, 0.42, m, 0, 0.45, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.035, 0.45, 0.035, m, sx * 0.19, 0.225, sz * 0.18));
    g.add(box(0.035, 0.45, 0.035, m, -0.19, 0.69, -0.18), box(0.035, 0.45, 0.035, m, 0.19, 0.69, -0.18));
    g.add(box(0.42, 0.18, 0.025, m, 0, 0.82, -0.185));
    return { group: g, surfaces: [] };
  },
  stool(t) {
    const m = M(t), g = group(cyl(0.18, 0.18, 0.035, m, 0, 0.62, 0));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const leg = cyl(0.015, 0.018, 0.62, m, Math.cos(a) * 0.12, 0.31, Math.sin(a) * 0.12, 10);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      g.add(leg);
    }
    return { group: g, surfaces: [] };
  },
  sofa(t) {
    const m = M(t), g = group(box(1.8, 0.22, 0.82, m, 0, 0.2, 0));
    g.add(box(1.5, 0.12, 0.66, M(t), 0, 0.37, 0.06));
    g.add(box(1.8, 0.48, 0.18, m, 0, 0.54, -0.32));
    g.add(box(0.15, 0.32, 0.82, m, -0.825, 0.43, 0), box(0.15, 0.32, 0.82, m, 0.825, 0.43, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.09, 0.04, M(DARK), sx * 0.84, 0.045, sz * 0.36));
    return { group: g, surfaces: [] };
  },
  bed(t) {
    const m = M(t), g = group(box(1.1, 0.3, 2.0, m, 0, 0.15, 0));
    g.add(box(1.04, 0.16, 1.94, M(0xfbfbf9), 0, 0.38, 0));
    g.add(box(1.1, 0.5, 0.05, m, 0, 0.55, -0.98));
    g.add(box(0.6, 0.1, 0.32, M(0xffffff), 0, 0.5, -0.72));
    g.add(box(1.06, 0.03, 1.1, M(0xe9e7e2), 0, 0.47, 0.4));
    return { group: g, surfaces: [] };
  },
  bookshelf(t) {
    const m = M(t), g = group();
    const W = 0.9, H = 1.8, D = 0.32;
    g.add(box(0.03, H, D, m, -W / 2 + 0.015, H / 2, 0), box(0.03, H, D, m, W / 2 - 0.015, H / 2, 0));
    g.add(box(W, H, 0.015, m, 0, H / 2, -D / 2 + 0.0075));
    const shelves = [0.03, 0.47, 0.91, 1.35, 1.785];
    const surfaces = [];
    shelves.forEach((y, i) => {
      g.add(box(W - 0.06, 0.03, D - 0.015, m, 0, y, 0.0075));
      const isTop = i === shelves.length - 1;
      const sw = isTop ? W : W - 0.06;
      if (isTop) g.children[g.children.length - 1].scale.x = W / (W - 0.06);
      surfaces.push(top(isTop ? 'top' : 'shelf' + (i + 1), sw - 0.02, D - 0.04, y + 0.0151, 0, 0.0075, { label: isTop ? '天板' : `棚${i + 1}` }));
    });
    return { group: g, surfaces };
  },
  cabinet(t) {
    const m = M(t), g = group(box(0.8, 0.78, 0.45, m, 0, 0.41, 0));
    for (const sx of [-1, 1]) g.add(box(0.03, 0.02, 0.03, M(DARK), sx * 0.36, 0.01, 0));
    g.add(box(0.78, 0.004, 0.005, M(0xcfcfcb), 0, 0.41, 0.2255));
    g.add(box(0.004, 0.36, 0.005, M(0xcfcfcb), 0, 0.22, 0.2255));
    g.add(box(0.12, 0.014, 0.02, M(ACCENT), 0, 0.6, 0.235), box(0.014, 0.1, 0.02, M(ACCENT), -0.05, 0.25, 0.235), box(0.014, 0.1, 0.02, M(ACCENT), 0.05, 0.25, 0.235));
    return { group: g, surfaces: [top('top', 0.78, 0.43, 0.8001, 0, 0, { label: '天板' })] };
  },
  pedestal(t) {
    const m = M(t), g = group(box(0.42, 0.98, 0.42, m, 0, 0.49, 0));
    g.add(box(0.46, 0.03, 0.46, m, 0, 0.995, 0));
    return { group: g, surfaces: [top('top', 0.44, 0.44, 1.0101, 0, 0, { label: '天板' })] };
  },
  standboard(t) {
    const m = M(t), g = group();
    g.add(box(1.32, 0.94, 0.04, m, 0, 1.25, 0));
    g.add(box(1.26, 0.88, 0.01, M(0xfdfdfd), 0, 1.25, 0.021));
    for (const sx of [-1, 1]) {
      g.add(box(0.04, 1.75, 0.04, m, sx * 0.62, 0.875, -0.03));
      g.add(box(0.06, 0.03, 0.5, m, sx * 0.62, 0.015, -0.03));
    }
    g.add(box(1.2, 0.025, 0.06, m, 0, 0.775, 0.03));
    return {
      group: g, surfaces: [
        face('front', 1.26, 0.88, 0, 1.25, 0.0262, { label: 'ボード' }),
        { ...face('back', 1.26, 0.88, 0, 1.25, -0.0201, { label: 'ボード裏' }), rot: [0, Math.PI, 0] },
      ],
    };
  },
  floorlamp(t) {
    const m = M(t), g = group(cyl(0.16, 0.18, 0.03, m, 0, 0.015, 0));
    g.add(cyl(0.012, 0.012, 1.45, M(ACCENT), 0, 0.74, 0, 10));
    const shade = cyl(0.13, 0.2, 0.28, glow(0xfff3dc, 0.85), 0, 1.5, 0, 32);
    shade.material = M(0xfffaf0, { emissive: 0xfff0d8, emissiveIntensity: 0.75, side: THREE.DoubleSide });
    g.add(shade);
    return { group: g, surfaces: [] };
  },
  plant(t) {
    const g = group(lathe([[0, 0], [0.15, 0], [0.19, 0.34], [0.2, 0.36], [0, 0.36]], M(t)));
    g.add(cyl(0.17, 0.17, 0.02, M(0x6b5544), 0, 0.345, 0));
    const leaf = M(0x8fae8b), leaf2 = M(0x7a9c78);
    const rnd = mulberry(7);
    for (let i = 0; i < 9; i++) {
      const s = sphere(0.14 + rnd() * 0.1, i % 2 ? leaf : leaf2, (rnd() - 0.5) * 0.35, 0.6 + rnd() * 0.65, (rnd() - 0.5) * 0.35, 10);
      s.scale.y = 1.2;
      g.add(s);
    }
    g.add(cyl(0.015, 0.02, 0.6, M(0x6d5a48), 0, 0.62, 0, 8));
    return { group: g, surfaces: [] };
  },
  rug(t) {
    const g = group(box(2.0, 0.012, 1.4, M(t === TONES.white.color ? 0xebe8e2 : t), 0, 0.006, 0));
    return { group: g, surfaces: [top('top', 1.98, 1.38, 0.0122, 0, 0, { label: 'ラグ' })] };
  },

  // ---------- 壁掛け ----------
  frameS(t) { return frame(t, 0.62, 0.47); },
  frameL(t) { return frame(t, 1.24, 0.86); },
  frameP(t) { return frame(t, 0.5, 0.7); },
  board(t) {
    const m = M(t), g = group(box(1.46, 0.96, 0.035, m, 0, 0, 0.0175));
    g.add(box(1.38, 0.88, 0.01, M(0xd8c4a4), 0, 0, 0.038));
    return { group: g, surfaces: [face('front', 1.38, 0.88, 0, 0, 0.0431, { label: 'ボード' })] };
  },
  whiteboard(t) {
    const m = M(t), g = group(box(1.84, 1.04, 0.03, m, 0, 0, 0.015));
    g.add(box(1.78, 0.98, 0.01, M(0xfdfdfd), 0, 0, 0.032));
    g.add(box(1.0, 0.025, 0.07, m, 0, -0.53, 0.04));
    return { group: g, surfaces: [face('front', 1.78, 0.98, 0, 0, 0.0371, { label: 'ボード' })] };
  },
  wallshelf(t) {
    const m = M(t), g = group(box(0.9, 0.03, 0.24, m, 0, 0, 0.12));
    for (const sx of [-1, 1]) g.add(box(0.02, 0.14, 0.02, M(ACCENT), sx * 0.34, -0.07, 0.01), box(0.02, 0.02, 0.18, M(ACCENT), sx * 0.34, -0.03, 0.1));
    return { group: g, surfaces: [top('top', 0.88, 0.22, 0.0151, 0, 0.12, { label: '棚板' })] };
  },
  clock(t) {
    const m = M(t), g = group(cyl(0.19, 0.19, 0.035, m, 0, 0, 0.0175, 40));
    g.children[0].rotation.x = Math.PI / 2;
    const faceM = cyl(0.17, 0.17, 0.01, M(0xfcfcfa), 0, 0, 0.036, 40); faceM.rotation.x = Math.PI / 2; g.add(faceM);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const tick = box(0.008, i % 3 ? 0.018 : 0.03, 0.004, M(DARK), Math.sin(a) * 0.145, Math.cos(a) * 0.145, 0.042);
      tick.rotation.z = -a; g.add(tick);
    }
    const hand = (len, w, z, col) => { const p = new THREE.Group(); p.position.z = z; p.add(box(w, len, 0.003, M(col), 0, len / 2 - 0.015, 0)); g.add(p); return p; };
    const h = hand(0.09, 0.012, 0.045, DARK), mn = hand(0.13, 0.008, 0.049, DARK), s = hand(0.14, 0.003, 0.053, 0xb06a5a);
    g.add(cyl(0.008, 0.008, 0.02, M(DARK), 0, 0, 0.05, 12)).children;
    return {
      group: g, surfaces: [],
      animate() {
        const d = new Date();
        const sec = d.getSeconds() + d.getMilliseconds() / 1000;
        const min = d.getMinutes() + sec / 60;
        const hr = (d.getHours() % 12) + min / 60;
        s.rotation.z = -sec / 60 * Math.PI * 2;
        mn.rotation.z = -min / 60 * Math.PI * 2;
        h.rotation.z = -hr / 12 * Math.PI * 2;
      },
    };
  },
  walllamp(t) {
    const m = M(t), g = group(box(0.1, 0.16, 0.02, m, 0, 0, 0.01));
    const arm = box(0.02, 0.02, 0.14, M(ACCENT), 0, 0, 0.08); g.add(arm);
    g.add(sphere(0.07, M(0xfffaf0, { emissive: 0xfff0d6, emissiveIntensity: 0.9 }), 0, 0.02, 0.18, 24));
    return { group: g, surfaces: [] };
  },
  window(t) {
    const m = M(t), g = group();
    const W = 1.1, H = 1.3;
    g.add(box(W, 0.06, 0.06, m, 0, H / 2, 0.03), box(W, 0.06, 0.06, m, 0, -H / 2, 0.03));
    g.add(box(0.06, H, 0.06, m, -W / 2, 0, 0.03), box(0.06, H, 0.06, m, W / 2, 0, 0.03));
    g.add(box(W - 0.06, 0.03, 0.03, m, 0, 0, 0.04), box(0.03, H - 0.06, 0.03, m, 0, 0, 0.04));
    g.add(box(W + 0.12, 0.04, 0.12, m, 0, -H / 2 - 0.04, 0.06));
    g.add(box(W - 0.06, H - 0.06, 0.005, M(0xeef4fa, { emissive: 0xe6eef8, emissiveIntensity: 0.55 }), 0, 0, 0.012));
    return { group: g, surfaces: [face('pane', W - 0.06, H - 0.06, 0, 0, 0.0151, { label: '窓ガラス', acceptsImages: true })] };
  },
  hooks(t) {
    const m = M(t), g = group(box(0.7, 0.08, 0.02, m, 0, 0, 0.01));
    for (let i = 0; i < 4; i++) {
      const x = -0.24 + i * 0.16;
      g.add(cyl(0.012, 0.012, 0.07, M(ACCENT), x, 0, 0.055, 10));
      g.children[g.children.length - 1].rotation.x = Math.PI / 2;
      g.add(sphere(0.018, M(ACCENT), x, 0, 0.092, 10));
    }
    return { group: g, surfaces: [] };
  },

  // ---------- 天井 ----------
  pendant(t) {
    const g = group(cyl(0.05, 0.05, 0.02, M(t), 0, -0.01, 0));
    g.add(cyl(0.004, 0.004, 0.9, M(DARK), 0, -0.46, 0, 6));
    const shade = lathe([[0.02, 0], [0.04, -0.02], [0.17, -0.2], [0.18, -0.22]], M(t, { side: THREE.DoubleSide }), 32);
    shade.position.y = -0.9; g.add(shade);
    g.add(sphere(0.055, M(0xfffaf0, { emissive: 0xfff0d6, emissiveIntensity: 1 }), 0, -1.06, 0));
    return { group: g, surfaces: [] };
  },
  ceilinglight(t) {
    const g = group(cyl(0.3, 0.3, 0.03, M(t), 0, -0.015, 0, 48));
    g.add(cyl(0.27, 0.29, 0.06, M(0xfffcf6, { emissive: 0xfff6e8, emissiveIntensity: 0.8 }), 0, -0.06, 0, 48));
    return { group: g, surfaces: [] };
  },
  fan(t) {
    const m = M(t), g = group(cyl(0.06, 0.06, 0.05, m, 0, -0.025, 0));
    g.add(cyl(0.012, 0.012, 0.35, M(ACCENT), 0, -0.2, 0, 8));
    const rotor = new THREE.Group(); rotor.position.y = -0.4;
    rotor.add(cyl(0.1, 0.1, 0.08, m, 0, 0, 0));
    for (let i = 0; i < 4; i++) {
      const b = box(0.55, 0.012, 0.12, m, 0.36, 0, 0);
      const p = new THREE.Group(); p.rotation.y = i / 4 * Math.PI * 2; b.rotation.x = 0.12; p.add(b); rotor.add(p);
    }
    rotor.add(sphere(0.07, M(0xfffaf0, { emissive: 0xfff0d6, emissiveIntensity: 0.8 }), 0, -0.07, 0));
    g.add(rotor);
    return { group: g, surfaces: [], animate(time) { rotor.rotation.y = time * 1.4; } };
  },
  sign(t) {
    const m = M(t), g = group();
    for (const sx of [-1, 1]) g.add(cyl(0.003, 0.003, 0.6, M(DARK), sx * 0.38, -0.3, 0, 6));
    g.add(box(0.94, 0.54, 0.03, m, 0, -0.87, 0));
    return {
      group: g, surfaces: [
        face('front', 0.9, 0.5, 0, -0.87, 0.0151, { label: '表' }),
        { ...face('back', 0.9, 0.5, 0, -0.87, -0.0151, { label: '裏' }), rot: [0, Math.PI, 0] },
      ],
    };
  },
  globe(t) {
    const g = group(cyl(0.04, 0.04, 0.02, M(t), 0, -0.01, 0));
    g.add(cyl(0.004, 0.004, 0.5, M(DARK), 0, -0.26, 0, 6));
    g.add(sphere(0.16, M(0xfffcf6, { emissive: 0xfff4e2, emissiveIntensity: 0.85 }), 0, -0.66, 0, 32));
    return { group: g, surfaces: [] };
  },

  // ---------- 小物 ----------
  vase(t) {
    const g = group(lathe([[0, 0], [0.05, 0], [0.075, 0.08], [0.06, 0.18], [0.035, 0.24], [0.045, 0.27], [0.04, 0.27], [0.03, 0.24], [0, 0.24]], M(t)));
    const stem = M(0x7f9c7c);
    g.add(cyl(0.004, 0.004, 0.22, stem, 0.01, 0.34, 0, 6), cyl(0.004, 0.004, 0.18, stem, -0.02, 0.32, 0.01, 6));
    g.add(sphere(0.03, M(0xf2f0ee), 0.01, 0.46, 0), sphere(0.025, M(0xe9d6d2), -0.03, 0.42, 0.01));
    g.children[1].rotation.z = -0.1; g.children[2].rotation.z = 0.15;
    return { group: g, surfaces: [] };
  },
  cup(t) {
    const g = group(lathe([[0, 0], [0.035, 0], [0.042, 0.09], [0.038, 0.09], [0.032, 0.006], [0, 0.006]], M(t)));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 20, Math.PI), M(t));
    handle.position.set(0.042, 0.045, 0); handle.rotation.z = -Math.PI / 2; g.add(handle);
    g.add(cyl(0.065, 0.065, 0.008, M(t), 0, 0.004, 0, 28));
    g.children[0].position.y = 0.008; handle.position.y += 0.008;
    return { group: g, surfaces: [] };
  },
  books(t) {
    const g = group();
    const cols = [t, 0xc9c3b8, 0x8c9aa6, 0xd8d2c6];
    let y = 0;
    [[0.24, 0.035, 0.17], [0.22, 0.03, 0.16], [0.2, 0.04, 0.15], [0.21, 0.025, 0.155]].forEach((s, i) => {
      const b = box(s[0], s[1], s[2], M(cols[i]), (i % 2 ? 0.01 : -0.01), y + s[1] / 2, 0);
      b.rotation.y = (i - 1.5) * 0.06; g.add(b); y += s[1];
    });
    return { group: g, surfaces: [top('top', 0.18, 0.13, y + 0.0001, 0, 0, { label: '表紙', acceptsSmall: true })] };
  },
  candle(t) {
    const g = group(cyl(0.045, 0.045, 0.09, M(t), 0, 0.045, 0));
    g.add(cyl(0.002, 0.002, 0.015, M(DARK), 0, 0.097, 0, 6));
    const flame = sphere(0.012, M(0xfff2cc, { emissive: 0xffd58a, emissiveIntensity: 1 }), 0, 0.116, 0, 10);
    flame.scale.y = 1.8; g.add(flame);
    return { group: g, surfaces: [], animate(time) { flame.scale.y = 1.7 + Math.sin(time * 11) * 0.12 + Math.sin(time * 17.3) * 0.08; } };
  },
  succulent(t) {
    const g = group(cyl(0.065, 0.05, 0.08, M(t), 0, 0.04, 0));
    g.add(cyl(0.058, 0.058, 0.01, M(0x6b5544), 0, 0.075, 0));
    const leaf = M(0x9bb59a);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      const l = sphere(0.025, leaf, Math.cos(a) * 0.025, 0.1, Math.sin(a) * 0.025, 8);
      l.scale.set(0.6, 1.5, 0.6); l.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(l);
    }
    return { group: g, surfaces: [] };
  },
  smallbox(t) {
    const g = group(box(0.18, 0.12, 0.14, M(t), 0, 0.06, 0));
    g.add(box(0.185, 0.02, 0.145, M(t), 0, 0.12, 0));
    return { group: g, surfaces: [top('top', 0.17, 0.13, 0.1301, 0, 0, { label: 'ふた' })] };
  },
  orb(t) {
    const g = group(cyl(0.05, 0.06, 0.03, M(t), 0, 0.015, 0));
    g.add(sphere(0.07, M(0xf6f6f4), 0, 0.095, 0, 28));
    return { group: g, surfaces: [] };
  },
  photostand(t) {
    const m = M(t), g = group();
    const fr = new THREE.Group();
    fr.add(box(0.2, 0.26, 0.015, m, 0, 0.13, 0));
    fr.add(box(0.17, 0.23, 0.004, M(0xfcfcfa), 0, 0.13, 0.0095));
    fr.rotation.x = -0.15;
    g.add(fr);
    const leg = box(0.02, 0.2, 0.01, m, 0, 0.1, -0.06); leg.rotation.x = 0.35; g.add(leg);
    const c = Math.cos(-0.15), s = Math.sin(-0.15);
    // 正面の面（フレームと同じ傾き）
    const y = 0.13 * c - 0.0116 * s, z = 0.13 * s + 0.0116 * c;
    return { group: g, surfaces: [{ ...face('front', 0.17, 0.23, 0, y, z, { label: '写真' }), rot: [-0.15, 0, 0] }] };
  },
  desklamp(t) {
    const m = M(t), g = group(cyl(0.07, 0.08, 0.02, m, 0, 0.01, 0));
    const a1 = box(0.015, 0.3, 0.015, M(ACCENT), 0, 0.16, 0); a1.rotation.z = 0.25; g.add(a1);
    const a2 = box(0.015, 0.22, 0.015, M(ACCENT), -0.11, 0.33, 0); a2.rotation.z = -1.0; g.add(a2);
    const sh = lathe([[0.01, 0], [0.02, -0.01], [0.07, -0.09], [0.075, -0.1]], M(t, { side: THREE.DoubleSide }), 24);
    sh.position.set(-0.2, 0.4, 0); sh.rotation.z = 0.3; g.add(sh);
    g.add(sphere(0.025, M(0xfffaf0, { emissive: 0xfff0d6, emissiveIntensity: 1 }), -0.225, 0.33, 0, 12));
    return { group: g, surfaces: [] };
  },
  clockS(t) {
    const g = group(box(0.14, 0.14, 0.06, M(t), 0, 0.07, 0));
    const f = cyl(0.05, 0.05, 0.004, M(0xfcfcfa), 0, 0.075, 0.031, 24); f.rotation.x = Math.PI / 2; g.add(f);
    const hand = (len, w, col) => { const p = new THREE.Group(); p.position.set(0, 0.075, 0.034); p.add(box(w, len, 0.002, M(col), 0, len / 2 - 0.005, 0)); g.add(p); return p; };
    const h = hand(0.03, 0.005, DARK), mn = hand(0.042, 0.003, DARK);
    return {
      group: g, surfaces: [],
      animate() {
        const d = new Date(); const min = d.getMinutes() + d.getSeconds() / 60;
        mn.rotation.z = -min / 60 * Math.PI * 2; h.rotation.z = -((d.getHours() % 12) + min / 60) / 12 * Math.PI * 2;
      },
    };
  },
};

function frame(t, W, H) {
  const m = M(t), g = group();
  const b = 0.045, d = 0.035;
  g.add(box(W, b, d, m, 0, H / 2 - b / 2, d / 2), box(W, b, d, m, 0, -H / 2 + b / 2, d / 2));
  g.add(box(b, H - 2 * b, d, m, -W / 2 + b / 2, 0, d / 2), box(b, H - 2 * b, d, m, W / 2 - b / 2, 0, d / 2));
  g.add(box(W - 2 * b + 0.002, H - 2 * b + 0.002, 0.012, M(0xfdfdfb), 0, 0, 0.006));
  return { group: g, surfaces: [face('front', W - 2 * b, H - 2 * b, 0, 0, 0.0121, { label: '額の中' })] };
}

function mulberry(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// カタログ（mount: floor / wall / ceiling / small）
export const CATALOG = [
  { id: 'table', name: 'テーブル', mount: 'floor', tone: 'oak', collide: true, note: '描ける・飾れる' },
  { id: 'lowtable', name: 'ローテーブル', mount: 'floor', tone: 'white', collide: true, note: '描ける・飾れる' },
  { id: 'desk', name: 'デスク', mount: 'floor', tone: 'oak', collide: true, note: '描ける・飾れる' },
  { id: 'chair', name: '椅子', mount: 'floor', tone: 'oak', collide: true },
  { id: 'stool', name: 'スツール', mount: 'floor', tone: 'white', collide: true },
  { id: 'sofa', name: 'ソファ', mount: 'floor', tone: 'gray', collide: true },
  { id: 'bed', name: 'ベッド', mount: 'floor', tone: 'oak', collide: true },
  { id: 'bookshelf', name: '本棚', mount: 'floor', tone: 'white', collide: true, note: '小物を置ける' },
  { id: 'cabinet', name: 'キャビネット', mount: 'floor', tone: 'white', collide: true, note: '描ける・飾れる' },
  { id: 'pedestal', name: '台座', mount: 'floor', tone: 'white', collide: true, note: '描ける・飾れる' },
  { id: 'standboard', name: 'スタンドボード', mount: 'floor', tone: 'white', collide: true, note: '両面に描ける' },
  { id: 'floorlamp', name: 'フロアランプ', mount: 'floor', tone: 'white', collide: true },
  { id: 'plant', name: '観葉植物', mount: 'floor', tone: 'white', collide: true },
  { id: 'rug', name: 'ラグ', mount: 'floor', tone: 'white', collide: false, note: '描ける・飾れる' },

  { id: 'frameS', name: '額縁（小）', mount: 'wall', tone: 'oak', note: '描ける・写真' },
  { id: 'frameP', name: '額縁（縦）', mount: 'wall', tone: 'black', note: '描ける・写真' },
  { id: 'frameL', name: '額縁（大）', mount: 'wall', tone: 'white', note: '描ける・写真' },
  { id: 'board', name: 'コルクボード', mount: 'wall', tone: 'oak', note: '描ける・写真' },
  { id: 'whiteboard', name: 'ホワイトボード', mount: 'wall', tone: 'gray', note: '描ける・写真' },
  { id: 'wallshelf', name: '壁棚', mount: 'wall', tone: 'oak', note: '小物を置ける' },
  { id: 'clock', name: '時計', mount: 'wall', tone: 'white' },
  { id: 'walllamp', name: '壁ランプ', mount: 'wall', tone: 'white' },
  { id: 'window', name: '窓', mount: 'wall', tone: 'white', note: '描ける' },
  { id: 'hooks', name: 'フック', mount: 'wall', tone: 'oak' },

  { id: 'pendant', name: 'ペンダントライト', mount: 'ceiling', tone: 'white' },
  { id: 'ceilinglight', name: 'シーリングライト', mount: 'ceiling', tone: 'white' },
  { id: 'globe', name: 'グローブライト', mount: 'ceiling', tone: 'white' },
  { id: 'fan', name: 'シーリングファン', mount: 'ceiling', tone: 'white' },
  { id: 'sign', name: '吊り看板', mount: 'ceiling', tone: 'oak', note: '両面に描ける' },

  { id: 'vase', name: '花瓶', mount: 'small', tone: 'white' },
  { id: 'cup', name: 'カップ', mount: 'small', tone: 'white' },
  { id: 'books', name: '本', mount: 'small', tone: 'walnut' },
  { id: 'candle', name: 'キャンドル', mount: 'small', tone: 'white' },
  { id: 'succulent', name: '小さな植物', mount: 'small', tone: 'white' },
  { id: 'smallbox', name: '小箱', mount: 'small', tone: 'oak' },
  { id: 'orb', name: '置物', mount: 'small', tone: 'gray' },
  { id: 'photostand', name: 'フォトスタンド', mount: 'small', tone: 'oak', note: '描ける・写真' },
  { id: 'desklamp', name: 'デスクランプ', mount: 'small', tone: 'white' },
  { id: 'clockS', name: '置き時計', mount: 'small', tone: 'walnut' },
];
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(c => [c.id, c]));

export const MOUNT_NAMES = { floor: '床', wall: '壁', ceiling: '天井', small: '小物' };

// 家具モデルを生成（model 座標）
export function buildModel(type, toneKey) {
  const def = CATALOG_BY_ID[type];
  const tone = TONES[toneKey] || TONES[def.tone] || TONES.white;
  const r = BUILDERS[type](tone.color);
  // モデル座標でのバウンディングボックス（面の配置には影響しない）
  r.group.updateMatrixWorld(true);
  r.bounds = new THREE.Box3().setFromObject(r.group);
  return r;
}

// マウント種別ごとの、モデル→ホスト面座標の回転
export function mountRotationX(mount) {
  if (mount === 'floor' || mount === 'small') return Math.PI / 2;
  if (mount === 'ceiling') return -Math.PI / 2;
  return 0;
}

// ホスト面座標系での半サイズ（回転前）
export function footprintHalf(mount, bounds) {
  const b = bounds;
  const hx = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
  if (mount === 'wall') return { hx, hy: Math.max(Math.abs(b.min.y), Math.abs(b.max.y)) };
  return { hx, hy: Math.max(Math.abs(b.min.z), Math.abs(b.max.z)) };
}
