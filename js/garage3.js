// Tiefgarage: mit dem Auto befahrbar (Unterschlupf in der Stadt & Anwesen auf dem Gipfel).
// Alle eigenen Autos aus der Garage stehen auf Stellplätzen bereit.
import * as THREE from 'three';
import { G } from './state.js';
import { Marker } from './missions.js';
import { CAR_TYPES } from './models.js';
import { MANSION } from './terrain.js';
import { GeoBuilder, rgb } from './geo.js';
import { applyTune } from './tuning.js';

const CX = 1500, CZ = 2200, W = 46, D = 30, H = 4.4;
const BAYS = []; // [x, z, h]
for (let k = 0; k < 7; k++) { BAYS.push([CX - 18 + k * 6, CZ - 11, 0]); BAYS.push([CX - 18 + k * 6, CZ + 11, Math.PI]); }

export function buildGarage(I) {
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#6f7073'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.04)`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 6); return t;
  })();
  const R = I.room('garage3', CX, CZ, W, D, H, {
    floor: new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0.05 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x8c8e91, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xa9abae, emissive: 0x111214, roughness: 0.9 }),
  });
  R.name = 'Tiefgarage'; R.spawn = { x: CX + 20, z: CZ, yaw: -Math.PI / 2 };
  R.lightCfg = [CX, 3.6, CZ, 0xe8f0ff, 55];
  const yel = rgb(0xf2c230), wh = rgb(0xeeeeea), conc = rgb(0x9a9b9e), stripe = rgb(0x222222);
  I.furnish(R, (B, col) => {
    // Stellplatzlinien & Nummern-Hintergründe
    for (const [x, z] of BAYS) { for (const s of [-1, 1]) B.box(x + s * 2.95 - 0.06, 0.012, z - 2.8, x + s * 2.95 + 0.06, 0.02, z + 2.8, { col: wh }); B.box(x - 1.2, 1.6, z + (z < CZ ? -3.98 : 3.94), x + 1.2, 2.3, z + (z < CZ ? -3.94 : 3.98), { col: rgb(0x1d4e89) }); }
    // Fahrgasse mit Pfeilen
    for (let k = 0; k < 8; k++) { const x = CX - 20 + k * 5.5; B.box(x, 0.012, CZ - 0.12, x + 2.6, 0.02, CZ + 0.12, { col: yel }); }
    // Pfeiler mit Warnstreifen
    for (let k = 0; k < 6; k++) for (const z of [CZ - 6.6, CZ + 6.6]) {
      const x = CX - 15 + k * 6;
      B.box(x - 0.35, 0, z - 0.35, x + 0.35, H, z + 0.35, { col: conc });
      for (let s = 0; s < 4; s++) B.box(x - 0.36, 0.1 + s * 0.3, z - 0.36, x + 0.36, 0.25 + s * 0.3, z + 0.36, { col: s % 2 ? yel : stripe });
      col(x - 0.35, z - 0.35, x + 0.35, z + 0.35, H);
    }
    // Rampe / Tor am Ostende, Aufzug am Westende
    B.box(CX + W / 2 - 0.2, 0, CZ - 4, CX + W / 2, 3.6, CZ + 4, { col: rgb(0x3a3d42) });
    for (let k = 0; k < 8; k++) B.box(CX + W / 2 - 0.25, 0.3 + k * 0.42, CZ - 3.8, CX + W / 2 - 0.2, 0.42 + k * 0.42, CZ + 3.8, { col: rgb(0x55585e) });
    B.box(CX - W / 2, 0, CZ - 1.6, CX - W / 2 + 0.2, 2.6, CZ + 1.6, { col: rgb(0xb8bcc2) });
    B.box(CX - W / 2 + 0.15, 1.2, CZ + 1.8, CX - W / 2 + 0.25, 1.5, CZ + 2.1, { col: rgb(0x19e6ff) });
    // Rohre an der Decke
    for (const z of [CZ - 13, CZ + 13]) B.box(CX - W / 2, H - 0.4, z - 0.12, CX + W / 2, H - 0.16, z + 0.12, { col: rgb(0xc9302c) });
  });
  // Leuchtstoffröhren
  const tubes = new GeoBuilder(true);
  for (let k = 0; k < 7; k++) for (const z of [CZ - 9, CZ, CZ + 9]) tubes.box(CX - 18 + k * 6 - 1.2, H - 0.12, z - 0.08, CX - 18 + k * 6 + 1.2, H - 0.05, z + 0.08, { col: [2.4, 2.5, 2.7] });
  R.g.add(new THREE.Mesh(tubes.build(), new THREE.MeshBasicMaterial({ vertexColors: true })));
  I.textPlane(R, 'P · TIEFGARAGE', '#19e6ff', CX, 3.2, CZ - D / 2 + 0.1, 0, 5);
  R.exit = new Marker(CX - W / 2 + 1.6, CZ, 0x7cff6b, { label: 'X', r: 1.0 });
  R.drive = new Marker(CX + W / 2 - 3, CZ, 0x4fc3ff, { label: '⬆', r: 2.4 });
  R.markers = [R.exit, R.drive];
  for (const m of R.markers) m.group.visible = false;
  I.ext = I.ext || {};
  const S = { cars: [], from: null };
  // Ausfahrt mit dem Auto
  I.ext.garage3 = (dt, R2, on) => {
    const P = G.player;
    R.drive.update(dt);
    if (P.inCar) {
      const v = P.vehicle, inside = Math.hypot(v.x - R.drive.x, v.z - R.drive.z) < 2.6;
      if (inside && !R.drive.latch) { R.drive.latch = true; leave(I, S, v); return; }
      if (!inside) R.drive.latch = false;
    }
  };
  I.garageState = S;
  return R;
}

function spawnBays(S, skip) {
  const P = G.player, list = P.garage.filter((c) => c.id !== skip).slice(0, BAYS.length);
  list.forEach((c, i) => {
    const [x, z, h] = BAYS[i];
    const v = G.vm.spawn(c.key, x, z, h, c.color);
    if (!v) return;
    v.parked = true; v.ownedByPlayer = true; v.persistent = true; v.garageId = c.id; v.inGarage = true;
    if (c.tune) applyTune(v, c.tune);
    S.cars.push(v);
  });
}

export function enterGarage(I, from) {
  const P = G.player, R = I.rooms.garage3, S = I.garageState;
  if (!R || G.interior) return;
  S.from = from;
  for (const c of S.cars) if (!c.removed && c !== G.player.vehicle) c.remove();
  S.cars = [];
  G.hud.fadeIn();
  R.g.visible = true; for (const m of R.markers) m.group.visible = true;
  G.interior = { kind: 'garage3', name: 'Tiefgarage', station: 3 };
  I.light.position.set(CX, 3.6, CZ); I.light.color.setHex(0xe8f0ff); I.light.intensity = 55;
  const v = P.inCar ? P.vehicle : null;
  if (v) { v.x = CX + 17; v.z = CZ; v.h = -Math.PI / 2; v.vx = v.vz = 0; v.y = 0; P.x = v.x; P.z = v.z; R.drive.latch = true; }
  else { P.x = R.exit.x + 2.5; P.z = R.exit.z; P.y = 0; P.yaw = Math.PI / 2; R.exit.latch = true; }
  spawnBays(S, v && v.garageId);
  G.cam.yaw = v ? v.h : P.yaw; G.cam.pitch = -0.2; G.cam.snap();
  G.hud.toast(S.cars.length ? `🅿️ Tiefgarage · ${S.cars.length} Auto(s) bereit` : '🅿️ Tiefgarage – kauf Autos bei Solera Motors, sie stehen dann hier.');
}

function leave(I, S, v) {
  const P = G.player, o = S.from || { x: 244, z: -128, h: 0 };
  for (const c of S.cars) if (c !== v && !c.removed) c.remove();
  S.cars = [];
  if (v) { v.inGarage = false; v.persistent = !!v.ownedByPlayer; }
  I.cleanup();
  G.hud.fadeIn();
  if (v) { v.x = o.x + Math.sin(o.h) * 6; v.z = o.z + Math.cos(o.h) * 6; v.h = o.h; v.y = G.world.groundHeight(v.x, v.z); v.vx = Math.sin(o.h) * 4; v.vz = Math.cos(o.h) * 4; P.x = v.x; P.z = v.z; }
  else { P.x = o.x; P.z = o.z; P.y = G.world.groundHeight(o.x, o.z); }
  G.cam.yaw = o.h; G.cam.pitch = -0.2; G.cam.snap();
  if (S.from && S.from.latchSpot) S.from.latchSpot.latch = true;
}

// Eingänge in der Welt (Auto oder zu Fuß)
export function setupGarageEntrances(A, I) {
  const sh = G.world.pois.safehouseCar || { x: 244, z: -136, h: 0 };
  const spots = [
    { x: sh.x + 8, z: sh.z + 8, h: 0, name: 'Tiefgarage Unterschlupf' },
    { x: MANSION.x + 14, z: MANSION.z + 26, h: Math.PI, name: 'Tiefgarage Anwesen', y: MANSION.y },
  ];
  // sichtbare Einfahrt: Betonrahmen, dunkle Rampe, P-Schild
  const conc = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.8 }), dark = new THREE.MeshBasicMaterial({ color: 0x050607 });
  const pc = document.createElement('canvas'); pc.width = pc.height = 128; const pg = pc.getContext('2d'); pg.fillStyle = '#1d4ed8'; pg.fillRect(0, 0, 128, 128); pg.fillStyle = '#fff'; pg.font = 'bold 100px Inter, sans-serif'; pg.textAlign = 'center'; pg.textBaseline = 'middle'; pg.fillText('P', 64, 70);
  const pTex = new THREE.CanvasTexture(pc); pTex.colorSpace = THREE.SRGBColorSpace;
  for (const s of spots) {
    const g = new THREE.Group(), y = s.y ?? G.world.groundHeight(s.x, s.z);
    g.position.set(s.x - Math.sin(s.h) * 5.5, y, s.z - Math.cos(s.h) * 5.5); g.rotation.y = s.h;
    const box = (w, h, d, x, yy, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, yy, z); b.castShadow = true; g.add(b); };
    box(0.6, 3.2, 1.2, -3.3, 1.6, 0, conc); box(0.6, 3.2, 1.2, 3.3, 1.6, 0, conc); box(7.2, 0.7, 1.2, 0, 3.55, 0, conc);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), dark); mouth.position.set(0, 1.6, -0.2); g.add(mouth);
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(6, 5).rotateX(-Math.PI / 2 + 0.25), dark); ramp.position.set(0, -0.5, -2.6); g.add(ramp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: pTex })); sign.position.set(0, 4.5, 0.62); g.add(sign);
    G.scene.add(g);
  }
  for (const s of spots) {
    const spot = A.add({ x: s.x, z: s.z, y: s.y, color: 0x4fc3ff, label: '🅿️', r: 2.2, anyMode: true, onEnter: () => enterGarage(I, { ...s, latchSpot: spot }) });
  }
  G.blipFns.push(() => spots.map((s) => ({ x: s.x, z: s.z, col: '#4fc3ff', label: 'P', r: 0.03, name: s.name })));
  // Beim Verlassen zu Fuß über den Aufzug: zurück zum Eingang
  const origExit = I.exit.bind(I);
  I.exit = function () {
    if (G.interior && G.interior.kind === 'garage3') { const S = I.garageState; leave(I, S, null); return; }
    origExit();
  };
  void CAR_TYPES;
}
