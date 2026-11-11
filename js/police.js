// Fahndungslevel, Streifen, Hubschrauber, Festnahme
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, damp, dampAngle, rand, dist2, lerp } from './utils.js';
import { radialTexture } from './textures.js';

const HEAT = [0, 1, 6, 14, 26, 42];
const CRIME_HEAT = { shoot: 1, hitPed: 2, killPed: 4, hitCop: 3, killCop: 8, copcar: 2, explode: 4, carjack: 1, stealCop: 6 };

export class Police {
  constructor(scene) {
    this.level = 0; this.heat = 0;
    this.lastSeen = -999; this.lastCrime = {};
    this.spawnT = 0;
    this.arrestT = 0;
    this.heli = null;
    this.locked = false;   // Missionen können Fahndung sperren
    this.minLevel = 0;
    this.buildHeli(scene);
  }

  copNear(r) {
    const P = G.player, x = P.inCar ? P.vehicle.x : P.x, z = P.inCar ? P.vehicle.z : P.z;
    for (const p of G.peds.list) if (p.isCop && p.alive && dist2(p.x, p.z, x, z) < r * r) return true;
    for (const v of G.vehicles) if (v.police && v.alive && dist2(v.x, v.z, x, z) < r * r) return true;
    return false;
  }

  crime(type, target, witnessed = false) {
    if (this.locked) return;
    const now = G.time;
    if (this.lastCrime[type] && now - this.lastCrime[type] < (type === 'shoot' ? 2 : 0.5)) return;
    this.lastCrime[type] = now;
    let seen = witnessed || this.copNear(type === 'shoot' ? 45 : 60);
    if (type === 'killPed' || type === 'killCop' || type === 'hitCop' || type === 'copcar' || type === 'explode' || type === 'stealCop') seen = true;
    if (!seen) {
      if (type === 'hitPed' && Math.random() < 0.35) seen = true;
      else return;
    }
    this.heat += CRIME_HEAT[type] || 1;
    let lvl = 0;
    for (let k = 1; k < HEAT.length; k++) if (this.heat >= HEAT[k]) lvl = k;
    lvl = Math.max(lvl, this.level === 0 ? 1 : this.level);
    if (type === 'killCop' && this.level >= 1) lvl = Math.max(lvl, this.level + 1);
    this.setLevel(Math.min(5, lvl));
    this.lastSeen = now;
  }

  setLevel(l, force = false) {
    l = clamp(l, 0, 5);
    if (this.locked && !force) return;
    const before = this.level;
    this.level = Math.max(l, this.minLevel);
    if (this.level > before) { this.lastSeen = G.time; this.heat = Math.max(this.heat, HEAT[this.level]); G.hud.wantedPulse(); G.audio.wantedUp(); }
    if (this.level === 0 && before > 0) this.clear();
  }

  clear() {
    this.level = 0; this.heat = 0; this.arrestT = 0;
    for (const b of this.blocks || []) for (const v of b.cars) if (!v.removed && v !== G.player.vehicle && !G.peds.inView(v.x, v.z)) v.remove(); else v.persistent = false;
    this.blocks = [];
    for (const v of G.vehicles) if (v.police && v.ai && v.T.boat) { v.ai.mode = 'cruise'; v.siren = false; }
    for (const v of G.vehicles) if (v.police && v.ai && !v.persistent && !v.T.boat) { v.ai.mode = 'traffic'; v.siren = false; v.ai.cruise = 13; v.ai.route = []; v.ai.pts = []; if (G.world.inHills(v.x, v.z)) { const l = G.world.netLocate(v.x, v.z); v.ai.startHill(l.edge, l.idx, 1); } else { const n = G.world.nearestNode(v.x, v.z); v.ai.startEdge(n.id, n.nbr[0]); } }
    for (const p of G.peds.list) if (p.isCop && p.state === 'cop') { p.state = 'walk'; p.path = null; p.anim.gun = false; }
  }

  spotted() { this.lastSeen = G.time; const P = G.player; this.lastPos = { x: P.inCar ? P.vehicle.x : P.x, z: P.inCar ? P.vehicle.z : P.z }; }
  get searching() { return this.level > 0 && G.time - this.lastSeen > 2.5; }
  evadeTime() { return 8 + this.level * 4; }
  unitRemoved(v) {}

  arresting(cop, dt) { this.arrestCop = cop; }

  update(dt) {
    const P = G.player;
    if (this.level === 0) { this.updateHeli(dt, false); this.siren(); return; }
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    // Entkommen
    if (G.time - this.lastSeen > this.evadeTime() && this.level > this.minLevel) {
      this.setLevel(0);
      G.stats.copsEvaded++;
      G.hud.toast('Polizei abgehängt!');
      if (G.missions.onEvaded) G.missions.onEvaded();
      return;
    }
    // Einheiten
    const cars = G.vehicles.filter((v) => v.police && v.alive && v.ai && v.ai.mode === 'police');
    const want = [0, 1, 2, 3, 4, 5][this.level] + (this.level >= 4 ? 1 : 0);
    this.spawnT -= dt;
    if (cars.length < want && this.spawnT <= 0) {
      this.spawnT = 2.5;
      const onWater = (P.inCar && P.vehicle.T.boat) || P.state === 'swim';
      const v = onWater && G.craft ? G.craft.spawnPoliceBoat(px, pz) : G.world.inHills(px, pz) && pz < -400 ? G.traffic.spawnHillCar(px, pz, 'police', 'police', 60, 160) : G.traffic.spawnCar(px, pz, 70, 150, 'police', 'police');
      if (v) { v.siren = true; v.ai.cruise = 26; v.persistent = false; }
    }
    // Streifenpolizisten steigen aus
    for (const v of cars) {
      if (v.T.boat) continue;
      const d2 = dist2(v.x, v.z, px, pz);
      if (!v.copsOut && d2 < 22 * 22 && v.speed < 3 && (!P.inCar || P.vehicle.speed < 3)) {
        v.copsOut = true;
        const lx = Math.cos(v.h), lz = -Math.sin(v.h);
        const c1 = G.peds.spawnCop(v.x + lx * (v.hw + 0.8), v.z + lz * (v.hw + 0.8));
        c1.car = v;
        if (this.level >= 2) G.peds.spawnCop(v.x - lx * (v.hw + 0.8), v.z - lz * (v.hw + 0.8)).car = v;
        v.ai.stopped = true;
        v.driver = null;
      }
      if (v.copsOut && d2 > 60 * 60) { v.copsOut = false; }
    }
    // Schüsse aus Streifenwagen ab 3 Sternen
    if (this.level >= 3) for (const v of cars) {
      if (!v.driver || v.copsOut || v.T.boat) continue;
      const d2 = dist2(v.x, v.z, px, pz);
      v.shootT = (v.shootT ?? rand(1, 2)) - dt;
      if (d2 < 30 * 30 && v.shootT <= 0) {
        v.shootT = rand(0.5, 1.1) / (1 + (this.level - 3) * 0.4);
        if (G.world.lineOfSight(v.x, v.y + 1.4, v.z, px, (P.inCar ? P.vehicle.y : P.y) + 1, pz)) G.combat.npcShoot({ x: v.x, y: v.y + 0.2, z: v.z, yaw: Math.atan2(px - v.x, pz - v.z), vehIgnore: v }, px, (P.inCar ? P.vehicle.y + 1 : P.y + 1.2), pz);
      }
    }
    if (this.level >= 3) this.updateRoadblocks(dt, px, pz);
    // Hubschrauber
    this.updateHeli(dt, this.level >= 3);
    // Festnahme
    const cop = G.peds.nearest(px, pz, P.inCar ? 3 : 2.0, (p) => p.isCop && p.alive && p.state === 'cop');
    const slow = P.inCar ? P.vehicle.speed < 1.2 : Math.hypot(P.vx, P.vz) < 3.5;
    if (cop && slow && P.state !== 'dead' && P.state !== 'busted' && this.level <= 3) {
      this.arrestT += dt;
      if (this.arrestT > (P.inCar ? 2.2 : 1.4)) { this.arrestT = 0; P.bust(); }
    } else this.arrestT = Math.max(0, this.arrestT - dt * 2);
    this.siren();
  }

  // Straßensperre vor dem Spieler (2 Streifenwagen quer + Polizisten)
  updateRoadblocks(dt, px, pz) {
    this.blocks = (this.blocks || []).filter((b) => {
      if (dist2(b.x, b.z, px, pz) < 260 * 260) return true;
      for (const v of b.cars) if (!v.removed && v !== G.player.vehicle) v.remove();
      return false;
    });
    this.blockT = (this.blockT ?? 12) - dt;
    const P = G.player;
    if (this.blockT > 0 || this.blocks.length >= 1 || !P.inCar || P.vehicle.speed < 12 || G.world.inHills(px, pz)) return;
    this.blockT = 30 - this.level * 3;
    const v0 = P.vehicle, W = G.world;
    // Knoten in Fahrtrichtung, 90–200 m voraus
    let best = null, bs = -1;
    const fx = Math.sin(v0.h), fz = Math.cos(v0.h);
    for (const n of W.nodes) {
      const dx = n.x - px, dz = n.z - pz, d = Math.hypot(dx, dz);
      if (d < 90 || d > 200) continue;
      const a = (dx * fx + dz * fz) / d;
      if (a > 0.85 && a > bs && !G.peds.inView(n.x, n.z)) { bs = a; best = n; }
    }
    if (!best) return;
    // Sperre auf der Zufahrt (vom Spieler aus kommend), quer zur Straße
    const ax = Math.abs(fx) > Math.abs(fz), sgn = ax ? Math.sign(fx) : Math.sign(fz);
    const bx = best.x - (ax ? sgn * 18 : 0), bz = best.z - (ax ? 0 : sgn * 18);
    const cars = [];
    for (const o of [-4, 4]) {
      const x = bx + (ax ? 0 : o), z = bz + (ax ? o : 0);
      const v = G.vm.spawn('police', x, z, ax ? 0 : Math.PI / 2);
      if (!v) continue;
      v.parked = true; v.persistent = true; v.siren = true; v.police = true;
      cars.push(v);
      G.peds.spawnCop(x + (ax ? sgn * -3 : 0), z + (ax ? 0 : sgn * -3));
    }
    if (cars.length) { this.blocks.push({ x: bx, z: bz, cars }); G.hud.toast('🚧 Polizeifunk: Straßensperre errichtet!'); }
  }

  siren() {
    // Lautstärke der nächsten Sirene
    const cx = G.camera.position.x, cz = G.camera.position.z;
    let best = 1e9;
    for (const v of G.vehicles) if (v.siren && v.alive) best = Math.min(best, dist2(v.x, v.z, cx, cz));
    G.audio.setSiren(best < 1e9 ? clamp(1 - Math.sqrt(best) / 140, 0, 1) : 0);
  }

  // ---------------------------------------------------------- Heli
  buildHeli(scene) {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x1d2e52, roughness: 0.4, metalness: 0.4 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c1a26, metalness: 0.9, roughness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), body); cab.scale.set(1, 0.9, 1.6); g.add(cab);
    const win = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), glass); win.scale.set(1.02, 0.9, 1.3); win.position.set(0, 0.15, 0.9); win.rotation.x = 0.5; g.add(win);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.35, 3.5), white); stripe.position.y = -0.3; g.add(stripe);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 5.5), body); tail.position.set(0, 0.3, -4.5); g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.8), body); fin.position.set(0, 1, -7); g.add(fin);
    for (const sx of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 4), dark); sk.position.set(sx * 1.2, -1.6, 0.2); g.add(sk); }
    this.rotor = new THREE.Group();
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 11), dark); b.rotation.y = k * Math.PI / 4 * 2 / 2 * 1; b.rotation.y = (k * Math.PI) / 2; this.rotor.add(b); }
    this.rotor.position.y = 1.55; g.add(this.rotor);
    this.tailRotor = new THREE.Group();
    for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2, 0.2), dark); b.rotation.x = k * Math.PI / 2; this.tailRotor.add(b); }
    this.tailRotor.position.set(0.25, 1.1, -7); g.add(this.tailRotor);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    this.beacon.position.set(0, -1.4, 0); g.add(this.beacon);
    // Suchscheinwerfer
    const coneGeo = new THREE.ConeGeometry(7, 1, 24, 1, true);
    coneGeo.translate(0, -0.5, 0);
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(coneGeo, this.beamMat);
    this.beam.renderOrder = 7;
    scene.add(this.beam);
    this.spotMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(220,235,255,0.9)', 'rgba(220,235,255,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.spot = new THREE.Mesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), this.spotMat);
    this.spot.renderOrder = 7;
    scene.add(this.spot);
    g.visible = false; this.beam.visible = false; this.spot.visible = false;
    scene.add(g);
    this.heliG = g;
    this.heliPos = new THREE.Vector3(0, 80, 0);
    this.heliVel = new THREE.Vector3();
    this.heliAng = 0; this.heliActive = false; this.heliShootT = 2;
    this.heliHP = 320; this.heliDown = false; this.heliCool = 0;
  }
  heliDamage(dmg, src) {
    if (!this.heliActive || this.heliDown) return;
    this.heliHP -= dmg;
    if (this.heliHP <= 0) {
      this.heliDown = true; this.heliSpin = 0;
      G.hud.toast('🚁 Polizeihubschrauber getroffen – er stürzt ab!');
      if (src === 'player') { this.heat += 10; this.setLevel(Math.min(5, this.level + 1)); G.stats.helisDown = (G.stats.helisDown || 0) + 1; }
    }
  }
  // Absturz: trudelnd, rauchend, Explosion am Boden
  updateHeliCrash(dt) {
    const g = this.heliG;
    this.heliVel.y -= 14 * dt;
    this.heliVel.x *= 0.99; this.heliVel.z *= 0.99;
    this.heliPos.addScaledVector(this.heliVel, dt);
    this.heliSpin += dt * 5;
    g.position.copy(this.heliPos);
    g.rotation.y += dt * this.heliSpin; g.rotation.z = Math.sin(G.time * 3) * 0.4;
    this.rotor.rotation.y += dt * 12; this.beam.visible = false; this.spot.visible = false;
    G.effects.smoke(this.heliPos.x, this.heliPos.y + 1, this.heliPos.z, 2, 0.8);
    G.effects.fire(this.heliPos.x, this.heliPos.y + 0.5, this.heliPos.z, 1);
    const gy = G.world.groundHeight(this.heliPos.x, this.heliPos.z);
    if (this.heliPos.y < Math.max(gy, -0.5) + 1.2) {
      const { x, y, z } = this.heliPos;
      G.effects.explosion(x, y, z, 2.2);
      G.combat.explosionDamage(x, y, z, 12, 260, 'heli', null);
      G.cam.shake(1.2);
      this.heliActive = false; this.heliDown = false; this.heliHP = 320; this.heliCool = 45;
      g.visible = false;
    }
    G.audio.setHeli(0.4);
  }

  updateHeli(dt, want) {
    want = !!want;
    const g = this.heliG, P = G.player;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    if (this.heliDown) { this.updateHeliCrash(dt); return; }
    if (this.heliCool > 0) { this.heliCool -= dt; want = false; }
    if (want && !this.heliActive) {
      this.heliActive = true;
      const a = rand(0, Math.PI * 2);
      this.heliPos.set(px + Math.cos(a) * 220, 70, pz + Math.sin(a) * 220);
      g.visible = true;
    }
    if (!this.heliActive) { G.audio.setHeli(0); return; }
    let tx, tz, ty;
    if (want) {
      this.heliAng += dt * 0.25;
      tx = px + Math.cos(this.heliAng) * 26; tz = pz + Math.sin(this.heliAng) * 26; ty = 42;
    } else {
      tx = this.heliPos.x + (this.heliPos.x - px) * 2; tz = this.heliPos.z + (this.heliPos.z - pz) * 2; ty = 90;
      if (dist2(this.heliPos.x, this.heliPos.z, px, pz) > 400 * 400) { this.heliActive = false; g.visible = false; this.beam.visible = false; this.spot.visible = false; G.audio.setHeli(0); return; }
    }
    const dx = tx - this.heliPos.x, dy = ty - this.heliPos.y, dz = tz - this.heliPos.z;
    const L = Math.hypot(dx, dz);
    const sp = Math.min(32, L * 0.8);
    this.heliVel.x = damp(this.heliVel.x, (dx / (L || 1)) * sp, 1.5, dt);
    this.heliVel.z = damp(this.heliVel.z, (dz / (L || 1)) * sp, 1.5, dt);
    this.heliVel.y = damp(this.heliVel.y, dy * 0.6, 1.5, dt);
    this.heliPos.addScaledVector(this.heliVel, dt);
    g.position.copy(this.heliPos);
    const yaw = Math.atan2(px - this.heliPos.x, pz - this.heliPos.z);
    g.rotation.order = 'YXZ';
    g.rotation.y = dampAngle(g.rotation.y, yaw, 2, dt);
    g.rotation.x = clamp(this.heliVel.length() * 0.012, 0, 0.3);
    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 40;
    this.beacon.visible = Math.floor(G.time * 2) % 2 === 0;
    // Scheinwerfer
    const night = G.world.env.night;
    const sx = damp(this.spot.position.x || px, px, 3, dt), sz = damp(this.spot.position.z || pz, pz, 3, dt);
    const gy = G.world.groundHeight(sx, sz);
    this.spot.position.set(sx, gy + 0.1, sz);
    const hx = this.heliPos.x, hy = this.heliPos.y - 1.2, hz = this.heliPos.z;
    const vx = sx - hx, vy = gy - hy, vz = sz - hz;
    const len = Math.hypot(vx, vy, vz);
    this.beam.position.set(hx, hy, hz);
    this.beam.scale.set(1, len, 1);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(vx / len, vy / len, vz / len));
    const on = want && night > 0.2;
    this.beam.visible = on; this.spot.visible = want;
    this.beamMat.opacity = 0.03 + night * 0.07;
    this.spotMat.opacity = 0.25 + night * 0.75;
    if (want && dist2(hx, hz, px, pz) < 70 * 70) this.spotted();
    // Beschuss bei 5 Sternen
    if (want && this.level >= 5) {
      this.heliShootT -= dt;
      if (this.heliShootT <= 0) { this.heliShootT = rand(0.15, 0.3); G.combat.heliShoot(hx, hy - 0.5, hz, px, (P.inCar ? P.vehicle.y : P.y) + 1, pz); }
    }
    const d = Math.hypot(hx - G.camera.position.x, hy - G.camera.position.y, hz - G.camera.position.z);
    G.audio.setHeli(clamp(1 - d / 180, 0, 1));
  }
}
