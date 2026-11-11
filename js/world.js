// Port Solera – prozedurale Stadt
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import * as TX from './textures.js';
import { GeoBuilder, rgb } from './geo.js';
import { mulberry32, lerp, clamp, smoothstep } from './utils.js';
import { rayBox as rayBoxW } from './physics.js';
import { TEX, applyDetail, WET } from './realism.js';

const { CELL, NB, HALF, WALK_HW, roadPos, I0 } = C;

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


// Gelände, Landstraßen & Orte: siehe terrain.js
import { vnoise, fbm, HILLS, CAUSEWAY, VILLAGE, MANSION, LOOKOUT, AIRFIELD, HILL_ROAD, SUMMIT_ROAD, SUMMIT_JOIN, HILL_ROADS, hillRoadAt, hillHeight, terrainExact, buildHeightmap, GRID, GW, GD, NET, netRoute, netLocate, GATES , JUNCTIONS } from './terrain.js';
export { HILLS, CAUSEWAY, VILLAGE, MANSION, HILL_ROAD, SUMMIT_ROAD, hillHeight };

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

  // yHint: aktuelle Höhe des Objekts – unter Brücken gilt dann das Tal statt der Fahrbahn
  groundHeight(x, z, yHint) {
    const PL = this.platforms;
    if (PL) for (let i = 0; i < PL.length; i++) { const p = PL[i]; if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.y; }
    if (z < -384 && z > -492) for (const CW of C.CAUSEWAYS) if (x > CW.x0 && x < CW.x1) return lerp(0, CW.y1, (CW.z1 - z) / (CW.z1 - CW.z0));
    if (z < HILLS.z1) {
      const r = hillRoadAt(x, z);
      if (r && r[0] < 5.2 && !(yHint !== undefined && yHint < r[1] - 3 && HILL_ROADS[r[2]].bridge[r[3]])) return r[1];
      return hillHeight(x, z);
    }
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
    for (let j = 0; j <= NB; j++) for (let i = I0; i <= NB; i++) {
      const n = { id: C.nodeId(i, j), i, j, x: roadPos(i), z: roadPos(j), nbr: [], off: rnd() * 26 };
      this.nodes.push(n);
    }
    for (const n of this.nodes) {
      if (n.i > I0) n.nbr.push(C.nodeId(n.i - 1, n.j));
      if (n.i < NB) n.nbr.push(C.nodeId(n.i + 1, n.j));
      if (n.j > 0) n.nbr.push(C.nodeId(n.i, n.j - 1));
      if (n.j < NB) n.nbr.push(C.nodeId(n.i, n.j + 1));
    }
  }
  nearestNode(x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), I0, NB), j = clamp(Math.round((z + HALF) / CELL), 0, NB);
    return this.nodes[C.nodeId(i, j)];
  }
  // ---------------------------------------------------------- Landstraßen-Netz (Navigation, KI)
  buildHillNet() {
    this.net = NET;
    for (const g of GATES) g.city = this.nodes[C.nodeId(g.gate[0], g.gate[1])];
    this.hillGate = GATES[0].city;
  }
  inHills(x, z) { return z < -372; }
  netLocate(x, z) { return netLocate(x, z); }
  gridPath(ax, az, bx, bz) { const a = this.nearestNode(ax, az), b = this.nearestNode(bx, bz); return this.route(a.id, b.id).map((id) => [this.nodes[id].x, this.nodes[id].z]); }
  // Punkte entlang einer Kante von Index i0 nach i1 (beide Richtungen)
  edgeSlice(e, i0, i1) { const out = []; if (i0 <= i1) for (let i = i0; i <= i1; i++) out.push(e.pts[i]); else for (let i = i0; i >= i1; i--) out.push(e.pts[i]); return out; }
  // Weg im Landstraßennetz. Start/Ziel: { node } oder { edge, idx }
  netPath(A, B) {
    const E = NET.edges;
    if (A.edge != null && B.edge != null && A.edge === B.edge) return this.edgeSlice(E[A.edge], A.idx, B.idx);
    const ends = (S, out) => {
      if (S.node != null) return [{ n: S.node, cost: 0, pts: [] }];
      const e = E[S.edge], f = S.idx / (e.pts.length - 1);
      const toA = this.edgeSlice(e, S.idx, 0), toB = this.edgeSlice(e, S.idx, e.pts.length - 1);
      return [{ n: e.a, cost: e.len * f, pts: out ? toA : toA.slice().reverse() }, { n: e.b, cost: e.len * (1 - f), pts: out ? toB : toB.slice().reverse() }];
    };
    let best = null;
    for (const a of ends(A, true)) for (const b of ends(B, false)) {
      const r = netRoute(a.n, b.n), len = a.cost + r.len + b.cost;
      if (!best || len < best.len) best = { len, a, b, r };
    }
    if (!best || best.len > 1e17) return [];
    const out = [...best.a.pts];
    for (const [ei, dir] of best.r.steps) { const e = E[ei]; out.push(...(dir > 0 ? e.pts : e.pts.slice().reverse())); }
    out.push(...best.b.pts);
    out.len = best.len;
    return out;
  }
  // Navigationsroute (Stadt-Graph + Landstraßen), endet am Ziel
  gpsPath(ax, az, bx, bz) {
    const aH = this.inHills(ax, az), bH = this.inHills(bx, bz);
    let out;
    if (!aH && !bH) out = this.gridPath(ax, az, bx, bz);
    else if (aH && bH) out = this.netPath(netLocate(ax, az), netLocate(bx, bz));
    else {
      // über den günstigeren Damm
      const cx = aH ? bx : ax, cz = aH ? bz : az, loc = netLocate(aH ? ax : bx, aH ? az : bz);
      let best = null;
      for (const g of GATES) {
        const np = this.netPath({ node: g.id }, loc);
        const len = (np.len || 0) + Math.abs(g.city.x - cx) + Math.abs(g.city.z - cz);
        if (!best || len < best.len) best = { len, g, np };
      }
      const grid = this.gridPath(cx, cz, best.g.city.x, best.g.city.z);
      out = aH ? [...best.np.slice().reverse(), ...grid.reverse()] : [...grid, ...best.np];
    }
    out = out.slice();
    out.push([bx, bz]);
    return out;
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
    this.buildHillNet();
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
    this.B.asph = new GeoBuilder(false);
    this.B.walk = new GeoBuilder(false);
    this.palmPos = []; this.treePos = []; this.containers = []; this.umbrellas = []; this.towels = [];
    for (let bj = 0; bj < NB; bj++) for (let bi = I0; bi < NB; bi++) this.genBlock(bi, bj);
    await tick(0.55, 'Strand & Pier werden angelegt …');
    this.genBeach();
    this.genPier();
    this.genHarbor();
    this.genQuay();
    this.genDocks();
    this.genStreetProps();
    this.genRamps();
    await tick(0.62, 'Berge werden geformt …');
    this.genHills();
    this.genEntrances();
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
    const fac = (t, o = {}) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7, metalness: 0.05, ...o, ...(t.rm ? { roughnessMap: t.rm, metalnessMap: t.rm, roughness: 1, metalness: 1, envMapIntensity: 1.2 } : {}) });
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
    this.M.asph = new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this.M.walk = new THREE.MeshStandardMaterial({ color: 0xb4b0a8, roughness: 0.9 });
    // Matte Flächen spiegeln den Himmel kaum (sonst Blaustich)
    for (const k of ['road', 'land', 'concrete', 'grass', 'sand', 'roof', 'tile', 'wood', 'asph', 'walk']) this.M[k].envMapIntensity = 0.35;
    this.M.signs.color.setScalar(0.6);
    // Fotorealistische Detailschicht (echte PBR-Texturen)
    if (TEX.asphalt) {
      const M = this.M;
      applyDetail(M.road, { a: 'asphalt', b: 'pavement', mode: 'xz', scale: 3.2, scaleB: 2.6, split: 'lum', col: 0.95, nrm: 0.9, wet: true });
      for (const k of ['apt', 'deco', 'house']) applyDetail(M[k], { a: 'plaster', mode: 'box', scale: 3, col: 0.6, nrm: 0.75, mask: 'metal' });
      for (const k of ['office', 'warehouse']) applyDetail(M[k], { a: 'concrete', mode: 'box', scale: 7, col: 0.25, nrm: 0.5, mask: 'metal' });
      applyDetail(M.roof, { a: 'concrete', mode: 'xz', scale: 4, col: 0.6 });
      applyDetail(M.tile, { a: 'rooftile', mode: 'uv', scale: 3.5, col: 0.9, nrm: 1 });
      applyDetail(M.grass, { a: 'grass', mode: 'xz', scale: 2.5, col: 0.9 });
      applyDetail(M.sand, { a: 'sand', mode: 'xz', scale: 4, col: 0.8 });
      applyDetail(M.concrete, { a: 'pavement', mode: 'xz', scale: 2.6, col: 0.7, wet: true });
      applyDetail(M.land, { a: 'pavement', mode: 'xz', scale: 2.6, col: 0.6 });
      applyDetail(M.asph, { a: 'asphalt', mode: 'xz', scale: 3.2, col: 0.95, nrm: 0.9, wet: true });
      applyDetail(M.walk, { a: 'pavement', mode: 'xz', scale: 2.6, col: 0.8, wet: true });
    }
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
    const ext = HALF + WALK_HW, wx = C.WEST_X - WALK_HW;
    const rg = new THREE.PlaneGeometry(ext - wx, ext * 2, 1, 1);
    rg.rotateX(-Math.PI / 2);
    rg.translate((ext + wx) / 2, 0, 0);
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
    } else if (d === 'oldtown') {
      this.genOldtown(bi, bj, X0, Z0, X1, Z1, rnd);
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

  // Altstadt: geschlossene Blockrandbebauung mit Ziegeldächern, Innenhof, Kirche & Plaza
  genOldtown(bi, bj, X0, Z0, X1, Z1, rnd) {
    const coast = bi === I0;
    if (bi === -2 && bj === 4) return this.oldPlaza(X0, Z0, X1, Z1, rnd);
    if (bi === -2 && bj === 2) this.church((X0 + X1) / 2, (Z0 + Z1) / 2, rnd);
    const D = 13, cols = coast ? PASTEL : WEST;
    const row = (a, b, c, e, alongX) => {
      const len = alongX ? c - a : e - b;
      let p = 0;
      while (p < len - 4) {
        let w = 7 + rnd() * 5; if (len - p - w < 6) w = len - p;
        const floors = coast ? 4 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 3);
        const h = floors * 3.2 + 1;
        const [x0, z0, x1, z1] = alongX ? [a + p, b, a + p + w, e] : [a, b + p, c, b + p + w];
        const tint = cols[Math.floor(rnd() * cols.length)];
        const shop = rnd() < 0.6;
        if (shop) this.B.store.box(x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 4.2, z1 + 0.06, { uw: 24, vh: 4.5, uo: Math.floor(rnd() * 4) / 4, top: false });
        this.facadeBox(rnd() < 0.3 ? 'deco' : 'apt', x0, z0, x1, z1, shop ? 4.2 : 0, h, { rnd, tint, roof: false });
        // Gesims
        this.B.props.box(x0 - 0.25, h - 0.3, z0 - 0.25, x1 + 0.25, h, z1 + 0.25, { col: rgb(0xe9e2d4) });
        if (rnd() < 0.8) this.B.tile.gable(x0, z0, x1, z1, h, 2.4 + rnd() * 1.4, alongX, rgb(rnd() < 0.75 ? 0xffffff : 0xb8a49a), 0.35);
        else this.roofTop(x0, z0, x1, z1, h, true);
        // Balkone
        if (rnd() < 0.55) for (let f = 2; f < floors; f++) {
          const y = f * 3.2 + 0.2, m = 1.2;
          if (alongX) for (const zz of [z0, z1]) { const o = zz === z0 ? -1 : 1; this.B.props.box(x0 + m, y, Math.min(zz, zz + o * 0.9), x1 - m, y + 0.15, Math.max(zz, zz + o * 0.9), { col: rgb(0xd8d2c6) }); this.B.props.box(x0 + m, y + 0.15, zz + o * 0.85 - 0.04, x1 - m, y + 1.05, zz + o * 0.85 + 0.04, { col: rgb(0x2a2a2e) }); }
          else for (const xx of [x0, x1]) { const o = xx === x0 ? -1 : 1; this.B.props.box(Math.min(xx, xx + o * 0.9), y, z0 + m, Math.max(xx, xx + o * 0.9), y + 0.15, z1 - m, { col: rgb(0xd8d2c6) }); this.B.props.box(xx + o * 0.85 - 0.04, y + 0.15, z0 + m, xx + o * 0.85 + 0.04, y + 1.05, z1 - m, { col: rgb(0x2a2a2e) }); }
        }
        this.collider(x0, z0, x1, z1, h + 2);
        p += w;
      }
    };
    row(X0, Z0, X1, Z0 + D, true);
    row(X0, Z1 - D, X1, Z1, true);
    row(X0, Z0 + D, X0 + D, Z1 - D, false);
    row(X1 - D, Z0 + D, X1, Z1 - D, false);
    // Innenhof
    this.B.grass.box(X0 + D, 0.02, Z0 + D, X1 - D, 0.05, Z1 - D, { sides: false, topScale: 6 });
    for (let k = 0; k < 4; k++) this.addTree(X0 + D + 3 + rnd() * (X1 - X0 - 2 * D - 6), Z0 + D + 3 + rnd() * (Z1 - Z0 - 2 * D - 6), rnd);
  }

  church(cx, cz, rnd) {
    // steht im Innenhof des Blocks
    const P = this.B.props, st = rgb(0xece3cf), w = 9, l = 17;
    this.facadeBox('deco', cx - w / 2, cz - l / 2, cx + w / 2, cz + l / 2, 0, 11, { rnd, tint: 0xf3ead6, roof: false });
    this.B.tile.gable(cx - w / 2, cz - l / 2, cx + w / 2, cz + l / 2, 11, 4.5, false, rgb(0xffffff), 0.4);
    const tz = cz + l / 2 - 2.5;
    this.facadeBox('deco', cx - 2.5, tz - 2.5, cx + 2.5, tz + 2.5, 0, 26, { rnd, tint: 0xf3ead6, roof: false });
    P.box(cx - 2.8, 26, tz - 2.8, cx + 2.8, 26.6, tz + 2.8, { col: st });
    P.addGeometry(new THREE.ConeGeometry(3.4, 8, 4).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(cx, 30.6, tz), rgb(0x8a4a32));
    P.box(cx - 0.08, 34.6, tz - 0.08, cx + 0.08, 36.4, tz + 0.08, { col: rgb(0xd4af37) });
    P.box(cx - 0.6, 35.6, tz - 0.08, cx + 0.6, 35.8, tz + 0.08, { col: rgb(0xd4af37) });
    // Uhr
    for (const s of [-1, 1]) P.addGeometry(new THREE.CylinderGeometry(1.1, 1.1, 0.1, 18).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 22, tz + s * 2.56), rgb(0xf8f4ea));
    this.collider(cx - w / 2, cz - l / 2, cx + w / 2, cz + l / 2, 26);
  }

  oldPlaza(X0, Z0, X1, Z1, rnd) {
    const P = this.B.props, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
    this.B.concrete.box(X0, 0, Z0, X1, 0.08, Z1, { col: rgb(0xb4aa98), topScale: 3, uw: 3, vh: 3 });
    // Brunnen
    P.addGeometry(new THREE.CylinderGeometry(5, 5.3, 0.8, 28), new THREE.Matrix4().makeTranslation(cx, 0.4, cz), rgb(0xe2d8c4));
    this.B.poolw.addGeometry(new THREE.CircleGeometry(4.6, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 0.72, cz));
    P.addGeometry(new THREE.CylinderGeometry(0.5, 0.8, 3, 12), new THREE.Matrix4().makeTranslation(cx, 1.5, cz), rgb(0xe2d8c4));
    P.addGeometry(new THREE.CylinderGeometry(1.8, 0.4, 0.5, 18), new THREE.Matrix4().makeTranslation(cx, 3.1, cz), rgb(0xe2d8c4));
    this.addCircle(cx, cz, 5.2, 1, 'fountain');
    // Cafés mit Schirmen am Rand
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, r = 15 + rnd() * 6;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      P.addGeometry(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 12), new THREE.Matrix4().makeTranslation(x, 0.75, z), rgb(0xf4f4f4));
      P.box(x - 0.04, 0, z - 0.04, x + 0.04, 0.75, z + 0.04, { col: rgb(0x333333) });
      if (k % 2 === 0) {
        P.box(x - 0.04, 0.75, z - 0.04, x + 0.04, 2.5, z + 0.04, { col: rgb(0xdddddd) });
        P.addGeometry(new THREE.ConeGeometry(1.7, 0.6, 8), new THREE.Matrix4().makeTranslation(x, 2.6, z), rgb([0xc0392b, 0xf4f1e8, 0x2a9d8f][k % 3]));
      }
    }
    for (let k = 0; k < 8; k++) this.addPalm(X0 + 3 + rnd() * (X1 - X0 - 6), rnd() < 0.5 ? Z0 + 3 : Z1 - 3, rnd);
    for (let k = 0; k < 6; k++) this.bench(X0 + 6 + k * 9, Z0 + 1.5, 0);
    this.pois.plaza = { x: cx, z: cz, name: 'Plaza Vieja' };
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
        // Wohnhochhaus "Solera Heights" mit Lobby
        this.B.grass.box(x0, 0.02, z0, x1, 0.06, z1, { sides: false, topScale: 6 });
        this.B.concrete.box(x0, 0.0, -150, x1, 0.04, z1, { sides: false, col: rgb(0xb9b2a6), topScale: 4 });
        this.tower(216, -186, 246, -152, 112, 'glass', rnd, { crown: true, crownColor: 0x19e6ff });
        // Lobby-Vordach
        this.B.props.box(221, 4.6, -152, 241, 5.0, -145.5, { col: rgb(0x22262e) });
        A.box(221, 4.55, -145.6, 241, 4.65, -145.4, { col: rgb(0x19e6ff, 1.2) });
        for (const px of [222, 240]) this.B.props.box(px - 0.15, 0, -146.2, px + 0.15, 4.6, -145.8, { col: rgb(0xc9ced6) });
        this.sign(SIGN.SOLERA, 231, 6.1, -151.9, 7, 0, 1);
        // Samis 24/7-Markt
        this.tower(249, -160, 266, -142, 6.5, 'apt', rnd, { tint: 0xf2e8d5, store: true });
        this.sign(SIGN.H24, 257.5, 5.6, -141.9, 5.5, 0, 1);
        A.box(249, 4.5, -141.95, 266, 4.75, -141.7, { col: rgb(0xffd23f, 1.2) });
        for (const [px, pz] of [[217, -140], [246, -138], [264, -170], [213, -170]]) this.addPalm(px, pz, rnd);
        this.pois.safehouse = { x: 231, z: -143.5, name: 'Solera Heights' };
        this.pois.shop = { x: 257.5, z: -139.6, name: 'Samis 24/7' };
        this.pois.safehouseCar = { x: 244, z: -136, h: 0 };
        break;
      }
      case 'dealer': {
        // Autohaus mit Glasfront und Vorplatz
        this.B.concrete.box(x0, 0.0, z0, x1, 0.04, z1, { sides: false, col: rgb(0xd6d2ca), topScale: 3 });
        this.tower(138, -24, 186, 2, 13, 'glass', rnd, { store: false, crown: true, crownColor: 0xff2e88 });
        this.B.props.box(136.5, 12.6, -25.5, 187.5, 13.6, 3.5, { col: rgb(0x111318) });
        A.box(136.5, 12.2, 3.45, 187.5, 12.5, 3.6, { col: rgb(0xff2e88, 1.2) });
        for (const px of [140, 184]) for (const pz of [6, 24]) {
          this.B.props.box(px - 0.12, 0, pz - 0.12, px + 0.12, 9, pz + 0.12, { col: rgb(0xc9ced6) });
          A.box(px - 0.05, 6, pz + 0.12, px + 0.9, 9, pz + 0.16, { col: rgb([0xff2e88, 0x19e6ff][(px + pz) % 2], 1.1) });
          this.addCircle(px, pz, 0.25, 9, 'pole');
        }
        this.pois.dealer = { x: 162, z: 4.8, name: 'Solera Motors' };
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
    this.genHarborOffice();
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

  genHills() {
    // Gelände-Mesh direkt aus dem Höhenfeld (gleiche Dreiecke wie die Höhenabfrage)
    const HM = buildHeightmap();
    const pos = new Float32Array(GW * GD * 3), cols = new Float32Array(GW * GD * 3);
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) { const k = (j * GW + i) * 3; pos[k] = HILLS.x0 + i * GRID; pos[k + 1] = HM[j * GW + i]; pos[k + 2] = HILLS.z0 + j * GRID; }
    const idx = new Uint32Array((GW - 1) * (GD - 1) * 6);
    let q = 0;
    for (let j = 0; j < GD - 1; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = b; idx[q++] = c; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const n = g.attributes.normal, c = new THREE.Color(), c2 = new THREE.Color(), c3 = new THREE.Color();
    for (let k = 0; k < GW * GD; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], ny = n.getY(k);
      const nz = vnoise(x * 0.05, z * 0.05), big = vnoise(x * 0.01 + 5, z * 0.01);
      const dry = smoothstep(-520, -950, x) * smoothstep(-2300, -1900, z); // Tierra Seca im Westen
      if (y < -0.6) c.setHex(0x8a7a58);
      else if (y < 1.2) c.setHex(0xd8c08a);
      else {
        c.setHex(0x4f7f34).lerp(c2.setHex(0x8a9a4a), big * 0.7);
        c.lerp(c2.setHex(0xb99a62).lerp(c3.setHex(0x9a7a4a), big), dry * 0.92);
        if (y > 40) c.lerp(c2.setHex(0x6b6a45), smoothstep(40, 110, y) * (1 - dry));
        const rock = Math.max(smoothstep(0.86, 0.7, ny), smoothstep(150, 230, y));
        c.lerp(c2.setHex(dry > 0.5 ? 0x9a7f62 : 0x7d776d).lerp(c3.setHex(0x5e5952), nz), rock);
        if (y > 270) c.lerp(c2.setHex(0xe9e9ec), smoothstep(270, 340, y) * smoothstep(0.55, 0.8, ny));
      }
      c.multiplyScalar(0.88 + nz * 0.24);
      cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeBoundingSphere();
    const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.4 });
    if (TEX.grass) applyDetail(terrMat, { a: 'grass', b: 'rock', mode: 'terrain', scale: 3, scaleB: 7, col: 0.85, nrm: 0.9 });
    const mesh = new THREE.Mesh(g, terrMat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Wälder: dichter im Grünen, Pinien im Gebirge, kaum Bäume im trockenen Westen
    const rnd = mulberry32(4242);
    const cap = this.treePos.length + (this.q === 'low' ? 1500 : this.q === 'medium' ? 3400 : 4800);
    const W = HILLS.x1 - HILLS.x0, D = HILLS.z1 - HILLS.z0;
    for (let k = 0; k < 60000 && this.treePos.length < cap; k++) {
      const x = HILLS.x0 + 40 + rnd() * (W - 80), z = HILLS.z0 + 40 + rnd() * (D - 60);
      const y = hillHeight(x, z);
      if (y < 1.4 || y > 250) continue;
      const e = 3, sl = Math.abs(hillHeight(x + e, z) - y) + Math.abs(hillHeight(x, z + e) - y);
      if (sl > 2.6) continue;
      const rr = hillRoadAt(x, z); if (rr && rr[0] < 10) continue;
      if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 8) continue;
      if (Math.hypot(x - MANSION.x, z - MANSION.z) < MANSION.r + 12) continue;
      if (Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z) < LOOKOUT.r + 6) continue;
      if (C.townAt(x, z, 34)) continue;
      if (x > AIRFIELD.x0 - 20 && x < AIRFIELD.x1 + 20 && z > AIRFIELD.z0 - 20 && z < AIRFIELD.z1 + 20) continue;
      const dry = smoothstep(-520, -950, x) * smoothstep(-2300, -1900, z);
      if (rnd() < dry * 0.93) continue;
      if (vnoise(x * 0.012, z * 0.012) < 0.42 && y > 6 && rnd() < 0.9) continue;
      if (y < 5 && rnd() < 0.7) this.addPalm(x, z, rnd); else this.addTree(x, z, rnd);
    }
    this.villageRoads = [];
    for (const R of HILL_ROADS) this.genHillRoad(R, R === HILL_ROAD || R === SUMMIT_ROAD);
    this.genJunctions();
    this.genRuralHouses();
    this.hillRoad = HILL_ROAD;
    this.genVillage();
    this.genMansion();
    this.genLookout();
    this.genTowns();
    // Dämme mit Straße
    for (const CW of C.CAUSEWAYS) {
      const P = this.B.props, cc = rgb(0xb9b5ad), asph = rgb(0x34363b), wh = rgb(0xe9e9e4), mx = (CW.x0 + CW.x1) / 2;
      P.quad([CW.x0, -0.02, CW.z1], [CW.x1, -0.02, CW.z1], [CW.x1, CW.y1 - 0.02, CW.z0], [CW.x0, CW.y1 - 0.02, CW.z0], [0, 0, 1, 1], asph);
      P.box(CW.x0 - 0.6, -3, CW.z0, CW.x0, 0.2, CW.z1, { col: cc });
      P.box(CW.x1, -3, CW.z0, CW.x1 + 0.6, 0.2, CW.z1, { col: cc });
      for (let z = CW.z1 - 2; z > CW.z0; z -= 6) {
        const t = (CW.z1 - z) / (CW.z1 - CW.z0), y = lerp(0, CW.y1, t) + 0.01;
        P.quad([mx - 0.1, y, z], [mx + 0.1, y, z], [mx + 0.1, y, z - 3], [mx - 0.1, y, z - 3], [0, 0, 1, 1], rgb(0xe7b923));
      }
      for (const sx of [CW.x0, CW.x1]) {
        const x0 = sx === CW.x0 ? sx - 0.6 : sx, x1 = x0 + 0.6;
        for (let z = CW.z1; z > CW.z0; z -= 6) {
          const t = (CW.z1 - z) / (CW.z1 - CW.z0), y = lerp(0, CW.y1, t);
          P.box(x0, y, z - 6, x1, y + 0.9, z, { col: cc });
        }
        this.addBox(x0, CW.z0, x1, CW.z1, -1, 2, 'rail');
        P.quad([sx === CW.x0 ? CW.x0 + 0.2 : CW.x1 - 0.35, 0.02, CW.z1], [sx === CW.x0 ? CW.x0 + 0.35 : CW.x1 - 0.2, 0.02, CW.z1], [sx === CW.x0 ? CW.x0 + 0.35 : CW.x1 - 0.2, CW.y1, CW.z0], [sx === CW.x0 ? CW.x0 + 0.2 : CW.x1 - 0.35, CW.y1, CW.z0], [0, 0, 1, 1], wh);
      }
      for (let z = CW.z1 - 10; z > CW.z0; z -= 24) { this.pierLamps.push([CW.x0 + 0.4, z, Math.PI / 2]); this.pierLamps.push([CW.x1 - 0.4, z - 12, -Math.PI / 2]); }
    }
    this.pois.hills = { x: 40, z: -720, name: 'Solera Hills' };
  }

  genHillRoad(R, lamps = false) {
    const P = this.B.props, pts = R.pts, n = pts.length;
    const asph = rgb(0x323439), shoulder = rgb(0x8c8573), wh = rgb(0xe9e9e4), ye = rgb(0xe7b923);
    const nrm = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    const strip = (o0, o1, dy, col, every = 0) => {
      for (let i = 0; i < n - 1; i++) {
        if (every && i % every >= every / 2) continue;
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], na = nrm(i), nb = nrm(i + 1), ya = R.hs[i] + dy, yb = R.hs[i + 1] + dy;
        (col ? P : this.B.asph).quad([ax + na[0] * o0, ya, az + na[1] * o0], [ax + na[0] * o1, ya, az + na[1] * o1], [bx + nb[0] * o1, yb, bz + nb[1] * o1], [bx + nb[0] * o0, yb, bz + nb[1] * o0], [0, 0, 1, 1], col);
      }
    };
    strip(-7, 7, -0.08, shoulder);
    strip(-4.8, 4.8, 0.0, null);
    strip(-4.4, -4.2, 0.02, wh); strip(4.2, 4.4, 0.02, wh);
    strip(-0.1, 0.1, 0.02, ye, 2);
    // Leitplanke auf der Talseite + Laternen
    for (let i = 4; lamps && i < n - 3; i += 9) {
      const [x, z] = pts[i], [nx, nz] = nrm(i), side = i % 18 < 9 ? 1 : -1;
      this.pierLamps.push([x + nx * 6.4 * side, z + nz * 6.4 * side, Math.atan2(-nx * side, -nz * side) - Math.PI / 2]);
    }
    for (let i = 0; i < n - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], [nx, nz] = nrm(i);
      const hL = hillHeight(ax + nx * 16, az + nz * 16), hR = hillHeight(ax - nx * 16, az - nz * 16);
      const side = hL < hR ? 1 : -1;
      if (R.hs[i] - Math.min(hL, hR) < 2.2 || C.townAt(ax, az, 12) || (R.bridge && R.bridge[i])) continue; // Leitplanke nur am Abhang
      const o = 6.2 * side, ya = R.hs[i] - 0.1, yb = R.hs[i + 1] - 0.1;
      const p0 = [ax + nx * o, az + nz * o], p1 = [bx + nx * o, bz + nz * o];
      P.quad([p0[0], ya + 0.45, p0[1]], [p1[0], yb + 0.45, p1[1]], [p1[0], yb + 0.8, p1[1]], [p0[0], ya + 0.8, p0[1]], [0, 0, 1, 1], rgb(0xc9ccd0));
      P.quad([p1[0], yb + 0.45, p1[1]], [p0[0], ya + 0.45, p0[1]], [p0[0], ya + 0.8, p0[1]], [p1[0], yb + 0.8, p1[1]], [0, 0, 1, 1], rgb(0xc9ccd0));
      if (i % 2 === 0) P.box(p0[0] - 0.08, ya, p0[1] - 0.08, p0[0] + 0.08, ya + 0.8, p0[1] + 0.08, { col: rgb(0x77797d) });
    }
    // Leitpfosten mit Reflektoren
    for (let i = 3; i < n - 1; i += 6) {
      if (R.bridge && R.bridge[i]) continue;
      const [x, z] = pts[i], [nx, nz] = nrm(i);
      if (C.townAt(x, z, 10)) continue;
      for (const s of [-1, 1]) { const px = x + nx * 5.6 * s, pz = z + nz * 5.6 * s, y = R.hs[i] - 0.05; P.box(px - 0.06, y, pz - 0.06, px + 0.06, y + 1.0, pz + 0.06, { col: rgb(0xf2f2ee) }); P.box(px - 0.065, y + 0.72, pz - 0.065, px + 0.065, y + 0.88, pz + 0.065, { col: rgb(0x1a1a1a) }); this.B.accent.box(px - 0.07, y + 0.76, pz - 0.07, px + 0.07, y + 0.84, pz + 0.07, { col: s > 0 ? rgb(0xff8a3a, 1.2) : rgb(0xf2f2f2, 1.1) }); }
    }
    if (R.bridge) this.genBridge(R, nrm);
    this.villageRoads.push(R.pts);
  }

  // Brücke: Überbau, Brüstungen, Pfeiler, seitliche Kollision
  genBridge(R, nrm) {
    const P = this.B.props, pts = R.pts, n = pts.length, conc = rgb(0xbdb6aa), dark = rgb(0x8e877b), W = 6.7, T = 1.5;
    for (let i = 0; i < n - 1; i++) {
      if (!R.bridge[i] || !R.bridge[i + 1]) continue;
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], na = nrm(i), nb = nrm(i + 1), ya = R.hs[i], yb = R.hs[i + 1];
      const L = (p, q, s, y) => [p + (s > 0 ? na : na)[0] * 0, y, q];
      void L;
      const A = (s, w, y) => [ax + na[0] * w * s, ya + y, az + na[1] * w * s], Bp = (s, w, y) => [bx + nb[0] * w * s, yb + y, bz + nb[1] * w * s];
      // Unterseite
      P.quad(A(-1, W, -T), A(1, W, -T), Bp(1, W, -T), Bp(-1, W, -T), [0, 0, 1, 1], dark);
      P.quad(Bp(-1, W, -T), Bp(1, W, -T), A(1, W, -T), A(-1, W, -T), [0, 0, 1, 1], dark);
      for (const s of [-1, 1]) {
        // Seitenwand des Überbaus + Brüstung (beide Seiten der Wand)
        P.quad(A(s, W, -T), Bp(s, W, -T), Bp(s, W, 1.0), A(s, W, 1.0), [0, 0, 1, 1], conc);
        P.quad(Bp(s, W, -T), A(s, W, -T), A(s, W, 1.0), Bp(s, W, 1.0), [0, 0, 1, 1], conc);
        P.quad(A(s, W - 0.35, -0.1), Bp(s, W - 0.35, -0.1), Bp(s, W - 0.35, 1.0), A(s, W - 0.35, 1.0), [0, 0, 1, 1], conc);
        P.quad(Bp(s, W - 0.35, -0.1), A(s, W - 0.35, -0.1), A(s, W - 0.35, 1.0), Bp(s, W - 0.35, 1.0), [0, 0, 1, 1], conc);
        P.quad(A(s, W - 0.35, 1.0), A(s, W, 1.0), Bp(s, W, 1.0), Bp(s, W - 0.35, 1.0), [0, 0, 1, 1], rgb(0xd6d0c4));
        P.quad(A(s, W, 1.0), A(s, W - 0.35, 1.0), Bp(s, W - 0.35, 1.0), Bp(s, W, 1.0), [0, 0, 1, 1], rgb(0xd6d0c4));
        // Kollision: kleine Klötze entlang der Brüstung (nur auf Brückenhöhe)
        for (let t = 0; t < 1; t += 0.5) { const px = ax + (bx - ax) * t + na[0] * (W - 0.2) * s, pz = az + (bz - az) * t + na[1] * (W - 0.2) * s, y = ya + (yb - ya) * t; this.addBox(px - 0.45, pz - 0.45, px + 0.45, pz + 0.45, y - 0.4, y + 1.1, 'rail'); }
      }
      // Pfeiler
      if (i % 6 === 3) {
        const g = hillHeight(ax, az);
        if (ya - g > 3.5) {
          for (const s of [-1, 1]) { const px = ax + na[0] * 3.2 * s, pz = az + na[1] * 3.2 * s; P.box(px - 0.9, g - 2, pz - 0.9, px + 0.9, ya - T, pz + 0.9, { col: conc }); this.addBox(px - 0.9, pz - 0.9, px + 0.9, pz + 0.9, g - 2, ya - T - 0.2, 'bld'); }
          P.box(ax - 1.4 - Math.abs(na[0]) * 4.2, ya - T - 0.6, az - 1.4 - Math.abs(na[1]) * 4.2, ax + 1.4 + Math.abs(na[0]) * 4.2, ya - T, az + 1.4 + Math.abs(na[1]) * 4.2, { col: dark });
        }
      }
    }
  }

  // Kreuzungen: ebene Asphaltfläche, Haltelinie, Wegweiser zu den Orten
  genJunctions() {
    const P = this.B.props;
    for (const J of JUNCTIONS) {
      this.B.asph.addGeometry(new THREE.CircleGeometry(9.2, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(J.x, J.y + 0.035, J.z));
      P.addGeometry(new THREE.CircleGeometry(11.2, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(J.x, J.y - 0.05, J.z), rgb(0x8c8573));
      // Wegweiser: für jede abgehende Straße der nächste Ort
      const signs = [];
      for (const ei of J.edges) {
        const e = NET.edges[ei], fwd = e.a === J.id, P1 = fwd ? e.pts[Math.min(4, e.pts.length - 1)] : e.pts[Math.max(0, e.pts.length - 5)];
        const dx = P1[0] - J.x, dz = P1[1] - J.z, l = Math.hypot(dx, dz) || 1;
        const dest = this.nearestPlaceAlong(J, ei);
        if (dest) signs.push({ dx: dx / l, dz: dz / l, name: dest.name, km: dest.km });
      }
      signs.slice(0, 3).forEach((s, k) => {
        const px = J.x + s.dx * 11 - s.dz * 7.5, pz = J.z + s.dz * 11 + s.dx * 7.5;
        P.box(px - 0.07, J.y, pz - 0.07, px + 0.07, J.y + 2.8, pz + 0.07, { col: rgb(0x9aa0a6) });
        this.textSign(`${s.name.toUpperCase()}  ${s.km} KM`, px, J.y + 2.5, pz, Math.atan2(-s.dx, -s.dz), '#ffffff', 3.6, 'rgba(20,90,50,0.95)');
        void k;
      });
    }
  }
  nearestPlaceAlong(J, ei) {
    // Breitensuche über das Netz in Richtung der Kante: erster Ort / Damm
    const seen = new Set([J.id]);
    let frontier = [[NET.edges[ei].a === J.id ? NET.edges[ei].b : NET.edges[ei].a, NET.edges[ei].len]];
    for (let it = 0; it < 60 && frontier.length; it++) {
      frontier.sort((a, b) => a[1] - b[1]);
      const [u, d] = frontier.shift();
      if (seen.has(u)) continue; seen.add(u);
      const node = NET.nodes[u];
      if (node.town) { const t = C.TOWNS.find((q) => q.key === node.town); return { name: t ? t.name : 'Monte Solera', km: (d / 1000).toFixed(1).replace('.', ',') }; }
      if (node.gate) return { name: 'Port Solera', km: (d / 1000).toFixed(1).replace('.', ',') };
      for (const e2 of node.edges) { const e = NET.edges[e2], v = e.a === u ? e.b : e.a; if (!seen.has(v)) frontier.push([v, d + e.len]); }
    }
    return null;
  }

  // Landhäuser & Höfe entlang der Landstraßen
  genRuralHouses() {
    const rnd = mulberry32(31337), placed = [];
    for (const R of HILL_ROADS) {
      const pts = R.pts;
      for (let i = 10; i < pts.length - 10; i += 10) {
        if (rnd() > 0.6 || (R.bridge && R.bridge[i])) continue;
        const [x, z] = pts[i], a = pts[i - 1], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
        const s = rnd() < 0.5 ? 1 : -1, off = 24 + rnd() * 10, cx = x + nx * off * s, cz = z + nz * off * s;
        if (C.townAt(cx, cz, 45) || Math.hypot(cx - VILLAGE.x, cz - VILLAGE.z) < VILLAGE.r + 40 || Math.hypot(cx - MANSION.x, cz - MANSION.z) < MANSION.r + 50) continue;
        if (cx > AIRFIELD.x0 - 40 && cx < AIRFIELD.x1 + 40 && cz > AIRFIELD.z0 - 40 && cz < AIRFIELD.z1 + 40) continue;
        if (placed.some(([px, pz]) => Math.hypot(px - cx, pz - cz) < 30)) continue;
        const rr = hillRoadAt(cx, cz); if (rr && rr[0] < 13) continue;
        const w = 15 + rnd() * 5, d = 14 + rnd() * 4, x0 = cx - w / 2, z0 = cz - d / 2, x1 = cx + w / 2, z1 = cz + d / 2;
        const hs = [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]].map(([qx, qz]) => hillHeight(qx, qz));
        const lo = Math.min(...hs), hi = Math.max(...hs);
        if (hi - lo > 7 || lo < 1.5) continue;
        placed.push([cx, cz]);
        this.B.concrete.box(x0 - 0.5, lo - 1.5, z0 - 0.5, x1 + 0.5, hi + 0.15, z1 + 0.5, { col: rgb(0xb7ad9c), topScale: 2.6, uw: 2.6, vh: 2.6 });
        this.raised(hi + 0.15, () => {
          if (rnd() < 0.3) { this.warehouse(x0 + 1, z0 + 1, x1 - 1, z1 - 1, rnd); } else this.house(x0, z0, x1, z1, rnd);
        });
        // Zufahrt (Schotter)
        const ex = x + nx * 6.5 * s, ez = z + nz * 6.5 * s, fx = cx - nx * (d / 2) * s, fz = cz - nz * (d / 2) * s;
        const gl = Math.hypot(fx - ex, fz - ez) || 1, gx = -(fz - ez) / gl * 1.6, gz = (fx - ex) / gl * 1.6;
        this.B.props.quad([ex - gx, R.hs[i] - 0.03, ez - gz], [ex + gx, R.hs[i] - 0.03, ez + gz], [fx + gx, hi + 0.12, fz + gz], [fx - gx, hi + 0.12, fz - gz], [0, 0, 1, 1], rgb(0x9b927f));
      }
    }
    this.ruralCount = placed.length; this.ruralPos = placed;
  }

  // ---------------------------------------------------------- Orte im Umland
  // Ladenzeile an der Südkante eines Blocks; doors: [{ id, kind, name, col, label, awning }]
  shopRow(x0, z0, x1, z1, rnd, doors, y, tints = PASTEL) {
    const n = Math.max(2, Math.round((x1 - x0) / 13)), w = (x1 - x0) / n, d = Math.min(13, z1 - z0);
    for (let k = 0; k < n; k++) {
      const hx0 = x0 + k * w + 0.3, hx1 = x0 + (k + 1) * w - 0.3, h = 7.4 + Math.floor(rnd() * 2) * 3.2;
      this.B.store.box(hx0 - 0.06, 0, z1 - d - 0.06, hx1 + 0.06, 4, z1 + 0.06, { uw: 24, vh: 4.5, uo: Math.floor(rnd() * 4) / 4, top: false });
      this.facadeBox('apt', hx0, z1 - d, hx1, z1, 4, h, { rnd, tint: tints[Math.floor(rnd() * tints.length)], roof: false });
      if (rnd() < 0.6) this.B.tile.gable(hx0, z1 - d, hx1, z1, h, 2.4, true, rgb(0xffffff), 0.4); else this.roofTop(hx0, z1 - d, hx1, z1, h, true);
      this.collider(hx0, z1 - d, hx1, z1, h + 2);
      const dr = doors[k];
      if (dr) this.townDoors.push({ ...dr, x: (hx0 + hx1) / 2, z: z1 + 1.6, nx: 0, nz: 1, y0: y });
    }
  }
  // Tankstelle mit Shop (Tür nach Süden)
  gasStation(x0, z0, x1, z1, rnd, door, y) {
    const P = this.B.props, cx = (x0 + x1) / 2;
    this.B.concrete.box(x0, 0.02, z0, x1, 0.12, z1, { col: rgb(0x9a9a98), topScale: 2.6, uw: 2.6, vh: 2.6 });
    // Shop hinten
    this.facadeBox('office', cx - 11, z0 + 2, cx + 11, z0 + 13, 0, 4.6, { rnd, tint: 0xeef2f5 });
    this.B.store.box(cx - 11.06, 0, z0 + 12.9, cx + 11.06, 4, z0 + 13.06, { uw: 24, vh: 4.5, uo: 0.25, top: false });
    this.collider(cx - 11, z0 + 2, cx + 11, z0 + 13, 5);
    // Dach über den Zapfsäulen
    const zc = z0 + 30;
    P.box(cx - 13, 5.2, zc - 6, cx + 13, 5.9, zc + 6, { col: rgb(0xf2f2f2) });
    this.B.accent.box(cx - 13.05, 5.2, zc - 6.05, cx + 13.05, 5.45, zc + 6.05, { col: rgb(0xff5a1f, 1.3) });
    for (const sx of [-9, 9]) for (const sz of [-3.5, 3.5]) { P.box(cx + sx - 0.25, 0, zc + sz - 0.25, cx + sx + 0.25, 5.2, zc + sz + 0.25, { col: rgb(0xd9d9d9) }); this.addCircle(cx + sx, zc + sz, 0.4, 5, 'pillar'); }
    for (const sx of [-6, 0, 6]) { P.box(cx + sx - 0.45, 0.12, zc - 0.9, cx + sx + 0.45, 1.7, zc + 0.9, { col: rgb(0xd62828) }); P.box(cx + sx - 0.47, 1.1, zc - 0.5, cx + sx + 0.47, 1.5, zc + 0.5, { col: rgb(0x111111) }); this.addBox(cx + sx - 0.5, zc - 1, cx + sx + 0.5, zc + 1, -1, 1.7, 'bld'); }
    // Preistafel
    P.box(x1 - 3, 0, z1 - 3, x1 - 2.7, 6, z1 - 2.7, { col: rgb(0x555555) });
    this.B.accent.box(x1 - 4.2, 3.6, z1 - 3.05, x1 - 1.5, 6.2, z1 - 2.65, { col: rgb(0xff5a1f, 1.1) });
    this.townDoors.push({ ...door, x: cx, z: z0 + 14.6, nx: 0, nz: 1, y0: y });
    this.parkingSpots.push([cx - 6, zc + 3.2, Math.PI / 2], [cx + 6, zc - 3.2, -Math.PI / 2]);
  }
  genTowns() {
    this.townDoors = []; this.townLoops = {};
    const CS = C.TOWN_CS, HW = 4.5;
    for (const t of C.TOWNS) {
      const r = C.townRect(t), rnd = mulberry32(900 + t.cx), loops = [];
      const tints = t.style === 'desert' ? [0xe8c9a0, 0xd9b48a, 0xf0dcc0, 0xc9a27a, 0xeadfce] : t.style === 'coast' ? PASTEL : WEST;
      this.raised(t.y, () => {
        const P = this.B.props;
        // Fahrbahn als eine Fläche, Blöcke mit Gehweg darauf
        this.B.asph.box(r.x0 - HW - 2, 0.02, r.z0 - HW - 2, r.x1 + HW + 2, 0.06, r.z1 + HW + 2, { sides: false, topScale: 1 });
        for (let i = 0; i <= t.nx; i++) for (let j = 0; j < t.nz; j++) for (let k = 0; k < 5; k++) { const x = r.x0 + i * CS, z = r.z0 + j * CS + 12 + k * 10; P.quad([x - 0.08, 0.075, z + 4], [x + 0.08, 0.075, z + 4], [x + 0.08, 0.075, z], [x - 0.08, 0.075, z], [0, 0, 1, 1], rgb(0xe9e9e4)); }
        for (let j = 0; j <= t.nz; j++) for (let i = 0; i < t.nx; i++) for (let k = 0; k < 5; k++) { const z = r.z0 + j * CS, x = r.x0 + i * CS + 12 + k * 10; P.quad([x, 0.075, z + 0.08], [x + 4, 0.075, z + 0.08], [x + 4, 0.075, z - 0.08], [x, 0.075, z - 0.08], [0, 0, 1, 1], rgb(0xe9e9e4)); }
        // Laternen an den Kreuzungen
        for (let i = 0; i <= t.nx; i++) for (let j = 0; j <= t.nz; j++) this.pierLamps.push([r.x0 + i * CS + HW + 0.8, r.z0 + j * CS + HW + 0.8, Math.PI * 1.25]);
        const special = {
          valverde: { '1,1': 'plaza', '2,1': 'hall', '0,2': 'gas', '3,0': 'park', '1,2': 'shops', '2,2': 'shops2', '2,0': 'apt', '1,0': 'apt' },
          bahia: { '0,1': 'hotel', '1,1': 'shops', '2,1': 'hotel', '3,1': 'shops2', '0,0': 'gas', '2,0': 'park', '3,0': 'casino' },
          ranchos: { '1,1': 'shops', '0,0': 'gas', '2,0': 'hangar', '2,1': 'shops2', '0,1': 'trailer' },
          santacruz: { '1,1': 'shops', '2,1': 'plaza', '0,0': 'gas', '3,1': 'hotel', '1,0': 'shops2', '3,0': 'apt' },
          lagoverde: { '1,0': 'plaza', '0,1': 'shops', '2,1': 'shops2', '0,0': 'gas', '2,0': 'park' },
          pinar: { '1,1': 'shops', '0,0': 'hall', '2,0': 'gas', '1,0': 'park' },
          sanlucar: { '1,1': 'shops', '0,1': 'gas', '2,0': 'hangar', '0,0': 'trailer', '2,1': 'shops2' },
        }[t.key];
        const doorSets = {
          valverde: { shops: [{ id: 'v_diner', kind: 'diner', name: 'DINER VALVERDE', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, { id: 'v_gun', kind: 'gunshop', name: 'WAFFEN', col: '#ff7b39', label: 'W', awning: 0x2b2b2b }, { id: 'v_bar', kind: 'bar', name: 'CANTINA VERDE', col: '#7cff6b', label: '🍺', awning: 0x1f5a3a }, null], shops2: [{ id: 'v_moda', kind: 'boutique', name: 'MODA VALVERDE', col: '#ff6fb0', label: 'M', awning: 0x2b2d42 }, null, { id: 'v_house', kind: 'house', name: 'WOHNUNG', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, null], gas: { id: 'v_shop', kind: 'shop', name: '24/7 VALVERDE', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          bahia: { shops: [{ id: 'b_bar', kind: 'bar', name: 'BAR AZUL', col: '#19e6ff', label: '🍺', awning: 0x1d4e89 }, { id: 'b_moda', kind: 'boutique', name: 'SURF & STYLE', col: '#ff6fb0', label: 'M', awning: 0xff8fab }, null, { id: 'b_diner', kind: 'diner', name: 'FISH & GRILL', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }], shops2: [{ id: 'b_house', kind: 'house', name: 'STRANDWOHNUNG', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, null, null, null], gas: { id: 'b_shop', kind: 'shop', name: '24/7 BAHÍA', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          ranchos: { shops: [{ id: 'r_diner', kind: 'diner', name: 'ROUTE 7 DINER', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, { id: 'r_bar', kind: 'bar', name: 'SALOON SECA', col: '#ffb35c', label: '🍺', awning: 0x6b3a1f }, null, null], shops2: [{ id: 'r_gun', kind: 'gunshop', name: 'AMMO RANCH', col: '#ff7b39', label: 'W', awning: 0x2b2b2b }, { id: 'r_house', kind: 'house', name: 'RANCHHAUS', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, null, null], gas: { id: 'r_shop', kind: 'shop', name: '24/7 LOS RANCHOS', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          santacruz: { shops: [{ id: 'sc_diner', kind: 'diner', name: 'MARISQUERÍA', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, { id: 'sc_bar', kind: 'bar', name: 'BAR LA OLA', col: '#19e6ff', label: '🍺', awning: 0x1d4e89 }, null, { id: 'sc_moda', kind: 'boutique', name: 'BOUTIQUE MAR', col: '#ff6fb0', label: 'M', awning: 0x2b2d42 }], shops2: [{ id: 'sc_house', kind: 'house', name: 'CASA DEL MAR', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, { id: 'sc_gun', kind: 'gunshop', name: 'ARMERÍA COSTA', col: '#ff7b39', label: 'W', awning: 0x2b2b2b }, null, null], gas: { id: 'sc_shop', kind: 'shop', name: '24/7 SANTA CRUZ', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          lagoverde: { shops: [{ id: 'lv_bar', kind: 'bar', name: 'TABERNA DEL LAGO', col: '#7cff6b', label: '🍺', awning: 0x1f5a3a }, { id: 'lv_diner', kind: 'diner', name: 'LAKESIDE GRILL', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, null], shops2: [{ id: 'lv_house', kind: 'house', name: 'SEEHAUS', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, { id: 'lv_moda', kind: 'boutique', name: 'LAGO MODA', col: '#ff6fb0', label: 'M', awning: 0x2b2d42 }, null], gas: { id: 'lv_shop', kind: 'shop', name: '24/7 LAGO VERDE', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          pinar: { shops: [{ id: 'pa_bar', kind: 'bar', name: 'HÜTTE PINAR', col: '#ffb35c', label: '🍺', awning: 0x6b3a1f }, { id: 'pa_diner', kind: 'diner', name: 'BERGSTUBE', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, { id: 'pa_gun', kind: 'gunshop', name: 'JAGDBEDARF', col: '#ff7b39', label: 'W', awning: 0x2b2b2b }, null], gas: { id: 'pa_shop', kind: 'shop', name: '24/7 PINAR ALTO', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
          sanlucar: { shops: [{ id: 'sl_diner', kind: 'diner', name: 'TACO LÚCAR', col: '#ff5a5a', label: '🍔', awning: 0xb02a2a }, { id: 'sl_bar', kind: 'bar', name: 'CANTINA DEL SOL', col: '#ffb35c', label: '🍺', awning: 0x6b3a1f }, null], shops2: [{ id: 'sl_gun', kind: 'gunshop', name: 'ARMAS LÚCAR', col: '#ff7b39', label: 'W', awning: 0x2b2b2b }, { id: 'sl_house', kind: 'house', name: 'CASITA', col: '#7cff6b', label: '🏠', awning: 0x3a5a40 }, null], gas: { id: 'sl_shop', kind: 'shop', name: '24/7 SAN LÚCAR', col: '#ffd23f', label: '24', awning: 0x1d6f6a } },
        }[t.key] || { shops: [], shops2: [], gas: null };
        for (let i = 0; i < t.nx; i++) for (let j = 0; j < t.nz; j++) {
          const bx0 = r.x0 + i * CS + HW, bz0 = r.z0 + j * CS + HW, bx1 = bx0 + CS - 2 * HW, bz1 = bz0 + CS - 2 * HW;
          this.B.walk.box(bx0, 0.02, bz0, bx1, 0.2, bz1, { topScale: 1, uw: 2.6, vh: 2.6 });
          loops.push([[bx0 + 1.1, bz0 + 1.1], [bx1 - 1.1, bz0 + 1.1], [bx1 - 1.1, bz1 - 1.1], [bx0 + 1.1, bz1 - 1.1]]);
          const X0 = bx0 + 2.4, Z0 = bz0 + 2.4, X1 = bx1 - 2.4, Z1 = bz1 - 2.4;
          const kind = special[i + ',' + j] || 'houses';
          this.raised(0.2, () => {
            if (kind === 'plaza') {
              const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
              P.addGeometry(new THREE.CylinderGeometry(4.2, 4.5, 0.8, 28), new THREE.Matrix4().makeTranslation(cx, 0.4, cz), rgb(0xe2d8c4));
              this.B.poolw.addGeometry(new THREE.CircleGeometry(3.8, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 0.72, cz));
              P.addGeometry(new THREE.CylinderGeometry(0.4, 0.7, 3, 12), new THREE.Matrix4().makeTranslation(cx, 1.5, cz), rgb(0xe2d8c4));
              this.addCircle(cx, cz, 4.5, 1, 'fountain');
              for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; this.addTree(cx + Math.cos(a) * 20, cz + Math.sin(a) * 20, rnd); }
              for (let k = 0; k < 4; k++) this.bench(X0 + 8 + k * 12, Z1 - 2, Math.PI);
            } else if (kind === 'hall') {
              const cx = (X0 + X1) / 2;
              this.facadeBox('deco', cx - 16, Z0 + 6, cx + 16, Z0 + 26, 0, 12, { rnd, tint: 0xf3ead6 });
              this.facadeBox('deco', cx - 4, Z0 + 12, cx + 4, Z0 + 20, 12, 22, { rnd, tint: 0xf3ead6, roof: false });
              P.addGeometry(new THREE.ConeGeometry(6, 5, 4).rotateY(Math.PI / 4), new THREE.Matrix4().makeTranslation(cx, 24.5, Z0 + 16), rgb(0x8a4a32));
              for (let k = 0; k < 6; k++) P.addGeometry(new THREE.CylinderGeometry(0.45, 0.5, 8, 12), new THREE.Matrix4().makeTranslation(cx - 12.5 + k * 5, 4, Z0 + 27.5), rgb(0xf6f1e8));
              P.box(cx - 15, 8, Z0 + 26, cx + 15, 9, Z0 + 29, { col: rgb(0xe9e2d4) });
              this.collider(cx - 16, Z0 + 6, cx + 16, Z0 + 26, 14);
              this.textSign(t.name.toUpperCase() + ' RATHAUS', cx, t.y + 10.4, Z0 + 29.1, 0, '#e9d8a6', 9);
              this.pois[t.key + '_hall'] = { x: cx + 3, z: Z0 + 31.5 };
              for (let k = 0; k < 4; k++) this.addPalm(X0 + 3 + k * ((X1 - X0 - 6) / 3), Z1 - 3, rnd);
            } else if (kind === 'gas' && doorSets.gas) this.gasStation(X0, Z0, X1, Z1, rnd, doorSets.gas, t.y + 0.2);
            else if (kind === 'park') this.genPark(X0, Z0, X1, Z1, rnd);
            else if (kind === 'shops' || kind === 'shops2') {
              this.shopRow(X0, Z0, X1, Z1, rnd, doorSets[kind] || [], t.y + 0.2, tints);
              this.grid2(X0, Z0, X1, Z1 - 16, 2, 1, 3, (a, b, c2, e) => { if (e - b > 13) this.house(a, b, c2, e, rnd); });
            } else if (kind === 'apt') {
              this.grid2(X0, Z0, X1, Z1, 2, 2, 4, (a, b, c2, e) => this.tower(a, b, c2, e, 12 + rnd() * 12, 'apt', rnd, { tint: tints[Math.floor(rnd() * tints.length)], store: rnd() < 0.5 }));
            } else if (kind === 'hotel') {
              const h = 18 + rnd() * 14;
              this.tower(X0 + 4, Z0, X1 - 4, Z0 + 22, h, 'deco', rnd, { tint: PASTEL[Math.floor(rnd() * PASTEL.length)], crown: true, crownColor: ACCENT[Math.floor(rnd() * 3)] });
              this.B.concrete.box(X0 + 6, 0, Z0 + 28, X1 - 6, 0.15, Z1 - 4, { col: rgb(0xeee8dc), topScale: 2, uw: 2, vh: 2 });
              this.B.poolw.box(X0 + 10, 0.15, Z0 + 32, X1 - 10, 0.17, Z1 - 8, { sides: false });
              for (let k = 0; k < 5; k++) this.addPalm(X0 + 4 + rnd() * (X1 - X0 - 8), Z0 + 25 + rnd() * 3, rnd);
            } else if (kind === 'casino') {
              // GRAN CASINO: goldene Glasfassade, Hotelturm, Vordach, Brunnen
              const cx = (X0 + X1) / 2, fz = Z0 + 30;
              this.facadeBox('glass', cx - 22, Z0 + 2, cx + 22, fz, 0, 15, { rnd, tint: 0xe8c77a });
              this.tower(cx - 11, Z0 + 3, cx + 11, Z0 + 16, 52, 'glass', rnd, { tint: 0xd9b25c, crown: true, crownColor: 0xffd23f, store: false });
              this.collider(cx - 22, Z0 + 2, cx + 22, fz, 16);
              const goldC = rgb(0xd4a017);
              P.box(cx - 13, 6.4, fz, cx + 13, 7.1, fz + 7, { col: goldC });
              this.B.accent.box(cx - 13.05, 6.4, fz + 6.95, cx + 13.05, 6.7, fz + 7.05, { col: rgb(0xffd23f, 1.6) });
              for (const sx of [-12, -4, 4, 12]) { P.addGeometry(new THREE.CylinderGeometry(0.35, 0.4, 6.4, 12), new THREE.Matrix4().makeTranslation(cx + sx, 3.2, fz + 6.4), rgb(0xf4ead2)); this.addCircle(cx + sx, fz + 6.4, 0.45, 6, 'pillar'); }
              for (const y of [15.05, 0.3]) this.B.accent.box(cx - 22.05, y, fz - 0.05, cx + 22.05, y + 0.35, fz + 0.05, { col: rgb(0xffd23f, 1.4) });
              for (let k = 0; k < 9; k++) this.B.accent.box(cx - 20 + k * 5, 1, fz + 0.06, cx - 19.8 + k * 5, 14.5, fz + 0.1, { col: rgb(0xffc94a, 1.2) });
              this.textSign('GRAN CASINO', cx, t.y + 11.2, fz + 0.15, 0, '#ffd23f', 16);
              // Brunnen & Palmen auf dem Vorplatz
              const fcz = fz + 16;
              P.addGeometry(new THREE.CylinderGeometry(5.2, 5.5, 0.8, 32), new THREE.Matrix4().makeTranslation(cx, 0.4, fcz), rgb(0xe9dcc0));
              this.B.poolw.addGeometry(new THREE.CircleGeometry(4.8, 32).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 0.72, fcz));
              P.addGeometry(new THREE.CylinderGeometry(0.5, 0.9, 3.4, 12), new THREE.Matrix4().makeTranslation(cx, 1.7, fcz), rgb(0xd4a017));
              this.addCircle(cx, fcz, 5.4, 1, 'fountain');
              for (const sx of [-18, -10, 10, 18]) this.addPalm(cx + sx, fz + 12, rnd);
              this.townDoors.push({ id: 'casino', kind: 'casino', name: 'GRAN CASINO', col: '#ffd23f', label: '♠', awning: 0x8a1020, x: cx, z: fz + 1.6, nx: 0, nz: 1, y0: t.y + 0.2 });
            } else if (kind === 'hangar') {
              this.warehouse(X0, Z0, X1, Z0 + 22, rnd);
              this.warehouse(X0, Z0 + 28, X0 + 26, Z1, rnd);
            } else if (kind === 'trailer') {
              for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { const tx = X0 + 4 + a * 17, tz = Z0 + 6 + b * 26; P.box(tx, 0.5, tz, tx + 11, 3.2, tz + 3.4, { col: rgb([0xe9e4da, 0xbfd8e0, 0xe6d3a8][(a + b) % 3]) }); P.box(tx - 0.1, 3.2, tz - 0.1, tx + 11.1, 3.35, tz + 3.5, { col: rgb(0x9aa1ab) }); this.collider(tx, tz, tx + 11, tz + 3.4, 3.4); }
            } else this.grid2(X0, Z0, X1, Z1, 2, 2, 3, (a, b, c2, e) => this.house(a, b, c2, e, rnd));
          });
          // Parkplätze am Straßenrand
          if ((i + j) % 2 === 0) this.parkingSpots.push([bx0 + 14, bz1 + 2.4, Math.PI / 2], [bx0 + 34, bz1 + 2.4, Math.PI / 2]);
        }
        // Ortsschild
        this.textSign(t.name.toUpperCase(), r.x0 - 9, t.y + 3.2, r.z1 - CS / 2, -Math.PI / 2, '#ffffff', 7, 'rgba(20,90,50,0.95)');
        this.textSign(t.name.toUpperCase(), r.x1 + 9, t.y + 3.2, r.z0 + CS / 2, Math.PI / 2, '#ffffff', 7, 'rgba(20,90,50,0.95)');
      });
      for (let i = 0; i <= t.nx; i++) this.villageRoads.push([[r.x0 + i * CS, r.z0], [r.x0 + i * CS, r.z1]]);
      for (let j = 0; j <= t.nz; j++) this.villageRoads.push([[r.x0, r.z0 + j * CS], [r.x1, r.z0 + j * CS]]);
      this.townLoops[t.key] = loops;
      this.pois[t.key] = { x: t.cx, z: t.cz, name: t.name };
    }
    this.townLoops.village = this.villageLoops;
    this.genAirfield();
  }
  genAirfield() {
    const A = AIRFIELD, P = this.B.props;
    this.raised(A.y, () => {
      this.B.asph.box(A.x0, 0.02, A.z0 + 8, A.x1, 0.08, A.z1 - 8, { sides: false, topScale: 1 });
      for (let x = A.x0 + 20; x < A.x1 - 20; x += 30) P.quad([x, 0.1, (A.z0 + A.z1) / 2 + 0.4], [x + 14, 0.1, (A.z0 + A.z1) / 2 + 0.4], [x + 14, 0.1, (A.z0 + A.z1) / 2 - 0.4], [x, 0.1, (A.z0 + A.z1) / 2 - 0.4], [0, 0, 1, 1], rgb(0xf2f2f2));
      for (const x of [A.x0 + 6, A.x1 - 12]) for (let k = 0; k < 6; k++) P.quad([x, 0.1, A.z0 + 12 + k * 5.5 + 3], [x + 6, 0.1, A.z0 + 12 + k * 5.5 + 3], [x + 6, 0.1, A.z0 + 12 + k * 5.5], [x, 0.1, A.z0 + 12 + k * 5.5], [0, 0, 1, 1], rgb(0xf2f2f2));
      // Tower & Hangar
      const hx = A.x1 - 70;
      P.box(hx, 0, A.z0 - 2, hx + 6, 14, A.z0 + 4, { col: rgb(0xe4e0d6) });
      P.box(hx - 1.5, 14, A.z0 - 3.5, hx + 7.5, 17.5, A.z0 + 5.5, { col: rgb(0x2a3a4a) });
      this.B.accent.box(hx + 2.6, 17.5, A.z0 + 0.6, hx + 3.4, 19, A.z0 + 1.4, { col: [3, 0.2, 0.2] });
      this.addBox(hx, A.z0 - 2, hx + 6, A.z0 + 4, -1, 18, 'bld');
      // Windsack-Mast & Lichter
      for (let x = A.x0 + 10; x < A.x1; x += 40) for (const z of [A.z0 + 8.5, A.z1 - 8.5]) this.B.accent.box(x - 0.2, 0.08, z - 0.2, x + 0.2, 0.3, z + 0.2, { col: rgb(0x19e6ff, 1.6) });
    });
    this.pois.airfield = { x: (A.x0 + A.x1) / 2, z: (A.z0 + A.z1) / 2, name: 'Flugplatz Los Ranchos' };
  }
  genLookout() {
    const L = LOOKOUT, P = this.B.props;
    this.raised(L.y, () => {
      this.B.concrete.box(L.x - 22, 0.02, L.z - 22, L.x + 22, 0.18, L.z + 22, { col: rgb(0xc9c3b6), topScale: 2.6, uw: 2.6, vh: 2.6 });
      for (let k = 0; k < 44; k++) { const a = (k / 44) * Math.PI * 2; if (a > 1.2 && a < 1.95) continue; const x = L.x + Math.cos(a) * 21.5, z = L.z + Math.sin(a) * 21.5; P.box(x - 0.08, 0.18, z - 0.08, x + 0.08, 1.2, z + 0.08, { col: rgb(0x55585e) }); }
      P.addGeometry(new THREE.TorusGeometry(21.5, 0.06, 6, 60, Math.PI * 2 - 0.75).rotateX(Math.PI / 2).rotateY(-1.95), new THREE.Matrix4().makeTranslation(L.x, 1.2, L.z), rgb(0x55585e));
      for (const a of [3.6, 4.4, 5.2]) { const x = L.x + Math.cos(a) * 19, z = L.z + Math.sin(a) * 19; P.box(x - 0.07, 0.18, z - 0.07, x + 0.07, 1.3, z + 0.07, { col: rgb(0x333333) }); P.addGeometry(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 10).rotateZ(Math.PI / 2.4), new THREE.Matrix4().makeTranslation(x, 1.45, z), rgb(0x2a6f97)); }
      for (let k = 0; k < 3; k++) this.bench(L.x - 8 + k * 8, L.z - 14, 0);
      // Funkmast
      P.box(L.x + 14, 0, L.z - 16, L.x + 14.6, 46, L.z - 15.4, { col: rgb(0xd9d9d9) });
      for (let y = 6; y < 46; y += 8) P.box(L.x + 13.2, y, L.z - 16.8, L.x + 15.4, y + 0.2, L.z - 14.6, { col: rgb(0xc0392b) });
      this.B.accent.box(L.x + 13.9, 46, L.z - 16.1, L.x + 14.7, 47, L.z - 15.3, { col: [3, 0.15, 0.15] });
      this.addBox(L.x + 14, L.z - 16, L.x + 14.6, L.z - 15.4, -1, 46, 'bld');
      for (let k = 0; k < 4; k++) this.parkingSpots.push([L.x - 10 + k * 5, L.z + 14, 0]);
    });
    this.textSign('MIRADOR DEL CIELO', L.x, L.y + 3.4, L.z - 21.6, 0, '#ffffff', 8, 'rgba(20,60,110,0.95)');
    this.pois.lookout = { x: L.x, z: L.z, name: 'Mirador del Cielo' };
  }

  // Alles in fn wird auf Höhe dy angehoben (Geometrie & Kollision)
  raised(dy, fn) {
    const B = this.B, mark = {};
    for (const k in B) mark[k] = B[k].p.length;
    const nb = this.boxes.length, nc = this.circles.length;
    fn();
    for (const k in B) { const p = B[k].p; for (let i = mark[k] + 1; i < p.length; i += 3) p[i] += dy; }
    for (let i = nb; i < this.boxes.length; i++) { this.boxes[i].y0 += dy; this.boxes[i].y1 += dy; }
    for (let i = nc; i < this.circles.length; i++) { const c = this.circles[i]; if (c.kind !== 'palm' && c.kind !== 'tree') c.y1 += dy; }
  }

  genVillage() {
    const V = VILLAGE, cx = V.x, cz = V.z, rnd = mulberry32(5150);
    const L = [-45, 0, 45], E = 74;
    this.villageLoops = [];
    this.raised(V.y, () => {
      const P = this.B.props, asph = rgb(0x34363b), walk = rgb(0xcfc7b8);
      // Straßen
      for (const o of L) {
        const hw = o === 0 ? 4.5 : 3.6, ext = o === 0 ? 92 : E;
        P.box(cx - ext, 0.02, cz + o - hw - 1.6, cx + ext, 0.1, cz + o + hw + 1.6, { col: walk });
        P.box(cx + o - hw - 1.6, 0.02, cz - ext, cx + o + hw + 1.6, 0.1, cz + ext, { col: walk });
      }
      for (const o of L) {
        const hw = o === 0 ? 4.5 : 3.6, ext = o === 0 ? 92 : E;
        P.box(cx - ext, 0.1, cz + o - hw, cx + ext, 0.12, cz + o + hw, { col: asph, sides: false });
        P.box(cx + o - hw, 0.1, cz - ext, cx + o + hw, 0.12, cz + ext, { col: asph, sides: false });
        this.villageRoads.push([[cx - ext, cz + o], [cx + ext, cz + o]], [[cx + o, cz - ext], [cx + o, cz + ext]]);
        for (let t = -ext + 8; t < ext; t += 26) { this.pierLamps.push([cx + t, cz + o + hw + 1.2, Math.PI]); this.pierLamps.push([cx + o - hw - 1.2, cz + t + 13, Math.PI / 2]); }
      }
      // Zellen zwischen den Straßen
      const edges = [-E, -45, 0, 45, E];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const outerA = a === 0 || a === 3, outerB = b === 0 || b === 3;
        if (outerA && outerB) continue;
        const hwA0 = edges[a] === 0 ? 4.5 : 3.6, hwA1 = edges[a + 1] === 0 ? 4.5 : 3.6;
        const x0 = cx + edges[a] + (a === 0 ? 0 : hwA0 + 2), x1 = cx + edges[a + 1] - (a === 3 ? 0 : hwA1 + 2);
        const hwB0 = edges[b] === 0 ? 4.5 : 3.6, hwB1 = edges[b + 1] === 0 ? 4.5 : 3.6;
        const z0 = cz + edges[b] + (b === 0 ? 0 : hwB0 + 2), z1 = cz + edges[b + 1] - (b === 3 ? 0 : hwB1 + 2);
        this.villageLoops.push([[x0 - 1.2, z0 - 1.2], [x1 + 1.2, z0 - 1.2], [x1 + 1.2, z1 + 1.2], [x0 - 1.2, z1 + 1.2]]);
        if (a === 1 && b === 1) { this.villageChurch(x0, z0, x1, z1, rnd); continue; }
        if (a === 1 && b === 2) { this.villa(x0, z0, x1, z1, rnd); continue; }
        if (a === 2 && b === 1) { this.villagePlaza(x0, z0, x1, z1, rnd); continue; }
        if (!outerA && !outerB) {
          // Ortskern: Häuserzeile mit Läden
          const n = 3, w = (x1 - x0) / n;
          for (let k = 0; k < n; k++) {
            const hx0 = x0 + k * w + 0.4, hx1 = x0 + (k + 1) * w - 0.4, h = 7.4 + Math.floor(rnd() * 2) * 3.2;
            this.B.store.box(hx0 - 0.06, 0, z1 - 12 - 0.06, hx1 + 0.06, 4, z1 + 0.06, { uw: 24, vh: 4.5, uo: Math.floor(rnd() * 4) / 4, top: false });
            this.facadeBox('apt', hx0, z1 - 12, hx1, z1, 4, h, { rnd, tint: PASTEL[Math.floor(rnd() * PASTEL.length)], roof: false });
            this.B.tile.gable(hx0, z1 - 12, hx1, z1, h, 2.6, true, rgb(0xffffff), 0.4);
            this.collider(hx0, z1 - 12, hx1, z1, h + 2);
          }
          this.B.grass.box(x0, 0.03, z0, x1, 0.06, z1 - 12, { sides: false, topScale: 6 });
          for (let k = 0; k < 3; k++) this.addTree(x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 3 + rnd() * Math.max(1, z1 - 12 - z0 - 6), rnd);
          continue;
        }
        // Rand: Villen
        const nx = (x1 - x0) > 34 ? 2 : 1, nz = (z1 - z0) > 34 ? 2 : 1;
        this.grid2(x0, z0, x1, z1, nx, nz, 3, (p, q, r, t) => { if (r - p > 14 && t - q > 14) this.house(p, q, r, t, rnd); });
      }
      // Parkplätze
      for (let k = 0; k < 6; k++) this.parkingSpots.push([cx - 70 + k * 28, cz + 2.6, Math.PI / 2]);
    });
    this.pois.village = { x: cx, z: cz, name: 'Monte Solera' };
  }

  villa(x0, z0, x1, z1, rnd) {
    // Villa Aurelio: zweistöckig, Flachdach mit Pergola, Pool im Garten
    const P = this.B.props, cx = (x0 + x1) / 2;
    this.B.grass.box(x0, 0.03, z0, x1, 0.06, z1, { sides: false, topScale: 6 });
    this.facadeBox('house', cx - 14, z1 - 15, cx + 14, z1 - 2, 0, 7.4, { rnd, tint: 0xfaf6ee, roof: false });
    this.roofTop(cx - 14, z1 - 15, cx + 14, z1 - 2, 7.4, true);
    P.box(cx - 15, 7.3, z1 - 16, cx + 15, 7.6, z1 - 1, { col: rgb(0xe8e2d6) });
    for (const sx of [-12, -4, 4, 12]) P.box(cx + sx - 0.2, 0, z1 - 1.4, cx + sx + 0.2, 3.6, z1 - 1, { col: rgb(0xf4efe6) });
    P.box(cx - 13, 3.5, z1 - 1.6, cx + 13, 3.75, z1 + 0.3, { col: rgb(0x8a6a48) });
    this.collider(cx - 14, z1 - 15, cx + 14, z1 - 2, 9);
    this.B.concrete.box(cx - 10, 0, z0 + 2, cx + 10, 0.15, z0 + 12, { col: rgb(0xece6da), topScale: 2, uw: 2, vh: 2 });
    this.B.poolw.box(cx - 8.5, 0.15, z0 + 3.5, cx + 8.5, 0.17, z0 + 10.5, { sides: false });
    for (let k = 0; k < 4; k++) this.addPalm(x0 + 2 + k * (x1 - x0 - 4) / 3, z0 + 14 + (k % 2) * 2, rnd);
    for (let k = 0; k < 3; k++) this.parkingSpots.push([cx - 8 + k * 8, z1 + 3.4, Math.PI / 2]);
  }

  villageChurch(x0, z0, x1, z1, rnd) {
    this.B.concrete.box(x0, 0.02, z0, x1, 0.1, z1, { col: rgb(0xd9cdb6), topScale: 3, uw: 3, vh: 3 });
    this.church((x0 + x1) / 2, (z0 + z1) / 2 - 2, rnd);
    for (let k = 0; k < 4; k++) this.addTree(x0 + 3 + k * (x1 - x0 - 6) / 3, z0 + 3, rnd);
  }

  villagePlaza(x0, z0, x1, z1, rnd) {
    const P = this.B.props, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    this.B.concrete.box(x0, 0.02, z0, x1, 0.1, z1, { col: rgb(0xe0d4bd), topScale: 3, uw: 3, vh: 3 });
    P.addGeometry(new THREE.CylinderGeometry(3.6, 3.8, 0.7, 24), new THREE.Matrix4().makeTranslation(cx, 0.45, cz), rgb(0xe2d8c4));
    this.B.poolw.addGeometry(new THREE.CircleGeometry(3.3, 24).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 0.82, cz));
    P.addGeometry(new THREE.CylinderGeometry(0.35, 0.6, 2.4, 10), new THREE.Matrix4().makeTranslation(cx, 1.5, cz), rgb(0xe2d8c4));
    this.addCircle(cx, cz, 3.8, 1, 'fountain');
    for (let k = 0; k < 6; k++) this.addPalm(x0 + 3 + rnd() * (x1 - x0 - 6), rnd() < 0.5 ? z0 + 2.5 : z1 - 2.5, rnd);
    for (let k = 0; k < 4; k++) this.bench(x0 + 6 + k * 8, z1 - 1.5, Math.PI);
    // Aussichtspunkt-Fernrohr
    P.box(cx + 10, 0, cz - 8, cx + 10.15, 1.2, cz - 7.85, { col: rgb(0x333333) });
    P.addGeometry(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 10).rotateZ(Math.PI / 2.4), new THREE.Matrix4().makeTranslation(cx + 10.1, 1.35, cz - 7.9), rgb(0x2a6f97));
  }

  genMansion() {
    // Anwesen der Familie Valcourt auf dem Gipfel – Schauplatz der Endmission
    const M = MANSION, cx = M.x, cz = M.z, rnd = mulberry32(8080);
    this.raised(M.y, () => {
      const P = this.B.props, A = this.B.accent, wall = rgb(0xe9e3d6), dark = rgb(0x2b2b30);
      // Rasen & Einfahrt
      this.B.grass.box(cx - 50, 0.02, cz - 48, cx + 50, 0.05, cz + 48, { sides: false, topScale: 6 });
      this.B.concrete.box(cx - 5, 0.02, cz + 8, cx + 5, 0.09, cz + 48, { col: rgb(0xd8cfbf), topScale: 2.6, uw: 2.6, vh: 2.6 });
      this.B.concrete.box(cx - 18, 0.02, cz + 10, cx + 18, 0.09, cz + 30, { col: rgb(0xd8cfbf), topScale: 2.6, uw: 2.6, vh: 2.6 });
      // Mauer mit Tor
      const W = (x0, z0, x1, z1) => { P.box(x0, 0, z0, x1, 2.6, z1, { col: wall }); P.box(x0 - 0.1, 2.6, z0 - 0.1, x1 + 0.1, 2.8, z1 + 0.1, { col: rgb(0xcfc6b4) }); this.addBox(x0, z0, x1, z1, -1, 2.8, 'bld'); };
      W(cx - 50, cz - 48, cx + 50, cz - 47.4); W(cx - 50, cz - 48, cx - 49.4, cz + 48); W(cx + 49.4, cz - 48, cx + 50, cz + 48);
      W(cx - 50, cz + 47.4, cx - 6, cz + 48); W(cx + 6, cz + 47.4, cx + 50, cz + 48);
      for (const s of [-1, 1]) { P.box(cx + s * 6 - 0.6, 0, cz + 47.1, cx + s * 6 + 0.6, 3.6, cz + 48.3, { col: wall }); A.box(cx + s * 6 - 0.3, 3.6, cz + 47.4, cx + s * 6 + 0.3, 3.8, cz + 48, { col: rgb(0xffd9a0, 1.5) }); }
      // Brunnen im Vorhof
      P.addGeometry(new THREE.CylinderGeometry(4, 4.3, 0.8, 28), new THREE.Matrix4().makeTranslation(cx, 0.4, cz + 20), rgb(0xf1ece2));
      this.B.poolw.addGeometry(new THREE.CircleGeometry(3.6, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, 0.82, cz + 20));
      P.addGeometry(new THREE.CylinderGeometry(0.3, 0.5, 2.8, 12), new THREE.Matrix4().makeTranslation(cx, 1.4, cz + 20), rgb(0xf1ece2));
      this.addCircle(cx, cz + 20, 4.2, 1, 'fountain');
      // Haupthaus: zwei versetzte Kuben, Glasfront, Holzlamellen
      this.facadeBox('house', cx - 24, cz - 18, cx + 24, cz + 8, 0, 5.2, { rnd, tint: 0xfbf8f2, roof: false });
      this.facadeBox('glass', cx - 9, cz + 4, cx + 9, cz + 8.6, 0, 9.4, { rnd, roof: false });
      this.facadeBox('house', cx - 18, cz - 24, cx + 28, cz + 3, 5.2, 10.4, { rnd, tint: 0xf4efe6, roof: false });
      this.roofTop(cx - 24, cz - 18, cx + 24, cz + 8, 5.2, false);
      this.roofTop(cx - 18, cz - 24, cx + 28, cz + 3, 10.4, true);
      this.roofTop(cx - 9, cz + 4, cx + 9, cz + 8.6, 9.4, false);
      P.box(cx - 19, 10.3, cz - 25, cx + 29, 10.7, cz + 4, { col: rgb(0x3a3a3e) });
      for (let k = 0; k < 18; k++) this.B.wood.box(cx + 12 + k * 0.85, 5.6, cz + 3.05, cx + 12.35 + k * 0.85, 10.1, cz + 3.3, {});
      A.box(cx - 24.2, 5.1, cz + 8.05, cx + 24.2, 5.2, cz + 8.2, { col: rgb(0xffe2b0, 1.4) });
      // Eingangsvordach & Säulen
      P.box(cx - 7, 4.2, cz + 8.6, cx + 7, 4.5, cz + 14, { col: rgb(0x2a2a2e) });
      for (const s of [-1, 1]) P.box(cx + s * 6.4 - 0.2, 0, cz + 13.4, cx + s * 6.4 + 0.2, 4.2, cz + 13.8, { col: rgb(0xd9d4ca) });
      this.collider(cx - 24, cz - 18, cx + 24, cz + 8.6, 11);
      this.collider(cx - 18, cz - 24, cx + 28, cz - 18, 11);
      // Garage mit drei Toren
      this.facadeBox('house', cx + 28, cz - 6, cx + 44, cz + 10, 0, 4.4, { rnd, tint: 0xf4efe6 });
      for (let k = 0; k < 3; k++) P.box(cx + 29 + k * 5, 0, cz + 10.02, cx + 33 + k * 5, 3.2, cz + 10.12, { col: dark });
      this.collider(cx + 28, cz - 6, cx + 44, cz + 10, 4.6);
      // Infinity-Pool & Terrasse hinter dem Haus
      this.B.concrete.box(cx - 30, 0, cz - 44, cx + 30, 0.25, cz - 25, { col: rgb(0xeee8dc), topScale: 2, uw: 2, vh: 2 });
      this.B.poolw.box(cx - 22, 0.25, cz - 40, cx + 22, 0.27, cz - 30, { sides: false });
      for (let k = 0; k < 6; k++) { const x = cx - 20 + k * 8; P.box(x - 0.7, 0.25, cz - 28.5, x + 0.7, 0.55, cz - 26.5, { col: rgb(0xffffff) }); P.box(x - 0.7, 0.55, cz - 28.5, x + 0.7, 1.1, cz - 28.2, { col: rgb(0xffffff) }); }
      for (let k = 0; k < 8; k++) this.addPalm(cx - 46 + rnd() * 92, k % 2 ? cz - 46 + rnd() * 3 : cz + 30 + rnd() * 14, rnd);
      // Hubschrauberlandeplatz
      P.addGeometry(new THREE.CylinderGeometry(9, 9, 0.4, 32), new THREE.Matrix4().makeTranslation(cx - 36, 0.2, cz - 2), rgb(0x55585e));
      A.box(cx - 37.2, 0.42, cz - 5, cx - 36.2, 0.45, cz + 1, { col: rgb(0xffffff, 1.2) });
      A.box(cx - 35.8, 0.42, cz - 5, cx - 34.8, 0.45, cz + 1, { col: rgb(0xffffff, 1.2) });
      A.box(cx - 36.2, 0.42, cz - 2.5, cx - 35.8, 0.45, cz - 1.5, { col: rgb(0xffffff, 1.2) });
      // Gartenleuchten
      for (let k = 0; k < 10; k++) { const z = cz + 12 + k * 3.6; for (const s of [-1, 1]) { P.box(cx + s * 5.6 - 0.08, 0, z - 0.08, cx + s * 5.6 + 0.08, 0.7, z + 0.08, { col: dark }); A.box(cx + s * 5.6 - 0.12, 0.7, z - 0.12, cx + s * 5.6 + 0.12, 0.85, z + 0.12, { col: rgb(0xffd9a0, 1.6) }); } }
      for (let k = 0; k < 4; k++) this.parkingSpots.push([cx - 14 + k * 4.5, cz + 26, 0]);
    });
    this.pois.mansion = { x: cx, z: cz + 30, name: 'Anwesen Valcourt' };
    this.pois.mansionGate = { x: cx, z: cz + 52 };
  }

  // Leuchtschild mit Text (eigenes Mesh)
  textSign(text, x, y, z, ry, col = '#ffd23f', w = 4.2, bg = 'rgba(12,10,20,0.92)') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
    g.fillStyle = col; g.font = 'bold 64px "Russo One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 18; g.fillText(text, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t }));
    m.material.color.setScalar(0.85);
    m.position.set(x, y, z); m.rotation.y = ry;
    this.scene.add(m);
    return m;
  }
  // Markise + Schild über einem Eingang. nx/nz = Blickrichtung nach außen
  storefront(x, z, nx, nz, name, col, awning, y0 = 0) {
    const P = this.B.props, rx = Math.abs(nz), rz = Math.abs(nx);
    const ax0 = x - rx * 3 + Math.min(0, nx * 1.6), ax1 = x + rx * 3 + Math.max(0, nx * 1.6);
    const az0 = z - rz * 3 + Math.min(0, nz * 1.6), az1 = z + rz * 3 + Math.max(0, nz * 1.6);
    P.box(ax0, y0 + 3.0, az0, ax1, y0 + 3.25, az1, { col: rgb(awning) });
    this.B.accent.box(ax0, y0 + 2.95, az0, ax1, y0 + 3.0, az1, { col: rgb(new THREE.Color(col).getHex(), 1.4) });
    // Tür (dunkel, leicht vor der Fassade)
    P.box(x - rx * 0.9 + nx * 0.02, y0, z - rz * 0.9 + nz * 0.02, x + rx * 0.9 + nx * 0.08, y0 + 2.4, z + rz * 0.9 + nz * 0.08, { col: rgb(0x2a1d14) });
    this.textSign(name, x + nx * 0.12, y0 + 4.7, z + nz * 0.12, Math.atan2(nx, nz), col, 4.6);
  }

  genEntrances() {
    const E = this.entrances = [];
    const add = (id, kind, name, x, z, nx, nz, col, awning, y0 = 0, label = '') => {
      this.storefront(x - nx * 1.6, z - nz * 1.6, nx, nz, name, col, awning, y0);
      E.push({ id, kind, name, x, z, out: { x: x + nx * 1.8, z: z + nz * 1.8, yaw: Math.atan2(nx, nz) }, col, label });
      this.pois[id] = { x, z, name };
    };
    // Altstadt
    add('cafe', 'cafe', 'CAFÉ VIEJA', -427.6, 0, -1, 0, '#ffb35c', 0x7a2e1e, 0, 'C');
    add('boutique', 'boutique', 'MODA SOLERA', -427.6, -80, -1, 0, '#ff6fb0', 0x2b2d42, 0, 'M');
    add('shop2', 'shop', '24/7 ALTSTADT', -532.4, 80, 1, 0, '#ffd23f', 0x1d6f6a, 0, '24');
    // Monte Solera
    const V = VILLAGE;
    add('shop3', 'shop', '24/7 MONTE SOLERA', V.x + 23, V.z + 41, 0, 1, '#ffd23f', 0x1d6f6a, V.y, '24');
    add('villa', 'villa', 'VILLA AURELIO', V.x - 22.95, V.z + 39, 0, 1, '#e9d8a6', 0x3a5a40, V.y, 'A');
    // Hafen
    add('harbor', 'office', 'HAFENBÜRO', -30, 371.4, 0, -1, '#19e6ff', 0x1d3557, 0, 'K');
    for (const d of this.townDoors || []) add(d.id, d.kind, d.name, d.x, d.z, d.nx, d.nz, d.col, d.awning, d.y0, d.label);
  }

  genHarborOffice() {
    this.facadeBox('office', -44, 373.2, -16, 383, 0, 7.4, { tint: 0xdfe6ee });
    this.B.props.box(-44.3, 3.5, 372.9, -15.7, 3.7, 383.3, { col: rgb(0x1d3557) });
    this.collider(-44, 373.2, -16, 383, 8);
  }

  genQuay() {
    const L = C.LAND, Pr = this.B.props, c = rgb(0xb9b5ad);
    const wall = (x0, z0, x1, z1) => { Pr.box(x0, -0.02, z0, x1, 0.9, z1, { col: c }); this.addBox(x0, z0, x1, z1, -1, 0.9, 'quay'); };
    { const cws = [...C.CAUSEWAYS].sort((a, b) => a.x0 - b.x0); let x = L.minX; for (const cw of cws) { wall(x, L.minZ, cw.x0 - 1, L.minZ + 0.5); x = cw.x1 + 1; } wall(x, L.minZ, L.maxX, L.minZ + 0.5); }
    // Süd- und Westmauer mit Lücken für die Bootsstege
    const split = (side, a0, a1, mk) => { let a = a0; for (const D of C.DOCKS.filter((d) => d.side === side && d.gap).sort((p, q) => p.gap[0] - q.gap[0])) { mk(a, D.gap[0]); a = D.gap[1]; } mk(a, a1); };
    split('S', L.minX, L.maxX, (a, b) => wall(a, L.maxZ - 0.5, b, L.maxZ));
    split('W', L.minZ, L.maxZ, (a, b) => wall(L.minX, a, L.minX + 0.5, b));
    // Poller
    for (let x = L.minX + 10; x < L.maxX; x += 20) {
      Pr.addGeometry(new THREE.CylinderGeometry(0.25, 0.3, 0.8, 8), new THREE.Matrix4().makeTranslation(x, 0.4, L.maxZ - 1.5), rgb(0x2b2b2b));
    }
  }

  // Bootsstege: Holzplanken auf Pfählen, Poller, Laternen, Bootshaus
  genDocks() {
    this.platforms = [];
    const Pr = this.B.props, Wd = this.B.wood;
    const pile = new THREE.CylinderGeometry(0.16, 0.18, 1, 7);
    for (const D of C.DOCKS) {
      for (const [x0, z0, x1, z1] of D.rects) {
        Wd.box(x0, D.y - 0.22, z0, x1, D.y, z1, { uw: 1.6 });
        this.platforms.push({ x0, z0, x1, z1, y: D.y });
        const alongX = x1 - x0 > z1 - z0, len = alongX ? x1 - x0 : z1 - z0, n = Math.max(1, Math.round(len / 4));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          for (const e of [0, 1]) {
            const px = alongX ? x0 + t * (x1 - x0) : (e ? x1 - 0.3 : x0 + 0.3), pz = alongX ? (e ? z1 - 0.3 : z0 + 0.3) : z0 + t * (z1 - z0);
            Pr.addGeometry(pile, new THREE.Matrix4().makeTranslation(px, D.y - 2.4, pz).multiply(new THREE.Matrix4().makeScale(1, 5, 1)), rgb(0x4a3a2a));
            if (k % 2 === 0) Pr.addGeometry(new THREE.CylinderGeometry(0.14, 0.17, 0.5, 8), new THREE.Matrix4().makeTranslation(px, D.y + 0.25, pz), rgb(0x2b2b2b));
            if (k % 3 === 1 && e === 0) {
              Pr.box(px - 0.06, D.y, pz - 0.06, px + 0.06, D.y + 2.4, pz + 0.06, { col: rgb(0x333333) });
              this.B.accent.box(px - 0.16, D.y + 2.4, pz - 0.16, px + 0.16, D.y + 2.75, pz + 0.16, { col: [1.0, 0.85, 0.55] });
            }
          }
        }
      }
      // Bootshaus mit Schild
      const [sx, sz] = D.shop, gy = this.groundHeight(sx, sz);
      const hx = D.side === 'S' ? sx + 9 : D.side === 'E' ? sx - 1 : sx + 3, hz = D.side === 'S' ? sz : D.side === 'E' ? sz + 9 : sz + 6;
      Pr.box(hx - 2.6, gy, hz - 2.2, hx + 2.6, gy + 3.0, hz + 2.2, { col: rgb(0xe8e2d4) });
      Pr.box(hx - 3.0, gy + 3.0, hz - 2.6, hx + 3.0, gy + 3.25, hz + 2.6, { col: rgb(0x1d4e89) });
      this.B.accent.box(hx - 2.0, gy + 2.2, hz - 2.25, hx + 2.0, gy + 2.8, hz + 2.25, { col: [0.1, 0.55, 0.95] });
      this.collider(hx - 2.6, hz - 2.2, hx + 2.6, hz + 2.2, gy + 3.2);
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
      const d = C.districtOf(clamp(bi, I0, 8), clamp(bj, 0, 8));
      return d === 'heights' || d === 'seaside' || d === 'westside' || d === 'oldtown' || x > 350;
    };
    // vertikale Straßen x=r
    for (let i = I0; i <= NB; i++) {
      const r = roadPos(i);
      for (let j = 0; j < NB; j++) {
        const s0 = roadPos(j);
        for (const o of [20, 60]) { addLamp(r + 9, s0 + o, -Math.PI / 2); addLamp(r - 9, s0 + o + 6, Math.PI / 2); }
        for (const o of [32, 48]) {
          if (palmy(r + 9, s0 + o)) this.addPalm(r + 9, s0 + o, rnd, true);
          if (palmy(r - 9, s0 + o)) this.addPalm(r - 9, s0 + o, rnd, true);
        }
      }
    }
    // horizontale Straßen z=r
    for (let j = 0; j <= NB; j++) {
      const r = roadPos(j);
      for (let i = I0; i < NB; i++) {
        const s0 = roadPos(i);
        for (const o of [20, 60]) { addLamp(s0 + o, r + 9, Math.PI); addLamp(s0 + o + 6, r - 9, 0); }
        for (const o of [32, 48]) {
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
    this.addCircle(x, z, 0.32, this.groundHeight(x, z) + 9, 'palm');
  }
  addTree(x, z, rnd) {
    this.treePos.push([x, z, 0.8 + rnd() * 0.5, rnd() * Math.PI * 2]);
    this.addCircle(x, z, 0.45, this.groundHeight(x, z) + 6, 'tree');
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
    add(B.asph, M.asph, false, true);
    add(B.walk, M.walk, false, true);
    this.B = null;
  }

  buildInstanced() {
    const scene = this.scene;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const up = new THREE.Vector3(0, 1, 0);
    const setM = (im, i, x, y, z, yaw, sc = 1) => { q.setFromAxisAngle(up, yaw); s.set(sc, sc, sc); p.set(x, y, z); mtx.compose(p, q, s); im.setMatrixAt(i, mtx); };

    // Palmen
    const trunk = new THREE.CylinderGeometry(0.17, 0.3, 8.5, 7, 6, true);
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
    // Vegetation in 400-m-Kacheln: nur sichtbare und nahe Kacheln werden gezeichnet
    this.vegChunks = [];
    const chunked = (list, geos, mats, dy = 0, recv = false) => {
      const by = new Map();
      for (const t of list) { const k = Math.floor(t[0] / 400) + ',' + Math.floor(t[1] / 400); let l = by.get(k); if (!l) by.set(k, (l = [])); l.push(t); }
      for (const [k, l] of by) {
        const [cx, cz] = k.split(',').map(Number);
        geos.forEach((geo, gi) => {
          const im = new THREE.InstancedMesh(geo, mats[gi], l.length);
          l.forEach(([x, z, sc, yaw], i) => setM(im, i, x, this.groundHeight(x, z) + dy, z, yaw, sc));
          im.castShadow = true; im.receiveShadow = recv; im.computeBoundingSphere(); scene.add(im);
          this.vegChunks.push({ im, x: cx * 400 + 200, z: cz * 400 + 200 });
        });
      }
    };
    chunked(this.palmPos, [trunk, crownGeo], [palmMat, crownMat]);

    // Laubbäume (mehrere Blattwolken, weich schattiert) & Pinien für die Berge
    const rndT = mulberry32(31337);
    const lump = (cx, cy, cz, r, base, out) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const pp = g.attributes.position, nn = g.attributes.normal, cl = [];
      for (let k = 0; k < pp.count; k++) {
        let x = pp.getX(k), y = pp.getY(k), z = pp.getZ(k);
        const l = Math.hypot(x, y, z) || 1, ux = x / l, uy = y / l, uz = z / l;
        const d = 1 + (vnoise(ux * 3 + cx * 7, uz * 3 + uy * 2 + cz * 5) - 0.5) * 0.45;
        if (uy < -0.3) y *= 0.75;
        pp.setXYZ(k, x * d + cx, y * d + cy, z * d + cz);
        nn.setXYZ(k, ux, uy * 0.8 + 0.2, uz);
        const ao = 0.62 + 0.38 * smoothstep(-0.9, 0.7, uy), v = (0.85 + vnoise(x * 3, z * 3 + y) * 0.3) * ao;
        cl.push(base[0] * v, base[1] * v, base[2] * v);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      out.addGeometry(g, new THREE.Matrix4());
    };
    const broad = new GeoBuilder(true), bark = rgb(0x5a4030);
    broad.addGeometry(new THREE.CylinderGeometry(0.17, 0.3, 3.8, 8).translate(0, 1.9, 0), new THREE.Matrix4(), bark);
    for (const [bx, bz, a] of [[0.9, 0.2, 0.7], [-0.7, 0.5, -0.6], [0.1, -0.9, 0.5]]) {
      const br = new THREE.CylinderGeometry(0.07, 0.12, 2.2, 5, 1, true).translate(0, 1.1, 0);
      broad.addGeometry(br, new THREE.Matrix4().makeTranslation(0, 3, 0).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(bz * a, 0, -bx * a))), bark);
    }
    const leaf = [rgb(0x3e7a2e), rgb(0x4d8a34), rgb(0x356b2a)];
    lump(0, 5.4, 0, 2.2, leaf[0], broad);
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + rndT(), rr = 1.5 + rndT() * 0.5;
      lump(Math.cos(ang) * rr, 4.6 + rndT() * 1.6, Math.sin(ang) * rr, 1.3 + rndT() * 0.6, leaf[k % 3], broad);
    }
    lump(0.2, 6.9, -0.1, 1.4, leaf[1], broad);
    const pine = new GeoBuilder(true);
    pine.addGeometry(new THREE.CylinderGeometry(0.12, 0.26, 7, 7).translate(0, 3.5, 0), new THREE.Matrix4(), rgb(0x4e3a2a));
    for (let k = 0; k < 5; k++) {
      const y = 2.6 + k * 1.35, r = 2.3 - k * 0.38;
      const cone = new THREE.ConeGeometry(r, 2.6, 10, 2, true);
      const cp = cone.attributes.position, cl = [];
      for (let i = 0; i < cp.count; i++) {
        const yy = cp.getY(i), wob = 1 + (vnoise(cp.getX(i) * 4 + k, cp.getZ(i) * 4) - 0.5) * 0.35;
        cp.setX(i, cp.getX(i) * wob); cp.setZ(i, cp.getZ(i) * wob);
        if (yy < -1) cp.setY(i, yy - 0.25 * wob);
        const v = 0.55 + 0.45 * ((yy + 1.3) / 2.6);
        const c = rgb(0x2f5a2c, v * (0.9 + k * 0.04)); cl.push(...c);
      }
      cone.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      cone.computeVertexNormals();
      pine.addGeometry(cone, new THREE.Matrix4().makeTranslation(0, y + 1.3, 0));
    }
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
    const bPos = [], pPos = [];
    for (const t of this.treePos) ((this.groundHeight(t[0], t[1]) > 9 && t[1] < HILLS.z1 && !C.townAt(t[0], t[1], 40) && Math.hypot(t[0] - VILLAGE.x, t[1] - VILLAGE.z) > VILLAGE.r) ? pPos : bPos).push(t);
    chunked(bPos, [broad.build()], [leafMat], -0.1, true);
    chunked(pPos, [pine.build()], [leafMat], -0.1, true);

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
    this.lampIM.castShadow = !G.isTouch && this.q !== 'low';

    // Ampeln
    const sb = new GeoBuilder(true), sd = rgb(0x22252a);
    sb.addGeometry(new THREE.CylinderGeometry(0.1, 0.13, 4.5, 6).translate(0, 2.25, 0), new THREE.Matrix4(), sd);
    sb.box(-0.22, 4.3, -0.18, 0.22, 5.6, 0.14, { col: sd });
    sb.box(-0.3, 4.25, -0.2, 0.3, 5.65, -0.16, { col: rgb(0x111111) });
    const sigIM = new THREE.InstancedMesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), this.signalPos.length);
    const lampSph = (y) => new THREE.IcosahedronGeometry(0.12, 0).translate(0, y, 0.15); // 20 statt 80 Dreiecke
    this.sigLamps = [lampSph(5.35), lampSph(4.95), lampSph(4.55)].map((g) => new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.signalPos.length));
    const dim = new THREE.Color(0.08, 0.08, 0.08);
    this.signalPos.forEach(([x, z, yaw], i) => {
      setM(sigIM, i, x, 0, z, yaw);
      for (const L of this.sigLamps) { setM(L, i, x, 0, z, yaw); L.setColorAt(i, dim); }
    });
    sigIM.computeBoundingSphere(); sigIM.castShadow = !G.isTouch && this.q !== 'low'; scene.add(sigIM);
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
    // offene Kabinen: Dach, Boden, Eckpfosten, Brüstung (Fahrgäste sind sichtbar)
    const gb = new GeoBuilder();
    gb.box(-0.08, -1.0, -0.08, 0.08, 0, 0.08);
    gb.box(-1.45, -1.05, -1.35, 1.45, -0.8, 1.35, { bottom: true });
    gb.box(-1.35, -3.2, -1.25, 1.35, -3.0, 1.25, { bottom: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(sx * 1.3 - 0.06, -3.0, sz * 1.2 - 0.06, sx * 1.3 + 0.06, -1.0, sz * 1.2 + 0.06);
    for (const sx of [-1, 1]) gb.box(sx * 1.3 - 0.05, -3.0, -1.2, sx * 1.3 + 0.05, -2.15, 1.2);
    for (const sz of [-1, 1]) gb.box(-1.3, -3.0, sz * 1.2 - 0.05, 1.3, -2.15, sz * 1.2 + 0.05);
    const gondG = gb.build ? gb.build() : gb.geometry();
    this.gondolas = new THREE.InstancedMesh(gondG, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }), 16);
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
    const S = this.q === 'low' ? 2048 : 3072;
    const MB = { x0: -1950, x1: 2250, z0: -3300, z1: 900 };
    this.mapBounds = MB;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const sx = (x) => ((x - MB.x0) / (MB.x1 - MB.x0)) * S, sz = (z) => ((z - MB.z0) / (MB.z1 - MB.z0)) * S;
    const sc = S / (MB.x1 - MB.x0);
    const rect = (x0, z0, x1, z1, col, r = 0) => {
      g.fillStyle = col; g.beginPath();
      if (r && g.roundRect) g.roundRect(sx(x0), sz(z0), (x1 - x0) * sc, (z1 - z0) * sc, r * sc); else g.rect(sx(x0), sz(z0), (x1 - x0) * sc, (z1 - z0) * sc);
      g.fill();
    };
    // Meer mit dezentem Verlauf
    const gr = g.createRadialGradient(S * 0.45, S * 0.5, S * 0.1, S * 0.5, S * 0.5, S * 0.75);
    gr.addColorStop(0, '#5b8db3'); gr.addColorStop(1, '#3f7299');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // feines Raster
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    for (let k = 0; k <= S; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, S); g.moveTo(0, k); g.lineTo(S, k); g.stroke(); }
    // Küste (Strand) mit Glühkante
    const shore = [];
    for (let z = -460; z <= 460; z += 6) {
      let x = C.BEACH_X0;
      while (x < C.BEACH_X0 + 200 && C.sandHeight(x, z) > C.WATER_Y) x += 1;
      shore.push([x, z]);
    }
    g.beginPath(); g.moveTo(sx(C.BEACH_X0), sz(-460));
    for (const [x, z] of shore) g.lineTo(sx(x), sz(z));
    g.lineTo(sx(C.BEACH_X0), sz(460)); g.closePath();
    g.fillStyle = '#e6d6ad'; g.fill();
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3;
    g.beginPath(); shore.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z)))); g.stroke(); g.restore();
    // Landmasse mit Uferlinie
    const L = C.LAND;
    g.save(); g.shadowColor = 'rgba(20,40,60,0.45)'; g.shadowBlur = 14;
    rect(L.minX, L.minZ, L.maxX, L.maxZ, '#d9d4c6', 6); g.restore();
    g.strokeStyle = 'rgba(70,80,90,0.5)'; g.lineWidth = 2;
    g.strokeRect(sx(L.minX), sz(L.minZ), (L.maxX - L.minX) * sc, (L.maxZ - L.minZ) * sc);
    // Blöcke
    const dcol = { downtown: '#cbc6ba', midtown: '#d1ccbf', westside: '#d6d0c2', heights: '#d3d6c4', seaside: '#ddd4c2', harbor: '#c4c3bd', oldtown: '#ddd0bd' };
    for (let bj = 0; bj < NB; bj++) for (let bi = I0; bi < NB; bi++) {
      const x0 = roadPos(bi) + 9, z0 = roadPos(bj) + 9;
      rect(x0, z0, x0 + CELL - 18, z0 + CELL - 18, C.isPark(bi, bj) ? '#a9c98d' : (dcol[C.districtOf(bi, bj)] || '#1d2638'), 4);
      if (C.isPark(bi, bj)) { // Parkwege
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3 * sc;
        g.beginPath(); g.moveTo(sx(x0 + 31), sz(z0)); g.lineTo(sx(x0 + 31), sz(z0 + 62)); g.moveTo(sx(x0), sz(z0 + 31)); g.lineTo(sx(x0 + 62), sz(z0 + 31)); g.stroke();
      }
    }
    // Gebäude (leicht erhaben)
    for (const [x0, z0, x1, z1] of this.footprints) {
      rect(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, '#b3ada1');
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(sx(x0 + 0.5), sz(z0 + 0.5), (x1 - x0 - 1) * sc, 2.2 * sc);
    }
    // Straßen: Kontur, Belag, Mittellinie
    const major = (i) => i === I0 || i === 0 || i === NB || i === 4 || i === 5;
    const lines = (w, colFn) => {
      for (let i = I0; i <= NB; i++) {
        const r = roadPos(i);
        g.strokeStyle = colFn(i); g.lineWidth = w(i) * sc; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx(r), sz(-HALF - 6)); g.lineTo(sx(r), sz(HALF + 6)); g.stroke();
        if (i >= 0) { g.beginPath(); g.moveTo(sx(C.WEST_X - 6), sz(r)); g.lineTo(sx(HALF + 6), sz(r)); g.stroke(); }
      }
    };
    const hillLines = (w, col) => {
      for (const pl of this.villageRoads || []) {
        g.strokeStyle = col; g.lineWidth = w * sc; g.lineJoin = 'round'; g.lineCap = 'round';
        g.beginPath(); pl.forEach(([x, z], k) => (k ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z)))); g.stroke();
      }
    };
    lines((i) => (major(i) ? 18 : 15), () => '#9a968d');
    lines((i) => (major(i) ? 15 : 12), (i) => (major(i) ? '#fbe9a6' : '#ffffff'));
    g.setLineDash([3 * sc, 4 * sc]);
    lines(() => 0.7, (i) => (major(i) ? 'rgba(200,150,30,0.55)' : 'rgba(0,0,0,0)'));
    g.setLineDash([]);
    // Kreuzungen
    for (const n of this.nodes) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(sx(n.x), sz(n.z), 6 * sc, 0, 7); g.fill(); }
    // Pier & Riesenrad
    rect(C.PIER.x0, C.PIER.z0, C.PIER.x1, C.PIER.z1, '#a88b62', 2);
    rect(C.PIER_PLAT.x0, C.PIER_PLAT.z0, C.PIER_PLAT.x1, C.PIER_PLAT.z1, '#a88b62', 4);
    g.save(); g.strokeStyle = '#6d6a64'; g.lineWidth = 3;
    g.beginPath(); g.arc(sx(632), sz(40), 24 * sc, 0, 7); g.stroke(); g.restore();
    // Bootsstege
    for (const D of C.DOCKS) for (const r of D.rects) rect(r[0], r[1], r[2], r[3], '#a88b62', 2);
    // Hafen: Schiff & Kräne
    rect(-330, 398, -92, 426, '#5d6b78', 6);
    for (const cx of [-330, -250, -170, -90]) rect(cx - 6, 372, cx + 6, 384, '#d9a520');
    // Solera Hills
    const step = 10;
    for (let z = HILLS.z0; z < HILLS.z1 + 20; z += step) for (let x = HILLS.x0; x < HILLS.x1; x += step) {
      const y = hillHeight(x + step / 2, z + step / 2);
      if (y < -0.7) continue;
      const shade = Math.min(1, Math.max(0, (hillHeight(x + step, z) - hillHeight(x, z + step)) * 0.06 + 0.5));
      const dry = smoothstep(-520, -950, x) * smoothstep(-2300, -1900, z);
      let col;
      if (y < 1.2) col = [226, 212, 172];
      else if (y > 290) col = [240, 240, 238];
      else if (y > 170) col = [176, 168, 150];
      else { const t = Math.min(1, y / 170); col = [150 - t * 40 + dry * 70, 176 - t * 36 + dry * 10, 120 - t * 20 + dry * 5]; }
      const f = 0.78 + shade * 0.44;
      g.fillStyle = `rgb(${col[0] * f | 0},${col[1] * f | 0},${col[2] * f | 0})`;
      g.fillRect(sx(x), sz(z), step * sc + 1, step * sc + 1);
    }
    for (const cw of C.CAUSEWAYS) rect(cw.x0, cw.z0, cw.x1, cw.z1, '#fbe9a6');
    rect(AIRFIELD.x0, AIRFIELD.z0 + 8, AIRFIELD.x1, AIRFIELD.z1 - 8, '#8d8a83');
    for (const [x0, z0, x1, z1] of this.footprints) if (z1 < HILLS.z1) rect(x0 + 0.5, z0 + 0.5, x1 - 0.5, z1 - 0.5, '#b3ada1');
    hillLines(14, '#9a968d'); hillLines(10, '#ffffff');
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
    // Vegetationskacheln nach Entfernung ein-/ausblenden
    this.vegT = (this.vegT || 0) - dt;
    if (this.vegT <= 0 && this.vegChunks) {
      this.vegT = 0.4;
      const cp = G.camera.position, far = G.quality === 'low' ? 620 : G.quality === 'medium' ? 900 : 1150;
      for (const c of this.vegChunks) c.im.visible = Math.hypot(c.x - cp.x, c.z - cp.z) < far + 290;
    }
    const night = G.world.env ? G.world.env.night : 0;
    // Nässe: Regen oder leichter Glanz bei Nacht -> Straßen spiegeln
    if (this.env) {
      WET.value = G.interior ? 0 : Math.max(this.env.wet, night * 0.22);
      const em = 0.35 + WET.value * 0.85;
      for (const k of ['road', 'asph', 'walk', 'concrete']) this.M[k].envMapIntensity = em;
    }
    // Nachtbeleuchtung
    const n = night;
    for (const k of ['glass', 'office', 'apt', 'deco', 'warehouse', 'house', 'store']) this.M[k].emissiveIntensity = n * (k === 'store' ? 0.85 : 0.7);
    this.M.bill.emissiveIntensity = n * 0.5;
    this.M.accent.color.setScalar(lerp(0.35, 0.75, n));
    this.M.signs.color.setScalar(lerp(0.55, 0.95, n) * (0.94 + 0.06 * Math.sin(G.time * 40) * (Math.sin(G.time * 1.3) > 0.97 ? 1 : 0)));
    this.lampGlowMat.color.setRGB(lerp(0.5, 1.5, n), lerp(0.45, 1.25, n), lerp(0.4, 0.85, n));
    this.poolMat.opacity = n * 0.45;
    this.poolIM.visible = n > 0.02;
    this.M.poolw.emissiveIntensity = 0.3 + n * 0.7;

    // Ampeln
    const red = new THREE.Color(1.6, 0.12, 0.08), yel = new THREE.Color(1.5, 0.95, 0.05), grn = new THREE.Color(0.1, 1.5, 0.4), dim = new THREE.Color(0.07, 0.07, 0.07);
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
      this.wheel.rotation.x += dt * 0.1;
      const mm = new THREE.Matrix4();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + this.wheel.rotation.x;
        // gleiche Drehrichtung wie Speichen und Rad (Speiche k zeigt auf (cos a, sin a))
        mm.makeTranslation(0, Math.cos(a) * this.wheelR, Math.sin(a) * this.wheelR);
        this.gondolas.setMatrixAt(k, mm);
      }
      this.gondolas.instanceMatrix.needsUpdate = true;
      // Lichter (Farbverlauf)
      const lc = this.wheelLightCols, t = G.time;
      const bright = lerp(0.25, 0.85, n);
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
