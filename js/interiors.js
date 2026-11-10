// Begehbare Innenräume: Club Velvet (Nachtclub) & Solera Bank (Banküberfall)
import * as THREE from 'three';
import { OUTFITS } from './models.js';
import { G } from './state.js';
import { Marker } from './missions.js';
import { randomLook, copLook, buildCar, addWheels, CAR_TYPES } from './models.js';
import { GeoBuilder, rgb } from './geo.js';
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
    this.buildHome();
    this.buildShop();
    this.buildDealer();
    this.buildDealerFront();
    this.buildCafe();
    this.buildBoutique();
    this.buildVilla();
    this.buildOffice();
    this.buildDiner();
    this.buildBar();
    this.buildHouse();
    this.buildGunshop();
    this.residents = {};
    const sh = G.world.pois.safehouse, shop = G.world.pois.shop, dl = G.world.pois.dealer;
    this.doors = [
      { kind: 'club', m: new Marker(234, 106.5, 0xff2e88, { label: 'C', r: 1.2 }), out: { x: 234, z: 109.8, yaw: 0 } },
      { kind: 'bank', m: new Marker(10, 26.8, 0x19e6ff, { label: 'B', r: 1.2 }), out: { x: 10, z: 30.5, yaw: 0 } },
      { kind: 'home', m: new Marker(sh.x, sh.z, 0x7cff6b, { label: 'H', r: 1.2 }), out: { x: sh.x, z: sh.z + 2.6, yaw: 0 } },
      { kind: 'shop', m: new Marker(shop.x, shop.z, 0xffd23f, { label: '24', r: 1.1 }), out: { x: shop.x, z: shop.z + 2.4, yaw: 0 } },
      { kind: 'dealer', m: new Marker(dl.x, dl.z, 0xff2e88, { label: 'A', r: 1.2 }), out: { x: dl.x, z: dl.z + 2.8, yaw: 0 } },
    ];
    for (const e of G.world.entrances || []) {
      this.doors.push({ kind: e.kind, name: e.name, id: e.id, m: new Marker(e.x, e.z, new THREE.Color(e.col).getHex(), { label: e.label, r: 1.1 }), out: e.out });
    }
    for (const d of this.doors) d.latch = false;
  }
  doorPos(id) { const d = this.doors.find((o) => (o.id || o.kind) === id); return d ? { x: d.m.x, z: d.m.z } : null; }

  // Gemeinsamer Möbelbau für die neuen Räume
  furnish(R, build) {
    const B = new GeoBuilder(true);
    build(B, (x0, z0, x1, z1, h) => G.world.addBox(x0, z0, x1, z1, -1, h, 'bld'));
    const mesh = new THREE.Mesh(B.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    R.g.add(mesh);
  }
  lamp(R, x, y, z, col = [2.2, 1.7, 1.1], r = 0.28) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(...col) }));
    l.position.set(x, y, z); R.g.add(l);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.set(x, y + 0.6, z); R.g.add(cord);
  }
  textPlane(R, text, col, x, y, z, ry, w = 3) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: textTex(text, col, 512, 128, 64), transparent: true, depthWrite: false }));
    m.position.set(x, y, z); m.rotation.y = ry; R.g.add(m);
  }

  // ------------------------------------------------------------ Café Vieja (Altstadt)
  buildCafe() {
    const tiles = canvasTex(256, 256, (g, w) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#d9c3a0' : '#7a4a32'; g.fillRect(i * 32, j * 32, 32, 32); } }, true);
    tiles.repeat.set(6, 4);
    const R = this.room('cafe', 1500, 750, 18, 13, 3.6, {
      floor: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.4 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xe8d6b8, emissive: 0x1a120a, roughness: 0.9 }),
    });
    R.name = 'Café Vieja'; R.spawn = { x: 1500, z: 754.4, yaw: Math.PI };
    R.lightCfg = [1500, 3, 750, 0xffc890, 30];
    this.furnish(R, (B, col) => {
      // Theke mit Vitrine & Espressomaschine
      B.box(1493, 0, 744.6, 1503, 1.05, 745.9, { col: rgb(0x5a3422) });
      B.box(1492.9, 1.05, 744.5, 1503.1, 1.12, 746, { col: rgb(0xe9e4da) });
      B.box(1497, 1.12, 745.2, 1500, 1.5, 745.9, { col: rgb(0xbfe6ff) });
      for (let i = 0; i < 8; i++) B.box(1497.2 + i * 0.34, 1.13, 745.4, 1497.45 + i * 0.34, 1.22, 745.7, { col: rgb([0xc68642, 0xf2d0a4, 0x8a4b2a, 0xff8fab][i % 4]) });
      B.box(1493.6, 1.12, 744.7, 1494.6, 1.75, 745.4, { col: rgb(0xb8bec7) });
      B.box(1493.5, 1.75, 744.6, 1494.7, 1.85, 745.5, { col: rgb(0x2b2b2b) });
      col(1492.9, 744.5, 1503.1, 746, 1.12);
      // Regal mit Bohnen & Flaschen
      B.box(1493, 1.3, 743.6, 1503, 1.36, 743.95, { col: rgb(0x5a3422) });
      B.box(1493, 2.0, 743.6, 1503, 2.06, 743.95, { col: rgb(0x5a3422) });
      for (let i = 0; i < 24; i++) B.box(1493.2 + i * 0.4, 1.36, 743.7, 1493.42 + i * 0.4, 1.66 + (i % 3) * 0.06, 743.9, { col: rgb([0x2a9d8f, 0x8a4b2a, 0xe9c46a, 0x264653][i % 4]) });
      // Tische mit Stühlen
      for (const [x, z] of [[1494, 749], [1498.5, 749.6], [1503, 749], [1505.5, 745.5], [1494.5, 753], [1505, 753]]) {
        B.addGeometry(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), new THREE.Matrix4().makeTranslation(x, 0.76, z), rgb(0xf4f1ea));
        B.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.74, 6), new THREE.Matrix4().makeTranslation(x, 0.37, z), rgb(0x222222));
        for (const [ox, oz] of [[0.9, 0], [-0.9, 0], [0, 0.9]]) { B.box(x + ox - 0.22, 0.44, z + oz - 0.22, x + ox + 0.22, 0.5, z + oz + 0.22, { col: rgb(0x8a4b2a) }); B.box(x + ox - 0.22 + (ox > 0 ? 0.38 : 0), 0.5, z + oz - 0.22, x + ox - 0.22 + (ox > 0 ? 0.44 : 0.06), 1.0, z + oz + 0.22, { col: rgb(0x8a4b2a) }); }
        col(x - 0.6, z - 0.6, x + 0.6, z + 0.6, 0.8);
      }
      // Pflanzen & Bilder
      for (const x of [1491.6, 1508.4]) { B.box(x - 0.3, 0, 755.6, x + 0.3, 0.6, 756.2, { col: rgb(0x9a5a3a) }); B.addGeometry(new THREE.IcosahedronGeometry(0.55, 1), new THREE.Matrix4().makeTranslation(x, 1.1, 755.9), rgb(0x3e7a2e)); }
      for (const [x, c] of [[1492, 0xe76f51], [1508, 0x2a9d8f]]) B.box(x - 0.8, 1.6, 743.45, x + 0.8, 2.7, 743.5, { col: rgb(c) });
    });
    for (const x of [1495, 1499, 1503]) this.lamp(R, x, 2.7, 749.5);
    this.textPlane(R, 'CAFÉ VIEJA', '#ffb35c', 1498, 3.0, 743.4, 0, 3.6);
    R.exit = new Marker(1500, 756.3, 0x7cff6b, { label: 'X', r: 1.0 });
    R.counter = new Marker(1498, 747.0, 0xffb35c, { label: '☕', r: 0.9 });
    R.markers = [R.exit, R.counter];
    R.resident = { id: 'ines', x: 1498, z: 744.1, yaw: 0, look: () => ({ ...randomLook(), skin: C(0xd9a066), shirt: C(0x7a2e1e), sleeve: C(0xd9a066), pants: C(0x2b2b2b), legs: C(0x2b2b2b), hair: C(0x2b1a10), hat: null, bald: false, scale: 0.9 }) };
    R.guests = [[1494.9, 749, -Math.PI / 2, 'sit'], [1502.1, 749, Math.PI / 2, 'sit'], [1505, 753.9, Math.PI, 'sit']];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Moda Solera (Boutique)
  buildBoutique() {
    const R = this.room('boutique', 1500, 900, 16, 12, 3.8, {
      floor: new THREE.MeshStandardMaterial({ color: 0xe9e4dc, roughness: 0.15, metalness: 0.1 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x555555, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf6efe9, emissive: 0x2a2626, roughness: 0.8 }),
    });
    R.name = 'Moda Solera'; R.spawn = { x: 1500, z: 903.8, yaw: Math.PI };
    R.lightCfg = [1500, 3.4, 900, 0xfff2ea, 22];
    const cloth = [0xff6b6b, 0xf6f1e9, 0x222222, 0x19e6ff, 0xffd166, 0x3ec1d3, 0x9b5de5, 0x2a9d8f];
    this.furnish(R, (B, col) => {
      for (const z of [897, 900.5]) {
        B.box(1493.5, 1.55, z - 0.03, 1499.5, 1.6, z + 0.03, { col: rgb(0xc9ced6) });
        for (const x of [1493.5, 1499.5]) B.box(x - 0.04, 0, z - 0.04, x + 0.04, 1.6, z + 0.04, { col: rgb(0xc9ced6) });
        for (let i = 0; i < 16; i++) B.box(1493.8 + i * 0.36, 0.55, z - 0.25, 1494.0 + i * 0.36, 1.5, z + 0.25, { col: rgb(cloth[(i + (z > 899 ? 3 : 0)) % cloth.length]) });
        col(1493.4, z - 0.3, 1499.6, z + 0.3, 1.6);
      }
      // Regalwand & Kasse
      B.box(1506.6, 0, 894.5, 1507.9, 2.8, 905, { col: rgb(0xf4efe6) });
      for (let r = 0; r < 4; r++) for (let i = 0; i < 14; i++) B.box(1506.5, 0.35 + r * 0.62, 894.9 + i * 0.72, 1506.6, 0.75 + r * 0.62, 895.4 + i * 0.72, { col: rgb(cloth[(i + r) % cloth.length]) });
      col(1506.5, 894.5, 1508, 905, 2.8);
      B.box(1500.5, 0, 894.4, 1504.5, 1.0, 895.5, { col: rgb(0x2b2d42) });
      col(1500.5, 894.4, 1504.5, 895.5, 1.0);
      // Spiegel & Podest
      B.box(1492.2, 0, 903.2, 1494.2, 0.15, 905.2, { col: rgb(0xd4af37) });
      B.box(1492.1, 0.2, 905.75, 1494.3, 2.5, 905.85, { col: rgb(0xdfe9f2) });
      // Schaufensterpuppen (vereinfacht)
      for (const x of [1503, 1504.6]) { B.addGeometry(new THREE.CylinderGeometry(0.18, 0.12, 1.1, 10), new THREE.Matrix4().makeTranslation(x, 1.0, 903.5), rgb(0xff6fb0)); B.addGeometry(new THREE.SphereGeometry(0.13, 10, 8), new THREE.Matrix4().makeTranslation(x, 1.75, 903.5), rgb(0xf2f2f2)); B.box(x - 0.02, 0, 903.48, x + 0.02, 0.5, 903.52, { col: rgb(0x888888) }); }
    });
    for (const x of [1495, 1500, 1505]) this.lamp(R, x, 3.2, 900, [2.4, 2.3, 2.1], 0.22);
    this.textPlane(R, 'MODA SOLERA', '#ff6fb0', 1500, 3.0, 894.05, 0, 3.6);
    R.exit = new Marker(1500, 905.6, 0x7cff6b, { label: 'X', r: 1.0 });
    R.rack = new Marker(1496.5, 898.8, 0xff6fb0, { label: '👕', r: 1.0 });
    R.markers = [R.exit, R.rack];
    R.resident = { id: 'clerk', x: 1502.5, z: 893.9, yaw: 0, look: () => ({ ...randomLook(), shirt: C(0x222222), sleeve: C(0x222222), pants: C(0x222222), legs: C(0x222222), hat: null }) };
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Villa Aurelio (Monte Solera)
  buildVilla() {
    const marble = canvasTex(256, 256, (g, w) => { g.fillStyle = '#efece6'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(120,110,100,0.18)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(Math.random() * w, 0); g.bezierCurveTo(Math.random() * w, w / 3, Math.random() * w, w / 1.5, Math.random() * w, w); g.stroke(); } g.strokeStyle = 'rgba(0,0,0,0.08)'; g.strokeRect(0, 0, w, w); }, true);
    marble.repeat.set(6, 5);
    const R = this.room('villa', 1500, 1050, 22, 16, 4.2, {
      floor: new THREE.MeshStandardMaterial({ map: marble, color: 0xd8d2c8, roughness: 0.3, metalness: 0.05 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf8f4ec, emissive: 0x3a3630, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf1e8da, emissive: 0x241e18, roughness: 0.85 }),
    });
    R.name = 'Villa Aurelio'; R.spawn = { x: 1500, z: 1055.6, yaw: Math.PI };
    R.lightCfg = [1500, 3.8, 1050, 0xfff0d8, 20];
    this.furnish(R, (B, col) => {
      // Ledersofas um Couchtisch
      B.box(1494, 0, 1046, 1499, 0.5, 1047.2, { col: rgb(0x5a3422) }); B.box(1494, 0.5, 1046, 1499, 1.1, 1046.4, { col: rgb(0x5a3422) });
      B.box(1494, 0, 1050.8, 1499, 0.5, 1052, { col: rgb(0x5a3422) }); B.box(1494, 0.5, 1051.6, 1499, 1.1, 1052, { col: rgb(0x5a3422) });
      B.box(1495.3, 0, 1048.3, 1497.7, 0.42, 1049.9, { col: rgb(0x1d1d1f) });
      col(1494, 1046, 1499, 1047.2, 1.1); col(1494, 1050.8, 1499, 1052, 1.1); col(1495.3, 1048.3, 1497.7, 1049.9, 0.42);
      // Schreibtisch des Paten
      B.box(1503.5, 0, 1044.6, 1507.5, 0.85, 1045.9, { col: rgb(0x3b2416) });
      B.box(1503.4, 0.85, 1044.5, 1507.6, 0.92, 1046, { col: rgb(0x2a1a10) });
      B.box(1505, 0.92, 1044.8, 1505.6, 1.3, 1044.9, { col: rgb(0x111111) });
      col(1503.4, 1044.5, 1507.6, 1046, 0.92);
      B.box(1504.9, 0, 1043.4, 1506.1, 1.4, 1044.1, { col: rgb(0x7a1e1e) });
      // Bar & Weinregal
      B.box(1508.5, 0, 1047, 1510.4, 1.1, 1054, { col: rgb(0x2a1a10) });
      for (let r = 0; r < 5; r++) for (let i = 0; i < 10; i++) B.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(1510.8, 1.5 + r * 0.32, 1047.4 + i * 0.66), rgb([0x6d2e46, 0x3a5a40, 0xe9d8a6][(i + r) % 3]));
      col(1508.5, 1047, 1510.4, 1054, 1.1);
      // Kamin, Teppich, Säulen, Gemälde
      B.box(1489.2, 0, 1047.5, 1489.9, 1.6, 1052.5, { col: rgb(0xd8d2c6) });
      B.box(1489.85, 0.25, 1048.6, 1489.92, 1.15, 1051.4, { col: rgb(0x111111) });
      B.box(1493.5, 0.005, 1045.5, 1500, 0.015, 1052.5, { col: rgb(0x7a1e1e) });
      for (const [x, z] of [[1492, 1044], [1508, 1044], [1492, 1056], [1508, 1056]]) { B.addGeometry(new THREE.CylinderGeometry(0.28, 0.32, 4.2, 14), new THREE.Matrix4().makeTranslation(x, 2.1, z), rgb(0xf6f1e8)); col(x - 0.32, z - 0.32, x + 0.32, z + 0.32, 4.2); }
      B.box(1497, 1.6, 1042.1, 1501, 3.4, 1042.15, { col: rgb(0x8a6a48) });
      B.box(1497.15, 1.75, 1042.15, 1500.85, 3.25, 1042.2, { col: rgb(0x355070) });
    });
    // Panoramafenster mit Blick auf die Stadt
    const view = canvasTex(1024, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5fa8e8'); gr.addColorStop(0.7, '#cfe6f7'); gr.addColorStop(1, '#2f6f9a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const bw = 6 + Math.random() * 16, bh = 20 + Math.random() * 90, x = 200 + Math.random() * 600; g.fillStyle = `rgb(${110 + Math.random() * 60},${130 + Math.random() * 50},${160 + Math.random() * 40})`; g.fillRect(x, h * 0.78 - bh, bw, bh); } g.fillStyle = '#4f7f34'; g.fillRect(0, h * 0.86, w, h * 0.14); });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: view }));
    win.position.set(1500, 2.0, 1042.05); R.g.add(win);
    for (const x of [1496, 1504]) this.lamp(R, x, 3.4, 1049, [2.4, 2.0, 1.4], 0.4);
    R.exit = new Marker(1500, 1057.6, 0x7cff6b, { label: 'X', r: 1.0 });
    R.markers = [R.exit];
    R.resident = { id: 'aurelio', x: 1505.5, z: 1043.9, yaw: 0, look: () => ({ ...randomLook(), skin: C(0xe0ac69), shirt: C(0xf4f1de), sleeve: C(0xf4f1de), pants: C(0x2b2d42), legs: C(0x2b2d42), hair: C(0xcfcfcf), hat: null, bald: false, scale: 1.0 }) };
    R.guests = [[1509, 1055.4, Math.PI, 'guard'], [1491, 1055.4, Math.PI, 'guard']];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Diner
  buildDiner() {
    const tiles = canvasTex(256, 256, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4f1ea' : '#22262c'; g.fillRect(i * 32, j * 32, 32, 32); } }, true);
    tiles.repeat.set(5, 3.5);
    const R = this.room('diner', 1500, 1350, 20, 13, 3.5, {
      floor: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.25 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf2efe8, emissive: 0x3a3832, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xbfe3df, emissive: 0x10201e, roughness: 0.8 }),
    });
    R.name = 'Diner'; R.spawn = { x: 1500, z: 1354.4, yaw: Math.PI };
    R.lightCfg = [1500, 3, 1350, 0xfff0dc, 26];
    const red = rgb(0xc0392b), chrome = rgb(0xc9ced6), cream = rgb(0xf4f1ea);
    this.furnish(R, (B, col) => {
      // Theke mit Hockern
      B.box(1492, 0, 1345.4, 1506, 1.05, 1346.5, { col: chrome }); B.box(1491.9, 1.05, 1345.3, 1506.1, 1.12, 1346.6, { col: red });
      col(1491.9, 1345.3, 1506.1, 1346.6, 1.12);
      for (let k = 0; k < 8; k++) { const x = 1493 + k * 1.7; B.addGeometry(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 8), new THREE.Matrix4().makeTranslation(x, 0.35, 1347.4), chrome); B.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14), new THREE.Matrix4().makeTranslation(x, 0.76, 1347.4), red); }
      // Küche dahinter: Grill, Kaffeemaschinen, Durchreiche
      B.box(1492, 0, 1343.6, 1506, 0.95, 1344.3, { col: chrome }); B.box(1494, 0.95, 1343.7, 1497, 1.0, 1344.2, { col: rgb(0x222222) });
      B.box(1500, 0.95, 1343.7, 1500.8, 1.55, 1344.2, { col: rgb(0x8a8f99) }); B.box(1501.2, 0.95, 1343.7, 1502, 1.55, 1344.2, { col: rgb(0x8a8f99) });
      B.box(1492, 2.2, 1343.55, 1506, 2.9, 1343.7, { col: red });
      // Sitznischen an Fenstern
      for (const x of [1491.6, 1508.4]) for (let k = 0; k < 3; k++) {
        const z = 1348.5 + k * 2.6, sx = x < 1500 ? 1 : -1;
        B.box(x - 0.9, 0, z - 0.2, x + 0.9, 1.15, z + 0.1, { col: red }); B.box(x - 0.9, 0, z + 0.1, x + 0.9, 0.5, z + 0.75, { col: red });
        B.box(x - 0.9, 0, z + 1.95, x + 0.9, 1.15, z + 2.25, { col: red }); B.box(x - 0.9, 0, z + 1.3, x + 0.9, 0.5, z + 1.95, { col: red });
        B.box(x - 0.8, 0.72, z + 0.82, x + 0.8, 0.78, z + 1.25, { col: cream }); B.box(x - 0.05, 0, z + 0.98, x + 0.05, 0.72, z + 1.08, { col: chrome });
        col(x - 0.9, z - 0.2, x + 0.9, z + 2.25, 1.15);
        void sx;
      }
      // Jukebox
      B.box(1509, 0, 1344, 1509.8, 1.5, 1344.9, { col: rgb(0x7a1e5a) }); B.box(1508.95, 0.9, 1344.1, 1509, 1.4, 1344.8, { col: rgb(0xffd23f) });
      col(1509, 1344, 1509.8, 1344.9, 1.5);
      // Chromleiste & Bilder
      for (const z of [1343.52]) for (let k = 0; k < 4; k++) B.box(1493 + k * 3.6, 1.6, z, 1495 + k * 3.6, 2.1, z + 0.03, { col: rgb([0xffd23f, 0x19e6ff, 0xff6fb0, 0x7cff6b][k]) });
    });
    for (const x of [1495, 1500, 1505]) this.lamp(R, x, 2.8, 1349.5, [2.3, 2.0, 1.6], 0.25);
    this.textPlane(R, 'DINER', '#ff5a5a', 1499, 3.1, 1343.52, 0, 3);
    R.exit = new Marker(1500, 1356.3, 0x7cff6b, { label: 'X', r: 1.0 });
    R.counter = new Marker(1499, 1348.6, 0xff5a5a, { label: '🍔', r: 0.9 });
    R.markers = [R.exit, R.counter];
    R.resident = { id: 'cook', x: 1499, z: 1344.9, yaw: 0, look: () => ({ ...randomLook(), shirt: C(0xf4f1ea), sleeve: C(0xf4f1ea), pants: C(0x222222), legs: C(0x222222), hat: C(0xf4f1ea) }) };
    R.guests = [[1494.7, 1347.9, Math.PI, 'stand'], [1503.2, 1347.9, Math.PI, 'stand']];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Bar / Cantina
  buildBar() {
    const planks = canvasTex(256, 256, (g, w) => { for (let i = 0; i < 8; i++) { const b = 0.7 + Math.random() * 0.3; g.fillStyle = `rgb(${92 * b},${58 * b},${36 * b})`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(20,10,5,.7)'; g.fillRect(0, i * 32 + 31, w, 1); } }, true);
    planks.repeat.set(5, 4);
    const R = this.room('bar', 1500, 1500, 18, 14, 3.6, {
      floor: new THREE.MeshStandardMaterial({ map: planks, roughness: 0.5 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x5a3a28, emissive: 0x120a06, roughness: 0.9 }),
    });
    R.name = 'Bar'; R.spawn = { x: 1500, z: 1505, yaw: Math.PI };
    R.lightCfg = [1500, 3, 1500, 0xffb060, 16];
    const wood = rgb(0x3b2416), brass = rgb(0xc9a14a);
    this.furnish(R, (B, col) => {
      B.box(1493, 0, 1494.6, 1505, 1.1, 1495.8, { col: wood }); B.box(1492.9, 1.1, 1494.5, 1505.1, 1.17, 1495.9, { col: rgb(0x1b120c) }); B.box(1493, 0.2, 1495.8, 1505, 0.27, 1496.0, { col: brass });
      col(1492.9, 1494.5, 1505.1, 1495.9, 1.17);
      for (let k = 0; k < 7; k++) { const x = 1494 + k * 1.7; B.addGeometry(new THREE.CylinderGeometry(0.05, 0.09, 0.75, 8), new THREE.Matrix4().makeTranslation(x, 0.38, 1496.7), brass); B.addGeometry(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 14), new THREE.Matrix4().makeTranslation(x, 0.8, 1496.7), rgb(0x6d2e2e)); }
      // Flaschenregal mit Spiegel
      B.box(1493, 1.2, 1493.05, 1505, 3.1, 1493.15, { col: rgb(0x9fb7c9) });
      for (let r = 0; r < 3; r++) { B.box(1493, 1.4 + r * 0.55, 1493.15, 1505, 1.45 + r * 0.55, 1493.5, { col: wood }); for (let i = 0; i < 34; i++) B.addGeometry(new THREE.CylinderGeometry(0.05, 0.06, 0.34, 6), new THREE.Matrix4().makeTranslation(1493.3 + i * 0.35, 1.62 + r * 0.55, 1493.32), rgb([0x2a9d8f, 0xe9c46a, 0x8a4b2a, 0xd62828, 0xf4f1ea, 0x355070][(i + r * 2) % 6])); }
      // Billardtisch
      B.box(1493.2, 0.7, 1501, 1496, 0.82, 1502.6, { col: rgb(0x1f6b3a) }); B.box(1493.1, 0.6, 1500.9, 1496.1, 0.86, 1501.0, { col: wood }); B.box(1493.1, 0.6, 1502.6, 1496.1, 0.86, 1502.7, { col: wood }); B.box(1493.1, 0.6, 1500.9, 1493.2, 0.86, 1502.7, { col: wood }); B.box(1496, 0.6, 1500.9, 1496.1, 0.86, 1502.7, { col: wood });
      for (const [x, z] of [[1493.4, 1501.2], [1495.8, 1501.2], [1493.4, 1502.4], [1495.8, 1502.4]]) B.box(x - 0.08, 0, z - 0.08, x + 0.08, 0.7, z + 0.08, { col: wood });
      for (let i = 0; i < 6; i++) B.addGeometry(new THREE.SphereGeometry(0.05, 8, 6), new THREE.Matrix4().makeTranslation(1494 + (i % 3) * 0.5, 0.87, 1501.5 + Math.floor(i / 3) * 0.5), rgb([0xffd23f, 0xd62828, 0x1d3557, 0xf4f1ea, 0x111111, 0x2a9d8f][i]));
      col(1493.1, 1500.9, 1496.1, 1502.7, 0.9);
      // Tische
      for (const [x, z] of [[1502, 1500], [1505.5, 1502.5], [1502, 1504]]) { B.addGeometry(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 14), new THREE.Matrix4().makeTranslation(x, 0.78, z), wood); B.addGeometry(new THREE.CylinderGeometry(0.06, 0.2, 0.76, 8), new THREE.Matrix4().makeTranslation(x, 0.38, z), rgb(0x222222)); for (const a of [0, 2.1, 4.2]) { const sx = x + Math.cos(a) * 0.9, sz = z + Math.sin(a) * 0.9; B.addGeometry(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), new THREE.Matrix4().makeTranslation(sx, 0.5, sz), rgb(0x6d2e2e)); B.addGeometry(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), new THREE.Matrix4().makeTranslation(sx, 0.25, sz), rgb(0x222222)); } col(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0.8); }
      // Dartscheibe & Fässer
      B.addGeometry(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(1508.9, 1.8, 1500), rgb(0xd62828));
      B.addGeometry(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(1508.88, 1.8, 1500), rgb(0xf4f1ea));
      for (const z of [1494, 1495.2]) { B.addGeometry(new THREE.CylinderGeometry(0.45, 0.45, 1, 12), new THREE.Matrix4().makeTranslation(1507.8, 0.5, z), rgb(0x6b4a2f)); }
      col(1507.3, 1493.5, 1508.3, 1495.7, 1);
    });
    for (const x of [1495, 1499, 1503]) this.lamp(R, x, 2.4, 1495.2, [2.4, 1.5, 0.7], 0.2);
    this.lamp(R, 1494.6, 2.2, 1501.8, [1.2, 2.2, 1.2], 0.25);
    this.textPlane(R, 'CERVEZA', '#7cff6b', 1507.5, 2.9, 1493.06, 0, 2.6);
    R.exit = new Marker(1500, 1506.3, 0x7cff6b, { label: 'X', r: 1.0 });
    R.bar = new Marker(1499, 1497.8, 0xffb35c, { label: '🍺', r: 0.9 });
    R.markers = [R.exit, R.bar];
    R.resident = { id: 'barkeeper', x: 1499, z: 1494, yaw: 0, look: () => ({ ...randomLook(), shirt: C(0x222222), sleeve: C(0x222222), hat: null }) };
    R.guests = [[1495.7, 1497.3, Math.PI, 'stand'], [1503.6, 1497.3, Math.PI, 'stand'], [1496.6, 1501.8, -Math.PI / 2, 'stand']];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Wohnhaus (mehrere Türen führen hierher)
  buildHouse() {
    const wood = canvasTex(256, 256, (g, w) => { for (let i = 0; i < 8; i++) { const b = 0.82 + Math.random() * 0.22; g.fillStyle = `rgb(${172 * b},${132 * b},${92 * b})`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(60,40,20,.5)'; g.fillRect(0, i * 32 + 31, w, 1); } }, true);
    wood.repeat.set(4, 3.5);
    const R = this.room('house', 1500, 1650, 16, 13, 3.2, {
      floor: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.5 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf6f2ea, emissive: 0x403c36, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xece4d6, emissive: 0x241f18, roughness: 0.9 }),
    });
    R.name = 'Wohnung'; R.spawn = { x: 1500, z: 1654.6, yaw: Math.PI };
    R.lightCfg = [1500, 2.8, 1650, 0xffe6c4, 22];
    this.furnish(R, (B, col) => {
      // Wohnzimmer
      B.box(1493, 0, 1648, 1497, 0.45, 1649.4, { col: rgb(0x52606d) }); B.box(1493, 0.45, 1648, 1497, 1.0, 1648.35, { col: rgb(0x52606d) });
      col(1493, 1648, 1497, 1649.4, 1);
      B.box(1493.6, 0, 1651, 1496.4, 0.4, 1652, { col: rgb(0x2b2b2b) }); col(1493.6, 1651, 1496.4, 1652, 0.4);
      B.box(1493.2, 0, 1655.9, 1496.8, 0.6, 1656.4, { col: rgb(0x3b2a1e) }); B.box(1493.5, 0.7, 1656.2, 1496.5, 2.3, 1656.3, { col: rgb(0x111111) }); B.box(1493.6, 0.8, 1656.18, 1496.4, 2.2, 1656.2, { col: rgb(0x2a6bb8) });
      B.box(1492.6, 0.005, 1649.8, 1497.4, 0.015, 1653, { col: rgb(0xb5485f) });
      // Küche
      B.box(1502, 0, 1643.6, 1507.6, 0.95, 1644.4, { col: rgb(0xe6e2da) }); B.box(1501.9, 0.95, 1643.5, 1507.7, 1.0, 1644.5, { col: rgb(0x2b2b2b) });
      B.box(1502, 1.6, 1643.55, 1507.6, 2.4, 1643.95, { col: rgb(0xe6e2da) });
      B.box(1507.0, 0, 1644.6, 1507.8, 1.95, 1645.5, { col: rgb(0xc9ced6) });
      col(1501.9, 1643.5, 1507.8, 1644.5, 1); col(1507, 1644.6, 1507.8, 1645.5, 1.95);
      B.box(1503, 0, 1647, 1505.4, 0.76, 1648.2, { col: rgb(0x8a6a48) }); col(1503, 1647, 1505.4, 1648.2, 0.78);
      for (const [x, z] of [[1503.5, 1646.6], [1504.9, 1646.6], [1503.5, 1648.6], [1504.9, 1648.6]]) B.box(x - 0.2, 0, z - 0.2, x + 0.2, 0.45, z + 0.2, { col: rgb(0x6b4a2f) });
      // Schlafbereich
      B.box(1503.2, 0, 1652.6, 1506.4, 0.45, 1656, { col: rgb(0x3b2a1e) }); B.box(1503.3, 0.45, 1652.7, 1506.3, 0.62, 1655.9, { col: rgb(0xf2f2f2) }); B.box(1503.3, 0.62, 1652.7, 1506.3, 0.72, 1654.6, { col: rgb(0x7a9e7e) });
      B.box(1503.2, 0, 1656, 1506.4, 1.2, 1656.2, { col: rgb(0x3b2a1e) });
      col(1503.2, 1652.6, 1506.4, 1656.2, 0.75);
      B.box(1507, 0, 1653, 1507.8, 2.0, 1655, { col: rgb(0xd9cdb6) }); col(1507, 1653, 1507.8, 1655, 2);
      // Trennwand
      B.box(1500.4, 0, 1651.4, 1500.6, 3.2, 1656.4, { col: rgb(0xece4d6) }); col(1500.4, 1651.4, 1500.6, 1656.4, 3.2);
      // Pflanze, Regal
      B.box(1492.3, 0, 1644, 1492.8, 1.8, 1646.4, { col: rgb(0x8a6a48) });
      for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) B.box(1492.8, 0.25 + r * 0.42, 1644.1 + i * 0.32, 1492.95, 0.55 + r * 0.42, 1644.36 + i * 0.32, { col: rgb([0xc0392b, 0x2a9d8f, 0xe9c46a, 0x355070, 0xf4f1ea][(i + r) % 5]) });
    });
    const view = canvasTex(512, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fb2e8'); gr.addColorStop(0.65, '#d6ebfa'); gr.addColorStop(0.66, '#5f8f4a'); gr.addColorStop(1, '#3f6f34'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#7d8a6a'; g.beginPath(); g.moveTo(0, h * 0.66); g.lineTo(120, h * 0.3); g.lineTo(260, h * 0.6); g.lineTo(380, h * 0.25); g.lineTo(512, h * 0.66); g.fill(); });
    for (const x of [1495, 1504.5]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: view })); win.position.set(x, 1.9, 1643.55); R.g.add(win); }
    this.lamp(R, 1495, 2.6, 1650.5, [2.3, 1.9, 1.3], 0.3); this.lamp(R, 1504.5, 2.6, 1647.5, [2.3, 1.9, 1.3], 0.25);
    R.exit = new Marker(1500, 1656, 0x7cff6b, { label: 'X', r: 1.0 });
    R.bed = new Marker(1502.3, 1654.2, 0x7cff6b, { label: '💤', r: 0.8 });
    R.fridge = new Marker(1506.2, 1645.6, 0x19e6ff, { label: '🥪', r: 0.7 });
    R.markers = [R.exit, R.bed, R.fridge];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Waffenladen
  buildGunshop() {
    const R = this.room('gunshop', 1500, 1800, 16, 12, 3.4, {
      floor: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.7 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x6b6f5a, emissive: 0x14150f, roughness: 0.9 }),
    });
    R.name = 'Waffenladen'; R.spawn = { x: 1500, z: 1803.8, yaw: Math.PI };
    R.lightCfg = [1500, 3, 1800, 0xfff0e0, 20];
    const steel = rgb(0x2b2d30), woodc = rgb(0x6b4a2f);
    this.furnish(R, (B, col) => {
      // Glastheke
      B.box(1493, 0, 1795.4, 1505, 0.75, 1796.6, { col: steel }); B.box(1493, 0.75, 1795.4, 1505, 1.05, 1796.6, { col: rgb(0x9fd6ff) }); B.box(1492.9, 1.05, 1795.3, 1505.1, 1.1, 1796.7, { col: steel });
      col(1492.9, 1795.3, 1505.1, 1796.7, 1.1);
      for (let i = 0; i < 9; i++) { B.box(1493.6 + i * 1.25, 0.8, 1795.8, 1494.2 + i * 1.25, 0.86, 1796.0, { col: rgb(0x111111) }); B.box(1493.7 + i * 1.25, 0.8, 1796.0, 1493.85 + i * 1.25, 0.86, 1796.25, { col: rgb(0x111111) }); }
      // Wandhalter mit Gewehren
      B.box(1493, 1.2, 1794.05, 1505, 2.9, 1794.12, { col: woodc });
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) { const x = 1493.6 + i * 2.3, y = 1.45 + r * 0.5; B.box(x, y, 1794.12, x + 1.5, y + 0.07, 1794.2, { col: rgb(0x1b1b1b) }); B.box(x - 0.35, y - 0.06, 1794.12, x + 0.1, y + 0.1, 1794.2, { col: rgb(r % 2 ? 0x6b4a2f : 0x2b2b2b) }); B.box(x + 0.5, y - 0.2, 1794.12, x + 0.62, y, 1794.2, { col: rgb(0x1b1b1b) }); }
      // Munitionsregale
      for (const x of [1492.3, 1507.2]) { B.box(x, 0, 1797.5, x + 0.5, 2.2, 1803.5, { col: steel }); for (let r = 0; r < 4; r++) for (let i = 0; i < 10; i++) B.box(x + (x < 1500 ? 0.5 : -0.12), 0.25 + r * 0.5, 1797.7 + i * 0.58, x + (x < 1500 ? 0.62 : 0), 0.55 + r * 0.5, 1798.15 + i * 0.58, { col: rgb([0xb5651d, 0x3a5a40, 0xc0392b, 0xe9c46a][(i + r) % 4]) }); col(x, 1797.5, x + 0.5, 1803.5, 2.2); }
      // Zielscheiben & Schaufensterpuppe mit Weste
      for (const x of [1496, 1504]) { B.addGeometry(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 2.0, 1805.9), rgb(0xf4f1ea)); B.addGeometry(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 2.0, 1805.88), rgb(0xd62828)); }
      B.addGeometry(new THREE.CylinderGeometry(0.22, 0.18, 0.7, 10), new THREE.Matrix4().makeTranslation(1506, 1.25, 1797), rgb(0x1d3557)); B.addGeometry(new THREE.SphereGeometry(0.13, 10, 8), new THREE.Matrix4().makeTranslation(1506, 1.78, 1797), rgb(0xd9d9d9)); B.box(1505.97, 0, 1796.97, 1506.03, 0.9, 1797.03, { col: rgb(0x888888) });
    });
    this.box(R, 1500, 3.35, 1798, 4, 0.05, 0.4, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.25, 1.15) }));
    this.box(R, 1500, 3.35, 1802, 4, 0.05, 0.4, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.25, 1.15) }));
    this.textPlane(R, 'WAFFEN & MUNITION', '#ff7b39', 1500, 3.1, 1794.14, 0, 5);
    R.exit = new Marker(1500, 1805.3, 0x7cff6b, { label: 'X', r: 1.0 });
    R.counter = new Marker(1499, 1798, 0xff7b39, { label: 'W', r: 0.9 });
    R.markers = [R.exit, R.counter];
    R.resident = { id: 'gunclerk', x: 1499, z: 1794.8, yaw: 0, look: () => ({ ...randomLook(), shirt: C(0x3a5a40), sleeve: C(0x3a5a40), hat: C(0x222222) }) };
    for (const m of R.markers) m.group.visible = false;
  }
  dinerMenu() {
    const P = G.player;
    G.openMenu('DINER', '<div style="opacity:.85">Hausgemacht, heiß und fettig.</div>', [
      ['Cheeseburger – $9', () => { if (!this.pay(9)) return; P.health = Math.min(100, P.health + 40); G.hud.toast('🍔 +40 Gesundheit'); }],
      ['Pommes – $4', () => { if (!this.pay(4)) return; P.health = Math.min(100, P.health + 15); G.hud.toast('🍟 +15 Gesundheit'); }],
      ['Milchshake – $5', () => { if (!this.pay(5)) return; P.health = Math.min(100, P.health + 20); P.boostT = Math.max(P.boostT || 0, 20); G.hud.toast('🥤 +20 Gesundheit, Zuckerschub!'); }],
      ['Tagesgericht – $14', () => { if (!this.pay(14)) return; P.health = 100; G.hud.toast('🍽️ Volle Gesundheit'); }],
    ]);
  }
  houseBed() {
    G.openMenu('BETT', 'Eine Runde schlafen?', [
      ['Schlafen (8 Stunden)', () => { G.hud.fadeIn(); G.timeOfDay = (G.timeOfDay + 8) % 24; G.player.health = 100; G.hud.toast('💤 Ausgeschlafen – volle Gesundheit'); }],
      ['Spiel speichern', () => { if (G.missions.active && !G.missions.active.side) G.hud.toast('Während eines Auftrags kann nicht gespeichert werden.'); else { G.save.write(); G.hud.toast('Gespeichert'); } }],
    ]);
  }

  // ------------------------------------------------------------ Hafenbüro
  buildOffice() {
    const R = this.room('office', 1500, 1200, 16, 12, 3.4, {
      floor: new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.8 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xdedede, emissive: 0x303030, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xc9d3dc, emissive: 0x161a1e, roughness: 0.9 }),
    });
    R.name = 'Hafenbüro'; R.spawn = { x: 1500, z: 1203.8, yaw: Math.PI };
    R.lightCfg = [1500, 3.1, 1200, 0xeef4ff, 22];
    this.furnish(R, (B, col) => {
      for (const [x, z] of [[1496, 1196], [1504, 1196]]) {
        B.box(x - 1.4, 0, z - 0.7, x + 1.4, 0.78, z + 0.7, { col: rgb(0x8a8f99) });
        B.box(x - 0.4, 0.78, z - 0.5, x + 0.4, 1.25, z - 0.45, { col: rgb(0x111111) });
        B.box(x - 1.2, 0.78, z + 0.1, x - 0.4, 0.8, z + 0.5, { col: rgb(0xf4f4f4) });
        col(x - 1.4, z - 0.7, x + 1.4, z + 0.7, 0.8);
      }
      // Seekarte & Aktenschränke
      B.box(1493, 1.2, 1194.05, 1499, 2.8, 1194.1, { col: rgb(0x7fb7d9) });
      for (let i = 0; i < 6; i++) B.box(1493.3 + i, 1.4 + (i % 2) * 0.5, 1194.1, 1493.9 + i, 1.8 + (i % 2) * 0.5, 1194.12, { col: rgb(0xe9d8a6) });
      for (let i = 0; i < 4; i++) { B.box(1506.5, 0, 1197 + i * 1.1, 1507.9, 1.6, 1197.9 + i * 1.1, { col: rgb(0x6b705c) }); }
      col(1506.5, 1197, 1507.9, 1201.3, 1.6);
      // Rettungsring, Kaffeeautomat
      B.addGeometry(new THREE.TorusGeometry(0.4, 0.1, 8, 18), new THREE.Matrix4().makeTranslation(1502, 2.1, 1194.12), rgb(0xff5a3c));
      B.box(1491.2, 0, 1201, 1492, 1.7, 1201.8, { col: rgb(0x2b2b2b) });
    });
    const view = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#8fc4e8'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d3557'; g.fillRect(40, h * 0.5, 420, h * 0.3); g.fillStyle = '#f2b705'; for (let i = 0; i < 3; i++) g.fillRect(80 + i * 140, 20, 10, h * 0.5); g.fillStyle = '#2b6f9a'; g.fillRect(0, h * 0.8, w, h * 0.2); });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.8), new THREE.MeshBasicMaterial({ map: view }));
    win.position.set(1504, 1.9, 1194.05); R.g.add(win);
    this.box(R, 1500, 3.35, 1198, 3, 0.05, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.25) }));
    this.box(R, 1500, 3.35, 1202, 3, 0.05, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.2, 1.25) }));
    R.exit = new Marker(1500, 1205.6, 0x7cff6b, { label: 'X', r: 1.0 });
    R.markers = [R.exit];
    R.resident = { id: 'brandt', x: 1504, z: 1194.9, yaw: 0, look: () => ({ ...randomLook(), skin: C(0xf1c27d), shirt: C(0x1d3557), sleeve: C(0x1d3557), pants: C(0x2b2d42), legs: C(0x2b2d42), hair: C(0xe6e6e6), hat: C(0x1d3557), bald: false, scale: 1.02 }) };
    R.guests = [[1496, 1196.9, Math.PI, 'sit']];
    for (const m of R.markers) m.group.visible = false;
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


  // ------------------------------------------------------------ Wohnung (Startort & Speicherpunkt)
  buildHome() {
    const wood = canvasTex(256, 256, (g, w) => {
      for (let i = 0; i < 8; i++) { const b = 0.8 + Math.random() * 0.25; g.fillStyle = `rgb(${150 * b},${108 * b},${72 * b})`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(40,25,15,.6)'; g.fillRect(0, i * 32 + 31, w, 1); }
    }, true);
    wood.repeat.set(4, 4);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf3efe8, emissive: 0x4a463e, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xe9e1d6, emissive: 0x2a2620, roughness: 0.9 }),
    };
    const R = this.room('home', 1500, 300, 16, 14, 3.4, mats);
    R.name = 'Deine Wohnung';
    R.spawn = { x: 1500, z: 304.5, yaw: Math.PI };
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
    // Bett (Speichern)
    this.box(R, 1504.5, 0.25, 295.2, 3.2, 0.5, 4.2, M(0x3b2a1e), true);
    this.box(R, 1504.5, 0.58, 295.4, 3.0, 0.18, 3.8, M(0xf2f2f2));
    this.box(R, 1504.5, 0.7, 296.4, 3.05, 0.1, 2.2, M(0x2a6bb8));
    this.box(R, 1504.5, 0.75, 293.8, 2.4, 0.18, 0.7, M(0xffffff));
    this.box(R, 1504.5, 1.0, 293.1, 3.2, 1.2, 0.15, M(0x3b2a1e));
    // Sofa, Tisch, Teppich, TV
    this.box(R, 1495, 0.25, 297, 4, 0.5, 1.6, M(0x4a5568), true);
    this.box(R, 1495, 0.75, 296.35, 4, 0.6, 0.3, M(0x4a5568));
    this.box(R, 1495, 0.22, 299.6, 2.2, 0.44, 1.0, M(0x1f1f1f, { metalness: 0.3 }), true);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(5, 4).rotateX(-Math.PI / 2), M(0xb5485f, { roughness: 1 }));
    rug.position.set(1495, 0.02, 299.3); R.g.add(rug);
    this.box(R, 1495, 0.35, 306.6, 3.4, 0.7, 0.6, M(0x222222), true);
    this.tv = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.7), new THREE.MeshBasicMaterial({ color: 0x19e6ff }));
    this.tv.position.set(1495, 1.75, 306.78); this.tv.rotation.y = Math.PI; R.g.add(this.tv);
    this.box(R, 1495, 1.75, 306.85, 3.15, 1.85, 0.08, M(0x111111));
    // Küche
    this.box(R, 1493.2, 0.5, 293.6, 1.2, 1.0, 1.4, M(0xdedede), true);
    this.box(R, 1495.6, 0.5, 293.6, 3.6, 1.0, 1.4, M(0xdedede), true);
    this.box(R, 1495, 1.02, 293.6, 4.9, 0.05, 1.45, M(0x2b2b2b, { metalness: 0.4, roughness: 0.3 }));
    this.box(R, 1492.6, 1.0, 293.3, 0.9, 2.0, 0.9, M(0xc9ced6, { metalness: 0.6, roughness: 0.3 }), true);
    // Fenster mit Stadtblick
    const view = canvasTex(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a1145'); gr.addColorStop(0.6, '#b0246b'); gr.addColorStop(1, '#ff8a50');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) { const bw = 14 + Math.random() * 30, bh = 40 + Math.random() * 150, x = Math.random() * w; g.fillStyle = '#0d0618'; g.fillRect(x, h - bh, bw, bh);
        for (let k = 0; k < 20; k++) if (Math.random() < 0.4) { g.fillStyle = Math.random() < 0.5 ? '#ffd9a0' : '#19e6ff'; g.fillRect(x + 2 + Math.random() * (bw - 6), h - bh + 4 + Math.random() * (bh - 8), 3, 4); } }
    });
    for (const x of [1494, 1500]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshBasicMaterial({ map: view }));
      win.position.set(x + 3, 1.9, 293.02); R.g.add(win);
      this.box(R, x + 3, 1.9, 293.0, 3.8, 2.0, 0.05, M(0xffffff));
      win.position.z = 293.05;
    }
    // Pflanze & Lampe
    this.box(R, 1507.2, 0.3, 306.2, 0.6, 0.6, 0.6, M(0x333333));
    const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), M(0x2f7d32, { flatShading: true })); pl.position.set(1507.2, 1.1, 306.2); R.g.add(pl);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 1.2) }));
    lamp.position.set(1500, 3.0, 300); R.g.add(lamp);
    R.exit = new Marker(1500, 306.4, 0x7cff6b, { label: 'X', r: 1.0 });
    R.bed = new Marker(1501.9, 295.6, 0x7cff6b, { label: 'S', r: 0.9 });
    R.markers = [R.exit, R.bed];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Samis 24/7 (Laden mit Spielautomat)
  buildShop() {
    const tile = canvasTex(256, 256, (g, w) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#f1efe9' : '#d9d5cc'; g.fillRect(i * 64, j * 64, 64, 64); }
      g.strokeStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
    }, true);
    tile.repeat.set(5, 3.5);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.35 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xd8d8d2, emissive: 0x1e1e1c, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xc9bfae, emissive: 0x0e0c0a, roughness: 0.9 }),
    };
    const R = this.room('shop', 1500, 600, 20, 14, 3.8, mats);
    R.name = 'Samis 24/7';
    R.spawn = { x: 1500, z: 604.6, yaw: Math.PI };
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    const B = new GeoBuilder(true);
    const goods = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x8338ec, 0xffffff, 0xfb5607, 0x3a86ff];
    // Regale (2 Gänge)
    for (const z of [597.4, 601.4]) {
      B.box(1493.5, 0, z - 0.45, 1501.5, 1.8, z + 0.45, { col: rgb(0xf4f4f4) });
      for (let lvl = 0; lvl < 4; lvl++) {
        const y = 0.3 + lvl * 0.42;
        B.box(1493.4, y - 0.03, z - 0.5, 1501.6, y, z + 0.5, { col: rgb(0xb8bec7) });
        for (let i = 0; i < 26; i++) for (const sd of [-1, 1]) {
          const x = 1493.6 + i * 0.3, h = 0.18 + ((i * 7 + lvl * 3) % 5) * 0.035;
          B.box(x, y, z + sd * 0.48 - (sd > 0 ? 0.22 : 0), x + 0.24, y + h, z + sd * 0.48 + (sd < 0 ? 0.22 : 0), { col: rgb(goods[(i + lvl * 3 + (sd > 0 ? 4 : 0)) % goods.length]) });
        }
      }
      G.world.addBox(1493.5, z - 0.5, 1501.5, z + 0.5, -1, 1.8, 'bld');
    }
    // Kühlregale an der Westwand
    B.box(1490, 0, 594, 1491.2, 2.3, 606, { col: rgb(0x2b2f36) });
    for (let k = 0; k < 6; k++) for (let lvl = 0; lvl < 4; lvl++) for (let i = 0; i < 5; i++)
      B.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6), new THREE.Matrix4().makeTranslation(1491.12, 0.45 + lvl * 0.48, 594.5 + k * 2 + i * 0.36), rgb(goods[(k + lvl + i) % goods.length]));
    G.world.addBox(1490, 594, 1491.3, 606, -1, 2.3, 'bld');
    const fridgeGlow = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.1), transparent: true, opacity: 0.22 }));
    fridgeGlow.rotation.y = Math.PI / 2; fridgeGlow.position.set(1491.32, 1.15, 600); R.g.add(fridgeGlow);
    // Theke mit Kasse, Kaffeemaschine, Losen
    B.box(1503, 0, 594.4, 1509.4, 1.05, 595.7, { col: rgb(0x3a2a20) });
    B.box(1502.9, 1.05, 594.3, 1509.5, 1.12, 595.8, { col: rgb(0xdedede) });
    B.box(1507.4, 1.12, 594.6, 1508.2, 1.45, 595.2, { col: rgb(0x222222) });
    B.box(1503.4, 1.12, 594.6, 1504.0, 1.6, 595.1, { col: rgb(0x8a8f99) });
    for (let i = 0; i < 6; i++) B.box(1504.4 + i * 0.42, 1.12, 595.2, 1504.74 + i * 0.42, 1.55, 595.24, { col: rgb([0xffd23f, 0xff2e88, 0x19e6ff][i % 3]) });
    G.world.addBox(1503, 594.3, 1509.5, 595.8, -1, 1.12, 'bld');
    // Zigarettenregal hinter der Theke
    B.box(1503.5, 1.3, 593.05, 1509, 2.9, 593.35, { col: rgb(0x2b2b2b) });
    for (let r = 0; r < 4; r++) for (let i = 0; i < 18; i++) B.box(1503.7 + i * 0.29, 1.4 + r * 0.38, 593.35, 1503.93 + i * 0.29, 1.68 + r * 0.38, 593.45, { col: rgb([0xffffff, 0xd62828, 0x1d3557, 0xffd166, 0x2a9d8f][(i + r) % 5]) });
    // Zeitschriftenständer, Geldautomat, Pflanze, Fußmatte
    B.box(1497, 0, 605.6, 1499.2, 1.3, 606.3, { col: rgb(0x9aa1ab) });
    for (let i = 0; i < 6; i++) B.box(1497.1 + i * 0.35, 0.5, 605.55, 1497.4 + i * 0.35, 1.1, 605.6, { col: rgb(goods[i]) });
    B.box(1508.6, 0, 606.2, 1509.6, 1.9, 606.9, { col: rgb(0x2b6f77) });
    B.box(1508.75, 1.15, 606.15, 1509.45, 1.6, 606.2, { col: rgb(0x0b1622) });
    B.box(1499, 0.005, 605.9, 1501, 0.015, 606.9, { col: rgb(0x8a1030) });
    const shopMesh = new THREE.Mesh(B.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    R.g.add(shopMesh);
    // Deckenleuchten
    for (const x of [1494, 1500, 1506]) for (const z of [597, 602]) this.box(R, x, 3.75, z, 2.4, 0.06, 0.5, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.1, 1.05) }));
    // Leuchtschriften & Plakate
    const open = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), new THREE.MeshBasicMaterial({ map: textTex('OPEN 24/7', '#ff2e88', 512, 128, 80), transparent: true, depthWrite: false }));
    open.position.set(1495, 2.9, 593.02); R.g.add(open);
    const sami = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshBasicMaterial({ map: textTex("SAMI'S", '#ffd23f', 512, 128, 84), transparent: true, depthWrite: false }));
    sami.position.set(1506.2, 3.25, 593.02); R.g.add(sami);
    const poster = (txt, col, x, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), new THREE.MeshBasicMaterial({ map: canvasTex(256, 352, (g) => { const gr = g.createLinearGradient(0, 0, 0, 352); gr.addColorStop(0, col); gr.addColorStop(1, '#120a1e'); g.fillStyle = gr; g.fillRect(0, 0, 256, 352); g.fillStyle = '#fff'; g.font = '44px "Russo One", sans-serif'; g.textAlign = 'center'; txt.split(' ').forEach((t, i) => g.fillText(t, 128, 130 + i * 56)); }) })); p.position.set(x, 1.9, z); p.rotation.y = ry; R.g.add(p); };
    poster('LOTTO JACKPOT', '#ff2e88', 1509.95, 599, -Math.PI / 2);
    poster('COLA ICE COLD', '#d62828', 1509.95, 601.6, -Math.PI / 2);
    // Spielautomat
    const cab = new THREE.Group();
    const dark = M(0x15101f, { metalness: 0.4, roughness: 0.3 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); cab.add(m); return m; };
    add(new THREE.BoxGeometry(0.95, 1.1, 0.75), dark, 0, 0.55, 0);
    add(new THREE.BoxGeometry(0.95, 0.9, 0.55), dark, 0, 1.55, -0.1);
    this.slotScreen = add(new THREE.PlaneGeometry(0.75, 0.42), new THREE.MeshBasicMaterial({ map: textTex('7 7 7', '#ffd23f', 256, 128, 70) }), 0, 1.55, 0.18);
    this.slotTop = add(new THREE.BoxGeometry(0.95, 0.28, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.3, 0.9) }), 0, 2.16, -0.1);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), M(0xc9ced6, { metalness: 0.9 }), 0.55, 1.35, 0);
    add(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0.55, 1.65, 0);
    cab.position.set(1509.2, 0, 604.6); cab.rotation.y = -Math.PI / 2; R.g.add(cab);
    G.world.addBox(1508.75, 604.15, 1509.65, 605.05, -1, 2.3, 'bld');
    R.exit = new Marker(1500, 606.3, 0x7cff6b, { label: 'X', r: 1.0 });
    R.counter = new Marker(1506, 596.9, 0xffd23f, { label: '24', r: 1.0 });
    R.slot = new Marker(1507.9, 604.6, 0xff2e88, { label: '7', r: 0.9 });
    R.markers = [R.exit, R.counter, R.slot];
    for (const m of R.markers) m.group.visible = false;
  }

  // ------------------------------------------------------------ Autohaus Solera Motors
  buildDealer() {
    const tiles = canvasTex(256, 256, (g, w) => { g.fillStyle = '#16181d'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, w - 2); }, true);
    tiles.repeat.set(10, 8);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.4 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf4f4f6, emissive: 0x3c3c40, roughness: 0.7 }),
    };
    const R = this.room('dealer', 1500, 450, 40, 30, 9, mats);
    R.name = 'Solera Motors';
    R.spawn = { x: 1500, z: 462, yaw: Math.PI };
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, ...o });
    // Drehteller
    this.turn = new THREE.Group();
    this.turn.position.set(1500, 0, 446);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.25, 48), M(0x2b2f36, { metalness: 0.8, roughness: 0.2 }));
    disc.position.y = 0.125; this.turn.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.05, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 1.2) }));
    ring.position.y = 0.26; R.g.add(this.turn); R.g.add(ring); ring.position.set(1500, 0.26, 446);
    G.world.addCircle(1500, 446, 4.3, 0.3, 'pillar');
    G.world.rooms.unshift({ x0: 1495.8, x1: 1504.2, z0: 441.8, z1: 450.2, y: 0.25 });
    // Ausstellungsautos auf Podesten
    const show = [['vortex', 0xff7b00, 1486, 440, 0.8], ['brutus', 0xd00000, 1514, 440, -0.8], ['atlas', 0x222222, 1486, 455, 2.3], ['zephyra', 0x00b4d8, 1514, 455, -2.3]];
    for (const [key, col, x, z, h] of show) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 6.4), M(0xe9e9ee, { metalness: 0.2 }));
      pod.position.set(x, 0.15, z); R.g.add(pod);
      const c = buildCar(key, col); addWheels(c.group, key);
      c.group.position.set(x, 0.3, z); c.group.rotation.y = h; R.g.add(c.group);
      G.world.addBox(x - 3.2, z - 3.2, x + 3.2, z + 3.2, -1, 0.3, 'bld');
      G.world.addCircle(x, z, 2.3, 2, 'pillar');
    }
    // Rückwand-Schriftzug & LED-Bänder
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(16, 3), new THREE.MeshBasicMaterial({ map: textTex('SOLERA MOTORS', '#ff2e88', 1024, 192, 120), transparent: true, depthWrite: false }));
    logo.position.set(1500, 6.2, 435.05); R.g.add(logo);
    const led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.0, 2.4) });
    this.box(R, 1500, 8.7, 435.1, 40, 0.08, 0.08, led); this.box(R, 1500, 8.7, 464.9, 40, 0.08, 0.08, led);
    this.box(R, 1480.1, 8.7, 450, 0.08, 0.08, 30, led); this.box(R, 1519.9, 8.7, 450, 0.08, 0.08, 30, led);
    for (const x of [1490, 1500, 1510]) for (const z of [440, 450, 460]) this.box(R, x, 8.95, z, 4, 0.05, 1.2, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.45) }));
    // Beratungstisch & Pflanzen
    this.box(R, 1508, 0.5, 461, 3.2, 1.0, 1.2, M(0xffffff), true);
    this.box(R, 1508, 1.02, 461, 3.3, 0.05, 1.3, M(0x111111, { metalness: 0.6 }));
    const leaf = M(0x2f7d32, { flatShading: true });
    for (const [x, z] of [[1482, 437], [1518, 437], [1482, 463], [1518, 463]]) {
      this.box(R, x, 0.45, z, 0.9, 0.9, 0.9, M(0x222222));
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), leaf); l.position.set(x, 1.6, z); R.g.add(l);
    }
    R.exit = new Marker(1500, 463.6, 0x7cff6b, { label: 'X', r: 1.1 });
    R.buy = new Marker(1500, 452.6, 0xff2e88, { label: 'A', r: 1.2 });
    R.markers = [R.exit, R.buy];
    for (const m of R.markers) m.group.visible = false;
    this.setPreview('zephyra', 0xe63946);
  }
  setPreview(key, color) {
    if (this.previewKey === key && this.previewCol === color) return;
    if (this.preview) this.turn.remove(this.preview);
    const c = buildCar(key, color); addWheels(c.group, key);
    c.group.position.y = 0.25;
    this.turn.add(c.group);
    this.preview = c.group; this.previewKey = key; this.previewCol = color;
  }
  // Ausstellungsautos vor dem Autohaus
  buildDealerFront() {
    const g = new THREE.Group();
    const plat = new THREE.MeshStandardMaterial({ color: 0xe9e9ee, roughness: 0.25, metalness: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 1.2) });
    const show = [['vortex', 0xf8f9fa, 145, 15, 0.5], ['zephyra', 0xffb703, 155.5, 17, 0.2], ['brutus', 0x111111, 168.5, 17, -0.2], ['coyote', 0xbc6c25, 179, 15, -0.5]];
    for (const [key, col, x, z, h] of show) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.3, 0.22, 40), plat); p.position.set(x, 0.11, z); p.receiveShadow = true; g.add(p);
      const r = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.04, 6, 48).rotateX(Math.PI / 2), glow); r.position.set(x, 0.23, z); g.add(r);
      const c = buildCar(key, col); addWheels(c.group, key);
      c.group.position.set(x, 0.22, z); c.group.rotation.y = h;
      c.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(c.group);
      G.world.addCircle(x, z, 2.6, 2, 'pillar');
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 3), new THREE.MeshBasicMaterial({ map: textTex('SOLERA MOTORS', '#ff2e88', 1024, 160, 110), transparent: true, depthWrite: false }));
    sign.position.set(162, 15.2, 3.62); g.add(sign);
    this.scene.add(g);
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
    const marble = canvasTex(512, 512, (g, w) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#efe9de' : '#2a2622'; g.fillRect(i * 128, j * 128, 128, 128); }
      for (let k = 0; k < 260; k++) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '160,150,140' : '255,255,255'},${Math.random() * 0.18})`; g.lineWidth = Math.random() * 2; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * w); g.bezierCurveTo(Math.random() * w, Math.random() * w, Math.random() * w, Math.random() * w, Math.random() * w, Math.random() * w); g.stroke(); }
      g.strokeStyle = 'rgba(200,170,90,0.5)'; g.lineWidth = 3; for (let k = 0; k <= 512; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
    }, true);
    marble.repeat.set(6, 7);
    const mats = {
      floor: new THREE.MeshStandardMaterial({ map: marble, roughness: 0.12, metalness: 0.1, envMapIntensity: 1.2 }),
      ceil: new THREE.MeshStandardMaterial({ color: 0xf2ece0, emissive: 0x4a4438, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xe6dccb, emissive: 0x231e18, roughness: 0.75 }),
    };
    const R = this.room('bank', 1500, 150, 30, 36, 8, mats);
    R.name = 'Solera Bank';
    R.spawn = { x: 1500, z: 164.5, yaw: Math.PI };
    const gold = rgb(0xc9a14a), wood = rgb(0x4a2c18), dark = rgb(0x1b1b1e), cream = rgb(0xf3eee4);
    this.furnish(R, (B, col) => {
      // Holzvertäfelung & Goldleisten an den Wänden
      for (const [x0, z0, x1, z1] of [[1485, 132, 1485.3, 168], [1514.7, 132, 1515, 168], [1485, 167.7, 1515, 168]]) { B.box(x0, 0, z0, x1, 2.2, z1, { col: wood }); B.box(x0, 2.2, z0, x1, 2.32, z1, { col: gold }); B.box(x0, 7.4, z0, x1, 7.6, z1, { col: gold }); }
      // Pilaster
      for (let z = 136; z <= 166; z += 6) for (const x of [1485.3, 1514.2]) B.box(x, 0, z - 0.4, x + 0.5, 8, z + 0.4, { col: cream });
      // Säulen in der Halle
      for (const [x, z] of [[1491, 153], [1509, 153], [1491, 161], [1509, 161]]) {
        B.addGeometry(new THREE.CylinderGeometry(0.55, 0.62, 7.4, 20), new THREE.Matrix4().makeTranslation(x, 3.7, z), cream);
        B.box(x - 0.8, 0, z - 0.8, x + 0.8, 0.35, z + 0.8, { col: cream }); B.box(x - 0.8, 7.4, z - 0.8, x + 0.8, 8, z + 0.8, { col: cream });
        B.addGeometry(new THREE.TorusGeometry(0.6, 0.06, 6, 20).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0.4, z), gold);
        col(x - 0.62, z - 0.62, x + 0.62, z + 0.62, 8);
      }
      // Schalter mit Panzerglas
      B.box(1486, 0, 145.4, 1509.2, 1.15, 146.4, { col: wood }); B.box(1485.9, 1.15, 145.3, 1509.3, 1.22, 146.5, { col: dark });
      B.box(1486, 0.15, 146.4, 1509.2, 0.3, 146.45, { col: gold });
      col(1486, 145.4, 1509.2, 146.4, 1.2);
      for (let x = 1486; x <= 1509; x += 4.6) { B.box(x - 0.05, 1.22, 145.8, x + 0.05, 2.9, 145.9, { col: gold }); }
      B.box(1486, 2.85, 145.75, 1509.2, 2.95, 145.95, { col: gold });
      for (let k = 0; k < 5; k++) B.box(1488.3 + k * 4.6 - 0.6, 1.22, 145.5, 1488.3 + k * 4.6 + 0.6, 1.24, 146.2, { col: rgb(0x2a6f4a) });
      // Schreibtische & Schließfächer hinter dem Schalter
      for (const x of [1489, 1495, 1505]) { B.box(x - 1.2, 0, 141.5, x + 1.2, 0.78, 142.5, { col: wood }); B.box(x - 0.35, 0.78, 141.7, x + 0.35, 1.2, 141.75, { col: dark }); col(x - 1.2, 141.5, x + 1.2, 142.5, 0.8); }
      for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) B.box(1485.4, 0.3 + r * 0.55, 139.5 + c * 0.66, 1485.6, 0.8 + r * 0.55, 140.1 + c * 0.66, { col: rgb(0xb8a070) });
      // Tresorwand mit Öffnung
      B.box(1485, 0, 137.5, 1497.4, 8, 138.5, { col: rgb(0x8f959e) }); B.box(1502.6, 0, 137.5, 1515, 8, 138.5, { col: rgb(0x8f959e) }); B.box(1497.4, 5, 137.5, 1502.6, 8, 138.5, { col: rgb(0x8f959e) });
      col(1485, 137.5, 1497.4, 138.5, 8); col(1502.6, 137.5, 1515, 138.5, 8);
      B.addGeometry(new THREE.TorusGeometry(2.75, 0.3, 10, 40), new THREE.Matrix4().makeTranslation(1500, 2.6, 138.55), rgb(0xd0d4da));
      // Zahlenfeld am Tresor
      B.box(1503.4, 1.3, 138.5, 1504.2, 2.3, 138.6, { col: dark }); B.box(1503.5, 1.9, 138.6, 1504.1, 2.2, 138.62, { col: rgb(0x2bff8a) });
      // Tresorraum: Goldbarren & Geldpaletten
      for (const [x, z] of [[1489, 134], [1493, 134], [1507, 134], [1511, 134]]) {
        B.box(x - 1.2, 0, z - 1, x + 1.2, 0.15, z + 1, { col: rgb(0x6b4f2a) });
        for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 2 + (a + b) % 2; c++) B.box(x - 1 + b * 0.5, 0.15 + c * 0.22, z - 0.8 + a * 0.55, x - 0.6 + b * 0.5, 0.35 + c * 0.22, z - 0.4 + a * 0.55, { col: x < 1500 ? rgb(0x3f7a3f) : rgb(0xe6b422) });
      }
      for (let k = 0; k < 4; k++) B.box(1486 + k * 7.5, 0, 132.2, 1490 + k * 7.5, 2.4, 132.8, { col: rgb(0x6b7078) });
      // Kordel-Absperrungen, Bänke, Infotheke, Geldautomaten
      for (let k = 0; k < 6; k++) { const x = 1493 + k * 2.8; B.addGeometry(new THREE.CylinderGeometry(0.06, 0.08, 1, 8), new THREE.Matrix4().makeTranslation(x, 0.5, 150), gold); B.addGeometry(new THREE.SphereGeometry(0.1, 8, 6), new THREE.Matrix4().makeTranslation(x, 1.02, 150), gold); if (k < 5) B.box(x, 0.85, 149.97, x + 2.8, 0.9, 150.03, { col: rgb(0x8a1030) }); }
      for (const x of [1496, 1504]) { B.box(x - 1.6, 0, 158.6, x + 1.6, 0.48, 159.4, { col: rgb(0x3a2a20) }); col(x - 1.6, 158.6, x + 1.6, 159.4, 0.5); }
      B.box(1511, 0, 158, 1513.5, 1.05, 160.5, { col: wood }); col(1511, 158, 1513.5, 160.5, 1.05);
      for (let k = 0; k < 3; k++) { const z = 152 + k * 1.6; B.box(1514.1, 0, z, 1514.7, 1.9, z + 1.2, { col: rgb(0x26303a) }); B.box(1514.05, 1.1, z + 0.15, 1514.1, 1.6, z + 1.05, { col: rgb(0x19e6ff) }); }
      // Teppich-Läufer
      B.box(1497.5, 0.005, 150.5, 1502.5, 0.015, 167.5, { col: rgb(0x7a1020) });
      B.box(1497.3, 0.004, 150.3, 1502.7, 0.012, 167.7, { col: gold });
    });
    // Tresortür (dreht sich beim Öffnen)
    const steel = new THREE.MeshStandardMaterial({ color: 0xc2c6cc, metalness: 0.95, roughness: 0.22 });
    const piv = new THREE.Group(); piv.position.set(1497.4, 0, 138.6);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.45, 0.7, 48).rotateX(Math.PI / 2), steel); door.position.set(2.6, 2.6, 0.2); piv.add(door);
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.14), steel); s.position.set(2.6, 2.6, 0.62); s.rotation.z = (k * Math.PI) / 3; piv.add(s); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.25 })); hub.position.set(2.6, 2.6, 0.7); piv.add(hub);
    for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), steel); const a = (k / 8) * Math.PI * 2; b.position.set(2.6 + Math.cos(a) * 2.25, 2.6 + Math.sin(a) * 2.25, -0.1); b.rotation.x = Math.PI / 2; piv.add(b); }
    R.g.add(piv);
    this.vaultDoor = piv; this.vaultOpen = 0;
    this.vaultBox = G.world.addBox(1497.4, 137.4, 1502.6, 138.9, -1, 6, 'bld');
    // Kronleuchter
    for (const z of [154, 162]) {
      const ch = new THREE.Group();
      const goldM = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.9, roughness: 0.3 });
      ch.add(new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 8, 32).rotateX(Math.PI / 2), goldM));
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.6) })); b.position.set(Math.cos(a) * 1.4, 0.15, Math.sin(a) * 1.4); ch.add(b); }
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), goldM); cord.position.y = 0.8; ch.add(cord);
      ch.position.set(1500, 6.4, z); R.g.add(ch);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshBasicMaterial({ map: textTex('SOLERA BANK', '#d4af37', 768, 128, 70), transparent: true, depthWrite: false }));
    sign.position.set(1500, 6.2, 138.62); R.g.add(sign);
    const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.9), new THREE.MeshBasicMaterial({ map: textTex('SEIT 1924', '#e6dccb', 512, 128, 56), transparent: true, depthWrite: false }));
    sign2.position.set(1500, 5.3, 138.62); R.g.add(sign2);
    R.exit = new Marker(1500, 166.3, 0x7cff6b, { label: 'X', r: 1.1 });
    R.rob = new Marker(1500, 148.8, 0xff3b5c, { label: '!', r: 1.2 });
    R.markers = [R.exit, R.rob];
    for (const m of R.markers) m.group.visible = false;
  }
  setVault(open) {
    this.vaultOpen = open;
    this.vaultDoor.rotation.y = -1.9 * open;
    this.vaultBox.y1 = open > 0.5 ? -50 : 6;
  }

  spawnBankPeds() {
    const add = (x, z, look, yaw, role) => {
      const p = G.peds.spawnAt(x, z, look, 'mission');
      p.persistent = true; p.yaw = yaw; p.role = role;
      this.peds.push(p);
      return p;
    };
    if (!this.alarm) this.setVault(0);
    for (const x of [1488.3, 1492.9, 1497.5, 1502.1, 1506.7]) add(x, 144.6, { ...randomLook(), shirt: C(0xf4f1ec), sleeve: C(0x2b3a55), pants: C(0x2b3a55), legs: C(0x2b3a55), hat: null }, 0, 'teller');
    add(1495, 140.6, { ...randomLook(), shirt: C(0x1d1d22), sleeve: C(0x1d1d22), pants: C(0x1d1d22), legs: C(0x1d1d22), hair: C(0x9e9e9e), hat: null, scale: 1 }, 0, 'manager');
    for (const [x, z] of [[1487.5, 164], [1512.5, 147.5]]) add(x, z, { ...copLook(), shirt: C(0x2b2b30), sleeve: C(0x2b2b30), hat: C(0x111111) }, Math.PI, 'guard');
    for (const [x, z] of [[1495, 151.5], [1499, 151.3], [1503, 151.6], [1507, 155], [1496, 159.5]]) add(x, z, randomLook(), Math.PI + rand(-0.4, 0.4), 'customer');
  }

  // ------------------------------------------------------------ Betreten / Verlassen
  enter(kind, door = null) {
    const R = this.rooms[kind], P = G.player;
    this.curDoor = door;
    G.hud.fadeIn();
    R.g.visible = true;
    for (const m of R.markers) m.group.visible = true;
    P.x = R.spawn.x; P.z = R.spawn.z; P.y = 0; P.yaw = R.spawn.yaw; P.vx = P.vz = P.vy = 0;
    G.cam.yaw = R.spawn.yaw; G.cam.pitch = -0.15; G.cam.snap();
    const nice = (t) => t.toLowerCase().replace(/(^|[\s&/-])([a-zäöüéí])/g, (m, a, b) => a + b.toUpperCase());
    G.interior = { kind, name: door && door.name ? (kind === 'shop' ? 'Samis 24/7' : nice(door.name)) : R.name, station: 3 };
    if (R.lightCfg) {
      const [lx, ly, lz, lc, li] = R.lightCfg;
      this.light.position.set(lx, ly, lz); this.light.color.setHex(lc); this.light.intensity = li;
      this.spawnResidents(R);
    }
    if (kind === 'club') {
      this.spawnClubPeds();
      this.light.position.set(1500, 5.5, -1);
      this.light.intensity = 160;
      if (!this.clubHint) { this.clubHint = true; G.hud.hint('Willkommen im <b>Club Velvet</b>!<br>Bleib auf der Tanzfläche stehen zum <b>Tanzen</b>. Bar: <b>B</b> · Bühne: <b>$</b>', 8); }
    } else if (kind === 'home') {
      this.light.position.set(1500, 3, 300);
      this.light.color.setHex(0xffe2c0);
      this.light.intensity = 45;
      if (!this.noLift) G.hud.toast('🛗 Aufzug · 34. Etage · Solera Heights');
      this.noLift = false;
    } else if (kind === 'shop') {
      this.light.position.set(1500, 3.3, 600);
      this.light.color.setHex(0xfff6e8);
      this.light.intensity = 18;
      if (!this.sami || this.sami.removed) {
        this.sami = G.peds.spawnAt(1506, 593.7, { ...randomLook(), skin: C(0xc68642), shirt: C(0x2b6f77), sleeve: C(0x2b6f77), pants: C(0x3a3a3a), legs: C(0x3a3a3a), hair: C(0x9e9e9e), hat: null, bald: false, scale: 0.95 }, 'mission');
        this.sami.persistent = true; this.sami.yaw = 0; this.sami.r = 0.2;
        this.peds.push(this.sami);
      }
      if (!G.player.contacts.has('sami')) G.hud.hint('Sprich mit <b>Sami</b> an der Theke (gelbes <b>24</b>).', 6);
    } else if (kind === 'dealer') {
      this.light.position.set(1500, 7, 446);
      this.light.color.setHex(0xffffff);
      this.light.intensity = 260;
      if (!this.dealerHint) { this.dealerHint = true; G.hud.hint('Willkommen bei <b>Solera Motors</b>!<br>Geh zum pinken <b>A</b> vor dem Drehteller, um Autos anzusehen und zu kaufen.', 8); }
    } else if (kind === 'bank') {
      this.spawnBankPeds();
      this.light.position.set(1500, 6.5, 152);
      this.light.color.setHex(0xfff2dc);
      this.light.intensity = 140;
      if (!this.bankHint) { this.bankHint = true; G.hud.hint('Die <b>Solera Bank</b>.<br>Mit einer Waffe startest du am roten <b>!</b> einen <b>Überfall</b>: Wachen ausschalten, Tresor aufbohren, Beute schnappen, fliehen.', 9); }
    }
    for (const m of R.markers) m.latch = true;
  }
  spawnResidents(R) {
    if (R.resident) {
      const r = R.resident;
      const p = G.peds.spawnAt(r.x, r.z, r.look(), 'mission');
      p.persistent = true; p.yaw = r.yaw; p.r = 0.2;
      this.peds.push(p); this.residents[r.id] = p;
    }
    for (const [x, z, yaw, kind] of R.guests || []) {
      const p = G.peds.spawnAt(x, z, kind === 'guard' ? { ...randomLook(), shirt: C(0x111111), sleeve: C(0x111111), pants: C(0x111111), legs: C(0x111111), hat: null } : randomLook(), 'mission');
      p.persistent = true; p.yaw = yaw; p.r = 0.2;
      if (kind === 'sit') { p.anim.sit = true; p.seatLift = -0.45; }
      if (kind === 'guard') p.anim.gun = false;
      this.peds.push(p);
    }
  }
  exit() {
    const kind = G.interior.kind;
    const d = this.curDoor || this.doors.find((o) => o.kind === kind), P = G.player;
    this.curDoor = null;
    this.cleanup();
    if (kind === 'home') G.hud.toast('🛗 Aufzug · Erdgeschoss');
    if (kind === 'dealer' && this.delivery) {
      const { key, color } = this.delivery; this.delivery = null;
      const v = G.vm.spawn(key, 162, 30.5, -Math.PI / 2, color);
      if (v) { v.parked = true; v.ownedByPlayer = true; v.missionCar = true; G.player.lastVehicle = v; setTimeout(() => { v.missionCar = false; }, 60000); G.hud.toast(`Dein neuer ${v.T.name} steht an der Straße vor dem Autohaus!`); }
    }
    P.x = d.out.x; P.z = d.out.z; P.y = G.world.groundHeight(d.out.x, d.out.z); P.yaw = d.out.yaw;
    G.cam.yaw = d.out.yaw; G.cam.pitch = -0.2; G.cam.snap();
    d.latch = true;
    G.hud.fadeIn();
  }
  cleanup() {
    for (const p of this.peds) if (!p.removed) G.peds.remove(p);
    this.peds = []; this.residents = {};
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
        if (inside && !d.latch) { d.latch = true; this.enter(d.kind, d); return; }
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
    else if (G.interior.kind === 'home') this.updateHome(dt, R, on);
    else if (G.interior.kind === 'shop') this.updateShop(dt, R, on);
    else if (G.interior.kind === 'dealer') this.updateDealer(dt, R, on);
    else if (G.interior.kind === 'bank') this.updateBank(dt, R, on);
    else if (G.interior.kind === 'cafe') { if (on(R.counter, 1.1)) this.cafeMenu(); }
    else if (G.interior.kind === 'boutique') { if (on(R.rack, 1.2)) this.boutiqueMenu(); }
    else if (G.interior.kind === 'diner') { if (on(R.counter, 1.1)) this.dinerMenu(); }
    else if (G.interior.kind === 'bar') { if (on(R.bar, 1.1)) G.ui.bar(); }
    else if (G.interior.kind === 'gunshop') { if (on(R.counter, 1.1)) G.ui.gunshop(); }
    else if (G.interior.kind === 'house') { if (on(R.bed, 1.1)) this.houseBed(); if (on(R.fridge, 1.0)) { G.player.health = Math.min(100, G.player.health + 25); G.hud.toast('🥪 Snack aus dem Kühlschrank: +25 Gesundheit'); } }
  }
  cafeMenu() {
    const P = G.player;
    G.openMenu('CAFÉ VIEJA', '<div style="opacity:.85">Frisch geröstet in der Altstadt.</div>', [
      ['Café con leche – $6', () => { if (!this.pay(6)) return; P.health = Math.min(100, P.health + 15); P.boostT = Math.max(P.boostT || 0, 20); G.hud.toast('☕ Herrlich! +15 Gesundheit, kurz mehr Ausdauer'); }],
      ['Churros mit Schokolade – $9', () => { if (!this.pay(9)) return; P.health = Math.min(100, P.health + 30); G.hud.toast('Süß und warm: +30 Gesundheit'); }],
      ['Bocadillo – $12', () => { if (!this.pay(12)) return; P.health = 100; G.hud.toast('Satt und zufrieden: volle Gesundheit'); }],
    ]);
  }
  boutiqueMenu() {
    const P = G.player;
    const items = OUTFITS.map((o, i) => [`${o.name}${P.outfit === i ? ' (trägst du)' : ''} – $150`, () => { if (P.outfit === i) return; if (!this.pay(150)) return; G.setOutfit(i); G.hud.toast(`👕 Neues Outfit: ${o.name}`); G.save.write(); }]);
    G.openMenu('MODA SOLERA', '<div style="opacity:.85">Neue Saison, neue Looks. Jedes Outfit $150.</div>', items);
  }

  updateShop(dt, R, on) {
    this.slotTop.material.color.setHSL((this.t * 0.4) % 1, 1, 0.6);
    if (on(R.counter, 1.3)) {
      if (!G.player.contacts.has('sami')) G.missions.start(samiIntro(this));
      else G.ui.kiosk();
    }
    if (on(R.slot, 1.1)) G.ui.slots();
  }
  updateDealer(dt, R, on) {
    if (!G.state.startsWith('menu')) this.turn.rotation.y += dt * 0.3;
    if (on(R.buy, 1.4)) G.ui.dealer();
  }
  updateHome(dt, R, on) {
    this.tv.material.color.setHSL((this.t * 0.05) % 1, 0.7, 0.45 + Math.sin(this.t * 3) * 0.05);
    if (on(R.bed, 1.4)) G.openService('safehouse');
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
    if (on(R.bar)) { G.ui.bar(); }
    if (false) {
      G.openMenu('BAR', 'Was darf\'s sein?', [
        ['Neon-Cocktail – $25', () => { if (!this.pay(25)) return; this.drunk = 25; G.hud.toast('Prost! Die Welt dreht sich ein bisschen …'); }],
        ['Energy-Drink – $10', () => { if (!this.pay(10)) return; P.health = Math.min(100, P.health + 20); G.hud.toast('Energie getankt: +20 Gesundheit'); }],
        ['Wasser – gratis', () => { G.hud.toast('Erfrischend.'); }],
      ]);
    }
    if (on(R.tip)) {
      G.openMenu('BÜHNE', 'Die Tänzerinnen und Tänzer geben alles.', [
        ['Trinkgeld geben – $50', () => { if (!this.pay(50)) return; this.cheer = 3; G.hud.toast('Die Show-Crew bedankt sich mit einer Pirouette!'); }],
        ['Song wünschen – $20', () => { if (!this.pay(20)) return; G.interior.station = G.interior.station === 3 ? 2 : G.interior.station === 2 ? 0 : 3; G.audio.nextBar = 0; G.hud.toast('Der DJ legt deinen Wunsch auf!'); }],
      ]);
    }
  }
  pay(n) {
    if (G.player.money < n) { G.hud.toast('Nicht genug Geld.'); return false; }
    G.player.addMoney(-n);
    return true;
  }

  updateBank(dt, R, on) {
    if (!G.missions.active || G.missions.active.id !== 'heist') this.alarm = false;
    if (this.alarm) { const f = Math.floor(G.time * 3) % 2; this.light.color.setHex(f ? 0xff2020 : 0x2040ff); this.light.intensity = 220; }
    else { this.light.color.setHex(0xfff2dc); this.light.intensity = 105; }
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

// Banküberfall in mehreren Phasen (wiederholbarer Nebenauftrag)
function heistDef(I) {
  return {
    id: 'heist', title: 'Banküberfall', side: true, reward: 0,
    *run(m) {
      const P = G.player;
      const inBank = () => G.interior && G.interior.kind === 'bank';
      const near = (x, z, r) => dist2(P.x, P.z, x, z) < r * r;
      m.failIf(() => P.state === 'dead' || P.state === 'busted', 'Überfall gescheitert – die Beute ist weg.');
      G.hud.bigToast('ÜBERFALL!', 'Alle auf den Boden – Hände hoch!');
      G.audio.wantedUp();
      // Phase 1: Kontrolle über die Halle
      const guards = I.peds.filter((p) => p.role === 'guard');
      const mgr = I.peds.find((p) => p.role === 'manager');
      for (const p of I.peds) {
        if (p.role === 'guard') { p.state = 'gang'; p.isGang = true; p.hostile = true; p.gangGun = true; p.health = 90; p.aggroR = 40; p.anim.gun = true; p.mk = m.marker(0, 0, 0xff3b5c, { follow: p, arrow: true, blipCol: '#ff3b5c' }); }
        else { p.surrender = true; p.anim.handsUp = true; }
      }
      G.hud.subtitle('Wachmann', 'Waffe runter! Sofort!', '#ff3b5c');
      m.objective('Schalte die <b>Wachleute</b> aus!');
      yield* m.until(() => !inBank() || m.aliveGang(guards) === 0);
      if (!inBank()) { m.fail('Überfall abgebrochen.'); yield; return; }
      G.hud.subtitle();
      // Phase 2: Filialleiter zum Tresor zwingen
      const mk = m.marker(0, 0, 0xffd23f, { follow: mgr, arrow: true, blipCol: '#ffd23f' });
      m.objective('Schnapp dir den <b>Filialleiter</b> hinter dem Schalter.');
      yield* m.until(() => !inBank() || !mgr.alive || near(mgr.x, mgr.z, 2.4));
      m.removeMarker(mk);
      if (!inBank()) { m.fail('Überfall abgebrochen.'); yield; return; }
      if (mgr.alive) {
        mgr.surrender = false; mgr.anim.handsUp = true;
        mgr.state = 'goto'; mgr.gotoSpeed = 2.6; mgr.tx = 1503.8; mgr.tz = 139.6;
        G.hud.subtitle('Filialleiter', 'Nicht schießen! Ich … ich gebe den Code ein!', '#ffd23f');
        yield* m.wait(4);
        G.hud.subtitle('Filialleiter', 'Das Zeitschloss! Ohne Bohrer kriegen Sie den nie auf …', '#ffd23f');
        yield* m.wait(2.5);
        G.hud.subtitle();
      }
      // Alarm
      I.alarm = true;
      G.police.setLevel(3); G.police.spotted();
      G.hud.toast('🚨 Stiller Alarm ausgelöst – die Polizei ist unterwegs!');
      // Phase 3: Tresor aufbohren, während die Polizei stürmt
      const dm = m.marker(1500, 139.6, 0xff9f1c, { r: 1.4, label: '⚙', blipCol: '#ff9f1c' });
      m.objective('Setze den <b>Bohrer</b> am Tresor an.');
      yield* m.until(() => !inBank() || near(1500, 139.6, 1.8));
      if (!inBank()) { m.fail('Überfall abgebrochen.'); yield; return; }
      m.removeMarker(dm);
      let drill = 0, wave = 0, waveT = 3;
      const dur = 24;
      while (drill < dur) {
        if (!inBank()) { m.fail('Überfall abgebrochen.'); yield; return; }
        const on = near(1500, 139.6, 5);
        if (on) drill += G.dt;
        G.police.spotted();
        if (Math.random() < 0.5) G.effects.sparks(1500 + Math.random() - 0.5, 2.6 + Math.random() - 0.5, 139.2, 2);
        if (Math.random() < 0.08) G.audio.noiseHit(0.2, 'bandpass', 3200, 0.06, 1800, 3);
        const pct = Math.floor((drill / dur) * 100);
        G.hud.racePos(`BOHRER  ${'█'.repeat(Math.floor(pct / 10))}${'░'.repeat(10 - Math.floor(pct / 10))}  ${pct}%`);
        m.objective(on ? 'Halte die <b>Polizei</b> auf, bis der Bohrer durch ist!' : 'Zurück zum <b>Bohrer</b> – er stoppt ohne dich!');
        waveT -= G.dt;
        if (waveT <= 0 && wave < 4) {
          wave++; waveT = 6.5;
          G.hud.toast(wave === 1 ? '🚔 Die Polizei stürmt die Bank!' : '🚔 Weitere Einsatzkräfte!');
          for (let k = 0; k < 2 + (wave > 2 ? 1 : 0); k++) { const c = G.peds.spawnCop(1496 + k * 4, 166); c.health = 110; I.peds.push(c); }
          G.police.setLevel(Math.min(5, 3 + Math.floor(wave / 2)));
        }
        yield;
      }
      G.hud.racePos('');
      // Phase 4: Tresor auf, Beute einsammeln
      G.audio.explosion(1500, 139); G.cam.shake(0.5);
      for (let t = 0; t < 1.2; t += G.dt) { I.setVault(Math.min(1, t / 1.2)); yield; }
      I.setVault(1);
      const piles = [[1489, 134, 2500, 'cash'], [1493, 134, 2500, 'cash'], [1507, 134, 6000, 'gold'], [1511, 134, 6000, 'gold'], [1496, 133.2, 1500, 'cash'], [1504, 133.2, 1500, 'cash']];
      const mks = piles.map(([x, z, , k]) => m.marker(x, z + 1.8, k === 'gold' ? 0xffd23f : 0x7cff6b, { r: 1, label: k === 'gold' ? '★' : '$', blipCol: k === 'gold' ? '#ffd23f' : '#7cff6b' }));
      let loot = 0, left = piles.length;
      m.timerLeft = 30;
      while (left > 0 && m.timerLeft > 0.5) {
        piles.forEach(([x, z, amt], i) => { if (mks[i] && near(x, z + 1.8, 1.6)) { loot += amt; m.removeMarker(mks[i]); mks[i] = null; left--; G.audio.cash(); G.hud.toast(`💰 +$${amt.toLocaleString('de-DE')}  (Beute: $${loot.toLocaleString('de-DE')})`); } });
        G.hud.racePos(`BEUTE  $${loot.toLocaleString('de-DE')}`);
        m.objective('Räum den <b>Tresor</b> aus, bevor die SWAT kommt!');
        G.police.spotted();
        yield;
      }
      for (const mk2 of mks) if (mk2) m.removeMarker(mk2);
      m.timerLeft = null; G.hud.timer(null);
      // Phase 5: Flucht
      G.police.setLevel(4); G.police.spotted();
      m.objective(`Beute: <b>$${loot.toLocaleString('de-DE')}</b> – raus hier! (grünes <b>X</b>)`);
      while (G.interior) { G.police.spotted(); yield; }
      I.alarm = false;
      G.police.setLevel(Math.max(G.police.level, 4)); G.police.spotted();
      m.objective(`Hänge die <b>Polizei</b> ab, um die Beute ($${loot.toLocaleString('de-DE')}) zu sichern.`);
      yield* m.until(() => G.police.level === 0);
      G.hud.racePos('');
      P.addMoney(loot);
      G.hud.banner('BEUTE GESICHERT', '#7dffa0', `Banküberfall · +$${loot.toLocaleString('de-DE')}`);
      G.audio.jingle();
      I.heistReady = G.time + 420;
      G.stats.heists = (G.stats.heists || 0) + 1;
      G.save.write();
    },
  };
}

// Erstes Gespräch mit Sami – danach ist er im Handy
function samiIntro(I) {
  return {
    id: 'sami', title: 'Samis Kiosk', side: true, reward: 0,
    *run(m) {
      const P = G.player, s = I.sami;
      yield* m.talk([
        ['Sami', 'Na sieh mal an – ein neues Gesicht in der Nachbarschaft! Ich bin Sami, mir gehört der Kiosk hier.'],
        ['Leo', 'Ich wohne gleich nebenan. Ich bin Leo.'],
        ['Sami', 'Dann sehen wir uns ja öfter. Zigaretten, Snacks, Zeitung – und manchmal höre ich Dinge, die für dich interessant sein könnten.'],
        ['Sami', 'Hier, meine Nummer. Wenn ich was höre, melde ich mich.'],
      ], s, s);
      P.contacts.add('sami');
      G.missions.updateGivers();
      G.hud.bigToast('NEUER KONTAKT', 'Sami (Kiosk) wurde in deinem Handy gespeichert');
      G.audio.pickup();
      G.save.write();
    },
  };
}

