// NEON COAST – Hauptprogramm
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './state.js';
import { World } from './world.js';
import { Environment } from './env.js';
import { CrowdRenderer, OUTFITS } from './models.js';
import { Effects } from './effects.js';
import { VehicleManager } from './vehicle.js';
import { PedManager } from './peds.js';
import { TrafficManager } from './traffic.js';
import { Police } from './police.js';
import { Combat, WEAPONS } from './combat.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { AudioSys, STATIONS } from './audio.js';
import { HUD } from './hud.js';
import { Missions, shopItems } from './missions.js';
import { Save } from './save.js';
import { Interiors } from './interiors.js';
import { Multiplayer } from './multiplayer.js';
import { fmtTime } from './utils.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
let composer = null, bloom = null;
let last = performance.now();
let fpsWatch = { t: 0, n: 0, acc: 0, done: false };

function detectQuality() {
  const s = G.settings.quality;
  if (s && s !== 'auto') return s;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const mem = navigator.deviceMemory || 4;
  const small = Math.min(screen.width, screen.height) < 500;
  if (touch && small) return 'low';
  if (touch) return 'medium';
  if (mem <= 2) return 'low';
  return 'high';
}

function setLoad(p, msg) { $('load-fill').style.width = Math.round(p * 100) + '%'; if (msg) $('load-msg').textContent = msg; }

async function boot() {
  Save.readSettings();
  G.save = Save;
  G.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch', G.isTouch);
  const q = G.quality = detectQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(pixelRatio(q));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  G.renderer = renderer;
  const scene = new THREE.Scene();
  G.scene = scene;
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.25, 2800);
  camera.position.set(200, 80, 200);
  G.camera = camera;

  setLoad(0.02, 'Port Solera wird erbaut …');
  const world = new World(scene, q);
  G.world = world;
  const env = new Environment(scene, renderer, q);
  world.env = env;
  env.setFogRange(q === 'low' ? 140 : 180, q === 'low' ? 520 : q === 'medium' ? 820 : 1050);
  await world.build(setLoad);

  G.crowd = new CrowdRenderer(scene, 180);
  G.crowd.setShadows(q === 'high');
  G.effects = new Effects(scene);
  G.vm = new VehicleManager(scene);
  G.peds = new PedManager();
  G.traffic = new TrafficManager();
  G.police = new Police(scene);
  G.combat = new Combat();
  const sh = world.pois.safehouse;
  G.player = new Player(sh.x, sh.z);
  G.player.visible = false;
  G.player.name = 'Leo'; G.player.contacts = new Set();
  G.cam = new CameraRig(camera);
  G.input = new Input(canvas);
  G.audio = new AudioSys();
  G.hud = new HUD();
  G.missions = new Missions();

  // Nachbearbeitung (Leuchteffekte)
  if (q !== 'low') {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(pixelRatio(q));
    composer.addPass(new RenderPass(scene, camera));
    const res = new THREE.Vector2(window.innerWidth, window.innerHeight);
    bloom = new UnrealBloomPass(res, 0.4, 0.35, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }
  G.player.x = 40; G.player.z = 0;
  G.timeOfDay = 18.2;
  env.update(0.016, G.timeOfDay, G.player);
  G.effects.setScale(window.innerHeight * renderer.getPixelRatio(), camera.fov);
  setLoad(0.95, 'Shader werden vorbereitet …');
  await new Promise((r) => setTimeout(r, 30));
  try { renderer.compile(scene, camera); } catch (e) { /* */ }
  setLoad(1, 'Fertig!');
  G.state = 'title';
  setupUI();
  window.addEventListener('resize', onResize);
  onResize();
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
  if (ios && !standalone) $('install-hint').classList.remove('hidden');
  requestAnimationFrame(frame);
}

function pixelRatio(q) {
  const dpr = window.devicePixelRatio || 1;
  return q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, G.isTouch ? 1.35 : 1.5) : Math.min(dpr, 2);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  G.effects.setScale(h * G.renderer.getPixelRatio(), G.camera.fov);
  G.hud.resize();
}

// ------------------------------------------------------------ Spielstart
// Welt für einen Spielstand vorbereiten (Spieler startet in seiner Wohnung)
function prepareWorld(d) {
  G.audio.init();
  const P = G.player;
  for (const v of [...G.vehicles]) v.remove();
  for (const p of [...G.peds.list]) G.peds.remove(p);
  P.contacts = new Set(); P.name = 'Leo';
  if (d) Save.apply(d);
  else { P.money = 250; G.timeOfDay = 16.5; G.applyLook(DEFAULT_LOOK); }
  if (!d || !d.look) applyOutfit(P.outfit || 0, !d);
  if (!G.missionsReady) { G.missions.init(); G.missionsReady = true; }
  if (!G.interiors) G.interiors = new Interiors(G.scene);
  P.state = 'foot'; P.visible = true;
  G.traffic.initParked();
  const sc = G.world.pois.safehouseCar;
  const car = G.vm.spawn(d && G.missions.progress >= 2 ? 'zephyra' : 'kiwi', sc.x, sc.z, sc.h, d && G.missions.progress >= 2 ? 0xe63946 : 0x4ecdc4);
  if (car) { car.parked = true; car.ownedByPlayer = true; P.lastVehicle = car; }
  for (let i = 0; i < 10; i++) G.traffic.spawnCar(sc.x, sc.z, 60, 200);
  G.interiors.enter('home');
}

function startGame(load) {
  const d = load ? Save.read() : null;
  prepareWorld(d);
  beginPlay(!d);
}

function beginPlay(isNew) {
  const P = G.player;
  G.cam.clearCine();
  G.state = 'playing';
  $('title').classList.add('hidden');
  $('creator').classList.add('hidden');
  G.hud.show(true);
  G.hud.weapon();
  G.hud.fadeIn();
  G.audio.station = 0;
  if (G.pendingMP) { G.pendingMP = false; setTimeout(openMultiplayer, 1200); }
  if (G.mp && G.mp.online) G.mp.sendLook();
  if (isNew) {
    Save.write();
    setTimeout(() => G.hud.bigToast('PORT SOLERA', `Willkommen zu Hause, ${P.name}.`), 600);
    setTimeout(() => G.hud.hint(G.isTouch
      ? 'Linker Daumen: <b>laufen</b> · rechts wischen: <b>umsehen</b>.<br>Am Bett (<b>S</b>) speichern · Tür (<b>X</b>) nach draußen.'
      : '<b>WASD</b> laufen · <b>Maus</b> umsehen · <b>F</b> einsteigen.<br>Am Bett (<b>S</b>) speichern · Tür (<b>X</b>) nach draußen.', 9), 3500);
    setTimeout(() => G.hud.hint('Schau mal bei <b>Samis Kiosk</b> (gelbes <b>24</b>) direkt neben deinem Haus vorbei.', 7), 14000);
  } else G.hud.toast(`Spielstand ${Save.slot} geladen`);
}

// ------------------------------------------------------------ Aussehen
const DEFAULT_LOOK = { skin: 0xd9a066, hair: 0x1b1b1b, hairStyle: 'short', shirt: 0xf6f1e9, pants: 0x2b3a55, shorts: false, shoes: 0xffffff, scale: 0.96 };
G.applyLook = function (L) {
  const P = G.player, K = P.look;
  K.skin.setHex(L.skin); K.hair.setHex(L.hair);
  K.shirt.setHex(L.shirt); K.sleeve.setHex(L.shirt);
  K.pants.setHex(L.pants); K.legs.setHex(L.shorts ? L.skin : L.pants);
  K.shoes.setHex(L.shoes); K.scale = L.scale || 0.96;
  K.bald = L.hairStyle === 'bald';
  K.hat = L.hairStyle === 'cap' ? new THREE.Color(L.hair === 0x111111 || L.hair === 0x1b1b1b ? 0x222a44 : L.hair) : null;
  P.hairStyle = L.hairStyle; P.shorts = !!L.shorts;
  P.lookData = { ...L };
};

const CR = {
  skin: [0xffdbac, 0xf1c27d, 0xe0ac69, 0xd9a066, 0xc68642, 0x8d5524, 0x5c3a21],
  hair: [0x111111, 0x3b2716, 0x6b4423, 0xb98b4e, 0xe6c27a, 0x8a3324, 0x9e9e9e, 0xff2e88, 0x19e6ff],
  shirt: [0xf6f1e9, 0x222222, 0xff4d6d, 0x3ec1d3, 0xffd166, 0x06d6a0, 0x9b5de5, 0x1d3557, 0xff8fab, 0xe76f51],
  pants: [0x2b3a55, 0x111111, 0x4a4e69, 0xd4c4a8, 0x6c584c, 0x264653, 0x7b8fa1, 0xe9d8a6],
  shoes: [0xffffff, 0x222222, 0xd62828, 0x3a86ff, 0x8b5a2b, 0xffd166],
};
const hx = (n) => '#' + n.toString(16).padStart(6, '0');
function openCreator() {
  prepareWorld(null);
  const P = G.player;
  G.state = 'creator';
  $('title').classList.add('hidden');
  $('creator').classList.remove('hidden');
  P.x = 1500; P.z = 304.5; P.yaw = Math.PI;
  G.cam.setCine(new THREE.Vector3(1500.9, 1.55, 301.2), new THREE.Vector3(1500, 1.15, 304.5));
  const L = { ...DEFAULT_LOOK };
  const row = (k, label) => `<div class="cr-row"><span>${label}</span><div class="cr-sw">${CR[k].map((c) => `<button data-k="${k}" data-v="${c}" style="--c:${hx(c)}" class="${L[k] === c ? 'on' : ''}"></button>`).join('')}</div></div>`;
  const render = () => {
    $('cr-opts').innerHTML = row('skin', 'Hautton') +
      `<div class="cr-row"><span>Frisur</span><div class="cr-seg">${[['short', 'Kurz'], ['bald', 'Glatze'], ['cap', 'Cap']].map(([v, n]) => `<button data-k="hairStyle" data-v="${v}" class="${L.hairStyle === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>` +
      row('hair', L.hairStyle === 'cap' ? 'Cap-Farbe' : 'Haarfarbe') + row('shirt', 'Oberteil') + row('pants', 'Hose') +
      `<div class="cr-row"><span>Schnitt</span><div class="cr-seg">${[[false, 'Lang'], [true, 'Shorts']].map(([v, n]) => `<button data-k="shorts" data-v="${v}" class="${L.shorts === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>` +
      row('shoes', 'Schuhe') +
      `<div class="cr-row"><span>Größe</span><input id="cr-size" type="range" min="0.88" max="1.04" step="0.01" value="${L.scale}"></div>`;
    $('cr-size').oninput = (e) => { L.scale = +e.target.value; G.applyLook(L); };
  };
  render();
  G.applyLook(L);
  $('cr-opts').onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k, v = b.dataset.v;
    L[k] = k === 'hairStyle' ? v : k === 'shorts' ? v === 'true' : +v;
    G.applyLook(L); render();
  };
  $('cr-rand').onclick = () => {
    const pk = (a) => a[Math.floor(Math.random() * a.length)];
    Object.assign(L, { skin: pk(CR.skin), hair: pk(CR.hair), shirt: pk(CR.shirt), pants: pk(CR.pants), shoes: pk(CR.shoes), hairStyle: pk(['short', 'short', 'bald', 'cap']), shorts: Math.random() < 0.3 });
    G.applyLook(L); render();
  };
  $('cr-go').onclick = () => {
    const name = ($('cr-name').value || '').replace(/[^\p{L}\p{N} \-]/gu, '').trim().slice(0, 14) || 'Leo';
    P.name = name;
    G.applyLook(L);
    G.interiors.enter('home');
    beginPlay(true);
  };
}

// ------------------------------------------------------------ Speicherplätze
function slotInfo(d) {
  if (!d) return '<span class="slot-empty">Leer</span>';
  const when = d.t ? new Date(d.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const prog = Math.min(d.progress || 0, 7);
  return `<b>${(d.name || 'Leo').replace(/[<>&]/g, '')}</b><span>${prog}/7 Aufträge · $${(d.money || 0).toLocaleString('de-DE')} · ${when}</span>`;
}
function showSlots(mode) {
  const list = Save.list();
  const html = `<div class="slots">${list.map((s) => `<button class="slot" data-n="${s.n}"><i>${s.n}</i><div>${slotInfo(s.data)}</div></button>`).join('')}</div>`;
  openPanel(mode === 'new' ? 'NEUES SPIEL – SPEICHERPLATZ' : 'SPIEL LADEN', html, [['Zurück', closePanel]]);
  $('dlg-body').querySelectorAll('.slot').forEach((b) => b.onclick = () => {
    const n = +b.dataset.n, d = Save.read(n);
    if (mode === 'load') { if (!d) return; Save.setSlot(n); closePanel(); startGame(true); return; }
    const go = () => { Save.setSlot(n); Save.clear(n); closePanel(); openCreator(); };
    if (d) openPanel('Überschreiben?', `Speicherplatz ${n} (${(d.name || 'Leo').replace(/[<>&]/g, '')}) wird überschrieben.`, [['Ja, überschreiben', go, 'primary'], ['Abbrechen', () => showSlots('new')]]);
    else go();
  });
}
function refreshTitle() {
  const n = Save.latest();
  $('btn-continue').classList.toggle('hidden', !n);
  $('btn-load').classList.toggle('hidden', !Save.exists());
  if (n) $('continue-info').innerHTML = slotInfo(Save.read(n));
}

function applyOutfit(i, keep = false) {
  const P = G.player, o = OUTFITS[i % OUTFITS.length];
  P.outfit = i % OUTFITS.length;
  if (keep) return;
  const L = { ...(P.lookData || DEFAULT_LOOK), shirt: o.shirt, pants: o.pants, shorts: o.shorts };
  G.applyLook(L);
}

// ------------------------------------------------------------ Menüs
function openPanel(title, html, buttons = []) {
  $('dlg-title').textContent = title;
  $('dlg-body').innerHTML = html;
  const bb = $('dlg-btns');
  bb.innerHTML = '';
  for (const [label, fn, cls] of buttons) {
    const b = document.createElement('button');
    b.className = 'mbtn small ' + (cls || '');
    b.textContent = label;
    b.onclick = (e) => { e.stopPropagation(); G.audio.click && G.audio.ready && G.audio.click(); fn(); };
    bb.appendChild(b);
  }
  $('dialog').classList.remove('hidden');
}
function closePanel() { $('dialog').classList.add('hidden'); }

function setPaused(on) {
  if (on && G.state === 'playing') {
    G.state = 'paused';
    $('pause').classList.remove('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    G.audio.suspend();
  } else if (!on && (G.state === 'paused' || G.state === 'menu')) {
    G.state = 'playing';
    $('pause').classList.add('hidden');
    closePanel();
    $('mapscreen').classList.add('hidden');
    G.audio.resume();
    last = performance.now();
  }
}

function showMap() {
  if (G.state === 'playing') { G.state = 'menu'; if (document.pointerLockElement) document.exitPointerLock(); }
  $('pause').classList.add('hidden');
  $('mapscreen').classList.remove('hidden');
  requestAnimationFrame(() => G.hud.drawBigMap());
}

function controlsHTML() {
  return `<div class="ctrl-h">TASTATUR &amp; MAUS</div><div class="ctrl-grid">
  <kbd>W A S D</kbd><span>Laufen / Fahren</span><kbd>Maus</kbd><span>Umsehen (Klick = Maus einfangen)</span>
  <kbd>Linksklick</kbd><span>Schlagen / Schießen</span><kbd>Rechtsklick</kbd><span>Zielen</span>
  <kbd>Shift</kbd><span>Rennen</span><kbd>Leertaste</kbd><span>Springen / Handbremse</span>
  <kbd>F / E</kbd><span>Ein- &amp; Aussteigen</span><kbd>Q / Mausrad</kbd><span>Waffe wechseln</span>
  <kbd>R</kbd><span>Radiosender</span><kbd>H</kbd><span>Hupe</span><kbd>C</kbd><span>Kamera (im Auto)</span>
  <kbd>G</kbd><span>Sirene (Streifenwagen)</span><kbd>M</kbd><span>Karte</span><kbd>Esc / P</kbd><span>Pause</span></div>
  <div class="ctrl-h">IPAD / TOUCH</div><div class="ctrl-grid">
  <kbd>Linker Daumen</kbd><span>Joystick: laufen bzw. lenken (nach vorne = Gas)</span>
  <kbd>Rechte Seite</kbd><span>Wischen zum Umsehen</span>
  <kbd>Tasten</kbd><span>Feuer, Sprung, Rennen · im Auto Gas, Bremse, Handbremse</span>
  <kbd>EIN / AUS</kbd><span>erscheint neben Fahrzeugen</span>
  <kbd>Minikarte</kbd><span>antippen für große Karte &amp; Wegpunkt</span>
  <kbd>Waffensymbol</kbd><span>antippen zum Wechseln</span></div>
  <div class="ctrl-h">GAMEPAD</div><div class="ctrl-grid">
  <kbd>Linker Stick</kbd><span>Laufen / Lenken</span><kbd>Rechter Stick</kbd><span>Kamera</span>
  <kbd>RT / LT</kbd><span>Feuer &amp; Zielen · Gas &amp; Bremse</span><kbd>A</kbd><span>Springen / Handbremse</span>
  <kbd>Y</kbd><span>Ein- &amp; Aussteigen</span><kbd>X</kbd><span>Waffe</span><kbd>LB</kbd><span>Radio</span></div>`;
}

function settingsHTML() {
  const s = G.settings;
  const opt = (v, l) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${l}</option>`;
  return `<div class="row"><label>Grafikqualität (aktuell: ${G.quality})</label><select id="set-q">${opt('auto', 'Automatisch')}${opt('low', 'Niedrig')}${opt('medium', 'Mittel')}${opt('high', 'Hoch')}</select></div>
  <div class="row"><label>Musik</label><input id="set-mus" type="range" min="0" max="1" step="0.05" value="${s.musicVol}"></div>
  <div class="row"><label>Effekte</label><input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfxVol}"></div>
  <div class="row"><label>Kamera-Empfindlichkeit</label><input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}"></div>
  <div class="row"><label>Y-Achse umkehren</label><input id="set-inv" type="checkbox" ${s.invertY ? 'checked' : ''}></div>
  <div class="row"><label>FPS anzeigen</label><input id="set-fps" type="checkbox" ${s.showFps ? 'checked' : ''}></div>`;
}
function bindSettings() {
  const s = G.settings;
  const q0 = s.quality;
  $('set-mus').oninput = (e) => { s.musicVol = +e.target.value; G.audio.applyVolumes(); Save.writeSettings(); };
  $('set-sfx').oninput = (e) => { s.sfxVol = +e.target.value; G.audio.applyVolumes(); Save.writeSettings(); };
  $('set-sens').oninput = (e) => { s.sensitivity = +e.target.value; Save.writeSettings(); };
  $('set-inv').onchange = (e) => { s.invertY = e.target.checked; Save.writeSettings(); };
  $('set-fps').onchange = (e) => { s.showFps = e.target.checked; Save.writeSettings(); };
  $('set-q').onchange = (e) => {
    s.quality = e.target.value; Save.writeSettings();
    if (s.quality !== q0) {
      openPanel('Grafikqualität', 'Die neue Qualität wird nach einem Neustart aktiv. Dein Spiel wird vorher gespeichert.', [
        ['Jetzt neu starten', () => { if (G.state !== 'title') Save.write(); location.reload(); }, 'primary'],
        ['Später', closePanel],
      ]);
    }
  };
}

function statsHTML() {
  const S = G.stats, M = G.missions, P = G.player;
  const km = (m) => (m / 1000).toFixed(1) + ' km';
  return `<div class="kv">
  <span>Story-Fortschritt</span><b>${Math.min(M.progress, M.story.length)}/${M.story.length} Aufträge</b>
  <span>Neon-Muscheln</span><b>${M.shells.size}/${M.shellPos ? M.shellPos.length : 20}</b>
  <span>Stuntsprünge</span><b>${P.stuntsDone.size}/${G.world.ramps.length}</b>
  <span>Taxi-Fahrten</span><b>${M.taxiFares}</b>
  <span>Spielzeit</span><b>${fmtTime(S.playTime)}</b>
  <span>Gefahrene Strecke</span><b>${km(S.distanceDriven)}</b>
  <span>Zu Fuß</span><b>${km(S.distanceWalked)}</b>
  <span>Höchstgeschwindigkeit</span><b>${Math.round(S.bestSpeed)} km/h</b>
  <span>Fahrzeuge „geliehen“</span><b>${S.carsStolen}</b>
  <span>Schüsse</span><b>${S.shotsFired}</b>
  <span>Sprünge</span><b>${S.stunts}</b>
  <span>Polizei abgehängt</span><b>${S.copsEvaded}×</b></div>`;
}


// ------------------------------------------------------------ Menüs im Spiel & Handy
G.openMenu = function (title, html, items) {
  if (G.state !== 'playing') return;
  G.state = 'menu';
  if (document.pointerLockElement) document.exitPointerLock();
  const close = () => { closePanel(); G.state = 'playing'; last = performance.now(); };
  openPanel(title, html, items.map(([label, fn, cls]) => [label, () => { close(); fn && fn(); }, cls]).concat([['Schließen', close]]));
};

let phoneOpen = false;
const ICON = {
  contacts: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>',
  messages: '<svg viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  stats: '<svg viewBox="0 0 24 24"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="4" fill="#0b0716"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1-.7-.4-1 1-2-1.8-1.8-2 1-1-.4L14 3h-4l-.7 2.1-1 .4-2-1-1.8 1.8 1 2-.4 1L3 10v4l2.1.7.4 1-1 2 1.8 1.8 2-1 1 .4L10 21h4l.7-2.1 1-.4 2 1 1.8-1.8-1-2 .4-1L21 14z"/></svg>',
  mp: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.7"/><path d="M2 20c0-3.6 2.7-6 6-6s6 2.4 6 6zm12.2 0c.1-2.2-.6-4.1-1.9-5.4 3.4-.9 7.7.9 7.7 5.4z"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2 2v5h9V5zm5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
};
const APPS = [['contacts', 'Kontakte', '#34c759,#0a8f3c'], ['messages', 'Nachrichten', '#19e6ff,#1567d3'], ['map', 'Karte', '#ff9f1c,#e8590c'], ['radio', 'Radio', '#ff2e88,#a01458'],
  ['stats', 'Statistik', '#b26bff,#5b2bb5'], ['photo', 'Kamera', '#8e9aaf,#3a4357'], ['settings', 'Einstellungen', '#6c7a91,#2b3445'], ['save', 'Speichern', '#ffd23f,#d18e00'], ['mp', 'Multiplayer', '#4dd2ff,#2b5bd3']];

function openPhone() {
  if (G.state !== 'playing' || G.player.state === 'dead' || G.player.state === 'busted') return;
  G.state = 'menu'; phoneOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  $('phone').classList.remove('hidden', 'closing');
  phoneHome();
  if (G.audio.ready) G.audio.click();
}
function closePhone() {
  if (!phoneOpen) return;
  phoneOpen = false;
  $('phone').classList.add('closing');
  setTimeout(() => { if (!phoneOpen) $('phone').classList.add('hidden'); }, 220);
  if (G.state === 'menu') { G.state = 'playing'; last = performance.now(); }
}
function phoneScreen(title, html, back = true) {
  $('ph-time').textContent = $('clock').textContent;
  const el = $('ph-screen');
  el.innerHTML = (back ? `<div class="ph-head"><button class="ph-back" data-ph="home" aria-label="Zurück">‹</button><b>${title}</b></div>` : '') + `<div class="ph-content">${html}</div>`;
  el.classList.remove('ph-anim'); void el.offsetWidth; el.classList.add('ph-anim');
}
function phoneHome() {
  const P = G.player, lvl = G.police.level;
  const night = G.world.env.night > 0.5;
  const goal = nextHint();
  phoneScreen('', `<div class="ph-wall ${night ? 'night' : ''}"><div class="ph-clock">${$('clock').textContent}</div><div class="ph-date">Port Solera · ${night ? 'Nacht' : 'Tag'} · ${night ? '21°' : '29°'}</div></div>
    <div class="ph-widgets">
      <div class="ph-w wide"><small>NÄCHSTES ZIEL</small><span>${goal}</span></div>
      <div class="ph-w"><small>KONTO</small><b class="money">$${P.money.toLocaleString('de-DE')}</b></div>
      <div class="ph-w"><small>FAHNDUNG</small><b class="stars">${'★'.repeat(lvl)}<i>${'★'.repeat(5 - lvl)}</i></b></div>
    </div>
    <div class="ph-apps">${APPS.map(([id, n, g]) => `<button class="ph-app" data-ph="${id}"><span style="background:linear-gradient(145deg,${g})">${ICON[id]}</span>${n}</button>`).join('')}</div>`, false);
}
function nextHint() {
  const M = G.missions;
  if (M.active && !M.active.side) return 'Aktueller Auftrag: ' + ($('objective').innerText || M.active.title);
  const def = M.story[M.progress];
  if (def) return `Auftrag bei ${G.world.pois[def.giver].name} (gelbes ${def.label} auf der Karte)`;
  return 'Geschichte erledigt – such Neon-Muscheln, Stuntsprünge oder probier die Bank.';
}
const CONTACTS = [
  { id: 'rosa', name: 'Tante Rosa', role: "Rosa's Diner", col: '#ff8fab', lines: ['Hast du heute schon was Richtiges gegessen?', 'Pass auf dich auf, mijo.', 'Im Diner gibt\'s heute Fischtacos!'] },
  { id: 'sami', need: 'sami', name: 'Sami', role: 'Kiosk nebenan', col: '#ffd23f', lines: ['Na, Nachbar? Der Kiosk hat immer offen.', 'Ich hab da was läuten hören … ich melde mich, wenn es konkret wird.', 'Frische Zeitung ist da, komm vorbei!'] },
  { id: 'dex', name: 'Dex', role: 'Werkstatt', col: '#ffb703', lines: ['Na, wieder was kaputt gemacht?', 'Ich hab immer einen Wagen für dich.'] },
  { id: 'val', name: 'Val', role: 'Club Velvet', col: '#b26bff', lines: ['Ruf mich nur an, wenn es wichtig ist.', 'Die Bank in Downtown hat erstaunlich wenig Wachpersonal …'] },
  { id: 'anwalt', name: 'Kessler', role: 'Anwalt', col: '#8e9aaf', lines: ['Kessler & Partner. Wir lösen Probleme mit der Polizei.'] },
  { id: 'club', name: 'Club Velvet', role: 'Nachtclub', col: '#ff2e88', lines: ['Heute Nacht: DJ-Set & Show! Eingang am Club Velvet, Midtown-Ost.'] },
];
const avatar = (c, big = false) => `<i class="ph-av ${big ? 'big' : ''}" style="--c:${c.col}">${c.name[0]}</i>`;
function contactList() {
  const P = G.player;
  return CONTACTS.filter((c) => !c.need || (P.contacts && P.contacts.has(c.need)));
}
function phoneContact(c) {
  const P = G.player;
  let actions = '';
  if (c.id === 'dex') {
    actions += `<button class="ph-btn2" data-act="car">🚗 Auto liefern lassen <em>$250</em></button>`;
    if (P.inCar) actions += `<button class="ph-btn2" data-act="repair">🔧 Wagen reparieren <em>$150</em></button>`;
  }
  if (c.id === 'anwalt') actions += G.police.level > 0 ? `<button class="ph-btn2" data-act="lawyer">⚖️ Fahndung löschen <em>$${G.police.level * 600}</em></button>` : '<div class="ph-note">Du wirst gerade nicht gesucht.</div>';
  phoneScreen(c.name, `<div class="ph-profile">${avatar(c, true)}<b>${c.name}</b><span>${c.role}</span></div>
    <div class="ph-quick"><button data-call="1"><span>📞</span>Anrufen</button><button data-call="2"><span>💬</span>Nachricht</button></div>
    <div id="ph-convo"></div><div class="ph-actions">${actions}</div>`);
  const talk = (txt) => { const box = $('ph-convo'); const d = document.createElement('div'); d.className = 'ph-bubble in'; d.textContent = txt; box.appendChild(d); };
  $('ph-screen').querySelectorAll('[data-call]').forEach((b) => b.onclick = () => {
    $('ph-convo').innerHTML = '';
    talk(c.lines[Math.floor(Math.random() * c.lines.length)]);
    if (['rosa', 'val', 'dex', 'sami'].includes(c.id)) setTimeout(() => talk(nextHint() + '.'), 450);
    if (G.audio.ready) G.audio.click();
  });
  $('ph-screen').querySelectorAll('[data-act]').forEach((b) => b.onclick = () => phoneAction(b.dataset.act));
}
function phoneAction(a) {
  const P = G.player;
  const pay = (n) => { if (P.money < n) { G.hud.toast('Nicht genug Geld.'); return false; } P.addMoney(-n); return true; };
  if (a === 'car') {
    if (G.interior) { G.hud.toast('Dex: Ich kann dir kein Auto in ein Gebäude stellen!'); return; }
    if (P.inCar) { G.hud.toast('Dex: Du sitzt doch schon in einem Auto.'); return; }
    if (!pay(250)) return;
    const n = G.world.nearestNode(P.x, P.z);
    const o = G.world.nodes[n.nbr[Math.floor(Math.random() * n.nbr.length)]];
    const dx = Math.sign(o.x - n.x), dz = Math.sign(o.z - n.z);
    const x = n.x + dx * 22 - dz * 6, z = n.z + dz * 22 + dx * 6;
    const key = G.missions.progress >= 5 ? 'vortex' : G.missions.progress >= 2 ? 'zephyra' : 'brutus';
    const v = G.vm.spawn(key, x, z, Math.atan2(dx, dz));
    if (v) {
      v.parked = true; v.ownedByPlayer = true; v.missionCar = true; P.lastVehicle = v;
      setTimeout(() => { v.missionCar = false; }, 60000);
      G.hud.toast(`Dex: Dein ${v.T.name} steht bereit – blauer Punkt auf der Karte.`);
    }
    closePhone();
  } else if (a === 'repair') {
    if (!P.inCar) return;
    if (!pay(150)) return;
    const v = P.vehicle; v.health = v.maxHealth; v.onFire = false;
    G.hud.toast('Dex: Wie neu!'); closePhone();
  } else if (a === 'lawyer') {
    if (G.police.locked || G.police.minLevel > 0) { G.hud.toast('Kessler: Da kann selbst ich nichts machen.'); return; }
    if (!pay(G.police.level * 600)) return;
    G.police.setLevel(0, true); G.police.clear();
    G.hud.toast('Kessler: Erledigt. Die Akte ist verschwunden.'); closePhone();
  }
}
function phoneMessages() {
  const p = G.missions.progress, P = G.player;
  const msgs = [['rosa', `Willkommen zurück, ${P.name}! Komm im Diner vorbei.`]];
  if (P.contacts && P.contacts.has('sami')) msgs.push(['sami', 'Schön, dass du jetzt nebenan wohnst. Wenn ich was höre, melde ich mich!']);
  if (p >= 1) msgs.push(['dex', 'Hab gehört, du kannst fahren. Komm in die Werkstatt.']);
  if (p >= 3) msgs.push(['val', 'Dex sagt, du bist zuverlässig. Wir sollten reden. Club Velvet.']);
  if (p >= 4) msgs.push(['club', 'Du stehst ab sofort auf der Gästeliste. 🪩']);
  if (p >= 6) msgs.push(['val', 'Bereite dich vor. Das große Ding steht an.']);
  if (p >= 7) msgs.push(['val', 'Die Bank hat schon wieder aufgefüllt … nur so als Info. 😉']);
  const byId = Object.fromEntries(CONTACTS.map((c) => [c.id, c]));
  phoneScreen('Nachrichten', msgs.reverse().map(([id, t]) => { const c = byId[id]; return `<div class="ph-msg">${avatar(c)}<div><b>${c.name}</b><span>${t}</span></div></div>`; }).join(''));
}
function phoneRadio() {
  const A = G.audio;
  const n = A.tracks ? A.tracks.length : 0;
  const cur = A.ready ? A.stationInfo(A.station) : STATIONS[A.station];
  phoneScreen('Radio', `<div class="ph-now"><div class="eq"><i></i><i></i><i></i><i></i><i></i></div><b>${cur.name}</b><span>${cur.genre || ''}</span>
      <div class="ph-ctrl"><button data-step="-1">⏮</button><button data-step="1">⏭</button></div></div>`
    + STATIONS.map((s, i) => { const info = A.ready ? A.stationInfo(i) : s; return `<button class="ph-row ${A.station === i ? 'on' : ''}" data-st="${i}"><b>${info.name}</b><span>${info.genre || ''}</span></button>`; }).join('')
    + `<div class="ph-actions"><button class="ph-btn2" data-mus="add">🎵 Eigene Musik hinzufügen</button>${n ? `<button class="ph-btn2" data-mus="clear">🗑 Eigene Musik löschen (${n})</button>` : ''}</div>
       <div class="ph-note">Das Radio läuft im Auto. „Mein Radio“ spielt Songs von deinem Gerät.</div>`);
  const set = (i) => { A.station = (i + STATIONS.length) % STATIONS.length; A.nextBar = 0; if (A.ready) G.hud.radio(A.stationInfo(A.station)); phoneRadio(); };
  $('ph-screen').querySelectorAll('[data-st]').forEach((b) => b.onclick = () => set(+b.dataset.st));
  $('ph-screen').querySelectorAll('[data-step]').forEach((b) => b.onclick = () => set(A.station + +b.dataset.step));
  $('ph-screen').querySelectorAll('[data-mus]').forEach((b) => b.onclick = async () => {
    if (!A.ready) A.init();
    if (b.dataset.mus === 'add') $('music-file').click();
    else { await A.clearLibrary(); G.hud.toast('Eigene Musik gelöscht'); phoneRadio(); }
  });
}
function setupPhone() {
  $('music-file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    if (!G.audio.ready) G.audio.init();
    const n = await G.audio.addFiles(files);
    G.hud.toast(n ? `${n} Song(s) zu „Mein Radio“ hinzugefügt` : 'Keine Audiodateien gefunden');
    if (phoneOpen) phoneRadio();
  });
  $('phone-btn').addEventListener('click', () => openPhone());
  $('phone-btn').addEventListener('touchend', (e) => { e.preventDefault(); openPhone(); });
  $('ph-home').onclick = () => (phoneOpen ? phoneHome() : null);
  $('ph-close').onclick = () => closePhone();
  $('ph-backdrop').onclick = () => closePhone();
  $('ph-screen').addEventListener('click', (e) => {
    const el = e.target.closest('[data-ph], [data-ct]');
    if (!el) return;
    if (el.dataset.ct) { phoneContact(CONTACTS.find((c) => c.id === el.dataset.ct)); return; }
    const app = el.dataset.ph;
    if (app === 'home') phoneHome();
    else if (app === 'contacts') phoneScreen('Kontakte', contactList().map((c) => `<button class="ph-contact" data-ct="${c.id}">${avatar(c)}<div><b>${c.name}</b><span>${c.role}</span></div><em>›</em></button>`).join(''));
    else if (app === 'messages') phoneMessages();
    else if (app === 'radio') phoneRadio();
    else if (app === 'stats') phoneScreen('Statistik', statsHTML());
    else if (app === 'map') { closePhone(); showMap(); }
    else if (app === 'settings') { closePhone(); setPaused(true); openPanel('EINSTELLUNGEN', settingsHTML(), [['Zurück', closePanel]]); bindSettings(); }
    else if (app === 'mp') { closePhone(); openMultiplayer(); }
    else if (app === 'save') {
      if (G.missions.active && !G.missions.active.side) G.hud.toast('Während eines Auftrags kann nicht gespeichert werden.');
      else { Save.write(); G.hud.toast(`Gespeichert in Speicherplatz ${Save.slot}`); }
      closePhone();
    }
    else if (app === 'photo') { closePhone(); document.body.classList.add('photo'); G.hud.toast('Fotomodus – zum Beenden irgendwo tippen oder Esc'); setTimeout(() => { const off = () => { document.body.classList.remove('photo'); window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', off); }; window.addEventListener('pointerdown', off); window.addEventListener('keydown', off); }, 300); }
  });
}


// ------------------------------------------------------------ Multiplayer-Menü
function openMultiplayer() {
  if (G.state === 'playing') { G.state = 'menu'; if (document.pointerLockElement) document.exitPointerLock(); }
  else if (G.state !== 'paused' && G.state !== 'menu') return;
  const fromPause = G.state === 'paused';
  const close = () => { G.mp.onChange = null; closePanel(); if (G.state === 'menu') { G.state = 'playing'; last = performance.now(); } };
  const render = () => {
    const M = G.mp, P = G.player;
    let html;
    if (M.status === 'offline') {
      html = `<p class="mp-p">Spielt zusammen in Port Solera! Einer <b>hostet</b> ein Spiel und bekommt einen Code, die anderen <b>treten bei</b>, indem sie den Code eingeben. Bis zu 4 Spieler.</p>
        <button class="mbtn primary mp-big" id="mp-host">🌐 Spiel hosten</button>
        <div class="mp-join"><input id="mp-code" maxlength="5" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="mbtn" id="mp-joinbtn">Beitreten</button></div>
        ${M.lastError ? `<div class="mp-err">${M.lastError}</div>` : ''}
        <small class="mp-small">Beide Geräte brauchen Internet. Ihr seht euch gegenseitig, fahrt zusammen, könnt chatten und euch duellieren. Verkehr und Passanten laufen auf jedem Gerät eigenständig.</small>`;
    } else if (M.status === 'connecting') {
      html = `<div class="mp-wait"><i class="mp-spin"></i>Verbinde …</div>`;
    } else {
      const list = [`<div class="mp-pl me"><i style="background:${'#' + P.look.shirt.getHexString()}"></i><b>${P.name}</b><span>${M.host ? 'Host · Du' : 'Du'}</span></div>`]
        .concat([...M.remotes()].map((r) => `<div class="mp-pl"><i style="background:#${new THREE.Color(r.look ? r.look.shirt : 0x4dd2ff).getHexString()}"></i><b>${r.name.replace(/[<>&]/g, '')}</b><span>${r.visible ? 'im Spiel' : 'verbindet …'}</span></div>`));
      html = `<div class="mp-code"><small>RAUM-CODE</small><b>${M.code}</b><span>${M.host ? 'Gib diesen Code deinen Freunden.' : 'Du bist verbunden.'}</span></div>
        <div class="mp-list">${list.join('')}</div>
        ${M.host && !M.conns.size ? '<div class="mp-wait small"><i class="mp-spin"></i>Warte auf Mitspieler …</div>' : ''}
        <div class="mp-join"><input id="mp-msg" maxlength="80" placeholder="Nachricht an alle …" autocomplete="off"><button class="mbtn" id="mp-send">Senden</button></div>`;
    }
    const btns = M.status === 'online' ? [['Multiplayer verlassen', () => { M.leave(); }], ['Schließen', close, 'primary']] : [['Schließen', close]];
    openPanel('MULTIPLAYER', html, btns);
    const host = $('mp-host'), join = $('mp-joinbtn'), send = $('mp-send');
    if (host) host.onclick = async () => { M.lastError = null; try { await M.hostGame(); } catch (e) { /* Meldung kommt per Toast */ } };
    if (join) join.onclick = async () => { M.lastError = null; try { await M.joinGame($('mp-code').value); } catch (e) { M.lastError = e.message || M.lastError; render(); } };
    if (send) { const go = () => { M.chat($('mp-msg').value); $('mp-msg').value = ''; }; send.onclick = go; $('mp-msg').onkeydown = (e) => { if (e.key === 'Enter') go(); }; }
    const code = $('mp-code'); if (code) code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  };
  G.mp.onChange = () => { if (!$('dialog').classList.contains('hidden') && $('dlg-title').textContent === 'MULTIPLAYER') render(); };
  render();
}

// Kiosk
G.openShop = function (kind) {
  const P = G.player;
  const pay = (n) => { if (P.money < n) { G.hud.toast('Nicht genug Geld.'); return false; } P.addMoney(-n); G.audio.cash(); return true; };
  G.openMenu('SAMIS KIOSK', `Sami: „Was darf's sein, ${P.name}?“`, [
    ['Sandwich – $6 (+25 Gesundheit)', () => { if (pay(6)) { P.health = Math.min(100, P.health + 25); G.hud.toast('Lecker!'); } }],
    ['Energy-Drink – $4 (+15 Gesundheit)', () => { if (pay(4)) { P.health = Math.min(100, P.health + 15); G.hud.toast('Hellwach!'); } }],
    ['Zigaretten – $8', () => { if (pay(8)) G.hud.toast('Eine Schachtel eingesteckt. Gesund ist das nicht …'); }],
    ['Rubbellos – $5', () => { if (!pay(5)) return; if (Math.random() < 0.18) { const w = [20, 50, 100, 250, 500][Math.floor(Math.random() * 5)]; P.addMoney(w, `Gewonnen! +$${w}`); } else G.hud.toast('Leider eine Niete.'); }],
    ['Zeitung – $2', () => { if (pay(2)) G.hud.toast('Schlagzeile: ' + nextHint()); }],
  ]);
};

G.openService = function (kind) {
  if (G.state !== 'playing') return;
  G.state = 'menu';
  G.missions.uiOpen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  const close = () => { closePanel(); G.missions.uiOpen = false; G.state = 'playing'; last = performance.now(); };
  if (kind === 'gunshop') {
    const render = () => {
      const items = shopItems();
      const html = `<div style="opacity:.85">Dein Geld: <b style="color:#7dffa0">$${G.player.money}</b></div>` + items.map((it, i) =>
        `<div class="shop-item"><span>${it.name}</span><span class="price">$${it.price}</span><button class="mbtn small" data-i="${i}" ${G.player.money < it.price ? 'disabled' : ''}>Kaufen</button></div>`).join('');
      openPanel('WAFFENLADEN', html, [['Schließen', close]]);
      $('dlg-body').querySelectorAll('button[data-i]').forEach((b) => b.onclick = () => {
        const it = items[+b.dataset.i];
        if (G.player.money >= it.price) { G.player.addMoney(-it.price); it.buy(); G.audio.cash(); G.hud.weapon(); render(); }
      });
    };
    render();
  } else if (kind === 'safehouse') {
    openPanel('DEINE WOHNUNG', `Hier bist du sicher. Speicherplatz ${Save.slot}.`, [
      ['Speichern & ausruhen', () => { G.player.health = 100; Save.write(); G.hud.toast(`Gespeichert in Speicherplatz ${Save.slot} · Gesundheit aufgefüllt`); close(); }, 'primary'],
      ['Schlafen (+6 Std.)', () => { G.timeOfDay = (G.timeOfDay + 6) % 24; G.player.health = 100; Save.write(); G.hud.fadeIn(); G.hud.toast('Gut geschlafen. Spiel gespeichert.'); close(); }],
      [`Outfit wechseln`, () => { applyOutfit((G.player.outfit || 0) + 1); G.hud.toast('Outfit: ' + OUTFITS[G.player.outfit].name); }],
      ['Schließen', close],
    ]);
  }
};

function setupUI() {
  $('btn-new').onclick = () => { if (!G.audio.ready) G.audio.init(); showSlots('new'); };
  $('btn-load').onclick = () => showSlots('load');
  $('btn-continue').onclick = () => { Save.setSlot(Save.latest()); startGame(true); };
  refreshTitle();
  G.mp = new Multiplayer();
  $('btn-mp').onclick = () => {
    if (!G.audio.ready) G.audio.init();
    const n = Save.latest();
    if (n) { Save.setSlot(n); startGame(true); setTimeout(openMultiplayer, 700); }
    else { G.pendingMP = true; showSlots('new'); }
  };
  $('btn-controls').onclick = () => openPanel('STEUERUNG', controlsHTML(), [['Schließen', closePanel]]);
  $('btn-settings').onclick = () => { openPanel('EINSTELLUNGEN', settingsHTML(), [['Schließen', closePanel]]); bindSettings(); };
  setupPhone();
  $('pause-btn').addEventListener('click', () => setPaused(true));
  $('pause-btn').addEventListener('touchend', (e) => { e.preventDefault(); setPaused(true); });
  $('minimap').addEventListener('click', () => { if (G.state === 'playing') showMap(); });
  $('minimap').addEventListener('touchend', (e) => { if (G.state === 'playing') { e.preventDefault(); showMap(); } });
  $('weapon-box').addEventListener('touchend', (e) => { if (G.state === 'playing') { e.preventDefault(); G.player.nextWeapon(); } });
  $('weapon-box').addEventListener('click', () => { if (G.state === 'playing') G.player.nextWeapon(); });
  $('pause').addEventListener('click', (e) => {
    const a = e.target.dataset && e.target.dataset.act;
    if (!a) return;
    if (a === 'resume') setPaused(false);
    else if (a === 'map') showMap();
    else if (a === 'stats') openPanel('STATISTIK', statsHTML(), [['Zurück', closePanel]]);
    else if (a === 'settings') { openPanel('EINSTELLUNGEN', settingsHTML(), [['Zurück', closePanel]]); bindSettings(); }
    else if (a === 'mp') { $('pause').classList.add('hidden'); G.state = 'menu'; openMultiplayer(); }
    else if (a === 'controls') openPanel('STEUERUNG', controlsHTML(), [['Zurück', closePanel]]);
    else if (a === 'save') {
      if (G.missions.active && !G.missions.active.side) G.hud.toast('Während eines Auftrags kann nicht gespeichert werden.');
      else { Save.write(); G.hud.toast('Spiel gespeichert'); }
      setPaused(false);
    }
    else if (a === 'menu') openPanel('Zum Hauptmenü?', 'Nicht gespeicherter Fortschritt geht verloren.', [['Speichern & beenden', () => { if (!G.missions.active) Save.write(); location.reload(); }, 'primary'], ['Abbrechen', closePanel]]);
  });
  $('mapscreen').addEventListener('click', (e) => {
    if (e.target.dataset && e.target.dataset.act === 'closemap') {
      $('mapscreen').classList.add('hidden');
      if (G.state === 'menu') { G.state = 'playing'; last = performance.now(); }
      else if (G.state === 'paused') $('pause').classList.remove('hidden');
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.state === 'playing') setPaused(true); G.audio.suspend(); } });
  // Audio auf iOS erst nach Berührung freischalten
  const unlock = () => { if (G.audio.ready) G.audio.resume(); };
  window.addEventListener('touchend', unlock, { passive: true });
  window.addEventListener('click', unlock);
  $('title').addEventListener('pointerdown', () => { if (!G.audio.ready) G.audio.init(); }, { once: true });
}

// ------------------------------------------------------------ Schleife
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  const step = Math.min(dt, 1 / 30);
  G.dt = step;
  const I = G.input;
  I.update();
  try {
    update(now, step, I);
  } catch (e) {
    // Ein einzelner Fehler darf das Spiel nicht einfrieren
    reportError(e);
  }
  if (G.state !== 'loading') {
    try {
      G.vm.render();
      G.peds.render();
      if (composer) {
        bloom.strength = 0.22 + G.world.env.night * 0.18;
        composer.render();
      } else G.renderer.render(G.scene, G.camera);
    } catch (e) { reportError(e); }
  }
}

const seenErrors = new Set();
function reportError(e) {
  const key = String(e && e.message);
  if (seenErrors.has(key)) return;
  seenErrors.add(key);
  console.error('Spielfehler:', e);
}

function update(now, step, I) {
  if (G.state === 'title') {
    G.time += step;
    G.timeOfDay = (G.timeOfDay + step * 0.01) % 24;
    G.cam.attract(step, now / 1000);
    G.player.x = 40 + Math.cos(now / 1000 * 0.035) * 120; G.player.z = Math.sin(now / 1000 * 0.035) * 120;
    G.traffic.update(step);
    G.vm.step(step);
    G.peds.update(step);
    G.world.update(step);
    G.effects.update(step);
    G.world.env.update(step, G.timeOfDay, G.camera.position);
    G.audio.update(step);
  } else if (G.state === 'playing') {
    if (I.pressed('pause')) { setPaused(true); }
    else if (I.pressed('phone')) { openPhone(); }
    else if (I.pressed('map')) { showMap(); }
    G.time += step;
    G.stats.playTime += step;
    G.timeOfDay = (G.timeOfDay + step * (24 / (18 * 60))) % 24;
    if (G.missions.freeze && G.player.inCar) {
      G.player.update(step);
      const v = G.player.vehicle;
      if (v) { v.input.throttle = 0; v.input.brake = 1; v.input.handbrake = true; v.input.steer = 0; }
    } else G.player.update(step);
    G.traffic.update(step);
    G.police.update(step);
    // Physik in Teilschritten für Stabilität
    const sub = step > 1 / 45 ? 2 : 1;
    for (let k = 0; k < sub; k++) G.vm.step(step / sub);
    G.peds.update(step);
    G.missions.update(step);
    if (G.interiors) G.interiors.update(step);
    if (G.mp) G.mp.update(step);
    G.world.update(step);
    G.effects.update(step);
    G.cam.update(step);
    const P = G.player;
    G.world.env.update(step, G.timeOfDay, P.inCar ? P.vehicle : P);
    G.audio.update(step);
    G.hud.update(step);
    skids();
    autoQuality(step);
  } else if (G.state === 'creator') {
    const P = G.player;
    P.anim.t += step; P.anim.amp = 0; P.yaw += step * 0.45;
    G.time += step;
    G.cam.update(step);
    G.world.update(step);
    G.world.env.update(step, G.timeOfDay, P);
    G.audio.update(step);
  } else if (G.state === 'paused' || G.state === 'menu') {
    if (I.pressed('pause') && G.state === 'paused') setPaused(false);
    if (phoneOpen && (I.pressed('phone') || I.pressed('pause'))) closePhone();
    if (G.state === 'menu' && I.pressed('map') && !$('mapscreen').classList.contains('hidden')) { $('mapscreen').classList.add('hidden'); G.state = 'playing'; }
  }
}

// Bremsspuren & Reifenqualm
const _last = new Map();
function skids() {
  const cx = G.camera.position.x, cz = G.camera.position.z;
  for (const v of G.vehicles) {
    if ((v.x - cx) ** 2 + (v.z - cz) ** 2 > 90 * 90 || !v.grounded) { _last.delete(v.id); continue; }
    const sp = v.speed;
    const sliding = v.alive && ((v.slip > 3.2 && sp > 5) || (v.input.handbrake && sp > 6) || (v.braking && v.fwdSpeed > 14 && v.input.brake > 0.8));
    const fx = Math.sin(v.h), fz = Math.cos(v.h), lx = fz, lz = -fx;
    const rz = -v.hl + 0.85;
    const wl = [v.x + fx * rz + lx * (v.hw - 0.2), v.z + fz * rz + lz * (v.hw - 0.2)];
    const wr = [v.x + fx * rz - lx * (v.hw - 0.2), v.z + fz * rz - lz * (v.hw - 0.2)];
    const prev = _last.get(v.id);
    if (sliding && prev) {
      const y = v.y;
      G.effects.skid(prev[0][0], prev[0][1], wl[0], wl[1], y, 0.24, 0.55);
      G.effects.skid(prev[1][0], prev[1][1], wr[0], wr[1], y, 0.24, 0.55);
      const amt = Math.min(1, (v.slip - 2) / 6 + (v.input.handbrake ? 0.4 : 0));
      if (G.world.surfaceAt(v.x, v.z) === 'sand') { if (Math.random() < 0.5) G.effects.dust(wl[0], y, wl[1], 1); }
      else { G.effects.tireSmoke(wl[0], y, wl[1], amt); G.effects.tireSmoke(wr[0], y, wr[1], amt); }
    }
    if (sliding) _last.set(v.id, [wl, wr]); else _last.delete(v.id);
  }
}

// Automatische Qualitätsanpassung (nur Hinweis + Downgrade der Auflösung)
function autoQuality(dt) {
  if (G.settings.quality !== 'auto' || fpsWatch.done) return;
  fpsWatch.t += dt; fpsWatch.n++;
  if (fpsWatch.t > 8) {
    const fps = fpsWatch.n / fpsWatch.t;
    fpsWatch.done = true;
    if (fps < 32 && G.quality !== 'low') {
      const pr = Math.max(0.75, G.renderer.getPixelRatio() * 0.75);
      G.renderer.setPixelRatio(pr);
      if (composer) composer.setPixelRatio(pr);
      onResize();
      G.hud.toast('Auflösung angepasst für flüssiges Spielen');
    }
  }
}

// PWA: Service Worker
// Versionsnummer: kleines Update -> 1.01, 1.02 …; großes Update -> 2.0, danach 2.01 …
export const GAME_VERSION = '1.04';
document.getElementById('ver').textContent = 'VERSION ' + GAME_VERSION;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {}));
  // Neue Version installiert -> auf dem Titelbildschirm sofort neu laden
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    if (G.state === 'title' || G.state === 'loading') { reloaded = true; location.reload(); }
    else if (G.hud) G.hud.toast('Update geladen – beim nächsten Start aktiv.');
  });
}
// Maus freigegeben (z. B. mit Esc) -> Pause-Menü
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && G.state === 'playing' && !G.isTouch) setPaused(true);
});

if (/[?&]debug/.test(location.search)) window.__G = G;
boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = 'Fehler beim Laden: ' + e.message;
});
