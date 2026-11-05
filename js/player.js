// Spielfigur
import { G } from './state.js';
import * as C from './config.js';
import { playerLook } from './models.js';
import { WEAPONS, WEAPON_ORDER } from './combat.js';
import { circleVsBox, circleVsVeh } from './physics.js';
import { clamp, damp, dampAngle, angleDiff, dist2, rand, lerp } from './utils.js';

const _b = [], _c = [];

export class Player {
  constructor(x, z) {
    this.isPlayer = true;
    this.x = x; this.z = z; this.y = 0; this.gy = 0;
    this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.onGround = true;
    this.look = playerLook();
    this.anim = { phase: 0, amp: 0, run: 0, t: 0 };
    this.state = 'foot';
    this.vehicle = null; this.lastVehicle = null;
    this.health = 100; this.armor = 0; this.money = 0;
    this.ammo = { fists: Infinity, pistol: 0, smg: 0, shotgun: 0, rifle: 0 };
    this.weapon = 'fists';
    this.fireT = 0; this.aimT = 0; this.punchCombo = 0; this.comboT = 0;
    this.visible = true;
    this.timer = 0;
    this.lie = 0; this.spinX = 0;
    this.target = null;
    this.invuln = 0;
    this.stuntsDone = new Set();
    this.sprinting = false;
    this.r = 0.35;
  }
  get inCar() { return this.state === 'car' && this.vehicle; }
  get pos() { return this.inCar ? this.vehicle : this; }

  addMoney(n, msg) {
    this.money = Math.max(0, this.money + n);
    G.hud.money(n);
    if (msg) G.hud.toast(msg);
  }

  // ------------------------------------------------------------ Update
  update(dt) {
    const I = G.input;
    this.fireT -= dt; this.aimT -= dt; this.comboT -= dt; this.invuln -= dt;
    if (this.comboT <= 0) this.punchCombo = 0;
    const A = this.anim;
    A.t += dt;
    switch (this.state) {
      case 'car': this.driveUpdate(dt, I); break;
      case 'entering': this.enterUpdate(dt); break;
      case 'knock': this.knockUpdate(dt); break;
      case 'dead': case 'busted': this.deadUpdate(dt); break;
      case 'cutscene': A.amp = damp(A.amp, 0, 6, dt); break;
      default: this.footUpdate(dt, I);
    }
    if (G.state === 'playing' && !this.inCar && this.state !== 'dead') G.stats.distanceWalked += Math.hypot(this.vx, this.vz) * dt;
  }

  footUpdate(dt, I) {
    const W = G.world, A = this.anim;
    const cy = G.cam.yaw;
    let mx = I.moveX, my = I.moveY;
    const mag = Math.min(1, Math.hypot(mx, my));
    // Kamera-relativ
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    let dx = fx * my + rx * mx, dz = fz * my + rz * mx;
    const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    const swim = this.state === 'swim';
    this.sprinting = I.held('sprint') && mag > 0.2;
    let speed = swim ? (this.sprinting ? 3.6 : 2.4) : this.sprinting ? 7.8 : G.isTouch ? lerp(1.2, 5.2, clamp((mag - 0.15) / 0.75, 0, 1)) : 5.0;
    if (mag < 0.12) speed = 0;
    const armed = this.weapon !== 'fists';
    // Zielen
    const wantAim = I.held('aim') || (I.held('fire') && armed);
    if (wantAim && armed) this.aimT = 0.5;
    const aiming = this.aimT > 0 && armed && !swim;
    if (aiming) speed = Math.min(speed, 3.2);
    const tvx = dx * speed, tvz = dz * speed;
    const accel = this.onGround ? 12 : 2.5;
    this.vx = damp(this.vx, tvx, accel, dt);
    this.vz = damp(this.vz, tvz, accel, dt);
    // Blickrichtung
    if (aiming) {
      if (G.isTouch) {
        this.target = this.findTarget();
        const ty = this.target ? Math.atan2(this.target.x - this.x, this.target.z - this.z) : (speed > 0.5 ? Math.atan2(dx, dz) : this.yaw);
        this.yaw = dampAngle(this.yaw, ty, 14, dt);
      } else this.yaw = dampAngle(this.yaw, cy, 20, dt);
    } else if (speed > 0.3) {
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
      this.target = null;
    } else this.target = G.isTouch && armed ? this.findTarget() : null;
    // Springen / Schwerkraft
    if (I.pressed('jump') && this.onGround && !swim) { this.vy = 6.2; this.onGround = false; G.audio.jump(); }
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.gy = W.groundHeight(this.x, this.z);
    if (swim) {
      this.y = damp(this.y, C.WATER_Y - 0.25, 6, dt);
      this.vy = 0;
      if (this.gy > C.WATER_Y - 1.0) { this.state = 'foot'; this.y = Math.max(this.gy, this.y); }
    } else {
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= this.gy) {
        if (!this.onGround && this.vy < -14) this.damage((-this.vy - 14) * 6, null);
        this.y = this.gy; this.vy = 0; this.onGround = true;
      } else if (this.y > this.gy + 0.25) this.onGround = false;
      if (this.gy < C.WATER_Y - 1.1 && this.y < C.WATER_Y - 0.2) {
        this.state = 'swim'; G.effects.splash(this.x, C.WATER_Y, this.z, 12); G.audio.splash();
      }
    }
    this.collide();
    // Interaktion
    if (I.pressed('enter') && !swim) {
      const v = this.nearestVehicle(6);
      if (v) this.startEnter(v);
    }
    if (I.pressed('weapon')) this.nextWeapon();
    // Feuern
    if (I.held('fire') && this.fireT <= 0 && !swim) this.fire();
    // Animation
    const sp = Math.hypot(this.vx, this.vz);
    A.amp = damp(A.amp, sp > 0.3 ? (sp > 4 ? 1 : 0.6) : 0, 8, dt);
    A.run = damp(A.run, sp > 4 ? 1 : 0, 6, dt);
    A.phase += dt * (sp > 0.2 ? 2.4 + sp * 1.5 : 0);
    A.gun = armed && !swim;
    A.twoHand = !!WEAPONS[this.weapon].twoHand;
    A.aim = aiming;
    A.aimPitch = G.isTouch ? 0 : clamp(-G.cam.pitch * 0.8, -0.6, 0.6);
    A.air = !this.onGround && !swim;
    A.swim = swim;
    A.tilt = swim ? 1.35 : 0;
    A.lift = 0;
    if (A.punch > 0) A.punch = Math.max(0, A.punch - dt * 3.2);
  }

  collide() {
    const W = G.world;
    W.query(this.x, this.z, 1.2, _b, _c);
    for (const b of _b) {
      if (this.y >= b.y1 - 0.15 || this.y + 1.8 <= b.y0) continue;
      const r = circleVsBox(this.x, this.z, this.r, b);
      if (r) { this.x += r.nx * r.depth; this.z += r.nz * r.depth; const vn = this.vx * r.nx + this.vz * r.nz; if (vn < 0) { this.vx -= vn * r.nx; this.vz -= vn * r.nz; } }
    }
    for (const c of _c) {
      if (this.y >= c.y1) continue;
      const dx = this.x - c.x, dz = this.z - c.z, rr = c.r + this.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); this.x += dx / d * (rr - d); this.z += dz / d * (rr - d); }
    }
    for (const v of G.vehicles) {
      if (dist2(v.x, v.z, this.x, this.z) > 50) continue;
      if (this.y > v.y + v.height) continue;
      const r = circleVsVeh(this.x, this.z, this.r, v);
      if (r) { this.x += r.nx * r.depth; this.z += r.nz * r.depth; }
    }
  }

  nearestVehicle(r) {
    let best = null, bd = r * r;
    for (const v of G.vehicles) {
      if (!v.alive || v.sinking || v.driver === 'player' || v.remote) continue;
      if (Math.abs(v.y - this.y) > 2) continue;
      const d = dist2(v.x, v.z, this.x, this.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // Ziel für automatisches Zielen (Touch)
  findTarget() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const cfx = G.cam.forward.x, cfz = G.cam.forward.z;
    let best = null, bs = -1;
    const wanted = G.police.level > 0;
    for (const p of G.peds.list) {
      if (!p.alive) continue;
      const dx = p.x - this.x, dz = p.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 40 || d < 0.5) continue;
      const dot = Math.max((dx * fx + dz * fz) / d, (dx * cfx + dz * cfz) / d);
      if (dot < 0.55) continue;
      let score = dot * 2 - d / 40;
      if (p.hostile || (p.isCop && wanted) || p.missionTarget) score += 2;
      if (score > bs && G.world.lineOfSight(this.x, this.y + 1.5, this.z, p.x, p.y + 1.2, p.z)) { bs = score; best = p; }
    }
    if (!best) {
      for (const v of G.vehicles) {
        if (!v.alive || v === this.vehicle) continue;
        const dx = v.x - this.x, dz = v.z - this.z, d = Math.hypot(dx, dz);
        if (d > 35) continue;
        const dot = (dx * cfx + dz * cfz) / d;
        if (dot < 0.8) continue;
        const score = dot - d / 35 + (v.police && wanted ? 1 : 0) + (v.missionTarget ? 2 : 0);
        if (score > bs) { bs = score; best = v; }
      }
    }
    return best;
  }

  nextWeapon() {
    const i = WEAPON_ORDER.indexOf(this.weapon);
    for (let k = 1; k <= WEAPON_ORDER.length; k++) {
      const w = WEAPON_ORDER[(i + k) % WEAPON_ORDER.length];
      if (this.ammo[w] > 0) { this.weapon = w; G.audio.click(); G.hud.weapon(); return; }
    }
  }
  giveWeapon(w, ammo) {
    const had = this.ammo[w] > 0;
    this.ammo[w] = (this.ammo[w] || 0) + ammo;
    if (!had || this.weapon === 'fists') this.weapon = w;
    G.hud.weapon();
  }

  fire() {
    const w = WEAPONS[this.weapon];
    if (w.melee) {
      this.fireT = w.rate;
      this.anim.punch = 1;
      this.punchCombo++; this.comboT = 0.9;
      G.combat.punch();
      if (this.punchCombo >= 3) this.punchCombo = 0;
      return;
    }
    if (this.ammo[this.weapon] <= 0) { this.nextWeapon(); G.audio.click(); this.fireT = 0.3; return; }
    this.fireT = w.rate;
    this.ammo[this.weapon]--;
    this.aimT = 0.6;
    const yaw = this.yaw;
    const ox = this.x + Math.sin(yaw) * 0.55 - Math.cos(yaw) * 0.2, oy = this.y + 1.45, oz = this.z + Math.cos(yaw) * 0.55 + Math.sin(yaw) * 0.2;
    let tx, ty, tz;
    if (G.isTouch) {
      const t = this.target || this.findTarget();
      if (t) { tx = t.x; ty = t.isPed ? t.y + (t.lie > 0.5 ? 0.2 : 1.3) : t.y + 0.8; tz = t.z; }
      else { tx = ox + Math.sin(yaw) * 50; ty = oy - 0.5; tz = oz + Math.cos(yaw) * 50; }
    } else {
      const cam = G.camera.position, f = G.cam.dir;
      const h = G.combat.raycast(cam.x, cam.y, cam.z, f.x, f.y, f.z, 150, this.vehicle);
      tx = h.x; ty = h.y; tz = h.z;
      if (!h.type) { tx = cam.x + f.x * 150; ty = cam.y + f.y * 150; tz = cam.z + f.z * 150; }
    }
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const L = Math.hypot(dx, dy, dz) || 1;
    G.combat.playerShot(this.weapon, ox, oy, oz, dx / L, dy / L, dz / L, null);
    G.cam.kick(this.weapon === 'shotgun' ? 0.03 : 0.012);
    G.hud.weapon();
  }

  // ----------------------------------------------------------- Fahrzeuge
  startEnter(v) {
    this.state = 'entering';
    this.enterV = v;
    this.timer = 2.2;
  }
  doorPos(v) {
    const lx = Math.cos(v.h), lz = -Math.sin(v.h), fx = Math.sin(v.h), fz = Math.cos(v.h);
    return [v.x + lx * (v.hw + 0.55) + fx * 0.3, v.z + lz * (v.hw + 0.55) + fz * 0.3];
  }
  enterUpdate(dt) {
    const v = this.enterV, A = this.anim;
    this.timer -= dt;
    if (!v || !v.alive || v.sinking || v.driver === 'player') { this.state = 'foot'; return; }
    const [tx, tz] = this.doorPos(v);
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (G.input.pressed('enter') && this.timer < 2.0) { this.state = 'foot'; return; }
    if (d < 0.7 || this.timer <= 0 || (d < 2.5 && v.speed > 2)) { this.enterVehicle(v); return; }
    const sp = 5.5;
    this.x += dx / d * Math.min(d, sp * dt); this.z += dz / d * Math.min(d, sp * dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt);
    this.gy = G.world.groundHeight(this.x, this.z); this.y = this.gy;
    this.collide();
    A.amp = damp(A.amp, 1, 8, dt); A.run = damp(A.run, 1, 6, dt); A.phase += dt * 11;
    A.gun = false; A.aim = false;
  }
  enterVehicle(v) {
    if (v.driver && v.driver !== 'player') {
      const cop = v.driver.isCop || v.police;
      G.peds.ejectDriver(v);
      G.police.crime(cop ? 'stealCop' : 'carjack');
      G.stats.carsStolen++;
      G.audio.door();
    } else {
      if (v.police) G.police.crime('stealCop');
      G.audio.door();
      if (!v.ownedByPlayer) G.stats.carsStolen++;
    }
    v.driver = 'player';
    v.ai = null; v.parked = false; v.siren = false;
    v.input.noReverse = false;
    this.vehicle = v; this.lastVehicle = v;
    this.state = 'car';
    this.visible = false;
    this.target = null;
    G.hud.vehicleName(v.T.name);
    G.audio.enterCar();
    if (G.missions.onEnterVehicle) G.missions.onEnterVehicle(v);
  }
  exitVehicle(force = false, burning = false) {
    const v = this.vehicle;
    if (!v) return;
    const lx = Math.cos(v.h), lz = -Math.sin(v.h);
    let x = v.x + lx * (v.hw + 0.6), z = v.z + lz * (v.hw + 0.6);
    // Seite blockiert? -> andere Seite
    G.world.query(x, z, 0.5, _b, null);
    if (_b.some((b) => x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3 && b.y1 > v.y + 0.5)) { x = v.x - lx * (v.hw + 0.6); z = v.z - lz * (v.hw + 0.6); }
    this.x = x; this.z = z; this.y = Math.max(v.y, G.world.groundHeight(x, z));
    this.yaw = v.h;
    v.driver = null;
    v.input.throttle = 0; v.input.brake = 0; v.input.steer = 0; v.input.handbrake = false;
    this.vehicle = null;
    this.visible = true;
    this.state = 'foot';
    this.vx = 0; this.vz = 0; this.vy = 0;
    G.audio.exitCar();
    if (v.sinking) { this.state = 'swim'; this.x = v.x; this.z = v.z; this.y = C.WATER_Y - 0.3; return; }
    if (burning || (v.speed > 7 && !force)) {
      this.knock(v.vx * 0.6 + lx * 3, v.vz * 0.6 + lz * 3, 3, burning ? 20 : 4, null);
    } else G.audio.door();
    if (G.missions.onExitVehicle) G.missions.onExitVehicle(v);
  }

  driveUpdate(dt, I) {
    const v = this.vehicle;
    if (!v) { this.state = 'foot'; return; }
    this.x = v.x; this.z = v.z; this.y = v.y; this.gy = v.y;
    const inp = v.input;
    let gas = Math.max(I.held('gas') ? 1 : 0, I.gas || 0);
    let brk = Math.max(I.held('brake') ? 1 : 0, I.brake || 0);
    if (G.isTouch) {
      // Joystick vor/zurück als Gas/Bremse
      if (I.moveY > 0.35) gas = Math.max(gas, clamp((I.moveY - 0.35) / 0.5, 0, 1));
      if (I.moveY < -0.45) brk = Math.max(brk, clamp((-I.moveY - 0.45) / 0.45, 0, 1));
    } else {
      if (I.moveY > 0.2) gas = Math.max(gas, I.moveY);
      if (I.moveY < -0.2) brk = Math.max(brk, -I.moveY);
    }
    inp.throttle = gas; inp.brake = brk;
    let st = I.moveX;
    if (G.isTouch) st = Math.sign(st) * Math.pow(Math.abs(st), 1.4);
    inp.steer = clamp(st, -1, 1);
    inp.handbrake = I.held('handbrake');
    inp.noReverse = false;
    if (I.pressed('enter')) { this.exitVehicle(); return; }
    if (I.held('horn')) G.audio.horn(v.x, v.z, 0.1, true);
    if (I.pressed('radio')) G.audio.nextStation();
    if (I.pressed('weapon')) this.nextWeapon();
    if (v.police && I.pressed('siren')) v.siren = !v.siren;
    // Drive-by
    if (I.held('fire') && this.fireT <= 0 && this.weapon !== 'fists' && this.ammo[this.weapon] > 0) {
      const w = WEAPONS[this.weapon];
      this.fireT = w.rate * 1.2;
      this.ammo[this.weapon]--;
      const t = this.findDriveByTarget(v);
      const ox = v.x + Math.cos(v.h) * (v.hw + 0.2), oy = v.y + 1.3, oz = v.z - Math.sin(v.h) * (v.hw + 0.2);
      let tx, ty, tz;
      if (!G.isTouch) { const c = G.camera.position, f = G.cam.dir; tx = c.x + f.x * 60; ty = c.y + f.y * 60; tz = c.z + f.z * 60; }
      else if (t) { tx = t.x; ty = t.y + (t.isPed ? 1.2 : 0.8); tz = t.z; }
      else { tx = v.x + Math.sin(v.h) * 50; ty = oy; tz = v.z + Math.cos(v.h) * 50; }
      const dx = tx - ox, dy = ty - oy, dz = tz - oz, L = Math.hypot(dx, dy, dz) || 1;
      G.combat.playerShot(this.weapon, ox, oy, oz, dx / L, dy / L, dz / L, v);
      G.hud.weapon();
    }
    if (G.state === 'playing') {
      G.stats.distanceDriven += v.speed * dt;
      G.stats.bestSpeed = Math.max(G.stats.bestSpeed, v.speed * 3.6);
    }
  }
  findDriveByTarget(v) {
    let best = null, bd = 45 * 45;
    for (const p of G.peds.list) {
      if (!p.alive) continue;
      const d = dist2(p.x, p.z, v.x, v.z);
      if (d < bd && (p.isCop || p.hostile || p.missionTarget)) { bd = d; best = p; }
    }
    if (best) return best;
    for (const o of G.vehicles) {
      if (o === v || !o.alive) continue;
      const d = dist2(o.x, o.z, v.x, v.z);
      if (d < bd && (o.police || o.missionTarget)) { bd = d; best = o; }
    }
    return best;
  }

  onLanded(v) {
    if (v.airTime < 0.9) return;
    const dist = Math.hypot(v.x - v.airStartX, v.z - v.airStartZ);
    const reward = Math.round(dist * 4 + v.airTime * 60);
    // Einzigartiger Stuntsprung?
    let unique = -1;
    G.world.ramps.forEach((r, i) => {
      const ex = r.x + r.fx * r.len, ez = r.z + r.fz * r.len;
      if (dist2(ex, ez, v.airStartX, v.airStartZ) < 64) unique = i;
    });
    G.stats.stunts++;
    if (unique >= 0 && !this.stuntsDone.has(unique) && dist > 18) {
      this.stuntsDone.add(unique);
      this.addMoney(reward + 500);
      G.hud.bigToast('STUNTSPRUNG GESCHAFFT!', `${dist.toFixed(0)} m weit · ${v.airTime.toFixed(1)} s Flugzeit · +$${reward + 500}  (${this.stuntsDone.size}/${G.world.ramps.length})`);
      G.audio.jingle();
      G.save.write();
    } else {
      this.addMoney(reward);
      G.hud.toast(`Sprung! ${dist.toFixed(0)} m · +$${reward}`);
    }
  }

  // ------------------------------------------------------------ Schaden
  damage(amount, src) {
    if (this.state === 'dead' || this.state === 'busted' || this.invuln > 0 || G.state !== 'playing') return;
    if (this.armor > 0) {
      const a = Math.min(this.armor, amount * 0.7);
      this.armor -= a; amount -= a;
    }
    this.health -= amount;
    G.hud.damageFlash(Math.min(1, amount / 25));
    if (this.health <= 0) { this.health = 0; this.die(); }
  }
  knock(vx, vz, vy, dmg, src) {
    if (this.state === 'dead' || this.state === 'busted') return;
    if (this.inCar) return;
    this.state = 'knock';
    this.vx = vx; this.vz = vz; this.vy = vy;
    this.timer = 1.6; this.spinX = 0;
    this.damage(dmg, src);
    G.audio.thud(0.6, this.x, this.z);
  }
  knockUpdate(dt) {
    const A = this.anim;
    this.timer -= dt;
    this.vy -= 20 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.spinX += dt * 7;
    this.gy = G.world.groundHeight(this.x, this.z);
    if (this.y <= this.gy) { this.y = this.gy; this.vy = 0; this.vx *= 0.3; this.vz *= 0.3; }
    this.collide();
    this.lie = damp(this.lie, this.timer > 0.4 ? 1 : 0, 8, dt);
    A.tilt = -this.lie * Math.PI / 2 + (this.vy !== 0 ? Math.sin(this.spinX) * 0.5 : 0);
    A.lift = this.lie * 0.14; A.amp = 0; A.gun = false; A.aim = false;
    if (this.timer <= 0 && this.vy === 0) {
      if (this.gy < C.WATER_Y - 1.1) this.state = 'swim'; else this.state = 'foot';
      this.lie = 0; A.tilt = 0; A.lift = 0;
    }
  }
  die() {
    if (this.inCar) { const v = this.vehicle; this.exitVehicle(true); this.x = v.x + Math.cos(v.h) * 2.5; this.z = v.z - Math.sin(v.h) * 2.5; }
    this.state = 'dead'; this.timer = 4.5; this.visible = true;
    G.hud.banner('AUSGESCHALTET', '#ff3b5c', 'Du wachst im Krankenhaus wieder auf …');
    G.audio.wasted();
    G.missions.fail('Du wurdest ausgeschaltet.');
  }
  bust() {
    if (this.state === 'dead' || this.state === 'busted') return;
    if (this.inCar) this.exitVehicle(true);
    this.state = 'busted'; this.timer = 4; this.visible = true;
    G.hud.banner('FESTGENOMMEN', '#4d8bff', 'Die Polizei hat dich geschnappt …');
    G.audio.busted();
    G.missions.fail('Du wurdest festgenommen.');
  }
  deadUpdate(dt) {
    const A = this.anim;
    this.timer -= dt;
    if (this.state === 'dead') {
      this.lie = damp(this.lie, 1, 4, dt);
      A.tilt = -this.lie * Math.PI / 2; A.lift = this.lie * 0.14; A.amp = 0; A.gun = false; A.aim = false;
      this.gy = G.world.groundHeight(this.x, this.z);
      this.y = damp(this.y, Math.max(this.gy, C.WATER_Y - 0.4), 6, dt);
    } else {
      A.handsUp = true; A.amp = 0; A.gun = false; A.aim = false;
    }
    if (this.timer <= 0) this.respawn(this.state === 'dead' ? 'hospital' : 'police');
  }
  respawn(where) {
    const poi = G.world.pois[where] || G.world.pois.safehouse;
    const cost = where === 'hospital' ? Math.min(this.money, Math.max(100, Math.floor(this.money * 0.08))) : Math.min(this.money, Math.max(150, Math.floor(this.money * 0.1)));
    this.money -= cost;
    if (where === 'police') { for (const k in this.ammo) if (k !== 'fists') this.ammo[k] = Math.floor(this.ammo[k] / 2); }
    this.x = poi.x + (where === 'safehouse' ? -5 : 0); this.z = poi.z; this.y = 0; this.vx = this.vz = this.vy = 0;
    this.yaw = Math.PI;
    this.health = 100; this.state = 'foot'; this.visible = true; this.lie = 0;
    this.anim.handsUp = false; this.anim.tilt = 0; this.anim.lift = 0;
    this.vehicle = null;
    G.police.setLevel(0, true);
    G.police.clear();
    this.invuln = 3;
    G.cam.snap();
    G.hud.money(0);
    G.hud.toast(where === 'hospital' ? `Krankenhausrechnung: -$${cost}` : `Kaution bezahlt: -$${cost}`);
    G.hud.fadeIn();
  }
}
