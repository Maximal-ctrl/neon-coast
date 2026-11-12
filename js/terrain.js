// Solera County: Gelände (Höhenfeld), Landstraßennetz und Orte im Umland
import * as C from './config.js';
import { lerp, smoothstep } from './utils.js';

const { REGION, CAUSEWAYS, TOWNS, TOWN_CS } = C;

// ---------------------------------------------------------------- Rauschen
function vhash(ix, iz) { let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = vhash(ix, iz), b = vhash(ix + 1, iz), c = vhash(ix, iz + 1), d = vhash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
export function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s / 0.97; }

export const HILLS = REGION;
export const CAUSEWAY = CAUSEWAYS[0];
export const VILLAGE = { x: -160, z: -752, r: 92, y: 26 };

// Monte Negro: einzelner hoher Berg mit Anwesen auf dem Gipfel
export const PEAK = { x: 1000, z: -2300, r: 74, top: 232 };
// Finca Escondida: abgelegene Farm mit Landepiste (Plateau)
export const FARM = { x0: -650, x1: -290, z0: -1398, z1: -1312, y: 78 };

// Rohgelände: Küste im Süden, Hügel, Ringgebirge an den Rändern, Hochgebirge im Norden
function rawHill(x, z) {
  const shore = -478 + 22 * Math.sin(x * 0.011) + 10 * Math.sin(x * 0.033 + 1.3);
  const d = shore - z; // > 0: landeinwärts
  let h = d < 0 ? -1.4 + d * 0.12 : -1.4 + Math.min(d, 25) * 0.09;
  const m = fbm(x * 0.0045 + 3.1, z * 0.0045 + 7.7);
  const r = 1 - Math.abs(vnoise(x * 0.006 + 11, z * 0.006 - 4) * 2 - 1);
  const land = smoothstep(20, 300, d);
  h += (Math.max(0, m - 0.3) * 270 + r * r * 32 + (fbm(x * 0.03, z * 0.03) - 0.5) * 3) * land;
  // Ringgebirge (Weltgrenze) und Sierra im Norden
  const ed = Math.min(x - REGION.x0, REGION.x1 - x, z - REGION.z0);
  const ring = smoothstep(560, 40, ed);
  const big = fbm(x * 0.0021 + 17.3, z * 0.0021 - 9.1);
  h += ring * ring * (230 + 210 * big) * smoothstep(10, 220, d);
  h += smoothstep(-1500, -2700, z) * Math.max(0, big - 0.38) * 520 * land;
  const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
  if (dp < 340) h = Math.max(h, PEAK.top - Math.max(0, dp - PEAK.r) * 0.75);
  return [h, d];
}

export const naturalHeight = (x, z) => rawHill(x, z)[0];

function spline(ctrl) {
  const pts = [];
  for (let k = 0; k < ctrl.length - 1; k++) {
    const p0 = ctrl[Math.max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[Math.min(ctrl.length - 1, k + 2)];
    const n = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4);
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  return pts;
}
// Höhenprofil: geglättetes Gelände, Steigung begrenzt; fixedY(p, i) -> feste Höhe oder null
function profile(pts, startY, slope, fixedY, smooth = 6, full = false) {
  let hs = pts.map(([x, z]) => Math.max(0.9, rawHill(x, z)[0]));
  for (let it = 0; it < 6; it++) hs = hs.map((_, i) => { let s = 0, c = 0; for (let j = -smooth; j <= smooth; j++) { const v = hs[i + j]; if (v !== undefined) { s += v; c++; } } return s / c; });
  const n = hs.length;
  const fixed = pts.map((p, i) => (i === 0 ? startY : fixedY ? fixedY(p, i) : null));
  for (let i = 0; i < n; i++) if (fixed[i] != null) hs[i] = fixed[i];
  const seg = (i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  if (!full) {
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n; i++) if (fixed[i] == null) hs[i] = Math.min(hs[i], hs[i - 1] + seg(i - 1) * slope);
      for (let i = n - 2; i > 0; i--) if (fixed[i] == null) hs[i] = Math.max(hs[i], hs[i + 1] - seg(i) * slope);
    }
    return hs;
  }
  // beidseitig begrenzen (Anstieg und Gefälle), feste Punkte bleiben
  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < n; i++) if (fixed[i] == null) { const d = seg(i - 1) * slope; hs[i] = Math.max(hs[i - 1] - d, Math.min(hs[i - 1] + d, hs[i])); }
    for (let i = n - 2; i > 0; i--) if (fixed[i] == null) { const d = seg(i) * slope; hs[i] = Math.max(hs[i + 1] - d, Math.min(hs[i + 1] + d, hs[i])); }
  }
  return hs;
}
// Höhenprofil weich machen: keine Knicke an Kuppen und Senken (feste Punkte bleiben)
let _pts = null, _slope = 0.1;
function smoothHs(hs, fixed) {
  const n = hs.length, P = _pts, sl = _slope;
  const seg = (i) => Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
  for (let round = 0; round < 12; round++) {
    for (let it = 0; it < 24; it++) for (let i = 1; i < n - 1; i++) if (!fixed[i]) hs[i] += 0.5 * ((hs[i - 1] + hs[i + 1]) * 0.5 - hs[i]);
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < n; i++) if (!fixed[i]) { const d = seg(i - 1) * sl; hs[i] = Math.max(hs[i - 1] - d, Math.min(hs[i - 1] + d, hs[i])); }
      for (let i = n - 2; i > 0; i--) if (!fixed[i]) { const d = seg(i) * sl; hs[i] = Math.max(hs[i + 1] - d, Math.min(hs[i + 1] + d, hs[i])); }
    }
  }
  for (let it = 0; it < 6; it++) for (let i = 1; i < n - 1; i++) if (!fixed[i]) hs[i] += 0.5 * ((hs[i - 1] + hs[i + 1]) * 0.5 - hs[i]);
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < n; i++) if (!fixed[i]) { const d = seg(i - 1) * sl; hs[i] = Math.max(hs[i - 1] - d, Math.min(hs[i - 1] + d, hs[i])); }
    for (let i = n - 2; i > 0; i--) if (!fixed[i]) { const d = seg(i) * sl; hs[i] = Math.max(hs[i + 1] - d, Math.min(hs[i + 1] + d, hs[i])); }
  }
  return hs;
}
function bbox(pts) { const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]); return [Math.min(...xs) - 40, Math.min(...zs) - 40, Math.max(...xs) + 40, Math.max(...zs) + 40]; }

// ---------------------------------------------------------------- Orte (Plateaus)
function avgRaw(x0, z0, x1, z1) { let s = 0, n = 0; for (let x = x0; x <= x1; x += 40) for (let z = z0; z <= z1; z += 40) { s += rawHill(x, z)[0]; n++; } return s / n; }
for (const t of TOWNS) {
  const r = C.townRect(t);
  if (t.y == null) t.y = Math.round(Math.min(95, Math.max(8, avgRaw(r.x0, r.z0, r.x1, r.z1) * 0.7)));
}
// Flugplatz südlich von Los Ranchos
const RANCH = TOWNS.find((t) => t.key === 'ranchos');
export const AIRFIELD = { x0: RANCH.cx - 330, x1: RANCH.cx + 230, z0: RANCH.cz + 96, z1: RANCH.cz + 150, y: RANCH.y };
const PLATEAUS = [
  ...TOWNS.map((t) => ({ ...C.townRect(t, 26), y: t.y, fall: 110 })),
  { ...AIRFIELD, fall: 90 },
  { ...FARM, fall: 80 },
];
const townY = (key) => TOWNS.find((t) => t.key === key).y;
const inTown = (key, m = 6) => { const t = TOWNS.find((q) => q.key === key), r = C.townRect(t, m); return ([x, z]) => (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 ? t.y : null); };

// ---------------------------------------------------------------- Landstraßen
export const HILL_ROAD = (() => {
  const pts = spline([[40, -490], [40, -540], [34, -585], [8, -618], [-36, -640], [-70, -672], [-94, -696], [-110, -716], [-115, -734]]);
  const vfix = ([x, z]) => (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 4 ? VILLAGE.y : null);
  _pts = pts; _slope = 0.11;
  const hs = smoothHs(profile(pts, 0.9, 0.11, vfix), pts.map((p, i) => i === 0 || vfix(p) != null));
  return { name: 'Bergstraße', pts, hs, bb: bbox(pts) };
})();
const nearestIdx = (R, x, z) => { let b = 0, bd = 1e18; R.pts.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; };
export const SUMMIT_JOIN = nearestIdx(HILL_ROAD, 34, -585);
export const SUMMIT_ROAD = (() => {
  const j = HILL_ROAD.pts[SUMMIT_JOIN];
  // Endstück führt gerade durch das Tor des Anwesens (Tor bei z = -864)
  const pts = spline([[j[0], j[1]], [80, -592], [150, -580], [230, -566], [310, -580], [380, -606], [432, -646], [414, -694], [452, -736], [492, -758], [498, -796], [486, -826], [510, -840], [527, -856], [530, -872]]);
  const hs = profile(pts, HILL_ROAD.hs[SUMMIT_JOIN], 0.17, null);
  // Zufahrt am Anwesen eben auf Hofhöhe; davor mit max. 17 % Steigung anschließen
  const end = pts[pts.length - 1], my = hs[hs.length - 1];
  for (let i = pts.length - 1; i >= 0; i--) if (Math.hypot(pts[i][0] - end[0], pts[i][1] - end[1]) < 16) hs[i] = my;
  for (let i = pts.length - 2; i > 0; i--) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); hs[i] = Math.max(hs[i], hs[i + 1] - d * 0.17); }
  _pts = pts; _slope = 0.17;
  smoothHs(hs, pts.map((p, i) => i === 0 || Math.hypot(p[0] - end[0], p[1] - end[1]) < 16));
  return { name: 'Gipfelstraße', pts, hs, bb: bbox(pts) };
})();
export const MANSION = (() => { const e = SUMMIT_ROAD.pts[SUMMIT_ROAD.pts.length - 1]; return { x: e[0], z: e[1] - 40, r: 58, y: SUMMIT_ROAD.hs[SUMMIT_ROAD.hs.length - 1] }; })();
export const LOOKOUT = { x: 330, z: -2790, r: 34, y: 0 };

// Neue Straßen: Start an einem Punkt einer vorhandenen Straße (from) oder mit fester Höhe
function road(name, ctrl, o = {}) {
  let startY = o.y0 ?? 0.9;
  if (o.from) { const i = nearestIdx(o.from, ctrl[0][0], ctrl[0][1]); ctrl[0] = [...o.from.pts[i]]; startY = o.from.hs[i]; }
  let endY = o.y1 ?? null;
  if (o.to) { const i = nearestIdx(o.to, ctrl[ctrl.length - 1][0], ctrl[ctrl.length - 1][1]); ctrl[ctrl.length - 1] = [...o.to.pts[i]]; endY = o.to.hs[i]; }
  const pts = spline(ctrl);
  const n = pts.length;
  const fx = (p, i) => { if (i === n - 1 && endY != null) return endY; for (const f of o.fixed || []) { const y = f(p); if (y != null) return y; } return null; };
  _pts = pts; _slope = o.slope || 0.1;
  const hs = smoothHs(profile(pts, startY, o.slope || 0.1, fx, 14, true), pts.map((p, i) => i === 0 || fx(p, i) != null));
  return { name, pts, hs, bb: bbox(pts) };
}
const V = TOWNS[0], B = TOWNS[1], Rn = TOWNS[2];
const vill = ([x, z]) => (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.r + 4 ? VILLAGE.y : null);
// Westdamm -> Los Ranchos
export const WEST_ROAD = road('Westroute', [[-520, -490], [-520, -545], [-560, -612], [-680, -720], [-860, -900], [-1020, -1090], [-1100, -1200], C.townNode(Rn, 3, 1)], { y0: 0.9, y1: Rn.y, fixed: [inTown('ranchos')] });
// Küstenstraße West: Westroute -> Bergstraße
export const COAST_W = road('Küstenstraße', [[-520, -545], [-420, -550], [-300, -546], [-180, -541], [-70, -538], [40, -536]], { from: WEST_ROAD, to: HILL_ROAD });
// Küstenstraße Ost: Gipfelstraße -> Bahía Blanca
export const COAST_E = road('Küstenstraße Ost', [[230, -566], [330, -548], [480, -538], [700, -548], [950, -562], [1150, -592], [1250, -632], C.townNode(B, 0, 1)], { from: SUMMIT_ROAD, y1: B.y, fixed: [inTown('bahia')] });
// Bahía Blanca -> Valverde
export const NORTH_E = road('Ostroute', [C.townNode(B, 2, 0), [1440, -800], [1380, -950], [1250, -1150], [1080, -1400], [860, -1620], [650, -1790], [520, -1858], C.townNode(V, 4, 2)], { y0: B.y, y1: V.y, fixed: [inTown('bahia'), inTown('valverde')] });
// Valverde -> Monte Solera
export const VALLEY = road('Talstraße', [C.townNode(V, 2, 3), [290, -1700], [240, -1500], [120, -1300], [-30, -1100], [-130, -950], [-160, -872], [-160, -844]], { y0: V.y, y1: VILLAGE.y, fixed: [inTown('valverde'), vill] });
// Los Ranchos -> Valverde (Passstraße)
export const PASS = road('Passstraße', [C.townNode(Rn, 2, 0), [-1200, -1450], [-1080, -1650], [-860, -1850], [-560, -1990], [-250, -1990], [20, -1950], C.townNode(V, 0, 1)], { y0: Rn.y, y1: V.y, slope: 0.12, fixed: [inTown('ranchos'), inTown('valverde')] });
// Valverde -> Aussichtspunkt in der Sierra
export const SIERRA = road('Sierra-Pass', [C.townNode(V, 2, 0), [320, -2120], [380, -2280], [260, -2440], [360, -2600], [330, -2760]], { y0: V.y, slope: 0.13, fixed: [inTown('valverde')] });
LOOKOUT.y = SIERRA.hs[SIERRA.hs.length - 1];

// Neue Orte (3.0)
const SC = TOWNS.find((t) => t.key === 'santacruz'), LV = TOWNS.find((t) => t.key === 'lagoverde'), PA = TOWNS.find((t) => t.key === 'pinar'), SL = TOWNS.find((t) => t.key === 'sanlucar');
export const CRUZ_E = road('Zufahrt Santa Cruz', [[-692, -732], [-780, -690], C.townNode(SC, 4, 1)], { from: WEST_ROAD, y1: SC.y, fixed: [inTown('santacruz')] });
export const CRUZ_N = road('Küstenpfad', [C.townNode(SC, 1, 0), [-990, -790], [-900, -830], [-806, -844]], { y0: SC.y, to: WEST_ROAD, fixed: [inTown('santacruz')] });
export const LAGO_W = road('Seestraße', [[280, -1646], [380, -1560], C.townNode(LV, 0, 1)], { from: VALLEY, y1: LV.y, fixed: [inTown('lagoverde')] });
export const LAGO_N = road('Seeweg Valverde', [C.townNode(V, 4, 3), [520, -1660], [600, -1580], C.townNode(LV, 2, 0)], { y0: V.y, y1: LV.y, fixed: [inTown('valverde'), inTown('lagoverde')] });
export const PINAR_R = road('Pinienweg', [[-261, -1991], [-290, -2150], [-340, -2300], C.townNode(PA, 2, 2)], { from: PASS, y1: PA.y, fixed: [inTown('pinar')] });
export const LUCAR_R = road('Zufahrt San Lúcar', [C.townNode(B, 3, 0), [1515, -840], C.townNode(SL, 1, 2)], { y0: B.y, y1: SL.y, fixed: [inTown('bahia'), inTown('sanlucar')] });

// 3.1: Cañón Rojo nach Piedra Roja, Serpentine auf den Monte Negro, Feldweg zur Finca
const PR = TOWNS.find((t) => t.key === 'piedra');
export const CANYON = road('Cañón Rojo', [[-1125, -1590], [-1225, -1690], [-1320, -1825], [-1395, -1965], C.townNode(PR, 2, 2)], { from: PASS, y1: PR.y, fixed: [inTown('piedra')] });
CANYON.canyon = true;
export const PEAK_R = road('Montenegro-Serpentine', (() => {
  const out = [[894, -1589], [930, -1800], [PEAK.x, PEAK.z + 255]];
  for (let k = 1; k <= 22; k++) { const t = k / 22, a = t * Math.PI * 2, r = 255 - t * 168; out.push([PEAK.x + Math.sin(a) * r, PEAK.z + Math.cos(a) * r]); }
  out.push([PEAK.x, PEAK.z + 55]);
  return out;
})(), { from: NORTH_E, y1: PEAK.top, slope: 0.13, fixed: [([x, z]) => (Math.hypot(x - PEAK.x, z - PEAK.z) < PEAK.r ? PEAK.top : null)] });
PEAK_R.noBridge = true;
const inFarm = ([x, z]) => (x > FARM.x0 - 4 && x < FARM.x1 + 4 && z > FARM.z0 - 4 && z < FARM.z1 + 4 ? FARM.y : null);
export const FARM_R = road('Feldweg zur Finca', [[-18, -1117], [-110, -1195], [-210, -1285], [FARM.x1 - 6, (FARM.z0 + FARM.z1) / 2]], { from: VALLEY, y1: FARM.y, slope: 0.13, fixed: [inFarm] });
FARM_R.dirt = true;
export const ESTATE2 = { x: PEAK.x, z: PEAK.z, r: 58, y: PEAK.top };

export const HILL_ROADS = [HILL_ROAD, SUMMIT_ROAD, WEST_ROAD, COAST_W, COAST_E, NORTH_E, VALLEY, PASS, SIERRA, CRUZ_E, CRUZ_N, LAGO_W, LAGO_N, PINAR_R, LUCAR_R, CANYON, PEAK_R, FARM_R];

// Brücken: Abschnitte, die hoch über dem natürlichen Gelände verlaufen (keine Aufschüttung, Brückenbau)
for (const R of HILL_ROADS) {
  const n = R.pts.length, hi = new Uint8Array(n), br = new Uint8Array(n);
  if (R.noBridge) { R.bridge = new Uint8Array(R.pts.length); continue; }
  R.pts.forEach(([x, z], i) => { if (!C.townAt(x, z, 40) && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > VILLAGE.r + 30 && R.hs[i] - rawHill(x, z)[0] > 7.5) hi[i] = 1; });
  for (let i = 0; i < n;) {
    if (!hi[i]) { i++; continue; }
    let j = i; while (j < n && hi[j]) j++;
    if (j - i >= 5) for (let k = Math.max(1, i - 2); k < Math.min(n - 1, j + 2); k++) br[k] = 1;
    i = j;
  }
  R.bridge = br;
}

// ---------------------------------------------------------------- Raster für schnelle Straßensuche
const HC = 48;
const segHash = new Map();
const hk = (cx, cz) => cx * 100003 + cz;
HILL_ROADS.forEach((R, ri) => {
  for (let i = 0; i < R.pts.length - 1; i++) {
    const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1];
    const cx0 = Math.floor((Math.min(ax, bx) - 36) / HC), cx1 = Math.floor((Math.max(ax, bx) + 36) / HC), cz0 = Math.floor((Math.min(az, bz) - 36) / HC), cz1 = Math.floor((Math.max(az, bz) + 36) / HC);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const k = hk(cx, cz); let l = segHash.get(k); if (!l) segHash.set(k, (l = [])); l.push(ri, i); }
  }
});
const _hr = [0, 0, 0, 0];
// Abstand zur nächsten Landstraße (bis ~36 m) -> [abstand, straßenhöhe, straße, segment] oder null
export function hillRoadAt(x, z) {
  const l = segHash.get(hk(Math.floor(x / HC), Math.floor(z / HC)));
  if (!l) return null;
  let best = 1e9, by = 0, br = 0, bi = 0;
  for (let k = 0; k < l.length; k += 2) {
    const R = HILL_ROADS[l[k]], i = l[k + 1], P = R.pts;
    const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az;
    const l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; by = R.hs[i] + (R.hs[i + 1] - R.hs[i]) * t; br = l[k]; bi = i; }
  }
  _hr[0] = Math.sqrt(best); _hr[1] = by; _hr[2] = br; _hr[3] = bi;
  return _hr;
}
// breitere Suche nur für den Geländeaufbau (Böschungen bis ~80 m)
const segWide = new Map();
HILL_ROADS.forEach((R, ri) => {
  for (let i = 0; i < R.pts.length - 1; i++) {
    const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1];
    for (let cx = Math.floor((Math.min(ax, bx) - 80) / HC); cx <= Math.floor((Math.max(ax, bx) + 80) / HC); cx++) for (let cz = Math.floor((Math.min(az, bz) - 80) / HC); cz <= Math.floor((Math.max(az, bz) + 80) / HC); cz++) { const k = hk(cx, cz); let l = segWide.get(k); if (!l) segWide.set(k, (l = [])); l.push(ri, i); }
  }
});
const _rw = [0, 0, 0, 0];
function roadNear(x, z) {
  const l = segWide.get(hk(Math.floor(x / HC), Math.floor(z / HC)));
  if (!l) return null;
  let best = 1e9, by = 0, br = 0, bi = 0;
  for (let k = 0; k < l.length; k += 2) {
    const R = HILL_ROADS[l[k]], i = l[k + 1], P = R.pts;
    const ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - x, ez = az + dz * t - z, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; by = R.hs[i] + (R.hs[i + 1] - R.hs[i]) * t; br = l[k]; bi = i; }
  }
  _rw[0] = Math.sqrt(best); _rw[1] = by; _rw[2] = br; _rw[3] = bi;
  return _rw;
}
// grobe Suche für die Tal-Aufweitung (bis ~170 m): Stützpunkte jeder Straße im 96-m-Raster
const WC = 96, wide = new Map();
HILL_ROADS.forEach((R) => { for (let i = 0; i < R.pts.length; i += 3) { if (R.bridge[i] || R.canyon) continue; const [x, z] = R.pts[i]; for (let cx = Math.floor((x - 170) / WC); cx <= Math.floor((x + 170) / WC); cx++) for (let cz = Math.floor((z - 170) / WC); cz <= Math.floor((z + 170) / WC); cz++) { const k = hk(cx, cz); let l = wide.get(k); if (!l) wide.set(k, (l = [])); l.push(x, z, R.hs[i]); } } });
function valleyAt(x, z) {
  const l = wide.get(hk(Math.floor(x / WC), Math.floor(z / WC)));
  if (!l) return null;
  let best = 1e18, by = 0;
  for (let k = 0; k < l.length; k += 3) { const d = (l[k] - x) ** 2 + (l[k + 1] - z) ** 2; if (d < best) { best = d; by = l[k + 2]; } }
  return [Math.sqrt(best), by];
}

// ---------------------------------------------------------------- Höhe
// exakte Geländehöhe (für den Aufbau); zur Laufzeit wird das Höhenfeld interpoliert
export function terrainExact(x, z) {
  if (x < REGION.x0 || x > REGION.x1 || z < REGION.z0 || z > REGION.z1) return -6;
  let [h] = rawHill(x, z);
  // Täler entlang der Straßen
  const rb = roadNear(x, z), underBridge = rb && rb[0] < 75 && HILL_ROADS[rb[2]].bridge[rb[3]];
  const v = underBridge ? null : valleyAt(x, z);
  if (v) h = lerp(h, v[1] + (h - v[1]) * 0.35, 1 - smoothstep(30, 165, v[0]));
  // Dorf, Anwesen, Aussichtspunkt
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
  if (dv < VILLAGE.r + 60) h = lerp(h, VILLAGE.y, 1 - smoothstep(VILLAGE.r, VILLAGE.r + 60, dv));
  const dm = Math.hypot(x - MANSION.x, z - MANSION.z);
  if (dm < MANSION.r + 70) h = lerp(h, MANSION.y, 1 - smoothstep(MANSION.r, MANSION.r + 70, dm));
  const dk = Math.hypot(x - PEAK.x, z - PEAK.z);
  if (dk < PEAK.r + 30) h = lerp(h, PEAK.top, 1 - smoothstep(PEAK.r - 4, PEAK.r + 30, dk));
  const dl = Math.hypot(x - LOOKOUT.x, z - LOOKOUT.z);
  if (dl < LOOKOUT.r + 50) h = lerp(h, LOOKOUT.y, 1 - smoothstep(LOOKOUT.r, LOOKOUT.r + 50, dl));
  // Orte & Flugplatz
  for (const p of PLATEAUS) {
    const dx = Math.max(p.x0 - x, 0, x - p.x1), dz = Math.max(p.z0 - z, 0, z - p.z1), d = Math.hypot(dx, dz);
    if (d < p.fall) h = lerp(h, p.y, 1 - smoothstep(0, p.fall, d));
  }
  // Kreuzungen eben
  for (const J of JUNCTIONS) { const d = Math.hypot(x - J.x, z - J.z); if (d < 34) h = lerp(h, J.y - 0.2, 1 - smoothstep(12, 34, d)); }
  // Straße einschneiden / aufschütten – breite, sanfte Böschungen bei großen Höhenunterschieden
  const r = roadNear(x, z);
  if (r) {
    const R = HILL_ROADS[r[2]], tgt = r[1] - 0.12, dh = Math.abs(h - tgt);
    if (R.bridge[r[3]] && h < tgt - 2) h = Math.min(h, tgt - 5.5); // unter der Brücke: Tal bleibt frei
    else if (R.canyon && !C.townAt(x, z, 20)) { h = lerp(h, tgt, 1 - smoothstep(12, 26, r[0])); h = Math.max(h, tgt - 0.12 + 58 * smoothstep(13, 44, r[0]) + 6 * (fbm(x * 0.04, z * 0.04) - 0.5) * smoothstep(20, 40, r[0])); } // hohe, steile Canyonwände
    else h = lerp(h, tgt, 1 - smoothstep(11, Math.min(80, 30 + dh * 1.3), r[0]));
  }
  // unter den Dämmen: Gelände unter Wasser halten
  for (const cw of CAUSEWAYS) if (z > cw.z0 && Math.abs(x - (cw.x0 + cw.x1) / 2) < 16) h = Math.min(h, -1.2);
  return Math.max(-6, h);
}
export const GRID = 10;
export const GW = Math.round((REGION.x1 - REGION.x0) / GRID) + 1, GD = Math.round((REGION.z1 - REGION.z0) / GRID) + 1;
let HM = null;
export function buildHeightmap() {
  if (HM) return HM;
  const a = new Float32Array(GW * GD);
  for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) a[j * GW + i] = terrainExact(REGION.x0 + i * GRID, REGION.z0 + j * GRID);
  HM = a;
  return a;
}
export function hillHeight(x, z) {
  if (!HM) return terrainExact(x, z);
  if (x < REGION.x0 || x > REGION.x1 || z < REGION.z0 || z > REGION.z1) return -6;
  const fx = (x - REGION.x0) / GRID, fz = (z - REGION.z0) / GRID;
  const i = Math.min(GW - 2, Math.floor(fx)), j = Math.min(GD - 2, Math.floor(fz));
  const u = fx - i, v = fz - j, k = j * GW + i;
  // gleiche Dreiecksteilung wie das Gelände-Mesh
  const h00 = HM[k], h10 = HM[k + 1], h01 = HM[k + GW], h11 = HM[k + GW + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

// ---------------------------------------------------------------- Straßennetz (Knoten & Kanten)
// Knoten: Enden und Einmündungen der Landstraßen, Kreuzungen der Orte, Dämme zur Stadt
export const NET = (() => {
  const nodes = [], edges = [];
  const nodeAt = (x, z, y, extra = {}) => {
    for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 3) { Object.assign(n, extra); return n; }
    const n = { id: nodes.length, x, z, y, edges: [], ...extra };
    nodes.push(n); return n;
  };
  const addEdge = (a, b, pts, hs, o = {}) => {
    let len = 0; for (let i = 0; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const e = { id: edges.length, a: a.id, b: b.id, pts, hs, len, ...o };
    edges.push(e); a.edges.push(e.id); b.edges.push(e.id);
    return e;
  };
  // Landstraßen an allen Einmündungen auftrennen
  const cuts = HILL_ROADS.map((R) => new Set([0, R.pts.length - 1]));
  HILL_ROADS.forEach((R, ri) => {
    for (const end of [R.pts[0], R.pts[R.pts.length - 1]]) HILL_ROADS.forEach((O, oi) => {
      if (oi === ri) return;
      const i = nearestIdx(O, end[0], end[1]);
      if (Math.hypot(O.pts[i][0] - end[0], O.pts[i][1] - end[1]) < 3) cuts[oi].add(i);
    });
  });
  HILL_ROADS.forEach((R, ri) => {
    const c = [...cuts[ri]].sort((a, b) => a - b);
    for (let k = 0; k < c.length - 1; k++) {
      const i0 = c[k], i1 = c[k + 1];
      const a = nodeAt(R.pts[i0][0], R.pts[i0][1], R.hs[i0]), b = nodeAt(R.pts[i1][0], R.pts[i1][1], R.hs[i1]);
      addEdge(a, b, R.pts.slice(i0, i1 + 1), R.hs.slice(i0, i1 + 1), { road: ri });
    }
  });
  // Dämme: Stadtknoten <-> Küste
  CAUSEWAYS.forEach((cw, ci) => {
    const x = (cw.x0 + cw.x1) / 2, pts = [], hs = [];
    for (let z = -364; z > -490; z -= 8) { pts.push([x, z]); hs.push(z > cw.z1 ? 0 : cw.y1 * (cw.z1 - z) / (cw.z1 - cw.z0)); }
    const coast = nodes.find((n) => Math.hypot(n.x - x, n.z + 490) < 4);
    pts.push([coast.x, coast.z]); hs.push(coast.y);
    const gate = nodeAt(x, -360, 0, { gate: cw.node });
    addEdge(gate, coast, pts, hs, { causeway: ci });
  });
  // Ortsstraßen (Raster)
  for (const t of TOWNS) {
    const id = (i, j) => { const [x, z] = C.townNode(t, i, j); return nodeAt(x, z, t.y, { town: t.key }); };
    const line = (a, b) => { const pts = [], hs = [], n = Math.round(TOWN_CS / 7); for (let k = 0; k <= n; k++) { pts.push([a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n]); hs.push(t.y); } return [pts, hs]; };
    for (let j = 0; j <= t.nz; j++) for (let i = 0; i <= t.nx; i++) {
      const a = id(i, j);
      if (i < t.nx) { const b = id(i + 1, j); addEdge(a, b, ...line(a, b), { town: t.key }); }
      if (j < t.nz) { const b = id(i, j + 1); addEdge(a, b, ...line(a, b), { town: t.key }); }
    }
  }
  // Monte Solera: Hauptstraßen des Dorfs als Kanten (Nord-Süd & Ost-West)
  {
    const cx = VILLAGE.x, cz = VILLAGE.z, y = VILLAGE.y;
    const mk = (x, z) => nodeAt(x, z, y, { town: 'village' });
    const c = mk(cx, cz), n = mk(cx, cz - 92), s = mk(cx, cz + 92), w = mk(cx - 92, cz), e = mk(cx + 45, cz), e2 = mk(cx + 45, cz + 18);
    const line = (a, b) => { const pts = [], hs = [], k = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 8)); for (let q = 0; q <= k; q++) { pts.push([a.x + (b.x - a.x) * q / k, a.z + (b.z - a.z) * q / k]); hs.push(y); } return [pts, hs]; };
    for (const [a, b] of [[c, n], [c, s], [c, w], [c, e], [e, e2]]) addEdge(a, b, ...line(a, b), { town: 'village' });
  }
  return { nodes, edges };
})();
// Kürzester Weg zwischen Netzknoten (Dijkstra) -> Liste von [kante, richtung]
export function netRoute(fromId, toId) {
  const N = NET.nodes.length, dist = new Float64Array(N).fill(1e18), prev = new Int32Array(N).fill(-1), pe = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[fromId] = 0;
  for (;;) {
    let u = -1, bd = 1e18;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === toId) break;
    done[u] = 1;
    for (const ei of NET.nodes[u].edges) { const e = NET.edges[ei], v = e.a === u ? e.b : e.a, nd = dist[u] + e.len; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; pe[v] = ei; } }
  }
  const out = [];
  if (dist[toId] > 1e17) return { steps: out, len: 1e18 };
  for (let v = toId; v !== fromId; v = prev[v]) { const e = NET.edges[pe[v]]; out.push([e.id, e.b === v ? 1 : -1]); }
  return { steps: out.reverse(), len: dist[toId] };
}
// nächster Punkt des Netzes -> { edge, idx, d }
const eHash = new Map();
NET.edges.forEach((e) => e.pts.forEach(([x, z], i) => { const k = hk(Math.floor(x / 64), Math.floor(z / 64)); let l = eHash.get(k); if (!l) eHash.set(k, (l = [])); l.push(e.id, i); }));
export function netLocate(x, z) {
  let best = null, bd = 1e18;
  for (let ring = 0; ring < 40 && (!best || ring * 64 < Math.sqrt(bd) + 64); ring++) {
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    for (let ix = -ring; ix <= ring; ix++) for (let iz = -ring; iz <= ring; iz++) {
      if (Math.max(Math.abs(ix), Math.abs(iz)) !== ring) continue;
      const l = eHash.get(hk(cx + ix, cz + iz)); if (!l) continue;
      for (let k = 0; k < l.length; k += 2) { const p = NET.edges[l[k]].pts[l[k + 1]], d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = { edge: l[k], idx: l[k + 1] }; } }
    }
  }
  if (best) best.d = Math.sqrt(bd);
  return best;
}
export const GATES = NET.nodes.filter((n) => n.gate);
// Einmündungen außerhalb der Orte (für ebene Kreuzungsflächen)
export const JUNCTIONS = NET.nodes.filter((n) => !n.town && !n.gate && n.edges.length >= 2 && !(n.edges.length === 2 && NET.edges[n.edges[0]].road === NET.edges[n.edges[1]].road));
