// Waffenrad: Tab gedrückt halten (PC) oder Waffensymbol antippen (iPad).
// Während das Rad offen ist, läuft das Spiel in Zeitlupe.
import { G } from './state.js';
import { WEAPONS, WEAPON_ORDER } from './combat.js';

const $ = (id) => document.getElementById(id);

export class WeaponWheel {
  constructor(icons) {
    this.icons = icons;
    this.open = false; this.byKey = false;
    this.sel = null; this.ax = 0; this.ay = 0;
    const el = document.createElement('div');
    el.id = 'wwheel';
    const n = WEAPON_ORDER.length;
    let html = '<div class="ww-ring">';
    WEAPON_ORDER.forEach((w, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 34, y = 50 + Math.sin(a) * 34;
      html += `<button class="ww-seg" data-w="${w}" style="left:${x}%;top:${y}%"><span class="ww-ic">${icons[WEAPONS[w].icon]}</span><small class="ww-am"></small></button>`;
    });
    html += '<div class="ww-hl"></div><div class="ww-center"><b class="ww-name"></b><span class="ww-ammo"></span><small class="ww-hint"></small></div></div>';
    el.innerHTML = html;
    document.body.appendChild(el);
    this.el = el;
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.ww-seg');
      if (b) { this.sel = b.dataset.w; this.render(); this.close(true); }
      else if (!e.target.closest('.ww-center')) this.close(false);
      e.preventDefault(); e.stopPropagation();
    });
  }
  owned(w) { return w === 'fists' || G.player.ammo[w] > 0; }
  show(byKey) {
    if (this.open || G.state !== 'playing') return;
    this.open = true; this.byKey = byKey;
    this.sel = G.player.weapon; this.ax = 0; this.ay = 0;
    G.slowmo = 0.22;
    this.el.classList.add('on');
    this.el.querySelector('.ww-hint').textContent = byKey ? 'Maus bewegen · Tab loslassen' : 'Waffe antippen';
    this.render();
    if (G.audio.ready) G.audio.click();
  }
  close(apply) {
    if (!this.open) return;
    this.open = false;
    G.slowmo = 1;
    this.el.classList.remove('on');
    const P = G.player;
    if (apply && this.sel && this.owned(this.sel) && this.sel !== P.weapon) { P.weapon = this.sel; G.hud.weapon(); if (G.audio.ready) G.audio.click(); }
  }
  render() {
    const P = G.player;
    this.el.querySelectorAll('.ww-seg').forEach((b) => {
      const w = b.dataset.w, own = this.owned(w);
      b.classList.toggle('lock', !own);
      b.classList.toggle('on', w === this.sel);
      b.querySelector('.ww-am').textContent = WEAPONS[w].melee ? '' : own ? P.ammo[w] : '';
    });
    const W = WEAPONS[this.sel] || WEAPONS.fists;
    this.el.querySelector('.ww-name').textContent = W.name.toUpperCase();
    this.el.querySelector('.ww-ammo').textContent = W.melee ? 'Nahkampf' : this.owned(this.sel) ? `${P.ammo[this.sel]} Schuss` : 'Nicht im Besitz';
    const i = WEAPON_ORDER.indexOf(this.sel), n = WEAPON_ORDER.length;
    this.el.querySelector('.ww-hl').style.transform = `rotate(${(i / n) * 360}deg)`;
  }
  // vor Kamera & Spieler aufrufen
  update(I) {
    if (G.state !== 'playing') { if (this.open) this.close(false); return; }
    const P = G.player;
    if (I.pressed('wheel') && P.state !== 'dead') this.show(true);
    if (!this.open) return;
    if (this.byKey) {
      this.ax += I.lookDX; this.ay += I.lookDY;
      const L = Math.hypot(this.ax, this.ay);
      if (L > 0.04) {
        const n = WEAPON_ORDER.length;
        let a = Math.atan2(this.ay, this.ax) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
        const w = WEAPON_ORDER[Math.round(a / (Math.PI * 2 / n)) % n];
        if (w !== this.sel) { this.sel = w; this.render(); }
        if (L > 0.12) { this.ax *= 0.12 / L; this.ay *= 0.12 / L; }
      }
      if (!I.held('wheel')) this.close(true);
    }
    I.lookDX = 0; I.lookDY = 0;
  }
}
