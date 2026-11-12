// Figuren- und Fahrzeugmodelle
import * as THREE from 'three';
import { GeoBuilder, rgb } from './geo.js';
import { pick } from './utils.js';

// =================================================================
//  Figuren – alle Körperteile aller Figuren als InstancedMeshes
// =================================================================
const PARTS = ['hips', 'torso', 'head', 'eyes', 'hair', 'hat', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR', 'shoeL', 'shoeR', 'gun'];

// Abgerundeter Quader mit weichen Normalen (optional verformbar)
export function roundedBox(w, h, d, r, seg = 3, deform = null) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, n = g.attributes.normal;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < p.count; k++) {
    v.fromBufferAttribute(p, k);
    c.set(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    v.sub(c);
    const l = v.length() || 1;
    v.multiplyScalar(r / l);
    n.setXYZ(k, v.x / r, v.y / r, v.z / r);
    v.add(c);
    if (deform) deform(v, h);
    p.setXYZ(k, v.x, v.y, v.z);
  }
  if (deform) g.computeVertexNormals();
  return g;
}
// Konisches Glied (Kapsel) – Drehpunkt oben, hängt nach unten
export function limb(rTop, rBot, len, radial = 8) {
  const pts = [];
  for (let k = 0; k <= 3; k++) { const a = (k / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, rTop * Math.sin(a)), rTop * Math.cos(a))); }
  for (let k = 1; k <= 3; k++) { const a = (k / 3) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.0001, rBot * Math.cos(a)), -len - rBot * Math.sin(a))); }
  return new THREE.LatheGeometry(pts.reverse(), radial);
}

function partGeos() {
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const M = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const S = (x, y, z, sx, sy, sz) => new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
  const sph = (r, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
  // Kopf: Schädel mit schmalerem Kiefer, Nase, Ohren, Kinn
  const head = new GeoBuilder(false);
  head.addGeometry(roundedBox(0.205, 0.255, 0.235, 0.095, 2, (v) => { const t = Math.max(0, -v.y) / 0.13; v.x *= 1 - 0.18 * t; v.z *= 1 - 0.06 * t; }), M(0, 0.155, 0.005));
  head.addGeometry(roundedBox(0.038, 0.06, 0.05, 0.018, 1, (v) => { v.z += Math.max(0, -v.y) * 0.25; }), M(0, 0.135, 0.125));
  for (const sx of [-1, 1]) head.addGeometry(sph(0.03, 6, 4), S(sx * 0.103, 0.155, -0.005, 0.45, 1, 0.8));
  head.addGeometry(limb(0.052, 0.058, 0.06, 10), M(0, 0.03, -0.01)); // Hals (Haut)
  // Augen, Brauen, Mund
  const eyes = new GeoBuilder(false);
  for (const sx of [-1, 1]) {
    eyes.addGeometry(sph(0.017, 6, 4), S(sx * 0.047, 0.18, 0.118, 1, 0.8, 0.5));
    eyes.addGeometry(roundedBox(0.05, 0.012, 0.02, 0.005, 1), new THREE.Matrix4().makeTranslation(sx * 0.048, 0.212, 0.118).multiply(new THREE.Matrix4().makeRotationZ(-sx * 0.12)));
  }
  eyes.addGeometry(roundedBox(0.05, 0.008, 0.012, 0.004, 1), M(0, 0.088, 0.112));
  // Haare: Kappe über Schädel + Hinterkopf
  const hair = new GeoBuilder(false);
  hair.addGeometry(new THREE.SphereGeometry(0.128, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), S(0, 0.2, -0.005, 0.86, 0.95, 1.0));
  hair.addGeometry(roundedBox(0.215, 0.16, 0.08, 0.04, 1), M(0, 0.2, -0.085));
  for (const sx of [-1, 1]) hair.addGeometry(roundedBox(0.02, 0.09, 0.08, 0.008, 1), M(sx * 0.1, 0.2, 0.03));
  hair.addGeometry(roundedBox(0.19, 0.04, 0.06, 0.02, 1), new THREE.Matrix4().makeTranslation(0, 0.28, 0.085).multiply(new THREE.Matrix4().makeRotationX(0.35)));
  // Kappe mit Schirm
  const hat = new GeoBuilder(false);
  hat.addGeometry(new THREE.SphereGeometry(0.132, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), S(0, 0.215, 0, 0.9, 0.85, 1.0));
  hat.addGeometry(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), S(0, 0.222, 0.1, 1, 1, 0.9));
  // Unterarm mit Hand
  const farm = new GeoBuilder(false);
  farm.addGeometry(limb(0.048, 0.04, 0.24), M(0, -0.005, 0));
  farm.addGeometry(roundedBox(0.07, 0.095, 0.035, 0.016, 1, (v) => { v.x *= 1 - Math.max(0, -v.y) * 1.2; }), M(0, -0.31, 0.008));
  farm.addGeometry(roundedBox(0.022, 0.05, 0.022, 0.01, 1), new THREE.Matrix4().makeTranslation(0.03, -0.29, 0.03).multiply(new THREE.Matrix4().makeRotationZ(0.4)));
  const gun = new GeoBuilder(false);
  gun.addGeometry(box(0.05, 0.3, 0.08, 0, -0.18, 0.04), new THREE.Matrix4());
  gun.addGeometry(box(0.045, 0.06, 0.13, 0, -0.04, 0.02), new THREE.Matrix4());
  // Oberkörper: Brustkorb verjüngt zur Taille, Schultern abgerundet, Kragen
  const torso = new GeoBuilder(false);
  torso.addGeometry(roundedBox(0.4, 0.5, 0.22, 0.085, 2, (v) => {
    const t = (v.y + 0.25) / 0.5; // 0 unten .. 1 oben
    v.x *= 0.82 + 0.18 * Math.min(1, t * 1.4);
    v.z *= 0.92 + 0.14 * Math.sin(Math.min(1, t) * Math.PI) - (t > 0.85 ? (t - 0.85) * 0.6 : 0);
    if (v.z > 0 && t > 0.45 && t < 0.85) v.z += 0.012 * Math.sin((t - 0.45) / 0.4 * Math.PI);
  }), M(0, 0.33, 0));
  torso.addGeometry(roundedBox(0.34, 0.12, 0.2, 0.05, 1), M(0, 0.07, 0));
  for (const sx of [-1, 1]) torso.addGeometry(sph(0.062, 8, 5), S(sx * 0.185, 0.535, 0, 1, 0.8, 0.95));
  torso.addGeometry(new THREE.TorusGeometry(0.06, 0.018, 5, 10).rotateX(Math.PI / 2), M(0, 0.59, 0.0));
  return {
    hips: roundedBox(0.35, 0.21, 0.22, 0.07, 2, (v) => { if (v.y < 0) v.x *= 1 - Math.min(0.12, -v.y * 0.8); }).translate(0, -0.02, 0),
    torso: torso.build(),
    head: head.build(),
    eyes: eyes.build(),
    hair: hair.build(),
    hat: hat.build(),
    uarm: limb(0.064, 0.052, 0.255),
    farm: farm.build(),
    thigh: limb(0.088, 0.066, 0.4),
    shin: limb(0.066, 0.05, 0.38),
    shoe: roundedBox(0.12, 0.085, 0.27, 0.04, 2, (v) => { if (v.z > 0.04) v.y -= (v.z - 0.04) * 0.15 * (v.y > 0 ? 1 : 0); }).translate(0, -0.035, 0.05),
    gun: gun.build(),
    item: box(0.06, 0.06, 0.16, 0, 0, 0.05),
  };
}

const _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _r = new THREE.Matrix4(), _e = new THREE.Euler();
const _root = new THREE.Matrix4(), _pelvis = new THREE.Matrix4(), _torso = new THREE.Matrix4(), _sh = new THREE.Matrix4(), _el = new THREE.Matrix4(), _hip = new THREE.Matrix4(), _kn = new THREE.Matrix4(), _tmp = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function child(out, parent, x, y, z, rx = 0, ry = 0, rz = 0) {
  _t.makeTranslation(x, y, z);
  out.multiplyMatrices(parent, _t);
  if (rx || ry || rz) { _e.set(rx, ry, rz, 'YXZ'); _r.makeRotationFromEuler(_e); out.multiply(_r); }
  return out;
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class CrowdRenderer {
  constructor(scene, max = 96) {
    this.max = max;
    const g = partGeos();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.0 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.7 });
    const geoFor = { hips: g.hips, torso: g.torso, head: g.head, eyes: g.eyes, hair: g.hair, hat: g.hat, uarmL: g.uarm, uarmR: g.uarm, farmL: g.farm, farmR: g.farm, thighL: g.thigh, thighR: g.thigh, shinL: g.shin, shinR: g.shin, shoeL: g.shoe, shoeR: g.shoe, gun: g.gun, item: g.item };
    this.im = {};
    // L/R teilen sich ein InstancedMesh (doppelte Kapazität)
    const groups = { hips: ['hips'], torso: ['torso'], head: ['head'], eyes: ['eyes'], hair: ['hair'], hat: ['hat'], uarm: ['uarmL', 'uarmR'], farm: ['farmL', 'farmR'], thigh: ['thighL', 'thighR'], shin: ['shinL', 'shinR'], shoe: ['shoeL', 'shoeR'], gun: ['gun'], item: ['item'] };
    this.slot = {};
    for (const [gname, list] of Object.entries(groups)) {
      const m = new THREE.InstancedMesh(geoFor[list[0]], gname === 'gun' ? gunMat : mat, max * list.length);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (gname !== 'gun') m.setColorAt(0, new THREE.Color(1, 1, 1));
      if (gname === 'item') m.castShadow = false;
      scene.add(m);
      this.im[gname] = m;
      list.forEach((p, i) => (this.slot[p] = { m, mul: list.length, off: i }));
    }
    this.n = 0;
    this.eyeCol = new THREE.Color(0x15151a);
  }
  setShadows(on) { for (const k in this.im) this.im[k].castShadow = on; }

  _set(part, idx, mtx, col) {
    const s = this.slot[part];
    const i = idx * s.mul + s.off;
    s.m.setMatrixAt(i, mtx);
    if (col && s.m.instanceColor) s.m.setColorAt(i, col);
  }

  begin() { this.n = 0; }
  end() {
    for (const k in this.im) {
      const m = this.im[k];
      m.count = this.n * (k === 'uarm' || k === 'farm' || k === 'thigh' || k === 'shin' || k === 'shoe' ? 2 : 1);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // c: {x,y,z,yaw,scale,look,anim}
  add(c) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const L = c.look, A = c.anim;
    const sc = L.scale || 1;
    // Wurzel
    _q.setFromEuler(_e.set(A.tilt || 0, c.yaw, A.roll || 0, 'YXZ'));
    _p.set(c.x, c.y + (A.lift || 0), c.z);
    _s.set(sc, sc, sc);
    _root.compose(_p, _q, _s);
    const ph = A.phase || 0, amp = A.amp || 0, run = A.run || 0;
    const sw = Math.sin(ph) * amp;
    const bob = Math.abs(Math.cos(ph)) * 0.05 * amp;
    const breathe = Math.sin((A.t || 0) * 2) * 0.01;
    const dn = A.dance ? (A.t || 0) * 6.5 + (A.dseed || 0) : 0;
    // Becken
    child(_pelvis, _root, 0, 1.0 + bob - (A.crouch || 0) + (A.dance ? Math.abs(Math.sin(dn)) * 0.07 - 0.04 : 0), 0, 0, Math.sin(ph) * 0.12 * amp, 0);
    this._set('hips', i, _pelvis, L.pants);
    // Oberkörper
    const lean = 0.06 * run + (A.lean || 0);
    child(_torso, _pelvis, 0, 0.08, 0, lean + breathe, -Math.sin(ph) * 0.18 * amp + (A.twist || 0) + (A.dance ? Math.sin(dn * 0.5) * 0.35 : 0), 0);
    this._set('torso', i, _torso, L.shirt);
    child(_m, _torso, 0, 0.64, 0, (A.headPitch || 0) - lean * 0.5, A.headYaw || 0, 0);
    this._set('head', i, _m, L.skin);
    this._set('eyes', i, _m, this.eyeCol);
    if (L.hat) { this._set('hat', i, _m, L.hat); this._set('hair', i, ZERO, L.hair); }
    else { this._set('hat', i, ZERO, L.skin); this._set('hair', i, L.bald ? ZERO : _m, L.hair); }
    // Arme
    const armSw = sw * 0.9;
    let lsx = armSw, lsz = 0.08, lel = -0.25 - 0.9 * run * amp;
    let rsx = -armSw, rsz = -0.08, rel = -0.25 - 0.9 * run * amp;
    if (A.panic) { lsx = -2.6 + Math.sin(ph * 2) * 0.4; rsx = -2.6 - Math.sin(ph * 2) * 0.4; lsz = 0.4; rsz = -0.4; lel = -0.4; rel = -0.4; }
    if (A.aim) {
      rsx = -Math.PI / 2 - (A.aimPitch || 0); rsz = 0.05; rel = 0;
      if (A.twoHand) { lsx = -Math.PI / 2 - (A.aimPitch || 0) + 0.2; lsz = -0.55; lel = -0.5; }
    }
    if (A.punch > 0) {
      const p = Math.sin(A.punch * Math.PI);
      rsx = -0.4 - p * 1.3; rel = -1.5 + p * 1.4; rsz = -0.05;
      lsx = -0.8; lel = -1.8; lsz = 0.2;
    }
    if (A.air) { lsx = -0.6; rsx = -0.6; lsz = 0.5; rsz = -0.5; }
    if (A.swim) { lsx = -Math.PI + Math.sin(ph) * 1.2; rsx = -Math.PI - Math.sin(ph) * 1.2; lsz = 0.3; rsz = -0.3; }
    if (A.handsUp) { lsx = -2.9; rsx = -2.9; lsz = 0.2; rsz = -0.2; lel = -0.3; rel = -0.3; }
    if (A.reach > 0) { rsx = -1.35 * A.reach + rsx * (1 - A.reach); rel = -0.25; rsz = -0.1; }
    if (A.handMouth > 0) { const k = A.handMouth; rsx = rsx + (-2.05 - rsx) * k; rsz = rsz + (-0.62 - rsz) * k; rel = rel + (-2.25 - rel) * k; }
    if (A.dance && !A.handsUp) { lsx = -1.4 - Math.sin(dn) * 1.1; rsx = -1.4 + Math.sin(dn) * 1.1; lsz = 0.45; rsz = -0.45; lel = -0.9; rel = -0.9; }
    child(_sh, _torso, 0.27, 0.56, 0, lsx, 0, lsz);
    this._set('uarmL', i, _sh, L.sleeve);
    child(_el, _sh, 0, -0.29, 0, lel, 0, 0);
    this._set('farmL', i, _el, L.skin);
    child(_sh, _torso, -0.27, 0.56, 0, rsx, 0, rsz);
    this._set('uarmR', i, _sh, L.sleeve);
    child(_el, _sh, 0, -0.29, 0, rel, 0, 0);
    this._set('farmR', i, _el, L.skin);
    if (A.gun && !A.prop) { child(_tmp, _el, 0, -0.3, 0.02); this._set('gun', i, _tmp, null); } else this._set('gun', i, ZERO, null);
    if (A.prop) { child(_tmp, _el, 0, -0.33, 0.04); this._set('item', i, _tmp, A.prop); } else this._set('item', i, ZERO, this.eyeCol);
    // Beine
    let lth = -sw, rth = sw;
    let lkn = Math.max(0, Math.cos(ph)) * (0.3 + run * 0.9) * amp + 0.05, rkn = Math.max(0, -Math.cos(ph)) * (0.3 + run * 0.9) * amp + 0.05;
    if (A.air) { lth = -0.7; rth = -0.2; lkn = 1.1; rkn = 0.6; }
    if (A.swim) { lth = Math.sin(ph * 2) * 0.3; rth = -Math.sin(ph * 2) * 0.3; lkn = 0.2; rkn = 0.2; }
    if (A.sit) { lth = -1.5; rth = -1.5; lkn = 1.5; rkn = 1.5; }
    if (A.dance) { lth = Math.sin(dn) * 0.25; rth = -Math.sin(dn) * 0.25; lkn = 0.25 + Math.max(0, Math.sin(dn)) * 0.4; rkn = 0.25 + Math.max(0, -Math.sin(dn)) * 0.4; }
    child(_hip, _pelvis, 0.1, -0.05, 0, lth, 0, 0.02);
    this._set('thighL', i, _hip, L.pants);
    child(_kn, _hip, 0, -0.43, 0, lkn, 0, 0);
    this._set('shinL', i, _kn, L.legs);
    child(_m, _kn, 0, -0.42, 0, -lkn * 0.3, 0, 0);
    this._set('shoeL', i, _m, L.shoes);
    child(_hip, _pelvis, -0.1, -0.05, 0, rth, 0, -0.02);
    this._set('thighR', i, _hip, L.pants);
    child(_kn, _hip, 0, -0.43, 0, rkn, 0, 0);
    this._set('shinR', i, _kn, L.legs);
    child(_m, _kn, 0, -0.42, 0, -rkn * 0.3, 0, 0);
    this._set('shoeR', i, _m, L.shoes);
  }
}

// Zufälliges Aussehen
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a21, 0xd9a066];
const SHIRTS = [0xff4d6d, 0x3ec1d3, 0xffd166, 0xf8f9fa, 0x06d6a0, 0x9b5de5, 0x264653, 0xe76f51, 0x1d3557, 0xff8fab, 0x2a9d8f, 0xf4a261, 0x222222, 0x8ecae6];
const PANTS = [0x1d3557, 0x2b2d42, 0x4a4e69, 0x6c584c, 0xd4c4a8, 0x264653, 0x111111, 0x7b8fa1, 0xe9d8a6];
const HAIRS = [0x1b1b1b, 0x3b2716, 0x6b4423, 0xb98b4e, 0xe6c27a, 0x8a3324, 0x9e9e9e];
const SHOES = [0xffffff, 0x222222, 0x8b5a2b, 0xd62828, 0x3a86ff];
const C = (h) => new THREE.Color(h);
export function randomLook(beach = false) {
  const skin = C(pick(SKINS));
  const shirt = C(pick(SHIRTS));
  const shorts = beach ? Math.random() < 0.85 : Math.random() < 0.25;
  const pants = C(beach && Math.random() < 0.5 ? pick(SHIRTS) : pick(PANTS));
  const sleeveless = beach ? Math.random() < 0.6 : Math.random() < 0.15;
  return {
    skin, shirt, pants,
    sleeve: sleeveless ? skin : shirt,
    legs: shorts ? skin : pants,
    hair: C(pick(HAIRS)),
    shoes: C(beach ? (Math.random() < 0.5 ? 0xd9a066 : pick(SHOES)) : pick(SHOES)),
    hat: Math.random() < 0.12 ? C(pick(SHIRTS)) : null,
    bald: Math.random() < 0.08,
    scale: 0.88 + Math.random() * 0.12,
  };
}
export function copLook() {
  const skin = C(pick(SKINS));
  const blue = C(0x1f3a68);
  return { skin, shirt: blue, pants: C(0x15233f), sleeve: blue, legs: C(0x15233f), hair: C(pick(HAIRS)), shoes: C(0x111111), hat: C(0x14284a), bald: false, scale: 0.95 };
}
export function playerLook() {
  return {
    skin: C(0xd9a066), shirt: C(0xf6f1e9), pants: C(0x2b3a55), sleeve: C(0xf6f1e9), legs: C(0x2b3a55), hair: C(0x1b1b1b),
    shoes: C(0xffffff), hat: null, bald: false, scale: 0.96,
  };
}
export const OUTFITS = [
  { name: 'Hawaii', shirt: 0xff6b6b, pants: 0xe9d8a6, shorts: true },
  { name: 'Klassisch', shirt: 0xf6f1e9, pants: 0x2b3a55, shorts: false },
  { name: 'Street', shirt: 0x222222, pants: 0x4a4e69, shorts: false },
  { name: 'Neon', shirt: 0x19e6ff, pants: 0x111111, shorts: false },
  { name: 'Sommer', shirt: 0xffd166, pants: 0x3ec1d3, shorts: true },
];

// =================================================================
//  Fahrzeuge
// =================================================================
export const CAR_TYPES = {
  kiwi: { name: 'Kiwi', profile: 'hatch', L: 3.8, W: 1.74, wheelR: 0.31, maxSpeed: 40, accel: 9, brake: 24, grip: 9.5, steer: 0.62, mass: 1000, hp: 700, colors: [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xf7fff7, 0x95e1d3, 0xff8fab] },
  marina: { name: 'Marina', profile: 'sedan', L: 4.7, W: 1.86, wheelR: 0.34, maxSpeed: 47, accel: 10, brake: 24, grip: 9.5, steer: 0.56, mass: 1400, hp: 900, colors: [0x1d3557, 0x8d99ae, 0xedf2f4, 0x2b2d42, 0x6d2e46, 0x3a5a40, 0xb08968] },
  zephyra: { name: 'Zephyra GT', profile: 'sports', L: 4.5, W: 1.96, wheelR: 0.35, maxSpeed: 66, accel: 16, brake: 30, grip: 11.5, steer: 0.55, mass: 1300, hp: 800, colors: [0xe63946, 0xffb703, 0x00b4d8, 0x111111, 0xf72585, 0xffffff] },
  vortex: { name: 'Vortex', profile: 'super', L: 4.6, W: 2.02, wheelR: 0.36, maxSpeed: 76, accel: 20, brake: 32, grip: 12.5, steer: 0.52, mass: 1350, hp: 750, colors: [0xff7b00, 0x7cff6b, 0xb5179e, 0xf8f9fa, 0x4361ee] },
  brutus: { name: 'Brutus', profile: 'muscle', L: 4.9, W: 1.95, wheelR: 0.36, maxSpeed: 60, accel: 15, brake: 24, grip: 8.4, steer: 0.52, mass: 1600, hp: 1000, colors: [0x111111, 0xd00000, 0x003049, 0xfcbf49, 0x588157] },
  atlas: { name: 'Atlas XR', profile: 'suv', L: 4.8, W: 2.0, wheelR: 0.42, maxSpeed: 46, accel: 10, brake: 22, grip: 8.8, steer: 0.52, mass: 2100, hp: 1300, colors: [0x222222, 0xf1faee, 0x457b9d, 0x6b705c, 0x9d0208] },
  coyote: { name: 'Coyote', profile: 'pickup', L: 5.2, W: 2.0, wheelR: 0.42, maxSpeed: 45, accel: 10, brake: 22, grip: 8.5, steer: 0.5, mass: 2200, hp: 1300, colors: [0xbc6c25, 0x283618, 0xdda15e, 0x8d99ae, 0xae2012] },
  hauler: { name: 'Hauler', profile: 'van', L: 5.3, W: 2.05, wheelR: 0.38, maxSpeed: 38, accel: 7, brake: 20, grip: 8, steer: 0.5, mass: 2600, hp: 1500, colors: [0xf8f9fa, 0xdee2e6, 0x4895ef, 0xffd60a] },
  taxi: { name: 'Taxi', profile: 'sedan', L: 4.7, W: 1.86, wheelR: 0.34, maxSpeed: 48, accel: 10.5, brake: 24, grip: 9.6, steer: 0.56, mass: 1400, hp: 950, colors: [0xf6c90e], taxi: true },
  brecher: { name: 'Brecher 4x4', profile: 'suv', L: 5.0, W: 2.35, wheelR: 0.72, maxSpeed: 44, accel: 11, brake: 22, grip: 8.6, steer: 0.5, mass: 3200, hp: 2400, colors: [0xff5a1f, 0x111111, 0x2a9d8f, 0xffd60a, 0x7b2cbf] },
  tank: { name: 'Titan (Panzer)', profile: 'tank', tank: true, L: 7.2, W: 3.5, wheelR: 0.36, maxSpeed: 17, accel: 5.5, brake: 14, grip: 14, steer: 0.75, mass: 28000, hp: 7000, colors: [0x4b5320, 0x6b6b4f, 0x8a7f5a] },
  kodiak: { name: 'Kodiak (gepanzert)', profile: 'suv', L: 5.0, W: 2.15, wheelR: 0.46, maxSpeed: 44, accel: 10, brake: 22, grip: 8.6, steer: 0.5, mass: 3600, hp: 4200, colors: [0x2b2f2a, 0x1d1f22, 0x4b5320], mg: true, armored: true },
  marshal: { name: 'Marshal (MG-Pick-up)', profile: 'pickup', L: 5.3, W: 2.05, wheelR: 0.44, maxSpeed: 47, accel: 10.5, brake: 22, grip: 8.5, steer: 0.5, mass: 2600, hp: 2600, colors: [0xd9b48a, 0x4b5320, 0x111111], mg: true, armored: true },
  police: { name: 'Streifenwagen', profile: 'sedan', L: 4.8, W: 1.9, wheelR: 0.35, maxSpeed: 58, accel: 14, brake: 28, grip: 10.5, steer: 0.56, mass: 1600, hp: 1300, colors: [0xf2f2f2], police: true },
};
// Häufigkeit im Verkehr
export const CAR_SHOP = {
  kiwi: { price: 4500, cls: 'Kompakt', desc: 'Wendig, sparsam, passt in jede Parklücke.' },
  marina: { price: 9000, cls: 'Limousine', desc: 'Bequemer Alltagswagen mit viel Platz.' },
  hauler: { price: 12000, cls: 'Nutzfahrzeug', desc: 'Robuster Transporter für jede Ladung.' },
  coyote: { price: 15000, cls: 'Pick-up', desc: 'Kräftig, hoch und unverwüstlich.' },
  atlas: { price: 22000, cls: 'SUV', desc: 'Großer SUV mit Präsenz auf jeder Straße.' },
  brutus: { price: 38000, cls: 'Muscle-Car', desc: 'Lauter V8, lange Motorhaube, pure Kraft.' },
  zephyra: { price: 72000, cls: 'Sportwagen', desc: 'Präzise Lenkung, starke Beschleunigung.' },
  vortex: { price: 160000, cls: 'Supersportwagen', desc: 'Das Schnellste, was Port Solera zu bieten hat.' },
  brecher: { price: 55000, cls: 'Monster-Truck', desc: 'Riesige Räder, Hubraum ohne Ende. Rollt über alles.' },
  kodiak: { price: 145000, cls: 'Gepanzert', desc: 'Panzerglas, verstärkte Karosserie und ein Dach-MG. Feuer: Maustaste / FEUER – braucht keine Munition.' },
  marshal: { price: 68000, cls: 'Militär-Pick-up', desc: 'Geländegängiger Pick-up mit schwenkbarem Maschinengewehr auf der Ladefläche.' },
  tank: { price: 450000, cls: 'Militär', desc: 'Ausgemusterter Kampfpanzer mit funktionierender Kanone. Fragen Sie nicht.' },
};
export const TRAFFIC_MIX = ['kiwi', 'kiwi', 'kiwi', 'marina', 'marina', 'marina', 'marina', 'taxi', 'taxi', 'atlas', 'atlas', 'coyote', 'hauler', 'brutus', 'zephyra', 'vortex'];

// Profile: Oberkontur (z, y) von hinten unten nach vorne unten; Kabine (Glas); Dach [z0, z1, y0, y1]
const PROFILES = {
  sedan: (L) => ({
    body: [[-L / 2, 0.62], [-L / 2 + 0.12, 0.88], [-L / 2 + 0.95, 0.95], [L / 2 - 1.55, 0.95], [L / 2 - 1.0, 0.9], [L / 2 - 0.15, 0.8], [L / 2, 0.62]],
    cabin: [[-L / 2 + 0.95, 0.93], [-L / 2 + 1.55, 1.4], [L / 2 - 1.95, 1.42], [L / 2 - 1.2, 0.92]],
    roof: [-L / 2 + 1.5, L / 2 - 1.9, 1.37, 1.46], cabinW: 0.84,
  }),
  hatch: (L) => ({
    body: [[-L / 2 - 0.02, 0.95], [-L / 2 + 0.12, 1.0], [0.75, 1.0], [1.2, 0.92], [L / 2 - 0.05, 0.78], [L / 2, 0.6]],
    cabin: [[-L / 2 + 0.1, 0.98], [-L / 2 + 0.22, 1.47], [0.35, 1.49], [1.05, 0.98]],
    roof: [-L / 2 + 0.16, 0.3, 1.43, 1.52], cabinW: 0.86,
  }),
  sports: (L) => ({
    body: [[-L / 2 - 0.03, 0.7], [-L / 2 + 0.15, 0.85], [-1.2, 0.88], [0.6, 0.85], [1.7, 0.7], [L / 2 - 0.05, 0.52]],
    cabin: [[-1.5, 0.86], [-0.85, 1.18], [0.2, 1.2], [1.0, 0.84]],
    roof: [-0.82, 0.16, 1.15, 1.22], cabinW: 0.8, spoiler: [-L / 2 + 0.15, 1.02, 0.9],
  }),
  super: (L) => ({
    body: [[-L / 2 - 0.02, 0.78], [-2.0, 0.9], [-0.9, 0.92], [0.3, 0.82], [1.6, 0.62], [L / 2 - 0.05, 0.45]],
    cabin: [[-1.3, 0.9], [-0.5, 1.12], [0.1, 1.13], [0.95, 0.72]],
    roof: [-0.47, 0.06, 1.08, 1.15], cabinW: 0.78, spoiler: [-L / 2 + 0.2, 1.15, 0.95],
  }),
  muscle: (L) => ({
    body: [[-L / 2 - 0.02, 0.85], [-L / 2 + 0.17, 0.95], [-1.3, 0.98], [0.5, 0.98], [L / 2 - 0.15, 0.92], [L / 2, 0.75]],
    cabin: [[-1.45, 0.96], [-0.9, 1.36], [0.15, 1.38], [0.75, 0.96]],
    roof: [-0.92, 0.17, 1.33, 1.41], cabinW: 0.82, scoop: true,
  }),
  suv: (L) => ({
    body: [[-L / 2 - 0.02, 1.05], [-L / 2 + 0.05, 1.12], [1.3, 1.12], [L / 2 - 0.1, 1.02], [L / 2 + 0.02, 0.85]],
    cabin: [[-L / 2 + 0.07, 1.1], [-L / 2 + 0.15, 1.78], [0.7, 1.8], [1.35, 1.1]],
    roof: [-L / 2 + 0.12, 0.68, 1.74, 1.84], cabinW: 0.88, rails: true,
  }),
  pickup: (L) => ({
    body: [[-L / 2 - 0.02, 1.1], [-L / 2 + 0.05, 1.15], [1.3, 1.15], [L / 2 - 0.2, 1.05], [L / 2, 0.85]],
    cabin: [[-0.55, 1.12], [-0.45, 1.78], [0.65, 1.8], [1.35, 1.12]],
    roof: [-0.47, 0.63, 1.74, 1.84], cabinW: 0.88, bed: [-L / 2 + 0.15, -0.65],
  }),
  van: (L) => ({
    body: [[-L / 2 - 0.02, 2.15], [-L / 2 + 0.05, 2.25], [1.2, 2.25], [1.9, 1.25], [L / 2 - 0.1, 1.05], [L / 2, 0.8]],
    cabin: [[1.02, 1.24], [1.02, 2.12], [1.22, 2.2], [1.92, 1.24]],
    roof: null, cabinW: 1.01,
  }),
};

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Weiche Normalen bis zu einem Knickwinkel (harte Kanten bleiben hart)
function creaseNormals(g, deg = 40) {
  const pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count;
  const vi = (k) => (idx ? idx.getX(k) : k);
  const cosT = Math.cos((deg * Math.PI) / 180), nt = cnt / 3;
  const fx = new Float32Array(nt), fy = new Float32Array(nt), fz = new Float32Array(nt);
  const map = new Map(), key = (i) => Math.round(pos.getX(i) * 2000) + ',' + Math.round(pos.getY(i) * 2000) + ',' + Math.round(pos.getZ(i) * 2000);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    a.fromBufferAttribute(pos, vi(t * 3)); b.fromBufferAttribute(pos, vi(t * 3 + 1)); c.fromBufferAttribute(pos, vi(t * 3 + 2));
    c.sub(b); a.sub(b); c.cross(a);
    fx[t] = c.x; fy[t] = c.y; fz[t] = c.z;
    for (let k = 0; k < 3; k++) { const kk = key(vi(t * 3 + k)); let l = map.get(kk); if (!l) map.set(kk, (l = [])); l.push(t); }
  }
  const nrm = g.attributes.normal || new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
  for (let t = 0; t < nt; t++) {
    const l0 = Math.hypot(fx[t], fy[t], fz[t]) || 1;
    for (let k = 0; k < 3; k++) {
      const v = vi(t * 3 + k);
      let sx = 0, sy = 0, sz = 0;
      for (const t2 of map.get(key(v))) {
        const l2 = Math.hypot(fx[t2], fy[t2], fz[t2]) || 1;
        if ((fx[t] * fx[t2] + fy[t] * fy[t2] + fz[t] * fz[t2]) / (l0 * l2) >= cosT) { sx += fx[t2]; sy += fy[t2]; sz += fz[t2]; }
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      nrm.setXYZ(v, sx / l, sy / l, sz / l);
    }
  }
  g.setAttribute('normal', nrm);
  return g;
}

const geoCache = {};
function carGeos(key) {
  if (geoCache[key]) return geoCache[key];
  const T = CAR_TYPES[key];
  const P = PROFILES[T.profile](T.L);
  const L = T.L, W = T.W, r = T.wheelR;
  const yb = r;
  const fz = L / 2 - (T.profile === 'van' ? 0.85 : 0.82), rz = -L / 2 + (T.profile === 'hatch' ? 0.7 : 0.85);
  const ar = r + 0.08;
  // Karosserie mit Radausschnitten
  const s = new THREE.Shape();
  s.moveTo(-L / 2, yb);
  for (const [z, y] of P.body) s.lineTo(z, y);
  s.lineTo(L / 2, yb);
  s.lineTo(fz + ar, yb);
  s.absarc(fz, yb, ar, 0, Math.PI, false);
  s.lineTo(rz + ar, yb);
  s.absarc(rz, yb, ar, 0, Math.PI, false);
  s.lineTo(-L / 2, yb);
  const bt = 0.08, bs = 0.05;
  const body = new THREE.ExtrudeGeometry(s, { depth: W - bt * 2, steps: 8, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 12 });
  body.rotateY(-Math.PI / 2);
  body.translate((W - bt * 2) / 2, 0, 0);
  const paint = new GeoBuilder(false);
  paint.addGeometry(body, new THREE.Matrix4());
  // Dach
  if (P.roof) {
    const [z0, z1, y0, y1] = P.roof, rw = W * P.cabinW / 2 + 0.03;
    paint.addGeometry(roundedBox(rw * 2, y1 - y0, z1 - z0, 0.045, 3), new THREE.Matrix4().makeTranslation(0, (y0 + y1) / 2, (z0 + z1) / 2));
  }
  if (P.spoiler) {
    const [z, y, f] = P.spoiler, sw = W * f / 2;
    paint.box(-sw, y, z - 0.18, sw, y + 0.06, z + 0.12, {});
    paint.box(-sw * 0.8, y - 0.18, z - 0.05, -sw * 0.8 + 0.06, y, z + 0.05, {});
    paint.box(sw * 0.8 - 0.06, y - 0.18, z - 0.05, sw * 0.8, y, z + 0.05, {});
  }
  if (P.scoop) paint.box(-0.3, 0.97, 0.9, 0.3, 1.08, 1.6, {});
  // Spiegel
  const cab = P.cabin;
  const mz = cab[cab.length - 1][0] - 0.15, my = cab[cab.length - 1][1] + 0.1;
  paint.box(W / 2 - 0.02, my, mz - 0.08, W / 2 + 0.16, my + 0.12, mz + 0.08, {});
  paint.box(-W / 2 - 0.16, my, mz - 0.08, -W / 2 + 0.02, my + 0.12, mz + 0.08, {});
  // Glas
  const gs = new THREE.Shape();
  gs.moveTo(cab[0][0], cab[0][1]);
  for (let k = 1; k < cab.length; k++) gs.lineTo(cab[k][0], cab[k][1]);
  gs.lineTo(cab[0][0], cab[0][1]);
  const cw = W * P.cabinW;
  const glass = new THREE.ExtrudeGeometry(gs, { depth: cw - 0.08, steps: 6, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.02, bevelSegments: 2 });
  glass.rotateY(-Math.PI / 2);
  glass.translate((cw - 0.08) / 2, 0, 0);
  // Details (Stoßstangen etc.)
  const D = new GeoBuilder(true), dk = rgb(0x1c1c1f), gr = rgb(0x3a3a3f), ch = rgb(0xb8bcc2), wh = rgb(0xeeeeee);
  const fy = P.body[P.body.length - 1][1];
  D.box(-W / 2 - 0.02, yb - 0.12, L / 2 - 0.2, W / 2 + 0.02, yb + 0.16, L / 2 + 0.06, { col: dk });
  D.box(-W / 2 - 0.02, yb - 0.12, -L / 2 - 0.06, W / 2 + 0.02, yb + 0.16, -L / 2 + 0.2, { col: dk });
  D.box(-W / 2 + 0.35, yb + 0.18, L / 2 - 0.05, W / 2 - 0.35, Math.min(fy - 0.05, yb + 0.42), L / 2 + 0.03, { col: gr });
  D.box(-0.26, yb - 0.02, L / 2 + 0.05, 0.26, yb + 0.1, L / 2 + 0.08, { col: wh });
  D.box(-0.26, yb + 0.02, -L / 2 - 0.08, 0.26, yb + 0.14, -L / 2 - 0.05, { col: wh });
  D.box(-W / 2 + 0.15, 0.16, rz + ar, W / 2 - 0.15, yb, fz - ar, { col: dk });
  D.box(-W / 2 - 0.01, yb - 0.04, rz + ar + 0.05, -W / 2 + 0.06, yb + 0.06, fz - ar - 0.05, { col: dk });
  D.box(W / 2 - 0.06, yb - 0.04, rz + ar + 0.05, W / 2 + 0.01, yb + 0.06, fz - ar - 0.05, { col: dk });
  D.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 8).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(W / 2 - 0.4, yb - 0.08, -L / 2 - 0.08), ch);
  if (P.bed) D.box(-W / 2 + 0.12, 1.0, P.bed[0], W / 2 - 0.12, 1.17, P.bed[1], { col: rgb(0x2a2520) });
  if (P.rails) { D.box(-W * 0.4, 1.84, -L / 2 + 0.4, -W * 0.4 + 0.06, 1.9, 0.5, { col: ch }); D.box(W * 0.4 - 0.06, 1.84, -L / 2 + 0.4, W * 0.4, 1.9, 0.5, { col: ch }); }
  // Lichter
  const H = new GeoBuilder(false), R = new GeoBuilder(false);
  const hy = fy - 0.12, hx = W / 2 - 0.34;
  H.box(-hx - 0.2, hy - 0.07, L / 2 - 0.02, -hx + 0.2, hy + 0.07, L / 2 + 0.04, {});
  H.box(hx - 0.2, hy - 0.07, L / 2 - 0.02, hx + 0.2, hy + 0.07, L / 2 + 0.04, {});
  const ry = Math.min(P.body[0][1] - 0.14, yb + 0.62);
  R.box(-W / 2 + 0.12, ry - 0.07, -L / 2 - 0.04, -W / 2 + 0.55, ry + 0.07, -L / 2 + 0.02, {});
  R.box(W / 2 - 0.55, ry - 0.07, -L / 2 - 0.04, W / 2 - 0.12, ry + 0.07, -L / 2 + 0.02, {});
  // Innenraum: Sitze, Armaturenbrett, Lenkrad
  const belt = cab[0][1], fzA = cab[cab.length - 1][0];
  const seatF = fzA - 0.95, seatR = seatF - 0.95, inW = W * P.cabinW / 2 - 0.12;
  const seatCol = rgb(0x2b2b30), seatHi = rgb(0x8a6a4a);
  for (const sx of [W * 0.22, -W * 0.22]) {
    D.box(sx - 0.24, belt - 0.5, seatF - 0.25, sx + 0.24, belt - 0.28, seatF + 0.25, { col: seatCol });
    D.box(sx - 0.23, belt - 0.28, seatF - 0.32, sx + 0.23, belt + 0.32, seatF - 0.2, { col: seatHi });
    D.box(sx - 0.12, belt + 0.32, seatF - 0.3, sx + 0.12, belt + 0.45, seatF - 0.22, { col: seatCol });
  }
  if (seatR - 0.35 > cab[1][0] - 0.2) D.box(-inW, belt - 0.5, seatR - 0.3, inW, belt + 0.2, seatR + 0.2, { col: seatCol });
  D.box(-inW, belt - 0.2, fzA - 0.45, inW, belt + 0.05, fzA - 0.15, { col: rgb(0x1a1a1d) });
  D.addGeometry(new THREE.TorusGeometry(0.17, 0.025, 6, 16).rotateX(-0.35), new THREE.Matrix4().makeTranslation(W * 0.22, belt + 0.16, fzA - 0.55), rgb(0x111111));
  // Zierleisten, Türfugen, Türgriffe, Scheinwerfer-Fassung
  const hingeZ = fzA + 0.12, doorLen = Math.max(0.9, Math.min(1.25, hingeZ - (rz + ar) - 0.15));
  for (const sxs of [1, -1]) {
    const x0 = sxs * (W / 2 + 0.004);
    D.box(Math.min(x0, x0 + sxs * 0.012), belt - 0.02, cab[0][0] + 0.05, Math.max(x0, x0 + sxs * 0.012), belt + 0.02, fzA, { col: ch });
    for (const zz of [hingeZ, hingeZ - doorLen]) D.box(Math.min(x0, x0 + sxs * 0.01), yb + 0.08, zz - 0.012, Math.max(x0, x0 + sxs * 0.01), belt - 0.04, zz + 0.012, { col: dk });
    D.box(Math.min(x0, x0 + sxs * 0.03), belt - 0.18, hingeZ - doorLen + 0.12, Math.max(x0, x0 + sxs * 0.03), belt - 0.13, hingeZ - doorLen + 0.32, { col: ch });
  }
  for (const sx of [-1, 1]) D.box(sx * hx - 0.23, hy - 0.1, L / 2 - 0.03, sx * hx + 0.23, hy + 0.1, L / 2 + 0.035, { col: ch });
  // Tagfahrlicht & Rückleuchtenband
  for (const sx of [-1, 1]) H.box(sx * hx - 0.2, hy + 0.1, L / 2 - 0.01, sx * hx + 0.2, hy + 0.13, L / 2 + 0.05, {});
  if (['sports', 'super', 'muscle'].includes(T.profile)) R.box(-W / 2 + 0.55, ry - 0.025, -L / 2 - 0.035, W / 2 - 0.55, ry + 0.025, -L / 2 + 0.01, {});
  // Fahrertür (Scharnier vorne, linke Seite = lokal +x)
  const doorH0 = yb + 0.07, doorH1 = belt - 0.03;
  const doorG = new GeoBuilder(false);
  doorG.box(0, doorH0, -doorLen, 0.05, doorH1, 0, {});
  const holeG = new GeoBuilder(true);
  holeG.box(W / 2 - 0.02, doorH0, hingeZ - doorLen, W / 2 + 0.004, doorH1, hingeZ, { col: rgb(0x0c0c0f) });
  holeG.box(W * 0.22 - 0.24, belt - 0.5, seatF - 0.25, W / 2 - 0.03, belt - 0.28, seatF + 0.25, { col: seatHi });
  // Fahrer-Dummy
  const dT = roundedBox(0.42, 0.55, 0.26, 0.09, 2).translate(W * 0.22, belt + 0.02, seatF - 0.05);
  const dH = roundedBox(0.2, 0.25, 0.23, 0.09, 2).translate(W * 0.22, belt + 0.45, seatF - 0.02);
  // Karosserie runden: Draufsicht-Rundung, gewölbtes Dach/Haube, eingezogene Flanken
  const topY = Math.max(...P.body.map((q) => q[1])), roofTop = P.roof ? P.roof[3] : Math.max(...cab.map((q) => q[1]));
  const deform = (x, y, z) => {
    const u = Math.max(-1.2, Math.min(1.2, x / (W / 2))), az = Math.abs(z), sz = Math.sign(z);
    const e = smooth(L / 2 - 1.0, L / 2 + 0.05, az);
    x *= 1 - 0.1 * e * e;
    const c = smooth(0.55, 1.0, Math.abs(u));
    z -= sz * 0.17 * c * c * smooth(L / 2 - 0.55, L / 2 + 0.02, az);
    if (y > yb + 0.25) y += 0.032 * (1 - Math.min(1, u * u)) * smooth(yb + 0.25, topY, y);
    x *= 1 - 0.05 * smooth(belt - 0.16, belt + 0.04, y);
    if (T.profile !== 'van') x *= 1 - 0.13 * smooth(belt, roofTop, y);
    return [x, y, z];
  };
  const deformGeo = (g, ox = 0, oz = 0) => {
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const [x, y, z] = deform(p.getX(k) + ox, p.getY(k), p.getZ(k) + oz); p.setXYZ(k, x - ox, y, z - oz); }
    p.needsUpdate = true;
    return g;
  };
  const paintG = creaseNormals(deformGeo(paint.build()), 38);
  creaseNormals(deformGeo(glass), 30);
  const detailG = deformGeo(D.build()), headG = deformGeo(H.build()), tailG = deformGeo(R.build());
  const out = {
    paint: paintG, glass, details: detailG, head: headG, tail: tailG,
    wheels: [[W / 2 - 0.16, r, fz, 1], [-W / 2 + 0.16, r, fz, 1], [W / 2 - 0.16, r, rz, 0], [-W / 2 + 0.16, r, rz, 0]],
    height: P.roof ? P.roof[3] : 2.25, headY: hy, wheelbase: fz - rz,
    door: creaseNormals(deformGeo(doorG.build(), W / 2 + 0.006, hingeZ), 38), hole: deformGeo(holeG.build()), hinge: [W / 2 + 0.006, hingeZ], doorLen, seat: [W * 0.22, seatF], belt,
    dTorso: dT, dHead: dH, plateY: [yb + 0.04, yb + 0.08], L,
  };
  if (T.police) {
    const lb = new GeoBuilder(false), lr = new GeoBuilder(false), lbl = new GeoBuilder(false);
    const y0 = P.roof[3], zc = (P.roof[0] + P.roof[1]) / 2;
    lb.box(-0.6, y0, zc - 0.15, 0.6, y0 + 0.06, zc + 0.15, {});
    lr.box(-0.6, y0 + 0.06, zc - 0.13, -0.02, y0 + 0.17, zc + 0.13, {});
    lbl.box(0.02, y0 + 0.06, zc - 0.13, 0.6, y0 + 0.17, zc + 0.13, {});
    out.barBase = lb.build(); out.barRed = lr.build(); out.barBlue = lbl.build();
    const st = new GeoBuilder(false);
    st.box(W / 2 + 0.005, 0.62, -L / 2 + 0.6, W / 2 + 0.02, 0.8, L / 2 - 0.6, {});
    st.box(-W / 2 - 0.02, 0.62, -L / 2 + 0.6, -W / 2 - 0.005, 0.8, L / 2 - 0.6, {});
    out.stripe = st.build();
  }
  if (T.taxi) {
    const tb = new GeoBuilder(false);
    const y0 = P.roof[3], zc = (P.roof[0] + P.roof[1]) / 2;
    tb.box(-0.35, y0, zc - 0.12, 0.35, y0 + 0.22, zc + 0.12, {});
    out.taxiSign = tb.build();
    const ch2 = new GeoBuilder(false);
    for (let k = 0; k < 10; k++) ch2.box(W / 2 + 0.005, 0.66, -1.2 + k * 0.24, W / 2 + 0.02, 0.78, -1.08 + k * 0.24, {});
    for (let k = 0; k < 10; k++) ch2.box(-W / 2 - 0.02, 0.66, -1.2 + k * 0.24, -W / 2 - 0.005, 0.78, -1.08 + k * 0.24, {});
    out.stripe = ch2.build();
  }
  for (const k of ['barBase', 'barRed', 'barBlue', 'stripe', 'taxiSign']) if (out[k]) deformGeo(out[k]);
  geoCache[key] = out;
  return out;
}

// Gemeinsame Materialien
export const CAR_MATS = {
  paint: new Map(),
  glass: new THREE.MeshStandardMaterial({ color: 0x0a1622, metalness: 0.7, roughness: 0.04, envMapIntensity: 1.8, transparent: true, opacity: 0.72 }),
  details: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }),
  tailOff: new THREE.MeshBasicMaterial({ color: 0x7a0a0a }),
  tailOn: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
  barBase: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }),
  red: new THREE.MeshBasicMaterial({ color: 0xff1a1a }),
  blue: new THREE.MeshBasicMaterial({ color: 0x1a4dff }),
  off: new THREE.MeshBasicMaterial({ color: 0x331111 }),
  offB: new THREE.MeshBasicMaterial({ color: 0x111133 }),
  stripePol: new THREE.MeshStandardMaterial({ color: 0x1b4fb8, roughness: 0.4 }),
  stripeTaxi: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }),
  taxiSign: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.95, metalness: 0.1 }),
};
export function paintMat(hex) {
  let m = CAR_MATS.paint.get(hex);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: 0.5, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.45 });
    CAR_MATS.paint.set(hex, m);
  }
  return m;
}

// Panzer: eigenes Modell (Wanne, Ketten, drehbarer Turm mit Kanone)
function buildTank(key, color) {
  const T = CAR_TYPES[key];
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  const paint = paintMat(color ?? pick(T.colors));
  paint.metalness = 0.3; paint.roughness = 0.65; paint.clearcoat = 0.1;
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: 0.85, metalness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x5a5d5f, roughness: 0.5, metalness: 0.7 });
  const add = (geo, mat, x, y, z, parent = grp, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; parent.add(m); return m; };
  // Wanne mit abgeschrägtem Bug
  const hull = roundedBox(3.0, 0.95, 6.6, 0.12, 2, (v) => { if (v.z > 2.2 && v.y > -0.1) v.y -= (v.z - 2.2) * 0.35; if (v.z < -2.8 && v.y > 0.1) v.z += 0.2; });
  const body = add(hull, paint, 0, 1.05, 0);
  add(roundedBox(3.4, 0.12, 6.8, 0.04, 1), paint, 0, 1.5, -0.05);
  // Ketten & Laufrollen
  for (const s of [-1, 1]) {
    add(roundedBox(0.62, 1.05, 7.2, 0.45, 3), dark, s * 1.55, 0.55, 0);
    for (let k = 0; k < 6; k++) add(new THREE.CylinderGeometry(0.36, 0.36, 0.2, 14).rotateZ(Math.PI / 2), steel, s * 1.88, 0.42, -2.6 + k * 1.04);
    add(new THREE.BoxGeometry(0.7, 0.08, 7.0), paint, s * 1.55, 1.12, 0);
  }
  // Turm
  const turret = new THREE.Group(); turret.position.set(0, 1.55, -0.4); grp.add(turret);
  add(roundedBox(2.5, 0.85, 3.1, 0.25, 2, (v) => { if (v.z > 0.6) { v.x *= 1 - (v.z - 0.6) * 0.25; v.y *= 1 - (v.z - 0.6) * 0.15; } }), paint, 0, 0.42, 0, turret);
  add(new THREE.CylinderGeometry(0.42, 0.45, 0.35, 16), paint, 0.6, 0.95, -0.4, turret);
  add(new THREE.BoxGeometry(0.06, 1.2, 0.06), steel, -0.9, 1.4, -1.2, turret);
  const barrel = new THREE.Group(); barrel.position.set(0, 0.45, 1.45); turret.add(barrel);
  add(new THREE.CylinderGeometry(0.11, 0.13, 4.4, 14).rotateX(Math.PI / 2), steel, 0, 0, 2.2, barrel);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 14).rotateX(Math.PI / 2), dark, 0, 0, 4.35, barrel);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 14).rotateX(Math.PI / 2), paint, 0, 0, 0.2, barrel);
  // Rücklichter
  const R = new GeoBuilder(false);
  for (const s of [-1, 1]) R.box(s * 1.2 - 0.18, 1.1, -3.32, s * 1.2 + 0.18, 1.24, -3.28, {});
  const tail = add(R.build(), CAR_MATS.tailOff, 0, 0, 0, grp, false);
  const H = new GeoBuilder(false);
  for (const s of [-1, 1]) H.box(s * 1.1 - 0.15, 1.1, 3.25, s * 1.1 + 0.15, 1.25, 3.3, {});
  add(H.build(), CAR_MATS.head, 0, 0, 0, grp, false);
  const driver = new THREE.Group(); driver.visible = false; grp.add(driver);
  const geo = {
    wheels: [[1.2, 0.35, 2.3, 1], [-1.2, 0.35, 2.3, 1], [1.2, 0.35, -2.3, 0], [-1.2, 0.35, -2.3, 0]],
    height: 2.6, headY: 1.2, wheelbase: 4.6, hinge: [1.9, 1.2], doorLen: 1.1, seat: [0.9, 0.5], belt: 1.5, plateY: [0.5, 0.5], L: T.L,
  };
  const dTm = new THREE.MeshStandardMaterial(), dHm = new THREE.MeshStandardMaterial();
  return { group: grp, parts: { body, tail, driver, dTm, dHm, turret, barrel }, geo };
}

export function buildCar(key, color) {
  const T = CAR_TYPES[key];
  if (T.tank) return buildTank(key, color);
  if (T.build) return T.build(key, color);
  const g = carGeos(key);
  const grp = new THREE.Group();
  grp.rotation.order = 'YXZ';
  const mk = (geo, mat, cast = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; grp.add(m); return m; };
  const body = mk(g.paint, paintMat(color ?? pick(T.colors)), true);
  // Fahrer (hinter der Scheibe sichtbar)
  const driver = new THREE.Group();
  const dTm = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8 }), dHm = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.8 });
  driver.add(new THREE.Mesh(g.dTorso, dTm), new THREE.Mesh(g.dHead, dHm));
  driver.visible = false; grp.add(driver);
  mk(g.details, CAR_MATS.details);
  const glassM = mk(g.glass, CAR_MATS.glass); glassM.renderOrder = 3;
  // Tür
  const doorPivot = new THREE.Group();
  doorPivot.position.set(g.hinge[0], 0, g.hinge[1]);
  const doorMesh = new THREE.Mesh(g.door, body.material); doorMesh.castShadow = true; doorPivot.add(doorMesh); grp.add(doorPivot);
  const hole = mk(g.hole, CAR_MATS.details); hole.visible = false;
  // Kennzeichen
  const plate = plateMat();
  for (const sg of [1, -1]) {
    const pm = new THREE.Mesh(PLATE_GEO, plate);
    pm.position.set(0, sg > 0 ? g.plateY[0] : g.plateY[1], sg * (g.L / 2 + 0.085));
    if (sg < 0) pm.rotation.y = Math.PI;
    grp.add(pm);
  }
  mk(g.head, CAR_MATS.head);
  const tail = mk(g.tail, CAR_MATS.tailOff);
  const parts = { body, tail, doorPivot, doorMesh, hole, driver, dTm, dHm };
  if (g.barBase) {
    mk(g.barBase, CAR_MATS.barBase);
    parts.red = mk(g.barRed, CAR_MATS.off);
    parts.blue = mk(g.barBlue, CAR_MATS.offB);
  }
  if (g.stripe) mk(g.stripe, T.police ? CAR_MATS.stripePol : CAR_MATS.stripeTaxi);
  if (g.taxiSign) mk(g.taxiSign, CAR_MATS.taxiSign);
  if (T.mg) {
    // schwenkbares Maschinengewehr auf dem Dach / der Ladefläche
    const gun = new THREE.Group(); gun.position.set(0, g.height + 0.02, T.profile === 'pickup' ? -T.L * 0.28 : -0.25);
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.5, metalness: 0.6 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.18, 14), dark); ring.position.y = 0.09; gun.add(ring);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.08), dark); shield.position.set(0, 0.5, 0.45); gun.add(shield);
    const body2 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.7), dark); body2.position.set(0, 0.42, 0.25); gun.add(body2);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.1, 8).rotateX(Math.PI / 2), dark); barrel.position.set(0, 0.42, 1.05); gun.add(barrel);
    grp.add(gun); parts.mg = gun;
  }
  return { group: grp, parts, geo: g };
}

// Kennzeichen-Texturen (fiktiv, Port Solera)
const PLATE_GEO = new THREE.PlaneGeometry(0.52, 0.12);
const plateMats = [];
function plateMat() {
  if (plateMats.length < 8) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 60;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f4ef'; g.fillRect(0, 0, 256, 60);
    g.fillStyle = '#1d4ed8'; g.fillRect(0, 0, 26, 60);
    g.strokeStyle = '#222'; g.lineWidth = 4; g.strokeRect(2, 2, 252, 56);
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('PS', 13, 36);
    const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
    const txt = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] + ' ' + (100 + Math.floor(Math.random() * 8900));
    g.fillStyle = '#111'; g.font = 'bold 40px "Russo One", sans-serif'; g.fillText(txt, 140, 46);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t });
    m.color.setScalar(0.85);
    plateMats.push(m);
    return m;
  }
  return plateMats[Math.floor(Math.random() * plateMats.length)];
}

// Räder für statische Modelle (Autohaus)
let _wheelGeo = null, _wheelMat = null;
export function addWheels(group, key) {
  const T = CAR_TYPES[key]; if (T.tank || T.build) return; const g = carGeos(key);
  _wheelGeo = _wheelGeo || wheelGeometry();
  _wheelMat = _wheelMat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 });
  for (const [x, y, z, front] of g.wheels) {
    const m = new THREE.Mesh(_wheelGeo, _wheelMat);
    m.position.set(x, y, z); m.scale.set(0.26, T.wheelR, T.wheelR);
    if (front) m.rotation.y = -0.25;
    m.castShadow = true;
    group.add(m);
  }
}

// Radgeometrie (Einheitsgröße: Radius 1, Breite 1)
export function wheelGeometry() {
  const b = new GeoBuilder(true);
  const tire = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).rotateZ(Math.PI / 2);
  b.addGeometry(tire, new THREE.Matrix4(), rgb(0x161616));
  for (const sx of [-1, 1]) {
    const ring = new THREE.RingGeometry(0.66, 1, 18).rotateY(sx * Math.PI / 2);
    b.addGeometry(ring, new THREE.Matrix4().makeTranslation(sx * 0.5, 0, 0), rgb(0x1e1e1e));
    const disc = new THREE.CircleGeometry(0.66, 18).rotateY(sx * Math.PI / 2);
    b.addGeometry(disc, new THREE.Matrix4().makeTranslation(sx * 0.49, 0, 0), rgb(0x3b3e44));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.06, 0.58, 0.14).translate(0, 0.3, 0);
      const m = new THREE.Matrix4().makeTranslation(sx * 0.52, 0, 0).multiply(new THREE.Matrix4().makeRotationX(a));
      b.addGeometry(sp, m, rgb(0xc9ced6));
    }
    const lip = new THREE.RingGeometry(0.6, 0.68, 24).rotateY(sx * Math.PI / 2);
    b.addGeometry(lip, new THREE.Matrix4().makeTranslation(sx * 0.515, 0, 0), rgb(0xe6e9ee));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      const sp = new THREE.BoxGeometry(0.04, 0.5, 0.07).translate(0, 0.32, 0);
      const m = new THREE.Matrix4().makeTranslation(sx * 0.51, 0, 0).multiply(new THREE.Matrix4().makeRotationX(a));
      b.addGeometry(sp, m, rgb(0x9aa1ab));
    }
    const caliper = new THREE.BoxGeometry(0.08, 0.22, 0.12).translate(0, 0.38, 0.12);
    b.addGeometry(caliper, new THREE.Matrix4().makeTranslation(sx * 0.4, 0, 0), rgb(0xd62828));
    const hub = new THREE.CircleGeometry(0.16, 10).rotateY(sx * Math.PI / 2);
    b.addGeometry(hub, new THREE.Matrix4().makeTranslation(sx * 0.53, 0, 0), rgb(0xdfe3e8));
  }
  return b.build();
}
