// Boote & Flugzeug: Modelle, Wasser- und Flugphysik, Bootshandel an den Stegen,
// Polizeiboote mit Bordgeschütz, Bootsverkehr rund um Port Solera und Flugfeld Los Ranchos
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { CAR_TYPES, CAR_MATS, copLook, randomLook } from './models.js';
import { GeoBuilder, rgb } from './geo.js';
import { Vehicle } from './vehicle.js';
import { AIRFIELD } from './terrain.js';
import { clamp, damp, rand, pick, dist2, angleDiff } from './utils.js';

// ------------------------------------------------------------ Typen
export const BOATS = {
  dinghy: { name: 'Schlauchboot', boat: true, L: 3.8, W: 1.8, H: 0.55, draft: 0.25, maxSpeed: 15, accel: 6, steer: 1.5, mass: 300, hp: 450, colors: [0xff6b1a, 0x3a3f44, 0xffd23f], price: 6500, cls: 'Beiboot', desc: 'Leicht, wendig und günstig – perfekt für die ersten Runden um die Insel.' },
  jetski: { name: 'Wellenreiter', boat: true, ski: true, L: 3.0, W: 1.2, H: 0.6, draft: 0.25, maxSpeed: 25, accel: 13, steer: 1.9, mass: 350, hp: 320, colors: [0x19e6ff, 0xff2e88, 0x7cff6b, 0xffd60a], price: 11000, cls: 'Jetski', desc: 'Kurz, laut, irre schnell. Springt über jede Welle.' },
  speeder: { name: 'Barracuda', boat: true, L: 7.2, W: 2.5, H: 0.85, draft: 0.5, maxSpeed: 33, accel: 10, steer: 1.05, mass: 1800, hp: 1000, colors: [0xe63946, 0xffffff, 0x111111, 0x00b4d8], price: 48000, cls: 'Rennboot', desc: 'Gleitet mit über 110 km/h übers Wasser. Für Schmuggler und Angeber.' },
  fishing: { name: 'Kutter „Marisol“', boat: true, cabin: true, L: 9.5, W: 3.3, H: 1.2, draft: 0.9, maxSpeed: 13, accel: 3.2, steer: 0.75, mass: 9000, hp: 2200, colors: [0x1d6f6a, 0x9d0208, 0x1d3557], price: 21000, cls: 'Fischkutter', desc: 'Robuster Arbeitskutter mit Kajüte. Unverwüstlich, aber gemütlich.' },
  yacht: { name: 'Solera Star', boat: true, yacht: true, L: 15, W: 4.4, H: 1.7, draft: 1.2, maxSpeed: 17, accel: 2.8, steer: 0.55, mass: 30000, hp: 3500, colors: [0xf4f4f0, 0x101820, 0xcfd8dc], price: 260000, cls: 'Yacht', desc: 'Zwei Decks, getönte Scheiben, Sonnendeck. Der Traum jedes Neureichen.' },
  copboat: { name: 'Küstenwache', boat: true, police: true, gun: true, L: 7.6, W: 2.7, H: 0.95, draft: 0.55, maxSpeed: 31, accel: 10, steer: 1.0, mass: 2400, hp: 1700, colors: [0x1b2b48] },
};
export const PLANES = {
  albatros: { name: 'Albatros', plane: true, L: 8.4, W: 2.0, span: 10.5, maxSpeed: 72, accel: 9, steer: 1, mass: 900, hp: 900, colors: [0xffffff, 0xffd23f, 0xe63946, 0x1d3557], price: 185000, cls: 'Propellerflugzeug', desc: 'Einmotoriges Sportflugzeug. Start und Landung auf dem Flugfeld Los Ranchos – oder auf jeder langen Geraden.' },
};
for (const [k, T] of Object.entries({ ...BOATS, ...PLANES })) { T.wheelR = 0.3; T.brake = 10; T.grip = 1; T.profile = T.plane ? 'plane' : 'boat'; T.build = (key, col) => (T.plane ? buildPlane(key, col) : buildBoat(key, col)); CAR_TYPES[k] = T; }

// ------------------------------------------------------------ Modelle
function hullGeo(L, W, H, draft) {
  const N = 14, S = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, z = -L / 2 + t * L;
    const w = (W / 2) * (t < 0.58 ? 1 - (1 - t / 0.58) * 0.06 : Math.max(0.04, 1 - Math.pow((t - 0.58) / 0.42, 1.8)));
    const top = H + Math.max(0, t - 0.55) * 0.5 * H;
    const d = draft * (t < 0.72 ? 1 : 1 - ((t - 0.72) / 0.28) * 0.75);
    S.push({ z, w, top, d, cw: w * 0.86, cy: -d * 0.3 });
  }
  const B = new GeoBuilder();
  for (let i = 0; i < N; i++) {
    const a = S[i], b = S[i + 1];
    for (const s of [-1, 1]) {
      B.quad([s * a.w, a.top, a.z], [s * b.w, b.top, b.z], [s * b.cw, b.cy, b.z], [s * a.cw, a.cy, a.z]);
      B.quad([s * a.cw, a.cy, a.z], [s * b.cw, b.cy, b.z], [0, -b.d, b.z], [0, -a.d, a.z]);
    }
  }
  const a = S[0];
  B.quad([-a.w, a.top, a.z], [a.w, a.top, a.z], [a.cw, a.cy, a.z], [-a.cw, a.cy, a.z]);
  B.tri([-a.cw, a.cy, a.z], [a.cw, a.cy, a.z], [0, -a.d, a.z]);
  const D = new GeoBuilder(true);
  for (let i = 0; i < N; i++) { const p = S[i], q = S[i + 1]; D.quad([-p.w * 0.94, p.top - 0.06, p.z], [p.w * 0.94, p.top - 0.06, p.z], [q.w * 0.94, q.top - 0.06, q.z], [-q.w * 0.94, q.top - 0.06, q.z], [0, 0, 1, 1], [0.62, 0.45, 0.3]); }
  return { hull: B.build(), deck: D, S };
}
const M = {};
function mats() {
  if (M.det) return M;
  M.det = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
  M.glass = CAR_MATS.glass;
  M.steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.35, metalness: 0.85 });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.6, metalness: 0.3 });
  return M;
}
const hullMat = (col) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide });
function driverGroup(seatY, seatZ) {
  const g = new THREE.Group();
  const dTm = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 }), dHm = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), dTm); t.position.set(0, seatY + 0.55, seatZ);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dHm); h.position.set(0, seatY + 1.02, seatZ);
  g.add(t, h); g.visible = false;
  return { g, dTm, dHm };
}

export function buildBoat(key, color) {
  const T = CAR_TYPES[key], Mt = mats();
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const col = color ?? pick(T.colors);
  const { hull, deck, S } = hullGeo(T.L, T.W, T.H, T.draft);
  const body = new THREE.Mesh(hull, hullMat(col)); body.castShadow = true; grp.add(body);
  const X = deck; // Details (Vertex-Farben)
  const top = T.H, L = T.L, W = T.W;
  const white = [0.95, 0.95, 0.93], dark = [0.08, 0.09, 0.1], grey = [0.45, 0.47, 0.5];
  let seatZ = -L * 0.12, seatY = top - 0.15, height = top + 1.2;
  const glassB = new GeoBuilder();
  if (key === 'dinghy') {
    // Luftschläuche + Außenborder
    for (const s of [-1, 1]) X.box(s * W / 2 - 0.22, top - 0.25, -L / 2 + 0.1, s * W / 2 + 0.05, top + 0.12, L * 0.28, { col: [0.2, 0.22, 0.24] });
    X.box(-0.25, top - 0.4, -L / 2 - 0.5, 0.25, top + 0.45, -L / 2 + 0.05, { col: dark });
    X.box(-0.35, top - 0.1, -L * 0.2, 0.35, top + 0.1, -L * 0.05, { col: grey });
    seatZ = -L * 0.25; seatY = top - 0.2;
  } else if (T.ski) {
    X.box(-0.32, top - 0.05, -L * 0.42, 0.32, top + 0.32, L * 0.12, { col: dark });
    X.box(-0.5, top + 0.4, L * 0.12, 0.5, top + 0.48, L * 0.18, { col: grey });
    X.box(-0.08, top, L * 0.12, 0.08, top + 0.45, L * 0.2, { col: grey });
    seatZ = -L * 0.12; seatY = top + 0.05; height = top + 1.4;
  } else if (key === 'speeder' || key === 'copboat') {
    // Windschutzscheibe, Sitze, Heckmotor
    glassB.quad([-W * 0.4, top, L * 0.05], [W * 0.4, top, L * 0.05], [W * 0.34, top + 0.6, -L * 0.03], [-W * 0.34, top + 0.6, -L * 0.03]);
    X.box(-W * 0.36, top - 0.06, -L * 0.25, -0.1, top + 0.45, -L * 0.12, { col: key === 'copboat' ? dark : white });
    X.box(0.1, top - 0.06, -L * 0.25, W * 0.36, top + 0.45, -L * 0.12, { col: key === 'copboat' ? dark : white });
    X.box(-0.32, top - 0.25, -L / 2 - 0.45, 0.32, top + 0.4, -L / 2 + 0.05, { col: dark });
    seatZ = -L * 0.18; seatY = top - 0.1;
    if (key === 'speeder') X.box(-W / 2 - 0.01, top * 0.35, -L / 2, W / 2 + 0.01, top * 0.5, L * 0.3, { col: [0.98, 0.98, 0.98] });
    if (key === 'copboat') {
      X.box(-W * 0.38, top, -L * 0.1, W * 0.38, top + 1.5, L * 0.08, { col: white, top: false });
      X.box(-W * 0.42, top + 1.5, -L * 0.12, W * 0.42, top + 1.62, L * 0.1, { col: [0.1, 0.17, 0.3] });
      glassB.box(-W * 0.39, top + 0.85, L * 0.08, W * 0.39, top + 1.4, L * 0.085);
      for (const s of [-1, 1]) X.box(s * W / 2 - 0.01, top * 0.3, -L / 2, s * W / 2 + 0.01 * s, top * 0.62, L * 0.3, { col: [0.95, 0.75, 0.1] });
      seatZ = -L * 0.02; height = top + 2.2;
    }
  } else if (T.cabin) {
    X.box(-W * 0.38, top - 0.06, -L * 0.3, W * 0.38, top + 1.9, L * 0.05, { col: white });
    X.box(-W * 0.42, top + 1.9, -L * 0.33, W * 0.42, top + 2.05, L * 0.08, { col: [0.75, 0.2, 0.15] });
    glassB.box(-W * 0.39, top + 1.0, -L * 0.28, W * 0.39, top + 1.6, L * 0.055);
    X.box(-0.06, top, L * 0.2, 0.06, top + 5.5, L * 0.26, { col: grey });
    X.box(-1.6, top + 3.6, L * 0.2, 1.6, top + 3.68, L * 0.23, { col: grey });
    X.box(-W * 0.45, top - 0.06, -L * 0.48, W * 0.45, top + 0.6, -L * 0.42, { col: [0.6, 0.6, 0.6] });
    seatZ = -L * 0.12; seatY = top - 0.05; height = top + 2.2;
  } else if (T.yacht) {
    X.box(-W * 0.42, top - 0.06, -L * 0.4, W * 0.42, top + 1.7, L * 0.18, { col: white });
    X.box(-W * 0.36, top + 1.7, -L * 0.33, W * 0.36, top + 3.1, L * 0.02, { col: white });
    X.box(-W * 0.3, top + 3.1, -L * 0.25, W * 0.3, top + 3.2, -L * 0.05, { col: dark });
    glassB.box(-W * 0.425, top + 0.6, -L * 0.38, W * 0.425, top + 1.3, L * 0.16);
    glassB.box(-W * 0.365, top + 2.1, -L * 0.31, W * 0.365, top + 2.75, L * 0.0);
    X.box(-W * 0.45, top + 0.1, L * 0.2, W * 0.45, top + 0.25, L * 0.42, { col: [0.85, 0.82, 0.75] });
    for (const s of [-1, 1]) X.box(s * W * 0.47 - 0.03, top, -L * 0.48, s * W * 0.47 + 0.03, top + 0.9, L * 0.4, { col: [0.8, 0.82, 0.85] });
    seatZ = -L * 0.1; seatY = top + 1.7; height = top + 3.4;
  }
  const det = new THREE.Mesh(X.build(), Mt.det); det.castShadow = true; grp.add(det);
  if (!glassB.empty) { const gm = new THREE.Mesh(glassB.build(), Mt.glass); gm.renderOrder = 3; grp.add(gm); }
  // Positionslichter & Heck
  const TB = new GeoBuilder();
  TB.box(-0.15, top + 0.05, -L / 2 - 0.02, 0.15, top + 0.18, -L / 2 + 0.03);
  const tail = new THREE.Mesh(TB.build(), CAR_MATS.tailOff); grp.add(tail);
  const HB = new GeoBuilder();
  for (const s of [-1, 1]) HB.box(s * S[10].w * 0.95 - 0.06, top + 0.12, S[10].z - 0.06, s * S[10].w * 0.95 + 0.06, top + 0.24, S[10].z + 0.06);
  grp.add(new THREE.Mesh(HB.build(), CAR_MATS.head));
  const dr = driverGroup(seatY, seatZ); grp.add(dr.g);
  const parts = { body, tail, driver: dr.g, dTm: dr.dTm, dHm: dr.dHm };
  if (T.police) {
    const RB = new GeoBuilder(), BB = new GeoBuilder();
    RB.box(-0.6, top + 1.62, -0.25, -0.05, top + 1.8, 0.1); BB.box(0.05, top + 1.62, -0.25, 0.6, top + 1.8, 0.1);
    parts.red = new THREE.Mesh(RB.build(), CAR_MATS.off); parts.blue = new THREE.Mesh(BB.build(), CAR_MATS.offB);
    grp.add(parts.red, parts.blue);
    // Bordgeschütz am Bug
    const gun = new THREE.Group(); gun.position.set(0, top + 0.1, L * 0.3);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 10), Mt.dark); base.position.y = 0.25; gun.add(base);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 8).rotateX(Math.PI / 2), Mt.steel); barrel.position.set(0, 0.6, 0.55); gun.add(barrel);
    grp.add(gun); parts.gun = gun;
  }
  const geo = { wheels: [], height, wheelbase: L * 0.6, hinge: [W / 2, 0], doorLen: 1, seat: [0, seatZ], belt: 1, plateY: [0, 0], L, headY: top };
  return { group: grp, parts, geo };
}

export function buildPlane(key, color) {
  const T = CAR_TYPES[key], Mt = mats();
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const col = color ?? pick(T.colors);
  const paint = hullMat(col); paint.side = THREE.FrontSide;
  // Rumpf (gedrehter Lathe-Querschnitt)
  const prof = [[0.05, -4.2], [0.35, -3.6], [0.55, -1.5], [0.72, 0.2], [0.75, 1.6], [0.62, 3.0], [0.38, 3.9], [0.05, 4.2]].map(([r, z]) => new THREE.Vector2(r, z));
  const fus = new THREE.LatheGeometry(prof, 14).rotateX(Math.PI / 2);
  fus.scale(1, 1.15, 1); fus.translate(0, 1.55, 0);
  const body = new THREE.Mesh(fus, paint); body.castShadow = true; grp.add(body);
  const X = new GeoBuilder(true);
  const white = [0.96, 0.96, 0.96], dark = [0.1, 0.1, 0.12], stripe = [0.85, 0.15, 0.12];
  // Tragflächen (Hochdecker), Höhen- und Seitenleitwerk
  X.box(-T.span / 2, 2.35, 0.2, T.span / 2, 2.5, 1.9, { col: white });
  for (const s of [-1, 1]) X.box(s * T.span / 2 - s * 0.6 - 0.3, 2.34, 0.2, s * T.span / 2 - s * 0.6 + 0.3, 2.51, 1.9, { col: stripe });
  for (const s of [-1, 1]) X.box(s * 0.5 - 0.05, 1.3, 0.7, s * 1.9 + 0.05, 2.36, 0.85, { col: grey() });
  X.box(-1.9, 1.62, -3.95, 1.9, 1.72, -3.2, { col: white });
  X.box(-0.06, 1.7, -4.1, 0.06, 3.1, -3.3, { col: white });
  X.box(-0.07, 2.6, -4.12, 0.07, 3.1, -3.55, { col: stripe });
  // Fahrwerk
  for (const s of [-1, 1]) X.box(s * 0.75 - 0.05, 0.35, 1.0, s * 1.05 + 0.05, 1.3, 1.12, { col: dark });
  X.box(-0.05, 0.35, 3.2, 0.05, 1.2, 3.32, { col: dark });
  const det = new THREE.Mesh(X.build(), Mt.det); det.castShadow = true; grp.add(det);
  const wg = new THREE.CylinderGeometry(0.33, 0.33, 0.18, 14).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.95, 1.06], [0.95, 1.06], [0, 3.26]]) { const w = new THREE.Mesh(wg, Mt.dark); w.position.set(x, 0.33, z); grp.add(w); }
  // Kanzel
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.75, 1.9), Mt.glass);
  glass.position.set(0, 2.05, 1.6); glass.renderOrder = 3; grp.add(glass);
  // Propeller
  const prop = new THREE.Group(); prop.position.set(0, 1.55, 4.3);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.06), Mt.dark); prop.add(blade);
  const blade2 = blade.clone(); blade2.rotation.z = Math.PI / 2; prop.add(blade2);
  prop.add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 10).rotateX(Math.PI / 2), Mt.steel));
  grp.add(prop);
  const TB = new GeoBuilder(); TB.box(-0.1, 3.0, -4.15, 0.1, 3.12, -4.05);
  for (const s of [-1, 1]) TB.box(s * T.span / 2 - 0.1, 2.38, 0.9, s * T.span / 2 + 0.05, 2.48, 1.2);
  const tail = new THREE.Mesh(TB.build(), CAR_MATS.tailOff); grp.add(tail);
  const dr = driverGroup(1.0, 1.4); grp.add(dr.g);
  const geo = { wheels: [], height: 3.2, wheelbase: 2.2, hinge: [0.8, 1.4], doorLen: 1, seat: [0, 1.4], belt: 1, plateY: [0, 0], L: T.L, headY: 1.5 };
  return { group: grp, parts: { body, tail, driver: dr.g, dTm: dr.dTm, dHm: dr.dHm, prop }, geo };
}
function grey() { return [0.55, 0.57, 0.6]; }

// ------------------------------------------------------------ Wasserphysik
const wave = (x, z, t) => 0.07 * Math.sin(t * 1.3 + x * 0.07) + 0.05 * Math.sin(t * 1.9 + z * 0.09 + 1.3);
const depthAt = (x, z) => C.WATER_Y - G.world.groundHeight(x, z);
export const isWater = (x, z, d = 0.6) => depthAt(x, z) > d;

Vehicle.prototype.updateBoat = function (dt) {
  const T = this.T, inp = this.input, t = G.time;
  let fx = Math.sin(this.h), fz = Math.cos(this.h);
  let vf = this.vx * fx + this.vz * fz, vl = this.vx * fz - this.vz * fx;
  const depth = depthAt(this.x, this.z);
  const afloat = depth > 0.15;
  const top = T.maxSpeed * (this.tune ? this.tune.speed || 1 : 1);
  this.braking = false;
  if (this.alive && afloat) {
    const thr = inp.throttle, brk = inp.brake;
    if (thr > 0) vf += T.accel * (this.tune ? this.tune.accel || 1 : 1) * thr * clamp(1 - vf / top, 0, 1) * dt;
    if (brk > 0) { if (vf > 0.5) { vf -= T.accel * 1.1 * brk * dt; this.braking = true; } else if (vf > -top * 0.3) vf -= T.accel * 0.5 * brk * dt; }
    const st = inp.steer * T.steer * clamp(0.3 + Math.abs(vf) / 9, 0, 1) * (vf < -0.5 ? -1 : 1);
    this.yawRate = damp(this.yawRate, -st * (inp.handbrake ? 1.35 : 1), 3.2, dt);
  } else this.yawRate = damp(this.yawRate, 0, 3, dt);
  vf -= vf * (afloat && depth > 0.5 ? 0.16 : 2.8) * dt;
  vl *= Math.exp(-(depth > 0.5 ? (inp.handbrake ? 0.7 : 2.2) : 6) * dt);
  this.h += this.yawRate * dt;
  fx = Math.sin(this.h); fz = Math.cos(this.h);
  this.vx = fx * vf + fz * vl; this.vz = fz * vf - fx * vl;
  // Ufer, Stege, Kaimauern: Bug- und Heckpunkt prüfen
  const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
  const sgn = vf >= 0 ? 1 : -1, px = nx + fx * this.hl * 0.9 * sgn, pz = nz + fz * this.hl * 0.9 * sgn;
  if (G.world.groundHeight(px, pz) > C.WATER_Y - 0.05) {
    const sp = Math.abs(vf);
    if (sp > 8) { this.damage((sp - 8) * 10, null); G.audio.crash(Math.min(1, sp / 20), this.x, this.z); if (this.driver === 'player') G.cam.shake(Math.min(0.8, sp / 25)); }
    this.vx = -fx * vf * 0.3; this.vz = -fz * vf * 0.3;
    this.yawRate += (Math.random() - 0.5) * 0.4;
  } else { this.x = nx; this.z = nz; }
  // Höhe, Neigung, Schaukeln
  const sp = Math.abs(vf), plane = clamp(sp / top, 0, 1);
  const ty = C.WATER_Y + wave(this.x, this.z, t) * (1 - plane * 0.5) + plane * T.H * 0.12 + (T.ski && sp > 12 ? Math.abs(Math.sin(t * 5)) * 0.08 : 0);
  this.y = damp(this.y, ty, 6, dt);
  const wp = (wave(this.x + fx * 2, this.z + fz * 2, t) - wave(this.x - fx * 2, this.z - fz * 2, t)) * 0.25;
  this.pitch = damp(this.pitch, plane * (T.yacht ? 0.02 : 0.085) + wp - (this.braking ? 0.03 : 0), 3, dt);
  this.roll = damp(this.roll, clamp(-this.yawRate * vf * (T.ski ? 0.03 : 0.014), -0.3, 0.3) + Math.sin(t * 1.1 + this.id) * 0.025 * (1 - plane), 4, dt);
  this.grounded = true; this.slip = Math.abs(vl); this.lastVf = vf;
  // Gischt & Kielwasser
  this.wakeT = (this.wakeT || 0) - dt;
  if (sp > 2 && afloat && this.wakeT <= 0 && dist2(this.x, this.z, G.camera.position.x, G.camera.position.z) < 150 * 150) {
    this.wakeT = sp > 12 ? 0.04 : 0.09;
    const bx = this.x - fx * this.hl, bz = this.z - fz * this.hl, A = G.effects.alpha, wy = C.WATER_Y + 0.06;
    // Schaumspur (flach, bleibt kurz liegen) und Heckgischt
    for (const s of [-0.6, 0, 0.6]) A.emit(bx + fz * s * this.hw + rand(-0.3, 0.3), wy, bz - fx * s * this.hw + rand(-0.3, 0.3), 0, 0, 0, rand(1.6, 2.6), rand(0.7, 1.1) * (T.yacht ? 1.6 : 1), 0.95, 0.97, 1.0, 0.32, 0, 1.3, 0);
    const k = Math.min(1, sp / 25);
    for (let n = 0; n < 2; n++) A.emit(bx + rand(-0.4, 0.4), wy + 0.1, bz + rand(-0.4, 0.4), -fx * sp * 0.15 + rand(-0.8, 0.8), rand(0.8, 2.4) * k, -fz * sp * 0.15 + rand(-0.8, 0.8), rand(0.3, 0.6), rand(0.18, 0.4), 0.92, 0.96, 1.0, 0.55, 9, 0.9, 0.6);
    if (sp > 10) for (const s of [-1, 1]) A.emit(this.x + fx * this.hl * 0.35 + fz * s * this.hw, wy + 0.15, this.z + fz * this.hl * 0.35 - fx * s * this.hw, fz * s * 2.2 + rand(-0.5, 0.5), rand(1.2, 2.6) * k, -fx * s * 2.2 + rand(-0.5, 0.5), rand(0.35, 0.6), rand(0.2, 0.4), 0.93, 0.96, 1.0, 0.5, 9, 0.8, 0.5);
  }
  // Schaden: Rauch, Wrack sinkt
  if (this.alive) {
    const hp = this.health / this.maxHealth;
    this.smokeT -= dt;
    if (hp < 0.35 && this.smokeT <= 0) { this.smokeT = hp < 0.15 ? 0.06 : 0.14; G.effects.smoke(this.x - fx * this.hl * 0.6, this.y + T.H + 0.4, this.z - fz * this.hl * 0.6, 1, 0.4); }
    if (this.onFire) { this.burn -= dt; if (this.burn <= 0) this.explode(); else if (Math.random() < 0.5) G.effects.fire(this.x + rand(-1, 1), this.y + T.H, this.z + rand(-1, 1), 1); }
  } else {
    this.wreckSink = (this.wreckSink || 0) + dt;
    if (this.wreckSink > 4) { this.sinking = true; this.sinkT = 0; if (this.driver === 'player') G.player.exitVehicle(true); else if (this.driver && this.driver.isPed) G.peds.ejectDriver(this, true); }
  }
};

// ------------------------------------------------------------ Flugphysik (Arcade)
Vehicle.prototype.updatePlane = function (dt) {
  const T = this.T, inp = this.input, W = G.world;
  let vf = this.lastVf || 0;
  const pitchIn = inp.pitch || 0; // + = steigen
  if (this.parts.prop) this.parts.prop.rotation.z += (this.alive ? 6 + this.thr * 60 : 0) * dt;
  this.thr = this.thr || 0;
  if (!this.alive) {
    this.vy -= 18 * dt; this.y += this.vy * dt; this.x += this.vx * dt; this.z += this.vz * dt;
    this.pitch = damp(this.pitch, -0.6, 1, dt);
    const gh = W.groundHeight(this.x, this.z);
    if (this.y <= Math.max(gh, C.WATER_Y)) { this.y = Math.max(gh, C.WATER_Y); this.vx *= 0.3; this.vz *= 0.3; this.vy = 0; if (this.y <= C.WATER_Y + 0.01 && gh < C.WATER_Y) { this.sinking = true; this.sinkT = 0; } }
    return;
  }
  if (this.grounded) {
    // Rollen am Boden
    const thr = inp.throttle, brk = inp.brake;
    this.thr = damp(this.thr, thr > 0 ? 1 : 0.15, 2, dt);
    if (thr > 0) vf += T.accel * thr * clamp(1 - vf / 50, 0, 1) * dt;
    if (brk > 0) vf -= (vf > 0.5 ? 12 : 2) * brk * dt;
    if (inp.handbrake) vf = damp(vf, 0, 2, dt);
    vf -= vf * 0.04 * dt;
    if (vf < -4) vf = -4;
    this.yawRate = -inp.steer * 0.7 * clamp(Math.abs(vf) / 8, 0.25, 1) * (vf < 0 ? -1 : 1) * (vf > 25 ? 0.4 : 1);
    this.h += this.yawRate * dt;
    this.roll = damp(this.roll, 0, 6, dt);
    const gh = W.groundHeight(this.x, this.z);
    this.y = gh;
    this.pitch = damp(this.pitch, vf > 24 && (thr > 0 || pitchIn > 0) ? 0.12 : 0, 3, dt);
    if (vf > 28 && (pitchIn > 0.2 || thr > 0.5)) { this.grounded = false; this.vy = 2.5; this.y += 0.2; if (this.driver === 'player') G.hud.toast('🛫 Abgehoben!'); }
    if (gh < C.WATER_Y - 0.3) { this.sinking = true; this.sinkT = 0; this.alive = false; if (this.driver === 'player') G.player.exitVehicle(true); return; }
  } else {
    // Fliegen: Gas = schneller, Bremse = langsamer, Steuer = Kurven, Neigung über Steigen/Sinken
    const boost = inp.throttle > 0.5, slow = inp.brake > 0.5 || inp.handbrake;
    const target = boost ? T.maxSpeed : slow ? 30 : 46;
    this.thr = damp(this.thr, boost ? 1 : slow ? 0.3 : 0.65, 1.5, dt);
    vf += (target - vf) * 0.35 * dt - 9.8 * Math.sin(this.pitch) * dt * 0.55;
    this.pitch = clamp(this.pitch + pitchIn * 0.85 * dt, -0.85, 0.85);
    // ohne Eingabe: in Bodennähe sanft steigen, sonst langsam waagerecht ausrichten
    const alt = this.y - Math.max(W.groundHeight(this.x + Math.sin(this.h) * 60, this.z + Math.cos(this.h) * 60, this.y), W.groundHeight(this.x, this.z, this.y), C.WATER_Y);
    if (Math.abs(pitchIn) < 0.1) this.pitch = damp(this.pitch, alt < 35 && !(inp.brake > 0.5) ? 0.2 : 0, alt < 35 ? 1.5 : 0.45, dt);
    if (alt < 25 && this.driver === 'player' && this.pitch < 0 && (this.warnT = (this.warnT || 0) - dt) <= 0) { this.warnT = 3; G.hud.toast('⚠️ Bodennähe – hochziehen!'); }
    this.roll = damp(this.roll, inp.steer * 0.85, 2.2, dt); // Rechtskurve: rechte Fläche nach unten
    this.yawRate = -this.roll * 0.75;
    this.h += this.yawRate * dt;
    // Strömungsabriss
    const stall = clamp((24 - vf) / 10, 0, 1);
    if (stall > 0) { this.pitch = damp(this.pitch, -0.55, 0.9 * stall, dt); if (this.driver === 'player' && Math.random() < dt) G.hud.toast('⚠️ Zu langsam – Strömungsabriss!'); }
    this.vy = vf * Math.sin(this.pitch) - stall * 9 - (slow && alt < 14 ? 1.6 : 0); // Landehilfe: mit Bremse sanft sinken
    this.y += this.vy * dt;
    if (this.y > 700) { this.y = 700; this.pitch = Math.min(this.pitch, 0); }
    const gh = W.groundHeight(this.x, this.z, this.y), floor = Math.max(gh, C.WATER_Y);
    if (this.y <= floor + 0.05) {
      const soft = this.vy > -6.5 && Math.abs(this.roll) < 0.4 && this.pitch > -0.3 && vf < 52 && gh > C.WATER_Y;
      if (soft) { this.grounded = true; this.y = gh; this.vy = 0; this.pitch = 0; if (this.driver === 'player') G.hud.toast('🛬 Gelandet!'); }
      else { this.y = floor; this.damage(99999, null); this.explode(); return; }
    }
  }
  const cp = Math.cos(this.pitch);
  const fx = Math.sin(this.h), fz = Math.cos(this.h);
  this.vx = fx * vf * (this.grounded ? 1 : cp); this.vz = fz * vf * (this.grounded ? 1 : cp);
  this.x += this.vx * dt; this.z += this.vz * dt;
  this.lastVf = vf; this.slip = 0;
  this.smokeT -= dt;
  const hp = this.health / this.maxHealth;
  if (hp < 0.35 && this.smokeT <= 0) { this.smokeT = 0.08; G.effects.smoke(this.x + fx * 3.5, this.y + 1.6, this.z + fz * 3.5, 1, 0.5); }
  if (this.onFire) { this.burn -= dt; if (this.burn <= 0) this.explode(); }
};

// ------------------------------------------------------------ KI: Polizeiboote & Bootsverkehr
// Wasserweg rund um die Insel (West → Süd → Ost), wird hin und her befahren
const WATER_PATH = [[-700, -415], [-705, -200], [-710, 120], [-690, 440], [-420, 470], [-60, 480], [260, 470], [520, 420], [700, 260], [720, 110], [700, -60], [640, -260], [560, -405]];

class BoatAI {
  constructor(v, mode) { this.v = v; this.mode = mode; this.wp = 0; this.dir = 1; this.cruise = mode === 'police' ? v.T.maxSpeed * 0.92 : rand(6, 10); this.shootT = 2; this.stopped = false; }
  update(dt) {
    const v = this.v, inp = v.input, P = G.player;
    if (!v.alive || this.stopped || !v.driver) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; return; }
    let tx, tz, speed = this.cruise;
    if (this.mode === 'police' || this.mode === 'attack') {
      const t = P.inCar ? P.vehicle : P;
      const lead = P.inCar ? 1.2 : 0;
      tx = t.x + (t.vx || 0) * lead; tz = t.z + (t.vz || 0) * lead;
      const d = Math.hypot(t.x - v.x, t.z - v.z);
      if (this.mode === 'police' && d < 120 && G.world.lineOfSight(v.x, v.y + 2, v.z, t.x, (t.y || 0) + 1.2, t.z)) G.police.spotted();
      if (d < 16) speed = Math.max(2, (P.inCar ? P.vehicle.speed : 0) * 0.9);
      // Bordgeschütz ab 2 Sternen
      this.shootT -= dt;
      if (v.parts.gun) v.parts.gun.rotation.y = angleDiff(v.h, Math.atan2(t.x - v.x, t.z - v.z)) * -1;
      if ((this.mode === 'attack' || G.police.level >= 2) && d < 75 && this.shootT <= 0 && G.player.state !== 'dead') {
        this.shootT = rand(0.12, 0.2) * (this.burst = ((this.burst || 0) + 1) % 8 === 0 ? 10 : 1);
        const gx = v.x + Math.sin(v.h) * v.hl * 0.6, gz = v.z + Math.cos(v.h) * v.hl * 0.6;
        if (G.world.lineOfSight(gx, v.y + 1.5, gz, t.x, (t.y || 0) + 1, t.z)) G.combat.npcShoot({ x: gx, y: v.y + 0.4, z: gz, yaw: Math.atan2(t.x - gx, t.z - gz), vehIgnore: v }, t.x + rand(-1.5, 1.5), (t.y || 0) + 1, t.z + rand(-1.5, 1.5));
      }
    } else if (this.mode === 'race' && this.path) {
      const [wx, wz] = this.path[Math.min(this.wp, this.path.length - 1)];
      if (Math.hypot(wx - v.x, wz - v.z) < 16 && this.wp < this.path.length) this.wp++;
      if (this.wp >= this.path.length) { inp.throttle = 0; inp.brake = 0.4; inp.steer = 0; this.finished = this.finished || G.time; return; }
      [tx, tz] = this.path[this.wp];
    } else {
      const [wx, wz] = WATER_PATH[this.wp];
      if (Math.hypot(wx - v.x, wz - v.z) < 30) { this.wp += this.dir; if (this.wp >= WATER_PATH.length || this.wp < 0) { this.dir = -this.dir; this.wp += 2 * this.dir; } }
      [tx, tz] = WATER_PATH[clamp(this.wp, 0, WATER_PATH.length - 1)];
      if (this.mode === 'flee' || this.scared > 0) speed = v.T.maxSpeed;
    }
    // Ufer meiden: voraus prüfen, ggf. ausweichen
    let want = Math.atan2(tx - v.x, tz - v.z);
    const probe = (a, r) => isWater(v.x + Math.sin(a) * r, v.z + Math.cos(a) * r, 0.7);
    const look = 10 + v.speed * 1.2;
    if (!probe(want, look)) {
      for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) if (probe(want + off, look) && probe(want + off, look * 0.5)) { want += off; break; }
      speed = Math.min(speed, 8);
    }
    const diff = angleDiff(v.h, want);
    inp.steer = clamp(-diff * 2.2, -1, 1);
    const sp = v.fwdSpeed;
    if (Math.abs(diff) > 1.2) speed = Math.min(speed, 6);
    inp.throttle = sp < speed ? clamp((speed - sp) / 4, 0.2, 1) : 0;
    inp.brake = sp > speed + 3 ? 0.5 : 0;
    inp.handbrake = false;
  }
  onDamaged(src) { if (this.mode !== 'police' && src === 'player') { this.mode = 'flee'; this.scared = 20; } }
}

// ------------------------------------------------------------ Verwaltung
export class Craft {
  constructor() {
    this.ambientT = 3; this.launched = null; this.planeT = 0;
    G.blipFns = G.blipFns || [];
    G.blipFns.push((full) => {
      const out = C.DOCKS.map((D) => ({ x: D.shop[0], z: D.shop[1], col: '#4fc3ff', label: '⚓', r: 0.035, name: D.name }));
      if (full || true) out.push({ x: AIRFIELD.x0 + 60, z: AIRFIELD.z0 - 8, col: '#9ad1ff', label: '✈', r: 0.035, name: 'Flugfeld Los Ranchos' });
      return out;
    });
  }
  setup(A) {
    for (const D of C.DOCKS) A.add({ x: D.shop[0], z: D.shop[1], color: 0x4fc3ff, label: '⚓', r: 1.2, onEnter: () => this.shop(D) });
    A.add({ x: AIRFIELD.x0 + 60, z: AIRFIELD.z0 - 8, y: G.world.groundHeight(AIRFIELD.x0 + 60, AIRFIELD.z0 - 8), color: 0x9ad1ff, label: '✈', r: 1.3, onEnter: () => this.hangar() });
  }
  spawnBoat(key, x, z, h, color) {
    const v = G.vm.spawn(key, x, z, h, color);
    if (!v) return null;
    v.y = C.WATER_Y; v.grounded = true;
    return v;
  }
  freeSlip(D) {
    for (const s of D.slips) if (!G.vehicles.some((o) => dist2(o.x, o.z, s[0], s[1]) < 30)) return s;
    return D.slips[0];
  }
  launch(D, c) {
    const P = G.player;
    if (this.launched && !this.launched.removed && this.launched.driver !== 'player' && this.launched.alive) this.launched.remove();
    const s = this.freeSlip(D);
    const v = this.spawnBoat(c.key, s[0], s[1], s[2], c.color);
    if (!v) return;
    v.ownedByPlayer = true; v.persistent = true; v.parked = true; this.launched = v; P.lastVehicle = v;
    if (c.tune) v.tune = { ...c.tune };
    G.hud.toast(`⚓ ${v.T.name} liegt am ${D.name} bereit.`);
  }
  shop(D) {
    const P = G.player; P.boats = P.boats || [];
    const keys = ['dinghy', 'jetski', 'speeder', 'fishing', 'yacht'];
    const buy = keys.map((k) => { const T = BOATS[k]; const n = P.boats.filter((b) => b.key === k).length; return { id: 'b_' + k, k, name: T.name, icon: k === 'jetski' ? '🌊' : k === 'yacht' ? '🛥️' : k === 'fishing' ? '🚢' : k === 'dinghy' ? '🛶' : '🚤', price: T.price, desc: `${T.cls} · bis ${Math.round(T.maxSpeed * 3.6)} km/h · ${T.desc}`, disabled: n ? 'Bereits im Besitz' : null }; });
    const mine = P.boats.map((b, i) => ({ id: 'm_' + i, b, name: BOATS[b.key].name, icon: '⚓', price: 0, priceText: 'Dein Boot', desc: `Wird an einen freien Liegeplatz am ${D.name} gebracht.`, label: 'Zu Wasser lassen' }));
    const rent = [{ id: 'r_dinghy', k: 'dinghy', name: 'Schlauchboot mieten', icon: '⏱️', price: 150, desc: 'Ein Schlauchboot zum Ausprobieren – gehört dir nicht.', label: 'Mieten' }, { id: 'r_jetski', k: 'jetski', name: 'Jetski mieten', icon: '⏱️', price: 350, desc: 'Ein Jetski für eine Spritztour.', label: 'Mieten' }];
    G.ui.store({
      title: D.name.toUpperCase(), subtitle: 'Bootshandel · Liegeplätze · Verleih', accent: '#4fc3ff', logo: '⚓',
      categories: [{ name: 'Boote kaufen', icon: '🚤', items: buy }, { name: 'Meine Boote', icon: '⚓', items: mine.length ? mine : [{ id: 'none', name: 'Noch keine Boote', icon: '🛟', price: 0, priceText: '—', desc: 'Kauf dein erstes Boot im Reiter „Boote kaufen“.', disabled: 'Keine Boote' }] }, { name: 'Verleih', icon: '⏱️', items: rent }],
      owned: (i) => (i.k && P.boats.some((b) => b.key === i.k) && i.id.startsWith('b_') ? 'Im Besitz' : ''),
      onBuy: (i) => {
        if (i.id.startsWith('m_')) { setTimeout(() => { G.ui.close(); this.launch(D, i.b); }, 300); return true; }
        if (P.money < i.price) return false;
        P.addMoney(-i.price); G.audio.cash();
        if (i.id.startsWith('b_')) {
          const c = { key: i.k, color: pick(BOATS[i.k].colors), id: Date.now() };
          P.boats.push(c);
          setTimeout(() => { G.ui.close(); this.launch(D, c); G.hud.bigToast(BOATS[i.k].name, 'Dein neues Boot liegt am Steg'); }, 500);
        } else setTimeout(() => { G.ui.close(); const s = this.freeSlip(D); const v = this.spawnBoat(i.k, s[0], s[1], s[2]); if (v) { v.parked = true; v.persistent = true; P.lastVehicle = v; setTimeout(() => { v.persistent = false; }, 120000); } }, 300);
        return true;
      },
    });
  }
  hangar() {
    const P = G.player; P.planes = P.planes || [];
    const own = P.planes.length > 0;
    G.ui.store({
      title: 'FLUGFELD LOS RANCHOS', subtitle: 'Hangar · Rundflüge · Flugschule', accent: '#9ad1ff', logo: '✈️',
      categories: [{ name: 'Flugzeuge', icon: '✈️', items: [
        { id: 'buy', name: 'Albatros kaufen', icon: '🛩️', price: PLANES.albatros.price, desc: PLANES.albatros.desc, disabled: own ? 'Bereits im Besitz' : null },
        { id: 'take', name: 'Eigenen Albatros holen', icon: '🛫', price: 0, priceText: own ? 'Dein Flugzeug' : '—', desc: 'Dein Flugzeug wird auf die Startbahn gerollt.', disabled: own ? null : 'Erst kaufen', label: 'Zur Startbahn' },
        { id: 'rent', name: 'Rundflug (Miete)', icon: '⏱️', price: 900, desc: 'Ein Leihflugzeug für einen Rundflug. Steuerung: W/S bzw. Stick hoch/runter = steigen/sinken, A/D = Kurven, Shift/Gas = schneller, Leertaste = langsamer.', label: 'Mieten' },
      ] }],
      onBuy: (i) => {
        if (i.price && P.money < i.price) return false;
        if (i.price) { P.addMoney(-i.price); G.audio.cash(); }
        if (i.id === 'buy') P.planes.push({ key: 'albatros', color: 0xffffff, id: Date.now() });
        setTimeout(() => { G.ui.close(); this.spawnPlane(i.id !== 'rent'); }, 400);
        return true;
      },
    });
  }
  spawnPlane(owned, color) {
    const A = AIRFIELD, x = A.x0 + 40, z = (A.z0 + A.z1) / 2;
    for (const o of G.vehicles) if (o.T.plane && o.driver !== 'player' && dist2(o.x, o.z, x, z) < 400) o.remove();
    const v = G.vm.spawn('albatros', x, z, Math.PI / 2, color ?? (owned && G.player.planes[0] ? G.player.planes[0].color : 0xffd23f));
    if (!v) return null;
    v.y = G.world.groundHeight(x, z); v.grounded = true; v.parked = true; v.persistent = true; v.ownedByPlayer = owned;
    G.player.lastVehicle = v;
    G.hud.hint('✈️ Steig ein (F). <b>Gas</b> zum Beschleunigen, ab 100 km/h <b>hochziehen</b> (W / Stick hoch). A/D = Kurven, Leertaste = langsamer.', 9);
    return v;
  }

  // Polizeiboot in der Nähe des Spielers erzeugen
  spawnPoliceBoat(px, pz) {
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, r = rand(80, 150);
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      if (!isWater(x, z, 2.5) || !isWater(x + 8, z, 2) || !isWater(x - 8, z, 2) || !isWater(x, z + 8, 2) || !isWater(x, z - 8, 2)) continue;
      const v = this.spawnBoat('copboat', x, z, Math.atan2(px - x, pz - z));
      if (!v) return null;
      v.driver = { isPed: true, look: copLook(), isCop: true };
      v.ai = new BoatAI(v, 'police'); v.siren = true;
      return v;
    }
    return null;
  }
  update(dt) {
    const P = G.player;
    // Steuerung im Flugzeug: Neigung über Vor/Zurück
    if (P.inCar && P.vehicle.T.plane) {
      const I = G.input, v = P.vehicle;
      v.input.pitch = clamp(I.moveY, -1, 1);
      if (!v.grounded) { v.input.throttle = I.held('sprint') || I.held('gas') || (I.gas || 0) > 0.5 ? 1 : 0; v.input.brake = I.held('handbrake') || (I.brake || 0) > 0.5 ? 1 : 0; }
    }
    // Bootsverkehr
    this.ambientT -= dt;
    if (this.ambientT <= 0 && !G.interior) {
      this.ambientT = 4;
      const px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
      const n = G.vehicles.filter((v) => v.ai instanceof BoatAI && v.ai.mode !== 'police').length;
      const nearWater = WATER_PATH.some(([x, z]) => dist2(x, z, px, pz) < 420 * 420);
      if (nearWater && n < (G.quality === 'low' ? 3 : 7)) {
        const cands = WATER_PATH.map((p, i) => [p, i]).filter(([[x, z]]) => { const d = dist2(x, z, px, pz); return d > 120 * 120 && d < 300 * 300; });
        if (cands.length) {
          const [[x, z], i] = pick(cands);
          if (!G.vehicles.some((o) => dist2(o.x, o.z, x, z) < 900)) {
            const key = pick(['fishing', 'speeder', 'yacht', 'dinghy', 'fishing', 'jetski']);
            const v = this.spawnBoat(key, x + rand(-15, 15), z + rand(-15, 15), rand(0, 6.28));
            if (v) { v.driver = { isPed: true, look: randomLook(true) }; v.ai = new BoatAI(v, 'cruise'); v.ai.wp = clamp(i + 1, 0, WATER_PATH.length - 1); }
          }
        }
      }
    }
  }
}
export { BoatAI, WATER_PATH };
