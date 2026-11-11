// GRAN CASINO BAHÍA – Innenraum und Spiele: Automaten (4 Designs), Roulette, Blackjack,
// Glücksrad und Pferdewetten. Oberflächen im Laden-Design (.st) mit Öffnungsanimation.
import * as THREE from 'three';
import { G } from './state.js';
import { Marker } from './missions.js';
import { randomLook } from './models.js';
import { GeoBuilder, rgb } from './geo.js';
import { rand } from './utils.js';

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('de-DE');
const CX = 1500, CZ = 2000, W = 46, D = 36, H = 7;

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------ Automaten-Designs
export const SLOT_THEMES = {
  lucky: { name: 'LUCKY SOLERA', sub: '★ SLOT DELUXE ★', col: 0xff2e88, c1: '#ff2e88', c2: '#8a1050', frame: '#ffd23f', bets: [5, 10, 25, 50, 100], syms: [['🍒', 30, 5], ['🍋', 24, 8], ['🍊', 20, 12], ['🔔', 12, 20], ['⭐', 8, 40], ['💎', 4, 100], ['7️⃣', 2, 250]] },
  gold: { name: 'GOLDRAUSCH', sub: '♛ HIGH ROLLER ♛', col: 0xd4a017, c1: '#f0c040', c2: '#6b4a05', frame: '#fff1b8', bets: [25, 50, 100, 250, 500], syms: [['🪙', 30, 5], ['💰', 24, 8], ['🔔', 18, 12], ['🏆', 12, 20], ['👑', 8, 45], ['💎', 4, 110], ['7️⃣', 2, 300]] },
  tropic: { name: 'TROPIC NIGHTS', sub: '~ ISLAND SPIN ~', col: 0x19e6c1, c1: '#19c6a6', c2: '#0b4f5c', frame: '#ff8fab', bets: [5, 10, 25, 50, 100], syms: [['🍍', 30, 5], ['🥥', 24, 8], ['🌺', 20, 12], ['🐠', 12, 20], ['🦜', 8, 40], ['🌴', 4, 100], ['🌞', 2, 250]] },
  galaxy: { name: 'GALAXY SPIN', sub: '✦ COSMIC JACKPOT ✦', col: 0x8a5cff, c1: '#7b4dff', c2: '#1a0d4a', frame: '#19e6ff', bets: [10, 25, 50, 100, 250], syms: [['🌙', 30, 5], ['⭐', 24, 8], ['🪐', 20, 12], ['☄️', 12, 20], ['👽', 8, 45], ['🚀', 4, 120], ['🌌', 1.5, 400]] },
};

// ------------------------------------------------------------ Innenraum
export function buildCasino(I) {
  const carpet = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#4a0d1a'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(212,160,23,.55)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64 + 32, y = j * 64 + 32; g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 22, y); g.lineTo(x, y + 22); g.lineTo(x - 22, y); g.closePath(); g.stroke(); g.fillStyle = 'rgba(255,90,60,.35)'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  }, true);
  carpet.repeat.set(10, 8);
  const R = I.room('casino', CX, CZ, W, D, H, {
    floor: new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.9 }),
    ceil: new THREE.MeshStandardMaterial({ color: 0x1a0c10, emissive: 0x120608, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x2a1218, emissive: 0x12070a, roughness: 0.6, metalness: 0.2 }),
  });
  R.name = 'Gran Casino'; R.spawn = { x: CX + 2.8, z: CZ + D / 2 - 5, yaw: Math.PI };
  R.lightCfg = [CX, 6, CZ, 0xffd6a0, 60];
  const gold = rgb(0xd4a017), dark = rgb(0x15080b), felt = rgb(0x1f6b3a), wood = rgb(0x4a2414), cream = rgb(0xf4ead2);
  const zones = [['lucky', CX - 15, CZ - 9], ['gold', CX - 15, CZ + 3], ['tropic', CX + 15, CZ - 9], ['galaxy', CX + 15, CZ + 3]];
  const screens = new GeoBuilder(true);
  I.furnish(R, (B, col) => {
    // Wandpaneele & Goldleisten
    for (const z of [CZ - D / 2 + 0.05, CZ + D / 2 - 0.05]) { B.box(CX - W / 2, 0, z - 0.05, CX + W / 2, 1.2, z + 0.05, { col: wood }); B.box(CX - W / 2, 1.2, z - 0.06, CX + W / 2, 1.3, z + 0.06, { col: gold }); B.box(CX - W / 2, H - 0.5, z - 0.06, CX + W / 2, H - 0.4, z + 0.06, { col: gold }); }
    for (const x of [CX - W / 2 + 0.05, CX + W / 2 - 0.05]) { B.box(x - 0.05, 0, CZ - D / 2, x + 0.05, 1.2, CZ + D / 2, { col: wood }); B.box(x - 0.06, 1.2, CZ - D / 2, x + 0.06, 1.3, CZ + D / 2, { col: gold }); }
    // Säulen
    for (const [x, z] of [[CX - 7, CZ - 7], [CX + 7, CZ - 7], [CX - 7, CZ + 7], [CX + 7, CZ + 7]]) { B.addGeometry(new THREE.CylinderGeometry(0.55, 0.65, H, 16), new THREE.Matrix4().makeTranslation(x, H / 2, z), cream); B.addGeometry(new THREE.CylinderGeometry(0.75, 0.75, 0.3, 16), new THREE.Matrix4().makeTranslation(x, H - 0.4, z), gold); B.addGeometry(new THREE.CylinderGeometry(0.75, 0.8, 0.3, 16), new THREE.Matrix4().makeTranslation(x, 0.15, z), gold); col(x - 0.7, z - 0.7, x + 0.7, z + 0.7, H); }
    // Automatenreihen (je Design 2 × 4 Geräte, Rücken an Rücken)
    for (const [key, zx, zz] of zones) {
      const T = SLOT_THEMES[key], c = rgb(T.col);
      for (const row of [-1, 1]) for (let k = 0; k < 4; k++) {
        const x = zx - 4.2 + k * 2.8, z = zz + row * 0.75;
        B.box(x - 0.6, 0, z - 0.4, x + 0.6, 1.95, z + 0.4, { col: dark });
        B.box(x - 0.62, 1.95, z - 0.42, x + 0.62, 2.35, z + 0.42, { col: c });
        B.box(x - 0.62, 0.95, z - 0.42, x + 0.62, 1.05, z + 0.42, { col: gold });
        const fz = z + row * 0.405;
        screens.box(x - 0.42, 1.15, fz - 0.01, x + 0.42, 1.8, fz + 0.01, { col: [0.9, 0.9, 1.0] });
        screens.box(x - 0.5, 2.0, fz - 0.012, x + 0.5, 2.3, fz + 0.012, { col: [1.6 * ((T.col >> 16) & 255) / 255 + 0.2, 1.6 * ((T.col >> 8) & 255) / 255 + 0.2, 1.6 * (T.col & 255) / 255 + 0.2] });
        B.addGeometry(new THREE.CylinderGeometry(0.25, 0.25, 0.65, 10), new THREE.Matrix4().makeTranslation(x, 0.33, z + row * 1.15), rgb(0x8a1020));
      }
      col(zx - 5, zz - 1.2, zx + 5, zz + 1.2, 2.4);
    }
    // Roulette-Tische (Mitte vorne/hinten)
    for (const z of [CZ - 10, CZ + 1]) {
      B.box(CX - 3.2, 0, z - 1.2, CX + 3.2, 0.85, z + 1.2, { col: wood });
      B.box(CX - 3.1, 0.85, z - 1.1, CX + 3.1, 0.9, z + 1.1, { col: felt });
      B.addGeometry(new THREE.CylinderGeometry(0.75, 0.85, 0.25, 24), new THREE.Matrix4().makeTranslation(CX - 2.1, 1.0, z), wood);
      B.addGeometry(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 24), new THREE.Matrix4().makeTranslation(CX - 2.1, 1.14, z), rgb(0x8a1020));
      B.addGeometry(new THREE.ConeGeometry(0.12, 0.25, 8), new THREE.Matrix4().makeTranslation(CX - 2.1, 1.28, z), gold);
      for (let k = 0; k < 12; k++) B.box(CX - 1.2 + k * 0.33, 0.91, z - 0.5, CX - 0.92 + k * 0.33, 0.92, z + 0.5, { col: k % 2 ? rgb(0xb3121f) : rgb(0x151515) });
      col(CX - 3.2, z - 1.2, CX + 3.2, z + 1.2, 1.0);
    }
    // Blackjack-Tische (halbrund)
    for (const [x, z] of [[CX - 6, CZ + 11], [CX + 6, CZ + 11]]) {
      B.addGeometry(new THREE.CylinderGeometry(1.8, 1.8, 0.85, 24, 1, false, Math.PI / 2, Math.PI), new THREE.Matrix4().makeTranslation(x, 0.42, z), wood);
      B.addGeometry(new THREE.CylinderGeometry(1.7, 1.7, 0.06, 24, 1, false, Math.PI / 2, Math.PI), new THREE.Matrix4().makeTranslation(x, 0.87, z), felt);
      col(x - 1.8, z - 0.1, x + 1.8, z + 1.8, 0.95);
    }
    // Kasse hinten links, Bar hinten rechts
    B.box(CX - 20, 0, CZ - D / 2 + 0.2, CX - 12, 1.2, CZ - D / 2 + 1.6, { col: wood }); B.box(CX - 20.05, 1.2, CZ - D / 2 + 0.15, CX - 11.95, 1.27, CZ - D / 2 + 1.65, { col: gold });
    B.box(CX - 20, 1.27, CZ - D / 2 + 1.5, CX - 12, 2.6, CZ - D / 2 + 1.56, { col: gold });
    col(CX - 20, CZ - D / 2 + 0.2, CX - 12, CZ - D / 2 + 1.6, 2.6);
    B.box(CX + 12, 0, CZ - D / 2 + 0.2, CX + 21, 1.1, CZ - D / 2 + 1.5, { col: dark }); B.box(CX + 11.95, 1.1, CZ - D / 2 + 0.15, CX + 21.05, 1.17, CZ - D / 2 + 1.55, { col: gold });
    for (let r = 0; r < 3; r++) for (let i = 0; i < 26; i++) B.addGeometry(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 6), new THREE.Matrix4().makeTranslation(CX + 12.3 + i * 0.33, 1.6 + r * 0.5, CZ - D / 2 + 0.12), rgb([0x2a9d8f, 0xd4a017, 0x8a1020, 0x9fd6ff][(i + r) % 4]));
    col(CX + 12, CZ - D / 2 + 0.2, CX + 21, CZ - D / 2 + 1.5, 1.2);
    // Bühne für das Glücksrad (Mitte hinten)
    B.box(CX - 4, 0, CZ - D / 2 + 0.2, CX + 4, 0.35, CZ - D / 2 + 3, { col: gold });
    // Sofas für die Pferderennen-Lounge (vorne rechts)
    for (let k = 0; k < 3; k++) { const x = CX + 13 + k * 2.6; B.box(x - 1, 0, CZ + 14.5, x + 1, 0.45, CZ + 15.4, { col: rgb(0x5a1020) }); B.box(x - 1, 0.45, CZ + 15.2, x + 1, 1.0, CZ + 15.5, { col: rgb(0x5a1020) }); }
    col(CX + 11.8, CZ + 14.5, CX + 20.4, CZ + 15.5, 1);
  });
  const sm = new THREE.Mesh(screens.build(), new THREE.MeshBasicMaterial({ vertexColors: true })); R.g.add(sm);
  // Glücksrad an der Rückwand
  const wheelTex = canvasTex(512, 512, (g) => {
    const n = 12, cols = ['#d62828', '#ffd23f', '#1d4ed8', '#7cff6b', '#ff8fab', '#19e6ff'];
    for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 250, (i / n) * 6.283, ((i + 1) / n) * 6.283); g.fill(); }
    g.fillStyle = '#d4a017'; g.beginPath(); g.arc(256, 256, 40, 0, 7); g.fill();
  });
  R.wheelMesh = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ map: wheelTex }));
  R.wheelMesh.position.set(CX, 3.6, CZ - D / 2 + 0.25); R.g.add(R.wheelMesh);
  // Pferderennen-Bildschirm
  const raceTex = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#0b3d1e'; g.fillRect(0, 0, w, h); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#145a2c' : '#0f4a24'; g.fillRect(0, 20 + i * 36, w, 34); g.font = '28px sans-serif'; g.fillText('🏇', 40 + i * 50, 46 + i * 36); } g.fillStyle = '#fff'; g.fillRect(470, 16, 4, 224); });
  const rs = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: raceTex })); rs.position.set(CX + 16, 3.6, CZ + D / 2 - 0.2); rs.rotation.y = Math.PI; R.g.add(rs);
  // Kronleuchter & Schilder
  for (const [x, z] of [[CX - 8, CZ], [CX + 8, CZ], [CX, CZ - 5], [CX, CZ + 7]]) I.lamp(R, x, H - 1.4, z, [2.6, 2.1, 1.3], 0.45);
  I.textPlane(R, 'GRAN CASINO', '#ffd23f', CX, H - 1.0, CZ + D / 2 - 0.1, Math.PI, 8);
  I.textPlane(R, 'KASSE', '#7cff6b', CX - 16, 3.2, CZ - D / 2 + 0.1, 0, 3);
  I.textPlane(R, 'BAR', '#19e6ff', CX + 16.5, 3.4, CZ - D / 2 + 0.1, 0, 2.6);
  for (const [key, zx, zz] of zones) I.textPlane(R, SLOT_THEMES[key].name, '#' + new THREE.Color(SLOT_THEMES[key].col).getHexString(), zx, 3.1, zz, 0, 4.2);
  // Marker
  const mk = (x, z, col, label) => new Marker(x, z, col, { label, r: 0.85 });
  R.exit = mk(CX, CZ + D / 2 - 1, 0x7cff6b, 'X');
  R.slotM = zones.map(([key, zx, zz]) => { const m = mk(zx, zz + 2.4, SLOT_THEMES[key].col, '🎰'); m.theme = key; return m; });
  R.roulM = [mk(CX + 1, CZ - 8.2, 0xd62828, '🎡'), mk(CX + 1, CZ + 2.8, 0xd62828, '🎡')];
  R.bjM = [mk(CX - 6, CZ + 13.6, 0x1f9d55, '🃏'), mk(CX + 6, CZ + 13.6, 0x1f9d55, '🃏')];
  R.wheelM = mk(CX, CZ - D / 2 + 4.4, 0xffd23f, '🎯');
  R.raceM = mk(CX + 16, CZ + 13.2, 0x7cff6b, '🏇');
  R.barM = mk(CX + 16.5, CZ - D / 2 + 2.6, 0x19e6ff, '🍸');
  R.cashM = mk(CX - 16, CZ - D / 2 + 2.6, 0x7cff6b, '$');
  R.markers = [R.exit, ...R.slotM, ...R.roulM, ...R.bjM, R.wheelM, R.raceM, R.barM, R.cashM];
  for (const m of R.markers) m.group.visible = false;
  R.resident = { id: 'croupier', x: CX - 1, z: CZ - 11.6, yaw: 0, look: () => ({ ...randomLook(), shirt: new THREE.Color(0xf4f1ea), sleeve: new THREE.Color(0x111111), pants: new THREE.Color(0x111111), legs: new THREE.Color(0x111111), hat: null }) };
  R.guests = [[CX - 13, CZ - 6.6, Math.PI, 'stand'], [CX - 16, CZ + 5.4, Math.PI, 'stand'], [CX + 13, CZ - 6.6, Math.PI, 'stand'], [CX + 17, CZ + 5.4, Math.PI, 'stand'],
    [CX + 2, CZ - 8.6, Math.PI, 'stand'], [CX - 1, CZ + 2.6, Math.PI, 'stand'], [CX - 6.5, CZ + 13.2, Math.PI, 'stand'], [CX + 6.2, CZ + 13.4, Math.PI, 'stand'],
    [CX - 16, CZ - D / 2 + 2.2, 0, 'guard'], [CX + 15, CZ - D / 2 + 2.2, Math.PI, 'stand'], [CX - 3, CZ + D / 2 - 2, Math.PI, 'guard'], [CX + 3, CZ + D / 2 - 2, Math.PI, 'guard']];
  I.ext = I.ext || {};
  I.ext.casino = (dt, R2, on) => {
    R.wheelMesh.rotation.z += dt * 0.25;
    for (const m of R.slotM) if (on(m, 1.0)) slots(m.theme);
    for (const m of R.roulM) if (on(m, 1.0)) roulette();
    for (const m of R.bjM) if (on(m, 1.0)) blackjack();
    if (on(R.wheelM, 1.0)) fortune();
    if (on(R.raceM, 1.0)) horses();
    if (on(R.barM, 1.0)) G.ui.bar();
    if (on(R.cashM, 1.0)) cashier();
  };
  return R;
}

// ------------------------------------------------------------ Gemeinsamer Rahmen
function frame(title, sub, logo, accent, inner, cls = '') {
  return `<div class="st anim cas ${cls}" style="--a:${accent}">
    <header class="st-h"><div class="st-logo">${logo}</div><div class="st-t"><b>${title}</b><span>${sub}</span></div>
      <div class="st-money" id="cas-money">${money(G.player.money)}</div><button class="st-x" data-x>✕</button></header>
    <div class="cas-body">${inner}</div></div>`;
}
const stats = () => (G.player.casinoStats = G.player.casinoStats || { won: 0, lost: 0, biggest: 0 });
function settle(stake, payout) {
  const P = G.player, S = stats();
  if (payout > 0) { P.addMoney(payout); if (payout > stake) G.audio.jingle(); }
  const net = payout - stake;
  if (net > 0) { S.won += net; S.biggest = Math.max(S.biggest, net); } else S.lost += -net;
  const el = $('cas-money'); if (el) el.textContent = money(P.money);
  if (G.missions.onCasino) G.missions.onCasino(net);
}
function take(n) { const P = G.player; if (P.money < n) return false; P.addMoney(-n); const el = $('cas-money'); if (el) el.textContent = money(P.money); return true; }
function chips(list, cur, attr = 'chip') { return `<div class="cas-chips">${list.map((c) => `<button data-${attr}="${c}" class="${c === cur ? 'on' : ''}">${c >= 1000 ? c / 1000 + 'k' : c}</button>`).join('')}</div>`; }
function rain(n) {
  const box = document.createElement('div'); box.className = 'sl-coins'; $('ui-layer').appendChild(box);
  for (let k = 0; k < n; k++) { const c = document.createElement('i'); c.textContent = Math.random() < 0.7 ? '🪙' : '💵'; c.style.left = Math.random() * 100 + '%'; c.style.animationDelay = Math.random() * 0.8 + 's'; c.style.fontSize = 18 + Math.random() * 22 + 'px'; box.appendChild(c); }
  setTimeout(() => box.remove(), 3200);
}

// ------------------------------------------------------------ Automaten
export function slots(themeKey = 'lucky') {
  const T = SLOT_THEMES[themeKey], SY = T.syms;
  const pickSym = () => { let r = Math.random() * SY.reduce((s, x) => s + x[1], 0); for (const s of SY) { if ((r -= s[1]) < 0) return s[0]; } return SY[0][0]; };
  let bet = T.bets[1], spinning = false;
  const Hh = 96;
  const reel = (i) => `<div class="sl-reel"><div class="sl-strip" id="sl-s${i}">${[SY[0][0], SY[6][0], SY[1][0]].map((s) => `<div>${s}</div>`).join('')}</div></div>`;
  const html = `<div class="sl" style="--c1:${T.c1};--c2:${T.c2};--fr:${T.frame}">
    <div class="sl-cab">
      <div class="sl-top"><div class="sl-bulbs">${'<i></i>'.repeat(14)}</div><b>${T.name}</b><span>${T.sub}</span></div>
      <div class="sl-window">${reel(0)}${reel(1)}${reel(2)}<div class="sl-line"></div></div>
      <div class="sl-msg" id="sl-msg">Viel Glück!</div>
      <div class="sl-row"><div class="sl-bets">${T.bets.map((b) => `<button data-bet="${b}" class="${b === bet ? 'on' : ''}">$${b}</button>`).join('')}</div></div>
      <div class="sl-row"><div class="sl-money" id="sl-money">${money(G.player.money)}</div><button class="sl-spin" id="sl-spin">DREHEN</button></div>
    </div>
    <div class="sl-lever" id="sl-lever"><i></i></div>
    <div class="sl-pay"><b>GEWINNE</b>${SY.slice().reverse().map(([s, , m]) => `<div><span>${s}${s}${s}</span><em>×${m}</em></div>`).join('')}<div><span>${SY[0][0]}${SY[0][0]} ·</span><em>×2</em></div><div><span>Paar</span><em>×1</em></div><button class="sl-close" data-x>Aufstehen</button></div>
  </div>`;
  if (!G.ui.open(html, 'ui-slots')) return;
  const finish = (r) => {
    spinning = false;
    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = SY.find((s) => s[0] === r[0])[2];
    else if (r.filter((s) => s === SY[0][0]).length === 2) mult = 2;
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1;
    const win = bet * mult, msg = $('sl-msg');
    settle(bet, win);
    if (win > 0) { msg.textContent = mult >= 20 ? `JACKPOT! +${money(win)}` : mult > 1 ? `GEWINN! +${money(win)}` : `Einsatz zurück: ${money(win)}`; msg.className = 'sl-msg win' + (mult >= 20 ? ' big' : ''); if (mult > 1) rain(Math.min(60, 8 + mult)); }
    else { msg.textContent = 'Leider nichts – nochmal?'; msg.className = 'sl-msg'; }
    $('sl-money').textContent = money(G.player.money);
  };
  const spin = () => {
    if (spinning) return;
    if (!take(bet)) { $('sl-msg').textContent = 'Nicht genug Geld!'; return; }
    $('sl-money').textContent = money(G.player.money);
    spinning = true;
    $('sl-lever').classList.remove('pull'); void $('sl-lever').offsetWidth; $('sl-lever').classList.add('pull');
    $('sl-msg').textContent = 'Die Walzen drehen …'; $('sl-msg').className = 'sl-msg';
    const res = [pickSym(), pickSym(), pickSym()];
    const tick = setInterval(() => G.audio.click(), 90);
    res.forEach((sym, i) => {
      const strip = $('sl-s' + i), n = 26 + i * 8, syms = [];
      for (let k = 0; k < n; k++) syms.push(pickSym());
      syms.push(sym, pickSym());
      strip.style.transition = 'none';
      strip.innerHTML = [pickSym()].concat(syms).map((s) => `<div>${s}</div>`).join('');
      strip.style.transform = 'translateY(0)'; strip.classList.add('blur'); void strip.offsetWidth;
      const dur = 1.3 + i * 0.55;
      strip.style.transition = `transform ${dur}s cubic-bezier(.15,.75,.25,1.04)`;
      strip.style.transform = `translateY(${-n * Hh}px)`;
      setTimeout(() => { if (!strip.isConnected) { clearInterval(tick); return; } strip.classList.remove('blur'); G.audio.thud(0.4); if (i === 2) { clearInterval(tick); finish(res); } }, dur * 1000);
    });
  };
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button, .sl-lever'); if (!t) return;
    if (t.dataset.x !== undefined) { G.ui.close(); return; }
    if (t.dataset.bet) { if (spinning) return; bet = +t.dataset.bet; for (const b of document.querySelectorAll('.sl-bets button')) b.classList.toggle('on', +b.dataset.bet === bet); G.audio.click(); return; }
    if (t.id === 'sl-spin' || t.id === 'sl-lever') spin();
  };
}

// ------------------------------------------------------------ Roulette (europäisch)
const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const numCol = (n) => (n === 0 ? '#1f9d55' : REDS.has(n) ? '#c0182a' : '#151515');
const RBETS = {
  red: ['Rot', 2, (n) => REDS.has(n)], black: ['Schwarz', 2, (n) => n > 0 && !REDS.has(n)], even: ['Gerade', 2, (n) => n > 0 && n % 2 === 0], odd: ['Ungerade', 2, (n) => n % 2 === 1],
  low: ['1–18', 2, (n) => n >= 1 && n <= 18], high: ['19–36', 2, (n) => n >= 19], d1: ['1. Dutzend', 3, (n) => n >= 1 && n <= 12], d2: ['2. Dutzend', 3, (n) => n >= 13 && n <= 24], d3: ['3. Dutzend', 3, (n) => n >= 25],
};
export function roulette() {
  let chip = 50, bets = {}, spinning = false, last = [];
  const total = () => Object.values(bets).reduce((s, v) => s + v, 0);
  const board = () => {
    let h = '<div class="rl-nums"><button class="rl-n z" data-b="n0" style="--c:#1f9d55">0' + (bets.n0 ? `<i>${bets.n0}</i>` : '') + '</button>';
    for (let c = 1; c <= 36; c++) h += `<button class="rl-n" data-b="n${c}" style="--c:${numCol(c)}">${c}${bets['n' + c] ? `<i>${bets['n' + c]}</i>` : ''}</button>`;
    h += '</div><div class="rl-outs">' + Object.entries(RBETS).map(([k, [n, m]]) => `<button data-b="${k}" class="${k}">${n} <small>×${m}</small>${bets[k] ? `<i>${bets[k]}</i>` : ''}</button>`).join('') + '</div>';
    return h;
  };
  const render = (msg = 'Setz deine Chips und drück auf <b>Drehen</b>.') => {
    const inner = `<div class="rl"><div class="rl-left"><canvas id="rl-wheel" width="360" height="360"></canvas><div class="rl-last">${last.map((n) => `<span style="--c:${numCol(n)}">${n}</span>`).join('')}</div></div>
      <div class="rl-right">${board()}<div class="cas-row">${chips([10, 50, 100, 500, 1000, 5000], chip)}</div>
      <div class="cas-msg" id="cas-msg">${msg}</div>
      <div class="cas-row"><button class="st-sec" data-clear>Einsätze löschen</button><div class="cas-total">Einsatz <b>${money(total())}</b></div><button class="st-buy" id="rl-spin" ${spinning ? 'disabled' : ''}>Drehen</button></div></div></div>`;
    $('ui-layer').innerHTML = frame('ROULETTE', 'Europäisch · Einzelnull', '🎡', '#d62828', inner, 'wide');
    draw(rot, -1);
  };
  let rot = 0;
  const draw = (r, ballA, ballR = 150) => {
    const cv = $('rl-wheel'); if (!cv) return;
    const g = cv.getContext('2d'), n = ORDER.length, cx = 180, cy = 180;
    g.clearRect(0, 0, 360, 360);
    g.fillStyle = '#4a2414'; g.beginPath(); g.arc(cx, cy, 176, 0, 7); g.fill();
    g.fillStyle = '#d4a017'; g.beginPath(); g.arc(cx, cy, 166, 0, 7); g.fill();
    for (let i = 0; i < n; i++) {
      const a0 = r + (i / n) * Math.PI * 2, a1 = r + ((i + 1) / n) * Math.PI * 2;
      g.fillStyle = numCol(ORDER[i]); g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 160, a0, a1); g.closePath(); g.fill();
      g.save(); g.translate(cx, cy); g.rotate((a0 + a1) / 2); g.fillStyle = '#fff'; g.font = 'bold 13px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(ORDER[i], 140, 5); g.restore();
    }
    g.fillStyle = '#2a1208'; g.beginPath(); g.arc(cx, cy, 108, 0, 7); g.fill();
    g.fillStyle = '#d4a017'; g.beginPath(); g.arc(cx, cy, 26, 0, 7); g.fill();
    for (let k = 0; k < 4; k++) { g.save(); g.translate(cx, cy); g.rotate(r * 1 + k * Math.PI / 2); g.fillStyle = '#d4a017'; g.fillRect(-4, -70, 8, 60); g.restore(); }
    if (ballA >= 0) { g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 6; g.beginPath(); g.arc(cx + Math.cos(ballA) * ballR, cy + Math.sin(ballA) * ballR, 7, 0, 7); g.fill(); g.shadowBlur = 0; }
  };
  const spin = () => {
    const stake = total();
    if (spinning || !stake) return;
    if (!take(stake)) { render('Nicht genug Geld für diese Einsätze.'); return; }
    spinning = true; render('Rien ne va plus …');
    const res = Math.floor(Math.random() * 37), idx = ORDER.indexOf(res), n = ORDER.length;
    const dur = 5200, t0 = performance.now(), r0 = rot;
    const rEnd = r0 + Math.PI * 2 * 3 + rand(0, Math.PI * 2);
    // Kugel läuft gegenläufig und landet im Fach (relativ zum Rad)
    const pocket = ((idx + 0.5) / n) * Math.PI * 2;
    const tick = setInterval(() => G.audio.click(), 120);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      rot = r0 + (rEnd - r0) * e;
      const ballEnd = rEnd + pocket;
      const ballA = (1 - e) * (r0 - Math.PI * 8) + e * ballEnd;
      const br = 150 - Math.max(0, (k - 0.6) / 0.4) * 22;
      draw(rot, ((ballA % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), br);
      if (k < 1 && $('rl-wheel')) requestAnimationFrame(step);
      else { clearInterval(tick); if ($('rl-wheel')) done(res); else spinning = false; }
    };
    requestAnimationFrame(step);
  };
  const done = (res) => {
    spinning = false;
    let pay = 0;
    for (const [k, v] of Object.entries(bets)) {
      if (k[0] === 'n') { if (+k.slice(1) === res) pay += v * 36; }
      else if (RBETS[k][2](res)) pay += v * RBETS[k][1];
    }
    const stake = total();
    settle(stake, pay);
    last = [res, ...last].slice(0, 10);
    const name = res === 0 ? 'Null (grün)' : `${res} ${REDS.has(res) ? 'Rot' : 'Schwarz'}`;
    render(pay > 0 ? `<b class="win">${name}</b> – Gewinn ${money(pay)}!` : `<b>${name}</b> – leider verloren.`);
    if (pay >= stake * 3) rain(30);
  };
  if (!G.ui.open('', 'ui-store')) return;
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { if (!spinning) G.ui.close(); return; }
    if (spinning) return;
    if (t.dataset.chip) { chip = +t.dataset.chip; render(); G.audio.click(); return; }
    if (t.dataset.b) { bets[t.dataset.b] = (bets[t.dataset.b] || 0) + chip; G.audio.click(); render(); return; }
    if (t.dataset.clear !== undefined) { bets = {}; render(); return; }
    if (t.id === 'rl-spin') spin();
  };
}

// ------------------------------------------------------------ Blackjack
export function blackjack() {
  let bet = 100, deck = [], player = [], dealer = [], phase = 'bet', msg = 'Einsatz wählen und <b>Austeilen</b>.', doubled = false;
  const SU = ['♠', '♥', '♦', '♣'], RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'B', 'D', 'K'];
  const newDeck = () => { deck = []; for (let d = 0; d < 4; d++) for (const s of SU) for (const r of RK) deck.push([r, s]); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } };
  const draw1 = () => { if (deck.length < 20) newDeck(); return deck.pop(); };
  const val = (h) => { let v = 0, a = 0; for (const [r] of h) { if (r === 'A') { a++; v += 11; } else v += ['B', 'D', 'K'].includes(r) ? 10 : +r; } while (v > 21 && a) { v -= 10; a--; } return v; };
  const card = (c, hide, i) => hide ? `<div class="bj-card back" style="--i:${i}"></div>` : `<div class="bj-card ${c[1] === '♥' || c[1] === '♦' ? 'red' : ''}" style="--i:${i}"><b>${c[0]}</b><span>${c[1]}</span><em>${c[1]}</em></div>`;
  const render = () => {
    const hide = phase === 'play';
    const inner = `<div class="bj">
      <div class="bj-hand"><div class="bj-lbl">Croupier ${hide ? '' : `<b>${val(dealer)}</b>`}</div><div class="bj-cards">${dealer.map((c, i) => card(c, hide && i === 1, i)).join('')}</div></div>
      <div class="cas-msg" id="cas-msg">${msg}</div>
      <div class="bj-hand"><div class="bj-lbl">Du ${player.length ? `<b>${val(player)}</b>` : ''}</div><div class="bj-cards">${player.map((c, i) => card(c, false, i)).join('')}</div></div>
      <div class="cas-row">${phase === 'play' ? `<button class="st-sec" data-a="hit">Karte</button><button class="st-sec" data-a="stand">Stehen</button>${player.length === 2 && G.player.money >= bet ? '<button class="st-sec" data-a="double">Verdoppeln</button>' : ''}` : `${chips([25, 50, 100, 250, 500, 1000, 2500], bet, 'bet')}<button class="st-buy" data-a="deal">Austeilen · ${money(bet)}</button>`}</div>
      <div class="bj-rules">Blackjack zahlt 3:2 · Croupier steht ab 17 · 4 Kartendecks</div></div>`;
    $('ui-layer').innerHTML = frame('BLACKJACK', 'Tisch 21 · Limit $25 – $2.500', '🃏', '#1f9d55', inner);
  };
  const finish = () => {
    phase = 'done';
    const pv = val(player), dv = val(dealer), stake = bet * (doubled ? 2 : 1);
    let pay = 0;
    if (pv > 21) msg = `Überkauft (${pv}) – verloren.`;
    else if (player.length === 2 && pv === 21 && !(dealer.length === 2 && dv === 21)) { pay = stake * 2.5; msg = `<b class="win">BLACKJACK!</b> Gewinn ${money(pay)}`; rain(25); }
    else if (dv > 21 || pv > dv) { pay = stake * 2; msg = `<b class="win">Gewonnen!</b> ${pv} gegen ${dv} – ${money(pay)}`; }
    else if (pv === dv) { pay = stake; msg = `Unentschieden (${pv}) – Einsatz zurück.`; }
    else msg = `Verloren – ${dv} schlägt ${pv}.`;
    settle(stake, pay);
    render();
  };
  const dealerPlay = () => { while (val(dealer) < 17) dealer.push(draw1()); finish(); };
  if (!G.ui.open('', 'ui-store')) return;
  newDeck(); render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { if (phase !== 'play') G.ui.close(); return; }
    if (t.dataset.bet) { bet = +t.dataset.bet; render(); G.audio.click(); return; }
    const a = t.dataset.a;
    if (a === 'deal') {
      if (!take(bet)) { msg = 'Nicht genug Geld.'; render(); return; }
      player = [draw1(), draw1()]; dealer = [draw1(), draw1()]; doubled = false; phase = 'play'; msg = 'Karte oder Stehen?';
      G.audio.click();
      if (val(player) === 21) { finish(); return; }
      render();
    } else if (a === 'hit') { player.push(draw1()); G.audio.click(); if (val(player) > 21) finish(); else render(); }
    else if (a === 'stand') dealerPlay();
    else if (a === 'double') { if (!take(bet)) return; doubled = true; player.push(draw1()); if (val(player) > 21) finish(); else dealerPlay(); }
  };
}

// ------------------------------------------------------------ Glücksrad
const FORTUNE = [[0, 3.2, 'Niete'], [50, 3, '$50'], [100, 3, '$100'], [0, 3.2, 'Niete'], [150, 2.4, '$150'], [250, 2, '$250'], [400, 1.5, '$400'], [600, 0.9, '$600'], [1000, 0.6, '$1.000'], [2500, 0.18, '$2.500'], [5000, 0.06, '$5.000'], [50000, 0.008, 'JACKPOT']];
export function fortune() {
  const cost = 250; let rot = 0, spinning = false, msg = `Ein Dreh kostet ${money(cost)}. Hauptgewinn: <b>$50.000</b>!`;
  const n = FORTUNE.length, cols = ['#d62828', '#ffd23f', '#1d4ed8', '#7cff6b', '#ff8fab', '#19e6ff'];
  const draw = () => {
    const cv = $('fw-wheel'); if (!cv) return;
    const g = cv.getContext('2d'), cx = 190, cy = 190;
    g.clearRect(0, 0, 380, 380);
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2 - Math.PI / 2, a1 = a0 + (Math.PI * 2) / n;
      g.fillStyle = FORTUNE[i][0] === 50000 ? '#111' : cols[i % cols.length]; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 180, a0, a1); g.closePath(); g.fill();
      g.strokeStyle = '#d4a017'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate((a0 + a1) / 2); g.fillStyle = FORTUNE[i][0] === 50000 ? '#ffd23f' : '#111'; g.font = 'bold 17px Oswald, sans-serif'; g.textAlign = 'right'; g.fillText(FORTUNE[i][2], 168, 6); g.restore();
    }
    g.fillStyle = '#d4a017'; g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx - 14, 2); g.lineTo(cx + 14, 2); g.lineTo(cx, 34); g.closePath(); g.fill();
  };
  const render = () => {
    $('ui-layer').innerHTML = frame('GLÜCKSRAD', 'Ein Dreh · ein Traum', '🎯', '#ffd23f', `<div class="fw"><canvas id="fw-wheel" width="380" height="380"></canvas><div class="fw-side"><div class="cas-msg" id="cas-msg">${msg}</div><button class="st-buy" id="fw-spin" ${spinning ? 'disabled' : ''}>Drehen · ${money(cost)}</button><div class="bj-rules">Gewinne werden sofort ausgezahlt.</div></div></div>`);
    draw();
  };
  const spin = () => {
    if (spinning) return;
    if (!take(cost)) { msg = 'Nicht genug Geld.'; render(); return; }
    spinning = true; msg = 'Das Rad dreht sich …'; render();
    let r = Math.random() * FORTUNE.reduce((s, f) => s + f[1], 0), idx = 0;
    for (let i = 0; i < n; i++) { if ((r -= FORTUNE[i][1]) < 0) { idx = i; break; } }
    const target = -((idx + 0.5) / n) * Math.PI * 2, r0 = rot, rEnd = target - Math.PI * 2 * (6 + Math.floor(Math.random() * 3)) + rand(-0.12, 0.12) * ((Math.PI * 2) / n);
    const t0 = performance.now(), dur = 5000;
    let lastSeg = -1;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      rot = r0 + (rEnd - r0) * e; draw();
      const seg = Math.floor(((-rot / (Math.PI * 2)) * n % n + n) % n); if (seg !== lastSeg) { lastSeg = seg; G.audio.click(); }
      if (k < 1 && $('fw-wheel')) requestAnimationFrame(step);
      else { spinning = false; const prize = FORTUNE[idx][0]; settle(cost, prize); msg = prize ? `<b class="win">${FORTUNE[idx][2]}!</b> ${prize === 50000 ? 'Unfassbar!' : 'Glückwunsch!'}` : 'Niete – nächstes Mal!'; if (prize >= 1000) rain(prize >= 50000 ? 80 : 30); if ($('fw-wheel')) render(); }
    };
    requestAnimationFrame(step);
  };
  if (!G.ui.open('', 'ui-store')) return;
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { if (!spinning) G.ui.close(); return; }
    if (t.id === 'fw-spin') spin();
  };
}

// ------------------------------------------------------------ Pferdewetten
const HORSES = [['Blitz von Bahía', 2.2], ['Salzwind', 3], ['Goldene Mähne', 4], ['Nachtfalter', 6], ['Kaktusblüte', 10], ['Lahmer Lorenzo', 20]];
export function horses() {
  let pick1 = 0, bet = 100, racing = false, msg = 'Wähle ein Pferd und deinen Einsatz.';
  const render = () => {
    const inner = `<div class="hr">
      <div class="hr-track" id="hr-track">${HORSES.map(([n], i) => `<div class="hr-lane"><span class="hr-num">${i + 1}</span><i class="hr-horse" id="hr-h${i}">🏇</i></div>`).join('')}<div class="hr-goal"></div></div>
      <div class="hr-list">${HORSES.map(([n, o], i) => `<button class="dl-car ${i === pick1 ? 'on' : ''}" data-h="${i}"><div><b>${i + 1}. ${n}</b><span>Quote ${o}:1</span></div><em>×${o}</em></button>`).join('')}</div>
      <div class="cas-msg" id="cas-msg">${msg}</div>
      <div class="cas-row">${chips([25, 50, 100, 250, 500, 1000], bet, 'bet')}<button class="st-buy" id="hr-go" ${racing ? 'disabled' : ''}>Wetten & starten</button></div></div>`;
    $('ui-layer').innerHTML = frame('PFERDEWETTEN', 'Live-Rennen aus Los Ranchos', '🏇', '#7cff6b', inner, 'wide');
  };
  const race = () => {
    if (racing) return;
    if (!take(bet)) { msg = 'Nicht genug Geld.'; render(); return; }
    racing = true; msg = 'Und sie sind gestartet!'; render();
    const w = HORSES.map(([, o]) => 1 / o), sum = w.reduce((a, b) => a + b, 0) * 1.08;
    let r = Math.random() * sum, win = HORSES.length - 1;
    for (let i = 0; i < w.length; i++) { if ((r -= w[i]) < 0) { win = i; break; } }
    const pos = HORSES.map(() => 0), sp = HORSES.map((_, i) => (i === win ? 1.0 : rand(0.84, 0.97)));
    const t0 = performance.now();
    const step = (now) => {
      const t = (now - t0) / 1000;
      for (let i = 0; i < pos.length; i++) { pos[i] = Math.min(1, t / 7 * sp[i] + Math.sin(t * 3 + i) * 0.01); const el = $('hr-h' + i); if (el) el.style.left = `calc(${pos[i] * 88}% + 22px)`; }
      if (pos[win] < 1 && $('hr-track')) requestAnimationFrame(step);
      else {
        racing = false;
        const o = HORSES[win][1], pay = win === pick1 ? bet * o : 0;
        settle(bet, pay);
        msg = pay ? `<b class="win">${HORSES[win][0]} gewinnt!</b> Du kassierst ${money(pay)}.` : `${HORSES[win][0]} gewinnt – dein Pferd war nicht schnell genug.`;
        if (pay >= bet * 6) rain(30);
        if ($('hr-track')) render();
      }
    };
    requestAnimationFrame(step);
  };
  if (!G.ui.open('', 'ui-store')) return;
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { if (!racing) G.ui.close(); return; }
    if (racing) return;
    if (t.dataset.h) { pick1 = +t.dataset.h; render(); G.audio.click(); return; }
    if (t.dataset.bet) { bet = +t.dataset.bet; render(); return; }
    if (t.id === 'hr-go') race();
  };
}

// ------------------------------------------------------------ Kasse (Statistik)
function cashier() {
  const S = stats();
  G.openMenu('KASSE', `<div style="line-height:1.7">Gewonnen insgesamt: <b style="color:#7cff6b">${money(S.won)}</b><br>Verloren insgesamt: <b style="color:#ff6b6b">${money(S.lost)}</b><br>Größter Einzelgewinn: <b>${money(S.biggest)}</b><br><small style="opacity:.7">Das Haus gewinnt immer … meistens.</small></div>`, [['VIP-Getränk – $40', () => { if (G.player.money < 40) return; G.player.addMoney(-40); G.player.health = Math.min(100, G.player.health + 20); G.hud.toast('🥂 Auf das Glück!'); }]]);
}
