// Interaktionspunkte in der Welt (Riesenrad, Bootsstege, Werkstatt …) und die Riesenradfahrt
import { G } from './state.js';
import * as C from './config.js';
import { Marker } from './missions.js';
import { dist2 } from './utils.js';

export class Attractions {
  constructor() {
    this.spots = [];
    this.ride = null;
  }
  // Punkt registrieren: { x, z, y?, r, color, label, hint, onEnter, show? }
  add(spot) { spot.mk = null; spot.latch = false; this.spots.push(spot); return spot; }

  update(dt) {
    const P = G.player;
    if (this.ride) { this.updateRide(dt); return; }
    const storyBusy = G.missions.active && !G.missions.active.side;
    for (const s of this.spots) {
      const d2 = dist2(P.x, P.z, s.x, s.z);
      const vis = !G.interior && d2 < 140 * 140 && (!s.show || s.show());
      if (vis && !s.mk) s.mk = new Marker(s.x, s.z, s.color, { label: s.label, r: s.r || 1.2, h: 2.2, y: s.y });
      if (!vis && s.mk) { s.mk.remove(); s.mk = null; }
      if (!s.mk) continue;
      s.mk.update(dt);
      s.mk.group.visible = !storyBusy || s.always;
      const onFoot = P.state === 'foot', inCar = P.inCar;
      const ok = s.anyMode ? onFoot || inCar : s.car ? inCar : onFoot;
      const inside = ok && d2 < (s.r || 1.2) ** 2 * 1.6 && Math.abs((P.inCar ? P.vehicle.y : P.y) - s.mk.y) < 3;
      if (inside && !s.latch && G.state === 'playing' && (!storyBusy || s.always)) { s.latch = true; s.onEnter(s); if (s.mk) s.mk.group.visible = false; }
      if (!inside) s.latch = false;
    }
  }

  // -------------------------------------------------------- Riesenrad
  wheelSeat(k) {
    const W = G.world, g = W.wheelGroup, a = (k / 16) * Math.PI * 2 + W.wheel.rotation.x;
    return { x: g.position.x, y: g.position.y + Math.cos(a) * W.wheelR - 3.0, z: g.position.z + Math.sin(a) * W.wheelR, a };
  }
  startRide() {
    const W = G.world, P = G.player;
    // Gondel, die gerade am tiefsten Punkt ist
    let best = 0, bd = 9;
    for (let k = 0; k < 16; k++) {
      let a = ((k / 16) * Math.PI * 2 + W.wheel.rotation.x) % (Math.PI * 2);
      const d = Math.abs(a - Math.PI);
      if (d < bd) { bd = d; best = k; }
    }
    this.ride = { k: best, t: 0, start: W.wheel.rotation.x };
    W.wheelBoost = 1;
    P.state = 'ride'; P.visible = true; P.yaw = Math.PI / 2; P.vx = P.vz = P.vy = 0;
    G.hud.fadeIn();
    G.hud.hint('🎡 Genieß die Aussicht!<br><b>Aussteigen</b> (F / Einsteigen-Taste) geht nur unten.', 6);
    G.cam.pitch = 0.05;
  }
  updateRide(dt) {
    const P = G.player, R = this.ride, W = G.world;
    R.t += dt;
    const s = this.wheelSeat(R.k);
    P.x = s.x; P.y = s.y; P.z = s.z; P.gy = s.y;
    const turned = W.wheel.rotation.x - R.start;
    let a = s.a % (Math.PI * 2); if (a < 0) a += Math.PI * 2;
    const bottom = Math.abs(a - Math.PI) < 0.25;
    if (P.state !== 'ride') { this.ride = null; W.wheelBoost = 0; return; }
    if ((G.input.pressed('enter') && bottom && R.t > 3) || (turned > Math.PI * 2 - 0.05 && bottom)) this.endRide();
    else if (G.input.pressed('enter') && !bottom) G.hud.toast('Aussteigen geht nur, wenn die Gondel unten ist.');
  }
  endRide() {
    const P = G.player, g = G.world.wheelGroup;
    this.ride = null; G.world.wheelBoost = 0;
    G.hud.fadeIn();
    P.state = 'foot'; P.visible = true;
    P.x = g.position.x + 6; P.z = g.position.z + 2; P.y = P.gy = G.world.groundHeight(P.x, P.z);
    G.cam.snap();
    G.hud.toast('🎡 Danke für die Fahrt!');
  }
}

export function setupAttractions(A) {
  const W = G.world;
  if (W.wheelGroup) {
    const g = W.wheelGroup.position;
    A.add({ x: g.x + 6, z: g.z + 6, color: 0xff4d6d, label: '🎡', r: 1.3, onEnter: () => G.ui.store({
      title: 'SUNSET WHEEL', subtitle: 'Riesenrad · Sunset Pier', accent: '#ff4d6d', logo: '🎡',
      categories: [{ name: 'Tickets', icon: '🎟️', items: [
        { id: 'wheel', name: 'Eine Runde', icon: '🎡', price: 25, desc: 'Eine ganze Umdrehung (ca. 1 Minute) mit Blick über Port Solera und das Meer.' },
        { id: 'wheelvip', name: 'Runde bei Nacht-Show', icon: '✨', price: 60, desc: 'Wie oben – die Uhr springt auf 21:30 Uhr, damit du die Lichter der Stadt siehst.' },
      ] }],
      buyLabel: 'Einsteigen',
      onBuy: (i) => {
        if (G.player.money < i.price) return false;
        G.player.addMoney(-i.price); G.audio.cash();
        if (i.id === 'wheelvip') G.timeOfDay = 21.5;
        setTimeout(() => { G.ui.close(); A.startRide(); }, 250);
        return true;
      },
    }) });
  }
  void C;
}
