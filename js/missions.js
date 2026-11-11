// Missionen, Marker, Pickups, Sammelobjekte, Läden
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import * as TX from './textures.js';
import { AIDriver } from './traffic.js';
import { WEAPONS } from './combat.js';
import { randomLook, OUTFITS, CAR_TYPES } from './models.js';
import { clamp, rand, dist2, pick, chance } from './utils.js';
import { MISSIONS3, CONTACTS3, TALK3, registerPois } from './missions3.js';

const N = (i, j) => C.nodeId(i, j);
const NP = (x, z) => C.nodeId(Math.round((x + C.HALF) / C.CELL), Math.round((z + C.HALF) / C.CELL));
const COL = new THREE.Color();

// ------------------------------------------------------------ Marker (3D)
const markerTex = TX.markerTexture();
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
const arrowGeo = new THREE.ConeGeometry(0.6, 1.2, 4).rotateX(Math.PI);
function iconTexture(label, col) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = col; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 70px "Russo One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class Marker {
  constructor(x, z, color = 0xffd23f, opts = {}) {
    this.x = x; this.z = z;
    this.r = opts.r || 1.6;
    const h = opts.h || 2.6;
    this.group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ map: markerTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.cyl = new THREE.Mesh(cylGeo, mat); this.cyl.scale.set(this.r, h, this.r);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.scale.set(this.r, 1, this.r); this.ring.position.y = 0.06;
    this.group.add(this.cyl, this.ring);
    this.cyl.renderOrder = 8; this.ring.renderOrder = 8;
    if (opts.label) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(opts.label, '#' + new THREE.Color(color).getHexString()), depthTest: false, transparent: true }));
      sp.scale.set(1.3, 1.3, 1); sp.position.y = h + 1; sp.renderOrder = 9;
      this.icon = sp; this.group.add(sp);
    }
    if (opts.arrow) {
      this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      this.arrow.position.y = h + 1.2; this.group.add(this.arrow);
    }
    this.follow = opts.follow || null;
    this.y = opts.y != null ? opts.y : G.world.groundHeight(x, z);
    this.group.position.set(x, this.y, z);
    G.scene.add(this.group);
    this.t = Math.random() * 6;
  }
  update(dt) {
    this.t += dt;
    if (this.follow) {
      const f = this.follow;
      this.x = f.x; this.z = f.z;
      this.group.position.set(f.x, f.y + (f.isPed ? 1.2 : f.height || 1.5), f.z);
      this.cyl.visible = false; this.ring.visible = false;
    }
    const b = Math.sin(this.t * 2.5) * 0.15;
    if (this.icon) this.icon.position.y = this.cyl.scale.y + 1 + b;
    if (this.arrow) { this.arrow.position.y = (this.follow ? 1.6 : this.cyl.scale.y + 1.2) + b; this.arrow.rotation.y += dt * 2; }
    this.ring.rotation.y += dt;
    const s = 1 + Math.sin(this.t * 3) * 0.04;
    this.ring.scale.set(this.r * s, 1, this.r * s);
  }
  remove() { G.scene.remove(this.group); }
}

// ------------------------------------------------------------ Pickups
const PK = {};
function pickupMeshes() {
  if (PK.ready) return;
  PK.ready = true;
  const glow = TX.radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 64);
  PK.glowMat = (col) => new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const cross = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xff2e4d, emissive: 0x880011, roughness: 0.4 });
  cross.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.22), red), new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.22, 0.22), red));
  PK.health = cross;
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0x2f7bff, emissive: 0x0a2a88, metalness: 0.5, roughness: 0.3 }));
  PK.armor = shield;
  const gun = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x222222, metalness: 0.7, roughness: 0.3 });
  gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.12), gm));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, 0.1), gm); grip.position.set(-0.2, -0.18, 0); gun.add(grip);
  PK.weapon = gun;
  const cash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0x3cb44b, emissive: 0x0b4a14, roughness: 0.6 }));
  PK.money = cash;
  const sh = new THREE.Group();
  const sm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.4, 1.4) });
  for (let k = 0; k < 7; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.04), sm); r.position.y = 0.3; const p = new THREE.Group(); p.add(r); p.rotation.z = (k - 3) * 0.28; sh.add(p); }
  PK.shell = sh;
}

export class Missions {
  constructor() {
    this.progress = 0;
    this.active = null; this.gen = null;
    this.markers = []; this.pickups = [];
    this.shells = new Set();
    this.waypoint = null; this.gpsTarget = null;
    this.ents = [];
    this.fails = [];
    this.freeze = false;
    this.timerLeft = null;
    this.giverMarker = null;
    this.serviceMarkers = [];
    this.taxi = null;
    this.uiOpen = false;
    this.taxiFares = 0;
    this.done = new Set();
    this.rewards = new Set();
    this.givers = [];
  }
  get progress() { return this.done.size; }
  set progress(n) { // Altstände (lineare Geschichte) übernehmen
    const old = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];
    for (let i = 0; i < Math.min(n, old.length); i++) this.done.add(old[i]);
  }

  init() {
    pickupMeshes();
    registerPois(G.world);
    const W = G.world, poi = W.pois;
    // Dienste
    this.serviceMarkers = [
      { kind: 'gunshop', m: new Marker(poi.gunshop.x, poi.gunshop.z, 0xff7b39, { label: 'W', r: 1.3 }) },
    ];
    for (const s of this.serviceMarkers) s.inside = true; // erst nach Verlassen erneut auslösen
    // Pickups
    const P = (x, z, type, data, respawn = 120) => this.addPickup(x, z, type, data, respawn);
    for (const [x, z] of [[-140, -58], [12, -228], [-252, 12], [148, 172], [392, 82], [600, 60], [-240, -128], [222, -134]]) P(x, z, 'health');
    for (const [x, z] of [[80, -141], [650, 20], [-240, 345], [-350, 300]]) P(x, z, 'armor');
    P(248, -138, 'weapon', { w: 'pistol', ammo: 36 });
    P(-80, 270, 'weapon', { w: 'smg', ammo: 90 });
    P(-350, 0, 'weapon', { w: 'shotgun', ammo: 16 });
    P(600, 70, 'weapon', { w: 'rifle', ammo: 60 });
    // Neon-Muscheln
    this.shellPos = [[420, -340], [445, -120], [640, 70], [415, 300], [12, -252], [-320, 110], [-240, 340], [-378, 0], [100, 378], [-80, 175], [250, 235], [-228, 12], [172, 172], [-320, -350], [300, -378], [376, 0], [-50, -50], [520, 40], [-200, 378], [630, 15]];
    this.shellPos.forEach(([x, z], i) => { if (!this.shells.has(i)) this.addPickup(x, z, 'shell', { i }, 0); });
    this.grantRewards(true);
    this.updateGivers(true);
  }

  addPickup(x, z, type, data = {}, respawn = 120) {
    const proto = PK[type];
    const m = proto.clone();
    const glow = new THREE.Sprite(PK.glowMat(type === 'health' ? 0xff3b5c : type === 'armor' ? 0x2f7bff : type === 'money' ? 0x3cb44b : type === 'shell' ? 0xff4fd8 : 0xffd23f));
    glow.scale.set(1.8, 1.8, 1);
    const g = new THREE.Group(); g.add(m, glow);
    const y = G.world.groundHeight(x, z);
    g.position.set(x, y + 0.8, z);
    G.scene.add(g);
    const p = { x, z, y, type, data, g, m, respawn, active: true, t: Math.random() * 6, life: data.life || 0 };
    this.pickups.push(p);
    return p;
  }
  dropMoney(x, z, amt) { this.addPickup(x + rand(-0.5, 0.5), z + rand(-0.5, 0.5), 'money', { amt, life: 30 }, 0); }
  dropWeapon(x, z, w, ammo) { this.addPickup(x, z, 'weapon', { w, ammo, life: 30 }, 0); }

  updatePickups(dt) {
    const P = G.player;
    const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      if (!p.active) {
        p.cool -= dt;
        if (p.cool <= 0 && dist2(p.x, p.z, px, pz) > 40 * 40) { p.active = true; p.g.visible = true; }
        continue;
      }
      if (p.data.life) { p.data.life -= dt; if (p.data.life <= 0) { G.scene.remove(p.g); this.pickups.splice(i, 1); continue; } }
      const d2 = dist2(p.x, p.z, px, pz);
      p.g.visible = d2 < 160 * 160;
      if (!p.g.visible) continue;
      p.m.rotation.y += dt * 2;
      p.g.position.y = p.y + 0.8 + Math.sin(p.t * 2.5) * 0.12;
      const reach = P.inCar ? (p.type === 'money' || p.type === 'shell' ? 3 : 2.2) : 1.3;
      if (d2 < reach * reach && Math.abs(p.y - (P.inCar ? P.vehicle.y : P.y)) < 2.5 && P.state !== 'dead') this.collect(p, i);
    }
  }
  collect(p, i) {
    const P = G.player;
    switch (p.type) {
      case 'health': if (P.health >= 100) return; P.health = 100; G.hud.toast('Gesundheit aufgefüllt'); break;
      case 'armor': if (P.armor >= 100) return; P.armor = 100; G.hud.toast('Schutzweste angelegt'); break;
      case 'weapon': P.giveWeapon(p.data.w, p.data.ammo); G.hud.toast(`${WEAPONS[p.data.w].name} +${p.data.ammo} Schuss`); break;
      case 'money': P.addMoney(p.data.amt); break;
      case 'shell': {
        this.shells.add(p.data.i);
        const n = this.shells.size, tot = this.shellPos.length;
        P.addMoney(250);
        G.hud.bigToast(`NEON-MUSCHEL ${n}/${tot}`, n === tot ? 'Alle gefunden! Bonus +$10.000' : '+$250');
        if (n === tot) P.addMoney(10000);
        G.save.write();
        break;
      }
    }
    G.audio.pickup();
    if (p.respawn > 0) { p.active = false; p.cool = p.respawn; p.g.visible = false; }
    else { G.scene.remove(p.g); this.pickups.splice(i, 1); }
  }

  // ------------------------------------------------------------ Auftrags-Stammbaum
  get story() { return MISSIONS; }
  get list() { return MISSIONS; }
  isDone(id) { return this.done.has(id); }
  isAvailable(def) {
    if (this.done.has(def.id)) return false;
    if (!def.req.every((r) => this.done.has(r))) return false;
    if (def.needContact && !(G.player.contacts && G.player.contacts.has(def.needContact))) return false;
    return true;
  }
  // sichtbar im Stammbaum: erledigt, verfügbar oder direkt angrenzend (als „???“)
  isTeased(def) { return this.done.has(def.id) || this.isAvailable(def) || def.req.length === 0 || def.req.some((r) => this.done.has(r)); }
  giverPos(contact) {
    const C = CONTACT_INFO[contact];
    if (C.inside) return { x: C.inside[0], z: C.inside[1], door: C.door };
    const p = G.world.pois[C.poi];
    return p ? { x: p.x, z: p.z } : null;
  }
  // Position für Karte & GPS (bei Innenräumen: die Eingangstür)
  giverMapPos(contact) {
    const g = this.giverPos(contact);
    if (g && g.door && G.interiors) { const d = G.interiors.doorPos(g.door); if (d) return d; }
    return g;
  }
  updateGivers(silent = false) {
    for (const g of this.givers) g.m.remove();
    this.givers = [];
    const seen = new Set(), P = G.player;
    for (const def of MISSIONS) {
      if (seen.has(def.contact) || !this.isAvailable(def)) continue;
      seen.add(def.contact);
      const pos = this.giverPos(def.contact);
      if (!pos) continue;
      const m = new Marker(pos.x, pos.z, 0xffd23f, { label: def.label, r: 1.3 });
      this.givers.push({ m, def, pos });
      // neue Kontakte durch freigeschaltete Aufträge
      const ci = CONTACT_INFO[def.contact];
      if (ci.auto && P.contacts && !P.contacts.has(def.contact)) {
        P.contacts.add(def.contact);
        if (!silent) setTimeout(() => G.hud.bigToast('NEUER KONTAKT', `${ci.name} (${ci.role}) wurde in deinem Handy gespeichert`), 2600);
      }
    }
    this.giverMarker = this.givers[0] ? this.givers[0].m : null;
    this.giverDef = this.givers[0] ? this.givers[0].def : null;
  }
  updateGiver() { this.updateGivers(); }
  // Belohnungsautos in die Garage (auch für ältere Spielstände)
  grantRewards(silent = false) {
    const P = G.player;
    for (const def of MISSIONS) {
      if ((!def.rewardCar && !def.rewardBoat && !def.rewardPlane) || !this.done.has(def.id) || this.rewards.has(def.id)) continue;
      this.rewards.add(def.id);
      if (def.rewardBoat) { P.boats = P.boats || []; P.boats.push({ key: def.rewardBoat[0], color: def.rewardBoat[1], id: Date.now() + Math.floor(Math.random() * 1000) }); if (!silent) G.hud.toast('⚓ Neues Boot – am Bootssteg (⚓) unter „Meine Boote“'); continue; }
      if (def.rewardPlane) { P.planes = P.planes || []; P.planes.push({ key: def.rewardPlane[0], color: def.rewardPlane[1], id: Date.now() }); if (!silent) G.hud.toast('✈️ Eigenes Flugzeug – am Flugfeld Los Ranchos abholen'); continue; }
      const [key, color] = def.rewardCar;
      P.garage.push({ key, color, id: Date.now() + Math.floor(Math.random() * 1000) });
      if (!silent) setTimeout(() => G.hud.bigToast('NEUES AUTO IN DER GARAGE', `${CAR_TYPES[key].name} – im Handy unter „Garage“ abrufbar`), 4200);
    }
  }

  mapBlips(full = false) {
    const out = [];
    const poi = G.world.pois;
    if (!this.active) for (const g of this.givers) { const p = this.giverMapPos(g.def.contact); if (p) out.push({ x: p.x, z: p.z, col: '#ffd23f', label: g.def.label, edge: true, r: 0.05, name: `${CONTACT_INFO[g.def.contact].name}: ${g.def.title}` }); }
    out.push({ x: poi.safehouse.x, z: poi.safehouse.z, col: '#7cff6b', label: 'H', r: 0.04 });
    out.push({ x: poi.gunshop.x, z: poi.gunshop.z, col: '#ff7b39', label: 'W', r: 0.04 });
    out.push({ x: 234, z: 106.5, col: '#ff2e88', label: 'C', r: 0.04, name: 'Club Velvet' });
    if (poi.dealer) out.push({ x: poi.dealer.x, z: poi.dealer.z, col: '#ff4fd8', label: 'A', r: 0.04, name: 'Solera Motors' });
    for (const id of ['shop', 'shop2', 'shop3']) if (poi[id]) out.push({ x: poi[id].x, z: poi[id].z, col: '#ffd23f', label: '24', r: 0.035, name: 'Samis 24/7' });
    if (poi.cafe) out.push({ x: poi.cafe.x, z: poi.cafe.z, col: '#ffb35c', label: '☕', r: 0.035, name: 'Café Vieja' });
    if (G.dealer && G.dealer.blip()) { const d = G.dealer.blip(); out.push({ x: d.x, z: d.z, col: '#b26bff', label: '$', r: 0.035, edge: true, name: 'Straßenhändler' }); }
    if (poi.boutique) out.push({ x: poi.boutique.x, z: poi.boutique.z, col: '#ff6fb0', label: 'M', r: 0.035, name: 'Moda Solera' });
    out.push({ x: 10, z: 26.8, col: '#19e6ff', label: 'B', r: 0.04, name: 'Solera Bank' });
    if (full) {
      out.push({ x: poi.hospital.x, z: poi.hospital.z, col: '#ff4d6d', label: '+' });
      out.push({ x: poi.police.x, z: poi.police.z, col: '#4d8bff', label: 'P' });
      out.push({ x: poi.pier.x, z: poi.pier.z, col: '#ff9f1c', label: '★' });
    }
    if (G.blipFns) for (const f of G.blipFns) for (const b of f(full)) out.push(b);
    for (const m of this.markers) if (m.blip) out.push({ x: m.x, z: m.z, col: m.blipCol || '#ffd60a', edge: true, r: 0.045 });
    return out;
  }

  update(dt) {
    this.updatePickups(dt);
    for (const s of this.serviceMarkers) s.m.update(dt);
    for (const g of this.givers) { g.m.update(dt); g.m.group.visible = !this.active; }
    for (const m of this.markers) m.update(dt);
    const P = G.player;
    // GPS
    this.gpsTarget = null;
    const obj = this.markers.find((m) => m.blip);
    if (obj) this.gpsTarget = { x: obj.x, z: obj.z };
    else if (!this.active && this.givers.length && !this.waypoint && !G.interior) {
      let best = null, bd = 1e12;
      for (const g of this.givers) { const p = this.giverMapPos(g.def.contact); if (!p) continue; const d = dist2(p.x, p.z, P.x, P.z); if (d < bd) { bd = d; best = p; } }
      if (best) this.gpsTarget = { x: best.x, z: best.z };
    }
    if (this.waypoint && dist2(this.waypoint.x, this.waypoint.z, P.x, P.z) < 15 * 15) this.waypoint = null;

    if (this.active) {
      if (this.timerLeft != null) {
        this.timerLeft -= dt;
        G.hud.timer(this.timerLeft);
        if (this.timerLeft <= 0) { this.fail('Die Zeit ist abgelaufen.'); return; }
      }
      for (const [fn, reason] of this.fails) if (fn()) { this.fail(reason); return; }
      if (this.gen) {
        const r = this.gen.next();
        if (r.done && this.active) this.pass(this.active.reward, this.active.title);
      }
      return;
    }
    // Missionsbeginn
    if (P.state === 'foot' && G.police.level === 0) {
      for (const g of this.givers) if (dist2(P.x, P.z, g.m.x, g.m.z) < 1.8 * 1.8) { this.start(g.def); return; }
    }
    // Dienste
    if (P.state === 'foot' && !this.uiOpen) {
      for (const s of this.serviceMarkers) {
        const inside = dist2(P.x, P.z, s.m.x, s.m.z) < 1.8 * 1.8;
        if (inside && !s.inside) { s.inside = true; G.openService(s.kind); }
        if (!inside) s.inside = false;
      }
    }
    // Taxi-Nebenjob
    if (P.inCar && P.vehicle.T.taxi && !this.active && G.police.level === 0) {
      this.taxiWait = (this.taxiWait || 0) + dt;
      if (this.taxiWait > 2.5) { this.taxiWait = 0; this.start(TAXI); }
    } else this.taxiWait = 0;
  }

  // ----------------------------------------------------- Missionsablauf
  start(def) {
    this.active = def;
    this.fails = [];
    this.ents = [];
    this.timerLeft = null;
    this.gen = def.run(this);
    if (!def.side) {
      G.hud.bigToast(def.title.toUpperCase(), def.sub || '');
      G.audio.checkpoint();
    }
  }
  cleanup(keepAll = false) {
    for (const m of this.markers) m.remove();
    this.markers = [];
    for (const e of this.ents) {
      if (e.keep || keepAll) { if (e.obj) { e.obj.persistent = false; e.obj.missionTarget = false; e.obj.missionCar = false; e.obj.racer = false; } continue; }
      const o = e.obj;
      if (!o) continue;
      if (o.isPed) { if (!o.removed) G.peds.remove(o); }
      else if (o.group) {
        if (o === G.player.vehicle) { o.persistent = false; o.missionCar = false; o.missionTarget = false; continue; }
        o.remove();
      }
    }
    this.ents = [];
    this.fails = [];
    this.timerLeft = null;
    G.hud.timer(null); G.hud.objective(''); G.hud.racePos(''); G.hud.subtitle(); G.hud.countdown(null);
    this.freeze = false;
    G.police.locked = false; G.police.minLevel = 0;
    this.cineOff();
    this.gen = null;
    this.active = null;
  }
  pass(reward, title) {
    const def = this.active;
    this.cleanup();
    if (!def.side) {
      G.hud.banner('AUFTRAG ERFÜLLT', '#ffd23f', `${title}  ·  +$${reward}`);
      G.audio.jingle();
      if (reward) G.player.addMoney(reward);
      const before = new Set(MISSIONS.filter((d) => this.isAvailable(d)).map((d) => d.id));
      this.done.add(def.id);
      if (def.unlockContact && G.player.contacts && !G.player.contacts.has(def.unlockContact)) {
        G.player.contacts.add(def.unlockContact);
        const ci = CONTACT_INFO[def.unlockContact];
        setTimeout(() => G.hud.bigToast('NEUER KONTAKT', `${ci.name} (${ci.role}) wurde in deinem Handy gespeichert`), 2600);
      }
      this.grantRewards();
      this.updateGivers();
      const fresh = MISSIONS.filter((d) => this.isAvailable(d) && !before.has(d.id));
      if (fresh.length) setTimeout(() => G.hud.toast(`📱 Neu freigeschaltet: ${fresh.map((d) => `<b>${d.title}</b> (${CONTACT_INFO[d.contact].name})`).join(', ')}`), 6500);
      G.save.write();
      if (def.after) def.after(this);
    }
  }
  fail(reason) {
    if (!this.active) return;
    const def = this.active;
    this.cleanup();
    if (!def.side) {
      setTimeout(() => G.hud.banner('AUFTRAG GESCHEITERT', '#ff3b5c', reason), G.player.state === 'dead' || G.player.state === 'busted' ? 3500 : 0);
      G.audio.fail();
    } else if (reason) G.hud.toast(reason);
  }
  onEvaded() {}
  onCasino(net) { this.casinoPlays = (this.casinoPlays || 0) + 1; this.casinoNet = (this.casinoNet || 0) + net; }
  onEnterVehicle(v) {}
  onExitVehicle(v) {}

  // ---------------------------------------------------------- Helfer
  track(obj, keep = false) { this.ents.push({ obj, keep }); return obj; }
  failIf(fn, reason) { this.fails.push([fn, reason]); }
  objective(t) { G.hud.objective(t); }
  marker(x, z, color = 0xffd23f, opts = {}) { const m = new Marker(x, z, color, opts); m.blip = opts.blip !== false; if (opts.blipCol) m.blipCol = opts.blipCol; this.markers.push(m); return m; }
  removeMarker(m) { const i = this.markers.indexOf(m); if (i >= 0) this.markers.splice(i, 1); m.remove(); }
  clearArea(x, z, r) {
    for (let i = G.vehicles.length - 1; i >= 0; i--) {
      const v = G.vehicles[i];
      if (v.persistent || v === G.player.vehicle) continue;
      if (dist2(v.x, v.z, x, z) < r * r) v.remove();
    }
  }
  spawnCar(key, x, z, h, color, flags = {}) {
    this.clearArea(x, z, 7);
    const v = G.vm.spawn(key, x, z, h, color);
    if (!v) return null;
    v.persistent = true; v.parked = true;
    Object.assign(v, flags);
    this.track(v, !!flags.keep);
    return v;
  }
  npc(x, z, look, yaw = 0) {
    const p = G.peds.spawnAt(x, z, look, 'mission');
    p.persistent = true; p.yaw = yaw;
    this.track(p);
    return p;
  }
  cineOn(from, look) {
    G.hud.letterbox(true);
    G.cam.setCine(from, look, 0);
    this.cine = true;
    const P = G.player;
    if (P.inCar) { P.vehicle.input.throttle = 0; P.vehicle.input.brake = 1; }
    this.freeze = true;
  }
  cineOff() {
    if (!this.cine) return;
    this.cine = false;
    G.hud.letterbox(false);
    G.hud.subtitle();
    G.cam.clearCine();
    this.freeze = false;
  }
  skip() { const I = G.input; return I.pressed('enter') || I.pressed('jump') || I.pressed('fire') || I.pressed('skip'); }

  *wait(sec) { let t = 0; while (t < sec) { t += G.dt; yield; } }
  *until(fn) { while (!fn()) yield; }
  *talk(lines, focus, other = null) {
    // focus: {x,y,z} Mittelpunkt der Szene
    const P = G.player;
    const fx = focus.x, fz = focus.z, fy = focus.y || G.world.groundHeight(fx, fz);
    const ang = Math.atan2(P.x - fx, P.z - fz) + 1.1;
    const cd = G.interior ? 3.3 : 6;
    const from = new THREE.Vector3(fx + Math.sin(ang) * cd, fy + (G.interior ? 1.9 : 2.4), fz + Math.cos(ang) * cd);
    const tx = other ? (fx + other.x) / 2 : fx, tz = other ? (fz + other.z) / 2 : fz;
    this.cineOn(from, new THREE.Vector3(tx, fy + 1.5, tz));
    const prevState = P.state;
    if (P.state === 'foot') { P.state = 'cutscene'; P.vx = P.vz = 0; if (other) P.yaw = Math.atan2(other.x - P.x, other.z - P.z); }
    if (other) other.yaw = Math.atan2(P.x - other.x, P.z - other.z);
    for (let [who, text] of lines) {
      const col = { Leo: '#7cff6b', Rosa: '#ff8fab', Dex: '#ffd23f', Val: '#b26bff', Marco: '#ff9f1c', Sami: '#ffd23f', 'Inés': '#ffb35c', Brandt: '#19e6ff', Aurelio: '#e9d8a6', Schläger: '#ff3b5c' }[who] || TALK3[who] || '#19e6ff';
      const nm = G.player.name || 'Leo';
      text = text.replace(/\bLeo\b/g, nm);
      G.hud.subtitle(who === 'Leo' ? nm : who, text, col);
      const dur = 1.6 + text.length * 0.05;
      let t = 0;
      yield;
      while (t < dur) { t += G.dt; if (t > 0.35 && this.skip()) break; yield; }
    }
    this.cineOff();
    if (P.state === 'cutscene') P.state = prevState === 'cutscene' ? 'foot' : prevState;
  }
  *goTo(x, z, text, opts = {}) {
    const m = this.marker(x, z, opts.color || 0xffd23f, { r: opts.r || 3, h: opts.h || 3 });
    this.objective(text);
    const P = G.player;
    yield* this.until(() => {
      const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
      if (dist2(px, pz, x, z) > (opts.r || 3) * (opts.r || 3) + 4) return false;
      if (opts.car && !P.inCar) return false;
      if (opts.vehicle && P.vehicle !== opts.vehicle) return false;
      if (opts.stop && P.inCar && P.vehicle.speed > 4) return false;
      if (opts.foot && P.state !== 'foot') return false;
      return true;
    });
    this.removeMarker(m);
    this.objective('');
  }
  // Feindliche Gang (Fußvolk). opts: gun, hp, goal{x,z}, aggro, col
  gang(x, z, n, opts = {}) {
    const list = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = this.npc(x + Math.cos(a) * (1 + k * 0.4), z + Math.sin(a) * (1 + k * 0.4), LOOKS.gang(opts.col));
      p.state = 'gang'; p.isGang = true; p.hostile = true; p.gangGun = opts.gun !== false;
      p.health = opts.hp || 60; p.speed = 4.6; p.aggroR = opts.aggro || 45; p.slow = opts.slow || 1;
      if (opts.goal) p.goal = opts.goal;
      if (opts.mark !== false) p.mk = this.marker(0, 0, 0xff3b5c, { follow: p, arrow: true, blipCol: '#ff3b5c' });
      list.push(p);
    }
    return list;
  }
  // entfernt Marker toter Gangmitglieder, gibt Anzahl Lebender zurück
  aliveGang(list) {
    let n = 0;
    for (const p of list) {
      if (p.alive && !p.removed) n++;
      else if (p.mk) { this.removeMarker(p.mk); p.mk = null; }
    }
    return n;
  }
  *getInCar(text = 'Steig in ein <b>Fahrzeug</b>.') {
    const P = G.player;
    if (P.inCar) return;
    this.objective(text);
    G.hud.hint(G.isTouch ? 'Geh zu einem Auto und tippe auf <b>EIN</b>.' : 'Geh zu einem Auto und drücke <b>F</b> zum Einsteigen.', 7);
    yield* this.until(() => P.inCar);
    this.objective('');
  }
}

// ======================================================================
//  Figuren der Geschichte
// ======================================================================
const LOOKS = {
  rosa: () => ({ ...base(0xc68642), shirt: c(0xd94f70), sleeve: c(0xd94f70), pants: c(0x3a3a3a), legs: c(0x3a3a3a), hair: c(0xa8a8a8), scale: 0.88 }),
  dex: () => ({ ...base(0x8d5524), shirt: c(0x3d5a80), sleeve: c(0x3d5a80), pants: c(0x3d5a80), legs: c(0x3d5a80), hair: c(0x111111), hat: c(0xe76f51), scale: 1.0 }),
  val: () => ({ ...base(0xf1c27d), shirt: c(0x5a189a), sleeve: c(0x5a189a), pants: c(0x240046), legs: c(0x240046), hair: c(0x1b1b1b), scale: 0.94 }),
  marco: () => ({ ...base(0xe0ac69), shirt: c(0xffd166), sleeve: c(0xe0ac69), pants: c(0xf4f1de), legs: c(0xe0ac69), hair: c(0x3b2716), scale: 0.98 }),
  crew: () => ({ ...base(0xe0ac69), shirt: c(0x111111), sleeve: c(0x111111), pants: c(0x222222), legs: c(0x222222), hair: c(0x111111), hat: c(0x111111), scale: 1.0 }),
  gang: (col) => { const l = randomLook(); return { ...l, shirt: c(col || 0xb5121b), sleeve: Math.random() < 0.5 ? l.skin : c(col || 0xb5121b), pants: c(0x1b1b1f), legs: c(0x1b1b1f), hat: Math.random() < 0.6 ? c(0x111111) : null, scale: 0.95 + Math.random() * 0.08 }; },
  ines: () => ({ ...base(0xd9a066), shirt: c(0x7a2e1e), sleeve: c(0xd9a066), pants: c(0x2b2b2b), legs: c(0x2b2b2b), hair: c(0x2b1a10), scale: 0.9 }),
  brandt: () => ({ ...base(0xf1c27d), shirt: c(0x1d3557), sleeve: c(0x1d3557), pants: c(0x2b2d42), legs: c(0x2b2d42), hair: c(0xe6e6e6), hat: c(0x1d3557), scale: 1.02 }),
  aurelio: () => ({ ...base(0xe0ac69), shirt: c(0xf4f1de), sleeve: c(0xf4f1de), pants: c(0x2b2d42), legs: c(0x2b2d42), hair: c(0xcfcfcf), scale: 1.0 }),
  sami: () => ({ ...base(0xc68642), shirt: c(0x2b6f77), sleeve: c(0x2b6f77), pants: c(0x3a3a3a), legs: c(0x3a3a3a), hair: c(0x9e9e9e), scale: 0.95 }),
};
function c(h) { return new THREE.Color(h); }
function base(skin) { const s = c(skin); return { skin: s, shoes: c(0x222222), hat: null, bald: false }; }

function* standAt(m, def) {
  // Auftraggeber-NPC am Marker (in Innenräumen: der Bewohner selbst)
  const P = G.player;
  const res = G.interiors && G.interiors.residents && G.interiors.residents[def.contact];
  if (res && !res.removed) { res.yaw = Math.atan2(P.x - res.x, P.z - res.z); return res; }
  if (def.contact === 'sami' && G.interiors && G.interiors.sami && !G.interiors.sami.removed) return G.interiors.sami;
  const pos = m.giverPos(def.contact);
  const p = m.npc(pos.x + Math.sin(P.yaw) * 1.8, pos.z + Math.cos(P.yaw) * 1.8, LOOKS[def.npc](), 0);
  p.yaw = Math.atan2(P.x - p.x, P.z - p.z);
  return p;
}

// Checkpoint-Folge
function* checkpoints(m, pts, opts = {}) {
  const P = G.player;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const last = i === pts.length - 1;
    const mk = m.marker(x, z, last ? 0xffd23f : 0xff2e88, { r: opts.r || 8, h: 6, blipCol: last ? '#ffd23f' : '#ff2e88' });
    let nextMk = null;
    if (!last) { const [nx, nz] = pts[i + 1]; nextMk = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.35, depthWrite: false })); nextMk.scale.set(5, 1, 5); nextMk.position.set(nx, G.world.groundHeight(nx, nz) + 0.08, nz); G.scene.add(nextMk); }
    if (opts.onCp) opts.onCp(i);
    yield* m.until(() => {
      const v = P.inCar ? P.vehicle : P;
      return dist2(v.x, v.z, x, z) < (opts.r || 8) * (opts.r || 8) && (!opts.vehicle || P.vehicle === opts.vehicle);
    });
    m.removeMarker(mk);
    if (nextMk) G.scene.remove(nextMk);
    G.audio.checkpoint();
    if (opts.bonus) m.timerLeft += opts.bonus;
    if (opts.passed) opts.passed(i);
  }
}

// ======================================================================
//  Kontakte & neue Aufträge (Stammbaum)
// ======================================================================
export const CONTACT_INFO = {
  rosa: { name: 'Tante Rosa', role: "Rosa's Diner", poi: 'diner', col: '#ff8fab' },
  dex: { name: 'Dex', role: 'Werkstatt', poi: 'garage', col: '#ffb703' },
  val: { name: 'Val', role: 'Club Velvet', poi: 'club', col: '#b26bff' },
  sami: { name: 'Sami', role: 'Samis 24/7', inside: [1502.6, 598.4], door: 'shop', col: '#ffd23f' },
  ines: { name: 'Inés', role: 'Café Vieja · Altstadt', inside: [1502.2, 747.6], door: 'cafe', col: '#ffb35c' },
  brandt: { name: 'Kapitän Brandt', role: 'Hafenbüro', inside: [1504, 1198], door: 'harbor', col: '#19e6ff', auto: true },
  aurelio: { name: 'Don Aurelio', role: 'Villa · Monte Solera', inside: [1505.5, 1047.4], door: 'villa', col: '#e9d8a6', auto: true },
};
Object.assign(CONTACT_INFO, CONTACTS3);

// Ped läuft eine Route ab (Schleife)
function runRoute(p, pts, speed, k = 0) {
  p.state = 'goto'; p.gotoSpeed = speed;
  p.tx = pts[k % pts.length][0]; p.tz = pts[k % pts.length][1];
  p.onArrive = (q) => runRoute(q, pts, speed, k + 1);
}
// Fluchtwagen mit KI (wie bei Marco)
function fleeCar(m, key, x, z, h, color, fromXZ, toXZ, cruise = 20) {
  const car = m.spawnCar(key, x, z, h, color, { missionTarget: true });
  car.parked = false;
  car.driver = { isPed: true, look: LOOKS.gang(), persistent: true, onEject: (p) => { p.missionTarget = false; p.persistent = true; m.track(p); p.state = 'flee'; p.timer = 30; } };
  const ai = new AIDriver(car, 'flee');
  ai.startEdge(NP(...fromXZ), NP(...toXZ), 6);
  ai.cruise = cruise; ai.keepFlee = true;
  car.ai = ai;
  return car;
}
const HILL_CPS = () => { const R = G.world.hillRoad; const out = []; for (let i = 10; i < R.pts.length - 1; i += 12) out.push(R.pts[i]); out.push(R.pts[R.pts.length - 1]); return out; };

const NEW_MISSIONS = [
  // ---------------------------------------------------------------- Rosa
  {
    id: 'r3', title: 'Familienbande', sub: 'Tante Rosa', contact: 'rosa', req: ['m3'], label: 'R', npc: 'rosa', reward: 1200, unlockContact: 'ines',
    desc: 'Rosas Cousine Inés wird in der Altstadt erpresst.',
    *run(m) {
      const rosa = yield* standAt(m, this);
      yield* m.talk([
        ['Rosa', 'Leo, ich brauche deine Hilfe. Meine Cousine Inés hat ein kleines Café in der Altstadt.'],
        ['Rosa', 'Seit Wochen kommen Schläger vorbei und verlangen Schutzgeld. Sie traut sich nicht zur Polizei.'],
        ['Leo', 'Ich kümmere mich darum.'],
        ['Rosa', 'Aber pass auf dich auf, mijo. Und … nicht zu viel Ärger, ja?'],
      ], rosa, rosa);
      const c = G.world.pois.cafe;
      yield* m.goTo(c.x - 3, c.z, 'Fahr zum <b>Café Vieja</b> in der Altstadt.', { r: 6 });
      G.police.locked = true;
      const thugs = m.gang(c.x - 6, c.z + 3, 3, { gun: false, hp: 70, col: 0x3a0ca3 });
      yield* m.talk([['Schläger', 'Hey! Das hier ist unser Revier. Verschwinde, bevor es weh tut!'], ['Leo', 'Falsche Antwort.']], { x: c.x - 5, z: c.z + 2 }, thugs[0]);
      m.objective('Vertreibe die <b>Schläger</b> vom Café.');
      yield* m.until(() => m.aliveGang(thugs) === 0 || thugs.every((p) => !p.alive || p.health < 25));
      for (const p of thugs) if (p.alive) { p.isGang = false; p.state = 'flee'; p.fleeFrom = G.player; p.timer = 20; if (p.mk) { m.removeMarker(p.mk); p.mk = null; } }
      G.police.locked = false;
      yield* m.wait(1.2);
      const ines = m.npc(c.x - 1.6, c.z + 1.5, LOOKS.ines());
      yield* m.talk([
        ['Inés', '¡Dios mío! Du musst Leo sein – Rosa hat so viel von dir erzählt.'],
        ['Inés', 'Die kommen bestimmt wieder … aber heute hast du ihnen Angst gemacht. Danke!'],
        ['Inés', 'Komm rein, wann immer du willst. Und wenn ich Hilfe brauche, melde ich mich.'],
      ], { x: G.player.x, z: G.player.z }, ines);
    },
  },
  // ---------------------------------------------------------------- Inés
  {
    id: 'i1', title: 'Altstadt-Kurier', sub: 'Inés', contact: 'ines', req: ['r3'], label: 'I', npc: 'ines', reward: 900,
    desc: 'Kaffee und Churros durch die engen Gassen ausliefern.',
    *run(m) {
      const ines = yield* standAt(m, this);
      yield* m.talk([
        ['Inés', 'Leo! Seit du die Schläger verjagt hast, kommen wieder Kunden. Zu viele sogar!'],
        ['Inés', 'Vier Bestellungen müssen raus. Draußen steht mein kleiner Kiwi. Der Kaffee darf nicht kalt werden!'],
      ], ines, ines);
      const c = G.world.pois.cafe;
      const car = m.spawnCar('kiwi', c.x - 9, c.z + 14, Math.PI, 0xffb35c, { missionCar: true });
      m.failIf(() => !car.alive || car.sinking, 'Der Kiwi wurde zerstört.');
      yield* m.goTo(c.x, c.z, 'Geh nach <b>draußen</b>.', { r: 2.5, foot: true });
      m.objective('Steig in Inés\' <b>Kiwi</b>.');
      const mk = m.marker(car.x, car.z, 0x19e6ff, { arrow: true, follow: car, blipCol: '#19e6ff' });
      yield* m.until(() => G.player.vehicle === car);
      m.removeMarker(mk); car.missionCar = false;
      const stops = [[-510, 80, 'Calle del Mar'], [-590, -80, 'zur Uferpromenade'], [-530, 160, 'Plaza San Telmo'], [-480, 210, 'zur Bäckerei Ortega']];
      for (let i = 0; i < stops.length; i++) {
        const [x, z, name] = stops[i];
        m.timerLeft = Math.round(Math.hypot(x - car.x, z - car.z) / 12 + 18);
        yield* m.goTo(x, z, `Bestellung ${i + 1}/4: <b>${name}</b>`, { r: 4.5, vehicle: car, stop: true, color: 0xffb35c });
        const tip = 40 + Math.round(m.timerLeft * 5);
        G.player.addMoney(tip, `Kaffee geliefert ${i + 1}/4 · Trinkgeld +$${tip}`);
        G.audio.checkpoint();
        m.timerLeft = null; G.hud.timer(null);
      }
      car.persistent = false;
    },
  },
  {
    id: 'i2', title: 'Der Kirchenschatz', sub: 'Inés', contact: 'ines', req: ['i1'], label: 'I', npc: 'ines', reward: 2500, rewardCar: ['marina', 0x6d2e46],
    desc: 'Das silberne Kreuz von San Telmo zurückholen.',
    *run(m) {
      const ines = yield* standAt(m, this);
      yield* m.talk([
        ['Inés', 'Leo, etwas Schreckliches ist passiert! Das silberne Kreuz aus der Kirche San Telmo wurde gestohlen.'],
        ['Inés', 'Dieselbe Bande wie vorher. Sie fahren gerade mit einem schwarzen Atlas durch die Altstadt!'],
        ['Leo', 'Wie viel ist das Kreuz wert?'],
        ['Inés', 'Für die Leute hier? Alles. Bring es zurück – Padre Tomás schenkt dir dafür seinen alten Wagen.'],
      ], ines, ines);
      const c = G.world.pois.cafe;
      yield* m.goTo(c.x, c.z, 'Geh nach <b>draußen</b>.', { r: 2.5, foot: true });
      yield* m.getInCar();
      const car = fleeCar(m, 'atlas', -517, -80, 0, 0x111111, [-520, -120], [-520, -40], 19);
      car.health = car.maxHealth = 700;
      car.ai.stopped = true;
      m.objective('Stoppe den <b>schwarzen Atlas</b> mit dem Kreuz.');
      const mk = m.marker(car.x, car.z, 0xff3b5c, { arrow: true, follow: car, blipCol: '#ff3b5c' });
      m.failIf(() => G.player.state !== 'dead' && dist2(car.x, car.z, G.player.x, G.player.z) > 520 * 520, 'Die Diebe sind entkommen.');
      yield* m.until(() => {
        if (car.ai.stopped && dist2(car.x, car.z, G.player.x, G.player.z) < 80 * 80) { car.ai.stopped = false; G.hud.toast('Die Diebe haben dich entdeckt!'); }
        if (car.alive && car.health < car.maxHealth * 0.3 && car.driver && car.driver.isPed) G.peds.ejectDriver(car);
        return !car.alive || car.onFire || car.sinking || (car.driver && !car.driver.isPed);
      });
      m.removeMarker(mk); m.fails = [];
      if (car.driver && car.driver.isPed) G.peds.ejectDriver(car);
      car.ai = null;
      const rx = car.x + 3, rz = car.z;
      const relic = m.marker(rx, rz, 0xe9d8a6, { r: 1.2, label: '✝', blipCol: '#e9d8a6' });
      m.objective('Heb das <b>silberne Kreuz</b> auf.');
      yield* m.until(() => G.player.state === 'foot' && dist2(G.player.x, G.player.z, rx, rz) < 2.2 * 2.2);
      m.removeMarker(relic); G.audio.pickup();
      G.hud.toast('✝ Silbernes Kreuz gesichert');
      yield* m.goTo(c.x, c.z, 'Bring das Kreuz zurück zum <b>Café Vieja</b>.', { r: 3, foot: true });
      const ines2 = m.npc(c.x - 1.6, c.z + 1.4, LOOKS.ines());
      yield* m.talk([
        ['Inés', 'Du hast es wirklich geschafft! Padre Tomás wird weinen vor Freude.'],
        ['Inés', 'Seine alte Marina gehört jetzt dir – sie steht in deiner Garage. Ruf sie über dein Handy.'],
      ], { x: G.player.x, z: G.player.z }, ines2);
    },
  },
  // ---------------------------------------------------------------- Sami
  {
    id: 's1', title: 'Ladendieb', sub: 'Sami', contact: 'sami', needContact: 'sami', req: [], label: 'S', npc: 'sami', reward: 400,
    desc: 'Einen Dieb schnappen, der Samis Kasse geplündert hat.',
    *run(m) {
      const sami = yield* standAt(m, this);
      yield* m.talk([
        ['Sami', 'Leo! Gerade eben – ein Typ hat sich die Tageskasse geschnappt und ist raus!'],
        ['Sami', 'Rote Kapuze, rennt Richtung Osten. Bitte, das ist mein ganzer Umsatz von heute!'],
      ], sami, sami);
      if (G.interior) G.interiors.exit();
      const P = G.player;
      let route;
      const tl = G.world.townLoops && G.world.townLoops[C.districtAt(P.x, P.z)];
      if (tl) route = [...pick(tl), ...pick(tl)];
      else {
        const [bi, bj] = C.blockOf(P.x, P.z), cb = (v, a, b) => clamp(v, a, b);
        const b0 = cb(bi, C.I0, C.NB - 1), b1 = cb(bj, 0, C.NB - 1);
        route = [...G.peds.sidewalkLoop(b0, b1, 0.5), ...G.peds.sidewalkLoop(cb(b0 + 1, C.I0, C.NB - 1), b1, 0.5)];
      }
      const thief = m.npc(P.x + 8, P.z + 3, { ...LOOKS.gang(0xd62828), hat: c(0xd62828) });
      runRoute(thief, route, 5.4);
      thief.health = 60;
      const mk = m.marker(0, 0, 0xff3b5c, { arrow: true, follow: thief, blipCol: '#ff3b5c' });
      m.objective('Schnapp den <b>Dieb</b>!');
      m.failIf(() => thief.alive && dist2(thief.x, thief.z, G.player.x, G.player.z) > 220 * 220, 'Der Dieb ist entkommen.');
      yield* m.until(() => !thief.alive || thief.health < 60 || thief.state === 'knock');
      m.removeMarker(mk); m.fails = [];
      const bx = thief.x, bz = thief.z + 1;
      if (thief.alive) { thief.state = 'flee'; thief.fleeFrom = G.player; thief.timer = 20; }
      const bag = m.marker(bx, bz, 0x7cff6b, { r: 1.1, label: '$', blipCol: '#7cff6b' });
      m.objective('Hol dir die <b>Tageskasse</b>.');
      yield* m.until(() => dist2(G.player.x, G.player.z, bx, bz) < 2.5 * 2.5);
      m.removeMarker(bag); G.audio.cash();
      G.hud.toast('💰 Tageskasse zurückgeholt – Sami schreibt dir: „Du bist der Beste!“');
    },
  },
  {
    id: 's2', title: 'Nachschub', sub: 'Sami', contact: 'sami', needContact: 'sami', req: ['s1'], label: 'S', npc: 'sami', reward: 1200, rewardCar: ['hauler', 0xffd23f],
    desc: 'Ware vom Hafen holen und die neue Filiale beliefern.',
    *run(m) {
      const sami = yield* standAt(m, this);
      yield* m.talk([
        ['Sami', 'Große Neuigkeiten: Ich habe eine Filiale in der Altstadt eröffnet! Aber die Regale sind leer.'],
        ['Sami', 'Hol die Lieferung am Hafen ab und bring sie rüber. Den Transporter darfst du danach behalten – ich hab mir einen neuen gekauft.'],
      ], sami, sami);
      if (G.interior) G.interiors.exit();
      const van = m.spawnCar('hauler', G.player.x + 5, G.player.z + 3, Math.PI / 2, 0xffd23f, { missionCar: true });
      m.failIf(() => !van.alive || van.sinking, 'Der Transporter wurde zerstört.');
      m.objective('Steig in den <b>Transporter</b>.');
      const mk = m.marker(van.x, van.z, 0x19e6ff, { arrow: true, follow: van, blipCol: '#19e6ff' });
      yield* m.until(() => G.player.vehicle === van);
      m.removeMarker(mk); van.missionCar = false;
      yield* m.goTo(-130, 356, 'Fahr zum <b>Lagerhaus am Hafen</b>.', { r: 5, vehicle: van, stop: true });
      G.hud.toast('📦 Die Arbeiter laden die Ware ein …');
      yield* m.wait(2.5);
      const s2 = G.world.pois.shop2;
      m.timerLeft = 75;
      m.failIf(() => van.health < van.maxHealth * 0.3, 'Die Ware ist kaputt – zu viele Unfälle.');
      yield* m.goTo(s2.x + 6, s2.z, 'Liefere die Ware zu <b>Samis 24/7 Altstadt</b>!', { r: 5, vehicle: van, stop: true });
      m.timerLeft = null; G.hud.timer(null);
      van.persistent = false;
      G.hud.toast('Sami: „Die Filiale ist eröffnet! Der Transporter steht jetzt in deiner Garage.“');
    },
  },
  // ---------------------------------------------------------------- Dex
  {
    id: 'd4', title: 'Bergkönig', sub: 'Dex', contact: 'dex', req: ['m6'], label: 'D', npc: 'dex', reward: 3500, rewardCar: ['atlas', 0x3a5a40],
    desc: 'Bergrennen über die Serpentinen nach Monte Solera.',
    *run(m) {
      const dex = yield* standAt(m, this);
      yield* m.talk([
        ['Dex', 'Auf dem Monte Solera wohnt ein gewisser Don Aurelio. Reich, alt, und verrückt nach Autos.'],
        ['Dex', 'Er hat eine Wette laufen: Wer es in Rekordzeit vom Damm bis ins Dorf schafft, bekommt seinen SUV.'],
        ['Dex', 'Ich hab dir einen Zephyra an den Damm gestellt. Zeig ihm, was du kannst.'],
      ], dex, dex);
      yield* m.getInCar();
      yield* m.goTo(40, -396, 'Fahr zum <b>Start am Damm</b> (Norden der Stadt).', { r: 6, car: true, stop: true });
      const P = G.player;
      const car = m.spawnCar('zephyra', 40, -410, Math.PI, 0xffb703, { keep: true });
      if (P.inCar) P.exitVehicle(true);
      P.enterVehicle(car); G.cam.snap();
      m.failIf(() => !car.alive || car.sinking, 'Der Zephyra wurde zerstört.');
      m.freeze = true;
      for (const t of ['3', '2', '1']) { G.hud.countdown(t); G.audio.countdown(false); yield* m.wait(1); }
      G.hud.countdown('LOS!'); G.audio.countdown(true); m.freeze = false;
      m.timerLeft = 58;
      m.objective('Rase die <b>Serpentinen</b> hinauf!');
      yield* checkpoints(m, HILL_CPS(), { r: 9, vehicle: car, bonus: 2 });
      m.timerLeft = null; G.hud.timer(null);
      car.persistent = false;
      G.hud.toast('🏁 Neuer Rekord! Don Aurelio hat zugeschaut …');
    },
  },
  // ---------------------------------------------------------------- Brandt (Hafen)
  {
    id: 'h1', title: 'Schichtwechsel', sub: 'Kapitän Brandt', contact: 'brandt', req: ['m2'], label: 'K', npc: 'brandt', reward: 1500,
    desc: 'Container-Pendelfahrten im Hafen unter Zeitdruck.',
    *run(m) {
      const b = yield* standAt(m, this);
      yield* m.talk([
        ['Brandt', 'Du bist der Fahrer, von dem Dex erzählt? Gut. Die „Solera Star“ legt heute Nacht ab.'],
        ['Brandt', 'Meine Leute streiken, und die Ladung muss an Bord. Drei Fuhren vom Containerhof an die Kaimauer.'],
        ['Leo', 'Und wenn ich zu langsam bin?'],
        ['Brandt', 'Dann legt sie ohne die Ladung ab – und wir beide haben ein Problem.'],
      ], b, b);
      if (G.interior) G.interiors.exit();
      const van = m.spawnCar('coyote', -54, 352, -Math.PI / 2, 0x8d99ae, { missionCar: true });
      m.failIf(() => !van.alive || van.sinking, 'Der Pick-up wurde zerstört.');
      m.objective('Steig in den <b>Hafen-Pick-up</b>.');
      const mk = m.marker(van.x, van.z, 0x19e6ff, { arrow: true, follow: van, blipCol: '#19e6ff' });
      yield* m.until(() => G.player.vehicle === van);
      m.removeMarker(mk); van.missionCar = false;
      const runs = [[[-252, 284], [-300, 364]], [[-196, 320], [-220, 364]], [[-228, 284], [-140, 364]]];
      for (let i = 0; i < runs.length; i++) {
        const [[ax, az], [bx, bz]] = runs[i];
        m.timerLeft = 32;
        yield* m.goTo(ax, az, `Fuhre ${i + 1}/3: Lade am <b>Containerhof</b>.`, { r: 5, vehicle: van, stop: true, color: 0xff9f1c });
        G.hud.toast('🏗️ Container verladen'); G.audio.checkpoint();
        m.timerLeft += 22;
        yield* m.goTo(bx, bz, `Fuhre ${i + 1}/3: Bring sie zur <b>Kaimauer</b>.`, { r: 5, vehicle: van, stop: true });
        G.audio.checkpoint();
        m.timerLeft = null; G.hud.timer(null);
      }
      van.persistent = false;
      G.hud.toast('Brandt: „Die Solera Star ist beladen. Gute Arbeit, Junge.“');
    },
  },
  {
    id: 'h2', title: 'Frachtschiff in Gefahr', sub: 'Kapitän Brandt', contact: 'brandt', req: ['h1', 'm4'], label: 'K', npc: 'brandt', reward: 5000,
    desc: 'Die „Solera Star“ gegen die Tiburones-Gang verteidigen.',
    *run(m) {
      const b = yield* standAt(m, this);
      yield* m.talk([
        ['Brandt', 'Ärger, Leo. Die Tiburones – die Hafengang – wollen die Solera Star sabotieren.'],
        ['Brandt', 'Sie wollen Sprengsätze an der Gangway anbringen. Die Polizei? Gekauft.'],
        ['Brandt', 'Nimm die Kiste da – ein Gewehr und Munition. Halt sie vom Schiff fern, bis die Küstenwache da ist.'],
      ], b, b);
      const P = G.player;
      P.giveWeapon('rifle', 120); P.armor = 100;
      G.hud.toast('🔫 Sturmgewehr +120 Schuss · Schutzweste angelegt');
      if (G.interior) G.interiors.exit();
      const goal = { x: -220, z: 371 };
      yield* m.goTo(goal.x, goal.z - 4, 'Geh zur <b>Gangway der Solera Star</b>.', { r: 6 });
      G.police.locked = true;
      let ship = 100;
      const bar = () => G.hud.racePos(`SCHIFF  ${'█'.repeat(Math.ceil(ship / 10))}${'░'.repeat(10 - Math.ceil(ship / 10))}  ${Math.ceil(ship)}%`);
      m.failIf(() => ship <= 0, 'Die Tiburones haben die Solera Star gesprengt.');
      const waves = [[4, [[-370, 366], [-60, 366]]], [5, [[-360, 300], [-40, 300]]], [6, [[-360, 330], [-40, 330], [-220, 284]]]];
      for (let w = 0; w < waves.length; w++) {
        const [n, spots] = waves[w];
        G.hud.bigToast(`WELLE ${w + 1}/3`, 'Die Tiburones greifen an!');
        G.audio.wantedUp();
        let all = [];
        spots.forEach(([x, z], i) => { all = all.concat(m.gang(x, z, Math.ceil(n / spots.length), { gun: true, hp: 55, goal, aggro: 30, col: 0x0b6e4f, slow: 1.2 })); });
        while (m.aliveGang(all) > 0) {
          for (const p of all) if (p.alive && dist2(p.x, p.z, goal.x, goal.z) < 8 * 8) ship -= G.dt * 3.2;
          m.objective(`Verteidige das Schiff! Tiburones übrig: <b>${m.aliveGang(all)}</b>`);
          bar();
          yield;
        }
        if (w < waves.length - 1) { m.objective('Kurze Pause – die nächste Welle kommt …'); yield* m.wait(5); }
      }
      G.hud.racePos('');
      G.police.locked = false;
      G.hud.toast('🚤 Die Küstenwache ist da. Die Solera Star ist gerettet!');
      yield* m.wait(1.5);
    },
  },
  // ---------------------------------------------------------------- Aurelio (Monte Solera)
  {
    id: 'a1', title: 'Weinlese', sub: 'Don Aurelio', contact: 'aurelio', req: ['d4'], label: 'A', npc: 'aurelio', reward: 2200,
    desc: 'Edlen Wein vom Berg unbeschädigt zu Rosa bringen.',
    *run(m) {
      const a = yield* standAt(m, this);
      yield* m.talk([
        ['Aurelio', 'Der junge Mann, der meinen Bergrekord gebrochen hat. Setz dich. Wein?'],
        ['Leo', 'Ich fahre noch.'],
        ['Aurelio', 'Klug. Dann fahr für mich: Zwanzig Kisten meines besten Jahrgangs gehen an ein Diner in der Stadt.'],
        ['Aurelio', 'Rosa\'s Diner. Und Leo – jede zerbrochene Flasche ist ein Stück meines Herzens.'],
      ], a, a);
      if (G.interior) G.interiors.exit();
      const V = G.world.pois.villa;
      const car = m.spawnCar('coyote', V.x + 8, V.z + 3.4, Math.PI / 2, 0x6d2e46, { missionCar: true });
      m.failIf(() => !car.alive || car.sinking, 'Der Pick-up wurde zerstört.');
      m.failIf(() => car.health < car.maxHealth * 0.45, 'Zu viele Weinflaschen sind zerbrochen.');
      m.objective('Steig in den <b>Pick-up</b> mit den Weinkisten.');
      const mk = m.marker(car.x, car.z, 0x19e6ff, { arrow: true, follow: car, blipCol: '#19e6ff' });
      yield* m.until(() => G.player.vehicle === car);
      m.removeMarker(mk); car.missionCar = false;
      G.hud.hint('Fahr vorsichtig – Unfälle zerbrechen die Flaschen!', 6);
      const d = G.world.pois.diner;
      yield* m.goTo(d.x, d.z + 6, 'Bring den Wein vorsichtig zu <b>Rosa\'s Diner</b>.', { r: 5, vehicle: car, stop: true });
      const pct = car.health / car.maxHealth;
      const bonus = Math.round(pct * 1500);
      G.player.addMoney(bonus, `Unversehrte Flaschen · Bonus +$${bonus}`);
      car.persistent = false;
      const rosa = m.npc(d.x + 2, d.z + 4, LOOKS.rosa());
      yield* m.talk([['Rosa', 'Wein von Don Aurelio? Leo … mit wem gibst du dich da oben ab?'], ['Leo', 'Mit einem Weinbauern, Tante Rosa. Nur einem Weinbauern.']], { x: G.player.x, z: G.player.z }, rosa);
    },
  },
  {
    id: 'a2', title: 'Der gestohlene Vortex', sub: 'Don Aurelio', contact: 'aurelio', req: ['a1'], label: 'A', npc: 'aurelio', reward: 4000, rewardCar: ['vortex', 0x111111],
    desc: 'Aurelios Supersportwagen aus dem Containerhof zurückholen.',
    *run(m) {
      const a = yield* standAt(m, this);
      yield* m.talk([
        ['Aurelio', 'Jemand war so dumm, mir meinen Vortex zu stehlen. Aus meiner eigenen Einfahrt.'],
        ['Aurelio', 'Meine Leute sagen, er steht im Containerhof am Hafen. Bewacht von der Tiburones-Gang.'],
        ['Aurelio', 'Hol ihn zurück. Wenn du das schaffst, behalte ihn. Ich kaufe mir einen neuen.'],
      ], a, a);
      if (G.interior) G.interiors.exit();
      yield* m.getInCar();
      const cx = -240, cz = 356;
      yield* m.goTo(cx + 40, cz, 'Fahr zum <b>Containerhof</b> im Hafen.', { r: 10, car: true });
      G.police.locked = true;
      const car = m.spawnCar('vortex', cx, cz, Math.PI / 2, 0x111111, { missionCar: true });
      m.failIf(() => !car.alive || car.sinking, 'Der Vortex wurde zerstört.');
      const guards = m.gang(cx - 6, cz - 4, 5, { gun: true, hp: 60, aggro: 40, col: 0x0b6e4f });
      m.objective('Schalte die <b>Tiburones</b> aus.');
      yield* m.until(() => m.aliveGang(guards) === 0 || G.player.vehicle === car);
      G.police.locked = false;
      if (G.player.vehicle !== car) {
        m.objective('Steig in den <b>Vortex</b>.');
        const mk = m.marker(car.x, car.z, 0x19e6ff, { arrow: true, follow: car, blipCol: '#19e6ff' });
        yield* m.until(() => G.player.vehicle === car);
        m.removeMarker(mk);
      }
      car.missionCar = false;
      const V = G.world.pois.villa;
      yield* m.goTo(V.x + 6, V.z + 3.4, 'Bring den Vortex zurück zur <b>Villa Aurelio</b>.', { r: 6, vehicle: car, stop: true });
      car.persistent = false;
      G.player.exitVehicle(true);
      const a2 = m.npc(V.x + 2, V.z + 1, LOOKS.aurelio());
      yield* m.talk([
        ['Aurelio', 'Kein Kratzer? … Fast kein Kratzer. Du hast Stil, Leo.'],
        ['Aurelio', 'Behalte ihn. Er steht ab jetzt in deiner Garage. Und wenn du je Freunde auf dem Berg brauchst …'],
      ], { x: G.player.x, z: G.player.z }, a2);
    },
  },
  // ---------------------------------------------------------------- Finale
  {
    id: 'f1', title: 'Das Anwesen', sub: 'Val', contact: 'val', req: ['m7', 'a2'], label: 'V', npc: 'val', reward: 100000, rewardCar: ['tank', 0x4b5320],
    desc: 'Finale: Das Anwesen der Familie Valcourt auf dem Gipfel stürmen.',
    *run(m) {
      const val = yield* standAt(m, this);
      yield* m.talk([
        ['Val', 'Leo. Ich weiß jetzt, wer die Tiburones bezahlt hat. Und wer die Polizei in der Tasche hat.'],
        ['Val', 'Die Familie Valcourt. Ihr Anwesen liegt ganz oben auf dem Gipfel hinter Monte Solera.'],
        ['Val', 'Silvio Valcourt hält sich für unantastbar. Bewaffnete Wachen, hohe Mauern, eigener Hubschrauberlandeplatz.'],
        ['Leo', 'Dann wird es Zeit, dass jemand anklopft.'],
        ['Val', 'Bring es zu Ende. Danach gehört Port Solera uns.'],
      ], val, val);
      const P = G.player;
      P.giveWeapon('rifle', 150); P.giveWeapon('shotgun', 24); P.armor = 100;
      G.hud.toast('🔫 Val gibt dir Sturmgewehr, Schrotflinte und eine Schutzweste.');
      yield* m.getInCar();
      const gate = G.world.pois.mansionGate, home = G.world.pois.mansion;
      const cx = home.x, cz = home.z - 30;
      yield* m.goTo(gate.x, gate.z + 6, 'Fahr hinauf zum <b>Anwesen Valcourt</b> auf dem Gipfel.', { r: 8 });
      G.police.locked = true;
      m.failIf(() => G.player.state === 'dead', 'Silvio Valcourt hat gewonnen.');
      const suit = 0x16161a;
      // Torwachen
      let all = m.gang(gate.x, gate.z - 8, 4, { gun: true, hp: 80, aggro: 42, col: suit });
      G.hud.bigToast('DAS ANWESEN', 'Kämpf dich zu Silvio Valcourt durch!');
      G.audio.wantedUp();
      m.objective('Durchbrich das <b>Tor</b>!');
      yield* m.until(() => m.aliveGang(all) <= 1);
      // Hof & Haus
      all = all.concat(m.gang(cx - 14, cz + 18, 4, { gun: true, hp: 85, aggro: 45, col: suit }), m.gang(cx + 16, cz + 16, 4, { gun: true, hp: 85, aggro: 45, col: suit }));
      G.hud.toast('📻 Wachen: „Eindringling am Tor! Alle zum Vorhof!“');
      m.objective('Säubere den <b>Vorhof</b>.');
      yield* m.until(() => m.aliveGang(all) <= 2);
      // Boss auf der Poolterrasse
      const boss = m.gang(cx, cz - 32, 1, { gun: true, hp: 260, aggro: 50, col: 0xf4f1de, mark: false })[0];
      boss.look.hat = null; boss.slow = 0.6; boss.missionTarget = true;
      const bodyguards = m.gang(cx, cz - 30, 4, { gun: true, hp: 95, aggro: 50, col: suit });
      all = all.concat(bodyguards);
      const bm = m.marker(0, 0, 0xff3b5c, { follow: boss, arrow: true, blipCol: '#ff3b5c' });
      G.hud.subtitle('Silvio Valcourt', 'Du bist also dieser Leo. Weißt du, wem diese Stadt gehört?', '#f4f1de');
      yield* m.wait(3);
      G.hud.subtitle('Leo', 'Ab heute? Nicht mehr dir.', '#7cff6b');
      yield* m.wait(2);
      G.hud.subtitle();
      m.objective('Schalte <b>Silvio Valcourt</b> auf der Poolterrasse aus!');
      yield* m.until(() => !boss.alive);
      m.removeMarker(bm);
      for (const p of all) if (p.alive) { p.isGang = false; p.state = 'flee'; p.fleeFrom = P; p.timer = 30; if (p.mk) { m.removeMarker(p.mk); p.mk = null; } }
      G.police.locked = false;
      yield* m.wait(1.5);
      const val2 = m.npc(P.x + 2.5, P.z + 1.5, LOOKS.val());
      yield* m.talk([
        ['Val', 'Es ist vorbei. Die Valcourts sind Geschichte.'],
        ['Val', 'Und schau mal in die Garage. Silvio hatte ein … ungewöhnliches Spielzeug. Es gehört jetzt dir.'],
        ['Leo', 'Ein Panzer? Natürlich hatte er einen Panzer.'],
        ['Val', 'Willkommen an der Spitze, Leo.'],
      ], { x: P.x, z: P.z }, val2);
    },
    after() { setTimeout(() => G.hud.bigToast('PORT SOLERA GEHÖRT DIR', 'Finale geschafft! Der Panzer steht in deiner Garage.'), 4500); },
  },
];

// ======================================================================
//  Missionen
// ======================================================================
const MISSIONS = [
  {
    id: 'm1', title: 'Neuanfang', sub: 'Tante Rosa', contact: 'rosa', req: [], label: 'R', npc: 'rosa', reward: 500, desc: 'Tante Rosa begrüßen und Dex kennenlernen.',
    *run(m) {
      const rosa = yield* standAt(m, this);
      yield* m.talk([
        ['Rosa', 'Leo! Drei Jahre weg und nicht ein einziger Anruf. Komm her, lass dich ansehen.'],
        ['Leo', 'Hallo, Tante Rosa. Ich bin zurück – diesmal für immer.'],
        ['Rosa', 'Port Solera hat sich verändert. Wer hier etwas werden will, braucht die richtigen Freunde.'],
        ['Rosa', 'Geh zu Dex. Er hat eine Werkstatt unten im Süden, beim Hafen. Er sucht einen guten Fahrer.'],
        ['Rosa', 'Und Leo … zu Fuß kommst du hier nicht weit. Besorg dir einen Wagen.'],
      ], rosa, rosa);
      rosa.state = 'goto'; rosa.tx = rosa.x; rosa.tz = rosa.z - 12; rosa.onArrive = (p) => G.peds.remove(p);
      yield* m.getInCar();
      const g = G.world.pois.garage;
      yield* m.goTo(g.x, g.z + 6, 'Fahr zu <b>Dex\' Werkstatt</b>.', { r: 5, car: true, stop: true });
      const dex = m.npc(g.x + 3, g.z - 1, LOOKS.dex());
      const P = G.player;
      yield* m.talk([
        ['Dex', 'Du musst Leo sein. Rosa hat mir schon alles über dich erzählt.'],
        ['Dex', 'Netter Wagen. Ich frage lieber nicht, woher du ihn hast.'],
        ['Leo', 'Geliehen. Sozusagen.'],
        ['Dex', 'Ha! Du gefällst mir. Komm wieder, wenn du richtig Geld verdienen willst.'],
      ], { x: P.vehicle ? P.vehicle.x : P.x, z: P.vehicle ? P.vehicle.z : P.z }, dex);
    },
  },
  {
    id: 'm2', title: 'Probefahrt', sub: 'Dex', contact: 'dex', req: ['m1'], label: 'D', npc: 'dex', reward: 1000, rewardCar: ['zephyra', 0xe63946], desc: 'Zeitfahren im Zephyra GT – der Wagen gehört danach dir.',
    *run(m) {
      const dex = yield* standAt(m, this);
      yield* m.talk([
        ['Dex', 'Bereit? Ich will sehen, was du hinterm Steuer drauf hast.'],
        ['Dex', 'Da vorne steht ein Zephyra GT. Fahr meine Runde durch die Stadt – alle Checkpoints, und zwar flott.'],
        ['Dex', 'Schaffst du es in der Zeit, gehört der Wagen dir.'],
      ], dex, dex);
      const car = m.spawnCar('zephyra', 64, 274, -Math.PI / 2, 0xe63946, { missionCar: true, keep: true });
      m.failIf(() => !car.alive || car.sinking, 'Der Zephyra wurde zerstört.');
      m.objective('Steig in den <b>Zephyra GT</b>.');
      yield* m.until(() => G.player.vehicle === car);
      m.objective('Fahr durch alle <b>Checkpoints</b>!');
      car.missionCar = false;
      const pts = [[40, 280], [40, 200], [40, 120], [-40, 120], [-40, 40], [-40, -40], [40, -40], [120, -40], [120, 40], [120, 120], [200, 120], [200, 200], [200, 280], [100, 280]];
      m.timerLeft = 95;
      yield* checkpoints(m, pts, { r: 9, vehicle: car });
      car.persistent = false;
    },
  },
  {
    id: 'm3', title: 'Lieferservice', sub: 'Tante Rosa', contact: 'rosa', req: ['m1'], label: 'R', npc: 'rosa', reward: 800, desc: 'Drei heiße Bestellungen mit Rosas Lieferwagen.',
    *run(m) {
      const rosa = yield* standAt(m, this);
      yield* m.talk([
        ['Rosa', 'Leo, gut dass du da bist! Meine Fahrerin hat sich krankgemeldet.'],
        ['Rosa', 'Drei Bestellungen müssen raus, solange das Essen noch heiß ist. Der Lieferwagen steht vor der Tür.'],
        ['Rosa', 'Und fahr vorsichtig – das ist mein einziger Wagen!'],
      ], rosa, rosa);
      const van = m.spawnCar('hauler', -150, -45, -Math.PI / 2, 0xff8fab, { missionCar: true });
      m.failIf(() => !van.alive || van.sinking, 'Rosas Lieferwagen wurde zerstört.');
      m.objective('Steig in Rosas <b>Lieferwagen</b>.');
      yield* m.until(() => G.player.vehicle === van);
      van.missionCar = false;
      const stops = [[-160, -290, 'Coral Heights'], [392, 78, 'die Strandbar'], [-320, 110, 'Westside']];
      for (let i = 0; i < stops.length; i++) {
        const [x, z, name] = stops[i];
        const d = Math.hypot(x - van.x, z - van.z);
        m.timerLeft = Math.round(d / 13 + 22);
        m.failIf(() => G.player.vehicle !== van && dist2(G.player.x, G.player.z, van.x, van.z) > 80 * 80, 'Du hast den Lieferwagen zurückgelassen.');
        yield* m.goTo(x, z, `Liefere Bestellung ${i + 1}/3 nach <b>${name}</b>.`, { r: 4.5, vehicle: van, stop: true });
        m.fails.pop();
        const tip = 60 + Math.round(m.timerLeft * 4);
        G.player.addMoney(tip, `Lieferung ${i + 1}/3 · Trinkgeld +$${tip}`);
        G.audio.checkpoint();
        m.timerLeft = null; G.hud.timer(null);
      }
      van.persistent = false;
    },
  },
  {
    id: 'm4', title: 'Kleine Gefälligkeit', sub: 'Val', contact: 'val', req: ['m2'], label: 'V', npc: 'val', reward: 1500, desc: 'Marcos Brutus zu Schrott fahren.',
    *run(m) {
      const val = yield* standAt(m, this);
      yield* m.talk([
        ['Val', 'Du bist also Dex\' neuer Fahrer. Er sagt, du bist schnell.'],
        ['Val', 'Ein gewisser Marco schuldet mir eine Menge Geld. Er glaubt, er kann mich einfach ignorieren.'],
        ['Val', 'Er hängt am Seaside Boulevard herum, auf Höhe des Piers. Gelber Brutus. Mach seinen Wagen zu Schrott.'],
        ['Leo', 'Und Marco selbst?'],
        ['Val', 'Der rennt dann ganz von allein. Das ist die Botschaft.'],
      ], val, val);
      const car = m.spawnCar('brutus', 366, 75, Math.PI, 0xffd23f, { missionTarget: true });
      car.health = car.maxHealth = 650;
      car.parked = false;
      const look = LOOKS.marco();
      car.driver = { isPed: true, look, persistent: true, onEject: (p) => { p.missionTarget = false; p.persistent = true; m.track(p); p.state = 'flee'; p.timer = 30; } };
      const ai = new AIDriver(car, 'flee');
      const n = G.world.nearestNode(366, 40);
      ai.startEdge(NP(360, 120), NP(360, 40), 6);
      ai.stopped = true; ai.cruise = 21; ai.keepFlee = true;
      car.ai = ai;
      m.objective('Zerstöre <b>Marcos Brutus</b> am Seaside Boulevard.');
      const mk = m.marker(car.x, car.z, 0xff3b5c, { arrow: true, follow: car, blipCol: '#ff3b5c' });
      m.failIf(() => G.player.state !== 'dead' && dist2(car.x, car.z, G.player.x, G.player.z) > 480 * 480, 'Marco ist entkommen.');
      yield* m.until(() => {
        if (ai.stopped && dist2(car.x, car.z, G.player.x, G.player.z) < 70 * 70) { ai.stopped = false; G.hud.toast('Marco hat dich gesehen – er haut ab!'); G.audio.horn(car.x, car.z, 0.6); }
        if (car.alive && car.health < car.maxHealth * 0.25 && car.driver && car.driver.isPed) { car.driver.persistent = true; G.peds.ejectDriver(car); }
        return !car.alive || car.onFire || car.sinking;
      });
      m.removeMarker(mk);
      if (car.driver && car.driver.isPed) G.peds.ejectDriver(car);
      yield* m.wait(1.5);
      G.hud.toast('Botschaft angekommen.');
      yield* m.wait(1);
    },
  },
  {
    id: 'm5', title: 'Heiße Ware', sub: 'Dex', contact: 'dex', req: ['m2'], label: 'D', npc: 'dex', reward: 0, desc: 'Einen Vortex aus Coral Heights „besorgen“.',
    *run(m) {
      const dex = yield* standAt(m, this);
      yield* m.talk([
        ['Dex', 'Ich habe einen Auftrag für dich. Ein Sammler will einen Vortex – Supersportwagen, wunderschön.'],
        ['Dex', 'Einer steht in Coral Heights vor einer Villa. Der Besitzer ist im Urlaub.'],
        ['Dex', 'Hol ihn, schüttle die Polizei ab und bring ihn her. Je weniger Kratzer, desto mehr Geld.'],
      ], dex, dex);
      const car = m.spawnCar('vortex', 160, -210, Math.PI / 2, 0xff7b00, { missionCar: true });
      m.failIf(() => !car.alive || car.sinking, 'Der Vortex wurde zerstört.');
      const mk = m.marker(car.x, car.z, 0x19e6ff, { arrow: true, follow: car, blipCol: '#19e6ff' });
      m.objective('Hol den <b>Vortex</b> in Coral Heights.');
      yield* m.until(() => G.player.vehicle === car);
      m.removeMarker(mk);
      car.missionCar = false;
      G.hud.toast('Die Alarmanlage geht los!');
      G.audio.horn(car.x, car.z, 1.5, true);
      G.police.setLevel(2);
      m.objective('Hänge die <b>Polizei</b> ab.');
      yield* m.until(() => G.police.level === 0);
      const g = G.world.pois.garage;
      yield* m.goTo(g.x, g.z + 6, 'Bring den Vortex zu <b>Dex\' Werkstatt</b>.', { r: 5, vehicle: car, stop: true });
      const pct = car.health / car.maxHealth;
      const pay = 1500 + Math.round(pct * 2500);
      this.reward = pay;
      G.player.exitVehicle(true);
      car.persistent = true;
      yield* m.talk([['Dex', pct > 0.8 ? 'Wie aus dem Showroom! Der Sammler wird begeistert sein.' : pct > 0.4 ? 'Ein paar Dellen … aber er fährt noch. Gute Arbeit.' : 'Das ist … mehr Schrott als Auto. Na ja, Teile bringen auch Geld.']], { x: g.x, z: g.z }, null);
    },
  },
  {
    id: 'm6', title: 'Straßenrennen', sub: 'Dex', contact: 'dex', req: ['m5'], label: 'D', npc: 'dex', reward: 3000, rewardCar: ['brutus', 0x111111], desc: 'Rennen quer durch Port Solera – nur der Sieg zählt.',
    *run(m) {
      const dex = yield* standAt(m, this);
      yield* m.talk([
        ['Dex', 'Heute steigt ein Rennen. Drei Fahrer, eine Runde durch ganz Port Solera.'],
        ['Dex', 'Ich habe dir einen Zephyra an die Startlinie gestellt. Nur der Sieg zählt.'],
        ['Dex', 'Und Leo – Ampeln sind heute nur Dekoration.'],
      ], dex, dex);
      m.clearArea(80, 276, 40);
      const P = G.player;
      const car = m.spawnCar('zephyra', 66, 278, -Math.PI / 2, 0x00b4d8, { keep: true });
      if (P.inCar) P.exitVehicle(true);
      P.enterVehicle(car);
      G.cam.snap();
      m.failIf(() => !car.alive || car.sinking, 'Dein Wagen wurde zerstört.');
      const route = [[40, 280], [40, 200], [40, 120], [-40, 120], [-120, 120], [-120, 40], [-120, -40], [-120, -120], [-40, -120], [40, -120], [120, -120], [200, -120], [280, -120], [360, -120], [360, -40], [360, 40], [360, 120], [360, 200], [280, 200], [200, 200], [200, 280], [120, 280]];
      const ids = route.map(([x, z]) => NP(x, z));
      const cps = [[40, 200], [40, 120], [-120, 120], [-120, -120], [120, -120], [360, -120], [360, 120], [360, 200], [200, 200], [200, 280], [90, 280]];
      const grid = [[66, 274, 'vortex', 0xb5179e], [76, 278, 'brutus', 0x111111], [76, 274, 'zephyra', 0xffb703]];
      const racers = [];
      for (const [x, z, key, col] of grid) {
        const v = m.spawnCar(key, x, z, -Math.PI / 2, col, { racer: true });
        v.parked = false;
        v.driver = { isPed: true, look: randomLook(), persistent: true };
        const ai = new AIDriver(v, 'race');
        ai.startEdge(NP(120, 280), NP(40, 280), z < 276 ? 6 : 2);
        ai.raceRoute = ids.slice(1); ai.raceIdx = 0; ai.cruise = 30; ai.stopped = true;
        v.ai = ai; v.cp = 0; v.baseCruise = key === 'vortex' ? 31 : key === 'zephyra' ? 29.5 : 28;
        racers.push(v);
      }
      m.freeze = true;
      for (const t of ['3', '2', '1']) { G.hud.countdown(t); G.audio.countdown(false); yield* m.wait(1); }
      G.hud.countdown('LOS!'); G.audio.countdown(true);
      m.freeze = false;
      for (const r of racers) r.ai.stopped = false;
      let pcp = 0, finishedBefore = 0;
      const rank = () => {
        const prog = (cp, x, z) => cp * 10000 - (cps[cp] ? Math.hypot(cps[cp][0] - x, cps[cp][1] - z) : 0);
        const me = prog(pcp, car.x, car.z);
        let r = 1 + finishedBefore;
        for (const v of racers) if (v.cp < cps.length && prog(v.cp, v.x, v.z) > me) r++;
        return r;
      };
      const updRacers = () => {
        for (const v of racers) {
          if (v.cp >= cps.length || !v.alive) continue;
          const [x, z] = cps[v.cp];
          if (dist2(v.x, v.z, x, z) < 16 * 16) { v.cp++; if (v.cp >= cps.length) { finishedBefore++; v.ai.stopped = true; } }
          const diff = (pcp - v.cp);
          v.ai.cruise = clamp(v.baseCruise + diff * 2.5, 20, 40);
        }
      };
      const gen = checkpoints(m, cps, { r: 10, vehicle: car, passed: (i) => { pcp = i + 1; } });
      let r = gen.next();
      while (!r.done) { updRacers(); G.hud.racePos(`PLATZ ${rank()}/4`); yield; r = gen.next(); }
      const final = 1 + finishedBefore;
      G.hud.racePos('');
      if (final !== 1) { m.fail(`Du bist nur auf Platz ${final} gelandet.`); yield; return; }
      G.hud.toast('Erster Platz!');
    },
  },
  {
    id: 'm7', title: 'Der große Coup', sub: 'Val', contact: 'val', req: ['m4', 'm6', 'h2'], label: 'V', npc: 'val', reward: 25000, desc: 'Der Überfall auf die Solera Bank.',
    *run(m) {
      const val = yield* standAt(m, this);
      yield* m.talk([
        ['Val', 'Leo. Du hast dich bewiesen. Jetzt kommt das große Ding.'],
        ['Val', 'Die Solera Bank in Downtown. Meine Crew räumt den Tresor, du fährst.'],
        ['Val', 'Sobald der Alarm losgeht, wird es ungemütlich. Hänge die Polizei ab und fahr zu deinem Unterschlupf.'],
        ['Leo', 'Und dann?'],
        ['Val', 'Dann teilen wir. Großzügig.'],
      ], val, val);
      val.state = 'goto'; val.tx = val.x; val.tz = val.z - 10; val.onArrive = (p) => G.peds.remove(p);
      yield* m.getInCar();
      const b = G.world.pois.bank;
      yield* m.goTo(b.x, b.z + 4, 'Fahr zur <b>Solera Bank</b> in Downtown.', { r: 5, car: true, stop: true });
      const P = G.player, v = P.vehicle;
      const crew = [];
      for (let k = 0; k < 2; k++) {
        const p = m.npc(v.x + Math.cos(v.h) * 2, v.z - Math.sin(v.h) * 2 + k, LOOKS.crew());
        p.state = 'goto'; p.gotoSpeed = 5; p.tx = b.x - 1 + k * 2; p.tz = b.z - 6; p.onArrive = (q) => { q.state = 'mission'; G.peds.remove(q); };
        crew.push(p);
      }
      m.timerLeft = 25;
      m.objective('Warte auf die Crew. <b>Bleib bei der Bank!</b>');
      m.failIf(() => dist2(P.x, P.z, b.x, b.z + 4) > 40 * 40, 'Du hast die Crew im Stich gelassen.');
      G.police.locked = true;
      yield* m.until(() => m.timerLeft <= 0.5);
      m.timerLeft = null; G.hud.timer(null);
      m.fails = [];
      G.hud.toast('Der Alarm geht los!');
      for (let k = 0; k < 2; k++) {
        const p = m.npc(b.x - 1 + k * 2, b.z - 6, LOOKS.crew());
        const tv = P.vehicle || v;
        p.state = 'goto'; p.gotoSpeed = 6.5; p.anim.gun = true; p.tx = tv.x; p.tz = tv.z; p.onArrive = (q) => G.peds.remove(q);
      }
      yield* m.wait(2.2);
      G.police.locked = false;
      G.police.setLevel(4);
      m.objective('Hänge die <b>Polizei</b> ab!');
      yield* m.until(() => G.police.level === 0);
      const s = G.world.pois.safehouse;
      yield* m.goTo(s.x, s.z, 'Fahr zu deinem <b>Unterschlupf</b>.', { r: 4, car: false });
      const val2 = m.npc(s.x + 2, s.z - 1.5, LOOKS.val());
      yield* m.talk([
        ['Val', 'Saubere Arbeit, Leo. Die Stadt redet von nichts anderem.'],
        ['Leo', 'Und jetzt?'],
        ['Val', 'Jetzt gehört Port Solera uns. Das war erst der Anfang.'],
      ], { x: P.x, z: P.z }, val2);
    },
    after(m) {
      if (m.done.size >= MISSIONS.length) setTimeout(() => G.hud.bigToast('ALLE AUFTRÄGE ERLEDIGT', 'Port Solera gehört dir!'), 9000);
    },
  },
  ...NEW_MISSIONS,
  ...MISSIONS3,
];

// Taxi-Nebenjob
const TAXI = {
  id: 'taxi', title: 'Taxi', side: true, reward: 0,
  *run(m) {
    const P = G.player;
    const taxi = P.vehicle;
    G.hud.hint('Taxi-Job: Hol Fahrgäste ab und bring sie ans Ziel.', 5);
    m.failIf(() => P.vehicle !== taxi, 'Taxi-Job beendet.');
    m.failIf(() => G.police.level > 0, 'Taxi-Job abgebrochen – Polizei!');
    while (true) {
      // Fahrgast suchen
      let px, pz;
      for (let k = 0; k < 20; k++) {
        const [bi, bj] = C.blockOf(taxi.x, taxi.z);
        const nb = clamp(bi + Math.floor(rand(-2, 3)), 0, 8), nj = clamp(bj + Math.floor(rand(-2, 3)), 0, 8);
        const loop = G.peds.sidewalkLoop(nb, nj, 0.5);
        const [x, z] = loop[Math.floor(rand(0, 4))];
        const d = Math.hypot(x - taxi.x, z - taxi.z);
        if (d > 60 && d < 220) { px = x; pz = z; break; }
      }
      if (px == null) { yield* m.wait(1); continue; }
      const ped = m.npc(px, pz, randomLook());
      ped.anim.handsUp = false;
      const mk = m.marker(px, pz, 0x7cff6b, { r: 3, blipCol: '#7cff6b' });
      m.objective('Hol den <b>Fahrgast</b> ab.');
      yield* m.until(() => { ped.anim.handsUp = Math.sin(G.time * 3) > 0; return dist2(taxi.x, taxi.z, px, pz) < 9 * 9 && taxi.speed < 2; });
      m.removeMarker(mk);
      ped.state = 'goto'; ped.gotoSpeed = 3; ped.anim.handsUp = false;
      ped.onArrive = (p) => G.peds.remove(p);
      yield* m.until(() => { ped.tx = taxi.x + Math.cos(taxi.h) * 1.5; ped.tz = taxi.z - Math.sin(taxi.h) * 1.5; return ped.removed || dist2(ped.x, ped.z, taxi.x, taxi.z) < 2.2 * 2.2; });
      if (!ped.removed) G.peds.remove(ped);
      G.audio.door();
      // Ziel
      let dx, dz, dist = 0;
      for (let k = 0; k < 30; k++) {
        const loop = G.peds.sidewalkLoop(Math.floor(rand(0, 9)), Math.floor(rand(0, 9)), 0.5);
        const [x, z] = loop[Math.floor(rand(0, 4))];
        dist = Math.hypot(x - taxi.x, z - taxi.z);
        if (dist > 200 && dist < 650) { dx = x; dz = z; break; }
      }
      if (dx == null) continue;
      m.timerLeft = Math.round(dist / 11 + 20);
      yield* m.goTo(dx, dz, 'Bring den Fahrgast ans <b>Ziel</b>.', { r: 6, vehicle: taxi, stop: true, color: 0x7cff6b });
      const fare = Math.round(40 + dist * 0.35 + m.timerLeft * 3);
      m.timerLeft = null; G.hud.timer(null);
      m.taxiFares++;
      P.addMoney(fare, `Fahrpreis +$${fare}  (Fahrt Nr. ${m.taxiFares})`);
      const out = G.peds.spawnAt(taxi.x + Math.cos(taxi.h) * 2, taxi.z - Math.sin(taxi.h) * 2, randomLook(), 'walk');
      out.path = null;
      yield* m.wait(1);
    }
  },
};

// Läden
export function shopItems() {
  const P = G.player;
  const items = [];
  for (const k of ['pistol', 'smg', 'shotgun', 'rifle']) {
    const w = WEAPONS[k];
    const owned = P.ammo[k] > 0;
    items.push({ id: k, name: owned ? `${w.name}-Munition (+${w.ammoPack})` : `${w.name} (+${w.ammoPack} Schuss)`, price: owned ? w.ammoPrice : w.price, buy: () => P.giveWeapon(k, w.ammoPack) });
  }
  items.push({ id: 'armor', name: 'Schutzweste', price: 300, buy: () => { P.armor = 100; } });
  items.push({ id: 'health', name: 'Erste-Hilfe-Set', price: 120, buy: () => { P.health = 100; } });
  return items;
}
export { OUTFITS };
