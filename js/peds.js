// Fußgänger & Polizisten zu Fuß
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { randomLook, copLook } from './models.js';
import { circleVsBox, circleVsVeh } from './physics.js';
import { clamp, damp, dampAngle, rand, chance, dist2, pick, angleDiff } from './utils.js';

const _b = [], _c = [];
let PID = 1;

// Ecken-Übergänge beim Straßenüberqueren: [Ecke] -> Liste von [dbi, dbj, neueEcke]
// Ecken: 0=NW 1=NE 2=SE 3=SW
const CROSS = {
  0: [[-1, 0, 1], [0, -1, 3]],
  1: [[1, 0, 0], [0, -1, 2]],
  2: [[1, 0, 3], [0, 1, 1]],
  3: [[-1, 0, 2], [0, 1, 0]],
};

export class Ped {
  constructor(x, z, look, kind = 'walk') {
    this.isPed = true;
    this.id = PID++;
    this.x = x; this.z = z; this.y = G.world.groundHeight(x, z); this.gy = this.y;
    this.yaw = rand(0, Math.PI * 2);
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.look = look;
    this.anim = { phase: rand(0, 6), amp: 0, run: 0, t: rand(0, 10) };
    this.health = 100; this.alive = true;
    this.state = kind; this.timer = rand(2, 6);
    this.speed = rand(1.1, 1.6);
    this.path = null;
    this.tx = x; this.tz = z;
    this.persistent = false;
    this.isCop = false;
    this.weapon = null;
    this.shootT = rand(0.5, 1.5);
    this.deadT = 0;
    this.removed = false;
    this.hostile = false;
    this.r = 0.35;
    this.fleeFrom = null;
    this.lie = 0;
    this.spinX = 0;
    this.blip = null;
  }
}

export class PedManager {
  constructor() {
    this.list = [];
    this.target = 26;
    this.spawnT = 0;
    this.blobs = [];
  }

  // ---------------------------------------------------------- Spawning
  sidewalkLoop(bi, bj, off) {
    const o = 10.4 + off;
    const a = C.roadPos(bi) + o, b = C.roadPos(bi + 1) - o, c = C.roadPos(bj) + o, d = C.roadPos(bj + 1) - o;
    return [[a, c], [b, c], [b, d], [a, d]];
  }
  spawnSidewalk(px, pz) {
    for (let tries = 0; tries < 6; tries++) {
      const [pbi, pbj] = C.blockOf(px, pz);
      const bi = clamp(pbi + Math.floor(rand(-2, 3)), 0, C.NB - 1), bj = clamp(pbj + Math.floor(rand(-2, 3)), 0, C.NB - 1);
      const off = rand(0, 1.2);
      const loop = this.sidewalkLoop(bi, bj, off);
      const k = Math.floor(rand(0, 4));
      const p0 = loop[k], p1 = loop[(k + 1) % 4];
      const t = rand(0.1, 0.9);
      const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
      const d2 = dist2(x, z, px, pz);
      if (d2 < 30 * 30 || d2 > 115 * 115) continue;
      if (this.inView(x, z) && d2 < 80 * 80) continue;
      const beachy = C.districtOf(bi, bj) === 'seaside';
      const p = new Ped(x, z, randomLook(beachy), 'walk');
      const dir = chance(0.5) ? 1 : -1;
      p.path = { bi, bj, k: dir > 0 ? (k + 1) % 4 : k, dir, off };
      this.list.push(p);
      return p;
    }
    return null;
  }
  spawnBeach(px, pz) {
    const z = clamp(pz + rand(-110, 110), -370, 370);
    const x = rand(380, 445);
    if (dist2(x, z, px, pz) < 35 * 35) return null;
    if (Math.abs(z - 40) < 10 && x > C.PIER.x0) return null;
    const p = new Ped(x, z, randomLook(true), chance(0.3) ? 'sunbathe' : 'beach');
    if (p.state === 'sunbathe') { p.lie = 1; p.timer = rand(30, 90); }
    p.speed = rand(0.9, 1.3);
    this.list.push(p);
    return p;
  }
  spawnAt(x, z, look, state = 'walk') {
    const p = new Ped(x, z, look || randomLook(), state);
    this.list.push(p);
    return p;
  }
  spawnCop(x, z) {
    const p = new Ped(x, z, copLook(), 'cop');
    p.isCop = true; p.weapon = 'pistol'; p.speed = 5.2; p.health = 120;
    p.anim.gun = true;
    this.list.push(p);
    return p;
  }
  inView(x, z) {
    const cam = G.camera;
    const dx = x - cam.position.x, dz = z - cam.position.z;
    const f = G.cam.forward;
    const d = Math.hypot(dx, dz) || 1;
    return (dx * f.x + dz * f.z) / d > 0.45;
  }

  remove(p) {
    p.removed = true;
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  // Fahrer aus einem Auto werfen
  ejectDriver(v, water = false, dead = false) {
    const d = v.driver;
    if (!d || !d.isPed) return null;
    v.driver = null;
    if (v.ai) { v.ai.stopped = true; }
    const lx = Math.cos(v.h), lz = -Math.sin(v.h);
    const x = v.x + lx * (v.hw + 0.7), z = v.z + lz * (v.hw + 0.7);
    const p = new Ped(x, z, d.look || randomLook(), 'flee');
    if (d.isCop) { p.isCop = true; p.weapon = 'pistol'; p.state = 'cop'; p.speed = 5.2; p.anim.gun = true; p.health = 120; p.car = v; }
    p.y = v.y;
    p.fleeFrom = { x: G.player.x, z: G.player.z };
    p.timer = rand(6, 10);
    if (dead) { p.health = 0; this.kill(p, null); p.vy = 4; p.vx = lx * 4; p.vz = lz * 4; }
    if (water) p.state = 'swim';
    if (d.persistent) p.persistent = true;
    if (d.onEject) d.onEject(p);
    this.list.push(p);
    return p;
  }

  // ------------------------------------------------------------ Schaden
  damage(p, amount, source, dx = 0, dz = 0, knock = 0) {
    if (!p.alive) return;
    p.health -= amount;
    if (source === 'player') {
      if (p.isCop) G.police.crime('hitCop', p);
      p.hitByPlayer = true;
    }
    if (p.health <= 0) {
      this.kill(p, source);
      if (knock > 0) { p.vx = dx * knock; p.vz = dz * knock; p.vy = 2 + knock * 0.3; p.state = 'knock'; }
      return;
    }
    if (knock > 3) {
      p.state = 'knock'; p.vx = dx * knock; p.vz = dz * knock; p.vy = 2 + knock * 0.25; p.timer = 1.8; p.spinX = 0;
    } else if (!p.isCop) {
      if (!p.hostile && chance(p.look.scale > 0.97 ? 0.3 : 0.12) && source === 'player' && G.player.state === 'foot') {
        p.hostile = true; p.state = 'attack'; p.speed = 5;
      } else if (!p.hostile) { p.state = 'flee'; p.fleeFrom = { x: G.player.x, z: G.player.z }; p.timer = rand(8, 14); }
    }
    if (p.onHurt) p.onHurt(p, source);
  }
  kill(p, source) {
    if (!p.alive) return;
    p.alive = false; p.health = 0;
    p.state = 'dead'; p.deadT = 0;
    p.anim.gun = false;
    if (source === 'player') {
      G.police.crime(p.isCop ? 'killCop' : 'killPed', p);
      if (!p.isCop && chance(0.6)) G.missions.dropMoney(p.x, p.z, Math.floor(rand(5, 60)));
      if (p.isCop && chance(0.5)) G.missions.dropWeapon(p.x, p.z, 'pistol', 12);
    }
    G.audio.hurt(p.x, p.z);
    if (p.onDeath) p.onDeath(p, source);
  }
  // Panik in Radius
  panic(x, z, r, from) {
    for (const p of this.list) {
      if (!p.alive || p.isCop || p.persistent || p.hostile) continue;
      if (dist2(p.x, p.z, x, z) < r * r) {
        if (p.state === 'sunbathe') p.lie = 0;
        p.state = 'flee'; p.fleeFrom = from || { x, z }; p.timer = rand(7, 12);
      }
    }
  }

  // Fahrzeug-Treffer
  vehicleHits(vs) {
    const P = G.player;
    for (const v of vs) {
      const sp = v.speed;
      if (sp < 0.5) continue;
      for (const p of this.list) {
        if (p.removed || p.state === 'inCar') continue;
        const dx = p.x - v.x, dz = p.z - v.z;
        if (dx * dx + dz * dz > (v.hl + 10) * (v.hl + 10)) continue;
        if (Math.abs(p.y - v.y) > 2) continue;
        // Ausweichen
        if (p.alive && sp > 7 && p.state !== 'knock' && !p.isCop) {
          const fx = Math.sin(v.h), fz = Math.cos(v.h);
          const lu = dx * fx + dz * fz, lv = dx * -fz + dz * fx;
          if (lu > 0 && lu < 9 && Math.abs(lv) < 2.2 && (v.vx * fx + v.vz * fz) > 7 && chance(0.12)) {
            const s = lv >= 0 ? 1 : -1;
            p.dodge = 0.5; p.vx = -fz * s * 6; p.vz = fx * s * 6; p.vy = 3;
          }
        }
        const r = circleVsVeh(p.x, p.z, p.r, v);
        if (!r) continue;
        const rel = (v.vx * r.nx + v.vz * r.nz);
        if (rel > 4.5 && p.state !== 'knock' && p.state !== 'dead' || (rel > 4.5 && !p.alive && p.vy === 0)) {
          const src = v.driver === 'player' ? 'player' : null;
          if (p.alive) {
            this.damage(p, rel * 5.5, src, v.vx / sp, v.vz / sp, 0);
            if (src === 'player') G.police.crime(p.alive ? 'hitPed' : 'killPed', p, true);
          }
          p.state = p.alive ? 'knock' : 'dead';
          p.timer = 2.2;
          p.vx = v.vx * 0.85 + r.nx * 2; p.vz = v.vz * 0.85 + r.nz * 2; p.vy = 3 + rel * 0.25;
          p.spinX = 0;
          v.vx *= 0.94; v.vz *= 0.94;
          G.audio.thud(Math.min(1, rel / 15), p.x, p.z);
          if (v.driver === 'player') G.cam.shake(0.2);
        } else {
          p.x += r.nx * r.depth; p.z += r.nz * r.depth;
        }
      }
      // Spieler zu Fuß
      if (P.state === 'foot' || P.state === 'knock') {
        const r = circleVsVeh(P.x, P.z, 0.35, v);
        if (r && Math.abs(P.y - v.y) < 2) {
          const rel = (v.vx * r.nx + v.vz * r.nz);
          if (rel > 5 && P.state === 'foot') P.knock(v.vx * 0.8 + r.nx * 2, v.vz * 0.8 + r.nz * 2, 3 + rel * 0.2, rel * 3, v);
          else { P.x += r.nx * r.depth; P.z += r.nz * r.depth; }
        }
      }
    }
  }

  // ------------------------------------------------------------- Update
  update(dt) {
    const P = G.player;
    const px = P.x, pz = P.z;
    // Zielanzahl je Gegend
    const d = C.districtAt(px, pz);
    const dens = { downtown: 52, midtown: 44, westside: 40, heights: 24, seaside: 44, beach: 46, harbor: 14, pier: 36, sea: 4 }[d] || 34;
    const night = G.world.env.night;
    this.target = Math.round(dens * (1 - night * 0.35) * (G.quality === 'low' ? 0.65 : 1));
    this.spawnT -= dt;
    if (G.interior) this.spawnT = 1;
    if (this.spawnT <= 0) {
      this.spawnT = 0.1;
      const n = this.list.filter((p) => !p.isCop && p.alive && !p.persistent).length;
      if (n < this.target) {
        if ((px > 300 || d === 'beach' || d === 'pier') && chance(0.6)) this.spawnBeach(px, pz);
        else this.spawnSidewalk(px, pz);
      }
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d2 = dist2(p.x, p.z, px, pz);
      if (!p.persistent && (d2 > 170 * 170 || (d2 > 110 * 110 && !this.inView(p.x, p.z)) || (!p.alive && p.deadT > 30))) { this.remove(p); continue; }
      this.think(p, dt);
      this.move(p, dt);
    }
  }

  think(p, dt) {
    const P = G.player;
    p.timer -= dt;
    p.anim.panic = false; p.anim.aim = false; p.anim.handsUp = !!p.surrender;
    switch (p.state) {
      case 'walk': {
        if (!p.path) { this.attachPath(p); }
        const loop = this.sidewalkLoop(p.path.bi, p.path.bj, p.path.off);
        const [tx, tz] = loop[p.path.k];
        p.tx = tx; p.tz = tz; p.moveSpeed = p.speed;
        if (dist2(p.x, p.z, tx, tz) < 0.6) {
          const corner = p.path.k;
          if (chance(0.22)) {
            const opts = CROSS[corner].filter(([dbi, dbj]) => {
              const nb = p.path.bi + dbi, nj = p.path.bj + dbj;
              return nb >= 0 && nb < C.NB && nj >= 0 && nj < C.NB;
            });
            if (opts.length) {
              const [dbi, dbj, nk] = pick(opts);
              p.path.bi += dbi; p.path.bj += dbj; p.path.k = nk;
              break;
            }
          }
          p.path.k = (p.path.k + p.path.dir + 4) % 4;
          if (chance(0.15)) { p.state = 'idle'; p.timer = rand(2, 6); }
        }
        break;
      }
      case 'idle':
        p.moveSpeed = 0;
        if (p.timer <= 0) p.state = 'walk';
        break;
      case 'beach': {
        p.moveSpeed = p.speed;
        if (p.timer <= 0 || dist2(p.x, p.z, p.tx, p.tz) < 1) {
          p.tx = clamp(p.x + rand(-25, 25), 380, 448); p.tz = clamp(p.z + rand(-25, 25), -370, 370);
          if (Math.abs(p.tz - 40) < 9 && p.tx > C.PIER.x0 - 2) p.tz += 20;
          p.timer = rand(6, 14);
          if (chance(0.3)) { p.state = 'beachIdle'; p.timer = rand(3, 8); }
        }
        break;
      }
      case 'beachIdle':
        p.moveSpeed = 0;
        if (p.timer <= 0) p.state = 'beach';
        break;
      case 'sunbathe':
        p.moveSpeed = 0; p.lie = 1;
        if (p.timer <= 0) { p.lie = 0; p.state = 'beach'; }
        break;
      case 'flee': {
        const f = p.fleeFrom || P;
        let dx = p.x - f.x, dz = p.z - f.z;
        const L = Math.hypot(dx, dz) || 1;
        p.tx = p.x + dx / L * 10; p.tz = p.z + dz / L * 10;
        p.moveSpeed = 6.2; p.anim.panic = p.timer > 3;
        if (p.timer <= 0) { p.state = p.x > C.BEACH_X0 ? 'beach' : 'walk'; p.path = null; }
        break;
      }
      case 'attack': {
        p.tx = P.x; p.tz = P.z;
        const d2 = dist2(p.x, p.z, P.x, P.z);
        p.moveSpeed = d2 > 2.2 ? 5.5 : 0;
        p.punchT = (p.punchT || 0) - dt;
        if (p.anim.punch > 0) p.anim.punch = Math.max(0, p.anim.punch - dt * 2.5);
        if (d2 < 2.4 && p.punchT <= 0 && P.state === 'foot') {
          p.punchT = 0.9; p.anim.punch = 1;
          p.yaw = Math.atan2(P.x - p.x, P.z - p.z);
          setTimeout(() => { if (p.alive && dist2(p.x, p.z, P.x, P.z) < 3) P.damage(7, p); }, 180);
        }
        if (P.state !== 'foot' || d2 > 60 * 60 || p.timer < -30) { p.hostile = false; p.state = 'flee'; p.timer = 6; }
        break;
      }
      case 'cop': this.copThink(p, dt); break;
      case 'knock': {
        p.moveSpeed = 0;
        if (p.vy === 0 && p.timer <= 0 && p.y <= p.gy + 0.05) {
          if (p.alive) { p.lie = 0; p.state = p.isCop ? 'cop' : 'flee'; p.fleeFrom = { x: P.x, z: P.z }; p.timer = 10; }
        }
        break;
      }
      case 'dead':
        p.moveSpeed = 0; p.deadT += dt;
        break;
      case 'swim': {
        p.moveSpeed = 1.5;
        p.tx = C.BEACH_X0 + 20; p.tz = p.z;
        if (G.world.groundHeight(p.x, p.z) > C.WATER_Y - 0.9) { p.state = 'flee'; p.timer = 5; }
        break;
      }
      case 'mission':
        if (p.missionThink) p.missionThink(p, dt);
        break;
      case 'goto':
        p.moveSpeed = p.gotoSpeed || 1.6;
        if (dist2(p.x, p.z, p.tx, p.tz) < 0.5) { p.moveSpeed = 0; if (p.onArrive) { const f = p.onArrive; p.onArrive = null; f(p); } }
        break;
    }
  }

  attachPath(p) {
    const [bi0, bj0] = C.blockOf(p.x, p.z);
    const bi = clamp(bi0, 0, C.NB - 1), bj = clamp(bj0, 0, C.NB - 1);
    p.path = { bi, bj, k: Math.floor(rand(0, 4)), dir: chance(0.5) ? 1 : -1, off: rand(0, 1.2) };
  }

  copThink(p, dt) {
    const P = G.player;
    const wanted = G.police.level;
    p.anim.gun = true;
    if (wanted === 0) {
      p.anim.gun = false;
      p.state = 'walk'; p.isCopIdle = true; p.path = null;
      return;
    }
    const tx = P.inCar ? P.vehicle.x : P.x, tz = P.inCar ? P.vehicle.z : P.z;
    const d2 = dist2(p.x, p.z, tx, tz);
    const d = Math.sqrt(d2);
    p.tx = tx; p.tz = tz;
    const see = d < 45 && G.world.lineOfSight(p.x, p.y + 1.6, p.z, tx, (P.inCar ? P.vehicle.y : P.y) + 1.2, tz);
    if (see) G.police.spotted();
    if (wanted >= 2 && see && d < 32) {
      p.moveSpeed = d > 14 ? 4.5 : 0;
      p.anim.aim = true;
      p.yaw = dampAngle(p.yaw, Math.atan2(tx - p.x, tz - p.z), 10, dt);
      p.shootT -= dt;
      if (p.shootT <= 0) {
        p.shootT = rand(0.7, 1.4) / (1 + (wanted - 2) * 0.25);
        G.combat.npcShoot(p, tx, (P.inCar ? P.vehicle.y + 1 : P.y + 1.2), tz);
      }
    } else {
      p.moveSpeed = d > 1.4 ? 5.4 : 0;
      if (wanted === 1 && d < 2 && P.state === 'foot') { p.anim.aim = true; G.police.arresting(p, dt); }
    }
  }

  move(p, dt) {
    const W = G.world;
    const A = p.anim;
    A.t += dt;
    // Ragdoll-artige Flugphase
    if (p.state === 'knock' || p.state === 'dead') {
      if (p.vy !== 0 || p.y > p.gy + 0.05 || Math.abs(p.vx) + Math.abs(p.vz) > 0.1) {
        p.vy -= 20 * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        p.spinX += dt * 6;
        p.gy = W.groundHeight(p.x, p.z);
        if (p.y <= p.gy) { p.y = p.gy; p.vy = 0; p.vx *= 0.4; p.vz *= 0.4; if (Math.abs(p.vx) + Math.abs(p.vz) < 0.3) { p.vx = 0; p.vz = 0; } }
        this.collide(p);
      }
      p.lie = damp(p.lie, 1, 8, dt);
      A.tilt = -p.lie * Math.PI / 2 + (p.vy !== 0 ? Math.sin(p.spinX) * 0.6 : 0);
      A.lift = p.lie * 0.14; A.amp = 0; A.run = 0;
      return;
    }
    if (p.dodge > 0) {
      p.dodge -= dt;
      p.vy -= 20 * dt; p.y += p.vy * dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.y < p.gy) { p.y = p.gy; p.vy = 0; }
      A.air = true;
      this.collide(p);
      return;
    }
    A.air = false;
    // Laufen zum Ziel
    let sp = p.moveSpeed || 0;
    if (sp > 0) {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const L = Math.hypot(dx, dz);
      if (L > 0.05) {
        const want = Math.atan2(dx, dz);
        p.yaw = dampAngle(p.yaw, want, 8, dt);
        const step = Math.min(L, sp * dt);
        const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
        // weiche Vermeidung anderer Figuren
        p.x += fx * step; p.z += fz * step;
      } else sp = 0;
    }
    if (p.state === 'swim') {
      p.y = C.WATER_Y - 0.25; A.swim = true; A.tilt = 1.35; A.lift = 0;
    } else {
      A.swim = false;
      p.gy = W.groundHeight(p.x, p.z);
      p.y = damp(p.y, p.gy, 20, dt);
      if (p.gy < C.WATER_Y - 1.0 && p.alive) { p.state = 'swim'; }
      A.tilt = -p.lie * Math.PI / 2; A.lift = p.lie * 0.14;
    }
    this.collide(p);
    // Animation
    const run = sp > 3 ? 1 : 0;
    A.amp = damp(A.amp, sp > 0.1 ? (run ? 1 : 0.55) : 0, 8, dt);
    A.run = damp(A.run, run, 6, dt);
    A.phase += dt * (sp > 0.1 ? 2.2 + sp * 1.55 : 0);
  }

  collide(p) {
    const W = G.world;
    W.query(p.x, p.z, 1, _b, _c);
    for (const b of _b) {
      if (p.y >= b.y1 - 0.2 || p.y + 1.8 <= b.y0) continue;
      const r = circleVsBox(p.x, p.z, p.r, b);
      if (r) { p.x += r.nx * r.depth; p.z += r.nz * r.depth; if (p.state === 'walk' && p.timer < 0) { p.path = null; p.timer = 3; } }
    }
    for (const c of _c) {
      if (p.y >= c.y1) continue;
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); p.x += dx / d * (rr - d); p.z += dz / d * (rr - d); }
    }
  }

  nearest(x, z, r, filter) {
    let best = null, bd = r * r;
    for (const p of this.list) {
      if (filter && !filter(p)) continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  blobList() { return this.blobs; }

  render() {
    const R = G.crowd;
    R.begin();
    this.blobs.length = 0;
    const P = G.player;
    if (P.visible) { R.add(P); this.blobs.push({ x: P.x, z: P.z, gy: P.gy }); }
    const cx = G.camera.position.x, cz = G.camera.position.z;
    for (const p of this.list) {
      if (dist2(p.x, p.z, cx, cz) > 140 * 140) continue;
      R.add(p);
      if (p.lie < 0.5 && this.blobs.length < 60) this.blobs.push({ x: p.x, z: p.z, gy: p.gy });
    }
    if (G.mp) G.mp.renderInto(R);
    R.end();
  }
}
