// Komplett synthetisierter Sound (WebAudio) – Effekte & prozedurale Radiosender
import { G } from './state.js';
import { clamp, rand, pick, lerp } from './utils.js';
import { PulseRadio } from './pulse.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const STATIONS = [
  { name: 'NEON 88.3', genre: 'Synthwave', bpm: 104, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], style: 'synth' },
  { name: 'BAY BEATS 97.1', genre: 'Lo-Fi Hip-Hop', bpm: 84, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], prog: [[0, 3, 7, 10], [5, 9, 12, 15], [-2, 2, 5, 9], [-5, -2, 2, 5]], style: 'lofi' },
  { name: 'TROPICAL 104.5', genre: 'Latin Dance', bpm: 96, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], style: 'latin' },
  { name: 'PULSE 132', genre: 'Techno', bpm: 132, root: 45, scale: [0, 3, 5, 7, 10], prog: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [-4, 0, 3]], style: 'techno' },
  { name: 'MEIN RADIO', genre: 'Deine eigene Musik', style: 'user' },
  { name: 'RADIO AUS', style: 'off' },
];

export class AudioSys {
  constructor() { this.ctx = null; this.ready = false; this.station = 0; this.sirenV = 0; this.heliV = 0; }

  init() {
    if (this.ctx) { this.resume(); return; }
    // iPad/iPhone: Ton auch bei aktivem Lautlos-Schalter (Wiedergabe wie Musik-App)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* */ }
    try {
      const sil = document.createElement('audio');
      sil.src = URL.createObjectURL(silentWav()); sil.loop = true; sil.setAttribute('playsinline', ''); sil.volume = 0.01;
      sil.play().catch(() => {});
      this.silentEl = sil;
    } catch (e) { /* */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.duckG = ctx.createGain(); this.music.connect(this.duckG); this.duckG.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.music);
    // Hall für Musik
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.2);
    const rv = ctx.createGain(); rv.gain.value = 0.25;
    this.musicBus.connect(this.reverb); this.reverb.connect(rv); rv.connect(this.music);
    // Rauschpuffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Motor
    this.eng1 = ctx.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 600; this.engF.Q.value = 3;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    const e2g = ctx.createGain(); e2g.gain.value = 0.5;
    this.eng1.connect(this.engF); this.eng2.connect(e2g); e2g.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.sfx);
    this.eng1.start(); this.eng2.start();
    // Reifenquietschen
    this.skid = this.loopNoise('bandpass', 1500, 6);
    // Fahrtwind / Umgebung
    this.wind = this.loopNoise('lowpass', 500, 0.5);
    this.amb = this.loopNoise('lowpass', 280, 0.7);
    this.waves = this.loopNoise('lowpass', 700, 0.3);
    // Sirene
    this.sirenO = ctx.createOscillator(); this.sirenO.type = 'square';
    const sf = ctx.createBiquadFilter(); sf.type = 'lowpass'; sf.frequency.value = 1800;
    this.sirenG = ctx.createGain(); this.sirenG.gain.value = 0;
    this.sirenO.connect(sf); sf.connect(this.sirenG); this.sirenG.connect(this.sfx);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.45;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG); lfoG.connect(this.sirenO.frequency);
    this.sirenO.frequency.value = 820;
    this.sirenO.start(); lfo.start();
    // Hubschrauber
    this.heli = this.loopNoise('lowpass', 220, 1);
    const hl = ctx.createOscillator(); hl.frequency.value = 13;
    const hlg = ctx.createGain(); hlg.gain.value = 0;
    this.heliMod = hlg;
    hl.connect(hlg); hlg.connect(this.heli.g.gain); hl.start();
    // Hupe
    this.hornO1 = ctx.createOscillator(); this.hornO1.type = 'square'; this.hornO1.frequency.value = 392;
    this.hornO2 = ctx.createOscillator(); this.hornO2.type = 'square'; this.hornO2.frequency.value = 494;
    this.hornG = ctx.createGain(); this.hornG.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 2000;
    this.hornO1.connect(hf); this.hornO2.connect(hf); hf.connect(this.hornG); this.hornG.connect(this.sfx);
    this.hornO1.start(); this.hornO2.start();
    this.hornT = 0;
    this.nextBar = 0; this.bar = 0;
    // Eigene Musik (Mein Radio)
    this.tracks = []; this.trackIdx = 0;
    this.userEl = document.createElement('audio');
    this.userEl.setAttribute('playsinline', '');
    this.userEl.addEventListener('ended', () => this.nextTrack());
    this.userGain = ctx.createGain(); this.userGain.gain.value = 0;
    try { ctx.createMediaElementSource(this.userEl).connect(this.userGain); this.userGain.connect(this.music); } catch (e) { /* */ }
    this.pulse = new PulseRadio(this);
    this.loadLibrary();
    this.loadPulse();
    this.applyVolumes();
    this.ready = true;
    this.resume();
  }
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
    if (this.silentEl && this.silentEl.paused) this.silentEl.play().catch(() => {});
    if (this.userEl && this.userEl.paused && this.tracks.length) this.userEl.play().catch(() => {});
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = G.settings.sfxVol;
    this.music.gain.value = G.settings.musicVol * 0.55;
  }
  impulse(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    return b;
  }
  loopNoise(type, freq, q) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start();
    return { s, f, g };
  }
  vol(x, z) {
    if (x === undefined) return 1;
    const c = G.camera.position;
    const d = Math.hypot(x - c.x, z - c.z);
    return clamp(1 / (1 + d / 14), 0, 1) * (d > 180 ? 0 : 1);
  }
  // Einmal-Geräusch aus Rauschen
  noiseHit(dur, type, freq, vol, freqEnd = null, q = 1) {
    if (!this.ready || vol < 0.005) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, rand(0, 1)); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, type = 'sine', vol = 0.2, freqEnd = null, delay = 0, dest = null) {
    // Exponentielle Rampen dürfen nicht auf 0 zielen -> zu leise Töne gar nicht erst spielen
    if (!this.ready || !(vol > 0.002)) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ Effekte
  gun(kind, x, z, player) {
    const v = player ? 1 : this.vol(x, z);
    const big = kind === 'shotgun' ? 1.6 : kind === 'rifle' ? 1.25 : 1;
    this.noiseHit(0.18 * big, 'highpass', 900, 0.55 * v * big);
    this.noiseHit(0.32 * big, 'lowpass', 1200, 0.5 * v * big, 120);
    this.tone(150 * (kind === 'smg' ? 1.3 : 1), 0.12, 'sine', 0.35 * v, 45);
  }
  explosion(x, z) {
    const v = Math.max(0.25, this.vol(x, z));
    this.noiseHit(2.2, 'lowpass', 1600, 1.2 * v, 60);
    this.noiseHit(0.5, 'highpass', 1200, 0.5 * v);
    this.tone(70, 1.2, 'sine', 0.8 * v, 25);
  }
  crash(s, x, z) { const v = this.vol(x, z) * s; this.noiseHit(0.35 + s * 0.3, 'bandpass', 900, 0.9 * v, 200, 0.8); this.tone(90, 0.25, 'triangle', 0.4 * v, 40); }
  thud(s = 0.6, x, z) { const v = this.vol(x, z) * s; this.tone(110, 0.2, 'sine', 0.5 * v, 50); this.noiseHit(0.15, 'lowpass', 500, 0.4 * v); }
  punch(x, z) { this.tone(160, 0.12, 'sine', 0.5, 60); this.noiseHit(0.08, 'bandpass', 1200, 0.4); }
  swing() { this.noiseHit(0.15, 'bandpass', 2400, 0.12, 900, 2); }
  hurt(x, z) { const v = this.vol(x, z); this.tone(300, 0.18, 'sawtooth', 0.06 * v, 180); }
  splash() { this.noiseHit(0.8, 'lowpass', 2500, 0.6, 300); }
  door() { this.tone(180, 0.08, 'square', 0.12, 90); this.noiseHit(0.08, 'lowpass', 900, 0.3); }
  enterCar() { this.radioOn = true; }
  exitCar() { this.radioOn = false; }
  jump() { this.noiseHit(0.1, 'bandpass', 700, 0.08); }
  click() { this.tone(1200, 0.04, 'square', 0.06); }
  pickup() { this.tone(880, 0.1, 'triangle', 0.25); this.tone(1320, 0.18, 'triangle', 0.25, null, 0.08); }
  cash() { for (let i = 0; i < 3; i++) this.tone(1500 + i * 300, 0.08, 'square', 0.08, null, i * 0.05); }
  checkpoint() { this.tone(660, 0.12, 'square', 0.15); this.tone(990, 0.2, 'square', 0.15, null, 0.1); }
  beep() { this.tone(1000, 0.08, 'sine', 0.2); }
  countdown(go) { this.tone(go ? 1320 : 660, go ? 0.5 : 0.25, 'square', 0.2); }
  jingle() { [0, 4, 7, 12, 16].forEach((n, i) => this.tone(NOTE(72 + n), 0.35, 'square', 0.12, null, i * 0.09)); [0, 7, 12].forEach((n) => this.tone(NOTE(48 + n), 0.9, 'triangle', 0.15, null, 0.45)); }
  fail() { [7, 3, 0].forEach((n, i) => this.tone(NOTE(60 + n), 0.4, 'sawtooth', 0.08, null, i * 0.18)); }
  wasted() { this.tone(220, 2.2, 'sawtooth', 0.15, 55); this.noiseHit(2, 'lowpass', 500, 0.3, 80); }
  busted() { [0, 0.4].forEach((d) => { this.tone(880, 0.3, 'square', 0.1, 660, d); }); }
  wantedUp() { this.tone(500, 0.12, 'square', 0.1); this.tone(700, 0.15, 'square', 0.1, null, 0.12); }
  horn(x, z, dur = 0.4, player = false) {
    if (!this.ready) return;
    const v = player ? 0.28 : 0.25 * this.vol(x, z);
    if (v < 0.01) return;
    const t = this.ctx.currentTime;
    this.hornG.gain.cancelScheduledValues(t);
    this.hornG.gain.setTargetAtTime(v, t, 0.01);
    this.hornG.gain.setTargetAtTime(0, t + dur, 0.03);
  }
  setSiren(v) { this.sirenV = v; }
  setHeli(v) { this.heliV = v; }

  // ------------------------------------------------------------ Laufend
  update(dt) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const P = G.player;
    const playing = G.state === 'playing' || G.state === 'cutscene';
    const v = P && P.inCar ? P.vehicle : null;
    if (v && playing) {
      const sp = Math.abs(v.fwdSpeed);
      const gearSpan = v.T.maxSpeed / 5;
      const gear = Math.min(4, Math.floor(sp / gearSpan));
      const rpm = (sp - gear * gearSpan) / gearSpan;
      const base = v.T.maxSpeed > 60 ? 55 : v.T.mass > 2000 ? 32 : 42;
      const f = base + rpm * base * 1.6 + gear * 6 + v.input.throttle * 8;
      this.eng1.frequency.setTargetAtTime(f, t, 0.05);
      this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.engF.frequency.setTargetAtTime(300 + v.input.throttle * 900 + rpm * 500, t, 0.08);
      this.engG.gain.setTargetAtTime(v.alive ? 0.06 + v.input.throttle * 0.08 : 0, t, 0.1);
      const sk = v.grounded && v.alive ? clamp((v.slip - 3) / 6, 0, 1) + (v.input.handbrake && sp > 5 ? 0.6 : 0) + (v.braking && sp > 12 ? 0.3 : 0) : 0;
      this.skid.g.gain.setTargetAtTime(Math.min(0.5, sk * 0.35), t, 0.05);
      this.wind.g.gain.setTargetAtTime(clamp(sp / 60, 0, 1) * 0.25, t, 0.2);
    } else {
      this.engG.gain.setTargetAtTime(0, t, 0.1);
      this.skid.g.gain.setTargetAtTime(0, t, 0.05);
      this.wind.g.gain.setTargetAtTime(0, t, 0.2);
    }
    // Umgebung
    const px = P ? P.x : 0;
    const beach = clamp((px - 340) / 80, 0, 1);
    const ambOn = playing ? 1 : 0.3;
    this.amb.g.gain.setTargetAtTime(0.06 * (1 - beach) * ambOn, t, 0.5);
    this.waves.g.gain.setTargetAtTime((0.05 + 0.05 * Math.sin(t * 0.5)) * beach * ambOn, t, 0.3);
    this.sirenG.gain.setTargetAtTime(playing ? this.sirenV * 0.12 : 0, t, 0.1);
    this.heliMod.gain.setTargetAtTime(playing ? this.heliV * 0.3 : 0, t, 0.2);
    this.heli.g.gain.setTargetAtTime(playing ? this.heliV * 0.25 : 0, t, 0.2);
    // Radio
    const st = STATIONS[this.station];
    const clubMusic = playing && !v && G.interior && G.interior.kind === 'club';
    const wantMusic = (G.state === 'title') || (v && playing && st.style !== 'off') || clubMusic;
    const userOn = !!(v && playing && st.style === 'user' && !clubMusic && this.tracks.length);
    if (this.userGain) this.userGain.gain.setTargetAtTime(userOn ? 1.6 : 0, t, 0.3);
    this.musicBus.gain.setTargetAtTime(wantMusic && !userOn ? (G.state === 'title' ? 0.7 : 1) : 0, t, 0.4);
    if (wantMusic && !userOn) this.schedule();
    else this.nextBar = 0;
  }

  nextStation() {
    this.station = (this.station + 1) % STATIONS.length;
    this.nextBar = 0;
    G.hud.radio(this.stationInfo(this.station));
    if (STATIONS[this.station].style === 'user' && !this.tracks.length) G.hud.toast('Noch keine eigene Musik – im Handy unter Radio hinzufügen.');
    this.noiseHit(0.25, 'bandpass', 2500, 0.15, 800, 1);
    if (STATIONS[this.station].style === 'techno' && this.pulse && this.pulse.cur) setTimeout(() => { const i = this.pulse.cur.info; G.hud.nowPlaying('PULSE 132', i.artist, i.name); }, 1500);
  }

  // ------------------------------------------------- Prozedurale Musik
  schedule() {
    const ctx = this.ctx;
    const club = G.interior && G.interior.kind === 'club' && !(G.player && G.player.inCar);
    const st = G.state === 'title' || club ? STATIONS[club ? (G.interior.station ?? 3) : 0] : STATIONS[this.station];
    if (st.style === 'off' || st.style === 'user') return;
    if (st.style === 'techno') {
      const now = ctx.currentTime;
      if (this.pulseLast && now - this.pulseLast > 3.0) this.pulse.stopAll();
      this.pulseLast = now;
      this.pulse.schedule();
      return;
    }
    const spb = 60 / st.bpm, bar = spb * 4;
    if (this.nextBar < ctx.currentTime) { this.nextBar = ctx.currentTime + 0.1; this.bar = 0; this.motif = null; }
    while (this.nextBar < ctx.currentTime + 0.4) {
      this.playBar(st, this.nextBar, spb, this.bar);
      this.nextBar += bar; this.bar++;
    }
  }
  playBar(st, t0, spb, n) {
    const chord = st.prog[n % st.prog.length];
    const root = st.root;
    const s16 = spb / 4;
    if (!this.motif || n % 8 === 0) {
      this.motif = [];
      for (let i = 0; i < 16; i++) this.motif.push(Math.random() < (st.style === 'lofi' ? 0.3 : 0.45) ? pick(st.scale) + (Math.random() < 0.3 ? 12 : 0) : null);
    }
    const section = Math.floor(n / 8) % 4;
    if (st.style === 'synth') {
      for (let b = 0; b < 4; b++) {
        this.kick(t0 + b * spb, 0.9);
        if (b % 2 === 1) this.snare(t0 + b * spb, 0.5, true);
        this.hat(t0 + b * spb + spb / 2, 0.18);
        if (section > 0) this.hat(t0 + b * spb, 0.08);
      }
      for (let i = 0; i < 8; i++) this.synthBass(NOTE(root - 12 + chord[0]), t0 + i * spb / 2, spb / 2 * 0.9, 0.22);
      this.pad(chord.map((c) => NOTE(root + c)), t0, spb * 4, 0.05);
      if (section !== 1) for (let i = 0; i < 16; i++) { const c = chord[i % chord.length] + (i % 8 >= 4 ? 12 : 0); this.pluck(NOTE(root + 12 + c), t0 + i * s16, s16 * 0.8, 0.05, 'square'); }
      if (section >= 2) this.motif.forEach((m, i) => { if (m !== null && i % 2 === 0) this.lead(NOTE(root + 12 + m), t0 + i * s16, s16 * 1.8, 0.06); });
    } else if (st.style === 'lofi') {
      const sw = s16 * 0.33;
      for (let b = 0; b < 4; b++) {
        if (b === 0 || b === 2) this.kick(t0 + b * spb, 0.8);
        if (b === 2) this.kick(t0 + b * spb + spb * 0.75, 0.5);
        if (b % 2 === 1) this.snare(t0 + b * spb, 0.4, false);
        for (let h = 0; h < 2; h++) this.hat(t0 + b * spb + h * spb / 2 + (h ? sw : 0), 0.08);
      }
      this.keys(chord.map((c) => NOTE(root + 12 + c)), t0, spb * 2, 0.05);
      this.keys(chord.map((c) => NOTE(root + 12 + c)), t0 + spb * 2.5, spb * 1.4, 0.04);
      this.synthBass(NOTE(root - 12 + chord[0]), t0, spb * 1.5, 0.25, 'sine');
      this.synthBass(NOTE(root - 12 + chord[0] + 7), t0 + spb * 2.5, spb, 0.2, 'sine');
      this.motif.forEach((m, i) => { if (m !== null && i % 3 === 0) this.pluck(NOTE(root + 24 + m), t0 + i * s16, s16 * 2, 0.035, 'triangle'); });
      this.noiseHit(spb * 4, 'highpass', 4000, 0.008);
    } else if (st.style === 'techno') {
      for (let b = 0; b < 4; b++) {
        this.kick(t0 + b * spb, 1.0);
        this.hat(t0 + b * spb + spb / 2, 0.22, 0.16);
        if (b % 2 === 1 && section > 0) this.snare(t0 + b * spb, 0.45, false, true);
        for (let i = 1; i < 4; i++) this.synthBass(NOTE(root - 12 + chord[0] + (i === 3 ? 12 : 0)), t0 + b * spb + i * s16, s16 * 0.8, 0.18);
      }
      for (let i = 0; i < 16; i++) this.hat(t0 + i * s16, i % 2 ? 0.04 : 0.07);
      const cut = 500 + 1800 * (0.5 + 0.5 * Math.sin(n * 0.4));
      if (section !== 0) this.motif.forEach((m, i) => { if (m !== null) this.acid(NOTE(root + m + (i % 7 === 0 ? 12 : 0)), t0 + i * s16, s16 * 0.9, 0.07, cut); });
      if (section >= 2 && n % 2 === 0) this.keys(chord.map((c) => NOTE(root + 12 + c)), t0, spb * 0.5, 0.04);
    } else if (st.style === 'latin') {
      for (let b = 0; b < 4; b++) this.kick(t0 + b * spb, 0.85);
      [3, 6, 11, 14].forEach((i) => this.snare(t0 + i * s16, 0.35, false, true));
      for (let i = 0; i < 16; i += 2) this.hat(t0 + i * s16, 0.06);
      for (let b = 0; b < 4; b++) this.synthBass(NOTE(root - 12 + chord[0] + (b === 3 ? 7 : 0)), t0 + b * spb, spb * 0.5, 0.24);
      [0, 3, 6, 10, 12].forEach((i) => this.pluck(NOTE(root + 12 + chord[(i / 3 | 0) % chord.length]), t0 + i * s16, s16 * 1.5, 0.05, 'triangle'));
      if (section % 2 === 1) this.motif.forEach((m, i) => { if (m !== null && i % 2 === 0) this.lead(NOTE(root + 12 + m), t0 + i * s16, s16 * 1.5, 0.05); });
    }
  }
  env(g, t, a, d, vol) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + a + d); }
  kick(t, v) { const ctx = this.ctx; const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); this.env(g, t, 0.003, 0.3, 0.7 * v); o.connect(g); g.connect(this.out || this.musicBus); o.start(t); o.stop(t + 0.4); }
  snare(t, v, big, rim = false) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = rim ? 'bandpass' : 'highpass'; f.frequency.value = rim ? 2200 : 1500;
    const g = ctx.createGain(); this.env(g, t, 0.002, big ? 0.25 : rim ? 0.06 : 0.14, v * (rim ? 0.6 : 0.5));
    s.connect(f); f.connect(g); g.connect(this.out || this.musicBus); s.start(t, Math.random()); s.stop(t + 0.35);
    if (!rim) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 190; const og = ctx.createGain(); this.env(og, t, 0.002, 0.1, v * 0.3); o.connect(og); og.connect(this.out || this.musicBus); o.start(t); o.stop(t + 0.15); }
  }
  acid(freq, t, dur, v, cut) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 13; f.frequency.setValueAtTime(cut * 1.6, t); f.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.25), t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.003, dur, v);
    o.connect(f); f.connect(g); g.connect(this.out || this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  hat(t, v, dec = 0.05) { const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = ctx.createGain(); this.env(g, t, 0.001, dec, v); s.connect(f); f.connect(g); g.connect(this.out || this.musicBus); s.start(t, Math.random()); s.stop(t + 0.08); }
  synthBass(freq, t, dur, v, type = 'sawtooth') {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain(); this.env(g, t, 0.005, dur, v);
    o.connect(f); f.connect(g); g.connect(this.out || this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  pad(freqs, t, dur, v) {
    const ctx = this.ctx;
    for (const fq of freqs) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq; o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v / freqs.length, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.out || this.musicBus); o.start(t); o.stop(t + dur + 0.05);
    }
  }
  keys(freqs, t, dur, v) {
    const ctx = this.ctx;
    for (const fq of freqs) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fq;
      const m = ctx.createOscillator(); m.frequency.value = fq * 2; const mg = ctx.createGain(); mg.gain.value = fq * 0.4; m.connect(mg); mg.connect(o.frequency);
      const g = ctx.createGain(); this.env(g, t, 0.01, dur, v);
      o.connect(g); g.connect(this.out || this.musicBus); o.start(t); m.start(t); o.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
    }
  }
  pluck(freq, t, dur, v, type) { const ctx = this.ctx; const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(400, t + dur); const g = ctx.createGain(); this.env(g, t, 0.003, dur, v); o.connect(f); f.connect(g); g.connect(this.out || this.musicBus); o.start(t); o.stop(t + dur + 0.05); }
  lead(freq, t, dur, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 4; vib.connect(vg); vg.connect(o.detune);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
    const g = ctx.createGain(); this.env(g, t, 0.02, dur, v);
    o.connect(f); f.connect(g); g.connect(this.out || this.musicBus); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  // Musik absenken (für Moderation)
  duck(level, time) { const t = this.ctx.currentTime; this.duckG.gain.cancelScheduledValues(t); this.duckG.gain.setTargetAtTime(level, t, time / 3); }
  // Radio-Jingle: Whoosh + Akkord
  sweeper() {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + 0.7);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.5); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 1.1);
    [57, 64, 69, 76].forEach((n, i) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 440 * Math.pow(2, (n - 69) / 12); const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t + 0.6 + i * 0.06); og.gain.linearRampToValueAtTime(0.06, t + 0.65 + i * 0.06); og.gain.exponentialRampToValueAtTime(0.001, t + 1.6); o.connect(og); og.connect(this.master); o.start(t + 0.6 + i * 0.06); o.stop(t + 1.7); });
  }
  // PULSE 132: eigene Songs & Einspieler (IndexedDB, nur auf diesem Gerät)
  async loadPulse() {
    try { const [songs, ids] = await Promise.all([dbAll('pulse'), dbAll('idents')]); await this.pulse.load(songs, ids); this.pulseCounts = { songs: songs.length, idents: ids.length }; } catch (e) { this.pulseCounts = { songs: 0, idents: 0 }; }
  }
  async addPulseFiles(files, store) {
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('audio') && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name)) continue;
      try { await dbPut({ id: Date.now() + '_' + Math.random().toString(36).slice(2), name: f.name.replace(/\.[^.]+$/, ''), blob: f }, store); n++; } catch (e) { /* */ }
    }
    await this.loadPulse();
    return n;
  }
  async clearPulse(store) { try { await dbClear(store); } catch (e) { /* */ } await this.loadPulse(); }

  // ------------------------------------------------- Eigene Musik
  stationInfo(i) {
    const st = STATIONS[i];
    if (st.style === 'user') return { ...st, genre: this.tracks && this.tracks.length ? `${this.tracks.length} eigene Songs` : 'Keine Songs – im Handy hinzufügen' };
    return st;
  }
  async addFiles(files) {
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('audio') && !/\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name)) continue;
      try { await dbPut({ id: Date.now() + '_' + Math.random().toString(36).slice(2), name: f.name.replace(/\.[^.]+$/, ''), blob: f }); n++; } catch (e) { this.tracks.push({ name: f.name, url: URL.createObjectURL(f) }); n++; }
    }
    await this.loadLibrary();
    return n;
  }
  async loadLibrary() {
    try {
      const list = await dbAll();
      for (const t of this.tracks) if (t.url && t.fromDb) URL.revokeObjectURL(t.url);
      this.tracks = list.map((t) => ({ name: t.name, url: URL.createObjectURL(t.blob), fromDb: true }));
    } catch (e) { /* IndexedDB nicht verfügbar */ }
    for (let i = this.tracks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]]; }
    this.trackIdx = 0;
    if (this.tracks.length && this.userEl) { this.userEl.src = this.tracks[0].url; this.userEl.play().catch(() => {}); }
  }
  async clearLibrary() {
    try { await dbClear(); } catch (e) { /* */ }
    if (this.userEl) { this.userEl.pause(); this.userEl.removeAttribute('src'); }
    this.tracks = [];
  }
  nextTrack() {
    if (!this.tracks.length) return;
    this.trackIdx = (this.trackIdx + 1) % this.tracks.length;
    this.userEl.src = this.tracks[this.trackIdx].url;
    this.userEl.play().catch(() => {});
    if (G.player && G.player.inCar && STATIONS[this.station].style === 'user') G.hud.nowPlaying('MEIN RADIO', 'Eigene Musik', this.tracks[this.trackIdx].name);
  }
  currentTrack() { return this.tracks.length ? this.tracks[this.trackIdx].name : null; }
}

// Stille WAV-Datei (hält die iOS-Audiositzung im Wiedergabe-Modus)
function silentWav() {
  const sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); d.setUint16(22, 1, true); d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true);
  d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
  return new Blob([buf], { type: 'audio/wav' });
}

// IndexedDB für eigene Songs (tracks = Mein Radio, pulse = PULSE-Songs, idents = Einspieler)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('neoncoast_music', 2);
    r.onupgradeneeded = () => { const d = r.result; for (const n of ['tracks', 'pulse', 'idents']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbPut(rec, store = 'tracks') { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
async function dbAll(store = 'tracks') { const d = await db(); return new Promise((res, rej) => { const r = d.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }); }
async function dbClear(store = 'tracks') { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).clear(); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
