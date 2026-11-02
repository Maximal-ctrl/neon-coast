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

  G.crowd = new CrowdRenderer(scene, 110);
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
    bloom = new UnrealBloomPass(res, 0.55, 0.45, 0.82);
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
  if (Save.exists()) $('btn-continue').classList.remove('hidden');
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
function startGame(load) {
  G.audio.init();
  const P = G.player;
  const d = load ? Save.read() : null;
  // Titel-Simulation aufräumen
  for (const v of [...G.vehicles]) v.remove();
  for (const p of [...G.peds.list]) G.peds.remove(p);
  if (d) Save.apply(d);
  else { Save.clear(); P.money = 250; G.timeOfDay = 16.5; }
  applyOutfit(P.outfit || 0);
  G.missions.init();
  const sh = G.world.pois.safehouse;
  P.x = sh.x; P.z = sh.z; P.y = 0; P.yaw = Math.PI; P.state = 'foot'; P.visible = true;
  G.cam.yaw = 0; G.cam.pitch = -0.2;
  G.traffic.initParked();
  const sc = G.world.pois.safehouseCar;
  const car = G.vm.spawn(load && G.missions.progress >= 2 ? 'zephyra' : 'kiwi', sc.x, sc.z, sc.h, load && G.missions.progress >= 2 ? 0xe63946 : 0x4ecdc4);
  if (car) { car.parked = true; car.ownedByPlayer = true; }
  for (let i = 0; i < 10; i++) G.traffic.spawnCar(P.x, P.z, 60, 200);
  G.cam.snap();
  G.state = 'playing';
  $('title').classList.add('hidden');
  G.hud.show(true);
  G.hud.weapon();
  G.hud.fadeIn();
  G.audio.station = 0;
  if (!d) {
    setTimeout(() => G.hud.bigToast('PORT SOLERA', 'Willkommen zurück, Leo.'), 600);
    setTimeout(() => G.hud.hint(G.isTouch
      ? 'Linker Daumen: <b>laufen</b> · rechts wischen: <b>umsehen</b>.<br>Folge der <b>gelben Route</b> zu Tante Rosa (R).'
      : '<b>WASD</b> laufen · <b>Maus</b> umsehen · <b>F</b> einsteigen.<br>Folge der <b>gelben Route</b> zu Tante Rosa (R).', 9), 3500);
  } else {
    G.hud.toast('Spielstand geladen');
  }
}

function applyOutfit(i) {
  const P = G.player, o = OUTFITS[i % OUTFITS.length];
  P.outfit = i % OUTFITS.length;
  P.look.shirt.setHex(o.shirt); P.look.sleeve.setHex(o.shirt);
  P.look.pants.setHex(o.pants);
  P.look.legs.setHex(o.shorts ? 0xd9a066 : o.pants);
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
    openPanel('UNTERSCHLUPF', 'Hier kannst du speichern, dich ausruhen und umziehen.', [
      ['Speichern & ausruhen', () => { G.player.health = 100; Save.write(); G.hud.toast('Spiel gespeichert · Gesundheit aufgefüllt'); close(); }, 'primary'],
      ['Schlafen (+6 Std.)', () => { G.timeOfDay = (G.timeOfDay + 6) % 24; G.player.health = 100; Save.write(); G.hud.fadeIn(); G.hud.toast('Gut geschlafen. Spiel gespeichert.'); close(); }],
      [`Outfit wechseln`, () => { applyOutfit((G.player.outfit || 0) + 1); G.hud.toast('Outfit: ' + OUTFITS[G.player.outfit].name); }],
      ['Schließen', close],
    ]);
  }
};

function setupUI() {
  $('btn-new').onclick = () => {
    if (Save.exists()) openPanel('Neues Spiel?', 'Dein bisheriger Spielstand wird überschrieben.', [['Ja, neu starten', () => { closePanel(); startGame(false); }, 'primary'], ['Abbrechen', closePanel]]);
    else startGame(false);
  };
  $('btn-continue').onclick = () => startGame(true);
  $('btn-controls').onclick = () => openPanel('STEUERUNG', controlsHTML(), [['Schließen', closePanel]]);
  $('btn-settings').onclick = () => { openPanel('EINSTELLUNGEN', settingsHTML(), [['Schließen', closePanel]]); bindSettings(); };
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
    G.world.update(step);
    G.effects.update(step);
    G.cam.update(step);
    const P = G.player;
    G.world.env.update(step, G.timeOfDay, P.inCar ? P.vehicle : P);
    G.audio.update(step);
    G.hud.update(step);
    skids();
    autoQuality(step);
  } else if (G.state === 'paused' || G.state === 'menu') {
    if (I.pressed('pause') && G.state === 'paused') setPaused(false);
    if (G.state === 'menu' && I.pressed('map') && !$('mapscreen').classList.contains('hidden')) { $('mapscreen').classList.add('hidden'); G.state = 'playing'; }
  }
  if (G.state !== 'loading') {
    G.vm.render();
    G.peds.render();
    if (composer) {
      bloom.strength = 0.35 + G.world.env.night * 0.55;
      composer.render();
    } else G.renderer.render(G.scene, G.camera);
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
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

if (/[?&]debug/.test(location.search)) window.__G = G;
boot().catch((e) => {
  console.error(e);
  $('load-msg').textContent = 'Fehler beim Laden: ' + e.message;
});
