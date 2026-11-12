// HUD, Minikarte, Menüs
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { WEAPONS } from './combat.js';
import { STATIONS } from './audio.js';
import { clamp, fmtMoney, fmtTime, lerp } from './utils.js';

const $ = (id) => document.getElementById(id);

export const ICONS = {
  sniper: '<svg viewBox="0 0 64 40"><path d="M0 15h58v4H40v3h-5l2 12h-6l-2-12h-6l-6 9H9l5-9v-3H0z" fill="currentColor"/><rect x="20" y="8" width="16" height="5" rx="2" fill="currentColor"/><rect x="26" y="12" width="3" height="4" fill="currentColor"/></svg>',
  grenade: '<svg viewBox="0 0 64 40"><ellipse cx="30" cy="24" rx="11" ry="13" fill="currentColor"/><rect x="26" y="6" width="9" height="6" rx="1" fill="currentColor"/><path d="M35 9l9-4v4l-8 3z" fill="currentColor"/><circle cx="44" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
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
    $('weapon-ammo').textContent = w.melee ? '' : w.throw ? `${P.ammo[P.weapon] || 0}` : P.reloadT > 0 ? 'NACHLADEN …' : `${P.clipOf(P.weapon)} / ${P.ammo[P.weapon] - P.clipOf(P.weapon)}`;
    $('weapon-name').textContent = w.name;
  }
  vehicleName(n) { const el = $('veh-name'); el.textContent = n; el.classList.add('show'); this.vehT = 3; }
  // Einblendung des laufenden Titels (oben)
  nowPlaying(station, artist, title) {
    const el = $('np'); if (!el) return;
    el.innerHTML = `<small>${station}</small><b>${title}</b><span>${artist}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.npT); this.npT = setTimeout(() => el.classList.remove('show'), 6000);
  }
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
    const area = G.interior ? G.interior.kind : C.districtAt(P.x, P.z);
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
    document.body.classList.toggle('scoped', !G.isTouch && !P.inCar && P.weapon === 'sniper' && !!P.anim.aim);
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
    g.fillStyle = '#3f7299'; g.fillRect(0, 0, S, H);
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
      const Pl = G.player, cv = Pl.inCar ? Pl.vehicle : null;
      this.route = (cv && (cv.T.boat || cv.T.plane)) || Pl.state === 'swim' ? [[px, pz], [tgt.x, tgt.z]] : W.gpsPath(px, pz, tgt.x, tgt.z);
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
    // Suchgebiet der Polizei (letzte bekannte Position)
    const PL = G.police;
    if (PL.level > 0 && PL.searching && PL.lastPos) {
      const [cx, cy] = toS(PL.lastPos.x, PL.lastPos.z), rr = (60 + PL.level * 12) * k;
      const fl = Math.floor(G.time * 2) % 2 === 0;
      g.fillStyle = fl ? 'rgba(255,40,40,0.18)' : 'rgba(40,90,255,0.18)'; g.strokeStyle = fl ? 'rgba(255,60,60,0.7)' : 'rgba(60,110,255,0.7)';
      g.lineWidth = Math.max(1.5, S * 0.008); g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill(); g.stroke();
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
      if (label) { g.fillStyle = '#000'; g.font = `bold ${Math.round(rad * 1.4)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, sx, sy + 1); }
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
    if (G.mp) for (const r of G.mp.remotes()) if (r.visible) blip(r.car ? r.car.x : r.x, r.car ? r.car.z : r.z, '#4dd2ff', 0.04, 'dot', null, true);
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
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(S * 0.06)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', S / 2 + nx * nr, H / 2 + ny * nr + 1);
    g.restore();
  }

  // ------------------------------------------------------------ Karte groß (3.1: flüssig, mit Schwung und weichem Zoom)
  bindMap() {
    const cv = $('bigmap');
    this.mapView = null;
    const ptrs = new Map();
    let drag = null, pinch = null, moved = 0;
    const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, toCanvas(e));
      moved = 0;
      if (this.mapView) { this.mapView.vx = this.mapView.vy = 0; this.mapView.tz = null; }
      if (ptrs.size === 1) drag = { p: toCanvas(e), t: performance.now() };
      if (ptrs.size === 2 && this.mapView) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.mapView.zoom, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; drag = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId) || !this.mapView) return;
      const p = toCanvas(e); ptrs.set(e.pointerId, p);
      const V = this.mapView;
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        V.ox += c[0] - pinch.c[0]; V.oy += c[1] - pinch.c[1]; pinch.c = c; // mit zwei Fingern auch verschieben
        this.setZoom(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, c[0], c[1], true);
        moved += 10;
      } else if (drag) {
        const now = performance.now(), dx = p[0] - drag.p[0], dy = p[1] - drag.p[1], dt = Math.max(1, now - drag.t);
        moved += Math.abs(dx) + Math.abs(dy);
        V.ox += dx; V.oy += dy; drag.p = p; drag.t = now;
        // Geschwindigkeit für den Schwung (Pixel pro ms, geglättet)
        V.vx = V.vx * 0.5 + (dx / dt) * 0.5; V.vy = V.vy * 0.5 + (dy / dt) * 0.5;
        this.requestMap();
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0) {
        if (moved < 12 && drag) { this.mapView.vx = this.mapView.vy = 0; this.tapMap(p[0], p[1]); }
        else if (drag && performance.now() - drag.t > 80) { this.mapView.vx = this.mapView.vy = 0; }
        drag = null;
        this.requestMap();
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.mapView) return; const p = toCanvas(e); this.zoomTo((this.mapView.tz || this.mapView.zoom) * Math.pow(1.0018, -e.deltaY), p[0], p[1]); }, { passive: false });
    $('map-zin').onclick = () => this.mapView && this.zoomTo((this.mapView.tz || this.mapView.zoom) * 1.6, cv.width / 2, cv.height / 2);
    $('map-zout').onclick = () => this.mapView && this.zoomTo((this.mapView.tz || this.mapView.zoom) / 1.6, cv.width / 2, cv.height / 2);
    $('map-center').onclick = () => {
      const V = this.mapView; if (!V) return;
      const W = G.world, [px, pz] = this.mapPlayerPos(), [mx, mz] = W.mapToPx(px, pz);
      V.vx = V.vy = 0; V.fly = { mx, mz };
      this.requestMap();
    };
    const lg = document.querySelector('.map-legend');
    if (lg) {
      try { if (localStorage.getItem('nc_legend_closed') === '1') lg.classList.add('closed'); } catch (e) { /* egal */ }
      const hb = lg.querySelector('b');
      if (hb) hb.onclick = () => { lg.classList.toggle('closed'); try { localStorage.setItem('nc_legend_closed', lg.classList.contains('closed') ? '1' : '0'); } catch (e) { /* egal */ } };
    }
  }
  // Zeichnen höchstens einmal pro Bildschirm-Frame; Schwung/Zoom-Animation läuft hier weiter
  requestMap() {
    if (this._mapRaf) return;
    this._mapRaf = requestAnimationFrame((t) => {
      this._mapRaf = 0;
      const V = this.mapView, scr = $('mapscreen');
      if (!V || !scr || scr.classList.contains('hidden')) return;
      const dt = Math.min(0.05, (t - (this._mapT || t)) / 1000) || 1 / 60; this._mapT = t;
      let anim = false;
      if (Math.abs(V.vx) + Math.abs(V.vy) > 0.02) {
        V.ox += V.vx * dt * 1000; V.oy += V.vy * dt * 1000;
        const f = Math.exp(-dt * 5); V.vx *= f; V.vy *= f; anim = true;
      } else V.vx = V.vy = 0;
      if (V.tz) {
        const nz = V.zoom + (V.tz - V.zoom) * (1 - Math.exp(-dt * 14));
        this.setZoom(Math.abs(nz - V.tz) < V.tz * 0.002 ? V.tz : nz, V.tcx, V.tcy, true);
        if (V.zoom === V.tz) V.tz = null; else anim = true;
      }
      if (V.fly) {
        const k = 1 - Math.exp(-dt * 9);
        const cvs = $('bigmap'), fx = cvs.width / 2 - V.fly.mx * V.zoom, fy = cvs.height / 2 - V.fly.mz * V.zoom;
        V.ox += (fx - V.ox) * k; V.oy += (fy - V.oy) * k;
        if (Math.abs(fx - V.ox) + Math.abs(fy - V.oy) < 1 && !V.tz) { V.ox = fx; V.oy = fy; V.fly = null; } else anim = true;
      }
      this.drawBigMap(true);
      if (anim) this.requestMap(); else this._mapT = 0;
    });
  }
  zoomTo(z, cx, cy) {
    const V = this.mapView; if (!V) return;
    V.tz = Math.max(V.min, Math.min(V.max, z)); V.tcx = cx; V.tcy = cy;
    this.requestMap();
  }
  setZoom(z, cx, cy, noDraw = false) {
    const V = this.mapView;
    z = Math.max(V.min, Math.min(V.max, z));
    // Punkt unter (cx,cy) bleibt fest
    V.ox = cx - (cx - V.ox) * (z / V.zoom); V.oy = cy - (cy - V.oy) * (z / V.zoom);
    V.zoom = z;
    if (!noDraw) this.requestMap();
  }
  tapMap(mx, my) {
    const V = this.mapView, W = G.world, MB = W.mapBounds;
    const wx = MB.x0 + ((mx - V.ox) / V.zoom) / W.mapScale, wz = MB.z0 + ((my - V.oy) / V.zoom) / W.mapScale;
    const M = G.missions;
    const tol = 22 * (V.dpr || 1) / (V.zoom * W.mapScale); // Antipp-Toleranz in Weltmetern
    if (M.waypoint && Math.hypot(M.waypoint.x - wx, M.waypoint.z - wz) < Math.max(12, tol)) { M.waypoint = null; this.toast('Wegpunkt entfernt'); }
    else { M.waypoint = { x: wx, z: wz }; this.toast('Wegpunkt gesetzt – folge der lila Route'); }
    this.routeT = 0;
    this.requestMap();
  }
  // Spielerposition für die Karte (in Innenräumen: der Eingang draußen)
  mapPlayerPos() {
    const P = G.player;
    if (G.interior && G.interiors) {
      const I = G.interiors, d = I.curDoor || (I.doors || []).find((o) => o.kind === G.interior.kind);
      if (d && d.out) return [d.out.x, d.out.z, d.out.yaw || 0];
    }
    return P.inCar ? [P.vehicle.x, P.vehicle.z, P.vehicle.h] : [P.x, P.z, P.yaw];
  }
  drawBigMap(keep = false) {
    const cv = $('bigmap'), g = cv.getContext('2d');
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = G.world, img = W.mapCanvas;
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (!keep || !this.mapView || cv.width !== cw || cv.height !== ch) {
      const old = this.mapView;
      cv.width = cw; cv.height = ch;
      const fit = Math.min(cv.width / img.width, cv.height / img.height);
      if (!old || !keep) {
        // auf den Spieler zentriert, leicht vergrößert
        const [px, pz] = this.mapPlayerPos();
        const [mx, mz] = W.mapToPx(px, pz);
        const zoom = fit * 3.4;
        this.mapView = { min: fit * 0.9, max: fit * 22, zoom, ox: cv.width / 2 - mx * zoom, oy: cv.height / 2 - mz * zoom, vx: 0, vy: 0, dpr };
      } else { old.min = fit * 0.9; old.max = fit * 22; old.dpr = dpr; }
    }
    const V = this.mapView;
    // Karte nicht aus dem Bild schieben
    const iw = img.width * V.zoom, ih = img.height * V.zoom, mg = Math.min(cv.width, cv.height) * 0.35;
    V.ox = Math.min(cv.width - mg, Math.max(mg - iw, V.ox)); V.oy = Math.min(cv.height - mg, Math.max(mg - ih, V.oy));
    const k = V.zoom;
    // Meer (gleiche Farbe wie der Kartenrand)
    g.fillStyle = '#3f7299'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = k > V.min * 6 ? 'medium' : 'high';
    // nur den sichtbaren Ausschnitt der Kartengrafik zeichnen (deutlich schneller beim Ziehen)
    const sx0 = Math.max(0, -V.ox / k), sy0 = Math.max(0, -V.oy / k);
    const sx1 = Math.min(img.width, (cv.width - V.ox) / k), sy1 = Math.min(img.height, (cv.height - V.oy) / k);
    if (sx1 > sx0 && sy1 > sy0) g.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, V.ox + sx0 * k, V.oy + sy0 * k, (sx1 - sx0) * k, (sy1 - sy0) * k);
    const toS = (x, z) => { const [mx, mz] = W.mapToPx(x, z); return [V.ox + mx * k, V.oy + mz * k]; };
    const rel = k / V.min; // 1 = ganze Insel sichtbar
    const u = dpr * Math.min(1.5, Math.max(0.95, 0.85 + rel * 0.05));
    // Ortsnamen: große Namen immer, kleinere erst beim Hineinzoomen
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const big = [['DOWNTOWN', 0, -80], ['SOLERA HILLS', 200, -900], ['VALVERDE', 300, -2040], ['BAHÍA BLANCA', 1450, -760], ['LOS RANCHOS', -1250, -1360], ['SIERRA ALTA', 300, -2900], ['TIERRA SECA', -1150, -1750], ['SAN LÚCAR', 1530, -1130], ['PIEDRA ROJA', -1500, -2250], ['SANTA CRUZ', -1000, -740], ['PINAR ALTO', -400, -2580], ['MONTE NEGRO', 1000, -2420]];
    const small = [['CORAL HEIGHTS', 0, -300], ['MIDTOWN', 200, -40], ['WESTSIDE', -280, 0], ['HAFEN', -200, 330], ['SEASIDE', 330, -150], ['SOLERA BEACH', 425, 200], ['SUNSET PIER', 600, 95], ['ALTSTADT', -480, -40], ['MONTE SOLERA', -160, -860], ['ANWESEN', 530, -990], ['FLUGPLATZ', -1300, -1090], ['MIRADOR', 330, -2740], ['COSTA ESTE', 1050, -620], ['LAGO VERDE', 600, -1550], ['GRAN CASINO', 1555, -730], ['SOLERA MARINA', 90, 470], ['CAÑÓN ROJO', -1300, -1790], ['FINCA ESCONDIDA', -470, -1430], ['YACHTHAFEN', -480, 470]];
    const label = (t, x, z, size, alpha) => {
      const [sx, sy] = toS(x, z);
      if (sx < -200 || sy < -50 || sx > cv.width + 200 || sy > cv.height + 50) return;
      g.globalAlpha = alpha; g.font = `600 ${Math.round(size * u)}px Oswald, sans-serif`;
      g.lineWidth = 3.5 * u; g.lineJoin = 'round'; g.strokeStyle = 'rgba(255,255,255,0.88)'; g.strokeText(t, sx, sy);
      g.fillStyle = 'rgba(34,38,46,0.95)'; g.fillText(t, sx, sy); g.globalAlpha = 1;
    };
    for (const [t, x, z] of big) label(t, x, z, 15, 1);
    const sa = Math.max(0, Math.min(1, (rel - 1.6) / 1.2));
    if (sa > 0) for (const [t, x, z] of small) label(t, x, z, 12, sa);
    // Route
    const tgt = this.getRouteTarget();
    if (tgt && this.route) {
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      const col = G.missions.gpsTarget ? '#ffd60a' : '#be6eff';
      g.beginPath(); this.route.forEach(([x, z], i) => { const [sx, sy] = toS(x, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); });
      g.lineWidth = 8 * u; g.strokeStyle = 'rgba(13,18,32,0.55)'; g.stroke();
      g.lineWidth = 4.5 * u; g.strokeStyle = col; g.stroke();
      g.restore();
    }
    // Symbole (ohne teure Schatten – Ring + dunkler Rand)
    const icon = (x, z, col, lbl, size = 13) => {
      const [sx, sy] = toS(x, z), rad = size * u;
      if (sx < -rad || sy < -rad || sx > cv.width + rad || sy > cv.height + rad) return null;
      g.fillStyle = 'rgba(13,18,32,0.45)'; g.beginPath(); g.arc(sx, sy + 1.5 * u, rad + 3 * u, 0, 7); g.fill();
      g.fillStyle = '#0d1220'; g.beginPath(); g.arc(sx, sy, rad, 0, 7); g.fill();
      g.lineWidth = 2.6 * u; g.strokeStyle = col; g.stroke();
      g.fillStyle = col; g.font = `700 ${Math.round(rad * 1.1)}px Oswald, sans-serif`; g.fillText(lbl, sx, sy + 1 * u);
      return [sx, sy, rad];
    };
    const blips = G.missions.mapBlips(true);
    // Auftrags- und Missionsziele zuletzt (oben)
    blips.sort((a, b) => (a.edge ? 1 : 0) - (b.edge ? 1 : 0));
    const names = rel > 2.2;
    for (const b of blips) {
      const res = icon(b.x, b.z, b.col, b.label || '•', b.label ? 12.5 : 9);
      if (res && b.name && (names || (b.edge && rel > 1.6))) {
        const [sx, sy, rad] = res;
        g.font = `600 ${Math.round(10.5 * u)}px Inter, sans-serif`; g.lineWidth = 3 * u; g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.strokeText(b.name, sx, sy + rad + 9 * u); g.fillStyle = '#1b1e24'; g.fillText(b.name, sx, sy + rad + 9 * u);
      }
    }
    if (G.missions.waypoint) icon(G.missions.waypoint.x, G.missions.waypoint.z, '#be6eff', '⚑', 12);
    // Spieler
    const [px, pz, ph] = this.mapPlayerPos();
    const [sx, sy] = toS(px, pz);
    g.save(); g.translate(sx, sy);
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    g.fillStyle = `rgba(25,230,255,${0.12 + pulse * 0.1})`; g.beginPath(); g.arc(0, 0, (20 + pulse * 5) * u, 0, 7); g.fill();
    g.rotate(Math.atan2(Math.cos(ph), Math.sin(ph)));
    const a = 12 * u;
    g.fillStyle = '#fff'; g.strokeStyle = '#0d1220'; g.lineWidth = 2.5 * u;
    g.beginPath(); g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.68); g.lineTo(-a * 0.3, 0); g.lineTo(-a * 0.7, -a * 0.68); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // Maßstab und Nordpfeil
    const mPerPx = 1 / (k * W.mapScale);
    let len = 50; for (const c of [50, 100, 200, 250, 500, 1000, 2000]) if (c / mPerPx < 150 * dpr) len = c;
    const bw = len / mPerPx, bx = 24 * dpr, by = cv.height - 30 * dpr;
    g.fillStyle = 'rgba(13,18,32,0.72)'; g.fillRect(bx - 10 * dpr, by - 14 * dpr, bw + 20 * dpr, 34 * dpr);
    g.fillStyle = '#fff'; g.fillRect(bx, by + 8 * dpr, bw, 3 * dpr); g.fillRect(bx, by + 3 * dpr, 2 * dpr, 8 * dpr); g.fillRect(bx + bw - 2 * dpr, by + 3 * dpr, 2 * dpr, 8 * dpr);
    g.font = `600 ${Math.round(11 * dpr)}px Inter, sans-serif`; g.textAlign = 'center'; g.fillText(len >= 1000 ? (len / 1000) + ' km' : len + ' m', bx + bw / 2, by - 3 * dpr);
    // Spieler-Pfeil am Rand, wenn außerhalb des Bildes
    if (sx < 0 || sy < 0 || sx > cv.width || sy > cv.height) {
      const cx = cv.width / 2, cy = cv.height / 2, ang = Math.atan2(sy - cy, sx - cx), m = 26 * dpr;
      const ex = Math.max(m, Math.min(cv.width - m, cx + Math.cos(ang) * cv.width)), ey = Math.max(m, Math.min(cv.height - m, cy + Math.sin(ang) * cv.height));
      g.save(); g.translate(ex, ey); g.rotate(ang); g.fillStyle = '#19e6ff'; g.strokeStyle = '#0d1220'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.moveTo(12 * dpr, 0); g.lineTo(-8 * dpr, 9 * dpr); g.lineTo(-8 * dpr, -9 * dpr); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }
}
