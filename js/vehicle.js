// Fahrzeuge: Arcade-Physik, Schaden, Rendering von Rädern/Schatten/Lichtkegeln
import * as THREE from 'three';
import { G } from './state.js';
import { CAR_TYPES, CAR_MATS, buildCar, wheelGeometry } from './models.js';
import { vehVsBox, vehVsVeh, circleVsVeh } from './physics.js';
import { clamp, damp, lerp, rand } from './utils.js';
import { WATER_Y } from './config.js';

let VID = 1;
const _b = [], _c = [];

export class Vehicle {
  constructor(key, x, z, h, color) {
    const T = CAR_TYPES[key];
    this.id = VID++;
    this.key = key; this.T = T;
    const m = buildCar(key, color);
    this.group = m.group; this.parts = m.parts; this.geo = m.geo;
    this.color = m.parts.body.material.color.getHex();
    G.scene.add(this.group);
    this.x = x; this.z = z; this.h = h;
    this.y = G.world.groundHeight(x, z);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.hl = T.L / 2; this.hw = T.W / 2; this.height = m.geo.height;
    this.mass = T.mass;
    this.steer = 0; this.spin = 0;
    this.health = T.hp; this.maxHealth = T.hp;
    this.alive = true; this.onFire = false; this.burn = 0; this.sinking = false; this.sinkT = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, noReverse: false };
    this.driver = null;      // 'player' | ped
    this.ai = null;
    this.police = !!T.police;
    this.siren = false;
    this.grounded = true; this.airTime = 0; this.airStartX = 0; this.airStartZ = 0; this.maxAirY = 0;
    this.pitch = 0; this.roll = 0; this.lastVf = 0; this.slip = 0; this.yawRate = 0;
    this.parked = false;
    this.persistent = false;   // Missionsfahrzeug: nicht despawnen
    this.lastHitBy = null;
    this.smokeT = 0;
    this.braking = false;
    this.horn = 0;
    this.removed = false;
    this.lastImpact = 0;
    this.updateVisual(0);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }

  update(dt) {
    const T = this.T, inp = this.input, W = G.world;
    if (this.sinking) {
      this.sinkT += dt;
      this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt);
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.y = Math.max(this.y - dt * 0.7, WATER_Y - 3.5);
      this.pitch = damp(this.pitch, 0.25, 1, dt);
      return;
    }
    let fx = Math.sin(this.h), fz = Math.cos(this.h);
    let lx = fz, lz = -fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * lx + this.vz * lz;
    const drive = this.alive && this.grounded;
    const sand = W.surfaceAt(this.x, this.z) === 'sand';
    const maxSteer = T.steer / (1 + Math.abs(vf) / 24);
    this.steer = damp(this.steer, (this.alive ? inp.steer : 0) * maxSteer, 9, dt);
    this.braking = false;
    if (drive) {
      const thr = inp.throttle, brk = inp.brake;
      const top = T.maxSpeed * (sand ? 0.6 : 1);
      if (thr > 0) {
        if (vf < -0.5) { vf += T.brake * thr * dt; this.braking = true; }
        else { const f = clamp(1 - vf / top, 0, 1); vf += T.accel * thr * (0.3 + 0.7 * f) * dt; }
      }
      if (brk > 0) {
        if (vf > 0.5) { vf -= T.brake * brk * dt; this.braking = true; }
        else if (!inp.noReverse) { if (vf > -top * 0.3) vf -= T.accel * 0.6 * brk * dt; }
        else { vf = damp(vf, 0, 8, dt); this.braking = true; }
      }
      if (thr === 0 && brk === 0) vf -= Math.sign(vf) * Math.min(Math.abs(vf), (1.2 + Math.abs(vf) * 0.15) * dt);
      if (vf > top) vf = damp(vf, top, 2, dt);
      let grip = T.grip * (sand ? 0.65 : 1);
      if (inp.handbrake) {
        grip *= 0.16;
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt);
        this.braking = true;
      }
      vl *= Math.max(0, 1 - grip * dt);
      const wb = this.geo.wheelbase;
      let yaw = -(vf / wb) * Math.tan(this.steer);
      if (inp.handbrake) yaw *= 1.45;
      if (T.tank) yaw += -inp.steer * 0.95 * Math.max(0, 1 - Math.abs(vf) / 6); // Ketten: Drehen auf der Stelle
      this.yawRate = yaw;
      this.h += yaw * dt;
      this.slip = Math.abs(vl);
    } else if (this.grounded) {
      vf = damp(vf, 0, 1.2, dt); vl = damp(vl, 0, 5, dt);
      this.yawRate = 0; this.slip = 0;
    } else {
      this.yawRate *= Math.exp(-0.5 * dt);
      this.h += this.yawRate * dt * 0.3;
    }
    // Hangabtrieb: bergauf langsamer, bergab schneller
    if (this.grounded && Math.abs(this.pitch) > 0.02) vf -= 9.8 * Math.sin(this.pitch) * dt * 0.9;
    if (this.grounded) {
      fx = Math.sin(this.h); fz = Math.cos(this.h); lx = fz; lz = -fx;
      this.vx = fx * vf + lx * vl;
      this.vz = fz * vf + lz * vl;
    }
    const accel = (vf - this.lastVf) / Math.max(dt, 1e-4);
    this.lastVf = vf;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // Vertikal
    const gh = W.groundHeight(this.x, this.z);
    if (this.grounded) {
      if (gh < this.y - 0.4) {
        this.grounded = false; this.airTime = 0;
        this.airStartX = this.x; this.airStartZ = this.z; this.maxAirY = this.y;
      } else {
        this.vy = clamp((gh - this.y) / dt, -20, 20);
        this.y = gh;
      }
    } else {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      this.maxAirY = Math.max(this.maxAirY, this.y);
      if (this.y <= gh) {
        const impact = -this.vy;
        this.y = gh; this.vy = 0; this.grounded = true;
        if (impact > 10) this.damage((impact - 10) * 30, null);
        if (impact > 4) {
          if (this.driver === 'player') { G.cam.shake(Math.min(1, impact / 15)); G.audio.thud(Math.min(1, impact / 12)); }
          G.effects.dust(this.x, this.y, this.z, 10);
        }
        if (this.driver === 'player') G.player.onLanded(this);
      }
    }
    // Neigung
    if (this.grounded) {
      const wb = this.geo.wheelbase / 2;
      const ghF = W.groundHeight(this.x + fx * wb, this.z + fz * wb), ghR = W.groundHeight(this.x - fx * wb, this.z - fz * wb);
      const slope = Math.atan2(ghF - ghR, wb * 2);
      this.pitch = damp(this.pitch, slope + clamp(-accel * 0.004, -0.05, 0.05), 10, dt);
      this.roll = damp(this.roll, clamp(this.yawRate * vf * 0.01, -0.07, 0.07), 6, dt);
    } else {
      const hs = Math.max(4, Math.hypot(this.vx, this.vz));
      this.pitch = damp(this.pitch, Math.atan2(this.vy, hs) * 0.8, 2.5, dt);
    }
    // Wasser
    if (this.y < WATER_Y - 0.4 && !this.sinking) {
      this.sinking = true; this.sinkT = 0;
      G.effects.splash(this.x, WATER_Y, this.z, 30);
      G.audio.splash();
      if (this.alive) { this.alive = false; this.health = 0; }
      if (this.driver === 'player') G.player.exitVehicle(true);
      else if (this.driver && this.driver.isPed) G.peds.ejectDriver(this, true);
    }
    this.spin += (vf / this.T.wheelR) * dt;
    // Brand / Rauch
    if (this.alive) {
      const hp = this.health / this.maxHealth;
      this.smokeT -= dt;
      if (hp < 0.35 && this.smokeT <= 0) {
        this.smokeT = hp < 0.15 ? 0.05 : 0.12;
        const hx = this.x + fx * (this.hl - 0.6), hz = this.z + fz * (this.hl - 0.6);
        if (hp < 0.15) G.effects.fire(hx, this.y + 1.0, hz, 1);
        G.effects.smoke(hx, this.y + 1.1, hz, 1, hp < 0.15 ? 0.15 : 0.45);
      }
    }
    if (this.onFire) {
      this.burn -= dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.04; G.effects.fire(this.x + rand(-1, 1), this.y + 1.1, this.z + rand(-1, 1), 2); G.effects.smoke(this.x, this.y + 1.5, this.z, 1, 0.1); }
      if (this.burn <= 0) this.explode();
    }
  }

  damage(amount, source) {
    if (!this.alive || amount <= 0) return;
    if (source) this.lastHitBy = source;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      if (!this.onFire) { this.onFire = true; this.burn = 3.5; }
    }
    if (this.ai && this.ai.onDamaged) this.ai.onDamaged(source);
    if (this.police && source === 'player') G.police.crime('copcar', this);
  }

  explode() {
    if (!this.alive && !this.onFire) return;
    this.onFire = false; this.alive = false; this.health = 0;
    this.parts.body.material = CAR_MATS.burnt;
    if (this.parts.red) { this.parts.red.material = CAR_MATS.off; this.parts.blue.material = CAR_MATS.offB; }
    this.siren = false;
    this.vy = 6; this.grounded = false; this.airTime = 0;
    this.yawRate = rand(-2, 2);
    G.effects.explosion(this.x, this.y + 0.8, this.z, 1);
    G.combat.explosionDamage(this.x, this.y + 0.5, this.z, 8, 220, this.lastHitBy, this);
    if (this.driver === 'player') G.player.exitVehicle(true, true);
    else if (this.driver && this.driver.isPed) G.peds.ejectDriver(this, false, true);
    if (this.lastHitBy === 'player') G.police.crime('explode', this);
    this.wreckT = 0;
  }

  updateVisual(dt) {
    // Tür öffnen/schließen
    const want = this.doorHold > 0 ? 1 : (this.doorTarget || 0);
    if (this.doorHold > 0) this.doorHold -= dt;
    this.doorOpen = damp(this.doorOpen || 0, want, want > (this.doorOpen || 0) ? 9 : 7, dt);
    if (this.parts.doorPivot) {
      this.parts.doorPivot.rotation.y = -1.15 * this.doorOpen;
      this.parts.hole.visible = this.doorOpen > 0.03;
    }
    // Fahrer hinter der Scheibe
    const d = this.driver;
    const show = this.alive && !this.sinking && d && !(d === 'player' && G.player.visible);
    this.parts.driver.visible = !!show;
    if (show && this._dlook !== d) {
      this._dlook = d;
      let L = null;
      if (d === 'player') L = G.player.look;
      else if (d === 'remote' && G.mp) { const r = G.mp.players.get(this.mpOwner); L = r && r.lk; }
      else if (d.look) L = d.look;
      if (L) { this.parts.dTm.color.copy(L.shirt); this.parts.dHm.color.copy(L.skin); }
    }
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(-this.pitch, this.h, this.roll, 'YXZ');
    // Licht
    const rev = this.alive && this.input.brake > 0 && this.fwdSpeed < 0.3 && !this.input.noReverse;
    const brakeOn = this.alive && (this.braking || rev);
    this.parts.tail.material = brakeOn ? CAR_MATS.tailOn : CAR_MATS.tailOff;
    if (this.parts.red) {
      if (this.siren && this.alive) {
        const t = G.time * 6, a = Math.floor(t) % 2 === 0;
        this.parts.red.material = a ? CAR_MATS.red : CAR_MATS.off;
        this.parts.blue.material = a ? CAR_MATS.offB : CAR_MATS.blue;
      } else { this.parts.red.material = CAR_MATS.off; this.parts.blue.material = CAR_MATS.offB; }
    }
  }

  remove() {
    if (this.removed) return;
    this.removed = true;
    G.scene.remove(this.group);
    const i = G.vehicles.indexOf(this);
    if (i >= 0) G.vehicles.splice(i, 1);
  }
}

// =================================================================
export class VehicleManager {
  constructor(scene) {
    this.maxCars = 64;
    this.wheelIM = new THREE.InstancedMesh(wheelGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.3 }), this.maxCars * 4);
    this.wheelIM.frustumCulled = false; this.wheelIM.castShadow = true;
    this.wheelIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.wheelIM);
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobIM = new THREE.InstancedMesh(blobGeo, G.world.blobMat, this.maxCars + 100);
    this.blobIM.frustumCulled = false; this.blobIM.renderOrder = 2;
    scene.add(this.blobIM);
    const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.headMat = new THREE.MeshBasicMaterial({ map: G.world.tex.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
    this.headIM = new THREE.InstancedMesh(poolGeo, this.headMat, this.maxCars);
    this.headIM.frustumCulled = false; this.headIM.renderOrder = 3;
    scene.add(this.headIM);
    this._m = new THREE.Matrix4(); this._w = new THREE.Matrix4(); this._r = new THREE.Matrix4(); this._s = new THREE.Matrix4();
    this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._sc = new THREE.Vector3(); this._e = new THREE.Euler();
  }

  spawn(key, x, z, h, color) {
    if (G.vehicles.length >= this.maxCars) return null;
    const v = new Vehicle(key, x, z, h, color);
    G.vehicles.push(v);
    return v;
  }

  step(dt) {
    const vs = G.vehicles;
    for (const v of vs) if (!v.remote) v.update(dt);
    // Kollisionen
    const W = G.world;
    for (const v of vs) {
      if (v.sinking) continue;
      W.query(v.x, v.z, v.hl + 1.5, _b, _c);
      for (const b of _b) {
        if (v.y >= b.y1 - 0.05 || v.y + v.height <= b.y0) continue;
        const r = vehVsBox(v, b);
        if (!r) continue;
        this.resolveStatic(v, r.nx, r.nz, r.depth);
      }
      for (const c of _c) {
        if (v.y > c.y1 || !c.alive) continue;
        const r = circleVsVeh(c.x, c.z, c.r, v);
        if (!r) continue;
        if ((c.kind === 'lamp' || c.kind === 'signal') && v.speed > 5) {
          if (W.knockPole(c, v.vx, v.vz)) {
            v.vx *= 0.85; v.vz *= 0.85;
            G.audio.crash(0.5, v.x, v.z);
            G.effects.sparks(c.x, v.y + 0.8, c.z, 10);
            if (v.driver === 'player') G.cam.shake(0.25);
            continue;
          }
        }
        // Normale zeigt vom Fahrzeug zum Mast -> Fahrzeug wird davon weggeschoben
        this.resolveStatic(v, r.nx, r.nz, r.depth, false);
      }
    }
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i];
      for (let j = i + 1; j < vs.length; j++) {
        const b = vs[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = a.hl + b.hl;
        if (dx * dx + dz * dz > rr * rr) continue;
        if (Math.abs(a.y - b.y) > 1.6) continue;
        const r = vehVsVeh(a, b);
        if (!r) continue;
        this.resolvePair(a, b, r.nx, r.nz, r.depth);
      }
    }
    // Figuren treffen
    G.peds.vehicleHits(vs);
    for (const v of vs) v.updateVisual(dt);
  }

  resolveStatic(v, nx, nz, depth, spin = true) {
    v.x -= nx * depth; v.z -= nz * depth;
    const vn = v.vx * nx + v.vz * nz;
    if (vn > 0) {
      v.vx -= vn * nx * (spin ? 1.35 : 1.15); v.vz -= vn * nz * (spin ? 1.35 : 1.15);
      const f = Math.max(0.6, 1 - vn * 0.02);
      v.vx *= f; v.vz *= f;
      // Drehimpuls je nach Aufprallwinkel (nicht bei dünnen Masten)
      if (spin) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        const side = fx * nz - fz * nx;
        v.h += side * Math.min(0.15, vn * 0.006);
      }
      this.impact(v, vn, null);
    }
  }

  resolvePair(a, b, nx, nz, depth) {
    const ma = a.mass, mb = b.mass, tot = ma + mb;
    a.x -= nx * depth * (mb / tot); a.z -= nz * depth * (mb / tot);
    b.x += nx * depth * (ma / tot); b.z += nz * depth * (ma / tot);
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const e = 0.25;
      const j = (-(1 + e) * rv) / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz;
      b.vx += (j / mb) * nx; b.vz += (j / mb) * nz;
      a.h += (Math.random() - 0.5) * Math.min(0.2, -rv * 0.01);
      b.h += (Math.random() - 0.5) * Math.min(0.2, -rv * 0.01);
      const imp = -rv;
      this.impact(a, imp * (mb / tot) * 1.6, b);
      this.impact(b, imp * (ma / tot) * 1.6, a);
      if (a.ai && a.ai.onBumped) a.ai.onBumped(b);
      if (b.ai && b.ai.onBumped) b.ai.onBumped(a);
    }
  }

  impact(v, speed, other) {
    if (speed < 2.5) return;
    if (G.time - v.lastImpact < 0.15) return;
    v.lastImpact = G.time;
    const src = other && other.driver === 'player' ? 'player' : null;
    v.damage((speed - 2.5) * 14, src);
    G.audio.crash(Math.min(1, speed / 18), v.x, v.z);
    if (speed > 7) G.effects.sparks(v.x, v.y + 0.6, v.z, Math.min(25, speed * 1.5));
    if (v.driver === 'player') G.cam.shake(Math.min(0.8, speed / 25));
  }

  render() {
    const vs = G.vehicles, W = this.wheelIM;
    let wi = 0, bi = 0, hi = 0;
    const night = G.world.env.night;
    const m = this._m, w = this._w, r = this._r, s = this._s;
    for (const v of vs) {
      v.group.updateMatrixWorld();
      const g = v.geo;
      for (let k = 0; k < 4; k++) {
        const [x, y, z, front] = g.wheels[k];
        const wr = v.T.wheelR;
        m.makeTranslation(x, y, z);
        w.multiplyMatrices(v.group.matrixWorld, m);
        if (front) { r.makeRotationY(v.steer * -1); w.multiply(r); }
        r.makeRotationX(v.spin); w.multiply(r);
        s.makeScale(0.26, wr, wr); w.multiply(s);
        W.setMatrixAt(wi++, w);
      }
      // Schatten
      this._p.set(v.x, G.world.groundHeight(v.x, v.z) + 0.03, v.z);
      this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, v.h);
      const fade = clamp(1 - (v.y - this._p.y) / 8, 0.2, 1);
      this._sc.set(v.T.W * 1.5 * fade, 1, v.T.L * 1.25 * fade);
      m.compose(this._p, this._q, this._sc);
      this.blobIM.setMatrixAt(bi++, m);
      // Scheinwerferkegel
      if (night > 0.05 && v.alive && !v.sinking) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        this._p.set(v.x + fx * (v.hl + 5), G.world.groundHeight(v.x + fx * (v.hl + 5), v.z + fz * (v.hl + 5)) + 0.05, v.z + fz * (v.hl + 5));
        this._sc.set(5.5, 1, 11);
        m.compose(this._p, this._q, this._sc);
        this.headIM.setMatrixAt(hi++, m);
      }
    }
    W.count = wi; W.instanceMatrix.needsUpdate = true;
    // Figurenschatten
    for (const c of G.peds.blobList()) {
      if (bi >= this.blobIM.instanceMatrix.count) break;
      this._p.set(c.x, c.gy + 0.035, c.z);
      this._sc.set(0.9, 1, 0.9);
      this._q.identity();
      m.compose(this._p, this._q, this._sc);
      this.blobIM.setMatrixAt(bi++, m);
    }
    this.blobIM.count = bi; this.blobIM.instanceMatrix.needsUpdate = true;
    this.headIM.count = hi; this.headIM.instanceMatrix.needsUpdate = true;
    this.headMat.opacity = night * 0.4;
    CAR_MATS.head.color.setScalar(lerp(0.9, 1.6, night));
    CAR_MATS.tailOff.color.setRGB(lerp(0.35, 0.9, night), 0.03, 0.03);
    CAR_MATS.taxiSign.color.setRGB(lerp(0.9, 2.4, night), lerp(0.8, 2.0, night), lerp(0.5, 1.0, night));
  }
}
