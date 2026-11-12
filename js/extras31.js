// 3.1: frei verschiebbare Touch-Tasten (Einstellungen), Erfolge (Achievements), Radio-Vorschau im Handy
import { G } from './state.js';
import { townAt } from './config.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------ Touch-Layout
const keyOf = (el) => el.id || (el.dataset.btn + (el.classList.contains('car') ? '@car' : el.classList.contains('foot') ? '@foot' : ''));
const buttons = () => [...document.querySelectorAll('#tbtns .tb[data-btn]'), $('weapon-box')].filter(Boolean);
export function applyTouchLayout() {
  const L = G.settings.tbLayout || {};
  document.documentElement.style.setProperty('--tbs', String(G.settings.tbScale || 1));
  for (const el of buttons()) {
    const p = L[keyOf(el)], par = el.offsetParent || el.parentElement;
    if (!p || !par) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; continue; }
    // Bildschirm-Anteile -> Pixel relativ zum Elterncontainer
    const pr = par.getBoundingClientRect();
    el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = Math.round(p[0] * window.innerWidth - pr.left - el.offsetWidth / 2) + 'px';
    el.style.top = Math.round(p[1] * window.innerHeight - pr.top - el.offsetHeight / 2) + 'px';
  }
}
export function editTouchLayout(done) {
  const body = document.body, prevState = G.state;
  G.state = 'menu';
  body.classList.add('tb-edit');
  const bar = document.createElement('div');
  bar.id = 'tb-editbar';
  bar.innerHTML = `<b>Tasten anordnen</b><span>Ziehe die Tasten an die gewünschte Stelle.</span>
    <button data-a="foot" class="on">Zu Fuß</button><button data-a="car">Im Fahrzeug</button>
    <label>Größe <input type="range" id="tb-size" min="0.7" max="1.4" step="0.05" value="${G.settings.tbScale || 1}"></label>
    <button data-a="reset">Zurücksetzen</button><button data-a="done" class="primary">Fertig</button>`;
  document.body.appendChild(bar);
  const L = G.settings.tbLayout = { ...(G.settings.tbLayout || {}) };
  let drag = null;
  const down = (e) => {
    const el = e.target.closest('.tb[data-btn], #weapon-box'); if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect();
    drag = { el, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
    el.classList.add('dragging');
  };
  const move = (e) => {
    if (!drag) return;
    e.preventDefault();
    const fx = Math.min(0.98, Math.max(0.02, (e.clientX - drag.dx) / window.innerWidth)), fy = Math.min(0.98, Math.max(0.04, (e.clientY - drag.dy) / window.innerHeight));
    L[keyOf(drag.el)] = [fx, fy];
    applyTouchLayout();
  };
  const up = () => { if (drag) drag.el.classList.remove('dragging'); drag = null; };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  $('tb-size').oninput = (e) => { G.settings.tbScale = +e.target.value; applyTouchLayout(); };
  bar.onclick = (e) => {
    const a = e.target.dataset && e.target.dataset.a;
    if (a === 'foot' || a === 'car') { body.classList.toggle('tb-edit-car', a === 'car'); for (const b of bar.querySelectorAll('[data-a="foot"],[data-a="car"]')) b.classList.toggle('on', b.dataset.a === a); }
    if (a === 'reset') { for (const k in L) delete L[k]; G.settings.tbScale = 1; $('tb-size').value = 1; applyTouchLayout(); }
    if (a === 'done') {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
      bar.remove(); body.classList.remove('tb-edit', 'tb-edit-car');
      G.save.writeSettings();
      G.state = prevState === 'menu' ? 'playing' : prevState;
      if (done) done();
    }
  };
}

// ------------------------------------------------------------ Erfolge
const S = () => G.stats, Pl = () => G.player, M = () => G.missions;
export const ACH = [
  ['firstcar', '🚗', 'Erster Coup', 'Klau dein erstes Auto.', () => S().carsStolen >= 1],
  ['speed200', '⚡', 'Lichtgeschwindigkeit', 'Erreiche 200 km/h.', () => S().bestSpeed >= 200],
  ['km50', '🛣️', 'Vielfahrer', 'Fahre insgesamt 50 km.', () => S().distanceDriven >= 50000],
  ['walk10', '👟', 'Wandersmann', 'Lauf 10 km zu Fuß.', () => S().distanceWalked >= 10000],
  ['m10', '📋', 'Profi', 'Erledige 10 Aufträge.', () => M().done.size >= 10],
  ['m30', '🏅', 'Urgestein', 'Erledige 30 Aufträge.', () => M().done.size >= 30],
  ['mall', '👑', 'Legende von Port Solera', 'Erledige alle Aufträge.', () => M().done.size >= M().list.length],
  ['shell10', '🐚', 'Muschelsammler', 'Finde 10 Neon-Muscheln.', () => M().shells.size >= 10],
  ['shellall', '💎', 'Strandgutkönig', 'Finde alle Neon-Muscheln.', () => M().shellPos && M().shells.size >= M().shellPos.length],
  ['stunt3', '🛹', 'Stuntman', 'Schaffe 3 Stuntsprünge.', () => Pl().stuntsDone.size >= 3],
  ['wanted5', '🚨', 'Staatsfeind Nr. 1', 'Erreiche 5 Fahndungssterne.', () => (S().maxWanted || 0) >= 5],
  ['evade10', '🏃', 'Nicht zu fassen', 'Häng die Polizei 10-mal ab.', () => S().copsEvaded >= 10],
  ['heli', '🚁', 'Hubschrauberjäger', 'Schieß einen Polizeihubschrauber ab.', () => (S().helisDown || 0) >= 1],
  ['boat', '⚓', 'Kapitän', 'Besitze ein eigenes Boot.', () => (Pl().boats || []).length >= 1],
  ['fly', '✈️', 'Über den Wolken', 'Flieg höher als 300 m.', () => (S().maxAlt || 0) >= 300],
  ['casino', '🎰', 'Glückspilz', 'Gewinne im Casino insgesamt $10.000.', () => (Pl().casinoStats && Pl().casinoStats.won >= 10000)],
  ['tuned', '🔧', 'Schrauber', 'Bau 5 Tuning-Teile ein.', () => (S().tuned || 0) >= 5],
  ['garage5', '🏎️', 'Autosammler', 'Besitze 5 Autos.', () => Pl().garage.length >= 5],
  ['rich', '💰', 'Millionär', 'Besitze $1.000.000.', () => Pl().money >= 1000000],
  ['wheel', '🎡', 'Ausblick', 'Fahr mit dem Riesenrad.', () => (S().wheelRides || 0) >= 1],
  ['nades', '💣', 'Feuerwerker', 'Wirf 10 Granaten.', () => (S().nades || 0) >= 10],
  ['sniper', '🎯', 'Adlerauge', 'Treffer aus über 120 m Entfernung.', () => (S().longShot || 0) >= 120],
  ['towns', '🗺️', 'Weltenbummler', 'Besuche alle Orte im Solera County.', () => Object.keys(S().towns || {}).length >= 7],
  ['taxi10', '🚕', 'Taxifahrer', 'Schließe 10 Taxifahrten ab.', () => M().taxiFares >= 10],
  ['harvest', '🌿', 'Grüner Daumen', 'Hilf auf der Farm in den Hügeln.', () => M().done.has('dz1')],
];
let achT = 0;
export function updateAchievements(dt) {
  achT -= dt;
  if (achT > 0 || !G.player || G.state !== 'playing') return;
  achT = 1.5;
  const P = Pl(); P.ach = P.ach || [];
  // Zusatz-Statistiken
  const v = P.inCar ? P.vehicle : null;
  if (v && v.T.plane && !v.grounded) S().maxAlt = Math.max(S().maxAlt || 0, v.y - G.world.groundHeight(v.x, v.z));
  S().maxWanted = Math.max(S().maxWanted || 0, G.police.level);
  const px = v ? v.x : P.x, pz = v ? v.z : P.z, tw = townAt(px, pz);
  if (tw) (S().towns = S().towns || {})[tw.key] = 1;
  for (const [id, icon, name, desc, test] of ACH) {
    if (P.ach.includes(id)) continue;
    let ok = false; try { ok = test(); } catch (e) { ok = false; }
    if (!ok) continue;
    P.ach.push(id);
    G.hud.bigToast(`${icon} ERFOLG: ${name.toUpperCase()}`, desc);
    if (G.audio.jingle) G.audio.jingle();
    break; // höchstens einer pro Prüfung
  }
}
export function achHTML() {
  const P = Pl(), got = new Set(P.ach || []);
  return `<div class="jb-sum"><b>${got.size}/${ACH.length}</b><span>Erfolge freigeschaltet</span><i style="--p:${(got.size / ACH.length) * 100}%"></i></div>`
    + ACH.map(([id, icon, name, desc]) => `<div class="jb-node ${got.has(id) ? 'done' : 'lock'}"><i>${got.has(id) ? icon : '🔒'}</i><div><b>${name}</b><span>${desc}</span></div></div>`).join('');
}
