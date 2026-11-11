import * as THREE from 'three';
// Waffen, Treffer, Explosionsschaden
import { G } from './state.js';
import { rayBox, rayVeh, rayChar } from './physics.js';
import { rand, dist2, clamp } from './utils.js';

export const WEAPONS = {
  fists: { name: 'Fäuste', icon: 'fist', melee: true, dmg: 18, rate: 0.42, range: 1.9 },
  pistol: { name: 'Pistole', icon: 'pistol', dmg: 30, rate: 0.26, spread: 0.012, range: 95, price: 400, ammoPrice: 60, ammoPack: 24, mag: 12, reload: 1.3 },
  smg: { name: 'Maschinenpistole', icon: 'smg', dmg: 15, rate: 0.085, spread: 0.035, range: 70, auto: true, twoHand: true, price: 1500, ammoPrice: 120, ammoPack: 90, mag: 30, reload: 1.7 },
  shotgun: { name: 'Schrotflinte', icon: 'shotgun', dmg: 13, pellets: 8, rate: 0.85, spread: 0.075, range: 35, twoHand: true, price: 2200, ammoPrice: 150, ammoPack: 16, mag: 6, reload: 2.3 },
  rifle: { name: 'Sturmgewehr', icon: 'rifle', dmg: 34, rate: 0.12, spread: 0.014, range: 130, auto: true, twoHand: true, price: 4500, ammoPrice: 250, ammoPack: 90, mag: 30, reload: 1.9 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'];

// Waffen-Aufsätze (Waffenladen → „Aufsätze“)
export const WMODS = {
  mag: { name: 'Erweitertes Magazin', icon: '🧱', base: 600, desc: '+60 % Schuss pro Magazin – seltener nachladen.' },
  scope: { name: 'Zielfernrohr', icon: '🔭', base: 900, desc: 'Starker Zoom beim Zielen, präziser, 40 % mehr Reichweite.' },
  dmg1: { name: 'Hohlspitz-Munition', icon: '💥', base: 1200, desc: '+20 % Schaden.' },
  dmg2: { name: 'Panzerbrechende Munition', icon: '☢️', base: 2600, req: 'dmg1', desc: '+45 % Schaden (statt +20 %). Setzt Hohlspitz voraus.' },
  supp: { name: 'Schalldämpfer', icon: '🤫', base: 1000, desc: 'Leise: Passanten bemerken weniger, Polizei reagiert nur in der Nähe.' },
  laser: { name: 'Laservisier', icon: '🔴', base: 500, desc: '35 % weniger Streuung.' },
  grip: { name: 'Kompensator & Griff', icon: '✊', base: 700, desc: 'Halber Rückstoß, 12 % schnellere Schussfolge.' },
};
const WMUL = { pistol: 1, smg: 1.5, shotgun: 1.6, rifle: 2.2 };
export const wmodPrice = (w, m) => Math.round((WMODS[m].base * WMUL[w]) / 50) * 50;
export function wstats(wkey, mods) {
  const w = WEAPONS[wkey], m = mods || {};
  return {
    dmg: w.dmg * (m.dmg2 ? 1.45 : m.dmg1 ? 1.2 : 1), spread: (w.spread || 0) * (m.laser ? 0.65 : 1) * (m.scope ? 0.6 : 1),
    rate: w.rate / (m.grip ? 1.12 : 1), range: (w.range || 0) * (m.scope ? 1.4 : 1), mag: Math.round((w.mag || 1) * (m.mag ? 1.6 : 1)),
    reload: w.reload || 1.5, quiet: !!m.supp, scope: !!m.scope, kick: m.grip ? 0.5 : 1,
  };
}

const _b = [];
const hit = { t: 0, type: null, obj: null, x: 0, y: 0, z: 0 };

const SHELL_GEO = new THREE.SphereGeometry(0.18, 8, 6);
const SHELL_MAT = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2, 1) });
const _qb = [], _qc = [];

export class Combat {
  // Strahltest gegen Welt, Fahrzeuge, Figuren
  raycast(ox, oy, oz, dx, dy, dz, maxT, ignore = null, includePlayer = false) {
    let best = maxT, type = null, obj = null;
    const W = G.world;
    // Welt (entlang des Strahls abtasten)
    W.stamp++;
    const st = W.stamp;
    for (let s = 0; s <= maxT; s += 12) {
      const x = ox + dx * s, z = oz + dz * s;
      const cs = W.cellSize;
      for (let cx = Math.floor((x - 8) / cs); cx <= Math.floor((x + 8) / cs); cx++)
        for (let cz = Math.floor((z - 8) / cs); cz <= Math.floor((z + 8) / cs); cz++) {
          const c = W.cells.get(W._cellKey(cx, cz));
          if (!c) continue;
          for (const b of c.b) {
            if (b.s === st) continue; b.s = st;
            const t = rayBox(ox, oy, oz, dx, dy, dz, b, best);
            if (t >= 0 && t < best) { best = t; type = 'world'; obj = b; }
          }
        }
      if (s > best) break;
    }
    // Boden
    if (dy < -1e-4) {
      const gy = W.groundHeight(ox, oz);
      const t = (gy - oy) / dy;
      if (t > 0 && t < best) { best = t; type = 'ground'; obj = null; }
    }
    for (const v of G.vehicles) {
      if (v === ignore || v.sinking) continue;
      if (dist2(v.x, v.z, ox, oz) > (maxT + 5) * (maxT + 5)) continue;
      const t = rayVeh(ox, oy, oz, dx, dy, dz, v, best);
      if (t >= 0 && t < best) { best = t; type = 'veh'; obj = v; }
    }
    for (const p of G.peds.list) {
      if (p === ignore) continue;
      const lying = p.lie > 0.5;
      const t = rayChar(ox, oy, oz, dx, dy, dz, p.x, p.y, p.z, lying ? 0.6 : 0.42, lying ? 0.4 : 1.85, best);
      if (t >= 0 && t < best) { best = t; type = 'ped'; obj = p; }
    }
    // Polizeihubschrauber (Kugel um den Rumpf)
    const PL = G.police;
    if (PL && PL.heliActive && !PL.heliDown) {
      const c = PL.heliPos, ex = c.x - ox, ey = c.y - oy, ez = c.z - oz;
      const tc = ex * dx + ey * dy + ez * dz;
      if (tc > 0 && tc < best) {
        const d2 = ex * ex + ey * ey + ez * ez - tc * tc, r = 2.8;
        if (d2 < r * r) { const t = tc - Math.sqrt(r * r - d2); if (t > 0 && t < best) { best = t; type = 'heli'; obj = PL; } }
      }
    }
    if (includePlayer) {
      const P = G.player;
      if (P.state === 'foot' || P.state === 'knock' || P.state === 'swim') {
        const t = rayChar(ox, oy, oz, dx, dy, dz, P.x, P.y, P.z, 0.45, 1.85, best);
        if (t >= 0 && t < best) { best = t; type = 'player'; obj = P; }
      }
    }
    hit.t = best; hit.type = type; hit.obj = obj;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    return hit;
  }

  // Panzergranate abfeuern
  fireShell(v) {
    if (!this.shells) this.shells = [];
    const b = v.parts.barrel;
    v.group.updateMatrixWorld(true);
    const tip = new THREE.Vector3(0, 0, 4.6).applyMatrix4(b.matrixWorld);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(b.matrixWorld).normalize();
    const mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    mesh.position.copy(tip); G.scene.add(mesh);
    this.shells.push({ p: tip.clone(), v: dir.multiplyScalar(95), t: 0, mesh, src: v.driver === 'player' ? 'player' : 'npc', veh: v });
    G.effects.muzzle(tip.x, tip.y, tip.z); G.effects.smoke(tip.x, tip.y, tip.z, 6, 0.5);
    G.effects.light(tip.x, tip.y, tip.z, 6, 0.15);
    G.audio.explosion(tip.x, tip.z);
    if (v.driver === 'player') { G.cam.shake(0.6); G.police.crime('shoot'); }
    v.vx -= Math.sin(v.h) * 0.6; v.vz -= Math.cos(v.h) * 0.6;
  }
  updateShells(dt) {
    if (!this.shells || !this.shells.length) return;
    const W = G.world;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const steps = 3;
      let hit = false;
      for (let k = 0; k < steps && !hit; k++) {
        const h = dt / steps;
        s.v.y -= 9.8 * 0.35 * h;
        s.p.addScaledVector(s.v, h);
        if (s.p.y <= W.groundHeight(s.p.x, s.p.z) + 0.1 || s.t > 4) hit = true;
        W.query(s.p.x, s.p.z, 1, _qb, _qc);
        for (const b of _qb) if (s.p.x > b.x0 && s.p.x < b.x1 && s.p.z > b.z0 && s.p.z < b.z1 && s.p.y < b.y1 && s.p.y > b.y0) hit = true;
        _qb.length = 0; _qc.length = 0;
        for (const v of G.vehicles) if (v !== s.veh && Math.abs(v.x - s.p.x) < v.hl + 0.6 && Math.abs(v.z - s.p.z) < v.hl + 0.6 && s.p.y < v.y + v.height + 0.5 && s.p.y > v.y - 0.5) hit = true;
        for (const p of G.peds.list) if (p.alive && (p.x - s.p.x) ** 2 + (p.z - s.p.z) ** 2 < 1.2 && s.p.y < p.y + 2 && s.p.y > p.y - 0.2) hit = true;
        const PL = G.police;
        if (PL.heliActive && !PL.heliDown && PL.heliPos.distanceTo(s.p) < 4) hit = true;
      }
      s.mesh.position.copy(s.p);
      if (Math.random() < 0.7) G.effects.smoke(s.p.x, s.p.y, s.p.z, 1, 0.3);
      if (hit) {
        G.scene.remove(s.mesh);
        this.shells.splice(i, 1);
        G.effects.explosion(s.p.x, s.p.y, s.p.z, 1.6);
        this.explosionDamage(s.p.x, s.p.y, s.p.z, 9, 420, s.src, null);
        if (s.src === 'player') { G.police.crime('explode'); const d = G.camera.position.distanceTo(s.p); G.cam.shake(Math.max(0, 1 - d / 60)); }
      }
    }
  }

  // Spieler schießt von (ox,oy,oz) in Richtung (dx,dy,dz)
  playerShot(wkey, ox, oy, oz, dx, dy, dz, ignoreVeh) {
    const w = WEAPONS[wkey], S = wstats(wkey, G.player.wmods && G.player.wmods[wkey]);
    const pellets = w.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      let sx = dx + rand(-S.spread, S.spread), sy = dy + rand(-S.spread, S.spread) * 0.6, sz = dz + rand(-S.spread, S.spread);
      const L = Math.hypot(sx, sy, sz); sx /= L; sy /= L; sz /= L;
      const h = this.raycast(ox, oy, oz, sx, sy, sz, S.range, ignoreVeh);
      const mh = G.mp && G.mp.online ? G.mp.rayHit(ox, oy, oz, sx, sy, sz, h.t) : null;
      if (mh) {
        // Mitspieler getroffen
        const hx = ox + sx * mh.t, hy = oy + sy * mh.t, hz = oz + sz * mh.t;
        G.effects.tracer(ox, oy, oz, hx, hy, hz);
        G.effects.impact(hx, hy, hz, 'dust');
        G.mp.sendHit(mh.r, S.dmg * (hy > mh.r.y + 1.55 ? 2 : 1));
        G.hud.hitMarker(false);
        continue;
      }
      G.effects.tracer(ox, oy, oz, h.x, h.y, h.z);
      this.applyHit(h, S.dmg, 'player', sx, sz);
    }
    if (!S.quiet) G.effects.muzzle(ox, oy, oz);
    G.audio.gun(S.quiet ? 'quiet' : wkey, ox, oz, true);
    G.peds.panic(ox, oz, S.quiet ? 10 : 45, { x: ox, z: oz });
    if (!S.quiet || G.police.copNear(30)) G.police.crime('shoot');
    G.stats.shotsFired++;
  }

  applyHit(h, dmg, src, dx, dz) {
    if (h.type === 'ped') {
      const p = h.obj;
      const head = h.y > p.y + 1.55 && p.lie < 0.5;
      G.peds.damage(p, head ? dmg * 2.5 : dmg, src, dx, dz, head ? 1 : 0);
      G.effects.impact(h.x, h.y, h.z, 'dust');
      if (src === 'player') G.hud.hitMarker(!p.alive);
    } else if (h.type === 'veh') {
      h.obj.damage(dmg * 0.9, src);
      G.effects.impact(h.x, h.y, h.z, 'metal');
      if (src === 'player') { G.hud.hitMarker(false); if (h.obj.ai && h.obj.driver && h.obj.driver.isPed && h.obj.ai.mode === 'traffic') { h.obj.ai.mode = 'flee'; h.obj.ai.scared = 10; h.obj.ai.cruise = 22; } }
    } else if (h.type === 'heli') {
      G.police.heliDamage(dmg, src);
      G.effects.impact(h.x, h.y, h.z, 'metal');
      if (src === 'player') G.hud.hitMarker(G.police.heliDown);
    } else if (h.type === 'player') {
      G.player.damage(dmg, src);
    } else if (h.type) {
      G.effects.impact(h.x, h.y, h.z, h.type === 'world' ? 'dust' : 'dust');
    }
  }

  // Polizist / NPC schießt auf Ziel
  npcShoot(p, tx, ty, tz) {
    const ox = p.x + Math.sin(p.yaw) * 0.4, oy = p.y + 1.4, oz = p.z + Math.cos(p.yaw) * 0.4;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const d = Math.hypot(dx, dy, dz);
    const P = G.player;
    const moving = P.inCar ? P.vehicle.speed : Math.hypot(P.vx, P.vz);
    const acc = clamp(0.85 - d / 60 - moving / 30, 0.12, 0.85);
    const miss = Math.random() > acc;
    const spread = miss ? 0.08 + Math.random() * 0.08 : 0.01;
    dx = dx / d + rand(-spread, spread); dy = dy / d + rand(-spread, spread) * 0.5; dz = dz / d + rand(-spread, spread);
    const h = this.raycast(ox, oy, oz, dx, dy, dz, 80, p.vehIgnore || null, true);
    G.effects.tracer(ox, oy, oz, h.x, h.y, h.z, [1, 0.6, 0.4]);
    G.effects.muzzle(ox, oy, oz);
    G.audio.gun('pistol', ox, oz, false);
    if (h.type === 'player') G.player.damage(rand(5, 9), p);
    else if (h.type === 'veh' && h.obj === P.vehicle) { h.obj.damage(14, p); if (Math.random() < 0.25) G.player.damage(3, p); G.effects.impact(h.x, h.y, h.z, 'metal'); }
    else if (h.type === 'ped' && h.obj !== p) { G.peds.damage(h.obj, 20, p); }
    else if (h.type === 'veh') { h.obj.damage(12, p); G.effects.impact(h.x, h.y, h.z, 'metal'); }
    else G.effects.impact(h.x, h.y, h.z);
  }

  heliShoot(ox, oy, oz, tx, ty, tz) {
    let dx = tx - ox + rand(-3, 3), dy = ty - oy, dz = tz - oz + rand(-3, 3);
    const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
    const h = this.raycast(ox, oy, oz, dx, dy, dz, 140, null, true);
    G.effects.tracer(ox, oy, oz, h.x, h.y, h.z, [1, 0.5, 0.3]);
    G.audio.gun('smg', ox, oz, false);
    if (h.type === 'player') G.player.damage(4, 'heli');
    else if (h.type === 'veh') { h.obj.damage(16, 'heli'); G.effects.impact(h.x, h.y, h.z, 'metal'); if (h.obj === G.player.vehicle && Math.random() < 0.2) G.player.damage(2, 'heli'); }
    else G.effects.impact(h.x, h.y, h.z);
  }

  // Nahkampf des Spielers
  punch() {
    const P = G.player;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    let target = null, bd = 9;
    for (const p of G.peds.list) {
      if (!p.alive && p.lie > 0.5) continue;
      const dx = p.x - P.x, dz = p.z - P.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2.4 * 2.4) continue;
      const fwd = (dx * fx + dz * fz) / Math.sqrt(d2 || 1);
      if (fwd < 0.3) continue;
      if (d2 < bd) { bd = d2; target = p; }
    }
    G.audio.swing();
    if (target) {
      setTimeout(() => {
        if (!target.alive && target.lie > 0.5) return;
        const dx = target.x - P.x, dz = target.z - P.z, L = Math.hypot(dx, dz) || 1;
        const strong = P.punchCombo >= 2;
        G.peds.damage(target, strong ? 34 : WEAPONS.fists.dmg, 'player', dx / L, dz / L, strong ? 6 : 0);
        if (!strong) { target.x += dx / L * 0.3; target.z += dz / L * 0.3; }
        G.audio.punch(target.x, target.z);
        G.hud.hitMarker(!target.alive);
        G.peds.panic(P.x, P.z, 15, P);
        if (!target.isCop && target.alive) G.police.crime('hitPed', target, false);
      }, 140);
    }
    // Fahrzeug anschlagen? (nichts)
    return target;
  }

  explosionDamage(x, y, z, r, maxDmg, source, except) {
    const PL = G.police;
    if (PL && PL.heliActive && !PL.heliDown) { const d = PL.heliPos.distanceTo({ x, y, z }); if (d < r * 1.6) PL.heliDamage(maxDmg * (1 - d / (r * 1.6)) * 2, source); }
    for (const p of G.peds.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) continue;
      const f = 1 - d / r;
      const L = d || 1;
      G.peds.damage(p, maxDmg * f, source, (p.x - x) / L, (p.z - z) / L, 4 + f * 10);
      if (p.alive) { p.state = 'knock'; p.timer = 2; }
      p.vy = 3 + f * 8;
    }
    for (const v of G.vehicles) {
      if (v === except) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > r * 1.3) continue;
      const f = 1 - d / (r * 1.3);
      const L = d || 1;
      v.vx += (v.x - x) / L * f * 8; v.vz += (v.z - z) / L * f * 8;
      if (f > 0.3) { v.vy = f * 5; v.grounded = false; }
      v.damage(maxDmg * 4 * f, source);
    }
    const P = G.player;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    const d = Math.hypot(px - x, pz - z);
    if (d < r && !P.inCar) {
      const f = 1 - d / r, L = d || 1;
      P.knock((px - x) / L * f * 12, (pz - z) / L * f * 12, 3 + f * 7, maxDmg * f * 0.5, null);
    }
    G.peds.panic(x, z, 60, { x, z });
  }
}
