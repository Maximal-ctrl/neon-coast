// Verkehr & KI-Fahrer
import { G } from './state.js';
import * as C from './config.js';
import { TRAFFIC_MIX, randomLook, copLook, CAR_TYPES } from './models.js';
import { clamp, rand, chance, pick, dist2, angleDiff } from './utils.js';

const STOP = 13.5; // Haltelinie vom Kreuzungsmittelpunkt

// KI-Fahrer: folgt einer Punktliste entlang des Straßengraphen
export class AIDriver {
  constructor(v, mode = 'traffic') {
    this.v = v; this.mode = mode;
    this.pts = [];            // {x,z,node?,axisNS?,stop?}
    this.route = [];          // Knoten-IDs (aktuelle Kante = route[0] -> route[1])
    this.cruise = mode === 'traffic' ? rand(11, 15) : 30;
    this.stuck = 0; this.reverseT = 0;
    this.stopped = false;
    this.lane = chance(0.5) ? 2 : 6;
    this.honkT = 0;
    this.scared = 0;
    this.aggro = 0;
  }

  // Start auf einer Kante (Knoten a -> b)
  startEdge(aId, bId, lane = this.lane) {
    this.route = [aId, bId];
    this.pts = [];
    this.lane = lane;
    const a = G.world.nodes[aId], b = G.world.nodes[bId];
    this.appendStraight(a, b, lane, lane, true);
  }

  appendStraight(a, b, laneA, laneB, fromStart = false) {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const rx = -dz, rz = dx;
    const L = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    const s0 = fromStart ? Math.max(STOP, this.projectOnEdge(a, dx, dz)) : STOP;
    for (let s = s0; s <= L - STOP + 0.01; s += 8) {
      const t = (s - STOP) / (L - 2 * STOP);
      const lane = laneA + (laneB - laneA) * clamp(t * 1.6 - 0.2, 0, 1);
      this.pts.push({ x: a.x + dx * s + rx * lane, z: a.z + dz * s + rz * lane });
    }
    const end = { x: b.x - dx * STOP + rx * laneB, z: b.z - dz * STOP + rz * laneB, stop: true, node: b.id, axisNS: dz !== 0 };
    this.pts.push(end);
  }
  projectOnEdge(a, dx, dz) {
    const v = this.v;
    return (v.x - a.x) * dx + (v.z - a.z) * dz + 4;
  }

  chooseNext(prevId, curId) {
    const cur = G.world.nodes[curId];
    let opts = cur.nbr.filter((n) => n !== prevId);
    if (!opts.length) opts = cur.nbr;
    if (this.mode === 'flee') {
      const P = G.player, F = this.fleeFrom && !this.fleeFrom.removed ? this.fleeFrom : null;
      const px = F ? F.x : P.inCar ? P.vehicle.x : P.x, pz = F ? F.z : P.inCar ? P.vehicle.z : P.z;
      opts.sort((a, b) => dist2(G.world.nodes[b].x, G.world.nodes[b].z, px, pz) - dist2(G.world.nodes[a].x, G.world.nodes[a].z, px, pz));
      return chance(0.75) ? opts[0] : pick(opts);
    }
    if (this.mode === 'police' || this.mode === 'goto') {
      const tgt = this.targetNode();
      if (tgt != null) {
        const path = G.world.route(curId, tgt);
        if (path.length > 1 && path[1] !== prevId) return path[1];
      }
    }
    if (this.mode === 'race' && this.raceRoute) {
      const next = this.raceRoute[this.raceIdx];
      if (next != null) { this.raceIdx++; return next; }
      return pick(opts);
    }
    // Geradeaus bevorzugen
    const prev = G.world.nodes[prevId];
    const dx = Math.sign(cur.x - prev.x), dz = Math.sign(cur.z - prev.z);
    const straight = opts.find((n) => { const o = G.world.nodes[n]; return Math.sign(o.x - cur.x) === dx && Math.sign(o.z - cur.z) === dz; });
    if (straight != null && chance(0.55)) return straight;
    return pick(opts);
  }
  targetNode() {
    if (this.mode === 'goto' && this.goal) return G.world.nearestNode(this.goal.x, this.goal.z).id;
    if (this.target && !this.target.removed) return G.world.nearestNode(this.target.x, this.target.z).id;
    const P = G.player;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    return G.world.nearestNode(px, pz).id;
  }

  // Abbiegen: Kurvenpunkte und nächste Kante
  extend() {
    const W = G.world;
    const n = this.route.length;
    const prevId = this.route[n - 2], curId = this.route[n - 1];
    const nextId = this.chooseNext(prevId, curId);
    const prev = W.nodes[prevId], cur = W.nodes[curId], next = W.nodes[nextId];
    const d1x = Math.sign(cur.x - prev.x), d1z = Math.sign(cur.z - prev.z);
    const d2x = Math.sign(next.x - cur.x), d2z = Math.sign(next.z - cur.z);
    const r1x = -d1z, r1z = d1x, r2x = -d2z, r2z = d2x;
    // Spurwahl nach Abbiegerichtung (rechts abbiegen = neue Richtung entspricht altem Rechtsvektor)
    let laneIn = this.lane, laneOut;
    const turnRight = d2x === r1x && d2z === r1z;
    const turnLeft = d2x === -r1x && d2z === -r1z;
    if (turnRight) laneOut = 6; else if (turnLeft) laneOut = 2; else laneOut = this.lane;
    const E = { x: cur.x - d1x * STOP + r1x * laneIn, z: cur.z - d1z * STOP + r1z * laneIn };
    const X = { x: cur.x + d2x * STOP + r2x * laneOut, z: cur.z + d2z * STOP + r2z * laneOut };
    if (d1x === d2x && d1z === d2z) {
      this.pts.push({ x: (E.x + X.x) / 2, z: (E.z + X.z) / 2 });
    } else if (d1x === -d2x && d1z === -d2z) {
      this.pts.push({ x: cur.x + r1x * 2, z: cur.z + r1z * 2 });
    } else {
      // Kontrollpunkt = Schnittpunkt der Spurgeraden
      let cx, cz;
      if (d1x !== 0) { cx = X.x; cz = E.z; } else { cx = E.x; cz = X.z; }
      for (let k = 1; k <= 5; k++) {
        const t = k / 6, u = 1 - t;
        this.pts.push({ x: u * u * E.x + 2 * u * t * cx + t * t * X.x, z: u * u * E.z + 2 * u * t * cz + t * t * X.z, turn: true });
      }
    }
    this.route.push(nextId);
    if (this.route.length > 4) this.route.shift();
    this.lane = laneOut;
    const nextLane = this.mode === 'traffic' ? (chance(0.3) ? (laneOut === 2 ? 6 : 2) : laneOut) : laneOut;
    this.appendStraight(cur, next, laneOut, nextLane);
    this.lane = nextLane;
  }

  update(dt) {
    const v = this.v;
    const inp = v.input;
    if (!v.alive || this.stopped || !v.driver) {
      inp.throttle = 0; inp.brake = this.stopped ? 1 : 0; inp.steer = 0; inp.noReverse = true; inp.handbrake = false;
      return;
    }
    if (this.mode === 'police' || this.mode === 'chase') return this.updatePursuit(dt);
    if (this.hill) return this.followHill(dt);
    this.followPath(dt, this.mode === 'traffic' && this.scared <= 0);
  }

  // ---------------------------------------------------- Bergstraßen
  // Fahren im Landstraßennetz: Kante, Index, Richtung (+1 = a→b)
  startHill(edge, idx, dir) { this.hill = { edge, idx, dir }; this.pts = []; this.route = []; }
  hillPoint(E, i, dir) {
    const P = E.pts, a = P[Math.max(0, Math.min(P.length - 1, i))], b = P[Math.max(0, Math.min(P.length - 1, i + dir))];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (l < 0.01) { const c = P[Math.max(0, Math.min(P.length - 1, i - dir))]; dx = (a[0] - c[0]); dz = (a[1] - c[1]); const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m; }
    return [a[0] - dz * 2.3, a[1] + dx * 2.3];
  }
  followHill(dt) {
    const v = this.v, W = G.world, H = this.hill, N = W.net;
    let E = N.edges[H.edge];
    // Fortschritt entlang der Kante, an Knoten nächste Kante wählen
    for (let k = 0; k < 6; k++) {
      const [x, z] = this.hillPoint(E, H.idx, H.dir);
      if (Math.hypot(x - v.x, z - v.z) > 7) break;
      H.idx += H.dir;
      if (H.idx >= 0 && H.idx < E.pts.length) continue;
      const node = N.nodes[H.dir > 0 ? E.b : E.a];
      if (node.gate && node.city) {
        // über den Damm zurück in die Stadt (Straßengraph)
        this.hill = null;
        this.startEdge(node.city.id, C.nodeId(node.gate[0], node.gate[1] + 1), 2);
        return;
      }
      const opts = node.edges.filter((e) => e !== E.id);
      if (!opts.length) { if (G.peds.inView(v.x, v.z) === false) v.despawnMe = true; H.dir = -H.dir; H.idx = H.dir > 0 ? 1 : E.pts.length - 2; continue; }
      // geradeaus bevorzugen
      const P0 = E.pts[H.dir > 0 ? E.pts.length - 2 : 1], hx = node.x - P0[0], hz = node.z - P0[1];
      let pickE = opts[Math.floor(Math.random() * opts.length)];
      if (chance(0.6)) { let bd = -9; for (const ei of opts) { const e2 = N.edges[ei], q = e2.a === node.id ? e2.pts[1] : e2.pts[e2.pts.length - 2], d = ((q[0] - node.x) * hx + (q[1] - node.z) * hz) / ((Math.hypot(q[0] - node.x, q[1] - node.z) || 1) * (Math.hypot(hx, hz) || 1)); if (d > bd) { bd = d; pickE = ei; } } }
      E = N.edges[pickE];
      H.edge = pickE; H.dir = E.a === node.id ? 1 : -1; H.idx = H.dir > 0 ? 1 : E.pts.length - 2;
    }
    const [tx, tz] = this.hillPoint(E, Math.max(0, Math.min(E.pts.length - 1, H.idx + H.dir * 2)), H.dir);
    const want = Math.atan2(tx - v.x, tz - v.z);
    const diff = angleDiff(v.h, want);
    v.input.steer = clamp(-diff * 2.6, -1, 1);
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    const sp = Math.max(0, v.fwdSpeed);
    let target = (E.town ? Math.min(this.cruise, 10) : this.cruise * 1.25) * (this.scared > 0 ? 1.6 : 1);
    if (Math.abs(diff) > 0.4) target = Math.min(target, 8);
    const obst = this.obstacleAhead(fx, fz);
    if (obst < 30) target = Math.min(target, Math.max(0, (obst - 4.5) * 0.9));
    this.drive(target, sp, dt, obst);
  }
  // Verfolgung über die Navigationsroute (auch in den Bergen)
  pursuitPath(dt, tx, tz) {
    const v = this.v, W = G.world;
    this.pathT = (this.pathT || 0) - dt;
    if (this.pathT <= 0 || !this.gps) { this.pathT = 0.6; this.gps = W.gpsPath(v.x, v.z, tx, tz); }
    let tgt = this.gps[this.gps.length - 1];
    for (const p of this.gps) if (Math.hypot(p[0] - v.x, p[1] - v.z) > 10) { tgt = p; break; }
    while (this.gps.length > 1 && Math.hypot(this.gps[0][0] - v.x, this.gps[0][1] - v.z) < 10) this.gps.shift();
    const want = Math.atan2(tgt[0] - v.x, tgt[1] - v.z);
    const diff = angleDiff(v.h, want);
    v.input.steer = clamp(-diff * 2.6, -1, 1);
    const sp = Math.max(0, v.fwdSpeed);
    let target = this.cruise;
    if (Math.abs(diff) > 0.5) target = Math.min(target, 12);
    const fx = Math.sin(v.h), fz = Math.cos(v.h), obst = this.obstacleAhead(fx, fz);
    if (obst < 25) target = Math.min(target, Math.max(4, (obst - 3) * 1.2));
    this.drive(target, sp, dt, obst);
  }

  followPath(dt, obeyLights) {
    const v = this.v, inp = v.input;
    while (this.pts.length < 14) this.extend();
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    // vorbeigefahrene Punkte entfernen
    while (this.pts.length > 2) {
      const p = this.pts[0];
      const dx = p.x - v.x, dz = p.z - v.z;
      const ahead = dx * fx + dz * fz;
      if (ahead < 0.5 || (!p.stop && (ahead < 1.5 || dx * dx + dz * dz < 9))) this.pts.shift(); else break;
    }
    const sp = Math.max(0, v.fwdSpeed);
    const look = 5 + sp * 0.55;
    let acc = 0, tgt = this.pts[0], px = v.x, pz = v.z;
    let turnAhead = false, stopDist = Infinity, stopPt = null;
    for (let k = 0; k < this.pts.length; k++) {
      const p = this.pts[k];
      const dd = Math.hypot(p.x - px, p.z - pz);
      acc += dd; px = p.x; pz = p.z;
      if (acc < 30 && p.turn) turnAhead = true;
      if (p.stop && stopPt === null) { stopPt = p; stopDist = acc; }
      if (acc >= look && tgt === this.pts[0]) tgt = p;
      if (acc > 40) break;
    }
    if (acc < look) tgt = this.pts[Math.min(this.pts.length - 1, 3)];
    const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
    const diff = angleDiff(v.h, want);
    inp.steer = clamp(-diff * 2.6, -1, 1);
    let target = this.cruise * (this.scared > 0 ? 1.8 : 1);
    if (turnAhead) target = Math.min(target, this.mode === 'race' ? 16 : 8);
    if (Math.abs(diff) > 0.6) target = Math.min(target, 6);
    // Ampel
    if (obeyLights && stopPt) {
      const st = G.world.signal(stopPt.node, stopPt.axisNS);
      if (st !== 'G' && stopDist > 1 && stopDist < 40) {
        const brakeD = sp * sp / (2 * 7) + 2;
        if (st === 'R' || stopDist > brakeD) target = Math.min(target, Math.max(0, (stopDist - 2) * 0.9));
      }
    }
    // Hindernisse vor dem Fahrzeug
    const obst = this.obstacleAhead(fx, fz);
    if (obst < 30) target = Math.min(target, Math.max(0, (obst - 4.5) * 0.9));
    this.drive(target, sp, dt, obst);
  }

  drive(target, sp, dt, obst = 99) {
    const v = this.v, inp = v.input;
    inp.noReverse = true; inp.handbrake = false;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = 0; inp.brake = 1; inp.noReverse = false; inp.steer = -inp.steer;
      return;
    }
    const err = target - sp;
    if (err > 0) { inp.throttle = clamp(err * 0.35, 0.15, 1); inp.brake = 0; }
    else { inp.throttle = 0; inp.brake = clamp(-err * 0.3, 0, 1); }
    if (target < 0.3 && sp < 0.5) { inp.brake = 1; inp.throttle = 0; }
    // Feststecken
    if (target > 3 && sp < 0.8) {
      this.stuck += dt;
      if (this.stuck > (this.mode === 'traffic' ? 6 : 1.5)) {
        this.stuck = 0;
        if (this.mode !== 'traffic' || obst > 6) { this.reverseT = 1.4; }
        else if (G.peds.inView(v.x, v.z) === false && dist2(v.x, v.z, G.player.x, G.player.z) > 60 * 60) v.despawnMe = true;
        else { this.honkT = 0.4; G.audio.horn(v.x, v.z, 0.4); }
      }
    } else this.stuck = Math.max(0, this.stuck - dt);
  }

  obstacleAhead(fx, fz) {
    const v = this.v;
    let best = 99;
    const rx = -fz, rz = fx;
    const check = (x, z, w) => {
      const dx = x - v.x, dz = z - v.z;
      const f = dx * fx + dz * fz;
      if (f <= 0 || f > 32) return;
      const l = Math.abs(dx * rx + dz * rz);
      if (l < v.hw + w + 0.4) best = Math.min(best, f - w);
    };
    for (const o of G.vehicles) if (o !== v && o.alive !== undefined) check(o.x, o.z, o.hw + o.hl * 0.6);
    const P = G.player;
    if (!P.inCar) check(P.x, P.z, 0.4);
    for (const p of G.peds.list) if (p.alive || p.lie > 0.5) { const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz < 900) check(p.x, p.z, 0.4); }
    return best - v.hl;
  }

  // Verfolgung (Polizei / Missionsgegner)
  updatePursuit(dt) {
    const v = this.v, inp = v.input;
    const P = G.player, T = this.target && !this.target.removed ? this.target : null;
    const tv = T || (P.inCar ? P.vehicle : null);
    const tx = tv ? tv.x : P.x, tz = tv ? tv.z : P.z;
    const d = Math.hypot(tx - v.x, tz - v.z);
    const sp = Math.max(0, v.fwdSpeed);
    v.siren = true;
    if (d < 45 && G.world.lineOfSight(v.x, v.y + 1.3, v.z, tx, (tv ? tv.y : P.y) + 1, tz)) {
      if (!T) G.police.spotted();
      // direktes Anfahren mit Vorhalt
      const lead = tv ? Math.min(1.2, d / 25) : 0;
      const ax = tx + (tv ? tv.vx * lead : 0), az = tz + (tv ? tv.vz * lead : 0);
      const want = Math.atan2(ax - v.x, az - v.z);
      const diff = angleDiff(v.h, want);
      inp.steer = clamp(-diff * 2.4, -1, 1);
      let target = tv ? Math.max(14, tv.speed * 1.25 + 6) : (d > 12 ? 14 : 0);
      if (Math.abs(diff) > 1.2 && d < 15) target = 8;
      if (!tv && d < 9) target = 0;
      this.pts.length = 0; this.route.length = 0;
      this.drive(target, sp, dt);
      inp.handbrake = Math.abs(diff) > 1.0 && sp > 12;
      // Rückwärts wenn Ziel hinter uns und nah
      if (Math.abs(diff) > 2.2 && d < 12 && sp < 4) { inp.throttle = 0; inp.brake = 1; inp.noReverse = false; inp.steer = -inp.steer; }
      this.direct = true;
    } else if (G.world.inHills(v.x, v.z) || G.world.inHills(tx, tz)) {
      this.direct = false;
      this.cruise = 24;
      this.pursuitPath(dt, tx, tz);
    } else {
      if (this.direct || this.route.length < 2) {
        this.direct = false;
        const n = G.world.nearestNode(v.x, v.z);
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        // Kante in Fahrtrichtung wählen
        let bestN = n.nbr[0], bd = -9;
        for (const nb of n.nbr) {
          const o = G.world.nodes[nb];
          const dd = (Math.sign(o.x - n.x) * fx + Math.sign(o.z - n.z) * fz);
          if (dd > bd) { bd = dd; bestN = nb; }
        }
        const dot = (n.x - v.x) * fx + (n.z - v.z) * fz;
        if (dot > 0) { const back = n.nbr.find((nb) => nb !== bestN) ?? bestN; this.startEdge(back, n.id, 2); }
        else this.startEdge(n.id, bestN, 2);
      }
      const saveMode = this.mode;
      this.mode = 'police';
      this.cruise = 26;
      this.followPath(dt, false);
      this.mode = saveMode;
    }
  }
  onDamaged(src) {
    if (this.mode === 'traffic' && src === 'player') { this.scared = 12; this.mode = 'flee'; this.cruise = 22; }
  }
  onBumped(other) {
    if (this.mode === 'traffic' && other.driver === 'player') {
      this.honkT = 0.6; G.audio.horn(this.v.x, this.v.z, 0.6);
      if (chance(0.25)) { this.mode = 'flee'; this.scared = 10; this.cruise = 20; }
    }
  }
}

// ==================================================================
export class TrafficManager {
  constructor() {
    this.target = 18;
    this.spawnT = 0;
  }
  carCount() { return G.vehicles.filter((v) => v.ai && v.ai.mode !== 'police' && !v.persistent).length; }

  randomEdgeNear(px, pz, minD, maxD) {
    const W = G.world;
    for (let k = 0; k < 30; k++) {
      const n = W.nodes[Math.floor(Math.random() * W.nodes.length)];
      const nb = pick(n.nbr);
      const o = W.nodes[nb];
      const t = rand(0.25, 0.75);
      const x = n.x + (o.x - n.x) * t, z = n.z + (o.z - n.z) * t;
      const d2 = dist2(x, z, px, pz);
      if (d2 < minD * minD || d2 > maxD * maxD) continue;
      return { a: n, b: o, t };
    }
    return null;
  }

  spawnCar(px, pz, minD = 90, maxD = 170, key = null, mode = 'traffic') {
    const e = this.randomEdgeNear(px, pz, minD, maxD);
    if (!e) return null;
    const { a, b, t } = e;
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const lane = chance(0.5) ? 2 : 6;
    const L = Math.abs(b.x - a.x) + Math.abs(b.z - a.z);
    const s = clamp(t * L, STOP + 6, L - STOP - 6);
    const x = a.x + dx * s + -dz * lane, z = a.z + dz * s + dx * lane;
    if (G.peds.inView(x, z) && dist2(x, z, px, pz) < 120 * 120 && mode === 'traffic') return null;
    for (const o of G.vehicles) if (dist2(o.x, o.z, x, z) < 100) return null;
    const v = G.vm.spawn(key || pick(TRAFFIC_MIX), x, z, Math.atan2(dx, dz));
    if (!v) return null;
    v.driver = { isPed: true, look: v.T.police ? copLook() : randomLook(), isCop: !!v.T.police };
    v.ai = new AIDriver(v, mode);
    v.ai.startEdge(a.id, b.id, lane);
    const sp = mode === 'traffic' ? v.ai.cruise * 0.8 : 10;
    v.vx = Math.sin(v.h) * sp; v.vz = Math.cos(v.h) * sp;
    return v;
  }

  // Fahrzeug im Landstraßennetz erzeugen (Landstraßen, Orte)
  spawnHillCar(px, pz, key = null, mode = 'traffic', minD = 70, maxD = 170) {
    const W = G.world, N = W.net;
    for (let k = 0; k < 24; k++) {
      // zufälliger Punkt im Ring um den Spieler -> nächste Kante
      const a = Math.random() * Math.PI * 2, r = minD + Math.random() * (maxD - minD);
      const loc = W.netLocate(px + Math.cos(a) * r, pz + Math.sin(a) * r);
      if (!loc || loc.d > 60) continue;
      const E = N.edges[loc.edge];
      if (E.causeway != null) continue;
      const idx = Math.max(1, Math.min(E.pts.length - 2, loc.idx));
      const [x0, z0] = E.pts[idx];
      const d2 = dist2(x0, z0, px, pz);
      if (d2 < minD * minD * 0.8 || d2 > maxD * maxD * 1.3) continue;
      if (mode === 'traffic' && G.peds.inView(x0, z0) && d2 < 140 * 140) continue;
      const fwd = E.pts[Math.min(E.pts.length - 1, idx + 3)];
      const dir = mode === 'police' ? (dist2(fwd[0], fwd[1], px, pz) < d2 ? 1 : -1) : chance(0.5) ? 1 : -1;
      const [x, z] = AIDriver.prototype.hillPoint.call(null, E, idx, dir);
      const nb = E.pts[idx + dir];
      if (G.vehicles.some((o) => dist2(o.x, o.z, x, z) < 100)) continue;
      const v = G.vm.spawn(key || pick(TRAFFIC_MIX.filter((t) => t !== 'taxi')), x, z, Math.atan2(nb[0] - x0, nb[1] - z0));
      if (!v) return null;
      v.driver = { isPed: true, look: v.T.police ? copLook() : randomLook(), isCop: !!v.T.police };
      v.ai = new AIDriver(v, mode);
      if (mode !== 'police') { v.ai.cruise = rand(11, 15); v.ai.startHill(loc.edge, idx, dir); const sp = 8; v.vx = Math.sin(v.h) * sp; v.vz = Math.cos(v.h) * sp; }
      return v;
    }
    return null;
  }

  spawnParked(x, z, h, key) {
    const v = G.vm.spawn(key || pick(TRAFFIC_MIX.filter((k) => k !== 'taxi')), x, z, h);
    if (v) v.parked = true;
    return v;
  }

  update(dt) {
    const P = G.player;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    const offMap = px > C.BEACH_X0 + 80 || px < C.LAND.minX - 20 || pz < C.LAND.minZ - 20 || pz > C.LAND.maxZ + 20;
    this.target = offMap ? 6 : G.quality === 'low' ? 14 : G.quality === 'medium' ? 22 : 28;
    if (G.world.env.night > 0.5) this.target = Math.round(this.target * 0.75);
    // KI
    for (const v of G.vehicles) {
      if (v.ai && v.driver !== 'player') {
        if (v.ai.scared > 0) { v.ai.scared -= 0.016; if (v.ai.scared <= 0 && v.ai.mode === 'flee' && !v.ai.keepFlee) { v.ai.mode = 'traffic'; v.ai.cruise = rand(11, 15); } }
        v.ai.update(dt);
      } else if (v.driver !== 'player') {
        v.input.throttle = 0; v.input.brake = v.parked ? 1 : 0.15; v.input.steer = 0; v.input.noReverse = true; v.input.handbrake = false;
      }
    }
    // Entfernen
    for (let i = G.vehicles.length - 1; i >= 0; i--) {
      const v = G.vehicles[i];
      if (v.persistent || v === P.vehicle || v === P.lastVehicle) continue;
      const d2 = dist2(v.x, v.z, px, pz);
      const far = d2 > 260 * 260 || (d2 > 190 * 190 && !G.peds.inView(v.x, v.z));
      if (far || v.despawnMe || (v.sinking && v.sinkT > 8) || (!v.alive && v.wreckT !== undefined && (v.wreckT += dt) > 40 && !G.peds.inView(v.x, v.z))) {
        if (v.police) G.police.unitRemoved(v);
        v.remove();
      }
    }
    // Neue Autos
    this.spawnT -= dt;
    if (G.interior) this.spawnT = 1;
    if (this.spawnT <= 0) {
      this.spawnT = 0.25;
      if (G.world.inHills(px, pz) && pz < -400) { if (this.carCount() < (G.quality === 'low' ? 6 : G.quality === 'medium' ? 10 : 14)) this.spawnHillCar(px, pz, null, 'traffic', 70, 190); }
      else if (this.carCount() < this.target) this.spawnCar(px, pz);
    }
  }

  // Parkende Autos in der Nähe (Parkplatz, Polizei)
  initParked() {
    const W = G.world;
    W.parkingSpots.forEach(([x, z, h], i) => { if (i % 3 === 0) this.spawnParked(x, z, h + (i % 2 ? Math.PI : 0)); });
    for (const [x, z, h] of W.pois.policeCars || []) { const v = this.spawnParked(x, z, h, 'police'); if (v) v.persistent = true; }
  }
}
