// Multiplayer: direkte Verbindung zwischen Geräten (WebRTC über PeerJS)
// Ein Gerät hostet einen Raum (Code), andere treten mit dem Code bei.
// Gesynct werden Spielerfiguren, deren Autos, Treffer, Chat und die Uhrzeit.
import * as THREE from 'three';
import { G } from './state.js';
import { rayChar } from './physics.js';
import { damp, dampAngle, dist2 } from './utils.js';
import * as CFG from './config.js';

const PREFIX = 'neoncoast-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 4;
const SEND_HZ = 12;

let peerLib = null;
function loadPeer() {
  if (peerLib) return Promise.resolve(peerLib);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = './lib/peerjs.min.js';
    s.onload = () => { peerLib = (window.peerjs && window.peerjs.Peer) || window.Peer; peerLib ? res(peerLib) : rej(new Error('PeerJS fehlt')); };
    s.onerror = () => rej(new Error('PeerJS konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}
const code5 = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const C = (h) => new THREE.Color(h);
const hex = (c) => (c && c.getHex ? c.getHex() : c);

function nameTag(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(250, g.measureText(text).width + 30);
  g.fillStyle = 'rgba(10,14,26,0.75)'; g.beginPath(); g.roundRect ? g.roundRect(128 - w / 2, 8, w, 48, 24) : g.rect(128 - w / 2, 8, w, 48); g.fill();
  g.strokeStyle = '#4dd2ff'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#fff'; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  sp.scale.set(2.4, 0.6, 1); sp.renderOrder = 20;
  return sp;
}

export class Multiplayer {
  constructor() {
    this.peer = null; this.code = null; this.host = false;
    this.conns = new Map();     // peerId -> DataConnection
    this.players = new Map();   // id -> Remote
    this.myId = null;
    this.status = 'offline';    // offline | connecting | online
    this.sendT = 0;
    this.onChange = null;
  }
  get online() { return this.status === 'online'; }
  remotes() { return this.players.values(); }

  myLook() {
    const P = G.player, L = P.lookData || {};
    const K = P.look;
    return { skin: hex(K.skin), hair: hex(K.hair), shirt: hex(K.shirt), pants: hex(K.pants), shoes: hex(K.shoes), shorts: !!P.shorts, hairStyle: P.hairStyle || L.hairStyle || 'short', scale: K.scale || 0.96 };
  }

  // ------------------------------------------------------------ Verbindung
  async hostGame() {
    await this.leave(true);
    const Peer = await loadPeer();
    this.status = 'connecting'; this.host = true; this.changed();
    return new Promise((res, rej) => {
      const tryOpen = (attempt) => {
        this.code = code5();
        const peer = new Peer(PREFIX + this.code, { debug: 0 });
        this.peer = peer;
        peer.on('open', (id) => { this.myId = id; this.status = 'online'; this.changed(); res(this.code); });
        peer.on('connection', (conn) => this.acceptGuest(conn));
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryOpen(attempt + 1); return; }
          this.fail(e); rej(e);
        });
        peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
      };
      tryOpen(0);
    });
  }

  async joinGame(code) {
    await this.leave(true);
    code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) throw new Error('Der Code hat 5 Zeichen.');
    const Peer = await loadPeer();
    this.status = 'connecting'; this.host = false; this.code = code; this.changed();
    return new Promise((res, rej) => {
      const peer = new Peer({ debug: 0 });
      this.peer = peer;
      let done = false;
      const to = setTimeout(() => { if (!done) { done = true; const e = new Error('Zeitüberschreitung – Raum nicht erreichbar.'); this.fail(e); rej(e); } }, 15000);
      peer.on('open', (id) => {
        this.myId = id;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          this.conns.set(conn.peer, conn);
          conn.send({ t: 'hello', name: G.player.name, look: this.myLook() });
        });
        conn.on('data', (m) => {
          if (m.t === 'welcome' && !done) { done = true; clearTimeout(to); this.status = 'online'; this.changed(); res(m); }
          if (m.t === 'full' && !done) { done = true; clearTimeout(to); const e = new Error('Der Raum ist voll.'); this.fail(e); rej(e); return; }
          this.onData(conn, m);
        });
        conn.on('close', () => { if (this.peer === peer) { G.hud.toast('Verbindung zum Host getrennt.'); this.leave(); } });
      });
      peer.on('error', (e) => { if (!done) { done = true; clearTimeout(to); this.fail(e); rej(e); } else this.fail(e); });
    });
  }

  acceptGuest(conn) {
    conn.on('open', () => {
      if (this.conns.size >= MAX_PLAYERS - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); return; }
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (m) => this.onData(conn, m));
    conn.on('close', () => this.dropPeer(conn.peer));
    conn.on('error', () => this.dropPeer(conn.peer));
  }

  dropPeer(id) {
    this.conns.delete(id);
    const r = this.players.get(id);
    if (r) { G.hud.toast(`${r.name} hat das Spiel verlassen.`); this.removeRemote(id); }
    if (this.host) this.broadcast({ t: 'leave', id });
    this.changed();
  }

  async leave(silent = false) {
    if (this.coop) { this.coop.ended = true; this.coop = null; if (G.missions && G.missions.active && G.missions.active.id === 'coop') G.missions.fail(silent ? '' : 'Multiplayer-Auftrag beendet.'); }
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* */ } }
    this.conns.clear();
    for (const id of [...this.players.keys()]) this.removeRemote(id);
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* */ } }
    this.peer = null; this.code = null; this.host = false; this.myId = null;
    if (this.status !== 'offline' && !silent) G.hud.toast('Multiplayer beendet.');
    this.status = 'offline';
    this.changed();
  }

  fail(e) {
    const msg = {
      'peer-unavailable': 'Raum nicht gefunden – stimmt der Code?',
      network: 'Keine Verbindung zum Vermittlungsserver. Bist du online?',
      'browser-incompatible': 'Dieser Browser unterstützt keinen Multiplayer.',
      'server-error': 'Vermittlungsserver nicht erreichbar.',
      'socket-error': 'Verbindungsfehler.',
    }[e && e.type] || (e && e.message) || 'Verbindungsfehler.';
    this.lastError = msg;
    G.hud.toast('Multiplayer: ' + msg);
    this.leave(true);
  }

  changed() { if (this.onChange) this.onChange(); }

  // ------------------------------------------------------------ Nachrichten
  send(conn, m) { try { if (conn.open) conn.send(m); } catch (e) { /* */ } }
  broadcast(m, except = null) { for (const [id, c] of this.conns) if (id !== except) this.send(c, m); }

  onData(conn, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': {
        if (!this.host) return;
        const id = conn.peer;
        this.upsertRemote(id, String(m.name || 'Gast').slice(0, 14), m.look);
        const P = G.player;
        const list = [{ id: this.myId, name: P.name, look: this.myLook() }];
        for (const r of this.players.values()) if (r.id !== id) list.push({ id: r.id, name: r.name, look: r.look });
        this.send(conn, { t: 'welcome', you: id, players: list, time: G.timeOfDay, x: P.x, z: P.z, int: !!G.interior });
        this.broadcast({ t: 'join', id, name: m.name, look: m.look }, id);
        G.hud.toast(`${m.name} ist deinem Spiel beigetreten!`);
        G.audio.pickup();
        this.changed();
        break;
      }
      case 'welcome': {
        for (const p of m.players) this.upsertRemote(p.id, p.name, p.look);
        G.timeOfDay = m.time;
        // Neben dem Host erscheinen (nicht in Innenräumen)
        if (!m.int && !G.player.inCar) {
          if (G.interiors && G.interior) G.interiors.cleanup();
          G.player.x = m.x + 2.5; G.player.z = m.z + 1.5; G.player.y = G.world.groundHeight(G.player.x, G.player.z);
          G.cam.snap();
        }
        G.hud.toast('Verbunden! Du spielst jetzt zusammen.');
        G.audio.pickup();
        this.changed();
        break;
      }
      case 'join': if (m.id !== this.myId) { this.upsertRemote(m.id, m.name, m.look); G.hud.toast(`${m.name} ist beigetreten.`); this.changed(); } break;
      case 'leave': if (this.players.has(m.id)) { G.hud.toast(`${this.players.get(m.id).name} hat das Spiel verlassen.`); this.removeRemote(m.id); this.changed(); } break;
      case 'look': { const r = this.players.get(m.id || conn.peer); if (r) { r.name = m.name; this.applyLook(r, m.look); } if (this.host) this.broadcast({ ...m, id: m.id || conn.peer }, conn.peer); break; }
      case 's': {
        const id = this.host ? conn.peer : m.id;
        if (this.host) this.broadcast({ ...m, id }, conn.peer);
        if (!this.host && m.time != null && m.id === PREFIX + this.code) G.timeOfDay = m.time;
        const r = this.players.get(id);
        if (r) this.applyState(r, m);
        break;
      }
      case 'hit': {
        if (this.host && m.to !== this.myId) { const c = this.conns.get(m.to); if (c) this.send(c, m); return; }
        if (m.to !== this.myId) return;
        const from = this.players.get(m.from);
        G.player.damage(Math.min(60, +m.dmg || 0), 'mp');
        if (G.player.state === 'dead') this.sendTo(m.from, { t: 'ko', from: this.myId, to: m.from });
        if (from) G.hud.toast(`Getroffen von ${from.name}!`);
        break;
      }
      case 'ko': {
        if (this.host && m.to !== this.myId) { const c = this.conns.get(m.to); if (c) this.send(c, m); return; }
        if (m.to === this.myId) { const r = this.players.get(m.from); G.hud.toast(`Du hast ${r ? r.name : 'jemanden'} ausgeschaltet!`); }
        break;
      }
      case 'mm': if (!this.host) this.onCoopStart(m); break;
      case 'mmf': if (this.host && this.coop) this.hostFinish(m.id || conn.peer); break;
      case 'mml': if (this.host && this.coop) this.hostClaim(m.i, conn.peer); break;
      case 'mmlt': if (!this.host && this.coop) this.onTaken(m.i, m.by); break;
      case 'mme': if (!this.host && this.coop) this.onEnd(m.result); break;
      case 'mmk': if (this.host && this.coop) this.hostKill(); break;
      case 'mmkt': if (!this.host && this.coop) this.coop.kills = m.n; break;
      case 'chat': {
        const id = m.from || conn.peer;
        if (this.host) this.broadcast({ ...m, from: id }, conn.peer);
        const r = this.players.get(id);
        G.hud.toast(`💬 ${r ? r.name : 'Spieler'}: ${String(m.text).slice(0, 80)}`);
        G.audio.click();
        break;
      }
    }
  }
  sendTo(id, m) {
    if (this.host) { const c = this.conns.get(id); if (c) this.send(c, m); }
    else this.broadcast(m);
  }

  // ------------------------------------------------------------ Mitspieler
  upsertRemote(id, name, look) {
    if (id === this.myId) return;
    let r = this.players.get(id);
    if (!r) {
      r = { id, isRemote: true, name: name || 'Gast', x: 0, y: -100, z: 0, yaw: 0, tx: 0, ty: -100, tz: 0, tyaw: 0, anim: { phase: 0, amp: 0, run: 0, t: 0 }, car: null, carKey: null, visible: false, last: 0, gy: 0, hp: 100 };
      r.tag = nameTag(r.name);
      r.tag.visible = false;
      G.scene.add(r.tag);
      this.players.set(id, r);
    }
    r.name = name || r.name;
    this.applyLook(r, look);
    return r;
  }
  applyLook(r, L) {
    if (!L) L = { skin: 0xd9a066, hair: 0x111111, shirt: 0x4dd2ff, pants: 0x222222, shoes: 0xffffff, hairStyle: 'short', scale: 0.96 };
    r.look = L;
    r.lk = {
      skin: C(L.skin), shirt: C(L.shirt), sleeve: C(L.shirt), pants: C(L.pants), legs: C(L.shorts ? L.skin : L.pants), hair: C(L.hair), shoes: C(L.shoes),
      hat: L.hairStyle === 'cap' ? C(L.hair) : null, bald: L.hairStyle === 'bald', scale: L.scale || 0.96,
    };
    if (r.tag) { G.scene.remove(r.tag); r.tag = nameTag(r.name); G.scene.add(r.tag); }
  }
  removeRemote(id) {
    const r = this.players.get(id);
    if (!r) return;
    if (r.car) r.car.remove();
    if (r.tag) G.scene.remove(r.tag);
    this.players.delete(id);
  }
  applyState(r, m) {
    r.tx = m.x; r.ty = m.y; r.tz = m.z; r.tyaw = m.r;
    if (!r.visible) { r.x = m.x; r.y = m.y; r.z = m.z; r.yaw = m.r; }
    r.visible = true; r.last = G.time;
    const a = m.a || {};
    Object.assign(r.anim, { amp: a.m || 0, run: a.u || 0, aim: !!a.aim, gun: !!a.gun, twoHand: !!a.th, air: !!a.air, swim: !!a.sw, tilt: a.ti || 0, lift: a.li || 0, dance: !!a.d, handsUp: !!a.hu, punch: a.p || 0 });
    r.hp = m.hp;
    if (m.c) {
      const c = m.c;
      if (!r.car || r.carKey !== c.k || r.car.removed) {
        if (r.car && !r.car.removed) r.car.remove();
        r.car = G.vm.spawn(c.k, c.x, c.z, c.h, c.col);
        if (r.car) { r.car.persistent = true; r.car.remote = true; r.car.driver = 'remote'; r.car.mpOwner = r.id; }
        r.carKey = c.k;
      }
      if (r.car) Object.assign(r.car, { _tx: c.x, _ty: c.y, _tz: c.z, _th: c.h, _tp: c.p, _tr: c.ro, _ts: c.s, _tvx: c.vx, _tvz: c.vz, siren: !!c.si });
    } else if (r.car) { r.car.remove(); r.car = null; r.carKey = null; }
  }

  // ------------------------------------------------------------ Pro Frame
  update(dt) {
    if (!this.online) return;
    const P = G.player;
    // Zustand senden
    this.sendT -= dt;
    if (this.sendT <= 0 && this.conns.size) {
      this.sendT = 1 / SEND_HZ;
      const A = P.anim, v = P.inCar ? P.vehicle : null;
      const m = { t: 's', id: this.myId, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), r: +P.yaw.toFixed(3), hp: Math.round(P.health),
        a: { m: +(A.amp || 0).toFixed(2), u: +(A.run || 0).toFixed(2), aim: A.aim ? 1 : 0, gun: A.gun ? 1 : 0, th: A.twoHand ? 1 : 0, air: A.air ? 1 : 0, sw: A.swim ? 1 : 0, ti: +(A.tilt || 0).toFixed(2), li: +(A.lift || 0).toFixed(2), d: A.dance ? 1 : 0, hu: A.handsUp ? 1 : 0, p: +(A.punch || 0).toFixed(2) } };
      if (P.state === 'dead') m.a.ti = -1.57;
      if (v) m.c = { k: v.key, col: v.color, x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2), h: +v.h.toFixed(3), p: +v.pitch.toFixed(3), ro: +v.roll.toFixed(3), s: +v.steer.toFixed(2), vx: +v.vx.toFixed(1), vz: +v.vz.toFixed(1), si: v.siren ? 1 : 0 };
      if (this.host) m.time = +G.timeOfDay.toFixed(3);
      this.broadcast(m);
    }
    if (this.host && this.coop && !this.coop.ended) this.hostCoopCheck(dt);
    // Mitspieler glätten
    for (const r of this.players.values()) {
      if (!r.visible) continue;
      if (G.time - r.last > 6) { r.visible = false; if (r.car) { r.car.remove(); r.car = null; r.carKey = null; } r.tag.visible = false; continue; }
      const k = 12;
      r.x = damp(r.x, r.tx, k, dt); r.y = damp(r.y, r.ty, k, dt); r.z = damp(r.z, r.tz, k, dt);
      r.yaw = dampAngle(r.yaw, r.tyaw, k, dt);
      r.gy = r.y;
      r.anim.t += dt;
      r.anim.phase += dt * (r.anim.amp > 0.05 ? 2.4 + r.anim.amp * 7 : 0);
      const c = r.car;
      if (c && c._tx != null) {
        // Vorhersage mit Geschwindigkeit, dann weich angleichen
        c._tx += (c._tvx || 0) * dt; c._tz += (c._tvz || 0) * dt;
        c.x = damp(c.x, c._tx, 10, dt); c.y = damp(c.y, c._ty, 10, dt); c.z = damp(c.z, c._tz, 10, dt);
        c.h = dampAngle(c.h, c._th, 10, dt); c.pitch = c._tp; c.roll = c._tr; c.steer = c._ts;
        c.vx = c._tvx || 0; c.vz = c._tvz || 0;
        c.spin += (Math.hypot(c.vx, c.vz) / c.T.wheelR) * dt;
        c.grounded = true;
      }
      // Namensschild
      const inCar = !!r.car;
      const tx = inCar ? r.car.x : r.x, ty = (inCar ? r.car.y + r.car.height : r.y + 1.95) + 0.55, tz = inCar ? r.car.z : r.z;
      r.tag.position.set(tx, ty, tz);
      r.tag.visible = dist2(tx, tz, G.camera.position.x, G.camera.position.z) < 160 * 160;
    }
  }

  // Für das Rendering (Figuren, die nicht im Auto sitzen)
  renderInto(R) {
    for (const r of this.players.values()) {
      if (!r.visible || r.car || !r.lk) continue;
      R.add({ x: r.x, y: r.y, z: r.z, yaw: r.yaw, look: r.lk, anim: r.anim });
    }
  }

  // Treffer durch Schuss prüfen
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (const r of this.players.values()) {
      if (!r.visible || r.car) continue;
      const t = rayChar(ox, oy, oz, dx, dy, dz, r.x, r.y, r.z, 0.45, 1.85, bt);
      if (t >= 0 && t < bt) { bt = t; best = r; }
    }
    return best ? { t: bt, r: best } : null;
  }
  sendHit(r, dmg) { this.sendTo(r.id, { t: 'hit', to: r.id, from: this.myId, dmg: Math.round(dmg) }); }
  chat(text) {
    text = String(text || '').trim().slice(0, 80);
    if (!text || !this.online) return;
    this.broadcast({ t: 'chat', from: this.myId, text });
    G.hud.toast(`💬 Du: ${text}`);
  }
  // ------------------------------------------------------------ Gemeinsame Aufträge
  nameOf(id) { if (id === this.myId) return G.player.name; const r = this.players.get(id); return r ? r.name : 'Spieler'; }
  posOf(id) {
    if (id === this.myId) { const P = G.player; return P.inCar ? P.vehicle : P; }
    const r = this.players.get(id); if (!r || !r.visible) return null;
    return r.car || r;
  }
  startCoop(mode) {
    if (!this.host || !this.online) return false;
    if (this.coop && !this.coop.ended) { G.hud.toast('Es läuft bereits ein gemeinsamer Auftrag.'); return false; }
    const ids = [this.myId, ...[...this.players.values()].filter((r) => r.visible).map((r) => r.id)];
    if (ids.length < 2) { G.hud.toast('Es muss mindestens ein Mitspieler im Spiel sein.'); return false; }
    const W = G.world, rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const m = { t: 'mm', mode, ids };
    if (mode === 'race') {
      const inner = W.nodes.filter((n) => n.i >= 1 && n.i <= 8 && n.j >= 1 && n.j <= 8);
      const S = rnd(inner), N1 = W.nodes[rnd(S.nbr)];
      const route = [S.id, N1.id];
      let prev = S, cur = N1;
      for (let k = 0; k < 9; k++) {
        const opts = cur.nbr.filter((id) => id !== prev.id && !route.includes(id));
        if (!opts.length) break;
        const nx = W.nodes[rnd(opts)]; route.push(nx.id); prev = cur; cur = nx;
      }
      const dx = Math.sign(N1.x - S.x), dz = Math.sign(N1.z - S.z);
      m.grid = ids.map((id, k) => { const back = 24 - Math.floor(k / 2) * 9, lane = k % 2 ? 6 : 2; return [S.x + dx * back - dz * lane, S.z + dz * back + dx * lane, Math.atan2(dx, dz)]; });
      m.cps = route.slice(1).map((id) => [W.nodes[id].x, W.nodes[id].z]);
    } else if (mode === 'hill') {
      // Bergrennen: Start auf dem Damm, Ziel im Bergdorf Monte Solera
      const R = W.hillRoad;
      m.mode = 'race'; m.hill = true;
      m.grid = ids.map((id, k) => [k % 2 ? 36.5 : 43.5, -398 - Math.floor(k / 2) * 9, Math.PI]);
      m.cps = [];
      for (let i = 10; i < R.pts.length - 1; i += 12) m.cps.push(R.pts[i]);
      m.cps.push(R.pts[R.pts.length - 1]);
    } else if (mode === 'defend') {
      m.dur = 180; m.target = 8 + ids.length * 6;
    } else if (mode === 'hunt') {
      m.fugitive = rnd(ids); m.dur = 150;
    } else if (mode === 'loot') {
      m.bags = []; m.dur = 180;
      for (let k = 0; k < 12; k++) {
        const loop = G.peds.sidewalkLoop(1 + Math.floor(Math.random() * 7), 1 + Math.floor(Math.random() * 7), 0.6);
        const c = Math.floor(Math.random() * 4), a = loop[c], b = loop[(c + 1) % 4], t = 0.2 + Math.random() * 0.6;
        m.bags.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    this.broadcast(m);
    this.onCoopStart(m);
    return true;
  }
  onCoopStart(m) {
    this.coop = { ...m, finished: [], taken: {}, pending: {}, ended: false, result: null, startT: G.time, caughtT: 0, kills: 0, myKills: 0 };
    if (G.missions.active) G.missions.fail('');
    if (G.interiors && G.interior) G.interiors.cleanup();
    G.missions.start(coopDef(this, this.coop));
  }
  sendFinish() { if (this.host) this.hostFinish(this.myId); else this.broadcast({ t: 'mmf', id: this.myId }); }
  hostFinish(id) {
    const C = this.coop; if (!C || C.ended || C.finished.includes(id)) return;
    C.finished.push(id);
    if (C.firstT == null) C.firstT = G.time;
    const active = C.ids.filter((x) => x === this.myId || this.players.has(x));
    if (C.finished.length >= active.length) this.endCoop({ order: C.finished });
  }
  claimBag(i) { if (this.host) this.hostClaim(i, this.myId); else this.broadcast({ t: 'mml', i, by: this.myId }); }
  hostClaim(i, by) {
    const C = this.coop; if (!C || C.ended || C.taken[i] !== undefined) return;
    this.broadcast({ t: 'mmlt', i, by });
    this.onTaken(i, by);
    if (Object.keys(C.taken).length >= C.bags.length) this.endCoop({ total: C.bags.length });
  }
  onTaken(i, by) {
    const C = this.coop; if (!C) return;
    C.taken[i] = by;
    if (C.marks && C.marks[i]) { G.missions.removeMarker(C.marks[i]); C.marks[i] = null; }
    G.hud.toast(`💰 ${by === this.myId ? 'Du hast' : this.nameOf(by) + ' hat'} einen Geldsack (${Object.keys(C.taken).length}/${C.bags.length})`);
    G.audio.cash();
  }
  sendKill() { const C = this.coop; if (!C) return; C.myKills++; if (this.host) this.hostKill(); else this.broadcast({ t: 'mmk' }); }
  hostKill() {
    const C = this.coop; if (!C || C.ended) return;
    C.kills++;
    this.broadcast({ t: 'mmkt', n: C.kills });
    if (C.kills >= C.target) this.endCoop({ ok: true, total: C.kills });
  }
  endCoop(result) { const C = this.coop; if (!C || C.ended) return; this.broadcast({ t: 'mme', result }); this.onEnd(result); }
  onEnd(result) { const C = this.coop; if (!C) return; C.ended = true; C.result = result; }
  hostCoopCheck(dt) {
    const C = this.coop, el = G.time - C.startT;
    if (C.mode === 'race') {
      if (C.firstT != null && G.time - C.firstT > 45) this.endCoop({ order: C.finished });
      if (el > 600) this.endCoop({ order: C.finished });
    } else if (C.mode === 'hunt') {
      const f = this.posOf(C.fugitive);
      let close = false;
      if (f) for (const id of C.ids) { if (id === C.fugitive) continue; const h = this.posOf(id); if (h && dist2(h.x, h.z, f.x, f.z) < 49) close = true; }
      C.caughtT = close ? C.caughtT + dt : Math.max(0, C.caughtT - dt * 0.5);
      if (C.caughtT > 3) this.endCoop({ winner: 'hunters' });
      else if (el > C.dur) this.endCoop({ winner: 'fugitive' });
    } else if (C.mode === 'loot') {
      if (el > C.dur) this.endCoop({ total: Object.keys(C.taken).length });
    } else if (C.mode === 'defend') {
      if (el > C.dur) this.endCoop({ ok: false, total: C.kills });
    }
  }

  sendLook() { if (this.online) this.broadcast({ t: 'look', id: this.myId, name: G.player.name, look: this.myLook() }); }
}

// Ablauf der gemeinsamen Aufträge auf jedem Gerät
function coopDef(M, C) {
  return {
    id: 'coop', title: 'Multiplayer-Auftrag', side: true, reward: 0,
    *run(m) {
      const P = G.player;
      if (C.mode === 'race') {
        const k = Math.max(0, C.ids.indexOf(M.myId));
        const [x, z, h] = C.grid[k] || C.grid[0];
        if (P.inCar) P.exitVehicle(true);
        P.state = 'foot'; P.visible = true;
        const car = m.spawnCar('zephyra', x, z, h, [0xe63946, 0x00b4d8, 0xffb703, 0x7cff6b][k % 4], { keep: true });
        if (car) { car.parked = false; P.x = x; P.z = z; P.enterVehicle(car); }
        G.cam.snap();
        m.freeze = true;
        G.hud.bigToast(C.hill ? 'BERGRENNEN' : 'MULTIPLAYER-RENNEN', C.hill ? 'Vom Damm hinauf nach Monte Solera · 1. Platz: $2.000' : `${C.cps.length} Checkpoints · 1. Platz: $2.000`);
        for (const t of ['3', '2', '1']) { G.hud.countdown(t); G.audio.countdown(false); yield* m.wait(1); }
        G.hud.countdown('LOS!'); G.audio.countdown(true);
        m.freeze = false;
        for (let i = 0; i < C.cps.length && !C.ended; i++) {
          const [cx, cz] = C.cps[i], last = i === C.cps.length - 1;
          const mk = m.marker(cx, cz, last ? 0xffd23f : 0xff2e88, { r: 10, h: 6, blipCol: last ? '#ffd23f' : '#ff2e88' });
          m.objective(`Checkpoint <b>${i + 1}/${C.cps.length}</b>`);
          yield* m.until(() => { const v = P.inCar ? P.vehicle : P; return C.ended || dist2(v.x, v.z, cx, cz) < 110; });
          m.removeMarker(mk);
          if (!C.ended) G.audio.checkpoint();
        }
        if (!C.ended) { M.sendFinish(); m.objective('Im Ziel! Warte auf die anderen …'); }
        yield* m.until(() => C.ended);
        const order = (C.result && C.result.order) || [];
        const place = order.indexOf(M.myId) + 1;
        const prize = [0, 2000, 1000, 500, 250][place] || 0;
        G.hud.banner(place === 1 ? 'GEWONNEN!' : place ? `PLATZ ${place}` : 'RENNEN VORBEI', place === 1 ? '#ffd23f' : '#19e6ff', order.map((id, i) => `${i + 1}. ${M.nameOf(id)}`).join('  ·  ') + (prize ? `  ·  +$${prize}` : ''));
        if (prize) P.addMoney(prize);
        G.audio.jingle();
      } else if (C.mode === 'hunt') {
        const fug = C.fugitive === M.myId;
        G.hud.bigToast(fug ? 'DU BIST DER FLÜCHTIGE!' : 'VERFOLGUNGSJAGD', fug ? 'Entkomme 2:30 Minuten lang!' : `Fang ${M.nameOf(C.fugitive)}! (3 Sekunden in 7 m Nähe bleiben)`);
        if (!fug) {
          const tgt = { get x() { const p = M.posOf(C.fugitive); return p ? p.x : 0; }, get y() { const p = M.posOf(C.fugitive); return p ? p.y : -50; }, get z() { const p = M.posOf(C.fugitive); return p ? p.z : 0; }, height: 1.8 };
          m.marker(0, 0, 0xff3b5c, { arrow: true, follow: tgt, blipCol: '#ff3b5c' });
        }
        while (!C.ended) {
          G.hud.timer(Math.max(0, C.dur - (G.time - C.startT)));
          m.objective(fug ? 'Entkomme den Jägern! Bleib nicht stehen.' : `Fang <b>${M.nameOf(C.fugitive)}</b>!`);
          yield;
        }
        G.hud.timer(null);
        const fugWon = C.result && C.result.winner === 'fugitive', iWon = fug ? fugWon : !fugWon;
        G.hud.banner(iWon ? 'GEWONNEN!' : 'VERLOREN', iWon ? '#ffd23f' : '#ff3b5c', (fugWon ? `${M.nameOf(C.fugitive)} ist entkommen` : `${M.nameOf(C.fugitive)} wurde gefasst`) + (iWon ? '  ·  +$1.500' : ''));
        if (iWon) { P.addMoney(1500); G.audio.jingle(); } else G.audio.fail();
      } else if (C.mode === 'defend') {
        // Jedes Gerät bekämpft seine eigenen Angreifer, die Abschüsse zählen fürs Team
        G.hud.bigToast('HAFENVERTEIDIGUNG (KOOP)', `Haltet die Tiburones vom Frachter fern! Ziel: ${C.target} Abschüsse im Team`);
        const goal = { x: -220, z: 371 };
        P.giveWeapon('rifle', 150); P.armor = 100;
        m.marker(goal.x, goal.z - 3, 0x19e6ff, { r: 4, h: 3, blipCol: '#19e6ff' });
        G.police.locked = true;
        const spots = [[-370, 366], [-60, 366], [-360, 300], [-40, 300], [-220, 284]];
        let gang = [], nextT = 0;
        while (!C.ended) {
          const alive = m.aliveGang(gang);
          for (const p of gang) if (!p.alive && !p.counted) { p.counted = true; M.sendKill(); }
          nextT -= G.dt;
          if (alive < 4 && nextT <= 0) { const [x, z] = spots[Math.floor(Math.random() * spots.length)]; gang = gang.filter((p) => p.alive || !p.counted).concat(m.gang(x, z, 2, { gun: true, hp: 50, goal, aggro: 32, col: 0x0b6e4f, slow: 1.3 })); nextT = 6; }
          G.hud.timer(Math.max(0, C.dur - (G.time - C.startT)));
          m.objective(`Team-Abschüsse: <b>${C.kills}/${C.target}</b> · Deine: <b>${C.myKills}</b>`);
          yield;
        }
        G.hud.timer(null);
        G.police.locked = false;
        for (const p of gang) if (p.alive) G.peds.remove(p);
        const ok = C.result && C.result.ok, pay = (ok ? 1500 : 0) + C.myKills * 150;
        G.hud.banner(ok ? 'HAFEN GESICHERT!' : 'ZEIT ABGELAUFEN', ok ? '#7dffa0' : '#ff3b5c', `Team: ${C.kills} Abschüsse  ·  +$${pay}`);
        if (pay) { P.addMoney(pay); G.audio.jingle(); } else G.audio.fail();
      } else if (C.mode === 'loot') {
        G.hud.bigToast('BEUTEJAGD (KOOP)', `Sammelt zusammen ${C.bags.length} Geldsäcke in 3 Minuten!`);
        C.marks = C.bags.map(([x, z], i) => (C.taken[i] === undefined ? m.marker(x, z, 0x7cff6b, { r: 1.6, h: 3, label: '$', blipCol: '#7cff6b' }) : null));
        while (!C.ended) {
          G.hud.timer(Math.max(0, C.dur - (G.time - C.startT)));
          m.objective(`Geldsäcke im Team: <b>${Object.keys(C.taken).length}/${C.bags.length}</b>`);
          const v = P.inCar ? P.vehicle : P;
          C.bags.forEach(([x, z], i) => { if (C.taken[i] === undefined && !C.pending[i] && dist2(v.x, v.z, x, z) < 12) { C.pending[i] = 1; M.claimBag(i); } });
          yield;
        }
        G.hud.timer(null);
        const got = Object.keys(C.taken).length, share = got * 300;
        G.hud.banner('BEUTEJAGD BEENDET', '#7dffa0', `Team: ${got}/${C.bags.length} Säcke  ·  Dein Anteil: +$${share}`);
        if (share) { P.addMoney(share); G.audio.jingle(); }
      }
    },
  };
}
