// Seltene Zufallsereignisse: Polizei jagt NPCs (im Auto oder zu Fuß)
import { G } from './state.js';
import * as C from './config.js';
import { rand, dist2, chance } from './utils.js';

export class RandomEvents {
  constructor() { this.t = rand(100, 200); this.active = null; }
  update(dt) {
    if (this.active) { this.updateActive(dt); return; }
    const P = G.player, px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    if (G.police.level > 0 || (G.missions.active && !G.missions.active.side) || G.interior || G.world.inHills(px, pz)) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = rand(170, 320);
    if (chance(0.65)) this.carChase(px, pz); else this.footChase(px, pz);
  }
  radio(text) { G.hud.toast(`📻 Polizeifunk: ${text}`); }
  carChase(px, pz) {
    const T = G.traffic;
    const v = T.spawnCar(px, pz, 70, 140, null, 'flee');
    if (!v) { this.t = 20; return; }
    v.persistent = true; v.ai.keepFlee = true; v.ai.scared = 9999; v.ai.cruise = 23; v.eventRunner = true;
    const cops = [];
    for (let k = 0; k < 2; k++) {
      const c = T.spawnCar(v.x, v.z, 25, 70, 'police', 'chase');
      if (!c) continue;
      c.persistent = true; c.siren = true; c.ai.target = v; c.ai.cruise = 27;
      cops.push(c);
    }
    if (!cops.length) { v.persistent = false; v.ai.keepFlee = false; v.ai.scared = 5; this.t = 20; return; }
    v.ai.fleeFrom = cops[0];
    this.active = { kind: 'car', v, cops, t: 0 };
    const [bi, bj] = C.blockOf(v.x, v.z);
    this.radio(`Verfolgungsjagd in ${C.DISTRICT_NAMES[C.districtOf(Math.max(C.I0, Math.min(8, bi)), Math.max(0, Math.min(8, bj)))] || 'der Stadt'} – flüchtiger Wagen!`);
  }
  footChase(px, pz) {
    const thief = G.peds.spawnSidewalk(px, pz);
    if (!thief) { this.t = 20; return; }
    const cop = G.peds.spawnCop(thief.x + rand(-1, 1) * 9, thief.z + rand(-1, 1) * 9);
    thief.persistent = true; cop.persistent = true;
    thief.state = 'flee'; thief.fleeFrom = cop; thief.timer = 60; thief.speed = 6;
    cop.chaseTarget = thief; cop.state = 'cop';
    this.active = { kind: 'foot', thief, cop, t: 0 };
    this.radio('Taschendieb flüchtet zu Fuß!');
  }
  updateActive(dt) {
    const A = this.active, P = G.player;
    A.t += dt;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    let end = A.t > 75 || G.police.level > 0;
    if (A.kind === 'car') {
      if (!A.v.alive || A.v.removed || dist2(A.v.x, A.v.z, px, pz) > 300 * 300) end = true;
      // Flüchtiger gestoppt: Polizei hat ihn
      if (A.v.alive && A.t > 8 && A.v.speed < 1 && A.cops.some((c) => dist2(c.x, c.z, A.v.x, A.v.z) < 12 * 12)) { A.caught = (A.caught || 0) + dt; if (A.caught > 3) { end = true; this.radio('Verdächtiger festgenommen.'); } }
    } else {
      const { thief, cop } = A;
      if (!thief.alive || !cop.alive || thief.removed || cop.removed) end = true;
      else if (dist2(thief.x, thief.z, cop.x, cop.z) < 1.8 * 1.8) { thief.state = 'idle'; thief.surrender = true; thief.anim.handsUp = true; thief.timer = 8; end = true; this.radio('Taschendieb gestellt.'); }
    }
    if (end) this.finish();
  }
  finish() {
    const A = this.active; this.active = null;
    if (!A) return;
    if (A.kind === 'car') {
      if (A.v && !A.v.removed) { A.v.persistent = false; if (A.v.ai) { A.v.ai.keepFlee = false; A.v.ai.scared = 3; } }
      for (const c of A.cops) {
        if (c.removed) continue;
        c.persistent = false; c.siren = false;
        if (c.ai) { c.ai.target = null; c.ai.mode = 'traffic'; c.ai.cruise = 13; c.ai.route = []; c.ai.pts = []; const n = G.world.nearestNode(c.x, c.z); c.ai.startEdge(n.id, n.nbr[0]); }
      }
    } else {
      if (A.thief) A.thief.persistent = false;
      if (A.cop) { A.cop.persistent = false; A.cop.chaseTarget = null; }
    }
  }
}
