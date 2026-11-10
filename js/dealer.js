// Straßendealer: taucht zufällig an wechselnden Orten auf, ist auf der Karte markiert
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { Marker } from './missions.js';
import { rand, dist2, pick } from './utils.js';

const LOOK = () => {
  const c = (h) => new THREE.Color(h);
  return { skin: c(pick([0xc68642, 0x8d5524, 0xe0ac69, 0xf1c27d])), shirt: c(0x5a189a), sleeve: c(0x5a189a), pants: c(0x1b1b1f), legs: c(0x1b1b1f), hair: c(0x111111), shoes: c(0xffffff), hat: c(0x2b0a4a), bald: false, scale: 0.98 };
};

export class Dealer {
  constructor() { this.p = null; this.mk = null; this.moveT = 0; this.near = false; this.smokeT = 0; }
  // zufälliger Gehweg-Punkt in Stadt oder Altstadt
  place() {
    this.remove();
    const bi = Math.floor(rand(C.I0, C.NB)), bj = Math.floor(rand(0, C.NB));
    const loop = G.peds.sidewalkLoop(bi, bj, 1.4);
    const k = Math.floor(rand(0, 4)), a = loop[k], b = loop[(k + 1) % 4], t = rand(0.25, 0.75);
    this.x = a[0] + (b[0] - a[0]) * t; this.z = a[1] + (b[1] - a[1]) * t;
    this.moveT = rand(360, 600);
    this.spawned = false;
  }
  spawnPed() {
    const p = G.peds.spawnAt(this.x, this.z, LOOK(), 'mission');
    p.persistent = true; p.isDealer = true; p.yaw = rand(0, Math.PI * 2);
    p.onHurt = () => { p.isDealer = false; p.state = 'flee'; p.fleeFrom = G.player; p.timer = 20; this.flee(); };
    this.p = p; this.spawned = true;
    this.mk = new Marker(this.x, this.z, 0xb26bff, { label: '$', r: 1.0, h: 2.2 });
    this.mk.follow = p;
  }
  flee() { if (this.mk) { this.mk.remove(); this.mk = null; } if (this.p) this.p.persistent = false; this.p = null; this.moveT = 120; this.spawned = false; this.x = null; }
  remove() { if (this.mk) { this.mk.remove(); this.mk = null; } if (this.p && !this.p.removed) G.peds.remove(this.p); this.p = null; this.spawned = false; }
  sold() { this.lastSale = G.time; }
  blip() { return this.x != null ? { x: this.x, z: this.z } : null; }
  update(dt) {
    const P = G.player;
    if (this.x == null) { this.moveT -= dt; if (this.moveT <= 0 || this.moveT > 1000) this.place(); return; }
    this.moveT -= dt;
    if (this.moveT <= 0 && (!this.p || !G.peds.inView(this.x, this.z))) { this.place(); return; }
    const d2 = dist2(P.x, P.z, this.x, this.z);
    if (!this.spawned && d2 < 150 * 150 && !G.interior) this.spawnPed();
    if (this.spawned && (d2 > 190 * 190 || G.interior)) { if (this.p && !this.p.removed) G.peds.remove(this.p); this.p = null; this.spawned = false; if (this.mk) { this.mk.remove(); this.mk = null; } }
    const p = this.p;
    if (!p) return;
    if (p.removed || !p.alive) { this.flee(); return; }
    this.mk.update(dt);
    // auffällig: lila Rauchwölkchen, schaut sich um
    this.smokeT -= dt;
    if (this.smokeT <= 0) { this.smokeT = 0.6; G.effects.smoke(p.x + Math.sin(p.yaw) * 0.3, p.y + 1.7, p.z + Math.cos(p.yaw) * 0.3, 1, 0.1); }
    p.anim.headYaw = Math.sin(G.time * 0.8) * 0.6;
    const near = P.state === 'foot' && d2 < 2.2 * 2.2 && !G.missions.uiOpen && G.state === 'playing';
    if (near && !this.near) {
      p.yaw = Math.atan2(P.x - p.x, P.z - p.z);
      G.hud.subtitle('Händler', pick(['Psst … du siehst aus, als bräuchtest du was.', 'Hey, Kumpel. Gute Ware, faire Preise.', 'Schnell, bevor die Bullen kommen.']), '#b26bff');
      setTimeout(() => G.hud.subtitle(), 2600);
      G.ui.street();
    }
    this.near = near;
  }
}
