// Port Solera – prozedurale Stadt
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import * as TX from './textures.js';
import { GeoBuilder, rgb } from './geo.js';
import { mulberry32, lerp, clamp, smoothstep } from './utils.js';
import { rayBox as rayBoxW } from './physics.js';

const { CELL, NB, HALF, WALK_HW, roadPos } = C;

const STYLE = {
  glass: { uw: 20, vh: 28.8 },
  office: { uw: 24, vh: 28.8 },
  apt: { uw: 24, vh: 25.6 },
  deco: { uw: 24, vh: 27.2 },
  warehouse: { uw: 32, vh: 12 },
  house: { uw: 19.2, vh: 24 },
};
const PASTEL = [0xffc8d6, 0xbfeee0, 0xd9c8ff, 0xffe0b8, 0xbfe1ff, 0xfff0b0, 0xffffff, 0xf2d6c9, 0xc8f4ff];
const WEST = [0xf6d5b8, 0xe8c1a0, 0xd6e6f2, 0xf2e2c4, 0xc9dfc9, 0xf5c6b8, 0xeeeeee, 0xe9d8f0];
const WARE = [0x9aa5ad, 0x7d97a8, 0xb07a66, 0xb5b09a, 0x6f8a76, 0xc4c4c4];
const ACCENT = [0x19e6ff, 0xff2e88, 0xb26bff, 0xffffff, 0x7cff6b, 0xffd23f];
const CONTAINER_COLS = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98, 0x839192, 0x1abc9c, 0xa04000];

export const SIGN = { HOTEL: 0, MOTEL: 1, BAR: 2, CLUB: 3, DINER: 4, TACOS: 5, PIZZA: 6, H24: 7, SOLERA: 8, PARADISE: 9, DANCE: 10, VELVET: 11, NEONFM: 12, KLINIK: 13, SURF: 14, PIER: 15, GARAGE: 16, BANK: 17, POLIZEI: 18, WAFFEN: 19 };

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    this.boxes = [];
    this.circles = [];
    this.cells = new Map();
    this.cellSize = 16;
    this.stamp = 0;
    this.nodes = [];
    this.footprints = [];
    this.parks = [];
    this.lamps = [];
    this.lampAnim = [];
    this.rooms = []; // Innenräume: {x0,x1,z0,z1,y}
    this.ramps = C.RAMPS.map((r) => ({ ...r, fx: Math.sin(r.dir), fz: Math.cos(r.dir) }));
    this.signalState = [];
    this.boats = [];
    this.parkingSpots = [];
    this.pois = {};
    this.containerSpots = [];
  }

  // ------------------------------------------------------------ Kollision
  _cellKey(cx, cz) { return (cx + 512) * 2048 + (cz + 512); }
  _insert(obj, x0, z0, x1, z1, listName) {
    const s = this.cellSize;
    for (let cx = Math.floor(x0 / s); cx <= Math.floor(x1 / s); cx++)
      for (let cz = Math.floor(z0 / s); cz <= Math.floor(z1 / s); cz++) {
        const k = this._cellKey(cx, cz);
        let c = this.cells.get(k);
        if (!c) { c = { b: [], c: [] }; this.cells.set(k, c); }
        c[listName].push(obj);
      }
  }
  addBox(x0, z0, x1, z1, y0, y1, kind = 'bld') {
    const b = { x0, z0, x1, z1, y0, y1, kind, s: 0 };
    this.boxes.push(b);
    this._insert(b, x0, z0, x1, z1, 'b');
    return b;
  }
  addCircle(x, z, r, y1, kind = 'pole', extra = null) {
    const c = { x, z, r, y1, kind, alive: true, s: 0, ...(extra || {}) };
    this.circles.push(c);
    this._insert(c, x - r, z - r, x + r, z + r, 'c');
    return c;
  }
  query(x, z, r, outB, outC) {
    const s = this.cellSize;
    this.stamp++;
    outB.length = 0; if (outC) outC.length = 0;
    for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++)
      for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
        const c = this.cells.get(this._cellKey(cx, cz));
        if (!c) continue;
        for (const b of c.b) if (b.s !== this.stamp) { b.s = this.stamp; outB.push(b); }
        if (outC) for (const o of c.c) if (o.s !== this.stamp && o.alive) { o.s = this.stamp; outC.push(o); }
      }
  }

  groundHeight(x, z) {
    for (let i = 0; i < this.rooms.length; i++) { const r = this.rooms[i]; if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.y; }
    const P = C.PIER, PP = C.PIER_PLAT;
    if (z > P.z0 && z < P.z1 && x > P.x0 && x < P.x1) {
      const y = x < P.rampEnd ? lerp(-0.45, P.y, (x - P.x0) / (P.rampEnd - P.x0)) : P.y;
      return Math.max(y, C.sandHeight(x, z));
    }
    if (x > PP.x0 && x < PP.x1 && z > PP.z0 && z < PP.z1) return P.y;
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      const dx = x - r.x, dz = z - r.z;
      const u = dx * r.fx + dz * r.fz;
      if (u < 0 || u > r.len) continue;
      const v = dx * r.fz - dz * r.fx;
      if (Math.abs(v) > r.wid / 2) continue;
      const base = r.x > C.BEACH_X0 ? C.sandHeight(x, z) : 0;
      return base + (r.h * u) / r.len;
    }
    if (x >= C.BEACH_X0) return C.sandHeight(x, z);
    if (x < C.LAND.minX || z < C.LAND.minZ || z > C.LAND.maxZ) return -6;
    return 0;
  }
  // Strahl gegen Gebäude/Container -> t oder -1
  rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
    this.stamp++;
    const st = this.stamp, cs = this.cellSize;
    let best = -1, lim = maxT;
    const steps = Math.max(1, Math.ceil(maxT / 10));
    for (let k = 0; k <= steps; k++) {
      const s = Math.min(maxT, k * 10);
      const x = ox + dx * s, z = oz + dz * s;
      for (let cx = Math.floor((x - 6) / cs); cx <= Math.floor((x + 6) / cs); cx++)
        for (let cz = Math.floor((z - 6) / cs); cz <= Math.floor((z + 6) / cs); cz++) {
          const c = this.cells.get(this._cellKey(cx, cz));
          if (!c) continue;
          for (const b of c.b) {
            if (b.s === st) continue; b.s = st;
            if (b.kind === 'rail' || b.kind === 'quay') continue;
            const t = rayBoxW(ox, oy, oz, dx, dy, dz, b, lim);
            if (t >= 0 && t < lim) { lim = t; best = t; }
          }
        }
      if (best >= 0 && s > best) break;
    }
    return best;
  }
  lineOfSight(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return true;
    return this.rayWorld(x0, y0, z0, dx / L, dy / L, dz / L, L) < 0;
  }
  surfaceAt(x, z) {
    if (x >= C.BEACH_X0 && !(z > C.PIER.z0 && z < C.PIER.z1 && x > C.PIER.x0)) return 'sand';
    return 'road';
  }

  // --------------------------------------------------------------- Graph
  buildGraph() {
    const rnd = mulberry32(99);
    for (let j = 0; j <= NB; j++) for (let i = 0; i <= NB; i++) {
      const n = { id: C.nodeId(i, j), i, j, x: roadPos(i), z: roadPos(j), nbr: [], off: rnd() * 26 };
      this.nodes.push(n);
    }
    for (const n of this.nodes) {
      if (n.i > 0) n.nbr.push(C.nodeId(n.i - 1, n.j));
      if (n.i < NB) n.nbr.push(C.nodeId(n.i + 1, n.j));
      if (n.j > 0) n.nbr.push(C.nodeId(n.i, n.j - 1));
      if (n.j < NB) n.nbr.push(C.nodeId(n.i, n.j + 1));
    }
  }
  nearestNode(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, NB), j = clamp(Math.round((z + HALF) / CELL), 0, NB);
    return this.nodes[C.nodeId(i, j)];
  }
  // Ampelphase: 'G' | 'Y' | 'R'
  signal(nodeId, axisNS) {
    const n = this.nodes[nodeId];
    const t = (G.time + n.off) % 26;
    if (axisNS) return t < 10 ? 'G' : t < 12.5 ? 'Y' : 'R';
    return t >= 13 && t < 23 ? 'G' : t >= 23 && t < 25.5 ? 'Y' : 'R';
  }
  // Kürzester Weg (BFS) zwischen Knoten
  route(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Int32Array(this.nodes.length).fill(-1);
    prev[fromId] = fromId;
    const q = [fromId];
    for (let h = 0; h < q.length; h++) {
      const id = q[h];
      if (id === toId) break;
      for (const nb of this.nodes[id].nbr) if (prev[nb] < 0) { prev[nb] = id; q.push(nb); }
    }
    if (prev[toId] < 0) return [fromId];
    const path = [];
    for (let id = toId; id !== fromId; id = prev[id]) path.push(id);
    path.push(fromId);
    return path.reverse();
  }

  // --------------------------------------------------------------- Bauen
  async build(progress) {
    const tick = (p, msg) => { progress(p, msg); return new Promise((r) => setTimeout(r, 0)); };
    const q = this.q;
    TX.setAniso(Math.min(8, G.renderer.capabilities.getMaxAnisotropy()));
    await tick(0.05, 'Texturen werden gemalt …');
    this.tex = {
      road: TX.roadTexture(q === 'low' ? 1024 : 2048),
      facade: TX.facadeTextures(q),
      store: TX.storefrontTexture(),
      roof: TX.roofTexture(), tile: TX.tileRoofTexture(), grass: TX.grassTexture(), sand: TX.sandTexture(),
      wood: TX.woodTexture(), concrete: TX.concreteTexture(), container: TX.containerTexture(),
      signs: TX.signAtlas(), bill: TX.billboardTexture(),
      pool: TX.radialTexture('rgba(255,214,150,0.55)', 'rgba(255,190,120,0)', 128),
      blob: TX.radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 64),
      glow: TX.radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64, 'rgba(255,255,255,0.35)'),
    };
    this.makeMaterials();
    await tick(0.2, 'Straßen werden asphaltiert …');
    this.buildGraph();
    this.buildGround();
    await tick(0.35, 'Hochhäuser werden gebaut …');
    this.B = {};
    for (const k of ['glass', 'office']) this.B[k] = new GeoBuilder(false);
    for (const k of ['apt', 'deco', 'warehouse', 'house']) this.B[k] = new GeoBuilder(true);
    this.B.store = new GeoBuilder(false);
    this.B.roof = new GeoBuilder(false);
    this.B.tile = new GeoBuilder(true);
    this.B.props = new GeoBuilder(true);
    this.B.accent = new GeoBuilder(true);
    this.B.signs = new GeoBuilder(false);
    this.B.bill = new GeoBuilder(false);
    this.B.grass = new GeoBuilder(false);
    this.B.concrete = new GeoBuilder(true);
    this.B.wood = new GeoBuilder(false);
    this.B.poolw = new GeoBuilder(false);
    this.palmPos = []; this.treePos = []; this.containers = []; this.umbrellas = []; this.towels = [];
    for (let bj = 0; bj < NB; bj++) for (let bi = 0; bi < NB; bi++) this.genBlock(bi, bj);
    await tick(0.55, 'Strand & Pier werden angelegt …');
    this.genBeach();
    this.genPier();
    this.genHarbor();
    this.genQuay();
    this.genStreetProps();
    this.genRamps();
    await tick(0.7, 'Geometrie wird zusammengeführt …');
    this.finalizeMeshes();
    this.buildInstanced();
    this.buildWheel();
    this.buildBoats();
    await tick(0.85, 'Karte wird gezeichnet …');
    this.drawMap();
    await tick(0.9, 'Fast fertig …');
  }

  makeMaterials() {
    const T = this.tex, F = T.facade;
    const fac = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, metalness: 0.05, ...o });
    this.M = {
      glass: fac(F.glass, { roughness: 0.12, metalness: 0.65, envMapIntensity: 1.4 }),
      office: fac(F.office, { roughness: 0.55, metalness: 0.15 }),
      apt: fac(F.apt, { vertexColors: true, roughness: 0.85 }),
      deco: fac(F.deco, { vertexColors: true, roughness: 0.8 }),
      warehouse: fac(F.warehouse, { vertexColors: true, roughness: 0.6, metalness: 0.2 }),
      house: fac(F.house, { vertexColors: true, roughness: 0.9 }),
      store: fac(T.store, { roughness: 0.5 }),
      roof: new THREE.MeshStandardMaterial({ map: T.roof, roughness: 0.95 }),
      tile: new THREE.MeshStandardMaterial({ map: T.tile, vertexColors: true, roughness: 0.85 }),
      props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 }),
      accent: new THREE.MeshBasicMaterial({ vertexColors: true }),
      signs: new THREE.MeshBasicMaterial({ map: T.signs }),
      bill: new THREE.MeshStandardMaterial({ map: T.bill, emissiveMap: T.bill, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 }),
      grass: new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 }),
      concrete: new THREE.MeshStandardMaterial({ map: T.concrete, vertexColors: true, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ map: T.wood, roughness: 0.85 }),
      poolw: new THREE.MeshStandardMaterial({ color: 0x3fd0ff, emissive: 0x0a6a9a, emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.2 }),
      road: new THREE.MeshStandardMaterial({ map: T.road, roughness: 0.92 }),
      sand: new THREE.MeshStandardMaterial({ map: T.sand, vertexColors: true, roughness: 1 }),
      land: new THREE.MeshStandardMaterial({ map: T.concrete, color: 0x9a978f, roughness: 0.95 }),
    };
    this.M.signs.color.setScalar(0.6);
    this.M.accent.color.setScalar(0.3);
  }

  buildGround() {
    const M = this.M;
    // Landmasse
    const L = C.LAND;
    const lb = new GeoBuilder(false);
    lb.box(L.minX, -6, L.minZ, L.maxX, -0.02, L.maxZ, { uw: 8, vh: 8, topScale: 6 });
    const land = new THREE.Mesh(lb.build(), M.land);
    land.receiveShadow = true;
    this.scene.add(land);
    // Straßen
    const ext = HALF + WALK_HW;
    const rg = new THREE.PlaneGeometry(ext * 2, ext * 2, 1, 1);
    rg.rotateX(-Math.PI / 2);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + HALF) / CELL, (pos.getZ(k) + HALF) / CELL);
    const road = new THREE.Mesh(rg, M.road);
    road.receiveShadow = true;
    this.scene.add(road);
    // Strand
    const bw = 330, bd = 920;
    const bg = new THREE.PlaneGeometry(bw, bd, 66, 184);
    bg.rotateX(-Math.PI / 2);
    bg.translate(C.BEACH_X0 + bw / 2, 0, 0);
    const bp = bg.attributes.position, buv = bg.attributes.uv;
    const cols = [];
    for (let k = 0; k < bp.count; k++) {
      const x = bp.getX(k), z = bp.getZ(k);
      const y = C.sandHeight(x, z);
      bp.setY(k, y);
      buv.setXY(k, x / 7, z / 7);
      const wet = smoothstep(-0.45, -0.8, y), deep = smoothstep(-0.9, -3.5, y);
      const c = [1 - wet * 0.35 - deep * 0.3, 1 - wet * 0.38 - deep * 0.3, 1 - wet * 0.42 - deep * 0.25];
      cols.push(...c);
    }
    bg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    bg.computeVertexNormals();
    const beach = new THREE.Mesh(bg, M.sand);
    beach.receiveShadow = true;
    this.scene.add(beach);
  }

  // ------------------------------------------------------------ Gebäude
  facadeBox(style, x0, z0, x1, z1, y0, y1, o = {}) {
    const S = STYLE[style];
    const r = o.rnd || Math.random;
    this.B[style].box(x0, y0, z0, x1, y1, z1, { uw: S.uw, vh: S.vh, uo: Math.floor(r() * 8) / 8, vo: 0, col: o.tint != null ? rgb(o.tint) : null, top: false });
    if (o.roof !== false) this.roofTop(x0, z0, x1, z1, y1, o.parapet !== false);
  }
  roofTop(x0, z0, x1, z1, y, parapet = true) {
    this.B.roof.box(x0, y - 0.02, z0, x1, y, z1, { sides: false, topScale: 8 });
    if (parapet && (x1 - x0) > 6) {
      const t = 0.3, h = 0.7;
      this.B.roof.box(x0, y, z0, x1, y + h, z0 + t, { uw: 4, vh: 4, topScale: 4 });
      this.B.roof.box(x0, y, z1 - t, x1, y + h, z1, { uw: 4, vh: 4, topScale: 4 });
      this.B.roof.box(x0, y, z0 + t, x0 + t, y + h, z1 - t, { uw: 4, vh: 4, topScale: 4 });
      this.B.roof.box(x1 - t, y, z0 + t, x1, y + h, z1 - t, { uw: 4, vh: 4, topScale: 4 });
    }
  }
  roofProps(x0, z0, x1, z1, y, rnd, n = 3) {
    const P = this.B.props;
    const w = x1 - x0, d = z1 - z0;
    for (let k = 0; k < n; k++) {
      const bw = 1.5 + rnd() * 3, bd = 1.5 + rnd() * 3, bh = 1 + rnd() * 1.8;
      const cx = x0 + 2 + rnd() * Math.max(0.1, w - 4 - bw), cz = z0 + 2 + rnd() * Math.max(0.1, d - 4 - bd);
      P.box(cx, y, cz, cx + bw, y + bh, cz + bd, { col: rgb(rnd() < 0.5 ? 0x9a9c9e : 0x7c7f83) });
    }
    if (rnd() < 0.35 && w > 10) {
      const cx = x0 + 3 + rnd() * (w - 6), cz = z0 + 3 + rnd() * (d - 6);
      const tank = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 10);
      const m = new THREE.Matrix4().makeTranslation(cx, y + 3.3, cz);
      P.addGeometry(tank, m, rgb(0x8a6b4f));
      for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) P.box(cx + ox - 0.08, y, cz + oz - 0.08, cx + ox + 0.08, y + 2, cz + oz + 0.08, { col: rgb(0x555555) });
    }
  }
  collider(x0, z0, x1, z1, h) { this.addBox(x0, z0, x1, z1, -1, h, 'bld'); this.footprints.push([x0, z0, x1, z1]); }

  tower(x0, z0, x1, z1, h, style, rnd, o = {}) {
    const store = o.store !== false;
    if (store) this.B.store.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 4.5, z1 + 0.06, { uw: 24, vh: 4.5, uo: Math.floor(rnd() * 4) / 4, top: false });
    const y0 = store ? 4.5 : 0;
    const tiers = h > 60 ? (rnd() < 0.6 ? 2 + (rnd() < 0.4 ? 1 : 0) : 1) : 1;
    let cx0 = x0, cz0 = z0, cx1 = x1, cz1 = z1, yb = y0;
    let yTop = h;
    for (let t = 0; t < tiers; t++) {
      const yt = t === tiers - 1 ? h : lerp(yb, h, t === 0 ? 0.62 : 0.55);
      this.facadeBox(style, cx0, cz0, cx1, cz1, yb, yt, { rnd, tint: o.tint });
      if (t < tiers - 1) {
        const iw = (cx1 - cx0) * 0.12, id = (cz1 - cz0) * 0.12;
        cx0 += iw; cx1 -= iw; cz0 += id; cz1 -= id;
      }
      yb = yt; yTop = yt;
    }
    // Krone/Lichtleisten
    if (o.crown || (style === 'glass' && h > 50 && rnd() < 0.75)) {
      const col = rgb(o.crownColor || ACCENT[Math.floor(rnd() * ACCENT.length)], 1.5);
      const A = this.B.accent, t = 0.25, yy = yTop - 0.5;
      A.box(cx0 - 0.1, yy, cz0 - 0.1, cx1 + 0.1, yy + 0.35, cz0 + t, { col });
      A.box(cx0 - 0.1, yy, cz1 - t, cx1 + 0.1, yy + 0.35, cz1 + 0.1, { col });
      A.box(cx0 - 0.1, yy, cz0, cx0 + t, yy + 0.35, cz1, { col });
      A.box(cx1 - t, yy, cz0, cx1 + 0.1, yy + 0.35, cz1, { col });
      if (rnd() < 0.5) {
        // vertikale Kantenlichter
        for (const [ex, ez] of [[cx0, cz0], [cx1, cz0], [cx0, cz1], [cx1, cz1]]) A.box(ex - 0.15, yTop - 18, ez - 0.15, ex + 0.15, yTop, ez + 0.15, { col });
      }
    }
    if (h > 80 && rnd() < 0.6) {
      const mx = (cx0 + cx1) / 2, mz = (cz0 + cz1) / 2, ah = 10 + rnd() * 20;
      this.B.props.box(mx - 0.3, yTop, mz - 0.3, mx + 0.3, yTop + ah, mz + 0.3, { col: rgb(0x9a9a9a) });
      this.B.accent.box(mx - 0.4, yTop + ah, mz - 0.4, mx + 0.4, yTop + ah + 0.8, mz + 0.4, { col: [3, 0.1, 0.1] });
    } else {
      this.roofProps(cx0, cz0, cx1, cz1, yTop, rnd, 2 + Math.floor(rnd() * 3));
    }
    this.collider(x0, z0, x1, z1, h);
    return yTop;
  }

  sign(idx, cx, cy, cz, w, nx, nz, both = false) {
    const h = w / 2.14;
    const col = idx % 4, row = Math.floor(idx / 4);
    const u0 = (col * 256 + 4) / 1024, u1 = (col * 256 + 252) / 1024;
    const v1 = 1 - (row * 256 + 70) / 1280, v0 = 1 - (row * 256 + 186) / 1280;
    const rx = nz, rz = -nx;
    const S = this.B.signs;
    const ox = nx * 0.06, oz = nz * 0.06;
    const a = [cx - rx * w / 2 + ox, cy - h / 2, cz - rz * w / 2 + oz], b = [cx + rx * w / 2 + ox, cy - h / 2, cz + rz * w / 2 + oz];
    const c = [cx + rx * w / 2 + ox, cy + h / 2, cz + rz * w / 2 + oz], d = [cx - rx * w / 2 + ox, cy + h / 2, cz - rz * w / 2 + oz];
    S.quad(a, b, c, d, [u0, v0, u1, v1], null, [nx, 0, nz]);
    if (both) {
      const a2 = [b[0] - 2 * ox, b[1], b[2] - 2 * oz], b2 = [a[0] - 2 * ox, a[1], a[2] - 2 * oz];
      const c2 = [d[0] - 2 * ox, d[1], d[2] - 2 * oz], d2 = [c[0] - 2 * ox, c[1], c[2] - 2 * oz];
      S.quad(a2, b2, c2, d2, [u0, v0, u1, v1], null, [-nx, 0, -nz]);
    }
    // Rahmen (hinter dem Schild)
    const t = both ? 0.03 : 0.05, off = both ? 0 : -0.05;
    const fcx = cx + nx * off, fcz = cz + nz * off;
    const hx = Math.abs(rx) * (w / 2 + 0.08) + Math.abs(nx) * t, hz = Math.abs(rz) * (w / 2 + 0.08) + Math.abs(nz) * t;
    this.B.props.box(fcx - hx, cy - h / 2 - 0.1, fcz - hz, fcx + hx, cy + h / 2 + 0.1, fcz + hz, { col: rgb(0x151018) });
  }

  billboard(cx, y, cz, nx, nz, idx) {
    const w = 12, h = 6;
    const rx = nz, rz = -nx;
    const u0 = (idx % 2) * 0.5, v0 = 1 - (Math.floor(idx / 2) + 1) * 0.5;
    const ox = nx * 0.3, oz = nz * 0.3;
    this.B.bill.quad([cx - rx * w / 2 + ox, y + 3, cz - rz * w / 2 + oz], [cx + rx * w / 2 + ox, y + 3, cz + rz * w / 2 + oz],
      [cx + rx * w / 2 + ox, y + 3 + h, cz + rz * w / 2 + oz], [cx - rx * w / 2 + ox, y + 3 + h, cz - rz * w / 2 + oz], [u0, v0, u0 + 0.5, v0 + 0.5], null, [nx, 0, nz]);
    const P = this.B.props, gc = rgb(0x3a3a40);
    P.box(cx - Math.abs(rx) * w / 2 - 0.2, y + 2.8, cz - Math.abs(rz) * w / 2 - 0.2, cx + Math.abs(rx) * w / 2 + 0.2, y + 3.2 + h, cz + Math.abs(rz) * w / 2 + 0.2, { col: gc });
    for (const s of [-0.35, 0.35]) P.box(cx + rx * w * s - 0.15, y, cz + rz * w * s - 0.15, cx + rx * w * s + 0.15, y + 3, cz + rz * w * s + 0.15, { col: gc });
  }

  genBlock(bi, bj) {
    const x0 = roadPos(bi) + WALK_HW, x1 = roadPos(bi + 1) - WALK_HW, z0 = roadPos(bj) + WALK_HW, z1 = roadPos(bj + 1) - WALK_HW;
    const rnd = mulberry32(1000 + bi * 37 + bj * 101);
    const sp = C.isSpecialBlock(bi, bj);
    if (sp) return this.genSpecial(sp, x0, z0, x1, z1, rnd, bi, bj);
    if (C.isPark(bi, bj)) return this.genPark(x0, z0, x1, z1, rnd);
    if (C.isOpenLot(bi, bj)) return this.genOpenLot(bi, bj, x0, z0, x1, z1, rnd);
    const d = C.districtOf(bi, bj);
    const m = 2;
    const X0 = x0 + m, X1 = x1 - m, Z0 = z0 + m, Z1 = z1 - m;
    if (d === 'downtown') {
      const r = rnd();
      if (r < 0.35) {
        const w = 34 + rnd() * 12;
        const cx = (X0 + X1) / 2 + (rnd() - 0.5) * (X1 - X0 - w), cz = (Z0 + Z1) / 2 + (rnd() - 0.5) * (Z1 - Z0 - w);
        this.tower(cx - w / 2, cz - w / 2, cx + w / 2, cz + w / 2, 110 + rnd() * 80, rnd() < 0.75 ? 'glass' : 'office', rnd);
        this.plazaPalms(X0, Z0, X1, Z1, cx - w / 2, cz - w / 2, cx + w / 2, cz + w / 2, rnd);
      } else if (r < 0.7) {
        const alongX = rnd() < 0.5, gap = 4;
        if (alongX) {
          const xm = (X0 + X1) / 2;
          this.tower(X0, Z0, xm - gap / 2, Z1, 70 + rnd() * 90, rnd() < 0.7 ? 'glass' : 'office', rnd);
          this.tower(xm + gap / 2, Z0, X1, Z1, 50 + rnd() * 80, rnd() < 0.6 ? 'glass' : 'office', rnd);
        } else {
          const zm = (Z0 + Z1) / 2;
          this.tower(X0, Z0, X1, zm - gap / 2, 70 + rnd() * 90, rnd() < 0.7 ? 'glass' : 'office', rnd);
          this.tower(X0, zm + gap / 2, X1, Z1, 50 + rnd() * 80, rnd() < 0.6 ? 'glass' : 'office', rnd);
        }
      } else {
        this.grid2(X0, Z0, X1, Z1, 2, 2, 4, (a, b, c, e) => this.tower(a, b, c, e, 45 + rnd() * 75, rnd() < 0.6 ? 'glass' : 'office', rnd));
      }
    } else if (d === 'midtown') {
      this.grid2(X0, Z0, X1, Z1, 2, 2, 3, (a, b, c, e) => {
        if (rnd() < 0.1) { this.smallPlaza(a, b, c, e, rnd); return; }
        const st = rnd(), h = 16 + rnd() * 40;
        const style = st < 0.45 ? 'office' : st < 0.85 ? 'apt' : 'glass';
        const top = this.tower(a, b, c, e, h, style, rnd, { tint: style === 'apt' ? WEST[Math.floor(rnd() * WEST.length)] : undefined });
        if (rnd() < 0.22 && h < 45) this.billboard((a + c) / 2, top, (b + e) / 2, 0, 1, Math.floor(rnd() * 4));
      });
    } else if (d === 'westside') {
      const nx = rnd() < 0.5 ? 3 : 2, nz = nx === 3 ? 2 : 3;
      this.grid2(X0, Z0, X1, Z1, nx, nz, 2.5, (a, b, c, e) => {
        if (rnd() < 0.08) { this.smallPlaza(a, b, c, e, rnd); return; }
        this.tower(a, b, c, e, 10 + rnd() * 22, 'apt', rnd, { tint: WEST[Math.floor(rnd() * WEST.length)], store: rnd() < 0.65 });
      });
    } else if (d === 'heights') {
      this.grid2(X0, Z0, X1, Z1, 3, 3, 4, (a, b, c, e) => this.house(a, b, c, e, rnd));
    } else if (d === 'seaside') {
      // Hotels mit Blick zum Strand
      const zm = (Z0 + Z1) / 2, gap = 5;
      for (const [za, zb] of [[Z0, zm - gap / 2], [zm + gap / 2, Z1]]) {
        const xa = X0 + 6 + rnd() * 6;
        const h = 16 + rnd() * 26;
        const tint = PASTEL[Math.floor(rnd() * PASTEL.length)];
        this.tower(xa, za, X1, zb, h, 'deco', rnd, { tint, crown: true, crownColor: ACCENT[Math.floor(rnd() * 3)] });
        const idx = [SIGN.HOTEL, SIGN.MOTEL, SIGN.PARADISE, SIGN.SOLERA, SIGN.BAR, SIGN.H24][Math.floor(rnd() * 6)];
        // Blade-Schild an der Ostfassade
        this.sign(idx, X1 + 0.1, Math.min(h - 3, 12 + rnd() * 6), (za + zb) / 2, 7, 1, 0);
        if (rnd() < 0.6) this.sign([SIGN.TACOS, SIGN.PIZZA, SIGN.BAR, SIGN.SURF][Math.floor(rnd() * 4)], (xa + X1) / 2, 6.2, zb + 0.1, 5, 0, 1);
      }
    } else if (d === 'harbor') {
      if (rnd() < 0.5) {
        this.warehouse(X0, Z0, X1, Z0 + 24, rnd);
        this.containerField(X0, Z0 + 28, X1, Z1, rnd);
      } else {
        this.warehouse(X0, Z0, X0 + 26, Z1, rnd);
        this.containerField(X0 + 30, Z0, X1, Z1, rnd);
      }
    }
  }

  grid2(X0, Z0, X1, Z1, nx, nz, gap, fn) {
    const w = (X1 - X0 - gap * (nx - 1)) / nx, d = (Z1 - Z0 - gap * (nz - 1)) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = X0 + i * (w + gap), b = Z0 + j * (d + gap);
      fn(a, b, a + w, b + d);
    }
  }

  plazaPalms(X0, Z0, X1, Z1, bx0, bz0, bx1, bz1, rnd) {
    for (let k = 0; k < 6; k++) {
      const x = X0 + 2 + rnd() * (X1 - X0 - 4), z = Z0 + 2 + rnd() * (Z1 - Z0 - 4);
      if (x > bx0 - 3 && x < bx1 + 3 && z > bz0 - 3 && z < bz1 + 3) continue;
      this.addPalm(x, z, rnd);
    }
  }
  smallPlaza(a, b, c, e, rnd) {
    this.B.grass.box(a + 1, 0.02, b + 1, c - 1, 0.06, e - 1, { sides: false, topScale: 6 });
    for (let k = 0; k < 2; k++) this.addTree(a + 3 + rnd() * (c - a - 6), b + 3 + rnd() * (e - b - 6), rnd);
  }

  house(a, b, c, e, rnd) {
    const P = this.B.props;
    const w = c - a, d = e - b;
    const hw = 8 + rnd() * Math.min(4, w - 9), hd = 8 + rnd() * Math.min(4, d - 9);
    const hx = a + (w - hw) / 2 + (rnd() - 0.5) * 2, hz = b + (d - hd) / 2 + (rnd() - 0.5) * 2;
    const floors = rnd() < 0.55 ? 2 : 1, h = floors * 3.1 + 0.4;
    const tint = PASTEL[Math.floor(rnd() * PASTEL.length)];
    this.B.grass.box(a, 0.02, b, c, 0.05, e, { sides: false, topScale: 6 });
    this.facadeBox('house', hx, hz, hx + hw, hz + hd, 0, h, { rnd, tint, roof: false });
    const alongX = hw > hd;
    this.B.tile.gable(hx, hz, hx + hw, hz + hd, h, 2.2 + rnd() * 0.8, alongX, rgb(rnd() < 0.7 ? 0xffffff : 0x9a8f88), 0.5);
    this.collider(hx, hz, hx + hw, hz + hd, h + 3);
    // Pool
    if (rnd() < 0.3) {
      const px = hx < a + w / 2 ? hx + hw + 1 : a + 1, pz = b + 2;
      const pw = Math.min(5, c - px - 1), pd = 3.5;
      if (pw > 2.5) {
        this.B.concrete.box(px - 0.4, 0.0, pz - 0.4, px + pw + 0.4, 0.12, pz + pd + 0.4, { col: rgb(0xe8e4dc), topScale: 2, uw: 2, vh: 2 });
        this.B.poolw.box(px, 0.12, pz, px + pw, 0.14, pz + pd, { sides: false });
      }
    }
    // Garten
    if (rnd() < 0.7) this.addPalm(a + 1.5 + rnd() * 2, e - 1.5 - rnd() * 2, rnd);
    if (rnd() < 0.4) this.addTree(c - 2.5, b + 2.5, rnd);
    // Hecke
    if (rnd() < 0.5) P.box(a, 0, e - 0.6, c, 1.1, e, { col: rgb(0x2f6b2a) });
  }

  warehouse(x0, z0, x1, z1, rnd) {
    const h = 9 + rnd() * 5;
    const tint = WARE[Math.floor(rnd() * WARE.length)];
    this.facadeBox('warehouse', x0, z0, x1, z1, 0, h, { rnd, tint, parapet: false, roof: false });
    const alongX = (x1 - x0) > (z1 - z0);
    this.B.props.gable(x0, z0, x1, z1, h, 2.2, alongX, rgb(0x6f7378), 0.3);
    // Tore
    const P = this.B.props;
    const doors = Math.max(1, Math.floor((x1 - x0) / 14));
    for (let k = 0; k < doors; k++) {
      const dx = x0 + (k + 0.5) * (x1 - x0) / doors;
      P.box(dx - 2.5, 0, z1, dx + 2.5, 5.2, z1 + 0.12, { col: rgb(0x4a5058) });
    }
    this.collider(x0, z0, x1, z1, h + 2);
  }

  containerField(x0, z0, x1, z1, rnd) {
    const L = 12.2, W = 2.5;
    const alongX = (x1 - x0) > (z1 - z0);
    if (alongX) {
      for (let x = x0 + 1; x + L < x1; x += L + 1.2) for (let z = z0 + 1; z + W < z1; z += W + 0.3) {
        if (rnd() < 0.25) continue;
        const stack = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < stack; s++) this.containers.push([x + L / 2, s * 2.6, z + W / 2, 0, CONTAINER_COLS[Math.floor(rnd() * CONTAINER_COLS.length)]]);
        this.addBox(x, z, x + L, z + W, -1, stack * 2.6, 'cont');
      }
    } else {
      for (let z = z0 + 1; z + L < z1; z += L + 1.2) for (let x = x0 + 1; x + W < x1; x += W + 0.3) {
        if (rnd() < 0.25) continue;
        const stack = 1 + Math.floor(rnd() * 3);
        for (let s = 0; s < stack; s++) this.containers.push([x + W / 2, s * 2.6, z + L / 2, Math.PI / 2, CONTAINER_COLS[Math.floor(rnd() * CONTAINER_COLS.length)]]);
        this.addBox(x, z, x + W, z + L, -1, stack * 2.6, 'cont');
      }
    }
  }

  genPark(x0, z0, x1, z1, rnd) {
    this.parks.push([x0, z0, x1, z1]);
    this.B.grass.box(x0, 0.02, z0, x1, 0.06, z1, { sides: false, topScale: 6 });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const Cc = this.B.concrete, pc = rgb(0xd9d1bf);
    Cc.box(cx - 2, 0.06, z0, cx + 2, 0.1, z1, { sides: false, topScale: 3, col: pc });
    Cc.box(x0, 0.06, cz - 2, x1, 0.1, cz + 2, { sides: false, topScale: 3, col: pc });
    // Brunnen
    const fountain = new THREE.CylinderGeometry(5, 5.4, 0.8, 24);
    this.B.props.addGeometry(fountain, new THREE.Matrix4().makeTranslation(cx, 0.4, cz), rgb(0xd8d2c4));
    const fw = new THREE.CylinderGeometry(4.5, 4.5, 0.1, 24);
    this.B.poolw.addGeometry(fw, new THREE.Matrix4().makeTranslation(cx, 0.78, cz));
    this.B.props.addGeometry(new THREE.CylinderGeometry(0.5, 0.7, 2.8, 10), new THREE.Matrix4().makeTranslation(cx, 1.4, cz), rgb(0xd8d2c4));
    this.addCircle(cx, cz, 5.3, 1, 'fountain');
    this.fountains = this.fountains || [];
    this.fountains.push([cx, cz]);
    for (let k = 0; k < 26; k++) {
      const x = x0 + 3 + rnd() * (x1 - x0 - 6), z = z0 + 3 + rnd() * (z1 - z0 - 6);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
      if (Math.hypot(x - cx, z - cz) < 9) continue;
      if (rnd() < 0.65) this.addTree(x, z, rnd); else this.addPalm(x, z, rnd);
    }
    // Bänke
    for (const [bx, bz, rot] of [[cx - 3.5, cz - 12, 0], [cx + 3.5, cz + 12, 0], [cx - 12, cz + 3.5, 1], [cx + 12, cz - 3.5, 1]]) this.bench(bx, bz, rot);
  }

  bench(x, z, rot) {
    const P = this.B.props, c = rgb(0x7a5230), m = rgb(0x333333);
    const [hx, hz] = rot ? [0.3, 1] : [1, 0.3];
    P.box(x - hx, 0.42, z - hz, x + hx, 0.5, z + hz, { col: c });
    P.box(x - hx * 0.9, 0, z - hz * 0.9, x - hx * 0.9 + 0.08, 0.42, z + hz * 0.9, { col: m });
    P.box(x + hx * 0.9 - 0.08, 0, z - hz * 0.9, x + hx * 0.9, 0.42, z + hz * 0.9, { col: m });
  }

  genOpenLot(bi, bj, x0, z0, x1, z1, rnd) {
    if (bi === 1 && bj === 8) {
      // Containerhof mit Sprungschanze
      this.containerField(x0 + 1, z0, x0 + 14, z1, rnd);
      this.containerField(x1 - 14, z0, x1 - 1, z1, rnd);
      // Querreihe über die Sprungbahn
      for (const cx of [-246, -234]) {
        this.containers.push([cx, 0, 319, 0, CONTAINER_COLS[Math.floor(rnd() * 8)]]);
        this.addBox(cx - 6.1, 317.75, cx + 6.1, 320.25, -1, 2.6, 'cont');
      }
    } else if (bi === 7 && bj === 7) {
      // Parkplatz
      const Cc = this.B.concrete;
      Cc.box(x0, 0.0, z0, x1, 0.03, z1, { sides: false, topScale: 6, col: rgb(0x4a4c52) });
      for (const zz of [z0 + 1, z1 - 7]) {
        for (let x = x0 + 2; x < x1 - 2; x += 3.2) Cc.box(x, 0.03, zz, x + 0.15, 0.05, zz + 6, { sides: false, col: rgb(0xf0f0f0) });
        for (let x = x0 + 3.6; x < x1 - 3; x += 3.2) this.parkingSpots.push([x, zz + 3, 0]);
      }
    } else if (bi === 3 && bj === 6) {
      // Skate-Plaza
      const Cc = this.B.concrete;
      Cc.box(x0, 0.0, z0, x1, 0.03, z1, { sides: false, topScale: 4, col: rgb(0xb8b3aa) });
      const cols = [0xff2e88, 0x19e6ff, 0xffd23f, 0x7cff6b];
      for (let k = 0; k < 4; k++) {
        const x = x0 + 4 + k * 13;
        this.B.props.box(x, 0, z1 - 3, x + 8, 3, z1 - 2.4, { col: rgb(cols[k]) });
        this.addBox(x, z1 - 3, x + 8, z1 - 2.4, -1, 3, 'wall');
      }
      for (let k = 0; k < 6; k++) this.addPalm(x0 + 3 + rnd() * (x1 - x0 - 6), z0 + 3 + rnd() * 8, rnd);
      this.bench(x0 + 20, z0 + 14, 0); this.bench(x0 + 34, z0 + 14, 0);
    }
  }

  genSpecial(kind, x0, z0, x1, z1, rnd, bi, bj) {
    const [fx, fz] = C.blockFrontPos(bi, bj);
    this.pois[kind] = { x: fx, z: fz, name: C.SPECIAL[kind].name };
    const m = 2, X0 = x0 + m, X1 = x1 - m, Z0 = z0 + m, Z1 = z1 - m;
    const zm = (Z0 + Z1) / 2;
    const P = this.B.props, A = this.B.accent;
    const backHalf = (style, tint, hmin, hmax) => this.grid2(X0, Z0, X1, zm - 4, 2, 1, 4, (a, b, c, e) => this.tower(a, b, c, e, hmin + rnd() * (hmax - hmin), style, rnd, { tint }));
    switch (kind) {
      case 'safehouse': {
        this.B.grass.box(x0, 0.02, z0, x1, 0.06, z1, { sides: false, topScale: 6 });
        this.facadeBox('house', 222, -172, 250, -152, 0, 7, { rnd, tint: 0xffffff });
        this.facadeBox('glass', 228, -170, 258, -154, 7, 12, { rnd });
        A.box(228, 11.6, -154.2, 258, 11.9, -153.9, { col: rgb(0x19e6ff, 1.5) });
        this.collider(222, -172, 258, -152, 12);
        this.B.concrete.box(221, 0.0, -148, 247, 0.15, -138, { col: rgb(0xece6da), topScale: 2 });
        this.B.poolw.box(223, 0.15, -146.5, 245, 0.17, -139.5, { sides: false });
        for (const [px, pz] of [[217, -175], [217, -140], [264, -175], [264, -150]]) this.addPalm(px, pz, rnd);
        this.B.concrete.box(250, 0.0, -150, 262, 0.05, -132, { sides: false, col: rgb(0x55575c), topScale: 4 });
        this.pois.safehouseCar = { x: 231, z: -136, h: 0 };
        break;
      }
      case 'diner': {
        backHalf('apt', WEST[2], 12, 24);
        this.B.store.box(-178, 0, -80, -142, 4.5, -62, { uw: 24, vh: 4.5, top: false });
        this.roofTop(-178, -80, -142, -62, 4.5, false);
        A.box(-178.2, 4.3, -62.3, -141.8, 4.7, -61.9, { col: rgb(0xff2e88, 1.6) });
        A.box(-178.2, 4.3, -80.1, -141.8, 4.7, -79.8, { col: rgb(0xff2e88, 1.6) });
        this.sign(SIGN.DINER, -160, 7.5, -64, 10, 0, 1);
        P.box(-165.2, 4.5, -64.4, -164.8, 5.8, -64, { col: rgb(0x222222) });
        P.box(-155.2, 4.5, -64.4, -154.8, 5.8, -64, { col: rgb(0x222222) });
        this.collider(-178, -80, -142, -62, 9);
        break;
      }
      case 'garage': {
        this.facadeBox('warehouse', 56, 226, 104, 262, 0, 11, { rnd, tint: 0x7d97a8, parapet: false });
        P.box(70, 0, 262, 90, 6, 262.15, { col: rgb(0x2a2e33) });
        for (let k = 0; k < 10; k++) P.box(70, 0.5 + k * 0.55, 262.15, 90, 0.55 + k * 0.55, 262.2, { col: rgb(0x3d434a) });
        this.sign(SIGN.GARAGE, 80, 8.6, 262.1, 9, 0, 1);
        this.collider(56, 226, 104, 262, 11);
        this.containerField(56, 214, 104, 224, rnd);
        break;
      }
      case 'club': {
        backHalf('deco', PASTEL[2], 14, 26);
        this.tower(216, 80, 264, 104, 14, 'deco', rnd, { tint: 0x6a4a8a, store: false, crown: true, crownColor: 0xff2e88 });
        this.sign(SIGN.VELVET, 240, 10, 104.1, 13, 0, 1);
        this.sign(SIGN.DANCE, 264.4, 9, 92, 7, 1, 0, true);
        A.box(216, 0.2, 104.05, 264, 0.5, 104.3, { col: rgb(0x19e6ff, 1.6) });
        P.box(232, 0, 104, 248, 3.4, 104.2, { col: rgb(0x111111) });
        break;
      }
      case 'bank': {
        this.tower(-20, -24, 20, 4, 130, 'glass', rnd, { crown: true, crownColor: 0xffd23f, store: false });
        this.B.office.box(-24, 0, 4, 24, 12, 22, { uw: 24, vh: 28.8, top: false });
        this.roofTop(-24, 4, 24, 22, 12);
        this.collider(-24, 4, 24, 22, 12);
        for (let k = 0; k < 8; k++) {
          const x = -21 + k * 6;
          P.addGeometry(new THREE.CylinderGeometry(0.6, 0.6, 10, 12), new THREE.Matrix4().makeTranslation(x, 5, 23.5), rgb(0xeeeae0));
        }
        P.box(-24.5, 10, 22.5, 24.5, 12.5, 24.4, { col: rgb(0xeeeae0) });
        this.sign(SIGN.BANK, 0, 11.2, 24.45, 8, 0, 1);
        this.addBox(-24, 22, 24, 24.5, -1, 12, 'bld');
        break;
      }
      case 'hospital': {
        this.tower(-264, -184, -216, -142, 26, 'apt', rnd, { tint: 0xf4f7fb, store: false });
        this.sign(SIGN.KLINIK, -240, 22, -141.9, 10, 0, 1);
        A.box(-241.5, 11, -141.95, -238.5, 19, -141.7, { col: [2.5, 0.15, 0.15] });
        A.box(-244, 13.5, -141.95, -236, 16.5, -141.7, { col: [2.5, 0.15, 0.15] });
        break;
      }
      case 'police': {
        this.tower(56, -184, 104, -146, 18, 'apt', rnd, { tint: 0xbfd4f0, store: false });
        this.sign(SIGN.POLIZEI, 80, 14.5, -145.9, 11, 0, 1);
        A.box(56, 17.5, -145.9, 104, 17.8, -145.6, { col: rgb(0x2a6bff, 1.6) });
        this.pois.policeCars = [[66, -139, Math.PI / 2], [94, -139, Math.PI / 2]];
        break;
      }
      case 'gunshop': {
        backHalf('apt', WEST[0], 10, 22);
        this.tower(-176, 166, -150, 184, 6, 'apt', rnd, { tint: 0xc9b79c, store: true });
        this.sign(SIGN.WAFFEN, -163, 7.6, 184.1, 7, 0, 1);
        this.tower(-146, 168, -134, 184, 12, 'apt', rnd, { tint: WEST[3] });
        break;
      }
    }
  }

  genBeach() {
    const rnd = mulberry32(555);
    const P = this.B.props;
    // Palmen
    for (let z = -370; z < 370; z += 11 + rnd() * 10) this.addPalm(378 + rnd() * 14, z, rnd);
    for (let k = 0; k < 40; k++) this.addPalm(395 + rnd() * 25, -370 + rnd() * 740, rnd);
    // Sonnenschirme & Handtücher
    const ucols = [0xff4d6d, 0x3ec1d3, 0xffd166, 0xf8f9fa, 0x06d6a0, 0x9b5de5, 0xff8fab];
    for (let k = 0; k < 70; k++) {
      const x = 400 + rnd() * 40, z = -360 + rnd() * 720;
      if (Math.abs(z - 40) < 14) continue;
      if (this.ramps.some((r) => Math.hypot(r.x - x, r.z - z) < 22)) continue;
      const col = ucols[Math.floor(rnd() * ucols.length)];
      this.umbrellas.push([x, C.sandHeight(x, z), z, rnd() * 6.28, col]);
      this.towels.push([x + 1.5 + rnd(), C.sandHeight(x, z) + 0.03, z + (rnd() - 0.5) * 2, rnd() * 6.28, ucols[Math.floor(rnd() * ucols.length)]]);
      this.addCircle(x, z, 0.15, 2.4, 'pole');
    }
    // Rettungstürme
    const tcols = [0xff9fb2, 0x8fe3cf, 0xffd59a, 0xa7c7ff];
    [-260, -90, 150, 300].forEach((z, k) => {
      const x = 428, y = C.sandHeight(x, z);
      const c = rgb(tcols[k]);
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) P.box(x + ox - 0.12, y - 0.5, z + oz - 0.12, x + ox + 0.12, y + 2.5, z + oz + 0.12, { col: rgb(0xf0f0f0) });
      P.box(x - 1.8, y + 2.5, z - 1.8, x + 1.8, y + 2.7, z + 1.8, { col: rgb(0xf0f0f0) });
      P.box(x - 1.5, y + 2.7, z - 1.5, x + 1.5, y + 4.9, z + 1.5, { col: c });
      P.box(x - 1.9, y + 4.9, z - 1.9, x + 1.9, y + 5.2, z + 1.9, { col: rgb(0xe63946) });
      P.box(x - 3.5, y - 0.2, z - 0.4, x - 1.5, y + 2.5, z + 0.4, { col: rgb(0xd0d0d0) });
      this.addBox(x - 1.8, z - 1.8, x + 1.8, z + 1.8, y + 2.2, y + 5.2, 'tower');
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) this.addCircle(x + ox, z + oz, 0.15, y + 2.5, 'pole');
    });
    // Strandbar
    const bx = 392, bz = 68;
    this.facadeBox('deco', bx - 6, bz - 5, bx + 6, bz + 5, -0.2, 3.6, { rnd, tint: 0x8fe3cf, roof: false });
    this.B.tile.gable(bx - 6, bz - 5, bx + 6, bz + 5, 3.6, 2, true, rgb(0xd9b77e), 1);
    this.sign(SIGN.SURF, bx, 4.6, bz + 6.1, 5, 0, 1);
    this.collider(bx - 6, bz - 5, bx + 6, bz + 5, 6);
    this.pois.beachbar = { x: bx, z: bz + 8 };
  }

  genPier() {
    const P = C.PIER, PP = C.PIER_PLAT;
    const W = this.B.wood;
    // Rampe
    const y0 = -0.45, y1 = P.y;
    W.quad([P.x0, y0, P.z1], [P.rampEnd, y1, P.z1], [P.rampEnd, y1, P.z0], [P.x0, y0, P.z0], [0, 0, 14, 4], null);
    W.box(P.rampEnd, y1 - 0.4, P.z0, P.x1, y1, P.z1, { uw: 4, vh: 4, topScale: 3.5 });
    W.box(PP.x0, y1 - 0.4, PP.z0, PP.x1, y1, PP.z1, { uw: 4, vh: 4, topScale: 3.5 });
    // Pfähle
    this.pierPiles = [];
    for (let x = P.rampEnd; x < P.x1; x += 8) for (const z of [P.z0 + 0.5, P.z1 - 0.5]) this.pierPiles.push([x, z]);
    for (let x = PP.x0 + 2; x < PP.x1; x += 9) for (let z = PP.z0 + 2; z < PP.z1; z += 9) this.pierPiles.push([x, z]);
    // Geländer
    const Pr = this.B.props, rc = rgb(0xf4f1ea);
    const rail = (xa, za, xb, zb) => {
      Pr.box(xa, y1 + 0.95, za, xb, y1 + 1.05, zb, { col: rc });
      Pr.box(xa, y1 + 0.45, za, xb, y1 + 0.52, zb, { col: rc });
      const len = Math.max(xb - xa, zb - za), along = xb - xa > zb - za;
      for (let s = 0; s <= len; s += 2.5) {
        const px = along ? xa + s : xa, pz = along ? za : za + s;
        Pr.box(px, y1, pz, px + 0.12, y1 + 1.05, pz + 0.12, { col: rc });
      }
      this.addBox(xa, za, xb, zb, y1 - 0.1, y1 + 1.1, 'rail');
    };
    rail(P.rampEnd, P.z0, PP.x0, P.z0 + 0.12);
    rail(P.rampEnd, P.z1 - 0.12, PP.x0, P.z1);
    rail(PP.x0, PP.z0, PP.x1, PP.z0 + 0.12);
    rail(PP.x0, PP.z1 - 0.12, PP.x1, PP.z1);
    rail(PP.x1 - 0.12, PP.z0, PP.x1, PP.z1);
    rail(PP.x0, PP.z0, PP.x0 + 0.12, P.z0);
    rail(PP.x0, P.z1, PP.x0 + 0.12, PP.z1);
    // Eingangstor
    const ax = P.rampEnd + 2;
    Pr.box(ax, y1, P.z0 - 0.4, ax + 0.8, y1 + 7.5, P.z0 + 0.4, { col: rgb(0xff8fab) });
    Pr.box(ax, y1, P.z1 - 0.4, ax + 0.8, y1 + 7.5, P.z1 + 0.4, { col: rgb(0xff8fab) });
    Pr.box(ax, y1 + 7.5, P.z0 - 0.6, ax + 0.8, y1 + 8.1, P.z1 + 0.6, { col: rgb(0xff8fab) });
    this.sign(SIGN.PIER, ax - 0.05, y1 + 6, (P.z0 + P.z1) / 2, 9.5, -1, 0);
    this.addBox(ax, P.z0 - 0.4, ax + 0.8, P.z0 + 0.4, y1 - 0.1, y1 + 8, 'post');
    this.addBox(ax, P.z1 - 0.4, ax + 0.8, P.z1 + 0.4, y1 - 0.1, y1 + 8, 'post');
    // Laternen am Pier
    this.pierLamps = [];
    for (let x = P.rampEnd + 15; x < PP.x0; x += 22) { this.pierLamps.push([x, P.z0 + 0.6, 0]); this.pierLamps.push([x, P.z1 - 0.6, Math.PI]); }
    this.pois.pier = { x: 600, z: 40 };
  }

  genHarbor() {
    const Pr = this.B.props;
    // Kräne an der Südkante
    for (const cx of [-330, -250, -170, -90]) {
      const y = 0, yc = rgb(0xf2b705), dk = rgb(0x333333);
      for (const ox of [-5, 5]) for (const z of [374, 382]) {
        Pr.box(cx + ox - 0.5, y, z - 0.5, cx + ox + 0.5, 30, z + 0.5, { col: yc });
        this.addBox(cx + ox - 0.5, z - 0.5, cx + ox + 0.5, z + 0.5, -1, 30, 'crane');
      }
      Pr.box(cx - 5.5, 30, 373, cx + 5.5, 32, 383, { col: yc });
      Pr.box(cx - 1.2, 32, 340, cx + 1.2, 34, 440, { col: yc });
      Pr.box(cx - 3, 34, 362, cx + 3, 38, 372, { col: rgb(0xd0d0d0) });
      Pr.box(cx - 0.1, 14, 425, cx + 0.1, 32, 425.2, { col: dk });
      Pr.box(cx - 1, 13, 424, cx + 1, 14, 426, { col: dk });
    }
    // Frachtschiff
    const sx0 = -330, sx1 = -110, sz0 = 398, sz1 = 426;
    const hull = rgb(0x1d3557), red = rgb(0x8d1b1b);
    Pr.box(sx0, -6, sz0, sx1, -1.5, sz1, { col: red });
    Pr.box(sx0, -1.5, sz0, sx1, 5, sz1, { col: hull });
    Pr.box(sx1, -6, sz0 + 3, sx1 + 12, 5, sz1 - 3, { col: hull });
    Pr.box(sx1 + 12, -4, sz0 + 7, sx1 + 18, 5, sz1 - 7, { col: hull });
    Pr.box(sx0 + 2, 5, sz0 + 3, sx0 + 22, 20, sz1 - 3, { col: rgb(0xf4f4f4) });
    Pr.box(sx0 + 1, 17, sz0 + 1, sx0 + 23, 18.5, sz1 - 1, { col: rgb(0x2b2d42) });
    Pr.box(sx0 + 8, 20, sz0 + 10, sx0 + 14, 28, sz0 + 16, { col: rgb(0xe63946) });
    for (let x = sx0 + 28; x < sx1 - 4; x += 12.6) for (let z = sz0 + 2; z < sz1 - 2; z += 2.6) {
      const st = 1 + Math.floor(Math.random() * 3);
      for (let s = 0; s < st; s++) this.containers.push([x + 6.1, 5 + s * 2.6, z + 1.25, 0, CONTAINER_COLS[Math.floor(Math.random() * 8)]]);
    }
  }

  genQuay() {
    const L = C.LAND, Pr = this.B.props, c = rgb(0xb9b5ad);
    const wall = (x0, z0, x1, z1) => { Pr.box(x0, -0.02, z0, x1, 0.9, z1, { col: c }); this.addBox(x0, z0, x1, z1, -1, 0.9, 'quay'); };
    wall(L.minX, L.minZ, L.maxX, L.minZ + 0.5);
    wall(L.minX, L.maxZ - 0.5, L.maxX, L.maxZ);
    wall(L.minX, L.minZ, L.minX + 0.5, L.maxZ);
    // Poller
    for (let x = L.minX + 10; x < L.maxX; x += 20) {
      Pr.addGeometry(new THREE.CylinderGeometry(0.25, 0.3, 0.8, 8), new THREE.Matrix4().makeTranslation(x, 0.4, L.maxZ - 1.5), rgb(0x2b2b2b));
    }
  }

  genStreetProps() {
    const rnd = mulberry32(777);
    this.lampPos = [];
    this.signalPos = [];
    const addLamp = (x, z, yaw) => {
      const idx = this.lampPos.length;
      this.lampPos.push([x, z, yaw]);
      this.addCircle(x, z, 0.18, 7.5, 'lamp', { lamp: idx });
    };
    const palmy = (x, z) => {
      const [bi, bj] = C.blockOf(x, z);
      const d = C.districtOf(clamp(bi, 0, 8), clamp(bj, 0, 8));
      return d === 'heights' || d === 'seaside' || d === 'westside' || x > 350;
    };
    for (let i = 0; i <= NB; i++) {
      const r = roadPos(i);
      for (let j = 0; j < NB; j++) {
        const s0 = roadPos(j);
        for (const o of [20, 60]) {
          // vertikale Straße x=r
          addLamp(r + 9, s0 + o, -Math.PI / 2);
          addLamp(r - 9, s0 + o + 6, Math.PI / 2);
          // horizontale Straße z=r
          addLamp(s0 + o, r + 9, Math.PI);
          addLamp(s0 + o + 6, r - 9, 0);
        }
        for (const o of [32, 48]) {
          if (palmy(r + 9, s0 + o)) this.addPalm(r + 9, s0 + o, rnd, true);
          if (palmy(r - 9, s0 + o)) this.addPalm(r - 9, s0 + o, rnd, true);
          if (palmy(s0 + o, r + 9)) this.addPalm(s0 + o, r + 9, rnd, true);
          if (palmy(s0 + o, r - 9)) this.addPalm(s0 + o, r - 9, rnd, true);
        }
      }
    }
    // Ampeln
    for (const n of this.nodes) {
      const heads = [[9.5, 9.5, 0], [-9.5, -9.5, Math.PI], [-9.5, 9.5, -Math.PI / 2], [9.5, -9.5, Math.PI / 2]];
      for (const [ox, oz, yaw] of heads) {
        this.signalPos.push([n.x + ox, n.z + oz, yaw]);
        this.addCircle(n.x + ox, n.z + oz, 0.22, 6, 'signal', { sig: this.signalPos.length - 1 });
      }
      this.signalState.push('');
    }
  }

  genRamps() {
    const Pr = this.B.props;
    for (const r of this.ramps) {
      const fx = r.fx, fz = r.fz, rx = fz, rz = -fx, hw = r.wid / 2;
      const base = r.x > C.BEACH_X0 ? C.sandHeight(r.x, r.z) - 0.3 : 0;
      const p0l = [r.x - rx * hw, base, r.z - rz * hw], p0r = [r.x + rx * hw, base, r.z + rz * hw];
      const ex = r.x + fx * r.len, ez = r.z + fz * r.len;
      const topY = (r.x > C.BEACH_X0 ? C.sandHeight(ex, ez) : 0) + r.h;
      const p1l = [ex - rx * hw, topY, ez - rz * hw], p1r = [ex + rx * hw, topY, ez + rz * hw];
      const b1l = [ex - rx * hw, base, ez - rz * hw], b1r = [ex + rx * hw, base, ez + rz * hw];
      const cTop = rgb(0x8a8f96), cSide = rgb(0xf2b705), cBack = rgb(0x333333);
      Pr.quad(p0r, p0l, p1l, p1r, [0, 0, 1, 1], cTop);
      Pr.quad(p0l, p0r, p0r, p0l, [0, 0, 1, 1], cTop);
      Pr.quad(b1l, b1r, p1r, p1l, [0, 0, 1, 1], cBack);
      Pr.tri(p0l, b1l, p1l, undefined, cSide);
      Pr.tri(p0r, p1r, b1r, undefined, cSide);
      // Pfeil-Markierung
      this.B.accent.quad([r.x - rx * 0.6 + fx * 2, base + r.h * 2 / r.len + 0.05, r.z - rz * 0.6 + fz * 2], [r.x + rx * 0.6 + fx * 2, base + r.h * 2 / r.len + 0.05, r.z + rz * 0.6 + fz * 2],
        [r.x + fx * 5, base + r.h * 5 / r.len + 0.05, r.z + fz * 5], [r.x + fx * 5, base + r.h * 5 / r.len + 0.05, r.z + fz * 5], [0, 0, 1, 1], rgb(0xffd23f, 1.3));
    }
  }

  addPalm(x, z, rnd, street = false) {
    this.palmPos.push([x, z, 0.75 + rnd() * 0.5, rnd() * Math.PI * 2]);
    this.addCircle(x, z, 0.32, 9, 'palm');
  }
  addTree(x, z, rnd) {
    this.treePos.push([x, z, 0.8 + rnd() * 0.5, rnd() * Math.PI * 2]);
    this.addCircle(x, z, 0.45, 6, 'tree');
  }

  // ------------------------------------------------------- Meshes bauen
  finalizeMeshes() {
    const add = (b, mat, cast = true, recv = true) => {
      if (!b || b.empty) return null;
      const m = new THREE.Mesh(b.build(), mat);
      m.castShadow = cast; m.receiveShadow = recv;
      m.matrixAutoUpdate = false; m.updateMatrix();
      this.scene.add(m);
      return m;
    };
    const B = this.B, M = this.M;
    for (const k of ['glass', 'office', 'apt', 'deco', 'warehouse', 'house']) add(B[k], M[k]);
    add(B.store, M.store);
    add(B.roof, M.roof, false, true);
    add(B.tile, M.tile);
    add(B.props, M.props);
    add(B.accent, M.accent, false, false);
    add(B.signs, M.signs, false, false);
    add(B.bill, M.bill, false, true);
    add(B.grass, M.grass, false, true);
    add(B.concrete, M.concrete, false, true);
    add(B.wood, M.wood, true, true);
    add(B.poolw, M.poolw, false, false);
    this.B = null;
  }

  buildInstanced() {
    const scene = this.scene;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);
    const setM = (im, i, x, y, z, yaw, sc = 1) => { q.setFromAxisAngle(up, yaw); s.set(sc, sc, sc); p.set(x, y, z); mtx.compose(p, q, s); im.setMatrixAt(i, mtx); };

    // Palmen
    const trunk = new THREE.CylinderGeometry(0.17, 0.3, 8.5, 7, 10, true);
    trunk.translate(0, 4.25, 0);
    const tp = trunk.attributes.position, tc = [];
    for (let k = 0; k < tp.count; k++) {
      const y = tp.getY(k);
      tp.setX(k, tp.getX(k) + Math.pow(y / 8.5, 2) * 1.1);
      const ring = (Math.floor(y * 2.2) % 2) ? 0.85 : 1;
      const c = rgb(0x8a6a48, ring);
      tc.push(...c);
    }
    trunk.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
    trunk.computeVertexNormals();
    const crown = new GeoBuilder(true);
    const top = [1.1, 8.4, 0];
    for (let f = 0; f < 10; f++) {
      const a = (f / 10) * Math.PI * 2 + (f % 2) * 0.2;
      const L = 3.6 + (f % 3) * 0.5, segs = 6;
      const dx = Math.cos(a), dz = Math.sin(a);
      const rx = -dz, rz = dx;
      let prev = null;
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const cx = top[0] + dx * t * L, cz = top[2] + dz * t * L;
        const cy = top[1] + Math.sin(t * Math.PI * 0.55) * 1.0 - t * t * 2.4;
        const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.75 + 0.05;
        const l = [cx + rx * w, cy - w * 0.35, cz + rz * w], r = [cx - rx * w, cy - w * 0.35, cz - rz * w], m = [cx, cy, cz];
        if (prev) {
          const g1 = rgb(0x2f7d32, 0.85 + (f % 3) * 0.08), g2 = rgb(0x4caf50, 0.9);
          crown.quad(prev.m, m, l, prev.l, [0, 0, 1, 1], g1);
          crown.quad(prev.r, r, m, prev.m, [0, 0, 1, 1], g2);
        }
        prev = { l, r, m };
      }
    }
    const crownGeo = crown.build();
    const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const crownMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    const n = this.palmPos.length;
    const tIM = new THREE.InstancedMesh(trunk, palmMat, n), cIM = new THREE.InstancedMesh(crownGeo, crownMat, n);
    this.palmPos.forEach(([x, z, sc, yaw], i) => { const y = this.groundHeight(x, z); setM(tIM, i, x, y, z, yaw, sc); setM(cIM, i, x, y, z, yaw, sc); });
    for (const im of [tIM, cIM]) { im.castShadow = true; im.receiveShadow = false; im.computeBoundingSphere(); scene.add(im); }

    // Laubbäume
    const tb = new GeoBuilder(true);
    tb.addGeometry(new THREE.CylinderGeometry(0.22, 0.32, 3.4, 6).translate(0, 1.7, 0), new THREE.Matrix4(), rgb(0x6b4a2f));
    const can = new THREE.IcosahedronGeometry(2.6, 1);
    can.scale(1, 0.85, 1); can.translate(0, 5, 0); can.computeVertexNormals();
    const cc = [];
    for (let k = 0; k < can.attributes.position.count; k += 3) { const v = 0.75 + Math.random() * 0.35; const c = rgb(0x3f8f3a, v); cc.push(...c, ...c, ...c); }
    can.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    tb.addGeometry(can, new THREE.Matrix4());
    const treeIM = new THREE.InstancedMesh(tb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), Math.max(1, this.treePos.length));
    this.treePos.forEach(([x, z, sc, yaw], i) => setM(treeIM, i, x, 0, z, yaw, sc));
    treeIM.count = this.treePos.length;
    treeIM.castShadow = true; treeIM.computeBoundingSphere(); scene.add(treeIM);

    // Straßenlaternen
    const lb = new GeoBuilder(true), dark = rgb(0x2e3136);
    lb.addGeometry(new THREE.CylinderGeometry(0.08, 0.13, 7.6, 6).translate(0, 3.8, 0), new THREE.Matrix4(), dark);
    lb.box(-0.05, 7.3, 0, 0.05, 7.42, 2.3, { col: dark });
    lb.box(-0.2, 7.2, 1.9, 0.2, 7.42, 2.7, { col: dark });
    const lampGeo = lb.build();
    const glowGeo = new THREE.BoxGeometry(0.3, 0.06, 0.7).translate(0, 7.17, 2.3);
    const poolGeo = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(0, 0.04, 3.2);
    const all = [...this.lampPos, ...this.pierLamps.map(([x, z, yaw]) => [x, z, yaw])];
    this.lampCount = all.length;
    this.lampIM = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), all.length);
    this.lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe0b0 });
    this.lampGlowIM = new THREE.InstancedMesh(glowGeo, this.lampGlowMat, all.length);
    this.poolMat = new THREE.MeshBasicMaterial({ map: this.tex.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.poolIM = new THREE.InstancedMesh(poolGeo, this.poolMat, all.length);
    this.poolIM.renderOrder = 2;
    all.forEach(([x, z, yaw], i) => {
      const y = this.groundHeight(x, z);
      setM(this.lampIM, i, x, y, z, yaw); setM(this.lampGlowIM, i, x, y, z, yaw); setM(this.poolIM, i, x, y, z, yaw);
      this.lamps.push({ x, z, yaw, y, fall: 0, dir: 0, broken: false, timer: 0 });
    });
    for (const im of [this.lampIM, this.lampGlowIM, this.poolIM]) { im.computeBoundingSphere(); scene.add(im); }
    this.lampIM.castShadow = true;

    // Ampeln
    const sb = new GeoBuilder(true), sd = rgb(0x22252a);
    sb.addGeometry(new THREE.CylinderGeometry(0.1, 0.13, 4.5, 6).translate(0, 2.25, 0), new THREE.Matrix4(), sd);
    sb.box(-0.22, 4.3, -0.18, 0.22, 5.6, 0.14, { col: sd });
    sb.box(-0.3, 4.25, -0.2, 0.3, 5.65, -0.16, { col: rgb(0x111111) });
    const sigIM = new THREE.InstancedMesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), this.signalPos.length);
    const lampSph = (y) => new THREE.SphereGeometry(0.12, 8, 6).translate(0, y, 0.15);
    this.sigLamps = [lampSph(5.35), lampSph(4.95), lampSph(4.55)].map((g) => new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.signalPos.length));
    const dim = new THREE.Color(0.08, 0.08, 0.08);
    this.signalPos.forEach(([x, z, yaw], i) => {
      setM(sigIM, i, x, 0, z, yaw);
      for (const L of this.sigLamps) { setM(L, i, x, 0, z, yaw); L.setColorAt(i, dim); }
    });
    sigIM.computeBoundingSphere(); sigIM.castShadow = true; scene.add(sigIM);
    for (const L of this.sigLamps) { L.computeBoundingSphere(); scene.add(L); }
    this.sigIM = sigIM;
    this.signals = this.signalPos.map(([x, z, yaw]) => ({ x, z, yaw, y: 0, fall: 0, broken: false, timer: 0 }));

    // Container
    const cg = new THREE.BoxGeometry(12.2, 2.6, 2.44);
    cg.translate(0, 1.3, 0);
    const cIM2 = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ map: this.tex.container, roughness: 0.7, metalness: 0.3 }), Math.max(1, this.containers.length));
    const col = new THREE.Color();
    this.containers.forEach(([x, y, z, yaw, c], i) => { setM(cIM2, i, x, y, z, yaw); cIM2.setColorAt(i, col.setHex(c)); });
    cIM2.count = this.containers.length;
    cIM2.castShadow = true; cIM2.receiveShadow = true; cIM2.computeBoundingSphere(); scene.add(cIM2);

    // Sonnenschirme
    const ub = new GeoBuilder(true);
    ub.addGeometry(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5).translate(0, 1.2, 0), new THREE.Matrix4(), rgb(0xeeeeee));
    const umbrellaTop = new THREE.ConeGeometry(1.6, 0.6, 8, 1, true).translate(0, 2.4, 0);
    ub.addGeometry(umbrellaTop, new THREE.Matrix4());
    const uIM = new THREE.InstancedMesh(ub.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), this.umbrellas.length);
    this.umbrellas.forEach(([x, y, z, yaw, c], i) => { setM(uIM, i, x, y, z, yaw); uIM.setColorAt(i, col.setHex(c)); });
    uIM.castShadow = true; uIM.computeBoundingSphere(); scene.add(uIM);
    const towelGeo = new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2);
    const twIM = new THREE.InstancedMesh(towelGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), this.towels.length);
    this.towels.forEach(([x, y, z, yaw, c], i) => { setM(twIM, i, x, y, z, yaw); twIM.setColorAt(i, col.setHex(c)); });
    twIM.receiveShadow = true; twIM.computeBoundingSphere(); scene.add(twIM);

    // Pierpfähle
    const pileGeo = new THREE.CylinderGeometry(0.35, 0.35, 8, 6).translate(0, -4 + C.PIER.y - 0.4, 0);
    const pIM = new THREE.InstancedMesh(pileGeo, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }), this.pierPiles.length);
    this.pierPiles.forEach(([x, z], i) => { setM(pIM, i, x, 0, z, 0); });
    pIM.computeBoundingSphere(); scene.add(pIM);

    // Blob-Schatten-Material (für Fahrzeuge/Figuren)
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.tex.blob, transparent: true, depthWrite: false });
  }

  buildWheel() {
    const PP = C.PIER_PLAT;
    const cx = 632, cz = 40, cy = C.PIER.y + 29, R = 24;
    const g = new THREE.Group();
    g.position.set(cx, cy, cz);
    const white = new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.4, metalness: 0.5 });
    const wheel = new THREE.Group();
    for (const ox of [-1.6, 1.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.35, 6, 64), white);
      rim.rotation.y = Math.PI / 2; rim.position.x = ox; wheel.add(rim);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.2, 5, 48), white);
      inner.rotation.y = Math.PI / 2; inner.position.x = ox; wheel.add(inner);
    }
    const spokeG = new THREE.BoxGeometry(0.18, R, 0.18).translate(0, R / 2, 0);
    for (let k = 0; k < 16; k++) for (const ox of [-1.6, 1.6]) {
      const s = new THREE.Mesh(spokeG, white);
      s.position.x = ox; s.rotation.x = (k / 16) * Math.PI * 2; wheel.add(s);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.2, 16), white);
    hub.rotation.z = Math.PI / 2; wheel.add(hub);
    g.add(wheel);
    // Stützen
    const legLen = Math.hypot(cy - C.PIER.y, 14);
    const legG = new THREE.BoxGeometry(0.8, legLen, 0.8);
    for (const ox of [-3.2, 3.2]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legG, white);
      leg.position.set(ox, -(cy - C.PIER.y) / 2, sz * 7);
      leg.rotation.x = -sz * Math.atan2(14, cy - C.PIER.y);
      leg.castShadow = true;
      g.add(leg);
      this.addBox(cx + ox - 0.6, cz + sz * 14 - 1, cx + ox + 0.6, cz + sz * 14 + 1, C.PIER.y - 0.5, cy, 'post');
    }
    // Gondeln
    const gondG = new THREE.BoxGeometry(2.6, 2.2, 2.4).translate(0, -1.6, 0);
    this.gondolas = new THREE.InstancedMesh(gondG, new THREE.MeshStandardMaterial({ roughness: 0.5 }), 16);
    const cols = [0xff4d6d, 0x3ec1d3, 0xffd166, 0x9b5de5];
    for (let k = 0; k < 16; k++) this.gondolas.setColorAt(k, new THREE.Color(cols[k % 4]));
    this.gondolas.frustumCulled = false;
    g.add(this.gondolas);
    // Lichter
    const pts = [];
    for (let k = 0; k < 96; k++) {
      const a = (k / 96) * Math.PI * 2;
      for (const ox of [-1.6, 1.6]) pts.push(ox, Math.sin(a) * R, Math.cos(a) * R);
    }
    for (let k = 0; k < 16; k++) for (let t = 0.15; t < 1; t += 0.17) {
      const a = (k / 16) * Math.PI * 2;
      pts.push(0, Math.sin(a + Math.PI / 2) * R * t, Math.cos(a + Math.PI / 2) * R * t);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lc = new Float32Array(pts.length);
    lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    this.wheelLightCols = lc;
    this.wheelLightMat = new THREE.PointsMaterial({ size: 1.4, map: this.tex.glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.wheelLights = new THREE.Points(lg, this.wheelLightMat);
    wheel.add(this.wheelLights);
    this.wheel = wheel; this.wheelGroup = g; this.wheelR = R;
    this.scene.add(g);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  buildBoats() {
    const mk = (len, col) => {
      const b = new GeoBuilder(true);
      const w = len * 0.32;
      const hull = new THREE.Shape();
      hull.moveTo(-len / 2, 0.3); hull.lineTo(len / 2 - 1.5, 0.3); hull.lineTo(len / 2, 1.6); hull.lineTo(-len / 2, 1.6); hull.lineTo(-len / 2, 0.3);
      const hg = new THREE.ExtrudeGeometry(hull, { depth: w, bevelEnabled: false });
      hg.rotateY(-Math.PI / 2); hg.translate(w / 2, -0.8, 0);
      b.addGeometry(hg, new THREE.Matrix4(), rgb(0xf6f6f6));
      b.box(-w / 2 - 0.01, 0.2, -len / 2, w / 2 + 0.01, 0.45, len / 2 - 1.6, { col: rgb(col) });
      b.box(-w / 2 + 0.4, 0.8, -len / 2 + 1, w / 2 - 0.4, 2.2, len * 0.1, { col: rgb(0xffffff) });
      b.box(-w / 2 + 0.45, 1.4, -len / 2 + 1.1, w / 2 - 0.45, 2.0, len * 0.1 + 0.02, { col: rgb(0x203040) });
      b.box(-w / 2 + 0.8, 2.2, -len / 2 + 2, w / 2 - 0.8, 3.0, len * -0.05, { col: rgb(0xffffff) });
      return b.build();
    };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
    const spots = [[520, -160, 0.4, 16, 0x1d3557], [565, 230, 2.2, 22, 0x0077b6], [720, -320, 1.0, 30, 0x2a2a2a], [500, 330, 3.0, 14, 0xe63946], [690, 120, 0.2, 26, 0x1d3557], [470, -40, 1.7, 12, 0x06d6a0]];
    for (const [x, z, h, len, c] of spots) {
      const m = new THREE.Mesh(mk(len, c), mat);
      m.position.set(x, C.WATER_Y, z); m.rotation.y = h; m.castShadow = true;
      this.scene.add(m);
      this.boats.push({ m, x, z, h, ph: Math.random() * 6 });
      this.addBox(x - len * 0.3, z - len * 0.3, x + len * 0.3, z + len * 0.3, -6, 2, 'boat');
    }
  }

  // ------------------------------------------------------------- Karte
  drawMap() {
    const S = 1024;
    const MB = { x0: -480, x1: 760, z0: -620, z1: 620 };
    this.mapBounds = MB;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const sx = (x) => ((x - MB.x0) / (MB.x1 - MB.x0)) * S, sz = (z) => ((z - MB.z0) / (MB.z1 - MB.z0)) * S;
    const sc = S / (MB.x1 - MB.x0);
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, '#0f3550'); gr.addColorStop(1, '#0b2a40');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // Strand
    g.fillStyle = '#d8c08a';
    g.beginPath();
    g.moveTo(sx(C.BEACH_X0), sz(-460));
    for (let z = -460; z <= 460; z += 10) {
      let x = C.BEACH_X0;
      while (x < C.BEACH_X0 + 200 && C.sandHeight(x, z) > C.WATER_Y) x += 2;
      g.lineTo(sx(x), sz(z));
    }
    g.lineTo(sx(C.BEACH_X0), sz(460));
    g.fill();
    // Land
    const L = C.LAND;
    g.fillStyle = '#3c414a';
    g.fillRect(sx(L.minX), sz(L.minZ), (L.maxX - L.minX) * sc, (L.maxZ - L.minZ) * sc);
    // Blöcke
    const dcol = { downtown: '#4e5361', midtown: '#4a4e58', westside: '#4d4a52', heights: '#45524a', seaside: '#5a4d5c', harbor: '#4a4f55' };
    for (let bj = 0; bj < NB; bj++) for (let bi = 0; bi < NB; bi++) {
      const x0 = roadPos(bi) + 8, z0 = roadPos(bj) + 8;
      g.fillStyle = C.isPark(bi, bj) ? '#3f7a3a' : (dcol[C.districtOf(bi, bj)] || '#4a4e58');
      g.fillRect(sx(x0), sz(z0), (CELL - 16) * sc, (CELL - 16) * sc);
    }
    // Gebäude
    g.fillStyle = 'rgba(20,22,28,0.55)';
    for (const [x0, z0, x1, z1] of this.footprints) g.fillRect(sx(x0), sz(z0), (x1 - x0) * sc, (z1 - z0) * sc);
    // Straßen
    g.strokeStyle = '#8d929c'; g.lineWidth = 16 * sc;
    for (let i = 0; i <= NB; i++) {
      const r = roadPos(i);
      g.beginPath(); g.moveTo(sx(r), sz(-HALF - 8)); g.lineTo(sx(r), sz(HALF + 8)); g.stroke();
      g.beginPath(); g.moveTo(sx(-HALF - 8), sz(r)); g.lineTo(sx(HALF + 8), sz(r)); g.stroke();
    }
    // Pier
    g.fillStyle = '#9a7650';
    g.fillRect(sx(C.PIER.x0), sz(C.PIER.z0), (C.PIER.x1 - C.PIER.x0) * sc, (C.PIER.z1 - C.PIER.z0) * sc);
    g.fillRect(sx(C.PIER_PLAT.x0), sz(C.PIER_PLAT.z0), (C.PIER_PLAT.x1 - C.PIER_PLAT.x0) * sc, (C.PIER_PLAT.z1 - C.PIER_PLAT.z0) * sc);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(sx(632), sz(40), 24 * sc, 0, 7); g.stroke();
    // Schiff
    g.fillStyle = '#26324a'; g.fillRect(sx(-330), sz(398), 238 * sc, 28 * sc);
    this.mapCanvas = c;
    this.mapScale = sc;
    this.mapToPx = (x, z) => [sx(x), sz(z)];
  }

  // ----------------------------------------------------------- Update
  // Laterne oder Ampel umfahren
  knockPole(c, dx, dz) {
    if (!c.alive) return false;
    let L = null;
    if (c.kind === 'lamp') L = this.lamps[c.lamp];
    else if (c.kind === 'signal') L = this.signals[c.sig];
    if (!L || L.broken) return false;
    c.alive = false;
    L.broken = true; L.fall = 0.001; L.timer = 0; L.circle = c;
    const len = Math.hypot(dx, dz) || 1;
    L.ax = dz / len; L.az = -dx / len;
    if (c.kind === 'signal') {
      const dim = new THREE.Color(0.05, 0.05, 0.05);
      for (const S of this.sigLamps) { S.setColorAt(c.sig, dim); S.instanceColor.needsUpdate = true; }
    }
    return true;
  }
  knockLamp(c, dx, dz) { return this.knockPole(c, dx, dz); }

  // Fallanimation & spätere Reparatur (außer Sicht)
  animatePoles(list, meshes, dt, onRestore) {
    const m = this._pm || (this._pm = new THREE.Matrix4());
    const q = this._pq || (this._pq = new THREE.Quaternion()), qy = this._pqy || (this._pqy = new THREE.Quaternion());
    const p = this._pp || (this._pp = new THREE.Vector3()), s = this._ps || (this._ps = new THREE.Vector3(1, 1, 1));
    const ax = this._pa || (this._pa = new THREE.Vector3()), up = THREE.Object3D.DEFAULT_UP;
    let dirty = false;
    for (let i = 0; i < list.length; i++) {
      const L = list[i];
      if (!L.broken) continue;
      L.timer += dt;
      if (L.fall < 1) { L.fall = Math.min(1, L.fall + dt * (0.6 + L.fall * 3)); dirty = true; }
      p.set(L.x, L.y, L.z);
      if (L.timer > 90) {
        const dx = L.x - G.camera.position.x, dz = L.z - G.camera.position.z;
        if (dx * dx + dz * dz > 150 * 150) {
          L.broken = false; L.fall = 0; dirty = true;
          if (L.circle) L.circle.alive = true;
          qy.setFromAxisAngle(up, L.yaw); m.compose(p, qy, s);
          for (const im of meshes) im.setMatrixAt(i, m);
          if (onRestore) onRestore(i);
          continue;
        }
      }
      ax.set(L.ax || 1, 0, L.az || 0);
      q.setFromAxisAngle(ax, L.fall * Math.PI * 0.47);
      qy.setFromAxisAngle(up, L.yaw);
      q.multiply(qy);
      m.compose(p, q, s);
      for (const im of meshes) im.setMatrixAt(i, m);
    }
    if (dirty) for (const im of meshes) im.instanceMatrix.needsUpdate = true;
    return dirty;
  }

  update(dt) {
    const night = G.world.env ? G.world.env.night : 0;
    // Nachtbeleuchtung
    const n = night;
    for (const k of ['glass', 'office', 'apt', 'deco', 'warehouse', 'house', 'store']) this.M[k].emissiveIntensity = n * (k === 'store' ? 1.6 : 1.25);
    this.M.bill.emissiveIntensity = n * 0.9;
    this.M.accent.color.setScalar(lerp(0.35, 1.0, n));
    this.M.signs.color.setScalar(lerp(0.55, 1.5, n) * (0.94 + 0.06 * Math.sin(G.time * 40) * (Math.sin(G.time * 1.3) > 0.97 ? 1 : 0)));
    this.lampGlowMat.color.setRGB(lerp(0.5, 3.0, n), lerp(0.45, 2.4, n), lerp(0.4, 1.6, n));
    this.poolMat.opacity = n * 0.9;
    this.poolIM.visible = n > 0.02;
    this.M.poolw.emissiveIntensity = 0.3 + n * 1.5;

    // Ampeln
    const red = new THREE.Color(3.2, 0.25, 0.15), yel = new THREE.Color(3, 1.9, 0.1), grn = new THREE.Color(0.2, 3, 0.8), dim = new THREE.Color(0.07, 0.07, 0.07);
    let changed = false;
    for (const node of this.nodes) {
      const ns = this.signal(node.id, true), ew = this.signal(node.id, false);
      const key = ns + ew;
      if (this.signalState[node.id] === key) continue;
      this.signalState[node.id] = key;
      changed = true;
      for (let k = 0; k < 4; k++) {
        const st = k < 2 ? ns : ew;
        const i = node.id * 4 + k;
        if (this.signals[i].broken) continue;
        this.sigLamps[0].setColorAt(i, st === 'R' ? red : dim);
        this.sigLamps[1].setColorAt(i, st === 'Y' ? yel : dim);
        this.sigLamps[2].setColorAt(i, st === 'G' ? grn : dim);
      }
    }
    if (changed) for (const L of this.sigLamps) L.instanceColor.needsUpdate = true;

    // Umgefahrene Laternen & Ampeln
    const zero = this._zero || (this._zero = new THREE.Matrix4().makeScale(0, 0, 0));
    if (this.animatePoles(this.lamps, [this.lampIM, this.lampGlowIM], dt, (i) => {
      const L = this.lamps[i], mm = new THREE.Matrix4().compose(new THREE.Vector3(L.x, L.y, L.z), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, L.yaw), new THREE.Vector3(1, 1, 1));
      this.poolIM.setMatrixAt(i, mm);
    })) {
      for (let i = 0; i < this.lamps.length; i++) if (this.lamps[i].broken) this.poolIM.setMatrixAt(i, zero);
      this.poolIM.instanceMatrix.needsUpdate = true;
    }
    this.animatePoles(this.signals, [this.sigIM, ...this.sigLamps], dt, (i) => { this.signalState[Math.floor(i / 4)] = ''; });

    // Riesenrad
    if (this.wheel) {
      this.wheel.rotation.x += dt * 0.06;
      const mm = new THREE.Matrix4();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + this.wheel.rotation.x;
        mm.makeTranslation(0, Math.sin(a) * this.wheelR, Math.cos(a) * this.wheelR);
        this.gondolas.setMatrixAt(k, mm);
      }
      this.gondolas.instanceMatrix.needsUpdate = true;
      // Lichter (Farbverlauf)
      const lc = this.wheelLightCols, t = G.time;
      const bright = lerp(0.25, 1.4, n);
      for (let k = 0; k < lc.length / 3; k++) {
        const h = (k * 0.013 + t * 0.12) % 1;
        const r = 0.5 + 0.5 * Math.sin((h) * 6.283), gg = 0.5 + 0.5 * Math.sin((h + 0.33) * 6.283), b = 0.5 + 0.5 * Math.sin((h + 0.66) * 6.283);
        lc[k * 3] = r * bright; lc[k * 3 + 1] = gg * bright; lc[k * 3 + 2] = b * bright;
      }
      this.wheelLights.geometry.attributes.color.needsUpdate = true;
      this.wheelLightMat.size = lerp(0.9, 1.6, n);
    }
    // Boote schaukeln
    for (const b of this.boats) {
      b.ph += dt;
      b.m.position.y = C.WATER_Y + Math.sin(b.ph * 0.9) * 0.15;
      b.m.rotation.z = Math.sin(b.ph * 0.7) * 0.03;
      b.m.rotation.x = Math.sin(b.ph * 0.5 + 1) * 0.02;
    }
  }
}
