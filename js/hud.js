// HUD, Minikarte, Menüs
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { WEAPONS } from './combat.js';
import { STATIONS } from './audio.js';
import { clamp, fmtMoney, fmtTime, lerp } from './utils.js';

const $ = (id) => document.getElementById(id);

const ICONS = {
  fist: '<svg viewBox="0 0 64 40"><path d="M14 10h30a6 6 0 0 1 6 6v10a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" fill="currentColor"/><path d="M20 10v8M28 10v8M36 10v8M44 10v8" stroke="#000" stroke-width="2" opacity=".35"/></svg>',
  pistol: '<svg viewBox="0 0 64 40"><path d="M6 8h48v8H30l-3 4h-6l2 16h-9l-3-18H6z" fill="currentColor"/><rect x="50" y="6" width="6" height="4" fill="currentColor"/></svg>',
  smg: '<svg viewBox="0 0 64 40"><path d="M2 10h52v8H40v4h-8l1 14h-7l-1-14h-5l-2 8h-6l1-12H2z" fill="currentColor"/><rect x="54" y="12" width="8" height="3" fill="currentColor"/><rect x="34" y="22" width="5" height="12" fill="currentColor"/></svg>',
  shotgun: '<svg viewBox="0 0 64 40"><path d="M2 12h60v5H30l-2 3H18l-8 12H2l6-12V17H2z" fill="currentColor"/><rect x="32" y="17" width="16" height="4" rx="2" fill="currentColor"/></svg>',
  rifle: '<svg viewBox="0 0 64 40"><path d="M1 12h54v6H38v3h-6l2 13h-7l-2-13h-4l-6 10H6l5-10V18H1z" fill="currentColor"/><rect x="55" y="13" width="8" height="3" fill="currentColor"/><rect x="24" y="8" width="12" height="4" fill="currentColor"/></svg>',
};

export class HUD {
  constructor() {
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.moneyShown = 0;
    this.toasts = [];
    this.areaT = 0; this.lastArea = '';
    this.vehT = 0; this.radioT = 0;
    this.bannerT = 0; this.bigT = 0;
    this.routeT = 0; this.route = null;
    this.dmg = 0;
    this.hitT = 0;
    this.v3 = new THREE.Vector3();
    this.fpsAcc = 0; this.fpsN = 0;
    this.subT = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindMap();
  }
  resize() {
    const r = this.mm.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.mm.width = Math.max(64, Math.round(r.width * dpr));
    this.mm.height = Math.max(64, Math.round(r.height * dpr));
  }
  show(on) { document.body.classList.toggle('playing', on); }

  // ------------------------------------------------------------ Events
  money(delta) {
    if (delta) {
      const el = $('money-delta');
      el.textContent = (delta > 0 ? '+' : '-') + '$' + Math.abs(Math.round(delta));
      el.className = delta > 0 ? 'show pos' : 'show neg';
      clearTimeout(this._mdT);
      this._mdT = setTimeout(() => (el.className = ''), 1600);
      if (delta > 0) G.audio.cash();
    }
  }
  toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }
  bigToast(title, sub = '') {
    $('bt-title').textContent = title; $('bt-sub').textContent = sub;
    $('bigtoast').classList.add('show');
    this.bigT = 4;
  }
  banner(text, color = '#ff2e88', sub = '') {
    const b = $('banner');
    $('banner-text').textContent = text;
    $('banner-text').style.color = color;
    $('banner-sub').textContent = sub;
    b.classList.add('show');
    this.bannerT = 3.8;
  }
  wantedPulse() { const w = $('wanted'); w.classList.remove('pulse'); void w.offsetWidth; w.classList.add('pulse'); }
  weapon() {
    const P = G.player, w = WEAPONS[P.weapon];
    $('weapon-icon').innerHTML = ICONS[w.icon];
    $('weapon-ammo').textContent = w.melee ? '' : P.ammo[P.weapon];
    $('weapon-name').textContent = w.name;
  }
  vehicleName(n) { const el = $('veh-name'); el.textContent = n; el.classList.add('show'); this.vehT = 3; }
  radio(st) { const el = $('radio-box'); el.innerHTML = `<b>${st.name}</b>${st.genre ? '<span>' + st.genre + '</span>' : ''}`; el.classList.add('show'); this.radioT = 3; }
  hitMarker(kill) { const el = $('hitmark'); el.className = kill ? 'show kill' : 'show'; this.hitT = 0.25; }
  damageFlash(a) { this.dmg = Math.min(1, this.dmg + a * 0.8); }
  fadeIn() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 350); }
  fade(on) { $('fade').classList.toggle('on', on); }
  objective(text) { const el = $('objective'); el.innerHTML = text || ''; el.classList.toggle('show', !!text); }
  timer(sec) { const el = $('timer'); if (sec == null) { el.classList.remove('show'); return; } el.textContent = fmtTime(sec); el.classList.add('show'); el.classList.toggle('urgent', sec < 10); }
  racePos(text) { const el = $('race-pos'); el.textContent = text || ''; el.classList.toggle('show', !!text); }
  hint(text, dur = 5) { const el = $('hint'); if (!text) { el.classList.remove('show'); return; } el.innerHTML = text; el.classList.add('show'); this.hintT = dur; }
  subtitle(speaker, text, color = '#19e6ff') {
    const el = $('subtitle');
    if (!text) { el.classList.remove('show'); return; }
    el.innerHTML = speaker ? `<b style="color:${color}">${speaker}:</b> ${text}` : text;
    el.classList.add('show');
  }
  letterbox(on) { document.body.classList.toggle('cine', on); }
  countdown(t) { const el = $('countdown'); if (!t) { el.classList.remove('show'); return; } el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }

  // ------------------------------------------------------------ Update
  update(dt) {
    const P = G.player;
    // Geld
    this.moneyShown = lerp(this.moneyShown, P.money, Math.min(1, dt * 6));
    if (Math.abs(this.moneyShown - P.money) < 1) this.moneyShown = P.money;
    $('money').textContent = fmtMoney(this.moneyShown);
    // Uhr
    const h = Math.floor(G.timeOfDay), m = Math.floor((G.timeOfDay % 1) * 60);
    $('clock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    // Sterne
    const lvl = G.police.level, blink = G.police.searching && Math.floor(G.time * 3) % 2 === 0;
    const stars = $('wanted').children;
    for (let i = 0; i < 5; i++) stars[i].className = 'star' + (i < lvl ? (blink ? ' on dim' : ' on') : '');
    $('wanted').classList.toggle('active', lvl > 0);
    // Leben/Panzer
    $('hb-health').style.width = clamp(P.health, 0, 100) + '%';
    $('hb-health').classList.toggle('low', P.health < 30);
    $('hb-armor').style.width = clamp(P.armor, 0, 100) + '%';
    $('bars').classList.toggle('noarmor', P.armor <= 0);
    // Gebiet
    const area = C.districtAt(P.x, P.z);
    if (area !== this.lastArea) {
      this.lastArea = area;
      const el = $('area-name'); el.textContent = C.DISTRICT_NAMES[area] || ''; el.classList.add('show'); this.areaT = 3.5;
    }
    if ((this.areaT -= dt) <= 0) $('area-name').classList.remove('show');
    if ((this.vehT -= dt) <= 0) $('veh-name').classList.remove('show');
    if ((this.radioT -= dt) <= 0) $('radio-box').classList.remove('show');
    if ((this.bannerT -= dt) <= 0) $('banner').classList.remove('show');
    if ((this.bigT -= dt) <= 0) $('bigtoast').classList.remove('show');
    if ((this.hitT -= dt) <= 0) $('hitmark').className = '';
    if (this.hintT !== undefined && (this.hintT -= dt) <= 0) { $('hint').classList.remove('show'); this.hintT = undefined; }
    // Tacho
    const sp = $('speedo');
    if (P.inCar) {
      sp.classList.add('show');
      const kmh = Math.round(Math.abs(P.vehicle.fwdSpeed) * 3.6);
      $('speed-val').textContent = kmh;
      $('speed-bar').style.width = clamp(kmh / (P.vehicle.T.maxSpeed * 3.6), 0, 1) * 100 + '%';
      const hp = P.vehicle.health / P.vehicle.maxHealth;
      $('car-hp').style.width = hp * 100 + '%';
      $('car-hp').classList.toggle('low', hp < 0.3);
    } else sp.classList.remove('show');
    document.body.classList.toggle('in-car', !!P.inCar);
    document.body.classList.toggle('armed', P.weapon !== 'fists');
    // Fadenkreuz / Ziel
    const ch = $('crosshair');
    ch.classList.toggle('show', !G.isTouch && !P.inCar && P.weapon !== 'fists' && P.state === 'foot');
    ch.classList.toggle('aim', P.anim.aim);
    const tm = $('target-mark');
    const tgt = G.isTouch ? P.target : null;
    if (tgt && P.state === 'foot' && P.weapon !== 'fists') {
      this.v3.set(tgt.x, tgt.y + (tgt.isPed ? 1.2 : 1), tgt.z).project(G.camera);
      if (this.v3.z < 1) {
        tm.style.left = ((this.v3.x + 1) / 2) * 100 + '%';
        tm.style.top = ((1 - this.v3.y) / 2) * 100 + '%';
        tm.classList.add('show');
        tm.classList.toggle('hostile', !!(tgt.hostile || tgt.isCop || tgt.missionTarget));
      } else tm.classList.remove('show');
    } else tm.classList.remove('show');
    // Schaden
    this.dmg = Math.max(0, this.dmg - dt * 1.2);
    const low = P.health < 25 && P.state !== 'dead' ? 0.35 + Math.sin(G.time * 5) * 0.1 : 0;
    $('dmg').style.opacity = Math.max(this.dmg, low);
    // Einsteigen-Taste nur bei Fahrzeug in der Nähe
    const near = !P.inCar && P.state === 'foot' && P.nearestVehicle(6);
    document.body.classList.toggle('can-enter', !!near || !!P.inCar);
    // FPS
    if (G.settings.showFps) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { $('fps').textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS · ' + G.quality; this.fpsAcc = 0; this.fpsN = 0; }
    }
    $('fps').style.display = G.settings.showFps ? 'block' : 'none';
    this.drawMinimap(dt);
  }

  // ------------------------------------------------------------ Minikarte
  getRouteTarget() {
    const M = G.missions;
    if (M.gpsTarget) return M.gpsTarget;
    if (M.waypoint) return M.waypoint;
    return null;
  }
  drawMinimap(dt) {
    const c = this.mm, g = this.mmCtx, W = G.world;
    const S = c.width, H = c.height;
    const P = G.player, px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
    const speed = P.inCar ? P.vehicle.speed : 0;
    const R = 110 + Math.min(90, speed * 2.2);
    const k = (Math.min(S, H) / 2) / R;
    const yaw = G.cam.yaw;
    const th = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    const cs = Math.cos(th), sn = Math.sin(th);
    const toS = (x, z) => { const dx = (x - px) * k, dz = (z - pz) * k; return [S / 2 + dx * cs - dz * sn, H / 2 + dx * sn + dz * cs]; };
    g.save();
    g.clearRect(0, 0, S, H);
    g.beginPath();
    const rr = S * 0.12;
    g.roundRect ? g.roundRect(0, 0, S, H, rr) : g.rect(0, 0, S, H);
    g.clip();
    g.fillStyle = '#0b2a40'; g.fillRect(0, 0, S, H);
    g.save();
    g.translate(S / 2, H / 2);
    g.rotate(th);
    const ms = W.mapScale;
    g.scale(k / ms, k / ms);
    const [mx, mz] = W.mapToPx(px, pz);
    g.translate(-mx, -mz);
    g.imageSmoothingEnabled = true;
    g.drawImage(W.mapCanvas, 0, 0);
    g.restore();
    // Nacht-Abdunklung
    const night = W.env.night;
    if (night > 0) { g.fillStyle = `rgba(5,8,25,${night * 0.25})`; g.fillRect(0, 0, S, H); }
    // GPS-Route
    this.routeT -= dt;
    const tgt = this.getRouteTarget();
    if (tgt && this.routeT <= 0) {
      this.routeT = 0.6;
      const a = W.nearestNode(px, pz), b = W.nearestNode(tgt.x, tgt.z);
      this.route = W.route(a.id, b.id).map((id) => [W.nodes[id].x, W.nodes[id].z]);
      this.route.push([tgt.x, tgt.z]);
    }
    if (tgt && this.route) {
      g.lineWidth = Math.max(3, S * 0.025);
      g.strokeStyle = G.missions.gpsTarget ? 'rgba(255,214,10,0.9)' : 'rgba(190,110,255,0.9)';
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      const [sx0, sy0] = toS(px, pz); g.moveTo(sx0, sy0);
      for (const [x, z] of this.route) { const [sx, sy] = toS(x, z); g.lineTo(sx, sy); }
      g.stroke();
    }
    // Blips
    const blip = (x, z, col, r = 0.035, shape = 'dot', label = null, edge = false) => {
      let [sx, sy] = toS(x, z);
      const dx = sx - S / 2, dy = sy - H / 2, lim = S / 2 - S * 0.07;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d > lim) { if (!edge) return; sx = S / 2 + dx / d * lim; sy = H / 2 + dy / d * lim; }
      const rad = S * r;
      g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = Math.max(1, S * 0.008);
      g.beginPath();
      if (shape === 'sq') g.rect(sx - rad, sy - rad, rad * 2, rad * 2); else g.arc(sx, sy, rad, 0, Math.PI * 2);
      g.fill(); g.stroke();
      if (label) { g.fillStyle = '#000'; g.font = `bold ${Math.round(rad * 1.4)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, sx, sy + 1); }
    };
    for (const b of G.missions.mapBlips()) blip(b.x, b.z, b.col, b.r || 0.04, b.shape, b.label, b.edge);
    const flash = Math.floor(G.time * 4) % 2 === 0;
    for (const v of G.vehicles) {
      if (v.police && v.alive && v.siren) blip(v.x, v.z, flash ? '#ff2b2b' : '#2b6bff', 0.03, 'sq');
      else if (v.missionTarget) blip(v.x, v.z, '#ff3b5c', 0.035, 'dot', null, true);
      else if (v.missionCar) blip(v.x, v.z, '#19e6ff', 0.035, 'dot', null, true);
      else if (v.racer) blip(v.x, v.z, '#ffd23f', 0.028);
    }
    for (const p of G.peds.list) {
      if (p.isCop && p.alive && p.state === 'cop') blip(p.x, p.z, flash ? '#ff2b2b' : '#2b6bff', 0.02);
      else if (p.missionTarget && p.alive) blip(p.x, p.z, '#ff3b5c', 0.03, 'dot', null, true);
      else if (p.hostile && p.alive) blip(p.x, p.z, '#ff3b5c', 0.02);
    }
    if (G.police.heliActive) blip(G.police.heliPos.x, G.police.heliPos.z, flash ? '#ff2b2b' : '#2b6bff', 0.03);
    if (G.missions.waypoint) blip(G.missions.waypoint.x, G.missions.waypoint.z, '#be6eff', 0.035, 'dot', null, true);
    // Spielerpfeil
    const ph = P.inCar ? P.vehicle.h : P.yaw;
    const vx = Math.sin(ph), vz = Math.cos(ph);
    const ax = vx * cs - vz * sn, ay = vx * sn + vz * cs;
    const ang = Math.atan2(ay, ax);
    g.save();
    g.translate(S / 2, H / 2); g.rotate(ang);
    const a = S * 0.06;
    g.fillStyle = '#ffffff'; g.strokeStyle = '#000'; g.lineWidth = Math.max(1.5, S * 0.01);
    g.beginPath(); g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.65); g.lineTo(-a * 0.35, 0); g.lineTo(-a * 0.7, -a * 0.65); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Norden
    const [nx, ny] = (() => { const dx = 0, dz = -1; return [dx * cs - dz * sn, dx * sn + dz * cs]; })();
    const nr = S / 2 - S * 0.07;
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(S / 2 + nx * nr, H / 2 + ny * nr, S * 0.045, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(S * 0.06)}px Rajdhani, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', S / 2 + nx * nr, H / 2 + ny * nr + 1);
    g.restore();
  }

  // ------------------------------------------------------------ Karte groß
  bindMap() {
    const cv = $('bigmap');
    const handler = (cx, cy) => {
      const r = cv.getBoundingClientRect();
      const s = this.bigMapView;
      if (!s) return;
      const mx = ((cx - r.left) / r.width) * cv.width, my = ((cy - r.top) / r.height) * cv.height;
      const W = G.world, MB = W.mapBounds;
      const wx = MB.x0 + ((mx - s.ox) / s.k) / W.mapScale, wz = MB.z0 + ((my - s.oy) / s.k) / W.mapScale;
      const M = G.missions;
      if (M.waypoint && Math.hypot(M.waypoint.x - wx, M.waypoint.z - wz) < 30) M.waypoint = null;
      else M.waypoint = { x: wx, z: wz };
      this.routeT = 0;
      this.drawBigMap();
    };
    cv.addEventListener('click', (e) => handler(e.clientX, e.clientY));
  }
  drawBigMap() {
    const cv = $('bigmap'), g = cv.getContext('2d');
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const W = G.world, img = W.mapCanvas;
    const k = Math.min(cv.width / img.width, cv.height / img.height);
    const ox = (cv.width - img.width * k) / 2, oy = (cv.height - img.height * k) / 2;
    this.bigMapView = { k, ox, oy };
    g.fillStyle = '#0b2a40'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(img, ox, oy, img.width * k, img.height * k);
    const toS = (x, z) => { const [mx, mz] = W.mapToPx(x, z); return [ox + mx * k, oy + mz * k]; };
    // Bezirksnamen
    g.font = `${Math.round(14 * dpr)}px "Russo One", sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,0.55)';
    const labels = [['Coral Heights', 0, -300], ['Downtown', 0, 0], ['Midtown', 200, -60], ['Westside', -280, 0], ['Hafen', -200, 330], ['Seaside', 330, -150], ['Solera Beach', 420, 200], ['Sunset Pier', 600, 95]];
    for (const [t, x, z] of labels) { const [sx, sy] = toS(x, z); g.fillText(t, sx, sy); }
    for (const b of G.missions.mapBlips(true)) {
      const [sx, sy] = toS(b.x, b.z);
      const rad = 9 * dpr;
      g.fillStyle = b.col; g.strokeStyle = '#000'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(sx, sy, rad, 0, 7); g.fill(); g.stroke();
      if (b.label) { g.fillStyle = '#000'; g.font = `bold ${Math.round(12 * dpr)}px Rajdhani, sans-serif`; g.textBaseline = 'middle'; g.fillText(b.label, sx, sy + 1); }
    }
    if (G.missions.waypoint) { const [sx, sy] = toS(G.missions.waypoint.x, G.missions.waypoint.z); g.fillStyle = '#be6eff'; g.beginPath(); g.arc(sx, sy, 8 * dpr, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
    const P = G.player, px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z, ph = P.inCar ? P.vehicle.h : P.yaw;
    const [sx, sy] = toS(px, pz);
    g.save(); g.translate(sx, sy); g.rotate(Math.atan2(Math.cos(ph), Math.sin(ph)));
    const a = 11 * dpr;
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.65); g.lineTo(-a * 0.35, 0); g.lineTo(-a * 0.7, -a * 0.65); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
