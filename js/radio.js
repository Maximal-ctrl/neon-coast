// Radio-Engine (4.24): spielt echte Songs der Sender aus js/radio-stations.js.
// – „Live“-Gefühl: jeder Sender läuft im Hintergrund weiter (Zeitleiste pro Sender)
// – weiche Überblendung zwischen Songs
// – Zwischeneinsprecher (Jingles): Musik wird abgesenkt, der Einsprecher liegt über dem Songanfang
import { G } from './state.js';
import { RADIO } from './radio-stations.js';

const FADE = 2.6, GUESS = 180; // Sekunden Überblendung, angenommene Songlänge bis zur echten Länge
const IDENT_FADE = 5, IDENT_LEAD = 2.6; // Ausblendung vor dem Einsprecher, Einsatz des Einsprechers

// winzige stille WAV-Datei – zum Freischalten der Audio-Elemente beim ersten Antippen (iPad/iPhone/Safari)
const SILENT = (() => { const n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  try { return URL.createObjectURL(new Blob([b], { type: 'audio/wav' })); } catch (e) { return ''; } })();

export class RadioPlayer {
  constructor(audio) {
    this.A = audio; this.ctx = audio.ctx;
    this.out = this.ctx.createGain(); this.out.gain.value = 1; this.out.connect(audio.musicBus);
    this.decks = [this.deck(), this.deck()]; this.cur = 0;
    this.identEl = new Audio(); this.identEl.preload = 'auto';
    this.identG = this.ctx.createGain(); this.identG.gain.value = 1; this.tok = 0;
    try { this.ctx.createMediaElementSource(this.identEl).connect(this.identG); } catch (e) { /* */ }
    this.identG.connect(audio.musicBus);
    this.state = RADIO.map((st) => ({ cur: Math.floor(Math.random() * Math.max(1, st.tracks.length)), lastIdent: -1, offset: Math.random() * 0.6, left: null, n: 0 }));
    this.dur = new Map(); this.active = -1; this.playing = false; this.duck = 1; this.retryT = 0;
    // Browser (v. a. Safari/iPad) erlauben Musik erst nach einer Berührung: bei jeder Eingabe freischalten / fortsetzen
    const kick = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) window.addEventListener(ev, kick, { capture: true, passive: true });
    this.unlock(); // init läuft meist selbst in einer Geste (erstes Antippen)
  }
  deck() {
    const el = new Audio(); el.preload = 'auto'; el.setAttribute('playsinline', ''); el.playsInline = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    try { this.ctx.createMediaElementSource(el).connect(g); } catch (e) { /* */ }
    g.connect(this.out);
    el.addEventListener('loadedmetadata', () => { if (isFinite(el.duration)) this.dur.set(el.dataset.url, el.duration); });
    return { el, g, want: false };
  }
  // in einer Nutzer-Geste aufrufen: jedes Element einmal abspielen, damit es später ohne Geste spielen darf
  unlock() {
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const all = [...this.decks.map((D) => [D.el, D.want]), [this.identEl, this.inIdent]];
    for (const [el, want] of all) {
      if (want) { if (el.paused && !el.ended) this.play(el); continue; }
      if (el._ok || !SILENT) continue;
      const own = !el.getAttribute('src') || el.src === SILENT;
      if (el === this.identEl && !own) continue; // Einsprecher nie hörbar „anspielen“
      if (own) el.src = SILENT;
      const p = el.play();
      if (p && p.then) p.then(() => { el._ok = true; if (!this.decks.some((D) => D.el === el && D.want) && !(el === this.identEl && this.inIdent)) el.pause(); }).catch(() => {});
    }
  }
  play(el) {
    const p = el.play();
    if (p && p.then) p.then(() => { el._ok = true; this.blocked = false; }).catch((e) => { if (e && e.name === 'NotAllowedError') { if (!this.blocked && G.hud && G.state === 'playing') G.hud.toast('🔈 Tippe kurz auf den Bildschirm, damit das Radio spielt.'); this.blocked = true; } });
  }
  url(st, t) { return `assets/radio/${st.key}/songs/${t.file}`; }
  track(si) { const st = RADIO[si], S = this.state[si]; if (!st || !st.tracks.length) return null; return st.tracks[S.cur % st.tracks.length]; }
  // Zufallsauswahl, aber nie zweimal dasselbe direkt hintereinander
  pick(n, last) { if (n <= 1) return 0; if (last < 0 || last >= n) return Math.floor(Math.random() * n); let i = Math.floor(Math.random() * (n - 1)); if (i >= last) i++; return i; }
  // Rauschen für Sender ohne Signal
  setStatic(on) {
    if (!this.stat && on && this.A.noiseBuf) { this.stat = this.A.loopNoise('bandpass', 1800, 0.6); this.stat.g.disconnect(); this.stat.g.connect(this.A.musicBus); }
    if (!this.stat) return;
    const c = this.ctx.currentTime; this.stat.g.gain.setTargetAtTime(on ? 0.05 + Math.random() * 0.015 : 0, c, on ? 0.25 : 0.15);
  }
  hasMusic(si) { return !!(RADIO[si] && RADIO[si].tracks.length); }
  // Zeitleiste weiterlaufen lassen, während der Sender nicht gehört wurde
  advance(si) {
    const st = RADIO[si], S = this.state[si]; if (!S.left || !st.tracks.length) return;
    let gone = (performance.now() - S.left) / 1000;
    for (let k = 0; k < 200 && gone > 0; k++) {
      const t = this.track(si), d = this.dur.get(this.url(st, t)) || GUESS, rest = d * (1 - S.offset);
      if (gone < rest) { S.offset += gone / d; gone = 0; } else { gone -= rest; S.cur = this.pick(st.tracks.length, S.cur); S.offset = 0; }
    }
    S.left = null;
  }
  // Sender einschalten / wechseln
  tune(si) {
    if (si === this.active && this.playing) return;
    this.stopDecks(0.4); this.stopIdent();
    if (this.active >= 0 && this.state[this.active]) this.state[this.active].left = performance.now();
    this.active = si; this.playing = false;
    if (!this.hasMusic(si)) return;
    this.advance(si);
    this.start(si, this.state[si].offset, 0.6);
  }
  start(si, offset, fadeIn) {
    const st = RADIO[si], t = this.track(si); if (!t) return;
    const D = this.decks[this.cur = 1 - this.cur], c = this.ctx.currentTime, u = this.url(st, t);
    D.el.dataset.url = u; D.el.src = u; D.want = true;
    const go = () => { if (D.el.dataset.url !== u) return; const d = this.dur.get(u); if (d && offset) { try { D.el.currentTime = Math.min(d - 8, d * offset); } catch (e) { /* */ } } this.play(D.el); };
    if (this.dur.has(u)) go(); else D.el.addEventListener('loadedmetadata', go, { once: true });
    D.g.gain.cancelScheduledValues(c); D.g.gain.setValueAtTime(D.g.gain.value, c); D.g.gain.linearRampToValueAtTime(t.gain || 1, c + fadeIn);
    this.playing = true; this.changing = false; this.inIdent = false;
    G.hud.radioShow(si, t);
  }
  stopDecks(fade) {
    const c = this.ctx.currentTime;
    for (const D of this.decks) { D.want = false; D.g.gain.cancelScheduledValues(c); D.g.gain.setValueAtTime(D.g.gain.value, c); D.g.gain.linearRampToValueAtTime(0, c + fade); setTimeout(() => { if (!D.want) D.el.pause(); }, fade * 1000 + 80); }
  }
  // Übergang zum nächsten Song. Nach jedem zweiten Song: Song blendet über ~5 s aus,
  // in die Ausblendung hinein spricht der Moderator, danach startet der nächste Song.
  next() {
    const si = this.active, st = RADIO[si], S = this.state[si]; if (!st) return;
    this.changing = true;
    S.done = (S.done || 0) + 1;
    const ident = this.identDue(si);
    const fade = ident ? IDENT_FADE : FADE;
    const old = this.decks[this.cur], c = this.ctx.currentTime;
    old.g.gain.cancelScheduledValues(c); old.g.gain.setValueAtTime(old.g.gain.value, c); old.g.gain.linearRampToValueAtTime(0, c + fade);
    old.want = false; setTimeout(() => { if (!old.want) old.el.pause(); }, fade * 1000 + 100);
    const prev = S.cur;
    let id = null;
    if (ident) { // Einsprecher wählen: nicht derselbe wie zuletzt, und keiner, der den gerade gelaufenen Song erzwingen würde
      const forced = (x) => (x.next ? st.tracks.findIndex((t) => t.file === x.next) : -1);
      let ok = st.idents.map((x, i) => i).filter((i) => i !== S.lastIdent && forced(st.idents[i]) !== prev);
      if (!ok.length) ok = st.idents.map((x, i) => i).filter((i) => forced(st.idents[i]) !== prev);
      if (ok.length) { S.lastIdent = ok[Math.floor(Math.random() * ok.length)]; id = st.idents[S.lastIdent]; }
    }
    const f = id ? (id.next ? st.tracks.findIndex((t) => t.file === id.next) : -1) : -1;
    S.cur = f >= 0 ? f : this.pick(st.tracks.length, prev); S.offset = 0; S.n++;
    if (!id) { this.start(si, 0, ident ? IDENT_FADE * 0.6 : FADE); return; }
    const tok = ++this.tok;
    this.inIdent = true;
    setTimeout(() => { // Einsprecher setzt in der zweiten Hälfte der Ausblendung ein
      if (tok !== this.tok || !this.playing) return;
      this.identG.gain.setValueAtTime(id.gain || 1, this.ctx.currentTime);
      this.identEl.src = `assets/radio/${st.key}/idents/${id.file}`;
      const p = this.identEl.play(); if (p && p.catch) p.catch(() => { if (tok === this.tok) { this.inIdent = false; this.start(si, 0, 1); } });
    }, IDENT_LEAD * 1000);
    this.identEl.onended = () => { if (tok !== this.tok || !this.playing) return; this.inIdent = false; this.start(si, 0, 0.8); };
  }
  // kommt beim nächsten Wechsel ein Einsprecher? (nach jedem zweiten Song)
  identDue(si) { const st = RADIO[si], S = this.state[si]; return !!(st.idents.length && S.done && S.done % 2 === 0); }
  stopIdent() { this.tok++; this.inIdent = false; this.identEl.pause(); }
  // jedes Bild: want = Musik soll hörbar sein, si = gewählter Sender
  update(want, si) {
    this.setStatic(!!(want && RADIO[si] && RADIO[si].nosignal));
    if (!want || !RADIO[si]) {
      if (this.playing) { this.stopDecks(0.5); this.state[this.active].left = performance.now(); this.playing = false; this.stopIdent(); }
      return;
    }
    if (!this.playing || si !== this.active) { this.tune(si); return; }
    const D = this.decks[this.cur], el = D.el;
    const S = this.state[si], lead = RADIO[si].idents.length && ((S.done || 0) + 1) % 2 === 0 ? IDENT_FADE : FADE;
    if (!this.changing && el.duration && isFinite(el.duration) && el.duration - el.currentTime < lead + 0.3) this.next();
    if (el.ended && !this.changing) this.next();
    this.progress = el.duration ? el.currentTime / el.duration : 0;
    // hängt ein Song (blockiert / Netz)? regelmäßig neu anstoßen; bei Ladefehler nächsten Song nehmen
    if (D.want && !this.changing && (this.retryT -= 1 / 60) <= 0) {
      this.retryT = 1.5;
      if (el.error) this.next();
      else if (el.paused && !el.ended && el.readyState >= 1) this.play(el);
    }
  }
}
