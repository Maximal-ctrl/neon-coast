// Auto-Tuning in Dex' Werkstatt: Lack, Lackart, Felgen, Motor, Turbo, Bremsen, Fahrwerk,
// Panzerung, Neon, Spoiler, Scheibentönung, Nitro – mit Live-Vorschau am eigenen Auto
import * as THREE from 'three';
import { G } from './state.js';
import { CAR_TYPES, CAR_SHOP, CAR_MATS } from './models.js';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('de-DE');
const hexs = (c) => '#' + c.toString(16).padStart(6, '0');

const COLORS = [0xe63946, 0xff7b00, 0xffb703, 0xf1e05a, 0x7cff6b, 0x2a9d8f, 0x00b4d8, 0x1d4ed8, 0x5a189a, 0xf72585, 0xff8fab, 0xf8f9fa, 0x8d99ae, 0x3a3f44, 0x111111, 0x6b4423];
export const TUNE = {
  paint: { name: 'Lackierung', icon: '🎨', opts: COLORS.map((c) => ({ v: c, name: hexs(c), price: 500, color: c })) },
  finish: { name: 'Lackart', icon: '✨', opts: [{ v: 'gloss', name: 'Glanz', price: 0 }, { v: 'matte', name: 'Matt', price: 900 }, { v: 'pearl', name: 'Perleffekt', price: 1800 }, { v: 'chrome', name: 'Chrom', price: 6000 }] },
  rims: { name: 'Felgen', icon: '🛞', opts: [{ v: null, name: 'Serie', price: 0 }, { v: 0x2a2a2a, name: 'Schwarz', price: 800, color: 0x2a2a2a }, { v: 0xd4a017, name: 'Gold', price: 1200, color: 0xd4a017 }, { v: 0xff2e88, name: 'Pink', price: 800, color: 0xff2e88 }, { v: 0x19e6ff, name: 'Türkis', price: 800, color: 0x19e6ff }, { v: 0xe63946, name: 'Rot', price: 800, color: 0xe63946 }] },
  engine: { name: 'Motor', icon: '⚙️', opts: [{ v: 0, name: 'Serie', price: 0 }, { v: 1, name: 'Stufe 1', price: 2500 }, { v: 2, name: 'Stufe 2', price: 6000 }, { v: 3, name: 'Rennmotor', price: 12000 }] },
  turbo: { name: 'Turbo', icon: '🌀', opts: [{ v: 0, name: 'Ohne', price: 0 }, { v: 1, name: 'Turbolader', price: 9000 }] },
  brakes: { name: 'Bremsen', icon: '🛑', opts: [{ v: 0, name: 'Serie', price: 0 }, { v: 1, name: 'Sport', price: 1500 }, { v: 2, name: 'Rennsport', price: 4000 }] },
  susp: { name: 'Fahrwerk', icon: '⬇️', opts: [{ v: 0, name: 'Serie', price: 0 }, { v: 1, name: 'Tiefer', price: 2000 }, { v: 2, name: 'Extra tief', price: 5000 }] },
  armor: { name: 'Panzerung', icon: '🛡️', opts: [{ v: 0, name: 'Ohne', price: 0 }, { v: 1, name: '+25 %', price: 3000 }, { v: 2, name: '+50 %', price: 8000 }, { v: 3, name: '+100 %', price: 15000 }] },
  neon: { name: 'Unterboden-Neon', icon: '💡', opts: [{ v: null, name: 'Aus', price: 0 }, ...[[0xff2e88, 'Pink'], [0x19e6ff, 'Türkis'], [0x7cff6b, 'Grün'], [0xb26bff, 'Lila'], [0xffd60a, 'Gelb'], [0xff3b30, 'Rot']].map(([c, n]) => ({ v: c, name: n, price: 2500, color: c }))] },
  spoiler: { name: 'Spoiler', icon: '🪽', opts: [{ v: 0, name: 'Ohne', price: 0 }, { v: 1, name: 'Abrisskante', price: 1500 }, { v: 2, name: 'Heckflügel', price: 3500 }] },
  tint: { name: 'Scheiben', icon: '🕶️', opts: [{ v: 0, name: 'Klar', price: 0 }, { v: 1, name: 'Getönt', price: 400 }, { v: 2, name: 'Limousine', price: 900 }] },
  nitro: { name: 'Nitro', icon: '🔥', opts: [{ v: 0, name: 'Ohne', price: 0 }, { v: 1, name: 'Nitro-Einspritzung', price: 7000 }] },
};
const CATS = Object.keys(TUNE);

// ------------------------------------------------------------ Materialien
const paintCache = new Map();
function tunedPaint(hex, finish) {
  const k = hex + '_' + finish;
  let m = paintCache.get(k);
  if (m) return m;
  const o = { color: hex, envMapIntensity: 1.45 };
  if (finish === 'matte') Object.assign(o, { metalness: 0.15, roughness: 0.78, clearcoat: 0, envMapIntensity: 0.6 });
  else if (finish === 'pearl') Object.assign(o, { metalness: 0.85, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.6, iridescenceIOR: 1.6 });
  else if (finish === 'chrome') Object.assign(o, { color: new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.55), metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.2 });
  else Object.assign(o, { metalness: 0.5, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.07 });
  m = new THREE.MeshPhysicalMaterial(o);
  paintCache.set(k, m);
  return m;
}
const tintMats = [null, new THREE.MeshStandardMaterial({ color: 0x05080c, metalness: 0.7, roughness: 0.05, transparent: true, opacity: 0.86 }), new THREE.MeshStandardMaterial({ color: 0x010203, metalness: 0.75, roughness: 0.04, transparent: true, opacity: 0.96 })];
const wingMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.45, metalness: 0.4 });

// ------------------------------------------------------------ Anwenden
export function applyTune(v, t = {}) {
  const base = CAR_TYPES[v.key];
  if (v.baseColor == null) v.baseColor = v.color;
  v.tune = { ...t };
  const eng = [1, 1.1, 1.2, 1.32][t.engine || 0] * (t.turbo ? 1.15 : 1);
  const top = [1, 1.04, 1.08, 1.12][t.engine || 0] * (t.turbo ? 1.05 : 1);
  v.T = { ...base, accel: base.accel * eng, maxSpeed: base.maxSpeed * top, brake: base.brake * [1, 1.2, 1.4][t.brakes || 0], grip: base.grip * [1, 1.06, 1.12][t.susp || 0] };
  const frac = v.maxHealth ? v.health / v.maxHealth : 1;
  v.maxHealth = base.hp * [1, 1.25, 1.5, 2][t.armor || 0]; v.health = v.maxHealth * frac; v.mass = base.mass * (1 + (t.armor || 0) * 0.08);
  if (v.alive && !base.tank) {
    const m = tunedPaint(t.paint ?? v.baseColor, t.finish || 'gloss');
    v.parts.body.material = m; if (v.parts.doorMesh) v.parts.doorMesh.material = m;
    v.color = t.paint ?? v.baseColor;
  }
  // Fahrwerk: Karosserie tiefer
  const drop = [0, 0.05, 0.1][t.susp || 0];
  for (const c of v.group.children) { if (c === v._neon || c === v._spoiler) continue; if (c.userData.y0 === undefined) c.userData.y0 = c.position.y; c.position.y = c.userData.y0 - drop; }
  v.rimCol = t.rims ?? null;
  // Neon
  if (t.neon != null) {
    if (!v._neon) {
      const g = new THREE.PlaneGeometry(v.T.W + 0.9, v.T.L + 0.6).rotateX(-Math.PI / 2);
      v._neon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: G.world.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }));
      v._neon.renderOrder = 2; v._neon.position.y = 0.05; v.group.add(v._neon);
    }
    v._neon.material.color.setHex(t.neon); v._neon.visible = true;
  } else if (v._neon) v._neon.visible = false;
  // Spoiler
  if (v._spoiler) { v.group.remove(v._spoiler); v._spoiler = null; }
  if (t.spoiler) {
    const L = v.T.L, W = v.T.W, y = (v.geo.belt || 0.95) - drop, gp = new THREE.Group();
    if (t.spoiler === 1) { const lip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.05, 0.22), v.parts.body.material); lip.position.set(0, y + 0.04, -L / 2 + 0.2); lip.rotation.x = -0.25; gp.add(lip); }
    else {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.05, 0.42), wingMat); wing.position.set(0, y + 0.42, -L / 2 + 0.25); wing.rotation.x = -0.12; gp.add(wing);
      for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.14), wingMat); st.position.set(s * W * 0.3, y + 0.2, -L / 2 + 0.28); gp.add(st); const ep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.5), wingMat); ep.position.set(s * W * 0.46, y + 0.45, -L / 2 + 0.25); gp.add(ep); }
    }
    gp.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    v._spoiler = gp; v.group.add(gp);
  }
  // Scheiben
  if (!v._glass) v.group.traverse((o) => { if (o.isMesh && (o.material === CAR_MATS.glass)) v._glass = o; });
  if (v._glass) v._glass.material = tintMats[t.tint || 0] || CAR_MATS.glass;
  v.nitro = t.nitro ? (v.nitro || { charge: 1 }) : null;
}

// Nitro während der Fahrt (Shift / Touch-Taste NITRO)
export function nitroUpdate(v, I, dt) {
  const n = v.nitro;
  document.body.classList.toggle('has-nitro', !!n);
  if (!n) return;
  const want = (I.held('sprint') || I.held('nitro')) && v.input.throttle > 0.1 && v.alive;
  if (want && n.charge > 0.02) {
    n.charge -= dt / 5;
    const fx = Math.sin(v.h), fz = Math.cos(v.h);
    if (v.fwdSpeed < v.T.maxSpeed * 1.45) { v.vx += fx * 21 * dt; v.vz += fz * 21 * dt; }
    if (!n.on) { G.cam.shake(0.25); if (G.audio.whoosh) G.audio.whoosh(); }
    n.on = true;
    const ex = v.x - fx * (v.hl + 0.2), ez = v.z - fz * (v.hl + 0.2);
    for (let k = 0; k < 2; k++) G.effects.add.emit(ex + Math.cos(v.h) * (k ? 0.35 : -0.35), v.y + 0.35, ez - Math.sin(v.h) * (k ? 0.35 : -0.35), -fx * 6, 0.2, -fz * 6, 0.12, 0.55, 0.35, 0.55, 1.0, 1, 0, -2, 0);
  } else { n.on = false; n.charge = Math.min(1, n.charge + dt / 14); }
  const el = $('nitro-bar'); if (el) el.style.setProperty('--n', n.charge.toFixed(2));
}

// ------------------------------------------------------------ Werkstatt-Oberfläche
export function openTuning(v) {
  const P = G.player;
  if (!v || !v.alive || v.T.boat || v.T.plane) return;
  v.vx = v.vz = 0; v.input.throttle = 0;
  const entry = P.garage.find((g) => g.id === v.garageId);
  let bought = { ...(v.tune || {}) }, preview = { ...bought }, cat = 'paint', first = true;
  const repairCost = Math.round((1 - v.health / v.maxHealth) * 2500);
  const keepCost = Math.round(Math.max(1500, (CAR_SHOP[v.key] ? CAR_SHOP[v.key].price : 10000) * 0.15));
  const val = (c) => (bought[c] === undefined ? TUNE[c].opts[0].v : bought[c]);
  const render = () => {
    const D = TUNE[cat];
    const optHTML = D.opts.map((o, i) => {
      const cur = val(cat) === o.v, sel = (preview[cat] === undefined ? TUNE[cat].opts[0].v : preview[cat]) === o.v;
      const sw = o.color != null ? `<i class="tu-sw" style="--c:${hexs(o.color)}"></i>` : '';
      return `<button class="dl-car tu-opt ${sel ? 'on' : ''}" data-o="${i}">${sw}<div><b>${cat === 'paint' ? 'Farbton ' + (i + 1) : o.name}</b><span>${cur ? 'Eingebaut' : ''}</span></div><em>${o.price ? money(o.price) : '—'}</em>${cur ? '<i>✓</i>' : ''}</button>`;
    }).join('');
    const T = v.T;
    const sel = D.opts.find((o) => o.v === (preview[cat] === undefined ? D.opts[0].v : preview[cat])) || D.opts[0];
    const owned = val(cat) === sel.v;
    $('ui-layer').innerHTML = `<div class="dl tu ${first ? 'anim' : ''}">
      <div class="dl-hint"><b>${CAR_TYPES[v.key].name}</b><span>Dex' Werkstatt · Tuning</span></div>
      <div class="dl-panel" style="--a:#ffb703">
        <header class="dl-h"><div><b>DEX'</b> WERKSTATT<span>Tuning · Lack · Leistung</span></div><div class="st-money" id="tu-money">${money(P.money)}</div><button class="st-x" data-x>✕</button></header>
        <nav class="st-tabs tu-tabs">${CATS.map((c) => `<button class="${c === cat ? 'on' : ''}" data-cat="${c}">${TUNE[c].icon} ${TUNE[c].name}</button>`).join('')}</nav>
        <div class="dl-list ${cat === 'paint' || cat === 'neon' || cat === 'rims' ? 'tu-grid' : ''}">${optHTML}</div>
        <div class="dl-detail">
          <div class="dl-stats">
            <div><span>Höchstgeschw.</span><i><s style="width:${Math.min(100, T.maxSpeed / 0.9)}%"></s></i><b>${Math.round(T.maxSpeed * 3.6)} km/h</b></div>
            <div><span>Beschleunigung</span><i><s style="width:${Math.min(100, T.accel / 0.25)}%"></s></i><b>${(100 / 3.6 / T.accel * 1.5).toFixed(1)} s</b></div>
            <div><span>Bremsen</span><i><s style="width:${Math.min(100, T.brake / 0.45)}%"></s></i><b>${Math.round(T.brake)}</b></div>
            <div><span>Panzerung</span><i><s style="width:${Math.min(100, v.maxHealth / 30)}%"></s></i><b>${Math.round(v.maxHealth)}</b></div>
          </div>
          <div class="tu-extra">
            ${repairCost > 50 ? `<button class="st-sec" data-act="repair">🔧 Reparieren · ${money(repairCost)}</button>` : ''}
            ${!entry && !v.ownedByPlayer ? `<button class="st-sec" data-act="keep">🏠 In Garage aufnehmen · ${money(keepCost)}</button>` : ''}
          </div>
          <div class="dl-buyrow"><div><span>${TUNE[cat].name}</span><b>${owned ? 'Eingebaut' : money(sel.price)}</b></div><button class="st-buy" id="tu-buy" ${owned ? 'disabled' : ''}>${owned ? '✓' : P.money >= sel.price ? 'Einbauen' : 'Zu teuer'}</button></div>
        </div>
      </div></div>`;
    first = false;
  };
  if (!G.ui.open('', 'ui-dealer')) return;
  G.audio.click();
  let a = 0.9;
  G.menuCam = (dt) => {
    a += dt * 0.2;
    const cam = G.camera;
    cam.position.set(v.x + Math.sin(a) * 7.5, v.y + 2.1, v.z + Math.cos(a) * 7.5);
    const rx = Math.cos(a), rz = -Math.sin(a);
    cam.lookAt(v.x + rx * 2.2, v.y + 0.7, v.z + rz * 2.2);
    cam.fov = 50; cam.updateProjectionMatrix();
  };
  const finish = () => { applyTune(v, bought); if (entry) { entry.tune = { ...bought }; entry.color = v.color; } };
  G.ui.setOnClose(() => { finish(); G.cam.snap(); });
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { G.ui.close(); return; }
    if (t.dataset.cat) { cat = t.dataset.cat; preview = { ...bought }; applyTune(v, preview); render(); G.audio.click(); return; }
    if (t.dataset.o) { const o = TUNE[cat].opts[+t.dataset.o]; preview = { ...bought, [cat]: o.v }; applyTune(v, preview); render(); G.audio.click(); return; }
    if (t.dataset.act === 'repair') { if (P.money < repairCost) return; P.addMoney(-repairCost); G.audio.cash(); v.health = v.maxHealth; v.onFire = false; render(); return; }
    if (t.dataset.act === 'keep') {
      if (P.money < keepCost) return;
      P.addMoney(-keepCost); G.audio.cash();
      const c = { key: v.key, color: v.color, id: Date.now(), tune: { ...bought } };
      P.garage.push(c); v.garageId = c.id; v.ownedByPlayer = true;
      G.hud.toast('🏠 Auto in deine Garage aufgenommen (Handy → Garage).');
      G.ui.close(); return;
    }
    if (t.id === 'tu-buy') {
      const o = TUNE[cat].opts.find((x) => x.v === (preview[cat] === undefined ? TUNE[cat].opts[0].v : preview[cat]));
      if (!o || P.money < o.price) { t.classList.add('shake'); return; }
      P.addMoney(-o.price); G.audio.cash();
      bought = { ...bought, [cat]: o.v };
      if (cat === 'nitro' && o.v) G.hud.toast('🔥 Nitro: beim Fahren Shift halten (Touch: NITRO-Taste).');
      finish();
      G.stats.tuned = (G.stats.tuned || 0) + 1;
      render();
    }
  };
}
