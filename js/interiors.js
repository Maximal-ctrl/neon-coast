// Begehbare Innenräume: Club Velvet (Nachtclub) & Solera Bank (Banküberfall)
import * as THREE from 'three';
import { G } from './state.js';
import { Marker } from './missions.js';
import { randomLook, copLook } from './models.js';
import { rand, dist2, pick } from './utils.js';

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function textTex(text, col, w = 512, h = 128, font = 72) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
    g.font = `${font}px "Russo One", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 24; g.fillStyle = col; g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, w / 2, h / 2);
  });
}
const C = (h) => new THREE.Color(h);

export class Interiors {
  constructor(scene) {
    this.scene = scene;
    this.rooms = {};
    this.peds = [];
    this.heistReady = 0;
    this.drunk = 0;
    this.cheer = 0;
    this.t = 0;
    this.light = new THREE.PointLight(0xffffff, 0, 45, 1.3);
    scene.add(this.light);
    this.buildClub();
    this.buildBank();
    this.doors = [
      { kind: 'club', m: new Marker(234, 106.5, 0xff2e88, { label: 'C', r: 1.2 }), out: { x: 234, z: 109.8, yaw: 0 } },
      { kind: 'bank', m: new Marker(10, 26.8, 0x19e6ff, { label: 'B', r: 1.2 }), out: { x: 10, z: 30.5, yaw: 0 } },
    ];
    for (const d of this.doors) d.latch = false;
  }

  // ---------------------------------------------------------- Raum-Grundgerüst
  room(kind, cx, cz, w, d, h, mats) {
    const W = G.world, g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mats.floor);
    floor.position.set(cx, 0.01, cz);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), mats.ceil);
    ceil.position.set(cx, h, cz);
    g.add(floor, ceil);
    const walls = [
      [cx, cz - d / 2 - 0.2, w + 0.8, 0.4], [cx, cz + d / 2 + 0.2, w + 0.8, 0.4],
      [cx - w / 2 - 0.2, cz, 0.4, d], [cx + w / 2 + 0.2, cz, 0.4, d],
    ];
    for (const [x, z, sx, sz] of walls) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sz), mats.wall);
      m.position.set(x, h / 2, z); g.add(m);
      W.addBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, -1, h + 1, 'bld');
    }
    W.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h, h + 1, 'bld'); // Decke (für Kamera)
    W.rooms.push({ x0: cx - w / 2 - 0.5, x1: cx + w / 2 + 0.5, z0: cz - d / 2 - 0.5, z1: cz + d / 2 + 0.5, y: 0 });
    g.visible = false;
    this.scene.add(g);
    const R = { kind, g, cx, cz, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, markers: [] };
    this.rooms[kind] = R;
    return R;
  }
  box(R, x, y, z, sx, sy, sz, mat, collide = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    m.position.set(x, y, z); R.g.add(m);
    if (collide) G.world.addBox(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, -1, y + sy / 2, 'bld');
    return m;
  }

  // ------------------------------------------------------------ Club Velvet
  buildClub() {
    const tiles = canvasTex(256, 256, (g, w) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#ffffff' : '#7a7a7a'; g.fillRect(i * 64 + 4, j * 64 + 4, 56, 56); }
    }, true);
    tiles.repeat.set(3, 3);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ color: 0x120c18, roughness: 0.25, metalness: 0.4 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x07040b, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x1d1028, emissive: 0x0d0614, roughness: 0.85 }),
    };
    const R = this.room('club', 1500, 0, 26, 32, 7, mats);
    R.name = 'Club Velvet';
    R.spawn = { x: 1500, z: 11, yaw: Math.PI };
    // Tanzfläche
    this.floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xff2e88, emissiveMap: tiles, roughness: 0.3 });
    const df = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), this.floorMat);
    df.position.set(1500, 0.02, -2); R.g.add(df);
    R.dance = { x0: 1494, x1: 1506, z0: -8, z1: 4 };
    // Bühne
    const stageMat = new THREE.MeshStandardMaterial({ color: 0x2a1838, roughness: 0.4, metalness: 0.3 });
    this.box(R, 1500, 0.4, -13, 20, 0.8, 6, stageMat, true);
    G.world.rooms.unshift({ x0: 1490, x1: 1510, z0: -16, z1: -10, y: 0.8 });
    const neon = (col) => new THREE.MeshBasicMaterial({ color: col });
    this.box(R, 1500, 0.82, -9.95, 20, 0.06, 0.1, neon(new THREE.Color(0.2, 2.2, 2.6)));
    this.box(R, 1500, 1.35, -14.5, 3, 1.1, 1, new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.3 }), true);
    this.box(R, 1500, 1.92, -14.1, 2.6, 0.05, 0.2, neon(new THREE.Color(2.5, 0.3, 1.2)));
    // Leuchtschrift
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: textTex('VELVET', '#ff2e88'), transparent: true, depthWrite: false }));
    sign.position.set(1500, 4.8, -15.75); R.g.add(sign);
    // Neonleisten an den Wänden
    const cols = [new THREE.Color(2.6, 0.3, 1.3), new THREE.Color(0.2, 2.2, 2.6)];
    this.box(R, 1500, 6.6, -15.8, 26, 0.08, 0.08, neon(cols[0]));
    this.box(R, 1500, 6.6, 15.8, 26, 0.08, 0.08, neon(cols[1]));
    this.box(R, 1487.2, 6.6, 0, 0.08, 0.08, 32, neon(cols[1]));
    this.box(R, 1512.8, 6.6, 0, 0.08, 0.08, 32, neon(cols[0]));
    this.box(R, 1487.2, 0.15, 0, 0.08, 0.08, 32, neon(cols[0]));
    this.box(R, 1512.8, 0.15, 0, 0.08, 0.08, 32, neon(cols[1]));
    // Bar
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3a1f12, roughness: 0.4, metalness: 0.2 });
    this.box(R, 1490, 0.55, 3, 2, 1.1, 14, barMat, true);
    this.box(R, 1490, 1.12, 3, 2.1, 0.06, 14.1, new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.15 }));
    this.box(R, 1491.02, 0.6, 3, 0.04, 0.06, 14, neon(cols[1]));
    for (let k = 0; k < 3; k++) this.box(R, 1487.6, 1.8 + k * 0.7, 3, 0.5, 0.05, 12, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    const bottleCols = [0x2ecc71, 0xe67e22, 0x9b59b6, 0x3498db, 0xe74c3c, 0xf1c40f];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.32, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(pick(bottleCols)).multiplyScalar(0.9) }));
      b.position.set(1487.6, 1.99 + k * 0.7, -2.6 + i * 0.66); R.g.add(b);
    }
    // VIP-Sofas
    const sofa = new THREE.MeshStandardMaterial({ color: 0x8a1030, roughness: 0.7 });
    for (const z of [-1, 4, 9]) { this.box(R, 1512, 0.25, z, 1.6, 0.5, 3.6, sofa); this.box(R, 1512.6, 0.8, z, 0.4, 1.1, 3.6, sofa); }
    // Spiegelkugel & Lichtkegel
    this.ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, flatShading: true }));
    this.ball.position.set(1500, 6.2, -2); R.g.add(this.ball);
    this.beams = new THREE.Group(); this.beams.position.copy(this.ball.position);
    const coneG = new THREE.ConeGeometry(0.9, 7, 16, 1, true).translate(0, -3.5, 0);
    const beamCols = [0xff2e88, 0x19e6ff, 0xffd23f, 0x7cff6b, 0xb26bff, 0xff7b39];
    beamCols.forEach((c, i) => {
      const b = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      b.rotation.set(0.75, (i / beamCols.length) * Math.PI * 2, 0, 'YXZ');
      this.beams.add(b);
    });
    R.g.add(this.beams);
    // Marker
    R.exit = new Marker(1500, 14, 0x7cff6b, { label: 'X', r: 1.1 });
    R.bar = new Marker(1492.4, 3, 0x19e6ff, { label: 'B', r: 1.1 });
    R.tip = new Marker(1500, -8.6, 0xff2e88, { label: '$', r: 1.1 });
    R.markers = [R.exit, R.bar, R.tip];
    for (const m of R.markers) m.group.visible = false;
  }

  spawnClubPeds() {
    const add = (x, z, look, yaw, setup) => {
      const p = G.peds.spawnAt(x, z, look, 'mission');
      p.persistent = true; p.yaw = yaw; p.r = 0.25;
      p.anim.dseed = rand(0, 6);
      if (setup) setup(p);
      this.peds.push(p);
      return p;
    };
    // Tänzerinnen & Tänzer auf der Bühne (Bühnenoutfits)
    const stage = [[1492, 0xff2e88, 0x1b1b1b], [1496, 0x19e6ff, 0x2b1b3b], [1504, 0xffd23f, 0x1b1b1b], [1508, 0xb26bff, 0x111133]];
    stage.forEach(([x, top, bottom], i) => add(x, -11.6, {
      ...randomLook(), shirt: C(top), sleeve: C(top), pants: C(bottom), legs: C(bottom), shoes: C(0xffffff), hat: null, scale: 0.95,
    }, 0, (p) => { p.anim.dance = true; p.y = 0.8; p.dancer = true; }));
    add(1500, -15.4, { ...randomLook(), shirt: C(0x111111), sleeve: C(0x111111), hat: C(0xff2e88) }, 0, (p) => { p.anim.dance = true; p.y = 0.8; });
    // Publikum
    for (let k = 0; k < 14; k++) add(rand(1494.5, 1505.5), rand(-7.5, 3.5), randomLook(), Math.PI + rand(-0.6, 0.6), (p) => { p.anim.dance = true; });
    // Barkeeper & Gäste
    add(1488.3, 3, { ...randomLook(), shirt: C(0xffffff), sleeve: C(0x111111) }, Math.PI / 2);
    for (const z of [-1.5, 2, 6]) add(1492.2, z, randomLook(), -Math.PI / 2);
    for (const z of [-1, 4, 9]) add(1511.3, z, randomLook(), -Math.PI / 2, (p) => { p.anim.sit = true; p.anim.crouch = 0.52; });
  }

  // ------------------------------------------------------------ Solera Bank
  buildBank() {
    const marble = canvasTex(256, 256, (g, w) => {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#e9e4da' : '#cfc6b6'; g.fillRect(i * 128, j * 128, 128, 128); }
      for (let k = 0; k < 120; k++) { g.strokeStyle = `rgba(120,110,100,${Math.random() * 0.15})`; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * w); g.lineTo(Math.random() * w, Math.random() * w); g.stroke(); }
    }, true);
    marble.repeat.set(8, 9);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: marble, roughness: 0.2, metalness: 0.1 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf6f2ea, emissive: 0x6a665e, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xd8cfc0, emissive: 0x2a2620, roughness: 0.8 }),
    };
    const R = this.room('bank', 1500, 150, 22, 26, 6, mats);
    R.name = 'Solera Bank';
    R.spawn = { x: 1500, z: 158, yaw: Math.PI };
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.5 });
    this.box(R, 1500, 0.6, 145.8, 18, 1.2, 1.6, wood, true);
    this.box(R, 1500, 1.23, 145.8, 18.2, 0.06, 1.7, new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.7, roughness: 0.2 }));
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, depthWrite: false });
    this.box(R, 1500, 1.9, 145.5, 18, 1.3, 0.05, glass);
    // Tresortür
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.95, roughness: 0.25 });
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.5, 40).rotateX(Math.PI / 2), steel);
    vault.position.set(1500, 2.6, 137.3); R.g.add(vault);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), steel); s.position.set(1500, 2.6, 137.65); s.rotation.z = (k * Math.PI) / 3; R.g.add(s); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.4), new THREE.MeshBasicMaterial({ map: textTex('SOLERA BANK', '#ffd23f', 768, 128, 70), transparent: true, depthWrite: false }));
    sign.position.set(1500, 5.3, 137.25); R.g.add(sign);
    // Säulen & Pflanzen
    for (const x of [1492, 1508]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 6, 16), new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.4 }));
      c.position.set(x, 3, 153); R.g.add(c);
      G.world.addCircle(x, 153, 0.55, 6, 'pillar');
    }
    const pot = new THREE.MeshStandardMaterial({ color: 0x333333 }), leaf = new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8, flatShading: true });
    for (const [x, z] of [[1490.2, 161.8], [1509.8, 161.8], [1490.2, 148.5], [1509.8, 148.5]]) {
      this.box(R, x, 0.35, z, 0.7, 0.7, 0.7, pot);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), leaf); l.position.set(x, 1.2, z); R.g.add(l);
    }
    const bench = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.6 });
    this.box(R, 1500, 0.25, 157, 4, 0.5, 0.8, bench);
    R.exit = new Marker(1500, 161, 0x7cff6b, { label: 'X', r: 1.1 });
    R.rob = new Marker(1500, 148.4, 0xff3b5c, { label: '!', r: 1.2 });
    R.markers = [R.exit, R.rob];
    for (const m of R.markers) m.group.visible = false;
  }

  spawnBankPeds() {
    const add = (x, z, look, yaw, role) => {
      const p = G.peds.spawnAt(x, z, look, 'mission');
      p.persistent = true; p.yaw = yaw; p.role = role;
      this.peds.push(p);
      return p;
    };
    for (const x of [1495, 1500, 1505]) add(x, 143.9, { ...randomLook(), shirt: C(0xf4f1ec), sleeve: C(0x2b3a55), pants: C(0x2b3a55), legs: C(0x2b3a55), hat: null }, 0, 'teller');
    add(1508.5, 159.5, copLook(), Math.PI, 'guard');
    for (const [x, z] of [[1496, 150], [1503.5, 151.5], [1499, 155.5]]) add(x, z, randomLook(), Math.PI + rand(-0.4, 0.4), 'customer');
  }

  // ------------------------------------------------------------ Betreten / Verlassen
  enter(kind) {
    const R = this.rooms[kind], P = G.player;
    G.hud.fadeIn();
    R.g.visible = true;
    for (const m of R.markers) m.group.visible = true;
    P.x = R.spawn.x; P.z = R.spawn.z; P.y = 0; P.yaw = R.spawn.yaw; P.vx = P.vz = P.vy = 0;
    G.cam.yaw = R.spawn.yaw; G.cam.pitch = -0.15; G.cam.snap();
    G.interior = { kind, name: R.name, station: 2 };
    if (kind === 'club') {
      this.spawnClubPeds();
      this.light.position.set(1500, 5.5, -1);
      this.light.intensity = 160;
      if (!this.clubHint) { this.clubHint = true; G.hud.hint('Willkommen im <b>Club Velvet</b>!<br>Bleib auf der Tanzfläche stehen zum <b>Tanzen</b>. Bar: <b>B</b> · Bühne: <b>$</b>', 8); }
    } else {
      this.spawnBankPeds();
      this.light.position.set(1500, 5, 150);
      this.light.color.setHex(0xfff2dc);
      this.light.intensity = 140;
      if (!this.bankHint) { this.bankHint = true; G.hud.hint('Die <b>Solera Bank</b>.<br>Mit einer Waffe kannst du am roten <b>!</b>-Marker einen <b>Überfall</b> starten.', 8); }
    }
    for (const m of R.markers) m.latch = true;
  }
  exit() {
    const kind = G.interior.kind;
    const d = this.doors.find((o) => o.kind === kind), P = G.player;
    this.cleanup();
    P.x = d.out.x; P.z = d.out.z; P.y = 0; P.yaw = d.out.yaw;
    G.cam.yaw = d.out.yaw; G.cam.pitch = -0.2; G.cam.snap();
    d.latch = true;
    G.hud.fadeIn();
  }
  cleanup() {
    for (const p of this.peds) if (!p.removed) G.peds.remove(p);
    this.peds = [];
    for (const R of Object.values(this.rooms)) { R.g.visible = false; for (const m of R.markers) m.group.visible = false; }
    this.light.intensity = 0;
    G.player.anim.dance = false;
    G.interior = null;
  }

  // ------------------------------------------------------------ Update
  update(dt) {
    const P = G.player;
    this.t += dt;
    const storyBusy = G.missions.active && !G.missions.active.side;
    for (const d of this.doors) {
      d.m.update(dt);
      d.m.group.visible = !G.interior && !storyBusy;
    }
    if (this.drunk > 0) {
      this.drunk -= dt;
      const k = Math.min(1, this.drunk / 5);
      G.cam.yaw += Math.sin(this.t * 1.3) * 0.006 * k;
      G.cam.pitch += Math.cos(this.t * 0.9) * 0.003 * k;
    }
    if (!G.interior) {
      if (P.state !== 'foot' || storyBusy) return;
      for (const d of this.doors) {
        const inside = dist2(P.x, P.z, d.m.x, d.m.z) < 1.4 * 1.4;
        if (inside && !d.latch) { d.latch = true; this.enter(d.kind); return; }
        if (!inside) d.latch = false;
      }
      return;
    }
    const R = this.rooms[G.interior.kind];
    // Spieler wurde wegteleportiert (z. B. Krankenhaus)
    if (P.x < R.x0 - 2 || P.x > R.x1 + 2 || P.z < R.z0 - 2 || P.z > R.z1 + 2) { this.cleanup(); return; }
    for (const m of R.markers) m.update(dt);
    const on = (m, r = 1.3) => {
      const inside = dist2(P.x, P.z, m.x, m.z) < r * r && P.state === 'foot';
      const fire = inside && !m.latch;
      m.latch = inside;
      return fire;
    };
    if (on(R.exit)) { this.exit(); return; }
    if (G.interior.kind === 'club') this.updateClub(dt, R, on);
    else this.updateBank(dt, R, on);
  }

  updateClub(dt, R, on) {
    const P = G.player, t = this.t;
    const hue = (t * 0.08) % 1;
    this.floorMat.emissive.setHSL(hue, 1, 0.5);
    this.floorMat.emissiveIntensity = 0.6 + 0.4 * Math.abs(Math.sin(t * 6.5));
    this.light.color.setHSL((hue + 0.5) % 1, 0.8, 0.6);
    this.ball.rotation.y += dt * 0.8;
    this.beams.rotation.y += dt * 0.6;
    const D = R.dance;
    const still = Math.hypot(P.vx, P.vz) < 0.4;
    P.anim.dance = P.state === 'foot' && still && P.x > D.x0 && P.x < D.x1 && P.z > D.z0 && P.z < D.z1;
    if (this.cheer > 0) {
      this.cheer -= dt;
      for (const p of this.peds) if (p.dancer) p.yaw += dt * 6;
      if (this.cheer <= 0) for (const p of this.peds) if (p.dancer) p.yaw = 0;
    }
    if (on(R.bar)) {
      G.openMenu('BAR', 'Was darf\'s sein?', [
        ['Neon-Cocktail – $25', () => { if (!this.pay(25)) return; this.drunk = 25; G.hud.toast('Prost! Die Welt dreht sich ein bisschen …'); }],
        ['Energy-Drink – $10', () => { if (!this.pay(10)) return; P.health = Math.min(100, P.health + 20); G.hud.toast('Energie getankt: +20 Gesundheit'); }],
        ['Wasser – gratis', () => { G.hud.toast('Erfrischend.'); }],
      ]);
    }
    if (on(R.tip)) {
      G.openMenu('BÜHNE', 'Die Tänzerinnen und Tänzer geben alles.', [
        ['Trinkgeld geben – $50', () => { if (!this.pay(50)) return; this.cheer = 3; G.hud.toast('Die Show-Crew bedankt sich mit einer Pirouette!'); }],
        ['Song wünschen – $20', () => { if (!this.pay(20)) return; G.interior.station = G.interior.station === 2 ? 0 : 2; G.audio.nextBar = 0; G.hud.toast('Der DJ legt deinen Wunsch auf!'); }],
      ]);
    }
  }
  pay(n) {
    if (G.player.money < n) { G.hud.toast('Nicht genug Geld.'); return false; }
    G.player.addMoney(-n);
    return true;
  }

  updateBank(dt, R, on) {
    const ready = !G.missions.active && G.time >= this.heistReady;
    R.rob.group.visible = ready;
    if (!ready) { R.rob.latch = dist2(G.player.x, G.player.z, R.rob.x, R.rob.z) < 1.69; return; }
    if (on(R.rob)) {
      if (G.player.weapon === 'fists') { G.hud.toast('Für einen Überfall brauchst du eine Waffe (Waffenladen „W“).'); return; }
      this.heistReady = G.time + 120;
      G.missions.start(heistDef(this));
    }
  }
}

// Banküberfall als wiederholbarer Nebenauftrag
function heistDef(I) {
  return {
    id: 'heist', title: 'Banküberfall', side: true, reward: 0,
    *run(m) {
      const P = G.player;
      G.hud.bigToast('ÜBERFALL!', 'Alle auf den Boden – äh, Hände hoch!');
      G.audio.wantedUp();
      for (const p of I.peds) { p.surrender = true; if (p.role === 'guard') p.anim.gun = false; }
      const total = Math.round(rand(7000, 14000) / 100) * 100;
      let t = 0, alarm = false;
      const dur = 15;
      m.objective('Leere die Kassen – <b>bleib am Schalter</b>!');
      while (t < dur) {
        if (!G.interior || G.interior.kind !== 'bank') { m.fail('Überfall abgebrochen – du bist zu früh gegangen.'); yield; return; }
        if (dist2(P.x, P.z, 1500, 148.5) < 7 * 7) t += G.dt;
        G.hud.racePos(`BEUTE  $${Math.floor((total * t) / dur)}`);
        if (!alarm && t > 5) { alarm = true; G.hud.toast('Stiller Alarm ausgelöst! Die Polizei ist unterwegs.'); G.police.setLevel(2); }
        if (alarm) G.police.spotted();
        yield;
      }
      G.hud.racePos('');
      G.audio.cash();
      G.police.setLevel(3); G.police.spotted();
      m.objective(`Beute: <b>$${total}</b> – raus hier! Folge dem grünen <b>X</b>.`);
      while (G.interior) { G.police.spotted(); yield; }
      m.objective(`Hänge die <b>Polizei</b> ab, um die Beute ($${total}) zu sichern.`);
      G.police.spotted();
      yield* m.until(() => G.police.level === 0);
      P.addMoney(total);
      G.hud.banner('BEUTE GESICHERT', '#7dffa0', `Banküberfall · +$${total}`);
      G.audio.jingle();
      I.heistReady = G.time + 300;
      G.save.write();
    },
  };
}
