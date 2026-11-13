// NEON COAST 3.0 – 35 neue Aufträge mit sechs neuen Kontakten im ganzen Solera County:
// Nina (Straßenrennen), Marisol (Boote), Paco (Flugzeug), Luna (Casino), Bürgermeister Ortiz, Tío Benito
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { AIDriver } from './traffic.js';
import { randomLook } from './models.js';
import { clamp, rand, dist2, pick } from './utils.js';
import { AIRFIELD, MANSION, LOOKOUT, HILL_ROADS, hillHeight } from './terrain.js';
import { BoatAI, isWater } from './craft.js';

const c = (h) => new THREE.Color(h);
const base = (skin) => ({ skin: c(skin), shoes: c(0x222222), hat: null, bald: false });
export const LOOKS3 = {
  nina: () => ({ ...base(0xe0ac69), shirt: c(0x111111), sleeve: c(0xff2e88), pants: c(0x2b2b2b), legs: c(0x2b2b2b), hair: c(0xff2e88), scale: 0.9 }),
  marisol: () => ({ ...base(0xc68642), shirt: c(0xf4f1de), sleeve: c(0x1d4e89), pants: c(0x1d4e89), legs: c(0x1d4e89), hair: c(0x2b1a10), hat: c(0xf4f1de), scale: 0.93 }),
  paco: () => ({ ...base(0x8d5524), shirt: c(0x6b4423), sleeve: c(0x6b4423), pants: c(0x4a5a3a), legs: c(0x4a5a3a), hair: c(0x111111), hat: c(0x3a2a1a), scale: 1.02 }),
  luna: () => ({ ...base(0xf1c27d), shirt: c(0x8a1020), sleeve: c(0x8a1020), pants: c(0x111111), legs: c(0xf1c27d), hair: c(0x111111), scale: 0.92 }),
  ortiz: () => ({ ...base(0xe0ac69), shirt: c(0xf4f1ea), sleeve: c(0x2b2d42), pants: c(0x2b2d42), legs: c(0x2b2d42), hair: c(0x8a8a8a), scale: 1.0 }),
  val: () => ({ ...base(0xf1c27d), shirt: c(0x5a189a), sleeve: c(0x5a189a), pants: c(0x240046), legs: c(0x240046), hair: c(0x1b1b1b), scale: 0.94 }),
  benito: () => ({ ...base(0xb07a4a), shirt: c(0xc0392b), sleeve: c(0xc0392b), pants: c(0x3b5a7a), legs: c(0x3b5a7a), hair: c(0xd9d9d9), hat: c(0xd9b48a), scale: 1.0 }),
  gang: (col = 0x2b2b2b) => { const l = randomLook(); return { ...l, shirt: c(col), sleeve: Math.random() < 0.5 ? l.skin : c(col), pants: c(0x1b1b1f), legs: c(0x1b1b1f), hat: Math.random() < 0.6 ? c(0x111111) : null }; },
};
export const TALK3 = { Fuego: '#b26bff', Bauer: '#7cff6b', Kunde: '#cccccc', Nina: '#ff2e88', Marisol: '#4fc3ff', Paco: '#9ad1ff', Luna: '#ffd23f', Ortiz: '#e9d8a6', Benito: '#ffb35c', Rico: '#ff3b5c', Cuervo: '#ff3b5c' };
export const CONTACTS3 = {
  nina: { name: 'Nina „Nitro“ Cruz', role: "Straßenrennen · Dex' Tuning", poi: 'g_nina', col: '#ff2e88', auto: true },
  marisol: { name: 'Marisol Vega', role: 'Hafenmeisterin · Solera Marina', poi: 'g_marisol', col: '#4fc3ff', auto: true },
  paco: { name: 'Paco Reyes', role: 'Pilot · Flugfeld Los Ranchos', poi: 'g_paco', col: '#9ad1ff', auto: true },
  luna: { name: 'Luna Ferrer', role: 'Gran Casino · Bahía Blanca', inside: [1508, 1995], door: 'casino', col: '#ffd23f', auto: true },
  ortiz: { name: 'Bürgermeister Ortiz', role: 'Rathaus Valverde', poi: 'g_ortiz', col: '#e9d8a6', auto: true },
  benito: { name: 'Tío Benito', role: 'Rancher · Los Ranchos', poi: 'g_benito', col: '#ffb35c', auto: true },
  dealer: { name: 'Fuego', role: 'Straßenhändler', poi: null, col: '#b26bff' },
};
export const PHONE3 = [
  { id: 'nina', need: 'nina', name: 'Nina', role: 'Straßenrennen', col: '#ff2e88', lines: ['Nitro an, Hirn aus? Nein. Nitro an, Hirn AN.', 'Die Pinienstraße fährt sich bei Nacht am besten.'] },
  { id: 'marisol', need: 'marisol', name: 'Marisol Vega', role: 'Solera Marina', col: '#4fc3ff', lines: ['Wind aus Südwest, perfekte Bedingungen!', 'Pass auf die Küstenwache auf – die schießen zuerst.'] },
  { id: 'paco', need: 'paco', name: 'Paco Reyes', role: 'Flugfeld Los Ranchos', col: '#9ad1ff', lines: ['Der Albatros ist vollgetankt. Komm vorbei!', 'Unter Brücken durchfliegen ist illegal. Und großartig.'] },
  { id: 'luna', need: 'luna', name: 'Luna Ferrer', role: 'Gran Casino', col: '#ffd23f', lines: ['Das Haus gewinnt immer, Leo. Außer, du arbeitest für das Haus.', 'Heute Abend Gala im Casino. Dresscode: Gold.'] },
  { id: 'ortiz', need: 'ortiz', name: 'Bürgermeister Ortiz', role: 'Rathaus Valverde', col: '#e9d8a6', lines: ['Valverde braucht Leute wie dich.', 'Die Wahl ist erst gewonnen, wenn die Stimmen gezählt sind.'] },
  { id: 'dealer', need: 'dealer', name: 'Fuego', role: 'Straßenhändler', col: '#b26bff', lines: ['Psst … ich bin immer irgendwo in der Stadt. Halt die Augen offen.', 'Die Finca hat wieder Ware. Komm vorbei, wenn du Arbeit willst.'] },
  { id: 'benito', need: 'benito', name: 'Tío Benito', role: 'Los Ranchos', col: '#ffb35c', lines: ['Die Kojoten werden frech, muchacho.', 'Komm zum Grillen vorbei, wenn die Sonne untergeht.'] },
];

// ------------------------------------------------------------ Orte & Hilfen
const T = (key) => C.TOWNS.find((t) => t.key === key);
const side = (key, i, j, ox = 6.6, oz = 6.6) => { const [x, z] = C.townNode(T(key), i, j); return [x + ox, z + oz]; };
export function registerPois(W) {
  W.pois.g_nina = { x: 72, z: 268.5 };
  W.pois.g_marisol = { x: 83, z: 378.6 };
  W.pois.g_paco = { x: AIRFIELD.x0 + 66, z: AIRFIELD.z0 - 9 };
  const v = T('valverde'), [hx, hz] = C.townNode(v, 2, 1);
  W.pois.g_ortiz = W.pois.valverde_hall || { x: hx + 35, z: hz + 6.6 };
  const [bx, bz] = side('ranchos', 1, 1);
  W.pois.g_benito = { x: bx, z: bz };
}
const P = () => G.player;
const pos = () => { const p = P(); return p.inCar ? p.vehicle : p; };
function* meet(m, def, lookKey) {
  const p = P(), res = G.interiors && G.interiors.residents && G.interiors.residents[def.contact];
  if (res && !res.removed) return res;
  const g = m.giverPos(def.contact);
  const n = m.npc(g.x + Math.sin(p.yaw) * 1.8, g.z + Math.cos(p.yaw) * 1.8, LOOKS3[lookKey](), 0);
  n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
  return n;
}
// Auto mit KI im Landstraßennetz
function netCar(m, key, x, z, color, cruise = 14, flags = {}) {
  const W = G.world, loc = W.netLocate(x, z);
  if (!loc) return null;
  const E = W.net.edges[loc.edge], idx = clamp(loc.idx, 1, E.pts.length - 2), dir = flags.dir || 1;
  const [px, pz] = AIDriver.prototype.hillPoint.call(null, E, idx, dir);
  const nb = E.pts[clamp(idx + dir, 0, E.pts.length - 1)], pa = E.pts[idx];
  const v = m.spawnCar(key, px, pz, Math.atan2(nb[0] - pa[0], nb[1] - pa[1]), color, flags);
  if (!v) return null;
  v.parked = false;
  v.driver = { isPed: true, look: LOOKS3.gang(0x2b2b2b), persistent: true };
  v.ai = new AIDriver(v, 'traffic'); v.ai.startHill(loc.edge, idx, dir); v.ai.cruise = cruise; v.ai.keepFlee = true;
  return v;
}
function chaser(m, key, x, z, col) {
  const v = netCar(m, key, x, z, col, 26);
  if (!v) return null;
  v.ai.mode = 'chase'; v.ai.target = null; v.missionTarget = true;
  v.mk = m.marker(0, 0, 0xff3b5c, { follow: v, arrow: true, blipCol: '#ff3b5c' });
  return v;
}
const carDown = (v) => !v || !v.alive || v.onFire || v.sinking || !v.driver || !v.driver.isPed;
// GPS-Länge zwischen zwei Punkten
function routeLen(ax, az, bx, bz) { const p = G.world.gpsPath(ax, az, bx, bz) || []; let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot((p[i].x ?? p[i][0]) - (p[i - 1].x ?? p[i - 1][0]), (p[i].z ?? p[i][1]) - (p[i - 1].z ?? p[i - 1][1])); return L || Math.hypot(bx - ax, bz - az) * 1.3; }
export function routePts(ax, az, bx, bz, step = 140) { const p = G.world.gpsPath(ax, az, bx, bz) || []; const out = []; let acc = 0; for (let i = 1; i < p.length; i++) { const x = p[i].x ?? p[i][0], z = p[i].z ?? p[i][1]; acc += Math.hypot(x - (p[i - 1].x ?? p[i - 1][0]), z - (p[i - 1].z ?? p[i - 1][1])); if (acc > step) { out.push([x, z]); acc = 0; } } out.push([bx, bz]); return out; }
function* drivePts(m, pts, opts = {}) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i], last = i === pts.length - 1;
    const gd = !last ? cpGuide(m, x, G.world.groundHeight(x, z), z, pts[i + 1][0], G.world.groundHeight(pts[i + 1][0], pts[i + 1][1]), pts[i + 1][1]) : null;
    yield* m.goTo(x, z, opts.text ? opts.text(i, pts.length) : `Checkpoint ${i + 1}/${pts.length}`, { r: opts.r || 9, car: true, vehicle: opts.vehicle, color: last ? 0xffd23f : 0xff2e88 });
    if (gd) m.removeMarker(gd);
    G.audio.checkpoint();
    if (opts.bonus && m.timerLeft != null) m.timerLeft += opts.bonus;
  }
}
// Wegweiser: Pfeil über dem aktuellen Checkpoint zeigt zum nächsten, schwacher Ring zeigt den nächsten
let ARROW_GEO = null;
export function cpGuide(m, x, y, z, nx, ny, nz) {
  if (!ARROW_GEO) {
    const sh = new THREE.Shape([[0, 2.2], [1.6, 0.2], [0.6, 0.2], [0.6, -1.8], [-0.6, -1.8], [-0.6, 0.2], [-1.6, 0.2]].map(([a, b]) => new THREE.Vector2(a, b)));
    ARROW_GEO = new THREE.ShapeGeometry(sh).rotateX(Math.PI / 2);
  }
  const g = new THREE.Group();
  const arrow = new THREE.Mesh(ARROW_GEO, new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  arrow.position.set(x, y + 5.5, z); arrow.rotation.order = 'YXZ'; arrow.rotation.y = Math.atan2(nx - x, nz - z); arrow.rotation.x = -0.35;
  arrow.renderOrder = 9; g.add(arrow);
  const prev = new THREE.Mesh(new THREE.TorusGeometry(4, 0.35, 6, 28), new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: 0.35, depthWrite: false }));
  prev.position.set(nx, ny + 0.3, nz); prev.rotation.x = Math.PI / 2; g.add(prev);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y + 4.2, z), new THREE.Vector3(nx, ny + 3, nz)]), new THREE.LineDashedMaterial({ color: 0xffe14d, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.6 }));
  line.computeLineDistances(); g.add(line);
  G.scene.add(g);
  const o = { x, z, blip: false, t: 0, update(dt) { this.t += dt; arrow.position.y = y + 5.5 + Math.sin(this.t * 3) * 0.4; prev.scale.setScalar(1 + 0.1 * Math.sin(this.t * 4)); }, remove() { G.scene.remove(g); } };
  m.markers.push(o);
  return o;
}

// Meer: nächster Punkt mit genug Wassertiefe
function seaPt(x, z) { for (let k = 0; k < 40; k++) { if (isWater(x, z, 2.5)) return [x, z]; const l = Math.hypot(x, z) || 1; x += (x / l) * 15; z += (z / l) * 15; } return [x, z]; }
function* waterCps(m, pts, opts = {}) {
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i], last = i === pts.length - 1;
    const mk = m.marker(x, z, last ? 0xffd23f : 0x4fc3ff, { r: opts.r || 10, h: 5, y: C.WATER_Y, blipCol: last ? '#ffd23f' : '#4fc3ff' });
    const gd = !last ? cpGuide(m, x, C.WATER_Y, z, pts[i + 1][0], C.WATER_Y, pts[i + 1][1]) : null;
    m.objective(opts.text ? opts.text(i, pts.length) : `Boje ${i + 1}/${pts.length}`);
    yield* m.until(() => { const v = pos(); return dist2(v.x, v.z, x, z) < (opts.r || 10) ** 2 && (!opts.vehicle || P().vehicle === opts.vehicle); });
    m.removeMarker(mk); if (gd) m.removeMarker(gd); G.audio.checkpoint();
    if (opts.passed) opts.passed(i);
  }
  m.objective('');
}
// Ringe in der Luft (3D)
function ring(m, x, y, z, r, col, face) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.6, r * 0.06), 8, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false }));
  mesh.position.set(x, y, z);
  if (face) mesh.lookAt(face[0], face[1], face[2]);
  G.scene.add(mesh);
  const o = { x, z, blip: true, blipCol: '#' + new THREE.Color(col).getHexString(), mesh, t: 0, update(dt) { this.t += dt; mesh.material.opacity = 0.65 + 0.3 * Math.sin(this.t * 4); }, remove() { G.scene.remove(mesh); mesh.geometry.dispose(); } };
  m.markers.push(o);
  return o;
}
function* airRings(m, pts, opts = {}) {
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z, r = 22, face] = pts[i], nx = pts[i + 1] || pts[i - 1] || [x, y, z + 1];
    const o = ring(m, x, y, z, r, i === pts.length - 1 ? 0xffd23f : 0xff2e88, face || nx);
    const nn = pts[i + 1], gd = nn ? cpGuide(m, x, y + r * 0.6 - 5.5, z, nn[0], nn[1] - 0.3, nn[2]) : null;
    m.objective(opts.text ? opts.text(i, pts.length) : `Ring ${i + 1}/${pts.length}`);
    yield* m.until(() => { const v = pos(); return Math.hypot(v.x - x, (v.y || 0) + 1.5 - y, v.z - z) < r * 1.05; });
    m.removeMarker(o); if (gd) m.removeMarker(gd); G.audio.checkpoint();
    if (opts.bonus && m.timerLeft != null) m.timerLeft += opts.bonus;
  }
  m.objective('');
}
function gangBoat(m, x, z, key = 'speeder') {
  const v = G.craft.spawnBoat(key, x, z, rand(0, 6.28), 0x222222);
  if (!v) return null;
  m.track(v);
  v.persistent = true; v.missionTarget = true;
  v.driver = { isPed: true, look: LOOKS3.gang(0x5a189a) };
  v.ai = new BoatAI(v, 'attack'); v.ai.cruise = v.T.maxSpeed * 0.85;
  v.mk = m.marker(0, 0, 0xff3b5c, { follow: v, arrow: true, blipCol: '#ff3b5c' });
  return v;
}
function* waves(m, x, z, sizes, opts = {}) {
  for (let w = 0; w < sizes.length; w++) {
    const a = rand(0, 6.28), d = opts.dist || 26;
    const g = m.gang(x + Math.cos(a) * d, z + Math.sin(a) * d, sizes[w], { gun: true, hp: opts.hp || 60, col: opts.col || 0x111111, goal: { x, z }, aggro: 70 });
    m.objective(`${opts.label || 'Gegner'}: Welle ${w + 1}/${sizes.length} – schalte alle aus.`);
    yield* m.until(() => m.aliveGang(g) === 0);
    G.audio.checkpoint();
    if (w < sizes.length - 1) { G.hud.toast('Die nächste Welle kommt!'); yield* m.wait(4); }
  }
  m.objective('');
}
function provideCar(m, key, near, color, h = 0) {
  const [x, z] = near;
  const v = m.spawnCar(key, x, z, h, color, { missionCar: true, ownedByPlayer: false });
  v.mk = m.marker(0, 0, 0x19e6ff, { follow: v, arrow: true, blipCol: '#19e6ff' });
  return v;
}
function* enterIt(m, v, text) { m.objective(text); yield* m.until(() => P().vehicle === v); if (v.mk) { m.removeMarker(v.mk); v.mk = null; } m.objective(''); }
const bridges = () => {
  const out = [];
  for (const R of HILL_ROADS) {
    let s = -1;
    for (let i = 0; i <= R.pts.length; i++) {
      const b = i < R.pts.length && R.bridge[i];
      if (b && s < 0) s = i;
      if (!b && s >= 0) {
        let mid = Math.floor((s + i) / 2); mid -= mid % 6; if (mid <= s) mid += 6; // zwischen zwei Pfeilern (Pfeiler bei i % 6 = 3)
        if (mid >= i - 1) { s = -1; continue; }
        const [x, z] = R.pts[mid], deck = R.hs[mid] - 1.6, g = hillHeight(x, z), cl = deck - g;
        const a = R.pts[mid - 1], b2 = R.pts[mid + 1], tx = b2[0] - a[0], tz = b2[1] - a[1], l = Math.hypot(tx, tz) || 1;
        if (cl > 11) out.push({ x, z, y: g + cl * 0.45, r: Math.min(10, cl * 0.36), face: [x - tz / l * 50, g + cl * 0.45, z + tx / l * 50], cl, name: R.name });
        s = -1;
      }
    }
  }
  return out.sort((p, q) => q.cl - p.cl);
};
const onRunway = (v) => v.x > AIRFIELD.x0 && v.x < AIRFIELD.x1 && v.z > AIRFIELD.z0 && v.z < AIRFIELD.z1;
function* landPlane(m, plane) {
  m.objective('Lande auf der <b>Startbahn</b> von Los Ranchos (S = sinken, Leertaste = langsamer).');
  const mk = m.marker((AIRFIELD.x0 + AIRFIELD.x1) / 2, (AIRFIELD.z0 + AIRFIELD.z1) / 2, 0xffd23f, { r: 6, h: 2, blipCol: '#ffd23f' });
  yield* m.until(() => P().vehicle === plane && plane.grounded && plane.speed < 4 && onRunway(plane));
  m.removeMarker(mk); m.objective('');
}

// ======================================================================
const MS = [];
const add = (d) => MS.push(d);

// ---------------------------------------------------------------- NINA (Straßenrennen)
add({ id: 'nb1', title: 'Ruf der Straße', sub: 'Nina', contact: 'nina', req: [], label: 'N', reward: 2000, desc: 'Zeitfahrt von Dex\' Tuning bis nach Santa Cruz.',
  *run(m) {
    const n = yield* meet(m, this, 'nina');
    yield* m.talk([['Nina', 'Du bist also der Neue, von dem Dex dauernd erzählt. Ich bin Nina.'], ['Nina', 'Ich fahre Rennen. Illegal, schnell, laut. Zeig mir, ob du mithalten kannst.'], ['Nina', 'Nimm meinen Zephyra. Bis zum Hafen von Santa Cruz – über den Westdamm. Die Uhr läuft!']], n, n);
    const car = provideCar(m, 'zephyra', [80, 276], 0xff2e88, Math.PI / 2);
    m.failIf(() => !car.alive || car.sinking, 'Ninas Zephyra ist Schrott.');
    yield* enterIt(m, car, 'Steig in Ninas <b>Zephyra</b>.');
    const [tx, tz] = side('santacruz', 2, 1);
    m.timerLeft = Math.round(routeLen(car.x, car.z, tx, tz) / 27 + 25);
    yield* m.goTo(tx, tz, 'Fahr so schnell du kannst nach <b>Santa Cruz</b>.', { r: 10, vehicle: car, color: 0xff2e88 });
    m.timerLeft = null; G.hud.timer(null);
    G.hud.toast('🏁 Zeit geschafft! Nina schreibt: „Nicht schlecht für einen Anfänger.“');
    car.persistent = false;
  } });
add({ id: 'nb2', title: 'Nitro-Kur', sub: 'Nina', contact: 'nina', req: ['nb1'], label: 'N', reward: 8000, desc: 'Nitro einbauen und die 300-km/h-Marke knacken.',
  *run(m) {
    const n = yield* meet(m, this, 'nina');
    yield* m.talk([['Nina', 'Ohne Nitro bist du auf der Küstenstraße nur Deko.'], ['Nina', 'Bau dir bei Dex Nitro ein – ich zahl\'s dir zurück, wenn du damit 300 Sachen schaffst. Nimm was Schnelles – Zephyra oder Vortex – und such dir eine lange Gerade.']], n, n);
    m.objective('Fahr mit einem Auto in die <b>Tuning-Einfahrt</b> (🔧) und bau <b>Nitro</b> ein.');
    const mk = m.marker(80, 267, 0xffb703, { r: 2.6, blip: true, blipCol: '#ffb703' }); mk.group.visible = false;
    yield* m.until(() => P().inCar && P().vehicle.nitro);
    m.removeMarker(mk);
    m.objective('Erreiche <b>300 km/h</b> (Shift / NITRO halten, lange Gerade).');
    yield* m.until(() => P().inCar && P().vehicle.speed * 3.6 >= 300);
    G.hud.bigToast('300 KM/H', 'Nina ist beeindruckt');
  } });
add({ id: 'nb3', title: 'Bergsprint', sub: 'Nina', contact: 'nina', req: ['nb2'], label: 'N', reward: 4500, desc: 'Von Valverde hinauf nach Pinar Alto – auf Zeit.',
  *run(m) {
    const [sx, sz] = side('valverde', 0, 1, -8, 6.6);
    yield* m.goTo(sx, sz, 'Fahr zum Start am Westrand von <b>Valverde</b>.', { r: 8, car: true });
    const n = m.npc(sx + 4, sz + 3, LOOKS3.nina());
    yield* m.talk([['Nina', 'Pinienweg, Brücken, Serpentinen. Der Rekord liegt bei drei Minuten.'], ['Nina', 'Wer schneller ist, hat ab heute meinen Respekt. 3 … 2 … 1 …']], n, n);
    const [tx, tz] = side('pinar', 1, 1);
    const pts = routePts(sx, sz, tx, tz, 220);
    m.timerLeft = Math.round(routeLen(sx, sz, tx, tz) / 24 + 20);
    m.failIf(() => !P().inCar && P().state !== 'cutscene', 'Du hast das Auto verlassen.');
    yield* drivePts(m, pts, { text: (i, k) => `Bergsprint: Checkpoint ${i + 1}/${k}`, r: 11 });
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'nb4', title: 'Driftkönigin', sub: 'Nina', contact: 'nina', req: ['nb3'], label: 'N', reward: 4000, desc: 'Sammle 3.000 Driftpunkte in 90 Sekunden.',
  *run(m) {
    const n = yield* meet(m, this, 'nina');
    yield* m.talk([['Nina', 'Schnell kann jeder. Aber kannst du auch quer?'], ['Nina', 'Handbremse ziehen, Gas stehen lassen, Auto tanzen lassen. 3.000 Punkte in 90 Sekunden!']], n, n);
    yield* m.getInCar();
    let pts = 0, combo = 1, lastDrift = 0;
    m.timerLeft = 90;
    m.failIf(() => !P().inCar, 'Du hast das Auto verlassen.');
    yield* m.until(() => {
      const v = P().vehicle;
      if (v && v.slip > 3.2 && v.speed > 8 && v.grounded) { pts += v.slip * v.speed * G.dt * 0.6 * combo; lastDrift = G.time; combo = Math.min(4, combo + G.dt * 0.25); }
      else if (G.time - lastDrift > 1.2) combo = 1;
      m.objective(`Driftpunkte: <b>${Math.round(pts)}</b> / 3000 · Combo ×${combo.toFixed(1)}`);
      return pts >= 3000;
    });
    m.timerLeft = null; G.hud.timer(null);
    G.hud.bigToast('DRIFTKÖNIG', `${Math.round(pts)} Punkte`);
  } });
add({ id: 'nb5', title: 'Das große Finale', sub: 'Nina', contact: 'nina', req: ['nb4'], label: 'N', reward: 10000, rewardCar: ['vortex', 0xff2e88], desc: 'Rico hat Ninas Vortex geklaut – hol ihn zurück.',
  *run(m) {
    const n = yield* meet(m, this, 'nina');
    yield* m.talk([['Nina', 'Leo! Rico – der Typ, den ich letzte Woche abgezogen habe – hat meinen Vortex geklaut!'], ['Nina', 'Er rast gerade über die Küstenstraße Richtung Bahía. Stopp ihn – egal wie. Wenn du ihn kriegst, gehört der Wagen dir.']], n, n);
    yield* m.getInCar();
    const v = netCar(m, 'vortex', 40, -600, 0xff2e88, 30, { missionTarget: true });
    v.health = v.maxHealth = 1600; v.ai.stopped = true;
    const mk = m.marker(0, 0, 0xff3b5c, { follow: v, arrow: true, blipCol: '#ff3b5c' });
    m.objective('Stoppe <b>Rico</b> im pinken Vortex!');
    m.objective('Fahr zum <b>Nordende des Damms</b> – dort wartet Rico.');
    yield* m.until(() => carDown(v) || dist2(v.x, v.z, pos().x, pos().z) < 140 * 140);
    v.ai.stopped = false; G.hud.toast('Rico gibt Gas!');
    m.objective('Stoppe <b>Rico</b> im pinken Vortex!');
    m.failIf(() => !carDown(v) && dist2(v.x, v.z, pos().x, pos().z) > 700 * 700, 'Rico ist entkommen.');
    m.timerLeft = 240;
    yield* m.until(() => { if (v.alive && v.health < v.maxHealth * 0.35 && v.driver && v.driver.isPed) G.peds.ejectDriver(v); return carDown(v); });
    m.timerLeft = null; G.hud.timer(null);
    m.removeMarker(mk);
    yield* m.talk([['Rico', 'Okay, okay! Nimm die Karre!'], ['Leo', 'Grüß Nina von mir.']], { x: v.x, z: v.z }, null);
  } });

// ---------------------------------------------------------------- MARISOL (Boote)
add({ id: 'mb1', title: 'Seemannsprüfung', sub: 'Marisol', contact: 'marisol', req: [], label: '⚓', reward: 1800, desc: 'Bojenkurs rund um die Südküste.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Willkommen in der Solera Marina! Ich bin Marisol, die Hafenmeisterin.'], ['Marisol', 'Bevor ich dir richtige Jobs gebe, will ich sehen, ob du ein Boot steuern kannst.'], ['Marisol', 'Nimm die Barracuda am Steg und fahr den Bojenkurs bis zum Strandsteg. Nicht zu langsam!']], n, n);
    const D = C.DOCKS[0], s = D.slips[1];
    const b = G.craft.spawnBoat('speeder', s[0], s[1], s[2], 0x1d4e89); m.track(b); b.persistent = true; b.missionCar = true;
    m.failIf(() => !b.alive || b.sinking, 'Die Barracuda ist gesunken.');
    const mk = m.marker(0, 0, 0x19e6ff, { follow: b, arrow: true, blipCol: '#19e6ff' });
    m.objective('Steig in die <b>Barracuda</b> am Steg.');
    yield* m.until(() => P().vehicle === b); m.removeMarker(mk);
    const pts = [[100, 480], [260, 485], [520, 425], [700, 260], [725, 110], [705, -60], [640, -255], [492, -200]].map(([x, z]) => seaPt(x, z));
    m.timerLeft = 150;
    yield* waterCps(m, pts, { vehicle: b, r: 12, text: (i, k) => `Bojenkurs ${i + 1}/${k}` });
    m.timerLeft = null; G.hud.timer(null);
    b.persistent = false;
    G.hud.toast('⚓ Marisol funkt: „Sauber gefahren, Matrose!“');
  } });
add({ id: 'mb2', title: 'Treibgut', sub: 'Marisol', contact: 'marisol', req: ['mb1'], label: '⚓', reward: 3500, desc: 'Schmuggelkisten aus dem Meer fischen – und der Küstenwache entkommen.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Ein Frachter hat letzte Nacht Kisten verloren. Offiziell: Ersatzteile.'], ['Marisol', 'Inoffiziell: Ware, die die Küstenwache sehr gern hätte. Fisch sie raus, bevor die es tun.']], n, n);
    yield* m.getInCar('Steig in ein <b>Boot</b> (kaufen oder mieten am ⚓-Steg).');
    yield* m.until(() => P().inCar && P().vehicle.T.boat);
    const crates = [[560, -120], [690, -330], [760, 170], [560, 330]].map(([x, z]) => seaPt(x, z));
    for (let i = 0; i < crates.length; i++) {
      const [x, z] = crates[i];
      const mk = m.marker(x, z, 0xd4a017, { r: 2.5, h: 1.5, y: C.WATER_Y, label: '📦', blipCol: '#d4a017' });
      m.objective(`Fisch die <b>Kiste ${i + 1}/${crates.length}</b> aus dem Wasser.`);
      yield* m.until(() => P().inCar && dist2(P().vehicle.x, P().vehicle.z, x, z) < 6 * 6);
      m.removeMarker(mk); G.audio.pickup();
      if (i === crates.length - 1) { G.police.setLevel(2); G.police.spotted(); G.hud.toast('🚨 Die Küstenwache hat dich entdeckt!'); }
    }
    m.objective('Häng die <b>Küstenwache</b> ab.');
    yield* m.until(() => G.police.level === 0);
    const D = C.DOCKS[1];
    yield* m.goTo(D.slips[0][0], D.slips[0][1] - 2, 'Bring die Kisten zum <b>Strandsteg</b>.', { r: 8, car: true });
  } });
add({ id: 'mb3', title: 'Kutter in Not', sub: 'Marisol', contact: 'marisol', req: ['mb2'], label: '⚓', reward: 4000, desc: 'Piraten greifen einen Fischkutter vor der Altstadt an.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Notruf vom Kutter „Esperanza“ vor der Altstadt! Zwei Schnellboote kreisen um ihn.'], ['Marisol', 'Die Barracuda liegt bereit. Ich hab dir eine Maschinenpistole ins Handschuhfach gelegt.']], n, n);
    P().giveWeapon('smg', 150);
    const D = C.DOCKS[0], s = D.slips[0];
    const b = G.craft.spawnBoat('speeder', s[0], s[1], s[2], 0x1d4e89); m.track(b); b.persistent = true;
    m.failIf(() => !b.alive && P().vehicle !== b && !P().inCar, 'Dein Boot ist gesunken.');
    const bmk = m.marker(0, 0, 0x19e6ff, { follow: b, arrow: true, blipCol: '#19e6ff' });
    m.objective('Steig in die <b>Barracuda</b> am Steg.');
    yield* m.until(() => P().vehicle === b);
    m.removeMarker(bmk);
    const [kx, kz] = seaPt(-760, 40);
    const kutter = G.craft.spawnBoat('fishing', kx, kz, 0.5, 0x1d6f6a); m.track(kutter); kutter.persistent = true; kutter.health = kutter.maxHealth = 1600;
    kutter.driver = { isPed: true, look: randomLook() };
    m.failIf(() => !kutter.alive || kutter.sinking, 'Der Kutter ist gesunken.');
    const kmk = m.marker(0, 0, 0x7cff6b, { follow: kutter, blipCol: '#7cff6b' });
    yield* m.goTo(kx, kz, 'Fahr zum <b>Kutter</b> vor der Altstadt.', { r: 70, car: true });
    const foes = [gangBoat(m, kx + 30, kz + 20), gangBoat(m, kx - 25, kz - 30)];
    let hit = 0;
    m.objective('Versenke die <b>Piratenboote</b> (Drive-by: Feuer im Boot).');
    yield* m.until(() => { hit += G.dt; if (hit > 2) { hit = 0; for (const f of foes) if (f.alive && dist2(f.x, f.z, kutter.x, kutter.z) < 40 * 40) kutter.damage(18, null); } for (const f of foes) if (!f.alive && f.mk) { m.removeMarker(f.mk); f.mk = null; } return foes.every((f) => !f.alive); });
    m.removeMarker(kmk);
    yield* m.talk([['Marisol', 'Die „Esperanza“ meldet sich – alle an Bord wohlauf. Gute Arbeit!']], { x: pos().x, z: pos().z }, null);
  } });
add({ id: 'mb4', title: 'Regatta', sub: 'Marisol', contact: 'marisol', req: ['mb3'], label: '⚓', reward: 6000, rewardBoat: ['speeder', 0xffd23f], desc: 'Bootsrennen gegen drei Profis um die Insel.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Die Solera-Regatta! Drei Profis, ein Kurs, ein Sieger.'], ['Marisol', 'Gewinnst du, bekommst du eine goldene Barracuda. Ab zum Start!']], n, n);
    const D = C.DOCKS[0];
    const path = [[100, 480], [260, 485], [520, 425], [700, 260], [725, 110], [705, -60], [640, -255], [540, -330]].map(([x, z]) => seaPt(x, z));
    const me = G.craft.spawnBoat('speeder', D.slips[0][0], D.slips[0][1], 0, 0xffffff); m.track(me); me.persistent = true;
    const bmk = m.marker(0, 0, 0x19e6ff, { follow: me, arrow: true, blipCol: '#19e6ff' });
    m.objective('Steig in dein <b>Rennboot</b> am Steg.');
    yield* m.until(() => P().vehicle === me);
    m.removeMarker(bmk);
    const rivals = [];
    for (let k = 0; k < 3; k++) {
      const s = D.slips[(k + 1) % D.slips.length];
      const r = G.craft.spawnBoat('speeder', s[0] + (k === 2 ? 6 : 0), s[1], 0, [0xe63946, 0x00b4d8, 0x111111][k]); if (!r) continue;
      m.track(r); r.persistent = true; r.driver = { isPed: true, look: randomLook() };
      r.ai = new BoatAI(r, 'race'); r.ai.path = path; r.ai.cruise = r.T.maxSpeed * [0.84, 0.88, 0.8][k]; r.ai.stopped = true; rivals.push(r);
    }
    for (const t of ['3', '2', '1']) { G.hud.countdown(t); G.audio.click(); yield* m.wait(1); }
    G.hud.countdown('LOS!'); for (const r of rivals) r.ai.stopped = false;
    yield* m.wait(0.6); G.hud.countdown(null);
    let place = 1;
    yield* waterCps(m, path, { vehicle: me, r: 14, text: (i, k) => `Regatta: Boje ${i + 1}/${k}`, passed: () => { place = 1 + rivals.filter((r) => r.ai.wp > path.findIndex((p) => p === path[Math.min(path.length - 1, r.ai.wp)])).length; } });
    const ahead = rivals.filter((r) => r.ai.finished).length;
    if (ahead > 0) { m.fail(`Platz ${ahead + 1} – nur der Sieger zählt.`); return; }
    void place;
    G.hud.bigToast('SIEG!', 'Die goldene Barracuda gehört dir');
  } });
add({ id: 'mb5', title: 'Die Yacht', sub: 'Marisol', contact: 'marisol', req: ['mb4'], label: '⚓', reward: 8000, rewardBoat: ['yacht', 0xf4f4f0], desc: 'Eine gestohlene Yacht vor Santa Cruz zurückholen.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Die „Solera Star“ – die schönste Yacht der Marina – wurde gekapert.'], ['Marisol', 'Sie ankert vor Santa Cruz, bewacht von zwei Schnellbooten. Hol sie zurück, und der Eigner lässt sie dir.']], n, n);
    yield* m.until(() => P().inCar && P().vehicle.T.boat || (m.objective('Steig in ein <b>Boot</b>.'), false));
    const [yx, yz] = seaPt(-1000, -440);
    const y = G.craft.spawnBoat('yacht', yx, yz, 1.2, 0xf4f4f0); m.track(y); y.persistent = true;
    m.failIf(() => !y.alive || y.sinking, 'Die Yacht ist gesunken.');
    const ymk = m.marker(0, 0, 0x19e6ff, { follow: y, arrow: true, blipCol: '#19e6ff' });
    yield* m.goTo(yx, yz, 'Fahr zur <b>Yacht</b> vor Santa Cruz.', { r: 90, car: true });
    const foes = [gangBoat(m, yx + 40, yz - 20), gangBoat(m, yx - 30, yz + 30)];
    m.objective('Versenke die <b>Wachboote</b> und entere die Yacht (F neben der Yacht).');
    yield* m.until(() => { for (const f of foes) if (!f.alive && f.mk) { m.removeMarker(f.mk); f.mk = null; } return P().vehicle === y; });
    m.removeMarker(ymk);
    const D = C.DOCKS[0], s = D.slips[3];
    yield* m.goTo(s[0], s[1], 'Bring die Yacht zur <b>Solera Marina</b>.', { r: 12, vehicle: y });
  } });
add({ id: 'mb6', title: 'Sturm über der Bucht', sub: 'Marisol', contact: 'marisol', req: ['mb5'], label: '⚓', reward: 6000, desc: 'Im Sturm drei Schwimmer aus dem Meer retten.',
  *run(m) {
    G.world.env.setRain(true, 260); G.timeOfDay = 19.5;
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Ein Unwetter! Drei Surfer wurden aufs Meer hinausgetrieben.'], ['Marisol', 'Hol sie raus und bring sie zum Strandsteg. Beeil dich – das Wasser ist eiskalt!']], n, n);
    yield* m.until(() => P().inCar && P().vehicle.T.boat || (m.objective('Steig in ein <b>Boot</b>.'), false));
    m.timerLeft = 240;
    for (const [x0, z0] of [[600, 200], [740, -150], [520, -380]]) {
      const [x, z] = seaPt(x0, z0);
      const mk = m.marker(x, z, 0x7cff6b, { r: 2.5, h: 2, y: C.WATER_Y, label: '🆘', blipCol: '#7cff6b' });
      m.objective('Rette den <b>Schwimmer</b> (langsam heranfahren).');
      yield* m.until(() => P().inCar && dist2(P().vehicle.x, P().vehicle.z, x, z) < 7 * 7 && P().vehicle.speed < 6);
      m.removeMarker(mk); G.audio.pickup(); G.hud.toast('🛟 Schwimmer an Bord!');
    }
    const D = C.DOCKS[1];
    yield* m.goTo(D.slips[1][0], D.slips[1][1], 'Bring alle zum <b>Strandsteg</b>.', { r: 9, car: true });
    m.timerLeft = null; G.hud.timer(null);
    G.world.env.setRain(false, 400);
  } });

// ---------------------------------------------------------------- PACO (Flugzeug)
const getPlane = function* (m) {
  const plane = G.craft.spawnPlane(false, 0xffd23f); m.track(plane);
  m.failIf(() => plane.removed || (!plane.alive && P().vehicle !== plane), 'Das Flugzeug ist abgestürzt.');
  const mk = m.marker(0, 0, 0x19e6ff, { follow: plane, arrow: true, blipCol: '#19e6ff' });
  m.objective('Steig in den <b>Albatros</b>.');
  yield* m.until(() => P().vehicle === plane);
  m.removeMarker(mk); m.objective('');
  return plane;
};
add({ id: 'pp1', title: 'Flugstunde', sub: 'Paco', contact: 'paco', req: [], label: '✈', reward: 3000, desc: 'Erster Flug durch sechs Ringe – und eine saubere Landung.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', '¡Hola! Paco Reyes, bester Pilot zwischen Sierra und Meer. Und einziger.'], ['Paco', 'Gas geben, ab 100 km/h hochziehen. A und D zum Kurven, S zum Sinken, Leertaste bremst.'], ['Paco', 'Flieg durch die Ringe und lande wieder hier. Kratzer zahlst du!']], n, n);
    const plane = yield* getPlane(m);
    const A = AIRFIELD, y0 = A.y;
    const pts = [[A.x1 + 200, y0 + 45, (A.z0 + A.z1) / 2], [A.x1 + 500, y0 + 80, A.z0 - 250], [A.x1 + 300, y0 + 110, A.z0 - 600], [A.x0 + 100, y0 + 120, A.z0 - 700], [A.x0 - 200, y0 + 90, A.z0 - 300], [A.x0 - 150, y0 + 60, (A.z0 + A.z1) / 2]].map(([x, y, z]) => [x, Math.max(y, hillHeight(x, z) + 45), z, 24]);
    yield* airRings(m, pts, { text: (i, k) => `Flugstunde: Ring ${i + 1}/${k}` });
    yield* landPlane(m, plane);
    G.hud.toast('✈️ Paco: „Butterweich! Fast.“');
  } });
add({ id: 'pp2', title: 'Luftpost', sub: 'Paco', contact: 'paco', req: ['pp1'], label: '✈', reward: 5000, desc: 'Postsäcke über drei Orten abwerfen.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Die Post nach Santa Cruz, Valverde und Pinar Alto liegt hier rum. Die Straßen sind zu langsam.'], ['Paco', 'Flieg tief über die Orte – unter 120 Meter – und der Sack fällt von allein.']], n, n);
    const plane = yield* getPlane(m);
    for (const key of ['santacruz', 'valverde', 'pinar']) {
      const t = T(key);
      const mk = m.marker(t.cx, t.cz, 0xd4a017, { r: 8, h: 30, label: '✉', blipCol: '#d4a017' });
      m.objective(`Wirf die Post über <b>${t.name}</b> ab (tief überfliegen).`);
      yield* m.until(() => P().vehicle === plane && dist2(plane.x, plane.z, t.cx, t.cz) < 90 * 90 && plane.y - t.y < 120);
      m.removeMarker(mk); G.audio.pickup(); G.hud.toast(`✉️ Post für ${t.name} abgeworfen!`);
    }
    yield* landPlane(m, plane);
  } });
add({ id: 'pp3', title: 'Unter den Brücken', sub: 'Paco', contact: 'paco', req: ['pp2'], label: '✈', reward: 7000, desc: 'Unter drei Talbrücken hindurchfliegen.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Die neuen Talbrücken! Wunderschön. Und darunter ist genug Platz für einen Albatros.'], ['Paco', 'Okay, „genug“ ist relativ. Flieg unter drei davon durch. Ich schau weg.']], n, n);
    const plane = yield* getPlane(m);
    const bs = bridges().slice(0, 3);
    yield* airRings(m, bs.map((b) => [b.x, b.y, b.z, b.r, b.face]), { text: (i, k) => `Flieg unter der <b>Brücke ${i + 1}/${k}</b> durch` });
    yield* landPlane(m, plane);
  } });
add({ id: 'pp4', title: 'Fluchtflug', sub: 'Paco', contact: 'paco', req: ['pp3'], label: '✈', reward: 9000, desc: 'Die Cuervos überfallen das Flugfeld – flieh mit dem Albatros.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Leo, Ärger! Die Cuervos wollen meinen Hangar. Und mich gleich mit.'], ['Paco', 'Starte den Albatros und häng die Polizei ab, die die Typen gerufen haben!']], n, n);
    const A = AIRFIELD;
    const g = m.gang(A.x0 + 120, A.z0 - 20, 6, { gun: true, hp: 55, col: 0x111111 });
    const plane = yield* getPlane(m);
    m.objective('Starte und gewinne <b>150 m Höhe</b>.');
    yield* m.until(() => !plane.grounded && plane.y - hillHeight(plane.x, plane.z) > 150);
    for (const p of g) if (p.mk) { m.removeMarker(p.mk); p.mk = null; }
    G.police.setLevel(3); G.police.spotted();
    m.objective('Häng den <b>Polizeihubschrauber</b> ab.');
    yield* m.until(() => G.police.level === 0);
    yield* landPlane(m, plane);
  } });
add({ id: 'pp5', title: 'Rundflug für Touristen', sub: 'Paco', contact: 'paco', req: ['pp4'], label: '✈', reward: 8000, desc: 'Fünf Sehenswürdigkeiten aus der Luft – in sieben Minuten.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Touristen aus dem Norden! Sie wollen alles sehen: Riesenrad, Casino, Villa, Mirador, Valverde.'], ['Paco', 'Sieben Minuten, dann wird ihnen schlecht. Los!']], n, n);
    const plane = yield* getPlane(m);
    const V = T('valverde'), B = T('bahia');
    const pts = [[300, Math.max(V.y + 90, hillHeight(300, -1900) + 70), -1900, 30], [LOOKOUT.x, LOOKOUT.y + 70, LOOKOUT.z, 30], [MANSION.x, MANSION.y + 80, MANSION.z, 30], [1555, B.y + 110, -700, 30], [632, 95, 40, 30]];
    m.timerLeft = 420;
    yield* airRings(m, pts, { text: (i, k) => `Sehenswürdigkeit ${i + 1}/${k}` });
    m.timerLeft = null; G.hud.timer(null);
    yield* landPlane(m, plane);
  } });
add({ id: 'pp6', title: 'Freier Fall', sub: 'Paco', contact: 'paco', req: ['pp5'], label: '✈', reward: 10000, rewardPlane: ['albatros', 0x1d3557], desc: 'Fallschirmsprung über Port Solera – Landung am Sunset Pier.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Letzte Prüfung. Steig auf 300 Meter über Port Solera – und spring.'], ['Paco', 'Lande am Sunset Pier. Danach schenk ich dir einen eigenen Albatros. Versprochen.']], n, n);
    const plane = yield* getPlane(m);
    m.failIf(() => false, '');
    m.fails = [];
    m.objective('Flieg über <b>Port Solera</b> auf über <b>300 m</b> Höhe.');
    yield* m.until(() => P().vehicle === plane && Math.abs(plane.x - 100) < 450 && Math.abs(plane.z) < 420 && plane.y > 300);
    m.objective('Spring ab! (F / AUS) – der Fallschirm öffnet sich automatisch.');
    yield* m.until(() => !P().inCar);
    const tx = 620, tz = 40;
    const mk = m.marker(tx, tz, 0xffd23f, { r: 6, blipCol: '#ffd23f' });
    m.objective('Lande am <b>Sunset Pier</b>.');
    yield* m.until(() => (P().onGround && !P().parachute) || P().state === 'swim');
    m.removeMarker(mk);
    if (dist2(P().x, P().z, tx, tz) > 90 * 90) { m.fail('Daneben gelandet.'); return; }
    G.hud.bigToast('PUNKTLANDUNG', 'Ein eigener Albatros wartet am Flugfeld');
  } });

// ---------------------------------------------------------------- LUNA (Casino)
add({ id: 'lu1', title: 'Willkommen im Gran Casino', sub: 'Luna', contact: 'luna', req: [], label: '♠', reward: 1000, desc: 'Luna spendiert Chips – probier ein Spiel.',
  *run(m) {
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Willkommen im Gran Casino. Ich bin Luna Ferrer, mir gehört der Laden.'], ['Luna', 'Hier sind 500 Dollar – auf Kosten des Hauses. Spiel eine Runde, egal was.']], n, n);
    P().addMoney(500, '🎰 Startguthaben vom Casino');
    const start = m.casinoPlays || 0;
    m.objective('Spiel eine Runde an einem <b>Automaten, Roulette, Blackjack</b> oder am <b>Glücksrad</b>.');
    yield* m.until(() => (m.casinoPlays || 0) > start);
    yield* m.wait(1.5);
    G.hud.toast('♠ Luna: „Na also. Du hast das Zeug zum Stammgast.“');
  } });
add({ id: 'lu2', title: 'Falschspieler', sub: 'Luna', contact: 'luna', req: ['lu1'], label: '♠', reward: 2500, desc: 'Einen Kartenzähler stellen, bevor er abhaut.',
  *run(m) {
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Der Typ im gelben Hemd zählt Karten. Ich will ihn nicht verhaften – nur meinen Gewinn zurück.'], ['Luna', 'Draußen wartet er auf ein Taxi. Schnapp ihn dir.']], n, n);
    if (G.interior) G.interiors.exit();
    const p = P(), loops = G.world.townLoops.bahia;
    const thief = m.npc(p.x + 6, p.z + 6, { ...LOOKS3.gang(0xffd23f) });
    const route = [...pick(loops), ...pick(loops), ...pick(loops)];
    thief.state = 'goto'; thief.gotoSpeed = 5.6; let k = 0;
    const nextPt = (q) => { k++; q.tx = route[k % route.length][0]; q.tz = route[k % route.length][1]; q.state = 'goto'; q.onArrive = nextPt; };
    thief.tx = route[0][0]; thief.tz = route[0][1]; thief.onArrive = nextPt; thief.health = 70;
    const mk = m.marker(0, 0, 0xff3b5c, { follow: thief, arrow: true, blipCol: '#ff3b5c' });
    m.objective('Schnapp den <b>Kartenzähler</b>!');
    m.failIf(() => thief.alive && dist2(thief.x, thief.z, p.x, p.z) > 220 * 220, 'Er ist entkommen.');
    yield* m.until(() => !thief.alive || thief.health < 70 || thief.state === 'knock');
    m.removeMarker(mk); m.fails = [];
    const bx = thief.x, bz = thief.z;
    if (thief.alive) { thief.state = 'flee'; thief.fleeFrom = p; thief.timer = 20; }
    const bag = m.marker(bx, bz + 1, 0x7cff6b, { r: 1.1, label: '$', blipCol: '#7cff6b' });
    m.objective('Nimm die <b>Chips</b> an dich.');
    yield* m.until(() => dist2(p.x, p.z, bx, bz + 1) < 2.5 * 2.5);
    m.removeMarker(bag); G.audio.cash();
  } });
add({ id: 'lu3', title: 'Geldtransport', sub: 'Luna', contact: 'luna', req: ['lu2'], label: '♠', reward: 6000, desc: 'Die Tageseinnahmen zur Solera Bank bringen.',
  *run(m) {
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Die Tageseinnahmen müssen zur Solera Bank in Downtown. Der Transporter steht vor der Tür.'], ['Luna', 'Gerüchten zufolge warten die Cuervos irgendwo an der Küstenstraße. Lass dich nicht aufhalten.']], n, n);
    if (G.interior) G.interiors.exit();
    const d = G.world.entrances.find((e) => e.id === 'casino');
    const van = provideCar(m, 'hauler', [d.x + 12, d.z + 10], 0x111111, Math.PI / 2);
    van.health = van.maxHealth = 3000;
    m.failIf(() => !van.alive || van.sinking, 'Der Geldtransporter wurde zerstört.');
    yield* enterIt(m, van, 'Steig in den <b>Geldtransporter</b>.');
    m.objective('Bring das Geld zur <b>Solera Bank</b>.');
    let spawned = false;
    const bank = { x: 10, z: 34 };
    const mk = m.marker(bank.x, bank.z, 0x19e6ff, { r: 5, blipCol: '#19e6ff' });
    const foes = [];
    yield* m.until(() => {
      if (!spawned && van.x < 1000) { spawned = true; for (let k = 0; k < 3; k++) { const c2 = chaser(m, 'brutus', van.x - 160 - k * 30, -545, 0x111111); if (c2) foes.push(c2); } G.hud.toast('🚗 Die Cuervos greifen an!'); }
      for (const f of foes) if (carDown(f) && f.mk) { m.removeMarker(f.mk); f.mk = null; }
      return P().vehicle === van && dist2(van.x, van.z, bank.x, bank.z) < 7 * 7 && van.speed < 4;
    });
    m.removeMarker(mk);
  } });
add({ id: 'lu4', title: 'Offene Rechnungen', sub: 'Luna', contact: 'luna', req: ['lu3'], label: '♠', reward: 5000, desc: 'Drei Spieler mit Schulden besuchen.',
  *run(m) {
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Drei Stammgäste schulden mir zusammen 30.000. In Santa Cruz, Lago Verde und San Lúcar.'], ['Luna', 'Ich will keine Gewalt. Aber ich will mein Geld.']], n, n);
    if (G.interior) G.interiors.exit();
    const order = ['santacruz', 'lagoverde', 'sanlucar'], runner = Math.floor(rand(0, 3));
    for (let i = 0; i < 3; i++) {
      const t = T(order[i]), [x, z] = side(order[i], 1, 1);
      yield* m.goTo(x, z, `Besuch den Schuldner in <b>${t.name}</b>.`, { r: 6 });
      const d = m.npc(x + 2, z + 2, randomLook());
      if (i === runner) {
        yield* m.talk([['Leo', 'Luna schickt mich.'], ['Schuldner', 'Luna?! Nie gehört!']], { x, z }, d);
        d.state = 'flee'; d.fleeFrom = P(); d.timer = 60; d.health = 60;
        const mk = m.marker(0, 0, 0xff3b5c, { follow: d, arrow: true, blipCol: '#ff3b5c' });
        m.objective('Hol dir das Geld vom <b>flüchtenden Schuldner</b>!');
        yield* m.until(() => !d.alive || d.health < 60 || d.state === 'knock');
        m.removeMarker(mk);
      } else yield* m.talk([['Leo', 'Luna schickt mich. 10.000.'], ['Schuldner', 'Ja, ja … hier. Sag ihr, es tut mir leid.']], { x, z }, d);
      G.audio.cash(); G.hud.toast(`💵 Schulden eingetrieben (${i + 1}/3)`);
    }
  } });
add({ id: 'lu5', title: 'Belagerung', sub: 'Luna', contact: 'luna', req: ['lu4'], label: '♠', reward: 8000, desc: 'Die Cuervos stürmen das Casino – verteidige den Eingang.',
  *run(m) {
    G.timeOfDay = 22;
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Sie kommen. Die Cuervos wollen das Casino – heute Nacht.'], ['Luna', 'Meine Wachleute sind überfordert. Halte den Eingang, Leo!']], n, n);
    P().giveWeapon('rifle', 180); P().armor = 100;
    if (G.interior) G.interiors.exit();
    const d = G.world.entrances.find((e) => e.id === 'casino');
    G.police.locked = true;
    yield* waves(m, d.x, d.z + 10, [5, 7, 9], { label: 'Cuervos', col: 0x111111, dist: 40 });
    G.police.locked = false;
  } });
add({ id: 'lu6', title: 'Jackpot', sub: 'Luna', contact: 'luna', req: ['lu5'], label: '♠', reward: 12000, rewardCar: ['zephyra', 0xd4a017], desc: 'Gewinne 3.000 Dollar netto an den Tischen.',
  *run(m) {
    const n = yield* meet(m, this, 'luna');
    yield* m.talk([['Luna', 'Du hast mein Casino gerettet. Jetzt will ich sehen, ob du auch Glück hast.'], ['Luna', 'Gewinn 3.000 Dollar netto – dann gehört dir mein goldener Zephyra.']], n, n);
    const start = m.casinoNet || 0;
    yield* m.until(() => { const net = (m.casinoNet || 0) - start; m.objective(`Casino-Gewinn: <b>${net >= 0 ? '+' : ''}$${Math.round(net).toLocaleString('de-DE')}</b> / $3.000`); return net >= 3000; });
    G.hud.bigToast('JACKPOT', 'Der goldene Zephyra steht in deiner Garage');
  } });

// ---------------------------------------------------------------- ORTIZ (Bürgermeister)
add({ id: 'or1', title: 'Wahlplakate', sub: 'Ortiz', contact: 'ortiz', req: [], label: 'O', reward: 3000, desc: 'Wahlplakate in vier Orten aufhängen.',
  *run(m) {
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Ah, der junge Mann aus der Stadt! Ortiz, Bürgermeister von Valverde – und hoffentlich bald von ganz Solera County.'], ['Ortiz', 'Meine Plakate müssen in Lago Verde, Pinar Alto, Santa Cruz und San Lúcar hängen. Heute noch!']], n, n);
    yield* m.getInCar();
    let L = 0, px = pos().x, pz = pos().z;
    const stops = ['lagoverde', 'pinar', 'santacruz', 'sanlucar'].map((k) => [k, ...side(k, 1, 1)]);
    for (const [, x, z] of stops) { L += routeLen(px, pz, x, z); px = x; pz = z; }
    m.timerLeft = Math.round(L / 21 + 90);
    for (let i = 0; i < stops.length; i++) {
      const [k, x, z] = stops[i];
      yield* m.goTo(x, z, `Plakat ${i + 1}/4: <b>${T(k).name}</b>`, { r: 8, stop: true, color: 0xe9d8a6 });
      G.audio.pickup(); G.hud.toast(`🗳️ Plakat in ${T(k).name} hängt!`);
    }
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'or2', title: 'Brückensperre', sub: 'Ortiz', contact: 'ortiz', req: ['or1'], label: 'O', reward: 4000, desc: 'Eine Gang blockiert die neue Talbrücke.',
  *run(m) {
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Eine Bande hat die neue Talbrücke gesperrt und verlangt Maut. Maut! Auf MEINER Brücke!'], ['Ortiz', 'Räum sie weg. Diskret, wenn möglich.']], n, n);
    const b = bridges().find((q) => q.name === 'Talstraße') || bridges()[0];
    const R = HILL_ROADS.find((q) => q.name === b.name), i = R.pts.findIndex((p) => Math.hypot(p[0] - b.x, p[1] - b.z) < 3);
    const [bx, bz] = R.pts[Math.max(0, i)];
    yield* m.goTo(bx, bz, 'Fahr zur gesperrten <b>Talbrücke</b>.', { r: 60 });
    m.spawnCar('atlas', bx + 3, bz, 1.57, 0x111111); m.spawnCar('coyote', bx - 3, bz + 4, 1.2, 0x2b2b2b);
    G.police.locked = true;
    const g = m.gang(bx, bz, 7, { gun: true, hp: 60, col: 0x6b4423, aggro: 80 });
    m.objective('Schalte die <b>Brückenbande</b> aus.');
    yield* m.until(() => m.aliveGang(g) === 0);
    G.police.locked = false;
  } });
add({ id: 'or3', title: 'Krankentransport', sub: 'Ortiz', contact: 'ortiz', req: ['or2'], label: 'O', reward: 4500, desc: 'Verletzte aus Pinar Alto schnell und sanft nach Valverde bringen.',
  *run(m) {
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Ein Felssturz in Pinar Alto! Zwei Verletzte müssen ins Ärztehaus nach Valverde.'], ['Ortiz', 'Nimm meinen Transporter. Schnell – aber ohne Unfall, sonst wird es schlimmer.']], n, n);
    const [vx, vz] = side('valverde', 2, 1, 6.6, 10);
    const van = provideCar(m, 'hauler', [vx, vz], 0xf8f9fa, 0);
    m.failIf(() => !van.alive, 'Der Transporter ist zerstört.');
    yield* enterIt(m, van, 'Steig in den <b>Krankentransporter</b>.');
    const [px, pz] = side('pinar', 1, 1);
    yield* m.goTo(px, pz, 'Fahr nach <b>Pinar Alto</b>.', { r: 8, vehicle: van, stop: true });
    G.audio.door(); G.hud.toast('🚑 Verletzte an Bord – fahr vorsichtig!');
    const hp0 = van.health;
    m.failIf(() => van.health < hp0 - 450, 'Zu viele Unfälle – den Verletzten geht es schlechter.');
    m.timerLeft = Math.round(routeLen(px, pz, vx, vz) / 17 + 40);
    yield* m.goTo(vx, vz, 'Bring die Verletzten ins <b>Ärztehaus Valverde</b>.', { r: 7, vehicle: van, stop: true, color: 0xff4d6d });
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'or4', title: 'Beweismittel', sub: 'Ortiz', contact: 'ortiz', req: ['or3'], label: 'O', reward: 6000, desc: 'Akten des Gegenkandidaten aus Santa Cruz holen.',
  *run(m) {
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Mein Gegenkandidat Salgado lässt sich von den Cuervos bezahlen. Ich habe Beweise – fast.'], ['Ortiz', 'Die Akten liegen in seiner Strandwohnung in Santa Cruz. Hol sie, bevor er sie verbrennt.']], n, n);
    const door = G.world.entrances.find((e) => e.id === 'sc_house');
    yield* m.goTo(door.x, door.z, 'Geh in <b>Salgados Wohnung</b> in Santa Cruz.', { r: 1.6, foot: true });
    yield* m.until(() => G.interior && G.interior.kind === 'house');
    const R = G.interiors.rooms.house;
    const fx = R.cx + 4, fz = R.cz - 3;
    const mk = m.marker(fx, fz, 0xe9d8a6, { r: 0.9, label: '📁', blipCol: '#e9d8a6' });
    m.objective('Nimm die <b>Akten</b>.');
    yield* m.until(() => dist2(P().x, P().z, fx, fz) < 1.4 * 1.4);
    m.removeMarker(mk); G.audio.pickup();
    m.objective('Verlass die Wohnung.');
    yield* m.until(() => !G.interior);
    const foes = [chaser(m, 'brutus', door.x + 80, door.z - 60, 0x111111), chaser(m, 'atlas', door.x - 90, door.z - 40, 0x111111)].filter(Boolean);
    G.hud.toast('🚗 Salgados Leute sind hinter dir her!');
    const [hx, hz] = [G.world.pois.g_ortiz.x, G.world.pois.g_ortiz.z];
    yield* m.goTo(hx, hz, 'Bring die Akten zu <b>Ortiz</b> nach Valverde.', { r: 4 });
    for (const f of foes) if (f.mk) m.removeMarker(f.mk);
  } });
add({ id: 'or5', title: 'Wahlnacht', sub: 'Ortiz', contact: 'ortiz', req: ['or4'], label: 'O', reward: 8000, desc: 'Das Rathaus in der Wahlnacht verteidigen.',
  *run(m) {
    G.timeOfDay = 22.5;
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Die Stimmen werden ausgezählt. Und Salgados Schläger wollen die Urnen.'], ['Ortiz', 'Halte sie vom Rathaus fern, bis die Auszählung fertig ist!']], n, n);
    P().giveWeapon('shotgun', 48); P().armor = 100;
    const h = G.world.pois.g_ortiz;
    G.police.locked = true;
    yield* waves(m, h.x, h.z, [5, 6, 8], { label: 'Salgados Schläger', col: 0x6b4423, dist: 45 });
    G.police.locked = false;
    G.hud.bigToast('ORTIZ GEWINNT', 'Neuer Bürgermeister von Solera County');
  } });
add({ id: 'or6', title: 'Die Einweihung', sub: 'Ortiz', contact: 'ortiz', req: ['or5'], label: 'O', reward: 10000, rewardCar: ['atlas', 0xf1faee], desc: 'Den Bürgermeister sicher zur Einweihung nach Lago Verde eskortieren.',
  *run(m) {
    const n = yield* meet(m, this, 'ortiz');
    yield* m.talk([['Ortiz', 'Heute weihe ich die Seestraße in Lago Verde ein. Salgado hat Rache geschworen.'], ['Ortiz', 'Folge meinem Wagen und halte mir die Cuervos vom Hals.']], n, n);
    yield* m.getInCar();
    const [sx, sz] = side('valverde', 3, 2, 6.6, 6.6);
    const car = netCar(m, 'atlas', sx, sz, 0xf1faee, 13, { keep: false });
    car.health = car.maxHealth = 4500; car.mass *= 2; car.driver = { isPed: true, look: LOOKS3.ortiz(), persistent: true };
    const lv = T('lagoverde');
    const route = G.world.gpsPath(car.x, car.z, lv.cx, lv.cz) || [];
    const mk = m.marker(0, 0, 0x7cff6b, { follow: car, arrow: true, blipCol: '#7cff6b' });
    m.objective('Folge dem <b>Wagen des Bürgermeisters</b> und beschütze ihn.');
    m.failIf(() => !car.alive || car.onFire, 'Der Bürgermeister wurde getroffen.');
    m.failIf(() => dist2(car.x, car.z, pos().x, pos().z) > 260 * 260, 'Du hast den Bürgermeister aus den Augen verloren.');
    // Wagen fährt per Verfolgung über die GPS-Route
    let k = 0, attacked = false; const foes = [];
    yield* m.until(() => {
      const pt = route[Math.min(k, route.length - 1)]; if (!pt) return true;
      const x = pt.x ?? pt[0], z = pt.z ?? pt[1];
      if (Math.hypot(x - car.x, z - car.z) < 14 && k < route.length - 1) k++;
      car.ai.mode = 'chase'; car.ai.target = { x, z, vx: 0, vz: 0, y: 0, speed: 0, removed: false };
      if (!attacked && k > route.length * 0.3) { attacked = true; for (let q = 0; q < 2; q++) { const f = chaser(m, 'brutus', car.x + 120 + q * 30, car.z + 60, 0x111111); if (f) { f.ai.target = car; foes.push(f); } } G.hud.toast('⚠️ Angriff auf den Bürgermeister!'); }
      for (const f of foes) if (carDown(f) && f.mk) { m.removeMarker(f.mk); f.mk = null; }
      return dist2(car.x, car.z, lv.cx, lv.cz) < 40 * 40;
    });
    m.removeMarker(mk); car.ai.stopped = true;
    yield* m.talk([['Ortiz', 'Ich erkläre die Seestraße für eröffnet! Und dir, Leo, gehört mein Dienstwagen.']], { x: car.x, z: car.z }, null);
  } });

// ---------------------------------------------------------------- BENITO (Rancher)
add({ id: 'tb1', title: 'Viehdiebe', sub: 'Benito', contact: 'benito', req: [], label: 'B', reward: 2500, desc: 'Den Pick-up der Viehdiebe stoppen.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', '¡Muchacho! Die Kojoten haben drei meiner besten Kälber in einen Pick-up geladen!'], ['Benito', 'Sie fahren Richtung Passstraße. Halt sie auf!']], n, n);
    yield* m.getInCar();
    const r = T('ranchos');
    const v = netCar(m, 'coyote', r.cx, r.cz - 220, 0xbc6c25, 22, { missionTarget: true });
    v.health = v.maxHealth = 1400;
    const mk = m.marker(0, 0, 0xff3b5c, { follow: v, arrow: true, blipCol: '#ff3b5c' });
    m.objective('Stoppe den <b>Pick-up</b> der Viehdiebe!');
    m.failIf(() => !carDown(v) && dist2(v.x, v.z, pos().x, pos().z) > 600 * 600, 'Die Diebe sind entkommen.');
    yield* m.until(() => { if (v.alive && v.health < v.maxHealth * 0.4 && v.driver && v.driver.isPed) G.peds.ejectDriver(v); return carDown(v); });
    m.removeMarker(mk);
    G.hud.toast('🐄 Benito: „Meine Kälber! Gracias!“');
  } });
add({ id: 'tb2', title: 'Wüstenrallye', sub: 'Benito', contact: 'benito', req: ['tb1'], label: 'B', reward: 3500, desc: 'Mit dem Monster-Truck quer durch Tierra Seca.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', 'Jedes Jahr fahren die Jungs aus dem Dorf die Wüstenrallye. Dieses Jahr fährst du!'], ['Benito', 'Mein Brecher steht hinterm Haus. Keine Straßen, nur Staub!']], n, n);
    const r = T('ranchos');
    const car = provideCar(m, 'brecher', [r.cx - 20, r.cz + 30], 0xff5a1f, Math.PI);
    m.failIf(() => !car.alive, 'Der Brecher ist hinüber.');
    yield* enterIt(m, car, 'Steig in den <b>Brecher</b>.');
    const pts = [[-1380, -1060], [-1520, -1300], [-1450, -1560], [-1250, -1640], [-1050, -1500], [-1000, -1280], [r.cx + 60, r.cz + 20]];
    m.timerLeft = 200;
    yield* drivePts(m, pts, { text: (i, k) => `Wüstenrallye: Tor ${i + 1}/${k}`, r: 14, vehicle: car, bonus: 6 });
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'tb3', title: 'Wasser für die Höfe', sub: 'Benito', contact: 'benito', req: ['tb2'], label: 'B', reward: 4000, desc: 'Vier abgelegene Höfe mit Wasser versorgen.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', 'Die Brunnen sind trocken. Bring den Wassertank zu den Höfen im Umland.'], ['Benito', 'Vorsicht, der Tank schwappt – keine wilden Sprünge!']], n, n);
    const r = T('ranchos');
    const van = provideCar(m, 'hauler', [r.cx + 20, r.cz + 30], 0x4895ef, 0);
    m.failIf(() => !van.alive, 'Der Tankwagen ist zerstört.');
    yield* enterIt(m, van, 'Steig in den <b>Tankwagen</b>.');
    const farms = (G.world.ruralPos || []).slice().sort((a, b) => Math.hypot(a[0] - r.cx, a[1] - r.cz) - Math.hypot(b[0] - r.cx, b[1] - r.cz)).slice(0, 4);
    for (let i = 0; i < farms.length; i++) {
      const [x, z] = farms[i];
      yield* m.goTo(x, z, `Hof ${i + 1}/${farms.length}: <b>Wasser liefern</b>`, { r: 14, vehicle: van, stop: true, color: 0x4fc3ff });
      G.audio.pickup(); G.hud.toast(`💧 Hof ${i + 1} versorgt`);
    }
  } });
add({ id: 'tb4', title: 'Kojoten-Lager', sub: 'Benito', contact: 'benito', req: ['tb3'], label: 'B', reward: 6000, desc: 'Das Lager der Kojoten-Bande in Tierra Seca ausheben.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', 'Ich weiß jetzt, wo die Kojoten hausen: ein Lager in den Felsen von Tierra Seca.'], ['Benito', 'Hier, nimm mein altes Gewehr. Und komm heil zurück, muchacho.']], n, n);
    P().giveWeapon('rifle', 150); P().armor = 100;
    const cx = -1420, cz = -1700;
    yield* m.goTo(cx, cz, 'Fahr zum <b>Kojoten-Lager</b>.', { r: 80 });
    G.police.locked = true;
    const g = m.gang(cx, cz, 10, { gun: true, hp: 65, col: 0xbc6c25, aggro: 90 });
    m.objective('Schalte die <b>Kojoten</b> aus.');
    yield* m.until(() => m.aliveGang(g) === 0);
    G.police.locked = false;
  } });
add({ id: 'tb5', title: 'Stunt-Show', sub: 'Benito', contact: 'benito', req: ['tb4'], label: 'B', reward: 5000, desc: 'Drei große Sprünge mit dem Monster-Truck.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', 'Das Dorffest! Die Leute wollen fliegende Trucks sehen.'], ['Benito', 'Drei Sprünge, jeder mindestens eine Sekunde in der Luft. Die Hügel hier eignen sich perfekt.']], n, n);
    const r = T('ranchos');
    const car = provideCar(m, 'brecher', [r.cx - 20, r.cz + 30], 0x7b2cbf, Math.PI);
    m.failIf(() => !car.alive, 'Der Brecher ist hinüber.');
    yield* enterIt(m, car, 'Steig in den <b>Brecher</b>.');
    let jumps = 0, wasAir = false, air = 0;
    m.timerLeft = 180;
    yield* m.until(() => {
      if (!car.grounded) { wasAir = true; air += G.dt; }
      else if (wasAir) { if (air > 1.0) { jumps++; G.hud.bigToast(`SPRUNG ${jumps}/3`, `${air.toFixed(1)} s in der Luft`); G.audio.checkpoint(); } wasAir = false; air = 0; }
      m.objective(`Sprünge (≥ 1 s): <b>${jumps}/3</b>`);
      return jumps >= 3;
    });
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'tb6', title: 'Die alte Mine', sub: 'Benito', contact: 'benito', req: ['tb5'], label: 'B', reward: 15000, rewardCar: ['brecher', 0xffd60a], desc: 'Benitos Familienschatz am Mirador bergen.',
  *run(m) {
    const n = yield* meet(m, this, 'benito');
    yield* m.talk([['Benito', 'Mein Großvater hat Gold in der alten Mine am Mirador versteckt. Die Cuervos haben die Karte gestohlen.'], ['Benito', 'Sie sind schon unterwegs. Sei schneller – und bring die Kiste her!']], n, n);
    const L = LOOKOUT;
    yield* m.goTo(L.x, L.z, 'Fahr zum <b>Mirador</b> in der Sierra.', { r: 40 });
    const g = m.gang(L.x + 6, L.z + 4, 8, { gun: true, hp: 70, col: 0x111111, aggro: 90 });
    const cx = L.x - 8, cz = L.z - 6;
    const mk = m.marker(cx, cz, 0xd4a017, { r: 1.2, label: '💰', blipCol: '#d4a017' });
    m.objective('Hol die <b>Goldkiste</b> – die Cuervos sind schon da!');
    yield* m.until(() => { m.aliveGang(g); return P().state === 'foot' && dist2(P().x, P().z, cx, cz) < 2 * 2; });
    m.removeMarker(mk); G.audio.cash();
    const r = T('ranchos');
    for (let k = 0; k < 2; k++) chaser(m, 'atlas', L.x + 200 + k * 30, L.z + 300, 0x111111);
    yield* m.goTo(...side('ranchos', 1, 1), 'Bring das Gold zu <b>Benito</b> nach Los Ranchos.', { r: 5 });
    void r;
  } });


// ======================================================================
//  3.1 – neue Aufträge
// ======================================================================
const holdTime = (m, h) => m.failIf(() => { G.timeOfDay = h; return false; }, '');
function landingZone(m, x0, z0, x1, z1, plane, text) {
  const mk = m.marker((x0 + x1) / 2, (z0 + z1) / 2, 0xffd23f, { r: 8, h: 3, blipCol: '#ffd23f' });
  m.objective(text);
  return (function* () {
    yield* m.until(() => { if (Math.random() < 0.05) m.clearArea((x0 + x1) / 2, (z0 + z1) / 2, 220); return P().vehicle === plane && plane.grounded && plane.speed < 4 && plane.x > x0 && plane.x < x1 && plane.z > z0 && plane.z < z1; });
    m.removeMarker(mk); m.objective('');
  })();
}

// ---------------------------------------------------------------- Straßenhändler „Fuego“
add({ id: 'dz1', title: 'Grüne Ernte', sub: 'Fuego', contact: 'dealer', needContact: 'dealer', req: [], label: '$', reward: 1500, desc: 'Auf einer abgelegenen Finca ernten – und die Ware in der Stadt verkaufen.',
  *run(m) {
    const d = G.dealer && G.dealer.p && !G.dealer.p.removed ? G.dealer.p : m.npc(pos().x + 1.6, pos().z + 1.6, LOOKS3.gang(0x5a189a));
    yield* m.talk([['Fuego', 'Du kaufst öfter bei mir. Gefällt mir. Ich hätte da was Größeres.'], ['Fuego', 'Freunde von mir haben eine Finca. Tief in den Solera Hills, weit weg von allem – keine Nachbarn, keine Polizei.'], ['Fuego', 'Erntezeit. Hilf ihnen, bring die Ware in die Stadt und verteil sie an meine Kunden. Bezahlt wird in Munition. Viel Munition.']], d, d);
    yield* m.getInCar();
    const F = G.world.pois.finca;
    yield* m.goTo(F.x, F.z, 'Fahr zur <b>Finca Escondida</b> tief in den Solera Hills (Feldweg ab der Talstraße).', { r: 12 });
    const farmer = m.npc(F.x + 3, F.z + 2, { ...LOOKS3.benito(), shirt: c(0x3f7d2c), hat: c(0x6b4423) });
    yield* m.talk([['Bauer', 'Fuego schickt dich? Gut. Die Pflanzen sind reif – schneid sie, bevor der Regen kommt.'], ['Bauer', 'Hier oben hört dich keiner. Aber trödel nicht.']], { x: F.x, z: F.z }, farmer);
    const Fm = G.world.pois.fincaStrip, zc = Fm.z;
    const spots = [];
    for (let k = 0; k < 8; k++) spots.push([Fm.x + 20 + k * 30 + rand(-6, 6), zc + (k % 2 ? 22 : -22) + rand(-6, 6)]);
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const mk = m.marker(x, z, 0x7cff6b, { r: 1.2, label: '🌿', blipCol: '#7cff6b' });
      let t = 0;
      yield* m.until(() => {
        const inside = P().state === 'foot' && dist2(P().x, P().z, x, z) < 1.6 * 1.6;
        t = inside ? t + G.dt : Math.max(0, t - G.dt);
        m.objective(`Ernte die Pflanzen <b>${i + 1}/${spots.length}</b> ${inside ? '· ' + '▮'.repeat(Math.ceil(t / 0.3)) + '▯'.repeat(Math.max(0, 5 - Math.ceil(t / 0.3))) : '(zu Fuß in den Marker stellen)'}`);
        return t > 1.5;
      });
      m.removeMarker(mk); G.audio.pickup();
    }
    const van = provideCar(m, 'coyote', [F.x - 10, F.z + 8], 0x283618, Math.PI / 2);
    m.failIf(() => !van.alive || van.sinking, 'Der Pick-up mit der Ware ist hinüber.');
    yield* enterIt(m, van, 'Lade die Ernte in den <b>Pick-up</b> und steig ein.');
    const buyers = [[-252, 12], [148, 172], [-480, 210], [392, 82]];
    for (let i = 0; i < buyers.length; i++) {
      const [x, z] = buyers[i];
      yield* m.goTo(x, z, `Verkauf ${i + 1}/4: Fahr zum <b>Kunden</b> in der Stadt.`, { r: 6, vehicle: van, stop: true, color: 0xb26bff });
      const b = m.npc(x + 2.5, z + 2, randomLook());
      yield* m.talk([['Kunde', pick(['Fuego schickt dich? Perfekt.', 'Endlich! Hier, das Geld.', 'Schnell, bevor jemand guckt.'])]], { x, z }, b);
      const cash = 300 + Math.round(rand(0, 200));
      P().addMoney(cash, `💸 Verkauft ${i + 1}/4 · +$${cash}`);
      if (i === 2) { G.police.setLevel(2); G.police.spotted(); G.hud.toast('🚨 Ein Zivilfahnder hat dich beobachtet!'); m.objective('Häng die <b>Polizei</b> ab, bevor du weiterverkaufst.'); yield* m.until(() => G.police.level === 0); }
    }
    const p = P();
    p.giveWeapon('pistol', 150); p.giveWeapon('smg', 360); p.giveWeapon('shotgun', 64); p.giveWeapon('rifle', 240); p.giveWeapon('grenade', 6);
    G.hud.bigToast('MUNITION ERHALTEN', 'Pistole, MP, Schrotflinte, Gewehr & Granaten');
  } });
add({ id: 'dz2', title: 'Fracht für das Schiff', sub: 'Fuego', contact: 'dealer', needContact: 'dealer', req: ['dz1'], label: '$', reward: 6000, desc: 'Von der Finca mit dem Flugzeug zum Hafen – und die Ware aufs große Schiff bringen.',
  *run(m) {
    const d = G.dealer && G.dealer.p && !G.dealer.p.removed ? G.dealer.p : m.npc(pos().x + 1.6, pos().z + 1.6, LOOKS3.gang(0x5a189a));
    yield* m.talk([['Fuego', 'Die große Lieferung muss heute Nacht aufs Frachtschiff im Hafen.'], ['Fuego', 'Auf den Straßen stehen überall Kontrollen. Also fliegst du: Auf der Finca wartet ein Flieger auf der Piste.'], ['Fuego', 'Lande am Hafen auf der Kaistraße. Und Leo … die Cuervos wissen Bescheid. Sei bewaffnet.']], d, d);
    yield* m.getInCar();
    const S = G.world.pois.fincaStrip;
    yield* m.goTo(S.x, S.z, 'Fahr zur <b>Landepiste der Finca</b>.', { r: 14 });
    holdTime(m, 21.5);
    if (P().inCar) P().exitVehicle(true);
    const plane = m.spawnCar('albatros', S.x + 10, S.z, S.h, 0x111111); plane.y = S.y; plane.grounded = true;
    m.failIf(() => !plane.alive && P().vehicle !== plane && P().state !== 'foot', 'Das Flugzeug ist abgestürzt.');
    plane.mk = m.marker(0, 0, 0x19e6ff, { follow: plane, arrow: true, blipCol: '#19e6ff' });
    yield* enterIt(m, plane, 'Steig in den <b>Schmuggelflieger</b> und starte von der Piste.');
    m.objective('Flieg zum <b>Hafen</b> von Port Solera (Süden der Stadt).');
    const ring1 = ring(m, -200, 70, 300, 30, 0xff2e88, [-200, 70, 400]);
    yield* m.until(() => Math.hypot(plane.x + 200, plane.z - 300) < 140 && plane.y < 160);
    m.removeMarker(ring1);
    yield* landingZone(m, -330, 352, -40, 368, plane, 'Lande auf der <b>Kaistraße</b> am Hafen (gerade Strecke, langsam aufsetzen).');
    G.police.locked = true;
    m.fails = []; holdTime(m, 21.5);
    if (P().inCar) P().exitVehicle(true);
    const g = m.gang(-210, 392, 8, { gun: true, hp: 60, col: 0x111111, aggro: 90 });
    const g2 = m.gang(-120, 330, 6, { gun: true, hp: 60, col: 0x111111, aggro: 90 });
    yield* m.talk([['Cuervo', 'Da ist er! Holt euch die Ware!']], { x: -200, z: 380 }, null);
    const gw = m.marker(-210, 381, 0xb26bff, { r: 1.4, label: '📦', blipCol: '#b26bff' });
    m.objective('Bring die Ware zur <b>Gangway</b> des Frachtschiffs – die Cuervos greifen an!');
    yield* m.until(() => { m.aliveGang(g); m.aliveGang(g2); return P().state === 'foot' && dist2(P().x, P().z, -210, 381) < 2.2 * 2.2; });
    m.removeMarker(gw); G.audio.pickup(); G.hud.toast('📦 Ware an Bord!');
    m.objective('Schalte die restlichen <b>Cuervos</b> aus.');
    yield* m.until(() => m.aliveGang(g) + m.aliveGang(g2) === 0);
    G.police.locked = false;
    P().giveWeapon('rifle', 240); P().giveWeapon('grenade', 8); P().giveWeapon('sniper', 30);
    G.hud.bigToast('LIEFERUNG ERFOLGREICH', 'Fuego legt noch Munition & ein Scharfschützengewehr drauf');
  } });

// ---------------------------------------------------------------- Paco: Häuserschlucht
add({ id: 'pp7', title: 'Häuserschlucht', sub: 'Paco', contact: 'paco', req: ['pp6'], label: '✈', reward: 9000, desc: 'Im Tiefflug zwischen den Wolkenkratzern von Downtown hindurch.',
  *run(m) {
    const n = yield* meet(m, this, 'paco');
    yield* m.talk([['Paco', 'Ein Werbespot für den Albatros! Die Kamera hängt auf dem Bank-Tower.'], ['Paco', 'Du fliegst zweimal durch die Häuserschluchten von Downtown – unter den Dächern, zwischen den Türmen. Nicht kratzen!']], n, n);
    const plane = yield* getPlane(m);
    const pts = [[40, 90, -420, 30], [40, 40, -200, 13], [40, 36, -80, 12], [40, 36, 40, 12], [40, 38, 160, 13], [40, 70, 470, 30], [-120, 80, 520, 30], [-120, 42, 200, 13], [-120, 38, 80, 12], [-120, 38, -40, 12], [-120, 42, -160, 13], [10, 170, 26, 26]];
    yield* airRings(m, pts, { text: (i, k) => `Häuserschlucht: Ring ${i + 1}/${k}` });
    G.hud.bigToast('IM KASTEN!', 'Paco: „Das wird der beste Werbespot aller Zeiten!“');
  } });

// ---------------------------------------------------------------- Val: Staatsfeind
add({ id: 'vk1', title: 'Staatsfeind', sub: 'Val', contact: 'val', req: ['m4'], label: 'V', reward: 15000, desc: '30 Polizisten ausschalten, ohne die Fahndungssterne zu verlieren.',
  *run(m) {
    const n = yield* meet(m, this, 'val');
    yield* m.talk([['Val', 'Die Bullen haben gestern den Club auseinandergenommen. Vor meinen Gästen.'], ['Val', 'Ich will, dass die ganze Stadt sieht, wer hier das Sagen hat. Dreißig von denen. Und lass dich nicht abhängen – die sollen kommen.']], n, n);
    if (G.interior) G.interiors.exit();
    const p = P(); p.giveWeapon('rifle', 300); p.giveWeapon('grenade', 6); p.armor = 100;
    const base = G.stats.copsKilled || 0;
    G.police.setLevel(2); G.police.spotted();
    m.failIf(() => G.police.level === 0, 'Du hast die Fahndungssterne verloren.');
    yield* m.until(() => { const k = (G.stats.copsKilled || 0) - base; m.objective(`Polizisten ausgeschaltet: <b>${k}/30</b> · Sterne nicht verlieren!`); return k >= 30; });
    m.fails = [];
    m.objective('Geschafft! Jetzt <b>häng die Polizei ab</b>.');
    yield* m.until(() => G.police.level === 0);
  } });

// ---------------------------------------------------------------- Marisol: neue Bootsaufträge
add({ id: 'mb7', title: 'Bootsklau', sub: 'Marisol', contact: 'marisol', req: ['mb2'], label: '⚓', reward: 3500, desc: 'Ein Rennboot von einem Angeber entern und zum Yachthafen bringen.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Ein Typ fährt mit einem gestohlenen Rennboot vor der Küste herum – angeblich gehört es einem Freund von mir.'], ['Marisol', 'Fahr ran, spring rüber (F neben dem Boot) und bring es zum neuen Yachthafen Südwest.']], n, n);
    yield* m.until(() => P().inCar && P().vehicle.T.boat || (m.objective('Steig in ein <b>Boot</b> oder schwimm hinaus.'), false));
    const [x, z] = seaPt(300, 500);
    const t = G.craft.spawnBoat('speeder', x, z, 0, 0xff2e88); m.track(t); t.persistent = true;
    t.driver = { isPed: true, look: randomLook(true) }; t.ai = new BoatAI(t, 'cruise'); t.ai.wp = 6; t.ai.cruise = 9;
    m.failIf(() => !t.alive || t.sinking, 'Das Boot ist gesunken.');
    const mk = m.marker(0, 0, 0xff3b5c, { follow: t, arrow: true, blipCol: '#ff3b5c' });
    m.objective('Fahr zum <b>pinken Rennboot</b> und entere es (F).');
    yield* m.until(() => P().vehicle === t);
    m.removeMarker(mk);
    const D = C.DOCKS.find((q) => q.key === 'suedwest'), s = D.slips[0];
    yield* m.goTo(s[0], s[1], 'Bring das Boot zum <b>Yachthafen Südwest</b>.', { r: 9, vehicle: t });
  } });
add({ id: 'mb8', title: 'Wassertaxi', sub: 'Marisol', contact: 'marisol', req: ['mb7'], label: '⚓', reward: 4500, desc: 'Fahrgäste von drei Stegen zur Marina bringen.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Die Fähre ist kaputt und an drei Stegen warten Leute. Du bist heute das Wassertaxi!']], n, n);
    yield* m.until(() => P().inCar && P().vehicle.T.boat || (m.objective('Steig in ein <b>Boot</b>.'), false));
    m.timerLeft = 300;
    for (const key of ['strand', 'altstadt', 'suedwest']) {
      const D = C.DOCKS.find((q) => q.key === key), s = D.slips[0];
      const ped = m.npc(D.rects[0][0] + 2, (D.rects[0][1] + D.rects[0][3]) / 2, randomLook(true));
      yield* m.goTo(s[0], s[1], `Hol den Fahrgast am <b>${D.name}</b> ab.`, { r: 10, stop: true, color: 0x7cff6b });
      G.peds.remove(ped); G.audio.door(); G.hud.toast('🧍 Fahrgast an Bord');
      const M0 = C.DOCKS[0].slips[2];
      yield* m.goTo(M0[0], M0[1], 'Bring ihn zur <b>Solera Marina</b>.', { r: 10, stop: true });
      P().addMoney(150, '⛴️ Fahrgeld +$150');
    }
    m.timerLeft = null; G.hud.timer(null);
  } });
add({ id: 'mb9', title: 'Hetzjagd auf See', sub: 'Marisol', contact: 'marisol', req: ['mb8'], label: '⚓', reward: 7000, desc: 'Mit drei Sternen auf dem Wasser zwei Minuten überleben.',
  *run(m) {
    const n = yield* meet(m, this, 'marisol');
    yield* m.talk([['Marisol', 'Die Küstenwache will mir den Hafen dichtmachen. Ich brauche Ablenkung.'], ['Marisol', 'Mach sie auf dich aufmerksam und halt sie zwei Minuten auf dem Wasser beschäftigt. Dann bist du raus.']], n, n);
    yield* m.until(() => P().inCar && P().vehicle.T.boat || (m.objective('Steig in ein <b>Boot</b>.'), false));
    G.police.setLevel(3); G.police.spotted();
    m.timerLeft = 120;
    m.failIf(() => !P().inCar || !P().vehicle.T.boat, 'Du hast das Wasser verlassen.');
    m.objective('Bleib auf dem Wasser und überlebe die <b>Küstenwache</b>!');
    yield* m.until(() => { if (G.police.level < 2) { G.police.setLevel(3); G.police.spotted(); } return m.timerLeft < 0.5; });
    m.fails = []; m.timerLeft = null; G.hud.timer(null);
    m.objective('Jetzt <b>abhängen</b>!');
    yield* m.until(() => G.police.level === 0);
  } });

export const MISSIONS3 = MS;
