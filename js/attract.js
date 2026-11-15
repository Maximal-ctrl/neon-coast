// Titelbild-Regie (3.13): wechselnde Action-Szenen hinter dem Hauptmenü –
// Verfolgungsjagd, Bandenkrieg gegen die Polizei, Tiefflug durch die Häuserschluchten
// und (selten) ein Linienflugzeug, das in einen Turm stürzt.
import * as THREE from 'three';
import { G } from './state.js';
import { LOOKS } from './missions.js';
import { rand, dist2, clamp } from './utils.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
// mehrere Versuche, weil die Verkehrs-Erzeugung zufällige Kanten prüft
const trySpawn = (px, pz, minD, maxD, key, mode, n = 60) => { for (let k = 0; k < n; k++) { const v = G.traffic.spawnCar(px, pz, minD, maxD, key, mode); if (v) return v; } return null; };
const _v = new THREE.Vector3();

export class Attract {
  constructor() {
    this.scene = null; this.t = 0; this.objs = []; this.peds = []; this.meshes = []; this.debris = [];
    this.camP = new THREE.Vector3(); this.camL = new THREE.Vector3(); this.camInit = false;
    this.last = null; this.count = 0; this.shake = 0;
  }
  // ------------------------------------------------------------ Steuerung
  update(dt) {
    if (!this.scene || this.t > this.scene.len || (this.scene.done && this.scene.done())) this.next();
    this.t += dt;
    try { this.scene.update(dt); } catch (e) { console.warn('Titelszene:', e); this.scene.len = 0; }
    this.updateDebris(dt);
    // weiche Kamera
    const cam = G.camera;
    if (!this.camInit) { cam.position.copy(this.camP); this.lookCur = this.camL.clone(); this.camInit = true; }
    const k = 1 - Math.exp(-dt * (this.scene.camK || 3));
    cam.position.lerp(this.camP, k);
    this.lookCur.lerp(this.camL, 1 - Math.exp(-dt * (this.scene.lookK || 5)));
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const s = this.shake * this.shake;
    cam.position.x += (Math.random() - 0.5) * s * 1.6; cam.position.y += (Math.random() - 0.5) * s * 1.2;
    cam.lookAt(this.lookCur);
    cam.fov = this.scene.fov || 55; cam.updateProjectionMatrix();
    G.cam.updateVectors();
    // Hörposition = Spielerposition (für Fahrzeug- und Umgebungsgeräusche)
    const f = this.scene.focus && this.scene.focus();
    if (f) { G.player.x = f.x; G.player.z = f.z; }
    const cap = $cap();
    if (cap && this.scene.caption && cap.dataset.s !== this.scene.caption) { cap.dataset.s = this.scene.caption; cap.innerHTML = `<i></i>${this.scene.caption}`; cap.classList.remove('show'); void cap.offsetWidth; cap.classList.add('show'); }
  }
  next() {
    this.cleanup();
    const pool = ['chase', 'war', 'fly', 'chase', 'war'];
    let key = this.count >= 2 && Math.random() < 0.14 ? 'crash' : pick(pool.filter((k) => k !== this.last));
    if (!this.count) key = 'chase';
    this.count++; this.last = key; this.t = 0;
    this.scene = this['scene_' + key]();
    if (!this.scene) this.scene = this.scene_orbit();
    this.camInit = false;
  }
  stop() { this.cleanup(); this.scene = null; const cap = $cap(); if (cap) cap.classList.remove('show'); }
  cleanup() {
    for (const v of this.objs) if (v && !v.removed && v.remove) v.remove();
    for (const p of this.peds) if (p && !p.removed) G.peds.remove(p);
    for (const m of this.meshes) { m.parent && m.parent.remove(m); }
    for (const d of this.debris) d.m.parent && d.m.parent.remove(d.m);
    this.objs = []; this.peds = []; this.meshes = []; this.debris = [];
  }
  car(v) { if (v) { v.persistent = true; this.objs.push(v); } return v; }

  // ------------------------------------------------------------ Szene: Kamerafahrt (Rückfall)
  scene_orbit() {
    return { len: 14, caption: 'PORT SOLERA', update: (dt) => { const a = G.time * 0.035, r = 260; this.camP.set(Math.cos(a) * r + 60, 75, Math.sin(a) * r); this.camL.set(40, 25, 0); }, focus: () => ({ x: 40, z: 0 }) };
  }
  // ------------------------------------------------------------ Szene: Verfolgungsjagd
  scene_chase() {
    const c = pick([[0, -150], [120, 60], [-150, 0], [200, -220], [-60, 180]]);
    G.player.x = c[0]; G.player.z = c[1];
    const runner = this.car(trySpawn(c[0], c[1], 10, 320, pick(['vortex', 'zephyra', 'brutus']), 'chase'));
    if (!runner) return null;
    runner.ai.mode = 'flee'; runner.ai.cruise = 29; runner.missionTarget = true;
    runner.ai.fleeFrom = { x: runner.x - Math.sin(runner.h) * 60, z: runner.z - Math.cos(runner.h) * 60, removed: false };
    if (runner.driver && runner.driver.isPed) runner.driver.look = LOOKS.gang(0x1d6f6a);
    const cops = [];
    let copT = 0.4;
    let side = 1, sideT = 0;
    return {
      len: 22, caption: 'VERFOLGUNGSJAGD · DOWNTOWN', fov: 58, camK: 4,
      focus: () => runner,
      done: () => !runner.alive || runner.removed,
      update: (dt) => {
        copT -= dt;
        if (cops.length < 3 && copT <= 0) {
          copT = 1.6;
          const v = this.car(trySpawn(runner.x, runner.z, 30, 160, 'police', 'chase', 25));
          if (v) { v.siren = true; v.police = true; v.ai.target = runner; v.ai.cruise = 33; cops.push(v); if (cops.length === 1) runner.ai.fleeFrom = v; }
        }
        // Wagen ohne KI hinterherschieben
        for (const v of cops) if (!v.ai && v.alive) { const dx = runner.x - v.x, dz = runner.z - v.z, L = Math.hypot(dx, dz) || 1; v.h = Math.atan2(dx, dz); const sp = Math.min(30, L * 0.9); v.vx = dx / L * sp; v.vz = dz / L * sp; }
        if (runner.ai) runner.ai.cruise = 29;
        sideT -= dt; if (sideT <= 0) { sideT = rand(4, 7); side = -side; }
        const fx = Math.sin(runner.h), fz = Math.cos(runner.h), lx = Math.cos(runner.h), lz = -Math.sin(runner.h);
        const phase = this.t % 11;
        if (phase < 5.5) { this.camP.set(runner.x - fx * 13 + lx * 4 * side, runner.y + 4.2, runner.z - fz * 13 + lz * 4 * side); this.camL.set(runner.x + fx * 8, runner.y + 1, runner.z + fz * 8); }
        else { this.camP.set(runner.x + fx * 16 + lx * 7 * side, runner.y + 2.2, runner.z + fz * 16 + lz * 7 * side); this.camL.set(runner.x - fx * 6, runner.y + 0.9, runner.z - fz * 6); }
      },
    };
  }
  // ------------------------------------------------------------ Szene: Bandenkrieg gegen die Polizei
  scene_war() {
    const W = G.world, c = pick([[40, -80], [180, 30], [-140, -60], [100, 160], [-60, 240]]);
    const n = W.nearestNode(c[0], c[1]), cx = n.x, cz = n.z;
    G.player.x = cx; G.player.z = cz;
    const gangs = [], cops = [];
    const ax = rand(0, 6.28), gx = cx + Math.cos(ax) * 13, gz = cz + Math.sin(ax) * 13, kx = cx - Math.cos(ax) * 14, kz = cz - Math.sin(ax) * 14;
    for (let k = 0; k < 5; k++) { const p = G.peds.spawnAt(gx + rand(-4, 4), gz + rand(-4, 4), LOOKS.gang(0x1d6f6a), 'mission'); p.isGang = true; p.weapon = 'smg'; p.anim.gun = true; p.health = 70; p.persistent = true; gangs.push(p); this.peds.push(p); }
    for (let k = 0; k < 2; k++) { const v = this.car(G.vm.spawn('police', kx + Math.sin(ax) * (k ? 5 : -5), kz - Math.cos(ax) * (k ? 5 : -5), ax + Math.PI / 2)); if (v) { v.siren = true; v.parked = true; } }
    const gv = this.car(G.vm.spawn(pick(['brutus', 'atlas']), gx + Math.sin(ax) * 6, gz - Math.cos(ax) * 6, ax + Math.PI / 2, 0x1d6f6a)); if (gv) gv.parked = true;
    for (let k = 0; k < 4; k++) { const p = G.peds.spawnCop(kx + rand(-4, 4), kz + rand(-4, 4)); p.persistent = true; p.state = 'mission'; cops.push(p); this.peds.push(p); }
    let boomT = rand(7, 11), boomed = false, reinfT = 6;
    const fight = (A, B, dt, rate) => {
      for (const s of A) {
        if (!s.alive || s.removed) continue;
        let best = null, bd = 60 * 60;
        for (const t of B) { if (!t.alive || t.removed) continue; const d = dist2(s.x, s.z, t.x, t.z); if (d < bd) { bd = d; best = t; } }
        if (!best) continue;
        s.yaw = Math.atan2(best.x - s.x, best.z - s.z); s.anim.gun = true; s.anim.aim = true;
        s.shootT = (s.shootT ?? rand(0.2, 1.4)) - dt;
        if (s.shootT <= 0) { s.shootT = rand(rate * 0.6, rate * 1.4); G.combat.npcShoot(s, best.x, best.y + 1.2, best.z); }
      }
    };
    return {
      len: 22, caption: 'BANDENKRIEG · SOLERA-GANG GEGEN DIE POLIZEI', fov: 52, camK: 2,
      focus: () => ({ x: cx, z: cz }),
      update: (dt) => {
        fight(gangs, cops, dt, 0.7); fight(cops, gangs, dt, 0.9);
        reinfT -= dt;
        if (reinfT <= 0) {
          reinfT = 5;
          if (cops.filter((p) => p.alive).length < 3) for (let k = 0; k < 2; k++) { const p = G.peds.spawnCop(kx + rand(-6, 6), kz + rand(-6, 6)); p.persistent = true; p.state = 'mission'; cops.push(p); this.peds.push(p); }
          if (gangs.filter((p) => p.alive).length < 3) for (let k = 0; k < 2; k++) { const p = G.peds.spawnAt(gx + rand(-5, 5), gz + rand(-5, 5), LOOKS.gang(0x1d6f6a), 'mission'); p.isGang = true; p.weapon = 'smg'; p.anim.gun = true; p.health = 70; gangs.push(p); this.peds.push(p); }
        }
        boomT -= dt;
        if (!boomed && boomT <= 0) { boomed = true; const v = this.objs.find((o) => o && o.alive && !o.removed); if (v) { v.damage(99999, null); v.explode && v.explode(); this.shake = 0.9; } }
        const a = this.t * 0.11 + ax, r = 21 - this.t * 0.25;
        this.camP.set(cx + Math.cos(a) * r, G.world.groundHeight(cx, cz) + 5.5 + Math.sin(this.t * 0.3), cz + Math.sin(a) * r);
        this.camL.set(cx, G.world.groundHeight(cx, cz) + 1.4, cz);
      },
    };
  }
  // ------------------------------------------------------------ Szene: Tiefflug durch die Häuserschluchten
  scene_fly() {
    const xs = pick([40, -120]), dir = Math.random() < 0.5 ? 1 : -1;
    const path = dir > 0 ? [[xs, 95, -480], [xs, 38, -220], [xs, 34, -60], [xs, 34, 100], [xs, 40, 220], [xs, 110, 520]] : [[xs, 110, 520], [xs, 40, 220], [xs, 34, 100], [xs, 34, -60], [xs, 38, -220], [xs, 95, -480]];
    const pts = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength(), speed = 58;
    const v = this.car(G.vm.spawn('albatros', pts[0].x, pts[0].z, 0, pick([0xffd23f, 0xffffff, 0xe63946])));
    if (!v) return null;
    v.remote = true; v.grounded = false; v.vx = v.vz = 0;
    let s = 0, passed = false;
    const camSpot = curve.getPointAt(0.3).clone();
    const side = Math.random() < 0.5 ? 1 : -1;
    camSpot.x += side * 7; camSpot.y = G.world.groundHeight(camSpot.x, camSpot.z) + 3;
    return {
      len: len / speed + 1.5, caption: 'TIEFFLUG · ZWISCHEN DEN TÜRMEN', fov: 62, camK: 6, lookK: 7,
      focus: () => v,
      update: (dt) => {
        s = Math.min(1, s + (speed * dt) / len);
        const p = curve.getPointAt(s), q = curve.getPointAt(Math.min(1, s + 0.01)), tg = q.clone().sub(p);
        v.x = p.x; v.y = p.y; v.z = p.z; v.h = Math.atan2(tg.x, tg.z); v.pitch = Math.atan2(tg.y, Math.hypot(tg.x, tg.z));
        v.roll = Math.sin(this.t * 0.9) * 0.25; v.vx = v.vz = 0;
        if (v.parts && v.parts.prop) v.parts.prop.rotation.z += dt * 60;
        const d = Math.hypot(p.x - camSpot.x, p.z - camSpot.z);
        if (!passed && s > 0.31) { passed = true; if (G.audio.whoosh) G.audio.whoosh(); }
        if (s < 0.33) { this.camP.copy(camSpot); this.camL.set(p.x, p.y, p.z); }
        else { const fx = Math.sin(v.h), fz = Math.cos(v.h); this.camP.set(p.x - fx * 22, p.y + 5, p.z - fz * 22); this.camL.set(p.x + fx * 10, p.y, p.z + fz * 10); }
        void d;
      },
    };
  }
  // ------------------------------------------------------------ Szene (selten): Linienflugzeug stürzt in einen Turm
  scene_crash() {
    const W = G.world;
    let tower = null;
    for (const b of W.boxes || []) { if (b.kind !== 'bld') continue; const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; if (Math.abs(cx) > 320 || cz < -340 || cz > 240) continue; if (!tower || b.y1 > tower.y1) tower = b; }
    if (!tower || tower.y1 < 40) return null;
    const tx = (tower.x0 + tower.x1) / 2, tz = (tower.z0 + tower.z1) / 2, hy = tower.y1 * 0.72;
    const ang = rand(0, Math.PI * 2), fdx = Math.cos(ang), fdz = Math.sin(ang);
    // Aufschlagpunkt an der Fassade
    const hw = (tower.x1 - tower.x0) / 2, hd = (tower.z1 - tower.z0) / 2;
    const tHit = Math.min(Math.abs(hw / (fdx || 1e-6)), Math.abs(hd / (fdz || 1e-6)));
    const hit = new THREE.Vector3(tx - fdx * tHit, hy, tz - fdz * tHit);
    const start = new THREE.Vector3(hit.x - fdx * 900, hy + 140, hit.z - fdz * 900);
    const jet = airliner(); jet.position.copy(start); G.scene.add(jet); this.meshes.push(jet);
    G.player.x = tx; G.player.z = tz;
    // Kamera: seitlich, gut 150 m entfernt
    const cs = Math.random() < 0.5 ? 1 : -1, camX = hit.x - fdx * 60 + -fdz * 150 * cs, camZ = hit.z - fdz * 60 + fdx * 150 * cs;
    let phase = 0, burnT = 0, copT = 3, cops = 0, boomQ = [];
    const fireAt = [];
    return {
      len: 30, caption: 'EILMELDUNG · FLUGZEUG STÜRZT IN DOWNTOWN-TURM', fov: 50, camK: 1.5, lookK: 2.5,
      focus: () => ({ x: hit.x * 0.6 + camX * 0.4, z: hit.z * 0.6 + camZ * 0.4 }),
      update: (dt) => {
        if (phase === 0) {
          const d = start.distanceTo(hit), k = Math.min(1, (this.t * 95) / d);
          jet.position.lerpVectors(start, hit, k);
          jet.lookAt(hit.x + fdx * 10, hit.y - 1.5, hit.z + fdz * 10);
          jet.rotateZ(Math.sin(this.t * 0.7) * 0.06);
          this.camP.set(camX, G.world.groundHeight(camX, camZ) + 30, camZ);
          this.camL.set(jet.position.x * 0.5 + hit.x * 0.5, hy, jet.position.z * 0.5 + hit.z * 0.5);
          if (k > 0.86 && !this.roared) { this.roared = true; if (G.audio.whoosh) G.audio.whoosh(); }
          if (k >= 1) {
            phase = 1; jet.visible = false; this.roared = false;
            const ax = hit.x * 0.75 + camX * 0.25, az = hit.z * 0.75 + camZ * 0.25; // Ton etwas näher an der Kamera
            G.effects.explosion(hit.x, hit.y, hit.z, 3.2); G.audio.explosion(ax, az); G.audio.explosion(ax, az);
            G.effects.light(hit.x, hit.y, hit.z, 120, 1.6, 0xff7a2a);
            this.shake = 1.4;
            for (let k2 = 1; k2 <= 5; k2++) boomQ.push([k2 * rand(0.35, 0.7), hit.x + fdx * rand(4, 16) + rand(-6, 6), hit.y + rand(-8, 6), hit.z + fdz * rand(4, 16) + rand(-6, 6)]);
            for (let k2 = 0; k2 < 46; k2++) this.addDebris(hit.x, hit.y, hit.z, fdx, fdz);
            for (let k2 = 0; k2 < 6; k2++) fireAt.push([hit.x + rand(-hw, hw) * 0.8, hy + rand(-6, 6), hit.z + rand(-hd, hd) * 0.8]);
          }
        } else {
          burnT += dt;
          for (let i = boomQ.length - 1; i >= 0; i--) { boomQ[i][0] -= dt; if (boomQ[i][0] <= 0) { const [, x, y, z] = boomQ[i]; G.effects.explosion(x, y, z, 1.6); G.audio.explosion(x * 0.7 + camX * 0.3, z * 0.7 + camZ * 0.3); this.shake = Math.max(this.shake, 0.6); boomQ.splice(i, 1); } }
          for (const f of fireAt) { if (Math.random() < 0.8) G.effects.fire(f[0] + rand(-3, 3), f[1], f[2] + rand(-3, 3), 2); if (Math.random() < 0.55) G.effects.smoke(f[0], f[1] + 4, f[2], 2, 0.12); }
          if (Math.random() < 0.3) G.effects.smoke(hit.x + rand(-8, 8), tower.y1 + rand(0, 10), hit.z + rand(-8, 8), 2, 0.1);
          // Polizei rückt an
          copT -= dt;
          if (copT <= 0 && cops < 6) {
            copT = 1.4; cops++;
            const a = rand(0, 6.28), r = 30 + rand(0, 12), x = tx + Math.cos(a) * r, z = tz + Math.sin(a) * r;
            const v = this.car(G.vm.spawn(pick(['police', 'police', 'kodiak']), x + Math.cos(a) * 40, z + Math.sin(a) * 40, a + Math.PI));
            if (v) { v.siren = true; v.police = true; v.parked = true; v.vx = -Math.cos(a) * 14; v.vz = -Math.sin(a) * 14; }
            if (cops % 2) for (let k2 = 0; k2 < 2; k2++) { const p = G.peds.spawnCop(x + rand(-3, 3), z + rand(-3, 3)); p.persistent = true; p.state = 'mission'; p.yaw = Math.atan2(tx - p.x, tz - p.z); this.peds.push(p); }
          }
          // langsam heranfahren
          const k = Math.min(1, burnT / 22);
          this.camP.set(camX * (1 - k * 0.35) + hit.x * k * 0.35, G.world.groundHeight(camX, camZ) + 30 - k * 14, camZ * (1 - k * 0.35) + hit.z * k * 0.35);
          this.camL.set(hit.x, hy - k * 18, hit.z);
        }
      },
    };
  }
  // Trümmer: kleine Betonbrocken und Glas, fallen mit Schwerkraft
  addDebris(x, y, z, fdx, fdz) {
    const g = DEB || (DEB = { geo: new THREE.BoxGeometry(1, 1, 1), mats: [new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x2b3240, roughness: 0.3, metalness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.6 })] });
    const m = new THREE.Mesh(g.geo, pick(g.mats)); const s = rand(0.4, 1.8); m.scale.set(s, s * rand(0.3, 1), s * rand(0.5, 1.4));
    m.position.set(x, y, z); m.castShadow = true; G.scene.add(m);
    this.debris.push({ m, v: new THREE.Vector3(fdx * rand(4, 18) + rand(-9, 9), rand(-2, 12), fdz * rand(4, 18) + rand(-9, 9)), r: new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4)), smoke: Math.random() < 0.35 });
  }
  updateDebris(dt) {
    for (const d of this.debris) {
      if (d.rest) continue;
      d.v.y -= 18 * dt; d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.r.x * dt; d.m.rotation.y += d.r.y * dt; d.m.rotation.z += d.r.z * dt;
      if (d.smoke && Math.random() < 0.5) G.effects.smoke(d.m.position.x, d.m.position.y, d.m.position.z, 1, 0.15);
      const gy = G.world.groundHeight(d.m.position.x, d.m.position.z) + 0.3;
      if (d.m.position.y <= gy) { d.m.position.y = gy; if (Math.abs(d.v.y) > 6) { d.v.y *= -0.25; d.v.x *= 0.5; d.v.z *= 0.5; G.effects.dust(d.m.position.x, gy, d.m.position.z, 3, [0.5, 0.5, 0.5]); } else d.rest = true; }
    }
  }
}
let DEB = null;
const $cap = () => document.getElementById('title-cap');

// einfaches Linienflugzeug (eigenes Design): Rumpf, Flügel, Leitwerk, Triebwerke
function airliner() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.4, metalness: 0.2 }), blue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 }), dark = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.5, metalness: 0.5 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(2.3, 2.3, 34, 18), white, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(2.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0, 17, Math.PI / 2);
  add(new THREE.ConeGeometry(2.3, 7, 18), white, 0, 0.4, -20.5, -Math.PI / 2);
  add(new THREE.BoxGeometry(4.7, 0.5, 34.2), blue, 0, -0.4, 0).scale.set(1, 1, 1);
  add(new THREE.BoxGeometry(36, 0.45, 6), white, 0, -0.9, 1, 0, 0, 0);
  add(new THREE.BoxGeometry(12, 0.35, 3.4), white, 0, 1.2, -19.5);
  add(new THREE.BoxGeometry(0.4, 7, 4.6), blue, 0, 4.4, -19.5, 0.35);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(1.05, 0.9, 4.6, 14), dark, s * 7.5, -2.3, 2.4, Math.PI / 2);
  for (let k = -6; k <= 6; k++) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.45, 0.6), dark, s * 2.28, 0.9, k * 2.2);
  return g;
}
