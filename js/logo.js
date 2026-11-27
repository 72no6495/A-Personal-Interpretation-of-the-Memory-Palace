// タイトル画面のロゴ：ゆっくり回りながら水を飲む水飲み鳥
import * as THREE from './lib/three.module.min.js';
import { buildModel } from './furniture.js';

export class TitleLogo {
  constructor(container) {
    this.container = container;
    const size = 150;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch { return; } // WebGL が使えないときは何も表示しない
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(size, size);
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 2.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.3); d.position.set(1, 2, 3); this.scene.add(d);
    const built = buildModel('drinkingbird', 'oak');
    this.bird = built;
    this.pivot = new THREE.Group();
    const box = built.bounds, c = box.getCenter(new THREE.Vector3());
    built.group.position.set(-c.x, -c.y, -c.z);
    this.pivot.add(built.group);
    this.scene.add(this.pivot);
    const h = box.getSize(new THREE.Vector3()).y;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const dist = (h * 0.56) / Math.tan(THREE.MathUtils.degToRad(15));
    this.camera.position.set(0, h * 0.12, dist);
    this.camera.lookAt(0, h * 0.02, 0);
    this.clock = new THREE.Clock();
  }

  // タイトル画面が見えているあいだだけ描く
  update(visible) {
    if (!this.renderer || !visible) return;
    const t = this.clock.getElapsedTime();
    this.pivot.rotation.y = t * 0.35;
    if (this.bird.animate) this.bird.animate(t);
    this.renderer.render(this.scene, this.camera);
  }
}
