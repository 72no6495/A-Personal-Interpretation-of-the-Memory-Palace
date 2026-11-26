// プレイヤー（一人称カメラ・移動・当たり判定）
import * as THREE from './lib/three.module.min.js';
import { ROOM } from './world.js';
import { settings } from './settings.js';
import { sfx } from './audio.js';

const EYE = 1.6;
const RADIUS = 0.28;
const SPEED = 2.4;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, EYE, 2.4);
    this.vel = new THREE.Vector3();
    this.yaw = 0;    // 0 = -Z 方向
    this.pitch = 0;
    this.move = { x: 0, y: 0 }; // x: 右, y: 前
    this.stepDist = 0;
    this.bob = 0;
    this.eyeOffset = 0; // 降り立つ演出
    this.zoom = 1;
    this.zoomTarget = 1;
    this.frozen = false;
    this.camera.rotation.order = 'YXZ';
    this.apply();
  }

  set(state) {
    if (!state) return;
    this.pos.set(state.x ?? 0, EYE, state.z ?? 2.4);
    this.yaw = state.yaw ?? 0;
    this.pitch = state.pitch ?? 0;
    this.apply();
  }

  state() {
    return { x: round(this.pos.x), z: round(this.pos.z), yaw: round(this.yaw), pitch: round(this.pitch) };
  }

  look(dx, dy) {
    dx /= this.zoom; dy /= this.zoom;
    this.yaw -= dx;
    this.pitch -= dy * (settings.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    this.apply();
  }

  // 面の法線の逆向きを見る
  faceDirection(dir, animate = true) {
    const yaw = Math.atan2(-dir.x, -dir.z);
    const horiz = Math.hypot(dir.x, dir.z);
    let pitch = Math.atan2(dir.y, horiz);
    const lim = Math.PI / 2 - 0.01;
    pitch = Math.max(-lim, Math.min(lim, pitch));
    if (Math.abs(dir.y) > 0.98) {
      this.turn = { yaw: this.yaw, pitch, t: 0, fromYaw: this.yaw, fromPitch: this.pitch };
    } else {
      let dy = yaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.turn = { yaw: this.yaw + dy, pitch, t: 0, fromYaw: this.yaw, fromPitch: this.pitch };
    }
    if (!animate) { this.yaw = this.turn.yaw; this.pitch = this.turn.pitch; this.turn = null; this.apply(); }
  }

  update(dt, colliders) {
    if (this.turn) {
      this.turn.t = Math.min(1, this.turn.t + dt * 3.5);
      const k = easeInOut(this.turn.t);
      this.yaw = this.turn.fromYaw + (this.turn.yaw - this.turn.fromYaw) * k;
      this.pitch = this.turn.fromPitch + (this.turn.pitch - this.turn.fromPitch) * k;
      if (this.turn.t >= 1) this.turn = null;
    }
    const speed = SPEED * settings.moveSpeed;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = this.move.x, my = this.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (this.frozen) { mx = 0; my = 0; }
    const tvx = (fx * my + rx * mx) * speed;
    const tvz = (fz * my + rz * mx) * speed;
    const k = 1 - Math.exp(-dt * 12);
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.z += (tvz - this.vel.z) * k;

    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide(colliders);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (moved > 0.0005) {
      this.stepDist += moved;
      this.bob += moved * 6.5;
      if (this.stepDist > 0.62) { this.stepDist = 0; sfx.step(); }
    } else {
      this.bob *= 0.9;
    }
    this.eyeOffset *= Math.exp(-dt * 1.6);
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 10));
    const fov = settings.fov / this.zoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.apply();
  }

  collide(colliders) {
    const lim = (v, m) => Math.max(-m, Math.min(m, v));
    this.pos.x = lim(this.pos.x, ROOM.W / 2 - RADIUS);
    this.pos.z = lim(this.pos.z, ROOM.D / 2 - RADIUS);
    for (const b of colliders) {
      const cx = Math.max(b.min.x, Math.min(this.pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(this.pos.z, b.max.z));
      const dx = this.pos.x - cx, dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < RADIUS * RADIUS) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          this.pos.x = cx + dx / d * RADIUS;
          this.pos.z = cz + dz / d * RADIUS;
        } else {
          // 中に入り込んだ場合は一番近い辺へ押し出す
          const opts = [
            [b.min.x - RADIUS - this.pos.x, 0], [b.max.x + RADIUS - this.pos.x, 0],
            [0, b.min.z - RADIUS - this.pos.z], [0, b.max.z + RADIUS - this.pos.z],
          ].sort((a, c) => Math.hypot(...a) - Math.hypot(...c));
          this.pos.x += opts[0][0]; this.pos.z += opts[0][1];
        }
      }
    }
    this.pos.x = lim(this.pos.x, ROOM.W / 2 - RADIUS);
    this.pos.z = lim(this.pos.z, ROOM.D / 2 - RADIUS);
  }

  apply() {
    const bobY = Math.sin(this.bob) * 0.018 * Math.min(1, Math.hypot(this.vel.x, this.vel.z));
    this.camera.position.set(this.pos.x, EYE + bobY + this.eyeOffset, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

function round(v) { return Math.round(v * 1000) / 1000; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
