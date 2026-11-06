// Third-Person-Kamera mit Kollision, Verfolgung und Kinomodus
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, damp, dampAngle, lerp, rand } from './utils.js';

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI; this.pitch = -0.2;
    this.dist = 4.5;
    this.curDist = 4.5;
    this.pos = new THREE.Vector3(0, 10, 0);
    this.target = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.dir = new THREE.Vector3(0, 0, 1);
    this.shakeAmt = 0;
    this.userT = 0;
    this.fov = 65;
    this.cine = null;
    this.carView = 0;
    this._v = new THREE.Vector3();
  }
  shake(a) { this.shakeAmt = Math.min(1.5, Math.max(this.shakeAmt, a)); }
  kick(a) { this.pitch = clamp(this.pitch + a, -1.3, 0.7); }
  snap() { this.snapNext = true; }

  // Kinomodus: Kamera von Position aus auf Ziel
  setCine(from, look, dur = 0, to = null) { this.cine = { from: from.clone(), to: (to || from).clone(), look: look.clone(), t: 0, dur }; }
  clearCine() { this.cine = null; this.snap(); }

  update(dt) {
    const I = G.input, P = G.player, cam = this.cam;
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = c.dur > 0 ? clamp(c.t / c.dur, 0, 1) : 0;
      const e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(c.from, c.to, e);
      cam.lookAt(c.look);
      this.fov = damp(this.fov, 55, 3, dt);
      cam.fov = this.fov; cam.updateProjectionMatrix();
      this.updateVectors();
      return;
    }
    const sens = G.settings.sensitivity * (G.isTouch ? 1.6 : 1);
    if (I.lookDX || I.lookDY) {
      this.yaw -= I.lookDX * 0.0028 * sens;
      this.pitch -= I.lookDY * 0.0024 * sens * (G.settings.invertY ? -1 : 1);
      this.userT = G.isTouch ? 2.2 : 1.4;
    }
    this.userT -= dt;
    if (I.pressed('camera') && P.inCar) this.carView = (this.carView + 1) % 3;
    let tx, ty, tz, dist, minPitch = -1.25, maxPitch = 0.55;
    let fovT = 65;
    if (P.inCar) {
      const v = P.vehicle;
      const sp = v.speed;
      tx = v.x; ty = v.y + 1.3 + (this.carView === 1 ? 1 : 0); tz = v.z;
      dist = (v.T.L * 0.9 + 3.6) * (this.carView === 1 ? 1.5 : 1) + Math.min(2.5, sp * 0.05);
      if (this.carView === 2) { dist = 0.5; ty = v.y + v.height * 0.8 + 0.1; }
      if (this.userT <= 0 && (sp > 1.5 || this.carView === 2)) {
        const back = v.fwdSpeed < -2 ? v.h + Math.PI : v.h;
        this.yaw = dampAngle(this.yaw, back, this.carView === 2 ? 12 : 3, dt);
        this.pitch = damp(this.pitch, this.carView === 2 ? -0.05 : -0.2, 2, dt);
      }
      fovT = 66 + Math.min(16, sp * 0.28);
      maxPitch = 0.3;
    } else {
      tx = P.x; ty = P.y + 1.55; tz = P.z;
      const aiming = P.anim.aim && !G.isTouch;
      dist = aiming ? 2.4 : (P.state === 'swim' ? 5 : 4.4);
      if (P.state === 'dead' || P.state === 'busted') dist = 6;
      if (aiming) {
        // Schulterkamera
        const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        tx += rx * 0.55; tz += rz * 0.55; ty += 0.1;
        fovT = 55;
      }
      const sp = Math.hypot(P.vx, P.vz);
      if (this.userT <= 0 && sp > 1 && G.isTouch) this.yaw = dampAngle(this.yaw, P.yaw, 0.9, dt);
    }
    this.pitch = clamp(this.pitch, minPitch, maxPitch);
    this.target.set(tx, ty, tz);
    const cp = Math.cos(this.pitch);
    const fx = Math.sin(this.yaw) * cp, fy = Math.sin(this.pitch), fz = Math.cos(this.yaw) * cp;
    // Kollision
    let d = dist;
    const t = G.world.rayWorld(tx, ty, tz, -fx, -fy, -fz, dist + 0.3);
    if (t >= 0) d = Math.max(0.6, t - 0.35);
    if (d < this.curDist || this.snapNext) this.curDist = d; else this.curDist = damp(this.curDist, d, 3, dt);
    let px = tx - fx * this.curDist, py = ty - fy * this.curDist, pz = tz - fz * this.curDist;
    const gy = G.world.groundHeight(px, pz);
    if (py < gy + 0.35) py = gy + 0.35;
    if (this.snapNext) { this.pos.set(px, py, pz); this.snapNext = false; }
    else {
      const k = P.inCar ? 14 : 18;
      this.pos.x = damp(this.pos.x, px, k, dt); this.pos.y = damp(this.pos.y, py, k, dt); this.pos.z = damp(this.pos.z, pz, k, dt);
    }
    cam.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.35;
      cam.position.x += rand(-s, s); cam.position.y += rand(-s, s); cam.position.z += rand(-s, s);
      this.shakeAmt = damp(this.shakeAmt, 0, 5, dt);
    }
    this._v.set(cam.position.x + fx * 10, cam.position.y + fy * 10, cam.position.z + fz * 10);
    cam.lookAt(this._v);
    this.fov = damp(this.fov, fovT, 4, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
    this.updateVectors();
  }

  updateVectors() {
    this.cam.getWorldDirection(this.dir);
    this.forward.set(this.dir.x, 0, this.dir.z);
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, 1);
    this.forward.normalize();
  }

  // Titelbildschirm-Kamera: Flug über die Stadt
  attract(dt, t) {
    const a = t * 0.035;
    const r = 260;
    const cam = this.cam;
    cam.position.set(Math.cos(a) * r + 60, 75 + Math.sin(t * 0.1) * 15, Math.sin(a) * r);
    cam.lookAt(40, 25, 0);
    cam.fov = 60; cam.updateProjectionMatrix();
    this.updateVectors();
  }
}
