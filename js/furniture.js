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
    const ped = carcass(m, 0.42, 0.42, 0.6, 0.28); ped.position.x = 0.4; g.add(ped);
    const parts = [], surfaces = [top('top', 1.28, 0.63, 0.7376, 0, 0, { label: '天板' })];
    [0.285, 0.495].forEach((y, i) => {
      const d = makeDrawer(m, 'drawer' + (i + 1), 0.414, 0.2, 0.36, 0.55, 0.4, y, 0.318, `引き出し${2 - i}`);
      parts.push(d.part); surfaces.push(d.surf); g.add(d.part.obj);
    });
    return { group: g, parts, surfaces };
  },
  chair(t) {
    const m = M(t), g = group(box(0.44, 0.04, 0.42, m, 0, 0.45, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.035, 0.45, 0.035, m, sx * 0.19, 0.225, sz * 0.18));
    g.add(box(0.035, 0.45, 0.035, m, -0.19, 0.69, -0.18), box(0.035, 0.45, 0.035, m, 0.19, 0.69, -0.18));
    g.add(box(0.42, 0.18, 0.025, m, 0, 0.82, -0.185));
    return { group: g, surfaces: [top('seat', 0.42, 0.38, 0.4701, 0, 0.01, { label: '座面' })] };
  },
  stool(t) {
    const m = M(t), g = group(cyl(0.18, 0.18, 0.035, m, 0, 0.62, 0));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const leg = cyl(0.015, 0.018, 0.62, m, Math.cos(a) * 0.12, 0.31, Math.sin(a) * 0.12, 10);
      leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
      g.add(leg);
    }
    return { group: g, surfaces: [top('seat', 0.25, 0.25, 0.6376, 0, 0, { label: '座面' })] };
  },
  sofa(t) {
    const m = M(t), g = group(box(1.8, 0.22, 0.82, m, 0, 0.2, 0));
    g.add(box(1.5, 0.12, 0.66, M(t), 0, 0.37, 0.06));
    g.add(box(1.8, 0.48, 0.18, m, 0, 0.54, -0.32));
    g.add(box(0.15, 0.32, 0.82, m, -0.825, 0.43, 0), box(0.15, 0.32, 0.82, m, 0.825, 0.43, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.04, 0.09, 0.04, M(DARK), sx * 0.84, 0.045, sz * 0.36));
    return {
      group: g, surfaces: [
        top('seat', 1.48, 0.64, 0.4301, 0, 0.06, { label: '座面' }),
        top('armL', 0.14, 0.8, 0.5901, -0.825, 0, { label: 'ひじ掛け' }),
        top('armR', 0.14, 0.8, 0.5901, 0.825, 0, { label: 'ひじ掛け' }),
      ],
    };
  },
  bed(t) {
    const m = M(t), g = group(box(1.1, 0.3, 2.0, m, 0, 0.15, 0));
    g.add(box(1.04, 0.16, 1.94, M(0xfbfbf9), 0, 0.38, 0));
    g.add(box(1.1, 0.5, 0.05, m, 0, 0.55, -0.98));
    g.add(box(0.6, 0.1, 0.32, M(0xffffff), 0, 0.5, -0.72));
    g.add(box(1.06, 0.03, 1.1, M(0xe9e7e2), 0, 0.47, 0.4));
    return { group: g, surfaces: [top('mattress', 1.02, 1.86, 0.4861, 0, 0.02, { label: 'ベッドの上' })] };
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
    const m = M(t), W = 0.8, H = 0.8, D = 0.45;
    const g = group(carcass(m, W, H - 0.04, D, 0.04));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.04, 0.03, M(DARK), sx * 0.36, 0.02, sz * 0.19));
    g.add(box(W - 0.04, 0.02, D - 0.03, m, 0, 0.42, 0.005));
    const zf = D / 2 + 0.018;
    const parts = [makeDoor(m, 'doorL', W / 2 - 0.003, H - 0.044, -W / 2, 0.042, zf, -1), makeDoor(m, 'doorR', W / 2 - 0.003, H - 0.044, W / 2, 0.042, zf, 1)];
    parts.forEach(p => g.add(p.obj));
    return {
      group: g, parts, surfaces: [
        top('top', 0.78, 0.43, 0.8001, 0, 0, { label: '天板' }),
        top('in1', W - 0.06, D - 0.05, 0.0601, 0, 0.01, { label: '中（下段）' }),
        top('in2', W - 0.06, D - 0.05, 0.4301, 0, 0.01, { label: '中（上段）' }),
      ],
    };
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
    flame.scale.y = 1.8; flame.userData.flame = true; g.add(flame);
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
    const m = M(t), W = 0.18, H = 0.1, D = 0.14, g = group();
    g.add(box(W, 0.008, D, m, 0, 0.004, 0));
    g.add(box(W, H, 0.008, m, 0, H / 2, D / 2 - 0.004), box(W, H, 0.008, m, 0, H / 2, -D / 2 + 0.004));
    g.add(box(0.008, H, D - 0.016, m, -W / 2 + 0.004, H / 2, 0), box(0.008, H, D - 0.016, m, W / 2 - 0.004, H / 2, 0));
    const lid = new THREE.Group(); lid.position.set(0, H, -D / 2);
    lid.add(box(W + 0.006, 0.02, D + 0.006, m, 0, 0.01, D / 2));
    g.add(lid);
    const part = { name: 'lid', obj: lid, apply(k) { lid.rotation.x = -k * 1.9; } };
    return {
      group: g, parts: [part], surfaces: [
        { ...top('top', 0.17, 0.13, 0.0201, 0, D / 2, { label: 'ふた' }), parent: 'lid' },
        top('in', W - 0.024, D - 0.024, 0.0081, 0, 0, { label: '箱の中' }),
      ],
    };
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

  // ---------- 開閉できる家具 ----------
  tansu(t) {
    const m = M(t), W = 0.9, D = 0.45;
    const g = group(carcass(m, W, 0.94, D, 0.06), box(W - 0.06, 0.06, D - 0.06, m, 0, 0.03, 0));
    const parts = [], surfaces = [top('top', W - 0.02, D - 0.02, 1.0001, 0, 0, { label: '天板' })];
    [0.07, 0.38, 0.69].forEach((y, i) => {
      const d = makeDrawer(m, 'drawer' + (i + 1), W - 0.006, 0.3, W - 0.06, D - 0.04, 0, y, D / 2 + 0.018, `引き出し${3 - i}`);
      parts.push(d.part); surfaces.push(d.surf); g.add(d.part.obj);
    });
    return { group: g, parts, surfaces };
  },
  nightstand(t) {
    const m = M(t), W = 0.45, D = 0.4;
    const g = group(carcass(m, W, 0.5, D, 0.05));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.03, 0.05, 0.03, m, sx * 0.19, 0.025, sz * 0.16));
    g.add(box(W - 0.04, 0.02, D - 0.03, m, 0, 0.35, 0.005));
    const d = makeDrawer(m, 'drawer1', W - 0.006, 0.165, W - 0.06, D - 0.04, 0, 0.362, D / 2 + 0.018, '引き出し');
    g.add(d.part.obj);
    return {
      group: g, parts: [d.part], surfaces: [
        top('top', W - 0.02, D - 0.02, 0.5501, 0, 0, { label: '天板' }), d.surf,
        top('shelf', W - 0.06, D - 0.05, 0.0701, 0, 0.01, { label: '下の棚' }),
      ],
    };
  },
  wardrobe(t) {
    const m = M(t), W = 1.0, H = 1.9, D = 0.55;
    const g = group(carcass(m, W, H - 0.04, D, 0.04), box(W - 0.06, 0.04, D - 0.06, m, 0, 0.02, 0));
    g.add(box(W - 0.04, 0.02, D - 0.03, m, 0, 1.55, 0.005));
    const rod = cyl(0.012, 0.012, W - 0.06, M(ACCENT), 0, 1.45, 0, 12); rod.rotation.z = Math.PI / 2; g.add(rod);
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Group(); h.position.set(-0.3 + i * 0.2, 1.45, 0);
      h.add(box(0.36, 0.012, 0.012, M(0xd9d4cc), 0, -0.06, 0));
      h.add(box(0.004, 0.06, 0.004, M(ACCENT), 0, -0.03, 0));
      h.rotation.y = Math.PI / 2; g.add(h);
    }
    const zf = D / 2 + 0.018;
    const parts = [makeDoor(m, 'doorL', W / 2 - 0.003, H - 0.044, -W / 2, 0.042, zf, -1), makeDoor(m, 'doorR', W / 2 - 0.003, H - 0.044, W / 2, 0.042, zf, 1)];
    parts.forEach(p => g.add(p.obj));
    return {
      group: g, parts, surfaces: [
        top('top', W - 0.02, D - 0.02, 1.9001, 0, 0, { label: '天板' }),
        top('in1', W - 0.06, D - 0.05, 0.0601, 0, 0.01, { label: '中（下）' }),
        top('in2', W - 0.06, D - 0.05, 1.5601, 0, 0.01, { label: '中（上の棚）' }),
      ],
    };
  },
  storagebox(t) {
    const m = M(t), W = 0.5, H = 0.3, D = 0.36, g = group();
    g.add(box(W, 0.015, D, m, 0, 0.0075, 0));
    g.add(box(W, H, 0.015, m, 0, H / 2, D / 2 - 0.0075), box(W, H, 0.015, m, 0, H / 2, -D / 2 + 0.0075));
    g.add(box(0.015, H, D - 0.03, m, -W / 2 + 0.0075, H / 2, 0), box(0.015, H, D - 0.03, m, W / 2 - 0.0075, H / 2, 0));
    g.add(box(0.12, 0.02, 0.012, M(ACCENT), 0, H - 0.06, D / 2 + 0.006));
    const lid = new THREE.Group(); lid.position.set(0, H, -D / 2);
    lid.add(box(W + 0.01, 0.022, D + 0.01, m, 0, 0.011, D / 2));
    g.add(lid);
    const part = { name: 'lid', obj: lid, apply(k) { lid.rotation.x = -k * 1.95; } };
    return {
      group: g, parts: [part], surfaces: [
        { ...top('top', W - 0.01, D - 0.01, 0.0221, 0, D / 2, { label: 'ふた' }), parent: 'lid' },
        top('in', W - 0.04, D - 0.04, 0.0151, 0, 0, { label: '箱の中' }),
      ],
    };
  },
  wallcabinet(t) {
    const m = M(t), W = 0.8, H = 0.5, D = 0.32;
    const c = carcass(m, W, H, D, -H / 2); c.position.z = D / 2;
    const g = group(c);
    const zf = D + 0.018;
    const parts = [makeDoor(m, 'doorL', W / 2 - 0.003, H - 0.004, -W / 2, -H / 2 + 0.002, zf, -1), makeDoor(m, 'doorR', W / 2 - 0.003, H - 0.004, W / 2, -H / 2 + 0.002, zf, 1)];
    parts.forEach(p => g.add(p.obj));
    return {
      group: g, parts, surfaces: [
        top('top', W - 0.02, D - 0.02, H / 2 + 0.0001, 0, D / 2, { label: '上' }),
        top('in', W - 0.06, D - 0.05, -H / 2 + 0.0201, 0, D / 2 + 0.01, { label: '中' }),
      ],
    };
  },
  notebook(t) {
    const m = M(t), W = 0.17, H = 0.24, g = group();
    const paper = M(0xfdfcf8);
    g.add(box(W, 0.004, H, m, -W / 2, 0.002, 0));
    g.add(box(W - 0.008, 0.012, H - 0.01, paper, -W / 2 + 0.002, 0.01, 0));
    const right = new THREE.Group(); right.position.set(0, 0.016, 0);
    right.add(box(W, 0.004, H, m, W / 2, -0.014, 0));
    right.add(box(W - 0.008, 0.012, H - 0.01, paper, W / 2 - 0.002, -0.006, 0));
    g.add(right);
    g.add(box(0.012, 0.018, H, m, 0, 0.009, 0));
    const part = { name: 'cover', obj: right, apply(k) { right.rotation.z = (1 - k) * Math.PI; } };
    return {
      group: g, parts: [part], defaultOpen: { cover: 1 }, surfaces: [
        top('pageL', W - 0.016, H - 0.02, 0.0161, -W / 2 + 0.002, 0, { label: '左のページ', acceptsSmall: false, hires: true }),
        { ...top('pageR', W - 0.016, H - 0.02, 0.0001, W / 2 - 0.002, 0, { label: '右のページ', acceptsSmall: false, hires: true }), parent: 'cover' },
      ],
    };
  },

  gramophone(t, props) {
    const m = M(t), brass = M(0xc9a35a), dark = M(0x1d1d1f), g = group();
    g.add(box(0.3, 0.12, 0.3, m, 0, 0.06, 0));
    g.add(box(0.31, 0.012, 0.31, m, 0, 0.124, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(sphere(0.012, brass, sx * 0.13, 0.006, sz * 0.13, 8));
    // ターンテーブルとレコード
    const disc = new THREE.Group(); disc.position.set(0, 0.13, 0.01);
    disc.add(cyl(0.125, 0.125, 0.006, dark, 0, 0.003, 0, 40));
    disc.add(cyl(0.035, 0.035, 0.0065, M(0xb8473d), 0, 0.0035, 0, 24));
    disc.add(box(0.005, 0.0068, 0.03, M(0xf2e6c8), 0.012, 0.0036, 0));
    g.add(disc);
    // クランク
    const crank = cyl(0.005, 0.005, 0.08, brass, 0.19, 0.07, 0.05, 8); crank.rotation.z = Math.PI / 2; g.add(crank);
    g.add(sphere(0.012, M(0x5a3c2a), 0.235, 0.07, 0.05, 10));
    // トーンアームとラッパ
    g.add(cyl(0.012, 0.014, 0.05, brass, 0.11, 0.155, -0.11, 12));
    const arm = cyl(0.006, 0.006, 0.12, brass, 0.07, 0.185, -0.06, 8); arm.rotation.set(0.9, 0, 0.5); g.add(arm);
    const neck = cyl(0.012, 0.016, 0.16, brass, 0.11, 0.25, -0.12, 12); neck.rotation.x = -0.25; g.add(neck);
    const pts = [];
    for (let k = 0; k <= 16; k++) { const y = k / 16 * 0.34; pts.push(new THREE.Vector2(0.014 + 0.18 * Math.pow(k / 16, 3.2), y)); }
    const horn = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), M(0xd4ad62, { side: THREE.DoubleSide }));
    const hornG = new THREE.Group(); hornG.position.set(0.11, 0.32, -0.15); hornG.rotation.set(0.95, 0, -0.12);
    hornG.add(horn);
    const mouth = new THREE.Object3D(); mouth.name = 'horn-mouth'; mouth.position.y = 0.34; hornG.add(mouth);
    g.add(hornG);
    g.userData.partName = 'music';
    return {
      group: g, surfaces: [],
      animate(time, dt) {
        if (props && props.track) disc.rotation.y -= (dt || 0.016) * 3.6; // 約 33 回転
      },
    };
  },

  // 水飲み鳥：ゆっくり前後に揺れ、ときどき深くお辞儀して水を飲み、また起き上がる
  drinkingbird(t) {
    const stand = M(t), g = group();
    const red = M(0xd8473f), liquid = M(0xc9322c, { transparent: true, opacity: 0.85 });
    const black = M(0x1e1e20), white = M(0xffffff), beakM = M(0xf2b632), brass = M(0xc9a35a);
    // 台と脚
    g.add(box(0.09, 0.008, 0.06, stand, 0, 0.004, 0));
    for (const sx of [-1, 1]) {
      const leg = box(0.006, 0.12, 0.006, stand, sx * 0.03, 0.064, 0); leg.rotation.z = sx * 0.12; g.add(leg);
    }
    g.add(box(0.07, 0.004, 0.004, brass, 0, 0.122, 0)); // 支点の軸
    // 揺れる本体（支点まわりに回る）
    const body = new THREE.Group(); body.position.set(0, 0.122, 0); g.add(body);
    // 下の球（赤い液体）とガラス管
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), liquid); bulb.position.y = -0.07; body.add(bulb);
    const bulbGlass = new THREE.Mesh(new THREE.SphereGeometry(0.0235, 24, 16), glassMaterial()); bulbGlass.position.y = -0.07; bulbGlass.renderOrder = 2; body.add(bulbGlass);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.16, 12), glassMaterial()); tube.position.y = 0.01; tube.renderOrder = 2; body.add(tube);
    const level = cyl(0.0038, 0.0038, 0.07, liquid, 0, -0.035, 0, 10); body.add(level);
    // 頭（赤いフェルト）
    const head = new THREE.Group(); head.position.y = 0.105; body.add(head);
    head.add(sphere(0.022, red, 0, 0, 0, 24));
    // くちばし
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.034, 14), beakM);
    beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.004, 0.034); head.add(beak);
    // 目（白目と黒目、少し外側を向く）
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group(); eye.position.set(sx * 0.0108, 0.006, 0.0172); eye.rotation.y = sx * 0.42; head.add(eye);
      eye.add(sphere(0.0078, white, 0, 0, 0, 18));
      eye.add(sphere(0.0039, black, 0, 0.0004, 0.0058, 14));
      eye.add(sphere(0.0012, white, 0.0013, 0.0019, 0.0092, 8)); // ハイライト
    }
    // シルクハット（つば・帽子・リボン）
    const hat = new THREE.Group(); hat.position.y = 0.019; hat.rotation.z = -0.08; head.add(hat);
    hat.add(cyl(0.025, 0.025, 0.003, black, 0, 0.0015, 0, 28));
    hat.add(cyl(0.0145, 0.0155, 0.026, black, 0, 0.016, 0, 24));
    hat.add(cyl(0.0157, 0.0158, 0.005, M(0xb3302a), 0, 0.0055, 0, 24));
    // セットのコップ：深くお辞儀したとき、くちばしの先がちょうどコップの中に入る位置
    const cup = waterGlass(); cup.position.set(0, 0, 0.108); g.add(cup);
    g.userData.birdBody = body;
    const off = Math.random() * 9;
    const P = 9;
    return {
      group: g, surfaces: [],
      animate(time) {
        const u = (time + off) % P;
        let a;
        // なめらかに動くよう、つなぎ目で角度も速さも急に変わらない曲線にしている
        const smooth = k => k * k * (3 - 2 * k);
        const lean = u0 => 0.55 * smooth(u0 / 5.5) + Math.sin(u0 * 2 * Math.PI / 1.15) * (0.1 + 0.05 * u0 / 5.5) * Math.min(1, u0 / 1.2);
        if (u < 5.5) a = lean(u);                                                     // だんだん深く揺れる
        else if (u < 6.4) { const a0 = lean(5.5); a = a0 + (1.38 - a0) * smooth((u - 5.5) / 0.9); } // 水を飲む
        else if (u < 7.0) a = 1.38 + Math.sin((u - 6.4) / 0.6 * Math.PI) * 0.015;     // 少しとどまる
        else { // 起き上がって揺れながら止まる（動き出しの速さが 0 になるようにした減衰振動）
          const tau = u - 7.0, z = 2.3, w = 4.6;
          a = 1.38 * Math.exp(-z * tau) * (Math.cos(w * tau) + (z / w) * Math.sin(w * tau)) * (1 - smooth(Math.max(0, tau - 1.6) / 0.4));
        }
        body.rotation.x = a;
      },
    };
  },
  glass() { return { group: group(waterGlass()), surfaces: [] }; },

  // ---------- 機能のある小物・壁の物 ----------
  monitor(t) {
    const m = M(t), g = group(box(0.2, 0.012, 0.13, m, 0, 0.006, 0));
    g.add(box(0.035, 0.2, 0.02, m, 0, 0.11, -0.03));
    g.add(box(0.58, 0.36, 0.025, m, 0, 0.36, -0.01));
    g.add(screenMesh(0.55, 0.33, 0, 0.36, 0.0035));
    return { group: g, surfaces: [face('screen', 0.55, 0.33, 0, 0.36, 0.0046, { label: '画面', hires: true })] };
  },
  wallmonitor(t) { return wallMonitor(t, 0.96, 0.54); },
  wallmonitorL(t) { return wallMonitor(t, 1.68, 0.945); },
  nameplate(t) {
    const m = M(t), g = group(box(0.24, 0.014, 0.07, m, 0, 0.007, 0));
    const plate = new THREE.Group(); plate.position.set(0, 0.014, 0.01); plate.rotation.x = -0.45;
    plate.add(box(0.23, 0.075, 0.008, m, 0, 0.0375, 0));
    plate.add(box(0.215, 0.06, 0.002, M(0xfcfcfa), 0, 0.0375, 0.005));
    g.add(plate);
    const c = Math.cos(-0.45), s = Math.sin(-0.45);
    const ly = 0.0375, lz = 0.0061;
    return { group: g, surfaces: [{ ...face('front', 0.215, 0.06, 0, 0.014 + ly * c - lz * s, 0.01 + ly * s + lz * c, { label: 'プレート', hires: true }), rot: [-0.45, 0, 0] }] };
  },
  crystal(t) {
    const g = group(cyl(0.05, 0.065, 0.035, M(t), 0, 0.0175, 0, 32));
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 10, 32), M(t)));
    g.children[1].rotation.x = Math.PI / 2; g.children[1].position.y = 0.038;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.075, 40, 28), glassMaterial());
    glass.position.y = 0.11; glass.renderOrder = 2; g.add(glass);
    const core = sphere(0.03, M(0xffffff, { emissive: 0xb8a6e6, emissiveIntensity: 0.45, transparent: true, opacity: 0.55 }), 0, 0.11, 0, 20);
    g.add(core);
    return { group: g, surfaces: [], animate(time) { core.scale.setScalar(1 + Math.sin(time * 1.3) * 0.12); } };
  },
  key(t) {
    const brass = M(0xc8a659), g = group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 28), brass);
    ring.rotation.x = Math.PI / 2; ring.position.set(-0.05, 0.006, 0); g.add(ring);
    g.add(box(0.08, 0.008, 0.01, brass, 0.008, 0.005, 0));
    g.add(box(0.01, 0.008, 0.022, brass, 0.04, 0.005, 0.012), box(0.008, 0.008, 0.016, brass, 0.025, 0.005, 0.009));
    return { group: g, surfaces: [] };
  },
  calendar(t, props) {
    const g = group(box(0.42, 0.6, 0.004, M(0xffffff), 0, 0, 0.002));
    g.add(box(0.42, 0.035, 0.012, M(t), 0, 0.283, 0.006));
    for (const sx of [-1, 1]) g.add(cyl(0.006, 0.006, 0.03, M(ACCENT), sx * 0.12, 0.3, 0.008, 8));
    const tex = calendarTexture(props.month || currentMonth());
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.54), new THREE.MeshLambertMaterial({ map: tex }));
    page.position.set(0, -0.02, 0.0042); g.add(page);
    return { group: g, surfaces: [face('page', 0.4, 0.54, 0, -0.02, 0.0045, { label: 'カレンダー', hires: true })] };
  },
  chalkboard(t) {
    const m = M(t), g = group(box(1.6, 0.95, 0.03, m, 0, 0, 0.015));
    g.add(box(1.52, 0.87, 0.01, M(0x2f463c), 0, 0, 0.032));
    g.add(box(0.8, 0.025, 0.06, m, 0, -0.47, 0.05));
    g.add(box(0.06, 0.012, 0.012, M(0xfafafa), -0.2, -0.452, 0.05), box(0.06, 0.012, 0.012, M(0xf2c9c4), -0.1, -0.452, 0.05));
    return { group: g, surfaces: [face('front', 1.52, 0.87, 0, 0, 0.0371, { label: '黒板' })] };
  },
};

// 中が空洞の箱（側板・天板・底板・背板）
function carcass(m, W, H, D, y0 = 0) {
  const g = new THREE.Group(), t = 0.02;
  g.add(box(t, H, D, m, -W / 2 + t / 2, y0 + H / 2, 0), box(t, H, D, m, W / 2 - t / 2, y0 + H / 2, 0));
  g.add(box(W, t, D, m, 0, y0 + H - t / 2, 0));
  g.add(box(W - 2 * t, t, D - 0.01, m, 0, y0 + t / 2, 0.005));
  g.add(box(W - 2 * t, H - 2 * t, 0.01, m, 0, y0 + H / 2, -D / 2 + 0.005));
  return g;
}

// 引き出し（y は前板の下端、zFront は前板の手前の面）
function makeDrawer(m, name, fw, fh, bw, bd, x, y, zFront, label) {
  const g = new THREE.Group(); g.position.set(x, y, zFront);
  g.add(box(fw, fh, 0.018, m, 0, fh / 2, -0.009));
  const ih = fh * 0.72, zc = -0.018 - bd / 2;
  g.add(box(bw, 0.01, bd, m, 0, 0.015, zc));
  g.add(box(0.008, ih, bd, m, -bw / 2 + 0.004, 0.01 + ih / 2, zc), box(0.008, ih, bd, m, bw / 2 - 0.004, 0.01 + ih / 2, zc));
  g.add(box(bw, ih, 0.008, m, 0, 0.01 + ih / 2, -0.018 - bd + 0.004));
  g.add(box(Math.min(0.16, fw * 0.35), 0.014, 0.02, M(ACCENT), 0, fh / 2, 0.01));
  const part = { name, obj: g, apply(k) { g.position.z = zFront + k * bd * 0.78; } };
  const surf = { ...top(name + '_in', bw - 0.03, bd - 0.03, 0.0201, 0, zc, { label }), parent: name };
  return { part, surf };
}

// 扉（side: -1 = 左に蝶番, 1 = 右に蝶番）
function makeDoor(m, name, w, h, hingeX, y, zFront, side) {
  const p = new THREE.Group(); p.position.set(hingeX, y, zFront);
  p.add(box(w, h, 0.018, m, -side * w / 2, h / 2, -0.009));
  p.add(box(0.014, Math.min(0.14, h * 0.3), 0.02, M(ACCENT), -side * (w - 0.045), h / 2, 0.01));
  return { name, obj: p, apply(k) { p.rotation.y = side * k * 1.75; } };
}

let glassMat = null;
function glassMaterial() {
  if (!glassMat) glassMat = new THREE.MeshPhongMaterial({ color: 0xe6ecf8, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.32, depthWrite: false });
  return glassMat;
}

// カレンダーの月のページ（'YYYY-MM'）
const calTexCache = new Map();
function calendarTexture(month) {
  if (calTexCache.has(month)) return calTexCache.get(month);
  const [Y, Mo] = month.split('-').map(Number);
  const c = document.createElement('canvas'); c.width = 800; c.height = 1080;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 800, 1080);
  const font = '"Zen Kaku Gothic New", "Hiragino Sans", sans-serif';
  x.fillStyle = '#2b2b2e'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `500 44px ${font}`; x.fillText(`${Y}年`, 400, 70);
  x.font = `500 110px ${font}`; x.fillText(`${Mo}月`, 400, 170);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const cw = 108, gx = 400 - cw * 3.5, gy = 300, rh = 125;
  x.font = `500 30px ${font}`;
  days.forEach((d, i) => { x.fillStyle = i === 0 ? '#c9453d' : i === 6 ? '#3a6fc4' : '#888'; x.fillText(d, gx + cw * (i + 0.5), gy - 30); });
  const first = new Date(Y, Mo - 1, 1).getDay(), n = new Date(Y, Mo, 0).getDate();
  const now = new Date();
  x.strokeStyle = '#e4e4e6'; x.lineWidth = 2;
  for (let r = 0; r <= 6; r++) { x.beginPath(); x.moveTo(gx, gy + r * rh); x.lineTo(gx + cw * 7, gy + r * rh); x.stroke(); }
  x.font = `500 36px ${font}`; x.textAlign = 'left'; x.textBaseline = 'top';
  for (let d = 1; d <= n; d++) {
    const i = first + d - 1, col = i % 7, row = Math.floor(i / 7);
    const px = gx + col * cw + 10, py = gy + row * rh + 10;
    if (now.getFullYear() === Y && now.getMonth() + 1 === Mo && now.getDate() === d) {
      x.fillStyle = '#f1f1f3'; x.fillRect(gx + col * cw + 2, gy + row * rh + 2, cw - 4, rh - 4);
    }
    x.fillStyle = col === 0 ? '#c9453d' : col === 6 ? '#3a6fc4' : '#2b2b2e';
    x.fillText(String(d), px, py);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  calTexCache.set(month, tex);
  return tex;
}

export function currentMonth(offset = 0, from = null) {
  const d = from ? new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1 + offset, 1) : new Date();
  if (!from && offset) d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 水の入ったガラスのコップ
function waterGlass() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.11, 32, 1, true), glassMaterial());
  outer.position.y = 0.055; outer.renderOrder = 2; g.add(outer);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 32), glassMaterial()); bottom.position.y = 0.004; bottom.renderOrder = 2; g.add(bottom);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0295, 0.072, 32), M(0x9fcfee, { transparent: true, opacity: 0.45, depthWrite: false }));
  water.position.y = 0.044; water.renderOrder = 1; g.add(water);
  return g;
}

// モニターの画面（宮殿の情報を映す。表示は monitors.js が描く）
function screenMesh(w, h, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x15171a }));
  m.position.set(x, y, z); m.name = 'screen-display';
  return m;
}

function wallMonitor(t, W, H) {
  const m = M(t), g = group();
  const bez = 0.018, d = 0.035;
  g.add(box(W * 0.3, H * 0.4, 0.02, M(DARK), 0, 0, 0.01)); // 壁の金具
  g.add(box(W + bez * 2, H + bez * 2, d, m, 0, 0, 0.02 + d / 2));
  g.add(screenMesh(W, H, 0, 0, 0.02 + d + 0.0006));
  g.add(box(0.05, 0.008, 0.006, M(0x9fd59a, { emissive: 0x6fcf6a, emissiveIntensity: 0.6 }), W / 2 - 0.04, -H / 2 - bez / 2, 0.02 + d + 0.001)); // 電源ランプ
  return { group: g, surfaces: [face('screen', W, H, 0, 0, 0.02 + d + 0.0012, { label: '画面', hires: true })] };
}

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
  { id: 'desk', name: 'デスク', mount: 'floor', tone: 'oak', collide: true, note: '引き出しが開く' },
  { id: 'chair', name: '椅子', mount: 'floor', tone: 'oak', collide: true, note: '上に置ける' },
  { id: 'stool', name: 'スツール', mount: 'floor', tone: 'white', collide: true, note: '上に置ける' },
  { id: 'sofa', name: 'ソファ', mount: 'floor', tone: 'gray', collide: true, note: '上に置ける' },
  { id: 'bed', name: 'ベッド', mount: 'floor', tone: 'oak', collide: true, note: '上に置ける' },
  { id: 'bookshelf', name: '本棚', mount: 'floor', tone: 'white', collide: true, note: '小物を置ける' },
  { id: 'cabinet', name: 'キャビネット', mount: 'floor', tone: 'white', collide: true, note: '扉が開く・中に入れられる' },
  { id: 'tansu', name: 'タンス', mount: 'floor', tone: 'oak', collide: true, note: '引き出しが開く' },
  { id: 'nightstand', name: 'ナイトテーブル', mount: 'floor', tone: 'white', collide: true, note: '引き出しが開く' },
  { id: 'wardrobe', name: 'クローゼット', mount: 'floor', tone: 'white', collide: true, note: '扉が開く・中に入れられる' },
  { id: 'storagebox', name: '収納ボックス', mount: 'floor', tone: 'oak', collide: true, note: 'ふたが開く' },
  { id: 'pedestal', name: '台座', mount: 'floor', tone: 'white', collide: true, note: '描ける・飾れる' },
  { id: 'standboard', name: 'スタンドボード', mount: 'floor', tone: 'white', collide: true, note: '両面に描ける' },
  { id: 'floorlamp', name: 'フロアランプ', mount: 'floor', tone: 'white', collide: true, note: 'タップで点灯・消灯' },
  { id: 'plant', name: '観葉植物', mount: 'floor', tone: 'white', collide: true },
  { id: 'rug', name: 'ラグ', mount: 'floor', tone: 'white', collide: false, note: '描ける・飾れる' },

  { id: 'frameS', name: '額縁（小）', mount: 'wall', tone: 'oak', note: '描ける・写真' },
  { id: 'frameP', name: '額縁（縦）', mount: 'wall', tone: 'black', note: '描ける・写真' },
  { id: 'frameL', name: '額縁（大）', mount: 'wall', tone: 'white', note: '描ける・写真' },
  { id: 'board', name: 'コルクボード', mount: 'wall', tone: 'oak', note: '描ける・写真' },
  { id: 'whiteboard', name: 'ホワイトボード', mount: 'wall', tone: 'gray', note: '描ける・写真' },
  { id: 'wallshelf', name: '壁棚', mount: 'wall', tone: 'oak', note: '小物を置ける' },
  { id: 'wallmonitor', name: '壁掛けモニター', mount: 'wall', tone: 'black', note: '宮殿の情報を表示' },
  { id: 'wallmonitorL', name: '大型モニター', mount: 'wall', tone: 'black', note: '宮殿の情報を表示' },
  { id: 'wallcabinet', name: '吊り戸棚', mount: 'wall', tone: 'white', note: '扉が開く・中に入れられる' },
  { id: 'calendar', name: 'カレンダー', mount: 'wall', tone: 'oak', note: '予定を書ける' },
  { id: 'chalkboard', name: '黒板', mount: 'wall', tone: 'oak', note: '描ける・写真' },
  { id: 'clock', name: '時計', mount: 'wall', tone: 'white' },
  { id: 'walllamp', name: '壁ランプ', mount: 'wall', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'window', name: '窓', mount: 'wall', tone: 'white', note: '描ける' },
  { id: 'hooks', name: 'フック', mount: 'wall', tone: 'oak' },

  { id: 'pendant', name: 'ペンダントライト', mount: 'ceiling', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'ceilinglight', name: 'シーリングライト', mount: 'ceiling', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'globe', name: 'グローブライト', mount: 'ceiling', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'fan', name: 'シーリングファン', mount: 'ceiling', tone: 'white' },
  { id: 'sign', name: '吊り看板', mount: 'ceiling', tone: 'oak', note: '両面に描ける' },

  { id: 'gramophone', name: 'グラモフォン', mount: 'small', tone: 'walnut', note: '音楽を再生できる' },
  { id: 'drinkingbird', name: '水飲み鳥', mount: 'small', tone: 'oak', note: 'コップとセット・ずっと動いている' },
  // 単体のコップは以前の宮殿を開くためだけに残す（カタログには出さない）
  { id: 'glass', name: 'コップ', mount: 'small', tone: 'white', hidden: true },
  { id: 'vase', name: '花瓶', mount: 'small', tone: 'white' },
  { id: 'cup', name: 'カップ', mount: 'small', tone: 'white' },
  { id: 'books', name: '本', mount: 'small', tone: 'walnut' },
  { id: 'candle', name: 'キャンドル', mount: 'small', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'succulent', name: '小さな植物', mount: 'small', tone: 'white' },
  { id: 'smallbox', name: '小箱', mount: 'small', tone: 'oak', note: 'ふたが開く・中に入れられる' },
  { id: 'orb', name: '球のオブジェ', mount: 'small', tone: 'gray' },
  { id: 'crystal', name: '水晶玉', mount: 'small', tone: 'walnut' },
  { id: 'notebook', name: 'ノート', mount: 'small', tone: 'walnut', note: '開閉・ページに書ける' },
  { id: 'monitor', name: 'モニター', mount: 'small', tone: 'black', note: '宮殿の情報を表示' },
  { id: 'nameplate', name: 'ネームプレート', mount: 'small', tone: 'oak', note: '書ける' },
  { id: 'key', name: '鍵', mount: 'small', tone: 'oak' },
  { id: 'photostand', name: 'フォトスタンド', mount: 'small', tone: 'oak', note: '描ける・写真' },
  { id: 'desklamp', name: 'デスクランプ', mount: 'small', tone: 'white', note: 'タップで点灯・消灯' },
  { id: 'clockS', name: '置き時計', mount: 'small', tone: 'walnut' },
];
export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map(c => [c.id, c]));

export const MOUNT_NAMES = { floor: '床', wall: '壁', ceiling: '天井', small: '小物' };

// 家具モデルを生成（model 座標）
export function buildModel(type, toneKey, props = {}) {
  const def = CATALOG_BY_ID[type];
  const tone = TONES[toneKey] || TONES[def.tone] || TONES.white;
  // props は家具の状態（実物では保存される state そのもの。アニメーションから参照する）
  const r = BUILDERS[type](tone.color, props);
  r.parts = r.parts || [];
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
