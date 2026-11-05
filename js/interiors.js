// Begehbare Innenräume: Club Velvet (Nachtclub) & Solera Bank (Banküberfall)
import * as THREE from 'three';
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
    const sh = G.world.pois.safehouse, shop = G.world.pois.shop, dl = G.world.pois.dealer;
    this.doors = [
      { kind: 'club', m: new Marker(234, 106.5, 0xff2e88, { label: 'C', r: 1.2 }), out: { x: 234, z: 109.8, yaw: 0 } },
      { kind: 'bank', m: new Marker(10, 26.8, 0x19e6ff, { label: 'B', r: 1.2 }), out: { x: 10, z: 30.5, yaw: 0 } },
      { kind: 'home', m: new Marker(sh.x, sh.z, 0x7cff6b, { label: 'H', r: 1.2 }), out: { x: sh.x, z: sh.z + 2.6, yaw: 0 } },
      { kind: 'shop', m: new Marker(shop.x, shop.z, 0xffd23f, { label: '24', r: 1.1 }), out: { x: shop.x, z: shop.z + 2.4, yaw: 0 } },
      { kind: 'dealer', m: new Marker(dl.x, dl.z, 0xff2e88, { label: 'A', r: 1.2 }), out: { x: dl.x, z: dl.z + 2.8, yaw: 0 } },
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
    G.interior = { kind, name: R.name, station: 3 };
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
    if (kind === 'home') G.hud.toast('🛗 Aufzug · Erdgeschoss');
    if (kind === 'dealer' && this.delivery) {
      const { key, color } = this.delivery; this.delivery = null;
      const v = G.vm.spawn(key, 162, 30.5, -Math.PI / 2, color);
      if (v) { v.parked = true; v.ownedByPlayer = true; v.missionCar = true; G.player.lastVehicle = v; setTimeout(() => { v.missionCar = false; }, 60000); G.hud.toast(`Dein neuer ${v.T.name} steht an der Straße vor dem Autohaus!`); }
    }
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
    else if (G.interior.kind === 'home') this.updateHome(dt, R, on);
    else if (G.interior.kind === 'shop') this.updateShop(dt, R, on);
    else if (G.interior.kind === 'dealer') this.updateDealer(dt, R, on);
    else this.updateBank(dt, R, on);
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
      G.hud.bigToast('NEUER KONTAKT', 'Sami (Kiosk) wurde in deinem Handy gespeichert');
      G.audio.pickup();
      G.save.write();
    },
  };
}

