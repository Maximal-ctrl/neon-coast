// HUD, Minikarte, Menüs
import * as THREE from 'three';
import { G } from './state.js';
import * as C from './config.js';
import { WEAPONS } from './combat.js';
import { STATIONS } from './audio.js';
import { clamp, fmtMoney, fmtTime, lerp } from './utils.js';

const $ = (id) => document.getElementById(id);

export const ICONS = {
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

  // ------------------------------------------------------------ Karte groß
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
      if (ptrs.size === 1) drag = { p: toCanvas(e) };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this.mapView.zoom }; drag = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!ptrs.has(e.pointerId) || !this.mapView) return;
      const p = toCanvas(e); ptrs.set(e.pointerId, p);
      const V = this.mapView;
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        this.setZoom(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        moved += 10;
      } else if (drag) {
        const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
        moved += Math.abs(dx) + Math.abs(dy);
        V.ox += dx; V.oy += dy; drag.p = p;
        this.drawBigMap(true);
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId);
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0) {
        if (moved < 12 && drag) this.tapMap(p[0], p[1]);
        drag = null;
      }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = toCanvas(e); this.setZoom(this.mapView.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p[0], p[1]); }, { passive: false });
    $('map-zin').onclick = () => this.setZoom(this.mapView.zoom * 1.4, cv.width / 2, cv.height / 2);
    $('map-zout').onclick = () => this.setZoom(this.mapView.zoom / 1.4, cv.width / 2, cv.height / 2);
    $('map-center').onclick = () => { this.mapView = null; this.drawBigMap(); };
  }
  setZoom(z, cx, cy) {
    const V = this.mapView;
    z = Math.max(V.min, Math.min(V.min * 8, z));
    // Punkt unter (cx,cy) bleibt fest
    V.ox = cx - (cx - V.ox) * (z / V.zoom); V.oy = cy - (cy - V.oy) * (z / V.zoom);
    V.zoom = z;
    this.drawBigMap(true);
  }
  tapMap(mx, my) {
    const V = this.mapView, W = G.world, MB = W.mapBounds;
    const wx = MB.x0 + ((mx - V.ox) / V.zoom) / W.mapScale, wz = MB.z0 + ((my - V.oy) / V.zoom) / W.mapScale;
    const M = G.missions;
    if (M.waypoint && Math.hypot(M.waypoint.x - wx, M.waypoint.z - wz) < 30) { M.waypoint = null; this.toast('Wegpunkt entfernt'); }
    else { M.waypoint = { x: wx, z: wz }; this.toast('Wegpunkt gesetzt – folge der lila Route'); }
    this.routeT = 0;
    this.drawBigMap(true);
  }
  drawBigMap(keep = false) {
    const cv = $('bigmap'), g = cv.getContext('2d');
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = G.world, img = W.mapCanvas;
    if (!keep || !this.mapView) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      const fit = Math.min(cv.width / img.width, cv.height / img.height);
      if (!this.mapView || !keep) {
        // auf den Spieler zentriert, leicht vergrößert
        const P = G.player, px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z;
        const [mx, mz] = W.mapToPx(px, pz);
        const zoom = fit * 1.6;
        this.mapView = { min: fit * 0.9, zoom, ox: cv.width / 2 - mx * zoom, oy: cv.height / 2 - mz * zoom };
      }
    }
    const V = this.mapView, k = V.zoom;
    g.fillStyle = '#3f7299'; g.fillRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(img, V.ox, V.oy, img.width * k, img.height * k);
    const toS = (x, z) => { const [mx, mz] = W.mapToPx(x, z); return [V.ox + mx * k, V.oy + mz * k]; };
    const u = dpr * Math.min(1.6, Math.max(0.9, k / (Math.min(cv.width, cv.height) / img.width)));
    // Bezirksnamen
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(13 * u)}px Oswald, sans-serif`;
    const labels = [['CORAL HEIGHTS', 0, -300], ['DOWNTOWN', 0, -80], ['MIDTOWN', 200, -40], ['WESTSIDE', -280, 0], ['HAFEN', -200, 330], ['SEASIDE', 330, -150], ['SOLERA BEACH', 425, 200], ['SUNSET PIER', 600, 95], ['SOLERA HILLS', 200, -900], ['ALTSTADT', -480, -40], ['MONTE SOLERA', -160, -860]];
    for (const [t, x, z] of labels) { const [sx, sy] = toS(x, z); g.lineWidth = 3 * u; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText(t, sx, sy); g.fillStyle = 'rgba(40,44,52,0.9)'; g.fillText(t, sx, sy); }
    // Route
    const tgt = this.getRouteTarget();
    if (tgt && this.route) {
      g.save(); g.lineWidth = 5 * u; g.lineJoin = 'round'; g.lineCap = 'round';
      g.strokeStyle = G.missions.gpsTarget ? '#ffd60a' : '#be6eff'; g.shadowColor = g.strokeStyle; g.shadowBlur = 10 * u;
      g.beginPath(); this.route.forEach(([x, z], i) => { const [sx, sy] = toS(x, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }); g.stroke(); g.restore();
    }
    // Symbole
    const icon = (x, z, col, label, size = 13) => {
      const [sx, sy] = toS(x, z), rad = size * u;
      g.save();
      g.shadowColor = col; g.shadowBlur = 14 * u;
      g.fillStyle = '#0d1220'; g.beginPath(); g.arc(sx, sy, rad, 0, 7); g.fill();
      g.shadowBlur = 0; g.lineWidth = 3 * u; g.strokeStyle = col; g.stroke();
      g.fillStyle = col; g.font = `700 ${Math.round(rad * 1.15)}px Oswald, sans-serif`; g.fillText(label, sx, sy + 1 * u);
      g.restore();
      return [sx, sy, rad];
    };
    for (const b of G.missions.mapBlips(true)) {
      const [sx, sy, rad] = icon(b.x, b.z, b.col, b.label || '•', b.label ? 13 : 9);
      if (b.name && k > V.min * 1.5) { g.font = `600 ${Math.round(11 * u)}px Inter, sans-serif`; g.fillStyle = '#1b1e24'; g.fillText(b.name, sx, sy + rad + 9 * u); }
    }
    if (G.missions.waypoint) icon(G.missions.waypoint.x, G.missions.waypoint.z, '#be6eff', '⚑', 12);
    // Spieler
    const P = G.player, px = P.inCar ? P.vehicle.x : P.x, pz = P.inCar ? P.vehicle.z : P.z, ph = P.inCar ? P.vehicle.h : P.yaw;
    const [sx, sy] = toS(px, pz);
    g.save(); g.translate(sx, sy);
    g.fillStyle = 'rgba(25,230,255,0.18)'; g.beginPath(); g.arc(0, 0, 22 * u, 0, 7); g.fill();
    g.rotate(Math.atan2(Math.cos(ph), Math.sin(ph)));
    const a = 12 * u;
    g.shadowColor = '#19e6ff'; g.shadowBlur = 12 * u;
    g.fillStyle = '#fff'; g.strokeStyle = '#0d1220'; g.lineWidth = 2.5 * u;
    g.beginPath(); g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.68); g.lineTo(-a * 0.3, 0); g.lineTo(-a * 0.7, -a * 0.68); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
