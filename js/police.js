// Fahndungslevel, Streifen, Hubschrauber, Festnahme
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, damp, dampAngle, rand, dist2, lerp } from './utils.js';
import { radialTexture } from './textures.js';

const C_HALF = 360;
// Hochwertige Hindernisse: Absperrgitter mit rot-weißen Tafeln und Warnblinker, Leitkegel
let BAR = null;
function barrierParts() {
  if (BAR) return BAR;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4f4f0' : '#d61f1f'; g.beginPath(); g.moveTo(i * 36 - 20, 64); g.lineTo(i * 36 + 16, 0); g.lineTo(i * 36 + 52, 0); g.lineTo(i * 36 + 16, 64); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  BAR = {
    board: new THREE.BoxGeometry(2.2, 0.32, 0.06), boardMat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }),
    leg: new THREE.BoxGeometry(0.08, 1.1, 0.5), legMat: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.4 }),
    lamp: new THREE.SphereGeometry(0.09, 10, 8), lampMat: new THREE.MeshBasicMaterial({ color: 0xffb020 }),
    cone: new THREE.ConeGeometry(0.22, 0.7, 14), coneMat: new THREE.MeshStandardMaterial({ color: 0xff5a14, roughness: 0.5 }),
    band: new THREE.CylinderGeometry(0.13, 0.16, 0.1, 14), bandMat: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4 }),
  };
  return BAR;
}
function barrier(x, y, z, h) {
  const B = barrierParts(), g = new THREE.Group();
  for (const yy of [0.62, 1.02]) { const m = new THREE.Mesh(B.board, B.boardMat); m.position.y = yy; m.castShadow = true; g.add(m); }
  for (const s of [-1, 1]) { const l = new THREE.Mesh(B.leg, B.legMat); l.position.set(s * 0.95, 0.55, 0); g.add(l); }
  for (const s of [-1, 1]) { const l = new THREE.Mesh(B.lamp, B.lampMat); l.position.set(s * 0.95, 1.2, 0); l.userData.blink = s; g.add(l); }
  g.position.set(x, y, z); g.rotation.y = h + Math.PI / 2;
  g.onBeforeRender = () => {};
  const on = () => { const k = Math.floor(G.time * 3) % 2; for (const c of g.children) if (c.userData.blink) c.visible = (c.userData.blink > 0) === (k === 0); };
  g.userData.tick = on; G.scene.add(g);
  BLINK.add(g);
  return g;
}
function cone(x, y, z) {
  const B = barrierParts(), g = new THREE.Group();
  const c = new THREE.Mesh(B.cone, B.coneMat); c.position.y = 0.35; c.castShadow = true; g.add(c);
  const b = new THREE.Mesh(B.band, B.bandMat); b.position.y = 0.42; g.add(b);
  g.position.set(x, y, z); G.scene.add(g);
  return g;
}
const BLINK = new Set();
export function tickBarriers() { for (const g of BLINK) { if (!g.parent) { BLINK.delete(g); continue; } g.userData.tick(); } }

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
    if (type === 'killCop') G.stats.copsKilled = (G.stats.copsKilled || 0) + 1;
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
    for (const b of this.blocks || []) this.removeBlock(b);
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
    if (this.level >= 4) this.updateRoadblocks(dt, px, pz);
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
  // ---------------------------------------------------------- Straßensperren (ab 4 Sternen, Kessel bei 5)
  updateRoadblocks(dt, px, pz) {
    this.blocks = (this.blocks || []).filter((b) => {
      if (dist2(b.x, b.z, px, pz) < 320 * 320 && G.time - b.t < 160) return true;
      this.removeBlock(b); return false;
    });
    const P = G.player;
    // 5 Sterne: gepanzerte Sperrwagen feuern mit dem Dach-MG
    if (this.level >= 5) for (const b of this.blocks) for (const v of b.cars) {
      if (!v.T.mg || !v.alive || v.driver === 'player' || v.removed) continue;
      const tx = P.inCar ? P.vehicle.x : P.x, tz = P.inCar ? P.vehicle.z : P.z, ty = (P.inCar ? P.vehicle.y : P.y) + 1;
      const d = Math.hypot(tx - v.x, tz - v.z);
      if (v.parts.mg) v.parts.mg.rotation.y = Math.atan2(tx - v.x, tz - v.z) - v.h;
      v.mgT = (v.mgT || rand(0.5, 1.2)) - dt;
      if (d < 65 && v.mgT <= 0 && P.state !== 'dead') {
        v.mgT = rand(0.1, 0.2) * (Math.random() < 0.1 ? 8 : 1);
        if (G.world.lineOfSight(v.x, v.y + v.height + 0.4, v.z, tx, ty, tz)) G.combat.npcShoot({ x: v.x, y: v.y + v.height - 1.0, z: v.z, yaw: Math.atan2(tx - v.x, tz - v.z), vehIgnore: v }, tx + rand(-1.2, 1.2), ty, tz + rand(-1.2, 1.2));
      }
    }
    this.blockT = (this.blockT ?? 6) - dt;
    if (this.blockT > 0 || !P.inCar) return;
    const v0 = P.vehicle;
    if (v0.T.boat || v0.T.plane || v0.speed < 6) return;
    const road = this.roadAt(px, pz, v0);
    if (!road) return;
    if (this.level >= 5 && this.blocks.length < 3) {
      this.blockT = 26;
      const ahead = this.along(road, 75), behind = this.along(road, -60);
      if (ahead) this.makeBlock(ahead);
      if (behind) this.makeBlock(behind);
      G.hud.bigToast('EINGEKESSELT', 'Sperren vor und hinter dir!');
    } else if (this.blocks.length < 2) {
      this.blockT = 28;
      const p = this.along(road, 140);
      if (p) { this.makeBlock(p); G.hud.toast('🚧 Polizeifunk: Straßensperre voraus!'); }
    }
  }
  // Straße unter dem Fahrzeug: Mittellinie, Richtung (in Fahrtrichtung), halbe Breite
  roadAt(px, pz, v) {
    const W = G.world, fx = Math.sin(v.h), fz = Math.cos(v.h);
    if (W.inHills(px, pz)) {
      const loc = W.netLocate(px, pz);
      if (!loc || loc.d > 14) return null;
      const E = W.net.edges[loc.edge], i = Math.max(1, Math.min(E.pts.length - 2, loc.idx));
      const a = E.pts[i - 1], b = E.pts[i + 1];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const sg = dx * fx + dz * fz >= 0 ? 1 : -1;
      return { net: true, E, i, dir: sg, x: E.pts[i][0], z: E.pts[i][1], dx: dx * sg, dz: dz * sg, hw: E.town ? 7.5 : 6 };
    }
    const alongX = Math.abs(fx) > Math.abs(fz);
    const snap = (q) => -C_HALF + Math.round((q + C_HALF) / 80) * 80;
    if (alongX) return { x: px, z: snap(pz), dx: Math.sign(fx), dz: 0, hw: 8 };
    return { x: snap(px), z: pz, dx: 0, dz: Math.sign(fz), hw: 8 };
  }
  along(r, dist) {
    if (!r.net) {
      const x = r.x + r.dx * dist, z = r.z + r.dz * dist;
      if (x < -640 || x > 372 || z < -384 || z > 384) return null;
      return { x, z, dx: r.dx, dz: r.dz, hw: r.hw, side: 12 };
    }
    // im Landstraßennetz entlang der Kante laufen
    const E = r.E, step = Math.sign(dist) * r.dir; let i = r.i, left = Math.abs(dist);
    while (left > 0 && i + step > 0 && i + step < E.pts.length - 1) { left -= Math.hypot(E.pts[i + step][0] - E.pts[i][0], E.pts[i + step][1] - E.pts[i][1]); i += step; }
    if (left > 40) return null;
    const a = E.pts[i - 1], b = E.pts[i + 1]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1;
    return { x: E.pts[i][0], z: E.pts[i][1], dx: dx / l, dz: dz / l, hw: r.hw, side: r.hw + 1.5 };
  }
  makeBlock(p) {
    const W = G.world, px = -p.dz, pz = p.dx, cars = [], props = [], cols = [];
    const n = Math.max(2, Math.ceil((2 * p.hw) / 4.3));
    for (let k = 0; k < n; k++) {
      const off = -p.hw + 2.1 + (k * (2 * p.hw - 4.2)) / Math.max(1, n - 1);
      const x = p.x + px * off, z = p.z + pz * off;
      if (G.vehicles.some((o) => dist2(o.x, o.z, x, z) < 9)) continue;
      const v = G.vm.spawn(this.level >= 5 && k % 2 ? 'kodiak' : 'police', x, z, Math.atan2(px, pz) + (k % 2 ? Math.PI : 0), this.level >= 5 && k % 2 ? 0x1b2b48 : undefined);
      if (!v) continue;
      v.parked = true; v.persistent = true; v.siren = true; v.police = true; v.roadblock = true; v.mass = v.T.mass * 9;
      cars.push(v);
    }
    // Absperrgitter auf Bankett/Gehweg, damit niemand außen herum fährt
    for (const s of [-1, 1]) for (let q = 0; q < 2; q++) {
      const off = s * (p.hw + 1.4 + q * 2.4), x = p.x + px * off, z = p.z + pz * off, y = W.groundHeight(x, z);
      props.push(barrier(x, y, z, Math.atan2(px, pz)));
      for (let t = -1; t <= 1; t++) cols.push(W.addCircle(x + px * t * 0.9, z + pz * t * 0.9, 0.65, y + 1.4, 'barrier'));
    }
    for (let k = 0; k < 4; k++) { const o = -p.hw + 2 + k * (2 * p.hw - 4) / 3; const x = p.x + px * o - p.dx * 3.5, z = p.z + pz * o - p.dz * 3.5; props.push(cone(x, W.groundHeight(x, z), z)); }
    // Polizisten hinter der Sperre
    for (let k = 0; k < (this.level >= 5 ? 4 : 2); k++) { const o = rand(-p.hw, p.hw); G.peds.spawnCop(p.x + px * o + p.dx * 4, p.z + pz * o + p.dz * 4); }
    this.blocks.push({ x: p.x, z: p.z, cars, props, cols, t: G.time });
  }
  removeBlock(b) {
    for (const v of b.cars) if (!v.removed && v !== G.player.vehicle) v.remove(); else { v.persistent = false; v.mass = v.T.mass; }
    for (const m of b.props) G.scene.remove(m);
    for (const c of b.cols) c.alive = false;
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
