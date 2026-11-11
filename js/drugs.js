// Rauschzustände (Joint, Party-Pillen): Bildverzerrung, Farben, Kamera, Ton und Bewegung
import { G } from './state.js';
import { clamp, pick } from './utils.js';

const THOUGHTS = {
  joint: ['Wie viele Sterne es wohl gibt …', 'Ich hab so Hunger auf Donuts.', 'Haben Wolken eigentlich Gefühle?', 'Alles ist so … weich.', 'Warum heißt es eigentlich Ampel?', 'Chill, Leo. Chill.'],
  pills: ['BASS!', 'Ich könnte die ganze Nacht laufen!', 'Die Farben! Die FARBEN!', 'Alles leuchtet!', 'Ich liebe euch alle!', 'Schneller, schneller!'],
};

export const Trip = {
  kind: null, t: 0, dur: 0, k: 0,
  fov: 0, roll: 0, time: 1, walk: 1,
  thoughtT: 0, cssT: 0, cssOn: false,
  start(kind, dur) {
    if (this.kind && this.kind !== kind) { this.t = 0; this.dur = 0; }
    const left = this.kind ? Math.max(0, this.dur - this.t) : 0;
    this.kind = kind; this.t = Math.min(this.t, 3); this.dur = Math.min(150, this.t + left + dur);
    this.thoughtT = 6;
    G.hud.toast(kind === 'joint' ? '🌿 Die Welt wird langsamer und weicher …' : '💊 Die Pille wirkt – alles pulsiert!');
  },
  stop() { this.kind = null; this.t = this.dur = this.k = 0; this.apply(0); },
  update(dt) {
    if (!this.kind) { if (this.cssOn) this.apply(0); return; }
    if (G.player && (G.player.state === 'dead' || G.player.state === 'busted')) { this.stop(); return; }
    this.t += dt;
    if (this.t >= this.dur) { this.stop(); G.hud.toast('Die Wirkung lässt nach.'); return; }
    this.k = clamp(this.t / 4, 0, 1) * clamp((this.dur - this.t) / 10, 0, 1);
    const k = this.k, T = G.time, pills = this.kind === 'pills';
    if (pills) {
      const beat = Math.pow(Math.max(0, Math.sin(T * Math.PI * 2.13)), 8);
      this.fov = k * (4 + beat * 7);
      this.roll = k * Math.sin(T * 1.1) * 0.05;
      this.time = 1; this.walk = 1;
    } else {
      this.fov = k * (6 + Math.sin(T * 0.5) * 4);
      this.roll = k * Math.sin(T * 0.37) * 0.07;
      this.time = 1 - 0.18 * k; this.walk = 1 - 0.15 * k;
      if (G.player && G.player.health < 100) G.player.health = Math.min(100, G.player.health + dt * 0.8 * k);
    }
    // Gedanken
    this.thoughtT -= dt;
    if (this.thoughtT <= 0 && k > 0.6 && G.state === 'playing' && !G.missions.active) {
      this.thoughtT = 14 + Math.random() * 10;
      G.hud.subtitle(G.player.name || 'Ich', pick(THOUGHTS[this.kind]), pills ? '#ff6fb0' : '#9fcf6f');
      setTimeout(() => G.hud.subtitle(), 2800);
    }
    this.apply(k);
  },
  apply(k) {
    const pills = this.kind === 'pills';
    // Bild: Nachbearbeitungs-Shader (mittlere/hohe Qualität) …
    const gp = G.gradePass;
    if (gp) {
      const u = gp.uniforms;
      u.trip.value = k; u.tripK.value = pills ? 1 : 0; u.ttime.value = G.time;
      u.sat.value = 1.1 + k * (pills ? 1.0 : 0.75);
      u.vig.value = 0.85 + k * (pills ? 0.6 : 1.6);
    } else {
      // … sonst CSS-Filter auf dem Canvas (niedrige Qualität)
      this.cssT -= G.dt || 0.016;
      if (this.cssT <= 0 || k === 0) {
        this.cssT = 0.12;
        const cv = G.renderer && G.renderer.domElement;
        if (cv) {
          if (k < 0.01) { if (this.cssOn) { cv.style.filter = ''; this.cssOn = false; } }
          else {
            cv.style.filter = pills
              ? `hue-rotate(${Math.round((G.time * 70) % 360 * k)}deg) saturate(${(1 + 1.3 * k).toFixed(2)}) contrast(${(1 + 0.12 * k).toFixed(2)})`
              : `saturate(${(1 + 0.6 * k).toFixed(2)}) sepia(${(0.3 * k).toFixed(2)}) brightness(${(1 + 0.06 * k).toFixed(2)})`;
            this.cssOn = true;
          }
        }
      }
    }
    // Ton: Joint dumpf, Pillen mit Extra-Bass
    const A = G.audio;
    if (A && A.fxLP && A.ctx) {
      const t = A.ctx.currentTime;
      A.fxLP.frequency.setTargetAtTime(this.kind === 'joint' ? 22000 - k * 20600 : 22000, t, 0.3);
      A.fxBass.gain.setTargetAtTime(pills ? k * 9 : 0, t, 0.3);
    }
    if (k === 0) { this.fov = 0; this.roll = 0; this.time = 1; this.walk = 1; }
  },
};

// Erweiterung für den Farb-Shader in main.js
export const TRIP_GLSL = {
  uniforms: 'uniform float trip; uniform float tripK; uniform float ttime;',
  sample: `
      vec2 uv = vUv;
      vec3 c;
      if (trip > 0.001) {
        float amp = trip * mix(0.0075, 0.009, tripK);
        uv += vec2(sin(uv.y * 11.0 + ttime * 1.7), cos(uv.x * 9.0 + ttime * 1.3)) * amp;
        vec2 dir = uv - 0.5;
        float ca = trip * mix(0.007, 0.012, tripK);
        c = vec3(texture2D(tDiffuse, uv + dir * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * ca).b);
        if (tripK < 0.5) {
          vec2 o2 = vec2(0.012 + 0.004 * sin(ttime * 0.7), 0.0);
          vec3 bl = (texture2D(tDiffuse, uv + o2).rgb + texture2D(tDiffuse, uv - o2).rgb + texture2D(tDiffuse, uv + vec2(0.0, 0.014)).rgb + texture2D(tDiffuse, uv - vec2(0.0, 0.014)).rgb) * 0.25;
          c = mix(c, max(c, bl) * 1.08, trip * 0.85);
          c = mix(c, (c + texture2D(tDiffuse, uv + vec2(0.018 * sin(ttime * 0.5), 0.0)).rgb) * 0.5, trip * 0.35);
        }
      } else c = texture2D(tDiffuse, uv).rgb;`,
  post: `
      if (trip > 0.001) {
        if (tripK > 0.5) {
          float a = ttime * 1.4 + length(vUv - 0.5) * 6.0;
          float cs = cos(a), sn = sin(a);
          mat3 toY = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
          mat3 toR = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
          vec3 yiq = toY * c; yiq.yz = mat2(cs, sn, -sn, cs) * yiq.yz;
          c = mix(c, toR * yiq, trip * 0.75);
          float beat = pow(max(0.0, sin(ttime * 13.38)), 8.0);
          c += vec3(0.25, 0.05, 0.3) * beat * trip * smoothstep(0.2, 0.75, length(vUv - 0.5));
        } else {
          c = mix(c, c * vec3(1.1, 1.08, 0.78) + vec3(0.03, 0.05, 0.0), trip);
        }
      }`,
};
