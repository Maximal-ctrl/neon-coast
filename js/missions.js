// Missionen, Marker, Pickups, Sammelobjekte, Läden
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import * as TX from './textures.js';
import { AIDriver } from './traffic.js';
import { WEAPONS } from './combat.js';
import { randomLook, OUTFITS } from './models.js';
import { clamp, rand, dist2, pick, chance } from './utils.js';

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
  }

  init() {
    pickupMeshes();
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
    this.updateGiver();
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

  // ------------------------------------------------------------ Story
  get story() { return STORY; }
  updateGiver() {
    if (this.giverMarker) { this.giverMarker.remove(); this.giverMarker = null; }
    const def = STORY[this.progress];
    if (!def) return;
    const poi = G.world.pois[def.giver];
    this.giverMarker = new Marker(poi.x, poi.z, 0xffd23f, { label: def.label, r: 1.5 });
    this.giverDef = def;
  }

  mapBlips(full = false) {
    const out = [];
    const poi = G.world.pois;
    if (!this.active && this.giverMarker) out.push({ x: this.giverMarker.x, z: this.giverMarker.z, col: '#ffd23f', label: this.giverDef.label, edge: true, r: 0.05 });
    out.push({ x: poi.safehouse.x, z: poi.safehouse.z, col: '#7cff6b', label: 'H', r: 0.04 });
    out.push({ x: poi.gunshop.x, z: poi.gunshop.z, col: '#ff7b39', label: 'W', r: 0.04 });
    out.push({ x: 234, z: 106.5, col: '#ff2e88', label: 'C', r: 0.04, name: 'Club Velvet' });
    if (poi.dealer) out.push({ x: poi.dealer.x, z: poi.dealer.z, col: '#ff4fd8', label: 'A', r: 0.04, name: 'Solera Motors' });
    if (poi.shop) out.push({ x: poi.shop.x, z: poi.shop.z, col: '#ffd23f', label: '24', r: 0.04, name: 'Samis 24/7' });
    out.push({ x: 10, z: 26.8, col: '#19e6ff', label: 'B', r: 0.04, name: 'Solera Bank' });
    if (full) {
      out.push({ x: poi.hospital.x, z: poi.hospital.z, col: '#ff4d6d', label: '+' });
      out.push({ x: poi.police.x, z: poi.police.z, col: '#4d8bff', label: 'P' });
      out.push({ x: poi.pier.x, z: poi.pier.z, col: '#ff9f1c', label: '★' });
    }
    for (const m of this.markers) if (m.blip) out.push({ x: m.x, z: m.z, col: m.blipCol || '#ffd60a', edge: true, r: 0.045 });
    return out;
  }

  update(dt) {
    this.updatePickups(dt);
    for (const s of this.serviceMarkers) s.m.update(dt);
    if (this.giverMarker) { this.giverMarker.update(dt); this.giverMarker.group.visible = !this.active; }
    for (const m of this.markers) m.update(dt);
    const P = G.player;
    // GPS
    this.gpsTarget = null;
    const obj = this.markers.find((m) => m.blip);
    if (obj) this.gpsTarget = { x: obj.x, z: obj.z };
    else if (!this.active && this.giverMarker && !this.waypoint) this.gpsTarget = { x: this.giverMarker.x, z: this.giverMarker.z };
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
    if (P.state === 'foot' && this.giverMarker && G.police.level === 0 && dist2(P.x, P.z, this.giverMarker.x, this.giverMarker.z) < 2.2 * 2.2) {
      this.start(this.giverDef);
      return;
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
      if (STORY[this.progress] === def) this.progress++;
      this.updateGiver();
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
    const from = new THREE.Vector3(fx + Math.sin(ang) * 6, fy + 2.4, fz + Math.cos(ang) * 6);
    const tx = other ? (fx + other.x) / 2 : fx, tz = other ? (fz + other.z) / 2 : fz;
    this.cineOn(from, new THREE.Vector3(tx, fy + 1.5, tz));
    const prevState = P.state;
    if (P.state === 'foot') { P.state = 'cutscene'; P.vx = P.vz = 0; if (other) P.yaw = Math.atan2(other.x - P.x, other.z - P.z); }
    if (other) other.yaw = Math.atan2(P.x - other.x, P.z - other.z);
    for (let [who, text] of lines) {
      const col = { Leo: '#7cff6b', Rosa: '#ff8fab', Dex: '#ffd23f', Val: '#b26bff', Marco: '#ff9f1c', Sami: '#ffd23f' }[who] || '#19e6ff';
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
};
function c(h) { return new THREE.Color(h); }
function base(skin) { const s = c(skin); return { skin: s, shoes: c(0x222222), hat: null, bald: false }; }

function* standAt(m, def) {
  // Auftraggeber-NPC am Marker
  const poi = G.world.pois[def.giver];
  const P = G.player;
  const p = m.npc(poi.x + Math.sin(P.yaw) * 1.8, poi.z + Math.cos(P.yaw) * 1.8, LOOKS[def.npc](), 0);
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
//  Missionen
// ======================================================================
const STORY = [
  {
    id: 'm1', title: 'Neuanfang', sub: 'Tante Rosa', giver: 'diner', label: 'R', npc: 'rosa', reward: 500,
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
    id: 'm2', title: 'Probefahrt', sub: 'Dex', giver: 'garage', label: 'D', npc: 'dex', reward: 1000,
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
    id: 'm3', title: 'Lieferservice', sub: 'Tante Rosa', giver: 'diner', label: 'R', npc: 'rosa', reward: 800,
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
    id: 'm4', title: 'Kleine Gefälligkeit', sub: 'Val', giver: 'club', label: 'V', npc: 'val', reward: 1500,
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
    id: 'm5', title: 'Heiße Ware', sub: 'Dex', giver: 'garage', label: 'D', npc: 'dex', reward: 0,
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
    id: 'm6', title: 'Straßenrennen', sub: 'Dex', giver: 'garage', label: 'D', npc: 'dex', reward: 3000,
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
    id: 'm7', title: 'Der große Coup', sub: 'Val', giver: 'club', label: 'V', npc: 'val', reward: 25000,
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
    after() {
      setTimeout(() => G.hud.bigToast('ENDE DER GESCHICHTE', 'Freies Spiel: Finde alle Neon-Muscheln, Stuntsprünge und fahre Taxi!'), 4500);
    },
  },
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
