// Eingabe: Tastatur, Maus, Touch (iPad), Gamepad
import { G } from './state.js';
import { clamp } from './utils.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyF: 'enter', KeyE: 'enter', Enter: 'enter',
  KeyQ: 'weapon', KeyR: 'radio', KeyH: 'horn', KeyM: 'map', Escape: 'pause', KeyP: 'pause', KeyC: 'camera', KeyG: 'siren',
  KeyX: 'handbrake', KeyT: 'phone', KeyI: 'inv', Tab: 'wheel',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = new Set();
    this.touchBtns = new Set();
    this.pad = new Set();
    this.taps = new Set();
    this.prev = new Set();
    this.cur = new Set();
    this.moveX = 0; this.moveY = 0;
    this.lookDX = 0; this.lookDY = 0;
    this._mdx = 0; this._mdy = 0;
    this._tdx = 0; this._tdy = 0;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = null;
    this.gas = 0; this.brake = 0;
    this.locked = false;
    this.tapsFrame = new Set();
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT')) return;
      if (e.code === 'Tab') e.preventDefault();
      const k = KEYMAP[e.code];
      if (k) {
        if (!this.keys.has(k)) this.taps.add(k);
        this.keys.add(k);
        if (k === 'jump') { this.taps.add('handbrake'); }
        if (['up', 'down', 'left', 'right', 'jump'].includes(k) || e.code === 'Tab') e.preventDefault();
      }
      if (e.code === 'Tab') e.preventDefault();
      this.setTouchMode(false);
    });
    window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) this.keys.delete(k); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); this.touchBtns.clear(); });
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (G.isTouch && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
      this.setTouchMode(false);
      if (G.state === 'playing' && !this.locked && c.requestPointerLock) {
        // Erster Klick fängt nur die Maus ein (rohe Bewegung ohne Beschleunigung, falls verfügbar)
        try {
          const r = c.requestPointerLock({ unadjustedMovement: true });
          if (r && r.catch) r.catch(() => { try { c.requestPointerLock(); } catch (e2) { /* */ } });
        } catch (err) { try { c.requestPointerLock(); } catch (e3) { /* */ } }
        return;
      }
      const b = e.button === 0 ? 'fire' : e.button === 2 ? 'aim' : null;
      if (b) { this.mouse.add(b); this.taps.add(b); }
    });
    window.addEventListener('mouseup', (e) => { const b = e.button === 0 ? 'fire' : e.button === 2 ? 'aim' : null; if (b) this.mouse.delete(b); });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      // Browser-Ausreißer (Sprünge beim Einfangen/Fensterwechsel) verwerfen
      if (Math.abs(mx) > 280 || Math.abs(my) > 280) return;
      this._mdx += mx; this._mdy += my;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { if (G.state === 'playing') this.taps.add('weapon'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === c; document.body.classList.toggle('mouse-locked', this.locked); });

    // ---------------- Touch
    const opt = { passive: false };
    const layer = document.getElementById('touch');
    this.layer = layer;
    const joyZone = document.getElementById('joy-zone');
    this.joyBase = document.getElementById('joy-base');
    this.joyKnob = document.getElementById('joy-knob');
    const onStart = (e) => {
      this.setTouchMode(true);
      for (const t of e.changedTouches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const btn = el && el.closest('[data-btn]');
        if (btn) {
          const name = btn.dataset.btn;
          this.touchBtns.add(name); this.taps.add(name);
          btn.classList.add('down');
          t.target._btn = name;
          (this._btnTouch || (this._btnTouch = new Map())).set(t.identifier, btn);
          continue;
        }
        const inJoy = t.clientX < window.innerWidth * 0.42 && t.clientY > window.innerHeight * 0.3;
        if (inJoy && this.joy.id === null) {
          this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY; this.joy.x = 0; this.joy.y = 0;
          this.joyBase.style.left = t.clientX + 'px'; this.joyBase.style.top = t.clientY + 'px';
          this.joyBase.classList.add('active');
          this.joyKnob.style.transform = 'translate(-50%,-50%)';
        } else if (this.lookTouch === null) {
          this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
      if (G.state === 'playing') e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          const R = 62;
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const L = Math.hypot(dx, dy);
          if (L > R) {
            // Basis zieht nach
            this.joy.ox += dx / L * (L - R); this.joy.oy += dy / L * (L - R);
            this.joyBase.style.left = this.joy.ox + 'px'; this.joyBase.style.top = this.joy.oy + 'px';
            dx = dx / L * R; dy = dy / L * R;
          }
          this.joy.x = dx / R; this.joy.y = -dy / R;
          this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this._tdx += (t.clientX - this.lookTouch.x) * 1.25;
          this._tdy += (t.clientY - this.lookTouch.y) * 1.25;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
        } else if (this._btnTouch && this._btnTouch.has(t.identifier)) {
          // Finger rutscht von Feuer-Taste: Kamera mitdrehen
          const b = this._btnTouch.get(t.identifier);
          if (b.dataset.btn === 'fire') {
            if (b._lx != null) { this._tdx += (t.clientX - b._lx) * 1.0; this._tdy += (t.clientY - b._ly) * 1.0; }
            b._lx = t.clientX; b._ly = t.clientY;
          }
        }
      }
      if (G.state === 'playing') e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
          this.joyBase.classList.remove('active');
          this.joyKnob.style.transform = 'translate(-50%,-50%)';
        }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
        if (this._btnTouch && this._btnTouch.has(t.identifier)) {
          const b = this._btnTouch.get(t.identifier);
          b.classList.remove('down'); b._lx = null;
          this.touchBtns.delete(b.dataset.btn);
          this._btnTouch.delete(t.identifier);
        }
      }
    };
    layer.addEventListener('touchstart', onStart, opt);
    layer.addEventListener('touchmove', onMove, opt);
    layer.addEventListener('touchend', onEnd, opt);
    layer.addEventListener('touchcancel', onEnd, opt);
    // Pinch-Zoom & Doppeltipp verhindern
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (G.state === 'playing' && e.touches.length > 1) e.preventDefault(); }, opt);
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => { const now = Date.now(); if (now - lastTouchEnd < 300 && G.state === 'playing') e.preventDefault(); lastTouchEnd = now; }, opt);
  }

  setTouchMode(on) {
    if (G.isTouch === on) return;
    G.isTouch = on;
    document.body.classList.toggle('touch', on);
    if (on && document.pointerLockElement) document.exitPointerLock();
  }

  held(n) { return this.cur.has(n); }
  // nach dem ersten Teilschritt: Tastendrücke & Mausbewegung nicht doppelt auswerten
  consumeFrame() { this.prev = new Set(this.cur); this.tapsFrame = new Set(); this.lookDX = 0; this.lookDY = 0; }
  pressed(n) { return this.cur.has(n) && !this.prev.has(n) || this.tapsFrame.has(n); }

  update() {
    this.prev = this.cur;
    const cur = new Set();
    for (const k of this.keys) cur.add(k);
    if (this.keys.has('jump')) cur.add('handbrake');
    for (const k of this.mouse) cur.add(k);
    for (const k of this.touchBtns) cur.add(k);
    // Gamepad
    this.pad.clear();
    let gx = 0, gy = 0, lx = 0, ly = 0; this.gas = 0; this.brake = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      gx = dz(p.axes[0]); gy = -dz(p.axes[1]); lx = dz(p.axes[2] || 0); ly = dz(p.axes[3] || 0);
      const B = (i) => p.buttons[i] && p.buttons[i].pressed;
      const V = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      if (B(0)) { cur.add('jump'); cur.add('handbrake'); }
      if (B(1)) cur.add('horn');
      if (B(2)) cur.add('weapon');
      if (B(3)) cur.add('enter');
      if (B(4)) cur.add('radio');
      if (B(5)) cur.add('camera');
      if (B(10)) cur.add('sprint');
      if (B(8)) cur.add('map');
      if (B(9)) cur.add('pause');
      const rt = V(7), lt = V(6);
      if (G.player && G.player.inCar) { this.gas = rt; this.brake = lt; if (B(2)) cur.add('fire'); }
      else { if (rt > 0.4) cur.add('fire'); if (lt > 0.4) cur.add('aim'); }
      if (gx || gy || lx || ly || rt || lt) this.setTouchMode(false);
      break;
    }
    this.tapsFrame = this.taps;
    this.taps = new Set();
    for (const t of this.tapsFrame) cur.add(t);
    this.cur = cur;
    // Bewegung
    let mx = 0, my = 0;
    if (this.keys.has('left')) mx -= 1;
    if (this.keys.has('right')) mx += 1;
    if (this.keys.has('up')) my += 1;
    if (this.keys.has('down')) my -= 1;
    if (this.joy.id !== null) { mx = this.joy.x; my = this.joy.y; }
    if (gx || gy) { mx = gx; my = gy; }
    const L = Math.hypot(mx, my);
    if (L > 1) { mx /= L; my /= L; }
    this.moveX = clamp(mx, -1, 1); this.moveY = clamp(my, -1, 1);
    // Blick
    this.lookDX = this._mdx + this._tdx + lx * 14;
    this.lookDY = this._mdy + this._tdy + ly * 10;
    this._mdx = this._mdy = this._tdx = this._tdy = 0;
  }
}
