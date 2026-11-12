// Moderne Overlay-Oberflächen: Läden, Inventar, Spielautomat, Rubbellos, Autohaus
import * as THREE from 'three';
import { G } from './state.js';
import { CAR_TYPES, CAR_SHOP } from './models.js';
import { WEAPONS, WMODS, wmodPrice } from './combat.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const money = (n) => '$' + Math.round(n).toLocaleString('de-DE');

// ------------------------------------------------------------ Gegenstände
export const ITEMS = {
  sandwich: { name: 'Club-Sandwich', icon: '🥪', price: 6, desc: 'Frisch belegt. Füllt 30 Gesundheit auf.', anim: 'eat', dur: 3.2, heal: 30, prop: 0xe3b46b },
  donut: { name: 'Neon-Donut', icon: '🍩', price: 3, desc: 'Pinke Glasur, viel Zucker. +12 Gesundheit.', anim: 'eat', dur: 2.4, heal: 12, prop: 0xff8fab },
  energy: { name: 'Volt Energy', icon: '⚡', price: 4, desc: '+15 Gesundheit und 30 Sekunden schneller sprinten.', anim: 'drink', dur: 2.4, heal: 15, boost: 30, prop: 0x19e6ff },
  water: { name: 'Mineralwasser', icon: '💧', price: 2, desc: 'Erfrischend. +6 Gesundheit.', anim: 'drink', dur: 2, heal: 6, prop: 0x9fd6ff },
  coffee: { name: 'Kaffee to go', icon: '☕', price: 3, desc: 'Heiß und stark. +8 Gesundheit.', anim: 'drink', dur: 2.8, heal: 8, prop: 0x6b4423 },
  cig: { name: 'Zigaretten', icon: '🚬', price: 9, pack: 10, desc: 'Schachtel mit 10 Stück. Entspannt kurz – gesund ist es nicht.', anim: 'smoke', dur: 7.5, prop: 0xf5f5f5 },
  beer: { name: 'Dosenbier', icon: '🍺', price: 4, desc: 'Kühles Bier. +5 Gesundheit, die Welt schwankt ein wenig.', anim: 'drink', dur: 2.6, heal: 5, drunk: 14, prop: 0xd9a520 },
  whiskey: { name: 'Whiskey (Flachmann)', icon: '🥃', price: 12, desc: 'Hochprozentig. Ordentlich Schwindel für eine Weile.', anim: 'drink', dur: 2.4, heal: 3, drunk: 32, prop: 0x8a4b2a },
  joint: { name: 'Joint', icon: '🌿', price: 15, desc: 'Entspannt: Zeit läuft langsamer, Bild wird weich und warm, Ton dumpf. +25 Gesundheit und langsame Heilung.', anim: 'smoke', dur: 7, heal: 25, high: 50, trip: 'joint', prop: 0x9fcf6f },
  pills: { name: 'Party-Pillen', icon: '💊', price: 40, desc: '60 Sekunden Sprint-Boost, Farben wechseln im Takt, Extra-Bass.', anim: 'eat', dur: 1.6, boost: 60, high: 60, trip: 'pills', prop: 0xff6fb0 },
  cigd: { name: 'Zigaretten (lose)', icon: '🚬', price: 5, pack: 10, desc: '10 Stück, billiger als im Laden. Frag nicht, woher.', anim: 'smoke', dur: 7.5, prop: 0xf5f5f5 },
  scratch: { name: 'Glücksregen', icon: '🎟️', price: 5, desc: 'Rubbellos: 3 gleiche Beträge gewinnen. Bis zu $500.', use: 'scratch', tier: 1 },
  scratchgold: { name: 'Goldrausch', icon: '🎫', price: 20, desc: 'Premium-Rubbellos: bessere Chancen, bis zu $5.000.', use: 'scratch', tier: 2 },
};

export const Inventory = {
  add(id, n = 1) { const P = G.player; P.inventory[id] = (P.inventory[id] || 0) + n; },
  count(id) { return G.player.inventory[id] || 0; },
  take(id) { const P = G.player; if (!P.inventory[id]) return false; P.inventory[id]--; if (!P.inventory[id]) delete P.inventory[id]; return true; },
  list() { return Object.entries(G.player.inventory).filter(([id, n]) => n > 0 && ITEMS[id]); },
  use(id) {
    const it = ITEMS[id], P = G.player;
    if (!it || !this.count(id)) return;
    if (it.use === 'scratch') { this.take(id); close(true); scratch(it.tier); return; }
    if (P.state !== 'foot' || P.useItem) { G.hud.toast(P.inCar ? 'Steig erst aus, um das zu benutzen.' : 'Gerade nicht möglich.'); return; }
    this.take(id);
    close();
    it._col = it._col || new THREE.Color(it.prop);
    P.startUse(id, it);
  },
};

// ------------------------------------------------------------ Overlay-Grundlagen
let onClose = null;
function open(html, cls = '') {
  if (G.state === 'playing') { G.state = 'menu'; if (document.pointerLockElement) document.exitPointerLock(); }
  else if (G.state !== 'menu' && G.state !== 'paused') return false;
  const L = $('ui-layer');
  L.className = 'ui-layer ' + cls;
  L.innerHTML = html;
  G.ui.isOpen = true;
  return true;
}
function close(keepMenu = false) {
  const L = $('ui-layer');
  L.className = 'ui-layer hidden';
  L.innerHTML = '';
  G.ui.isOpen = false;
  G.menuCam = null;
  if (onClose) { const f = onClose; onClose = null; f(); }
  if (!keepMenu && G.state === 'menu') { G.state = 'playing'; G.resetClock(); }
}
const pay = (n) => { const P = G.player; if (P.money < n) return false; P.addMoney(-n); G.audio.cash(); return true; };
function bump(el) { if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
function shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

// ------------------------------------------------------------ Laden (allgemein)
function store(cfg) {
  let cat = 0, sel = cfg.categories[0].items[0].id, qty = 1, first = true;
  const find = (id) => cfg.categories.flatMap((c) => c.items).find((i) => i.id === id);
  const render = () => {
    const c = cfg.categories[cat], it = find(sel) || c.items[0];
    sel = it.id;
    const owned = cfg.owned ? cfg.owned(it) : '';
    const canQty = !!it.multi;
    const total = it.price * (canQty ? qty : 1);
    const html = `<div class="st ${first ? 'anim' : ''}" style="--a:${cfg.accent}">
      <header class="st-h"><div class="st-logo">${cfg.logo}</div><div class="st-t"><b>${cfg.title}</b><span>${cfg.subtitle}</span></div>
        <div class="st-money" id="st-money">${money(G.player.money)}</div><button class="st-x" data-x>✕</button></header>
      <nav class="st-tabs">${cfg.categories.map((k, i) => `<button class="${i === cat ? 'on' : ''}" data-cat="${i}">${k.icon || ''} ${k.name}</button>`).join('')}</nav>
      <div class="st-body">
        <div class="st-grid">${c.items.map((i) => { const o = cfg.owned ? cfg.owned(i) : ''; return `<button class="st-card ${i.id === sel ? 'on' : ''} ${i.disabled ? 'dis' : ''}" data-it="${i.id}"><span class="st-ic">${i.icon}</span><b>${esc(i.name)}</b><em>${i.priceText || (i.price ? money(i.price) : 'gratis')}</em>${o ? `<i class="st-own">${o}</i>` : ''}</button>`; }).join('')}</div>
        <aside class="st-detail">
          <div class="st-big">${it.icon}</div>
          <h3>${esc(it.name)}</h3>
          <p>${esc(it.desc || '')}</p>
          ${owned ? `<div class="st-tag">${owned}</div>` : ''}
          ${canQty ? `<div class="st-qty"><button data-q="-1">−</button><b>${qty}</b><button data-q="1">+</button></div>` : ''}
          <div class="st-total"><span>Gesamt</span><b>${it.priceText || (it.price ? money(total) : 'gratis')}</b></div>
          <button class="st-buy" id="st-buy" ${it.disabled ? 'disabled' : ''}>${it.disabled || it.label || cfg.buyLabel || 'Kaufen'}</button>
          ${cfg.extra ? cfg.extra(it) : ''}
        </aside>
      </div></div>`;
    $('ui-layer').innerHTML = html;
    first = false;
  };
  if (!open('', 'ui-store')) return;
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { close(); return; }
    if (t.dataset.cat) { cat = +t.dataset.cat; sel = cfg.categories[cat].items[0].id; qty = 1; render(); G.audio.click(); return; }
    if (t.dataset.it) { sel = t.dataset.it; qty = 1; render(); G.audio.click(); return; }
    if (t.dataset.q) { qty = Math.max(1, Math.min(20, qty + +t.dataset.q)); render(); return; }
    if (t.dataset.act && cfg.action) { cfg.action(t.dataset.act, find(sel)); return; }
    if (t.id === 'st-buy') {
      const it = find(sel), n = it.multi ? qty : 1;
      if (G.player.money < it.price * n) { shake(t); t.textContent = 'Nicht genug Geld'; setTimeout(render, 900); return; }
      const ok = cfg.onBuy(it, n);
      if (ok === false) { shake(t); return; }
      t.classList.add('done'); t.textContent = '✓ Gekauft';
      setTimeout(() => { if (G.ui.isOpen) { render(); bump($('st-money')); } }, 650);
    }
  };
}

// ------------------------------------------------------------ Samis 24/7
function kiosk() {
  const it = (id) => ({ id, ...ITEMS[id], multi: true });
  store({
    title: "SAMI'S 24/7", subtitle: 'Snacks · Getränke · Tabak · Lotto', accent: '#ffd23f', logo: '🏪',
    categories: [
      { name: 'Snacks', icon: '🥪', items: [it('sandwich'), it('donut')] },
      { name: 'Getränke', icon: '🥤', items: [it('energy'), it('coffee'), it('water')] },
      { name: 'Tabak', icon: '🚬', items: [it('cig')] },
      { name: 'Lotto', icon: '🎟️', items: [it('scratch'), it('scratchgold')] },
    ],
    owned: (i) => (Inventory.count(i.id) ? `Im Inventar: ${Inventory.count(i.id)}` : ''),
    onBuy: (i, n) => { if (!pay(i.price * n)) return false; Inventory.add(i.id, n * (i.pack || 1)); G.hud.toast(`${i.icon} ${n}× ${i.name} → Inventar`); return true; },
    extra: (i) => (ITEMS[i.id].use === 'scratch' && Inventory.count(i.id) ? '<button class="st-sec" data-act="scratch">🎟️ Jetzt freirubbeln</button>' : ITEMS[i.id].anim && Inventory.count(i.id) ? '<button class="st-sec" data-act="use">Sofort benutzen</button>' : ''),
    action: (a, i) => { if (a === 'scratch' || a === 'use') Inventory.use(i.id); },
  });
}

// ------------------------------------------------------------ Straßendealer
function street() {
  const it = (id) => ({ id, ...ITEMS[id], multi: true });
  store({
    title: 'STRASSENHÄNDLER', subtitle: 'Keine Fragen · nur Bargeld', accent: '#b26bff', logo: '🧥',
    categories: [
      { name: 'Ware', icon: '🌿', items: [it('joint'), it('pills')] },
      { name: 'Alkohol', icon: '🍺', items: [it('beer'), it('whiskey')] },
      { name: 'Tabak', icon: '🚬', items: [it('cigd')] },
    ],
    owned: (i) => (Inventory.count(i.id) ? `Im Inventar: ${Inventory.count(i.id)}` : ''),
    onBuy: (i, n) => { if (!pay(i.price * n)) return false; Inventory.add(i.id, n * (i.pack || 1)); G.hud.toast(`${i.icon} ${n}× ${i.name} → Inventar`); if (G.dealer) G.dealer.sold(); const P = G.player; if (P.contacts && !P.contacts.has('dealer')) { P.contacts.add('dealer'); setTimeout(() => G.hud.bigToast('NEUER KONTAKT', 'Fuego (Straßenhändler) – er hat einen Job für dich'), 1200); } return true; },
    extra: (i) => (ITEMS[i.id].anim && Inventory.count(i.id) ? '<button class="st-sec" data-act="use">Sofort benutzen</button>' : ''),
    action: (a, i) => { if (a === 'use') Inventory.use(i.id); },
  });
}

// ------------------------------------------------------------ Waffenladen
function gunshop() {
  const P = G.player;
  const w = (k) => ({ id: k, name: WEAPONS[k].name, icon: { pistol: '🔫', smg: '🔫', shotgun: '💥', rifle: '🎯', sniper: '🔭', grenade: '💣' }[k], price: WEAPONS[k].price, desc: `Schaden ${WEAPONS[k].dmg}${WEAPONS[k].pellets ? ' ×' + WEAPONS[k].pellets : ''} · inkl. ${WEAPONS[k].ammoPack} Schuss`, disabled: P.ammo[k] > 0 ? 'Bereits im Besitz' : null });
  const a = (k) => ({ id: 'ammo_' + k, w: k, name: `${WEAPONS[k].name}-Munition`, icon: '📦', price: WEAPONS[k].ammoPrice, desc: `+${WEAPONS[k].ammoPack} Schuss`, multi: true, disabled: P.ammo[k] > 0 ? null : 'Erst Waffe kaufen' });
  const MI = modItems();
  store({
    title: 'WAFFENLADEN', subtitle: 'Ausrüstung für harte Zeiten', accent: '#ff7b39', logo: '🎯',
    categories: [
      { name: 'Waffen', icon: '🔫', items: ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade'].map(w) },
      { name: 'Munition', icon: '📦', items: ['pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'grenade'].map(a) },
      { name: 'Ausrüstung', icon: '🦺', items: [{ id: 'armor', name: 'Schutzweste', icon: '🦺', price: 300, desc: 'Fängt 70 % des Schadens ab.' }, { id: 'medkit', name: 'Erste-Hilfe-Set', icon: '🩹', price: 120, desc: 'Sofort volle Gesundheit.' }] },
      { name: 'Aufsätze', icon: '🔧', items: MI },
    ],
    owned: (i) => (i.mod ? (P.wmods[i.w] && P.wmods[i.w][i.mod] ? 'Eingebaut' : '') : i.w ? `Munition: ${P.ammo[i.w] || 0}` : WEAPONS[i.id] ? (P.ammo[i.id] > 0 ? `Munition: ${P.ammo[i.id]}` : '') : i.id === 'armor' ? `Weste: ${Math.round(P.armor)} %` : ''),
    onBuy: (i, n) => {
      if (i.mod) { if (!pay(i.price)) return false; P.wmods[i.w] = { ...(P.wmods[i.w] || {}), [i.mod]: 1 }; i.disabled = 'Eingebaut'; for (const x of MI) if (x.w === i.w && WMODS[x.mod].req === i.mod && !P.wmods[x.w][x.mod]) x.disabled = null; if (i.mod === 'mag') P.clip[i.w] = undefined; G.hud.toast(`🔧 ${WEAPONS[i.w].name}: ${WMODS[i.mod].name} eingebaut`); G.hud.weapon(); return true; }
      if (!pay(i.price * n)) return false;
      if (WEAPONS[i.id]) P.giveWeapon(i.id, WEAPONS[i.id].ammoPack);
      else if (i.w) P.giveWeapon(i.w, WEAPONS[i.w].ammoPack * n);
      else if (i.id === 'armor') P.armor = 100;
      else if (i.id === 'medkit') P.health = 100;
      G.hud.weapon();
      return true;
    },
  });
}

function modItems() {
  const P = G.player, out = [];
  for (const w of ['pistol', 'smg', 'shotgun', 'rifle', 'sniper']) for (const m of Object.keys(WMODS)) {
    const M = WMODS[m], has = P.wmods[w] && P.wmods[w][m];
    const dis = has ? 'Eingebaut' : !(P.ammo[w] > 0) ? 'Erst Waffe kaufen' : M.req && !(P.wmods[w] && P.wmods[w][M.req]) ? 'Erst ' + WMODS[M.req].name : null;
    out.push({ id: `mod_${w}_${m}`, w, mod: m, name: `${WEAPONS[w].name}: ${M.name}`, icon: M.icon, price: wmodPrice(w, m), desc: M.desc, disabled: dis });
  }
  return out;
}

// ------------------------------------------------------------ Club-Bar
function bar() {
  const I = G.interiors;
  store({
    title: 'VELVET BAR', subtitle: 'Drinks & Vibes', accent: '#ff2e88', logo: '🍸',
    categories: [{ name: 'Drinks', icon: '🍹', items: [
      { id: 'cocktail', name: 'Neon-Cocktail', icon: '🍹', price: 25, desc: 'Die Welt dreht sich danach ein bisschen …' },
      { id: 'shot', name: 'Tequila-Shot', icon: '🥃', price: 12, desc: 'Kurz und heftig.' },
      { id: 'redbull', name: 'Volt Energy', icon: '⚡', price: 10, desc: '+20 Gesundheit.' },
      { id: 'water', name: 'Wasser', icon: '💧', price: 0, desc: 'Gratis – der Barkeeper ist nett.' },
    ] }],
    onBuy: (i) => {
      if (i.price && !pay(i.price)) return false;
      if (i.id === 'cocktail') { I.drunk = 25; G.hud.toast('🍹 Prost!'); }
      if (i.id === 'shot') { I.drunk = Math.max(I.drunk, 14); G.hud.toast('🥃 Puh!'); }
      if (i.id === 'redbull') { G.player.health = Math.min(100, G.player.health + 20); G.hud.toast('⚡ Energie!'); }
      if (i.id === 'water') G.hud.toast('💧 Erfrischend.');
      return true;
    },
  });
}

// ------------------------------------------------------------ Inventar
function inventory() {
  // Interaktionsmenü (seitliche Liste mit Banner, Kategorien und Beschreibung)
  let idx = 0, cat = null;
  const P = G.player;
  const cats = [
    ['food', 'Essen & Trinken', (it) => (it.anim === 'eat' || it.anim === 'drink') && !it.high && !it.drunk],
    ['booze', 'Alkohol', (it) => !!it.drunk],
    ['street', 'Straßenware', (it) => !!it.high],
    ['smoke', 'Rauchwaren', (it) => it.anim === 'smoke' && !it.high],
    ['lotto', 'Lose', (it) => it.use === 'scratch'],
  ];
  const rows = () => {
    const list = Inventory.list();
    if (!cat) {
      const r = cats.map(([id, name, f]) => ({ kind: 'cat', id, name, n: list.filter(([k]) => f(ITEMS[k])).reduce((s, [, n]) => s + n, 0) }));
      r.push({ kind: 'cat', id: 'weapons', name: 'Waffen', n: Object.keys(WEAPONS).filter((w) => w !== 'fists' && P.ammo[w] > 0).length });
      r.push({ kind: 'info', name: 'Bargeld', val: money(P.money), desc: 'Dein Bargeld. Verdiene mehr mit Aufträgen, Taxi-Fahrten oder … anderen Methoden.' });
      return r;
    }
    if (cat === 'weapons') return Object.keys(WEAPONS).filter((w) => w === 'fists' || P.ammo[w] > 0).map((w) => ({ kind: 'weapon', id: w, name: WEAPONS[w].name, val: WEAPONS[w].melee ? '' : P.ammo[w] + ' Schuss', desc: P.weapon === w ? 'Aktuell ausgerüstet.' : 'Auswählen zum Ausrüsten. Tipp: Tab gedrückt halten (oder Waffensymbol antippen) öffnet das Waffenrad.' }));
    const f = cats.find((c) => c[0] === cat)[2];
    const r = list.filter(([k]) => f(ITEMS[k])).map(([k, n]) => ({ kind: 'item', id: k, name: ITEMS[k].name, icon: ITEMS[k].icon, val: '×' + n, desc: ITEMS[k].desc }));
    return r.length ? r : [{ kind: 'info', name: 'Nichts vorhanden', val: '', desc: 'Kauf Nachschub in einem der Samis 24/7-Läden.' }];
  };
  const verb = (it) => (it.use === 'scratch' ? 'Freirubbeln' : it.anim === 'smoke' ? 'Rauchen' : it.anim === 'drink' ? 'Trinken' : 'Essen');
  const render = () => {
    const r = rows();
    idx = Math.max(0, Math.min(idx, r.length - 1));
    const cur = r[idx];
    const title = cat ? (cat === 'weapons' ? 'Waffen' : cats.find((c) => c[0] === cat)[1]) : 'Inventar';
    let desc = cur.desc || '';
    if (cur.kind === 'cat') desc = cur.n ? `${cur.n} ${cur.id === 'weapons' ? 'Waffe(n)' : 'Gegenstand/Gegenstände'} – auswählen zum Öffnen.` : 'Leer.';
    if (cur.kind === 'item') desc = `${desc}  ·  Auswählen: ${verb(ITEMS[cur.id])}`;
    $('ui-layer').innerHTML = `<div class="im">
      <div class="im-banner"><b>${esc(P.name || 'Leo').toUpperCase()}</b><span>Port Solera</span></div>
      <div class="im-sub"><b>${title.toUpperCase()}</b><span>${idx + 1}/${r.length}</span></div>
      <div class="im-list">${r.map((x, i) => `<button class="im-row ${i === idx ? 'on' : ''} ${x.kind}" data-i="${i}"><span>${x.icon ? x.icon + ' ' : ''}${esc(x.name)}</span><em>${x.kind === 'cat' ? (x.n ? x.n + ' ›' : '›') : x.kind === 'weapon' && P.weapon === x.id ? '✔ ' + esc(x.val) : esc(x.val || '')}</em></button>`).join('')}</div>
      <div class="im-desc">${esc(desc)}</div>
      <div class="im-keys">${cat ? '<button data-back>‹ Zurück</button>' : ''}<button data-x>Schließen</button></div>
    </div>`;
  };
  const activate = () => {
    const r = rows(), cur = r[idx]; if (!cur) return;
    G.audio.click();
    if (cur.kind === 'cat') { cat = cur.id; idx = 0; render(); return; }
    if (cur.kind === 'weapon') { P.weapon = cur.id; G.hud.weapon(); render(); return; }
    if (cur.kind === 'item') Inventory.use(cur.id);
  };
  if (!open('', 'ui-im')) return;
  render();
  const key = (e) => {
    if (!G.ui.isOpen || !document.querySelector('.im')) { window.removeEventListener('keydown', key, true); return; }
    const n = rows().length;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { idx = (idx + 1) % n; render(); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { idx = (idx - 1 + n) % n; render(); }
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') activate();
    else if (e.code === 'Backspace' || e.code === 'ArrowLeft' || e.code === 'KeyA') { if (cat) { cat = null; idx = 0; render(); } else { close(); } }
    else if (e.code === 'Escape' || e.code === 'KeyI') close();
    else return;
    e.preventDefault(); e.stopPropagation();
  };
  window.addEventListener('keydown', key, true);
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) { if (!e.target.closest('.im')) close(); return; }
    if (t.dataset.x !== undefined) { close(); return; }
    if (t.dataset.back !== undefined) { cat = null; idx = 0; render(); G.audio.click(); return; }
    if (t.dataset.i !== undefined) { const i = +t.dataset.i; if (i === idx || G.isTouch) { idx = i; activate(); } else { idx = i; render(); G.audio.click(); } }
  };
}

// ------------------------------------------------------------ Spielautomat
const SYMS = [['🍒', 30, 5], ['🍋', 24, 8], ['🍊', 20, 12], ['🔔', 12, 20], ['⭐', 8, 40], ['💎', 4, 100], ['7️⃣', 2, 250]];
const pickSym = () => { let r = Math.random() * SYMS.reduce((s, x) => s + x[1], 0); for (const s of SYMS) { if ((r -= s[1]) < 0) return s[0]; } return SYMS[0][0]; };
function slots() {
  let bet = 10, spinning = false;
  const H = 96;
  const reel = (i) => `<div class="sl-reel"><div class="sl-strip" id="sl-s${i}">${['🍒', '7️⃣', '🍋'].map((s) => `<div>${s}</div>`).join('')}</div></div>`;
  const html = `<div class="sl">
    <div class="sl-cab">
      <div class="sl-top"><div class="sl-bulbs">${'<i></i>'.repeat(14)}</div><b>LUCKY SOLERA</b><span>★ SLOT DELUXE ★</span></div>
      <div class="sl-window">${reel(0)}${reel(1)}${reel(2)}<div class="sl-line"></div></div>
      <div class="sl-msg" id="sl-msg">Viel Glück!</div>
      <div class="sl-row"><div class="sl-bets">${[5, 10, 25, 50, 100].map((b) => `<button data-bet="${b}" class="${b === bet ? 'on' : ''}">$${b}</button>`).join('')}</div></div>
      <div class="sl-row"><div class="sl-money" id="sl-money">${money(G.player.money)}</div><button class="sl-spin" id="sl-spin">DREHEN</button></div>
    </div>
    <div class="sl-lever" id="sl-lever"><i></i></div>
    <div class="sl-pay"><b>GEWINNE</b>${SYMS.slice().reverse().map(([s, , m]) => `<div><span>${s}${s}${s}</span><em>×${m}</em></div>`).join('')}<div><span>🍒🍒 ·</span><em>×2</em></div><div><span>Paar</span><em>×1</em></div><button class="sl-close" data-x>Aufstehen</button></div>
    <div class="sl-coins" id="sl-coins"></div>
  </div>`;
  if (!open(html, 'ui-slots')) return;
  const L = $('ui-layer');
  const spin = () => {
    if (spinning) return;
    const P = G.player;
    if (P.money < bet) { $('sl-msg').textContent = 'Nicht genug Geld!'; shake($('sl-msg')); return; }
    P.addMoney(-bet);
    $('sl-money').textContent = money(P.money);
    spinning = true;
    $('sl-lever').classList.remove('pull'); void $('sl-lever').offsetWidth; $('sl-lever').classList.add('pull');
    $('sl-msg').textContent = 'Die Walzen drehen …'; $('sl-msg').className = 'sl-msg';
    const res = [pickSym(), pickSym(), pickSym()];
    let tick = setInterval(() => G.audio.click(), 90);
    res.forEach((sym, i) => {
      const strip = $('sl-s' + i);
      const n = 26 + i * 8;
      const syms = [];
      for (let k = 0; k < n; k++) syms.push(pickSym());
      syms.push(sym, pickSym());
      strip.style.transition = 'none';
      strip.innerHTML = [pickSym()].concat(syms).map((s) => `<div>${s}</div>`).join('');
      strip.style.transform = 'translateY(0)';
      strip.classList.add('blur');
      void strip.offsetWidth;
      const dur = 1.3 + i * 0.55;
      strip.style.transition = `transform ${dur}s cubic-bezier(.15,.75,.25,1.04)`;
      strip.style.transform = `translateY(${-(n) * H}px)`;
      setTimeout(() => { strip.classList.remove('blur'); G.audio.thud(0.4); if (i === 2) { clearInterval(tick); finish(res); } }, dur * 1000);
    });
  };
  const finish = (r) => {
    spinning = false;
    let mult = 0;
    if (r[0] === r[1] && r[1] === r[2]) mult = SYMS.find((s) => s[0] === r[0])[2];
    else if (r.filter((s) => s === '🍒').length === 2) mult = 2;
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) mult = 1;
    const win = bet * mult, P = G.player, msg = $('sl-msg');
    if (win > 0) {
      P.addMoney(win);
      msg.textContent = mult >= 20 ? `JACKPOT! +${money(win)}` : mult > 1 ? `GEWINN! +${money(win)}` : `Einsatz zurück: ${money(win)}`;
      msg.className = 'sl-msg win' + (mult >= 20 ? ' big' : '');
      if (mult > 1) { G.audio.jingle(); coins(Math.min(60, 8 + mult)); }
    } else { msg.textContent = 'Leider nichts – nochmal?'; msg.className = 'sl-msg'; }
    $('sl-money').textContent = money(P.money);
  };
  const coins = (n) => {
    const box = $('sl-coins');
    for (let k = 0; k < n; k++) {
      const c = document.createElement('i');
      c.textContent = Math.random() < 0.7 ? '🪙' : '💵';
      c.style.left = Math.random() * 100 + '%';
      c.style.animationDelay = Math.random() * 0.8 + 's';
      c.style.fontSize = 18 + Math.random() * 22 + 'px';
      box.appendChild(c);
      setTimeout(() => c.remove(), 2600);
    }
  };
  L.onclick = (e) => {
    const t = e.target.closest('button, #sl-lever'); if (!t) return;
    if (t.dataset && t.dataset.x !== undefined) { if (!spinning) close(); return; }
    if (t.dataset && t.dataset.bet) { if (spinning) return; bet = +t.dataset.bet; L.querySelectorAll('[data-bet]').forEach((b) => b.classList.toggle('on', +b.dataset.bet === bet)); G.audio.click(); return; }
    if (t.id === 'sl-spin' || t.id === 'sl-lever') spin();
  };
}

// ------------------------------------------------------------ Rubbellos
function scratch(tier = 1) {
  const gold = tier === 2;
  const amounts = gold ? [20, 50, 100, 250, 500, 1000, 5000] : [2, 5, 10, 20, 50, 100, 500];
  const weights = gold ? [30, 25, 18, 12, 8, 5, 2] : [30, 25, 18, 12, 8, 5, 2];
  const pickW = () => { let r = Math.random() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < amounts.length; i++) if ((r -= weights[i]) < 0) return amounts[i]; return amounts[0]; };
  const winChance = gold ? 0.42 : 0.3;
  const prize = Math.random() < winChance ? pickW() : 0;
  // Felder: bei Gewinn 3× den Betrag, sonst höchstens 2× jeden Betrag
  const cells = [];
  if (prize) cells.push(prize, prize, prize);
  const counts = {};
  if (prize) counts[prize] = 3;
  while (cells.length < 9) { const a = amounts[Math.floor(Math.random() * amounts.length)]; if ((counts[a] || 0) >= 2) continue; counts[a] = (counts[a] || 0) + 1; cells.push(a); }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const html = `<div class="sc">
    <div class="sc-card ${gold ? 'gold' : ''}">
      <div class="sc-head"><b>${gold ? 'GOLDRAUSCH' : 'GLÜCKSREGEN'}</b><span>3 gleiche Beträge = Gewinn!</span></div>
      <div class="sc-grid" id="sc-grid">${cells.map((a) => `<div class="sc-cell"><span>${gold ? '💰' : '🍀'}</span><b>$${a.toLocaleString('de-DE')}</b></div>`).join('')}<canvas id="sc-cv"></canvas></div>
      <div class="sc-foot" id="sc-foot">Mit dem Finger freirubbeln</div>
    </div>
    <div class="sc-btns"><button class="st-sec" id="sc-all">Alles aufdecken</button><button class="st-buy" id="sc-x" data-x>Fertig</button></div>
  </div>`;
  if (!open(html, 'ui-scratch')) return;
  const grid = $('sc-grid'), cv = $('sc-cv');
  const r = grid.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, cv.width, cv.height);
  grad.addColorStop(0, '#b9bec7'); grad.addColorStop(0.5, '#eef1f5'); grad.addColorStop(1, '#a3a9b3');
  g.fillStyle = grad; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.font = `${18 * dpr}px "Russo One", sans-serif`; g.textAlign = 'center';
  for (let y = 30 * dpr; y < cv.height; y += 48 * dpr) for (let x = 40 * dpr; x < cv.width; x += 110 * dpr) g.fillText('★ RUBBELN ★', x, y);
  g.globalCompositeOperation = 'destination-out';
  let done = false, down = false, last = null, checkT = 0;
  const reveal = () => {
    if (done) return; done = true;
    cv.style.transition = 'opacity .5s'; cv.style.opacity = 0;
    const foot = $('sc-foot');
    if (prize) {
      grid.querySelectorAll('.sc-cell').forEach((c, i) => { if (cells[i] === prize) c.classList.add('hit'); });
      G.player.addMoney(prize);
      foot.innerHTML = `<b class="sc-win">GEWONNEN: $${prize.toLocaleString('de-DE')}!</b>`;
      G.audio.jingle();
    } else { foot.textContent = 'Leider kein Gewinn. Nächstes Mal!'; G.audio.fail(); }
    $('sc-all').style.display = 'none';
  };
  const pos = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * dpr, (e.clientY - b.top) * dpr]; };
  const scr = (p) => {
    g.lineWidth = 34 * dpr; g.lineCap = 'round';
    g.beginPath(); g.moveTo(...(last || p)); g.lineTo(...p); g.stroke();
    g.beginPath(); g.arc(p[0], p[1], 17 * dpr, 0, 7); g.fill();
    last = p;
    if (++checkT % 6 === 0) {
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0, tot = 0;
      for (let i = 3; i < d.length; i += 4 * 40) { tot++; if (d[i] < 40) clear++; }
      if (clear / tot > 0.62) reveal();
    }
  };
  cv.addEventListener('pointerdown', (e) => { down = true; last = null; cv.setPointerCapture(e.pointerId); scr(pos(e)); if (checkT % 4 === 0) G.audio.noiseHit(0.08, 'highpass', 3000, 0.05); });
  cv.addEventListener('pointermove', (e) => { if (down && !done) { scr(pos(e)); if (checkT % 5 === 0) G.audio.noiseHit(0.06, 'highpass', 3500, 0.04); } });
  cv.addEventListener('pointerup', () => { down = false; last = null; });
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'sc-all') reveal();
    if (t.dataset.x !== undefined) { if (!done) reveal(); setTimeout(() => close(), done ? 0 : 900); }
  };
}

// ------------------------------------------------------------ Autohaus
const PAINTS = [0xe63946, 0xffb703, 0x00b4d8, 0x111111, 0xf8f9fa, 0xf72585, 0x7cff6b, 0x5a189a, 0x8d99ae, 0xff7b00];
function dealer() {
  const I = G.interiors;
  const keys = Object.keys(CAR_SHOP);
  const cats = [['Alle', () => true], ['Sport', (k) => ['zephyra', 'vortex', 'brutus'].includes(k)], ['Alltag', (k) => ['kiwi', 'marina', 'atlas'].includes(k)], ['Gepanzert', (k) => ['kodiak', 'marshal', 'tank'].includes(k)], ['Nutz', (k) => ['coyote', 'hauler'].includes(k)], ['Extrem', (k) => ['brecher', 'tank'].includes(k)]];
  let cat = 0, sel = I.previewKey && CAR_SHOP[I.previewKey] ? I.previewKey : 'zephyra', col = I.previewCol || PAINTS[0], first = true;
  const stat = (v, max) => Math.max(6, Math.min(100, (v / max) * 100));
  const render = () => {
    const T = CAR_TYPES[sel], S = CAR_SHOP[sel], P = G.player;
    const ownedN = P.garage.filter((g) => g.key === sel).length;
    I.setPreview(sel, col);
    $('ui-layer').innerHTML = `<div class="dl ${first ? 'anim' : ''}">
      <div class="dl-hint"><b>${T.name}</b><span>${S.cls}</span></div>
      <div class="dl-panel">
        <header class="dl-h"><div><b>SOLERA</b> MOTORS<span>Neuwagen · Port Solera</span></div><div class="st-money" id="dl-money">${money(P.money)}</div><button class="st-x" data-x>✕</button></header>
        <nav class="st-tabs">${cats.map(([n], i) => `<button class="${i === cat ? 'on' : ''}" data-cat="${i}">${n}</button>`).join('')}</nav>
        <div class="dl-list">${keys.filter(cats[cat][1]).map((k) => `<button class="dl-car ${k === sel ? 'on' : ''}" data-car="${k}"><div><b>${CAR_TYPES[k].name}</b><span>${CAR_SHOP[k].cls}</span></div><em>${money(CAR_SHOP[k].price)}</em>${P.garage.some((g) => g.key === k) ? '<i>✓</i>' : ''}</button>`).join('')}</div>
        <div class="dl-detail">
          <h2>${T.name}</h2><p>${S.desc}</p>
          <div class="dl-stats">
            <div><span>Höchstgeschw.</span><i><s style="width:${stat(T.maxSpeed, 78)}%"></s></i><b>${Math.round(T.maxSpeed * 3.6)} km/h</b></div>
            <div><span>Beschleunigung</span><i><s style="width:${stat(T.accel, 20)}%"></s></i><b>${(100 / 3.6 / T.accel * 1.5).toFixed(1)} s</b></div>
            <div><span>Handling</span><i><s style="width:${stat(T.grip, 12.5)}%"></s></i><b>${Math.round(stat(T.grip, 12.5))}</b></div>
            <div><span>Robustheit</span><i><s style="width:${stat(T.hp, 1500)}%"></s></i><b>${Math.round(stat(T.hp, 1500))}</b></div>
          </div>
          <div class="dl-paint">${PAINTS.map((c) => `<button data-col="${c}" class="${c === col ? 'on' : ''}" style="--c:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>
          <div class="dl-buyrow"><div><span>Preis</span><b>${money(S.price)}</b>${ownedN ? `<em>Besitzt du ${ownedN}×</em>` : ''}</div><button class="st-buy" id="dl-buy">${P.money >= S.price ? 'Kaufen' : 'Zu teuer'}</button></div>
        </div>
      </div></div>`;
    first = false;
  };
  if (!open('', 'ui-dealer')) return;
  // Kamera kreist um den Drehteller, Auto links im Bild
  let a = 0.6;
  G.menuCam = (dt) => {
    a += dt * 0.22;
    const cam = G.camera, cx = 1500, cz = 446;
    cam.position.set(cx + Math.sin(a) * 9.5, 2.4, cz + Math.cos(a) * 9.5);
    const rx = Math.cos(a), rz = -Math.sin(a);
    cam.lookAt(cx + rx * 2.6, 0.9, cz + rz * 2.6);
    cam.fov = 50; cam.updateProjectionMatrix();
    I.turn.rotation.y += dt * 0.15;
  };
  render();
  $('ui-layer').onclick = (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.x !== undefined) { close(); G.cam.snap(); return; }
    if (t.dataset.cat) { cat = +t.dataset.cat; render(); return; }
    if (t.dataset.car) { sel = t.dataset.car; render(); G.audio.click(); return; }
    if (t.dataset.col) { col = +t.dataset.col; render(); return; }
    if (t.id === 'dl-buy') {
      const S = CAR_SHOP[sel], P = G.player;
      if (P.money < S.price) { shake(t); return; }
      P.addMoney(-S.price); G.audio.cash();
      P.garage.push({ key: sel, color: col, id: Date.now() });
      I.delivery = { key: sel, color: col };
      G.save.write();
      G.audio.jingle();
      const box = document.createElement('div');
      box.className = 'dl-bought';
      box.innerHTML = `<b>GEKAUFT!</b><span>${CAR_TYPES[sel].name}</span><small>Steht beim Verlassen vor dem Autohaus · Handy → Garage</small>`;
      $('ui-layer').appendChild(box);
      setTimeout(() => { box.remove(); render(); }, 2600);
    }
  };
}

const setOnClose = (f) => { onClose = f; };
export const UI = { store, kiosk, street, gunshop, bar, inventory, slots, scratch, dealer, close, open, setOnClose, money, isOpen: false };
