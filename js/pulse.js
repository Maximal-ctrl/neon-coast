// PULSE 132 – Techno-Radio mit Tracklist, DJ-Übergängen, Titelanzeige und Moderation
// Musik: eigene, im Browser erzeugte Tracks + optional eigene Songs des Spielers (bleiben auf dem Gerät).
// Moderation: eigene Einspieler des Spielers (auf dem Gerät) oder Sprachausgabe des Geräts.
import { G } from './state.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Fiktive Künstler & Titel (alles Eigenproduktionen des Spiels)
const TRACKS = [
  ['Nachtstrom', 'Hafenlicht', 132, 45], ['KØRA', 'Solera Underground', 133, 43], ['Delta Shift', 'Container 7', 130, 48],
  ['Mareike Volt', 'Kaimauer', 132, 46], ['Subkollektiv', 'Neonregen', 134, 41], ['Vanta', 'Seaside 4AM', 131, 44],
  ['Ruhrpuls', 'Stahl & Salz', 132, 40], ['Lumen Drift', 'Monte Solera', 129, 47], ['Tiefgarage', 'Level -3', 133, 42],
  ['Hertz Atlas', 'Leuchtturm', 132, 45],
];
const STYLES = ['rolling', 'acid', 'peak', 'hypnotic'];

const LINES = [
  'Ihr hört Pulse eins drei zwei – der Herzschlag von Port Solera.',
  'Pulse eins drei zwei. Keine Pausen, nur Bass.',
  'Es ist {time} in Port Solera. Wir bleiben bei hundertzweiunddreißig Schlägen pro Minute.',
  'Das war {last}. Und weiter geht es mit {next}.',
  'Grüße an alle, die gerade über den Seaside Boulevard fahren. Fenster runter, Lautstärke rauf!',
  'Blaulicht im Rückspiegel? Dann hilft nur eins: lauter drehen. Pulse eins drei zwei.',
  'Direkt aus dem Studio über dem Hafen: Pulse eins drei zwei. Gleich kommt {next}.',
  'Port Solera schläft nie – und wir auch nicht.',
  'Ihr hört gerade die Nachtschicht auf Pulse. Haltet durch, die Sonne kommt sowieso.',
  'Wetter für Port Solera: {weather}. Musik: weiterhin Techno.',
];

export class PulseRadio {
  constructor(A) {
    this.A = A;
    this.list = [];       // Abfolge der Tracks
    this.cur = null; this.next = null;
    this.sinceTalk = 1;
    this.userTracks = []; this.idents = [];
    this.talking = false;
    this.lastName = '';
    this.buildList();
  }
  buildList() {
    const order = TRACKS.map((t, i) => i).sort(() => Math.random() - 0.5);
    this.list = order.map((i) => ({ kind: 'gen', i }));
    if (this.userTracks.length) {
      const out = []; let u = 0;
      this.list.forEach((t, k) => { out.push(t); if (k % 2 === 1 && this.userTracks.length) out.push({ kind: 'user', u: (u++) % this.userTracks.length }); });
      this.list = out;
    }
    this.pos = 0;
  }
  title(t) {
    if (t.kind === 'user') { const u = this.userTracks[t.u]; return { artist: 'Pulse Selection', name: u ? u.name : '' }; }
    const [artist, name] = TRACKS[t.i]; return { artist, name };
  }
  // neuen Track anlegen (eigener Bus mit Filter für Übergänge)
  makeTrack(entry, t0) {
    const A = this.A, ctx = A.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 20; hp.Q.value = 0.7;
    bus.connect(hp); hp.connect(A.musicBus);
    const tr = { entry, bus, hp, t0, bar: 0, nextBar: t0, info: this.title(entry), announced: false, done: false };
    if (entry.kind === 'gen') {
      const [, , bpm, root] = TRACKS[entry.i];
      const r = rng(entry.i * 7919 + 13);
      tr.bpm = bpm; tr.root = root; tr.style = STYLES[entry.i % STYLES.length]; tr.len = 96;
      tr.scale = [[0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 3, 7, 10, 12], [0, 1, 5, 7, 10]][entry.i % 4];
      tr.motif = []; for (let k = 0; k < 16; k++) tr.motif.push(r() < 0.5 ? tr.scale[Math.floor(r() * tr.scale.length)] + (r() < 0.25 ? 12 : 0) : null);
      tr.bassPat = [[0, 1, 1, 1], [0, 0, 1, 0], [0, 1, 0, 1]][Math.floor(r() * 3)];
      tr.chord = [[0, 3, 7], [0, 5, 10], [0, 3, 10]][Math.floor(r() * 3)];
      tr.spb = 60 / bpm;
      tr.dur = tr.len * tr.spb * 4;
      bus.gain.setValueAtTime(0.0001, t0); bus.gain.linearRampToValueAtTime(1, t0 + 8);
    } else {
      const u = this.userTracks[entry.u];
      tr.buffer = u && u.buffer; tr.dur = tr.buffer ? tr.buffer.duration : 1;
      if (tr.buffer) {
        const src = ctx.createBufferSource(); src.buffer = tr.buffer;
        const g = ctx.createGain(); g.gain.value = 1.4; src.connect(g); g.connect(bus);
        src.start(t0); tr.src = src;
        bus.gain.setValueAtTime(0.0001, t0); bus.gain.linearRampToValueAtTime(1, t0 + 6);
      }
    }
    return tr;
  }
  // DJ-Übergang: alter Track wird per Hochpass & Lautstärke ausgeblendet
  mixOut(tr, t, len) {
    tr.hp.frequency.setValueAtTime(20, t); tr.hp.frequency.exponentialRampToValueAtTime(900, t + len);
    tr.bus.gain.setValueAtTime(1, t); tr.bus.gain.linearRampToValueAtTime(0.0001, t + len);
    tr.endAt = t + len + 0.2;
    if (tr.src) { try { tr.src.stop(tr.endAt); } catch (e) { /* */ } }
  }
  stopAll() {
    for (const tr of [this.cur, this.next]) if (tr) { try { tr.bus.disconnect(); } catch (e) { /* */ } if (tr.src) try { tr.src.stop(); } catch (e) { /* */ } }
    this.cur = this.next = null;
  }
  // wird aus AudioSys.schedule aufgerufen, solange PULSE zu hören ist
  schedule() {
    const A = this.A, ctx = A.ctx, now = ctx.currentTime;
    if (!this.cur || (this.cur.endAt && now > this.cur.endAt && !this.next)) {
      this.stopAll();
      this.cur = this.makeTrack(this.list[this.pos % this.list.length], now + 0.1);
      this.announce(this.cur);
    }
    if (this.cur.endAt && now > this.cur.endAt && this.next) {
      try { this.cur.bus.disconnect(); } catch (e) { /* */ }
      this.cur = this.next; this.next = null;
    }
    for (const tr of [this.cur, this.next]) if (tr) this.render(tr, now);
    // Übergang einleiten
    const cur = this.cur;
    const mixLen = cur.entry.kind === 'gen' ? 16 * cur.spb * 4 : 10;
    const mixAt = cur.t0 + cur.dur - mixLen;
    if (!this.next && now > mixAt - 0.5) {
      this.pos++;
      if (this.pos >= this.list.length) this.buildList();
      const entry = this.list[this.pos % this.list.length];
      const talk = this.sinceTalk >= (Math.random() < 0.5 ? 1 : 2);
      const start = Math.max(now + 0.2, mixAt);
      this.next = this.makeTrack(entry, start + (talk ? 7 : 0));
      this.mixOut(cur, start, mixLen + (talk ? 7 : 0));
      if (talk) { this.sinceTalk = 0; this.talk(cur.info, this.next.info, start); } else this.sinceTalk++;
      setTimeout(() => this.announce(this.next || this.cur), Math.max(0, (start + (talk ? 9 : 4) - now) * 1000));
    }
  }
  render(tr, now) {
    if (tr.entry.kind !== 'gen') return;
    const A = this.A;
    while (tr.nextBar < now + 0.4 && tr.bar < tr.len) {
      A.out = tr.bus;
      try { this.bar(tr, tr.nextBar, tr.bar); } finally { A.out = null; }
      tr.nextBar += tr.spb * 4; tr.bar++;
    }
  }
  bar(tr, t0, n) {
    const A = this.A, spb = tr.spb, s16 = spb / 4, root = tr.root;
    // Arrangement: Intro 0-15, Aufbau 16-31, Drop 32-47, Break 48-55, Drop 2 56-79, Outro 80-95
    const intro = n < 16, build = n >= 16 && n < 32, drop = (n >= 32 && n < 48) || (n >= 56 && n < 80), brk = n >= 48 && n < 56, outro = n >= 80;
    const kick = !brk;
    for (let b = 0; b < 4; b++) {
      if (kick) A.kick(t0 + b * spb, 1.0);
      A.hat(t0 + b * spb + spb / 2, intro ? 0.12 : 0.22, tr.style === 'peak' ? 0.1 : 0.16);
      if ((build || drop) && b % 2 === 1) A.snare(t0 + b * spb, 0.42, false, tr.style !== 'peak');
      if (!intro && !brk && !outro) tr.bassPat.forEach((on, i) => { if (on && i > 0) A.synthBass(NOTE(root - 12 + tr.chord[0] + (tr.style === 'rolling' && i === 3 ? 12 : 0)), t0 + b * spb + i * s16, s16 * 0.85, 0.19); });
    }
    if (!intro) for (let i = 0; i < 16; i++) A.hat(t0 + i * s16, i % 2 ? 0.035 : 0.06);
    const cut = 400 + 2200 * (0.5 + 0.5 * Math.sin(n * 0.35 + tr.root));
    if (drop || (build && n % 2 === 0)) {
      if (tr.style === 'acid' || tr.style === 'peak') tr.motif.forEach((m, i) => { if (m !== null) A.acid(NOTE(root + m + (i % 7 === 0 ? 12 : 0)), t0 + i * s16, s16 * 0.9, drop ? 0.075 : 0.045, cut); });
      else tr.motif.forEach((m, i) => { if (m !== null && i % 2 === 0) A.pluck(NOTE(root + 12 + m), t0 + i * s16, s16 * 1.6, 0.045, 'square'); });
    }
    if (tr.style === 'hypnotic' && !intro) A.keys(tr.chord.map((c) => NOTE(root + 12 + c)), t0 + spb * 1.5, spb * 0.4, 0.03);
    if (drop && tr.style === 'peak' && n % 2 === 0) A.keys(tr.chord.map((c) => NOTE(root + 12 + c)), t0, spb * 0.5, 0.045);
    if (brk) { A.pad(tr.chord.map((c) => NOTE(root + 12 + c)), t0, spb * 4, 0.06); if (n >= 52) this.riser(tr, t0, spb * 4, 600 + (n - 52) * 1500, 6000, 0.03 + (n - 52) * 0.015); }
    if (n === 31 || n === 55) this.riser(tr, t0 + spb * 2, spb * 2, 800, 7000, 0.06);
  }
  riser(tr, t, dur, f0, f1, vol) {
    const ctx = this.A.ctx, s = ctx.createBufferSource(); s.buffer = this.A.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(tr.bus); s.start(t, 0); s.stop(t + Math.min(dur, 1.9));
  }
  // Einblendung oben: Sender + Interpret – Titel
  announce(tr) {
    if (!tr || tr.announced) return;
    tr.announced = true;
    this.lastName = `${tr.info.artist} – ${tr.info.name}`;
    if (this.audible()) G.hud.nowPlaying('PULSE 132', tr.info.artist, tr.info.name);
  }
  audible() { const P = G.player, A = this.A; return !!(P && P.inCar && G.state === 'playing' && A.station === 3) || (G.interior && G.interior.kind === 'club'); }
  // Moderation: eigener Einspieler (falls vorhanden) oder Sprachausgabe; Musik wird abgesenkt
  talk(last, next, at) {
    const A = this.A, ctx = A.ctx;
    const wait = Math.max(0, (at - ctx.currentTime) * 1000) + 1500;
    setTimeout(() => {
      if (!this.audible()) return;
      const t = ctx.currentTime;
      this.talking = true;
      A.sweeper();
      A.duck(0.32, 0.6);
      const done = () => { A.duck(1, 1.2); this.talking = false; };
      const pool = this.idents.length ? this.idents : this.builtin || [];
      if (pool.length) {
        let k = Math.floor(Math.random() * pool.length);
        if (pool.length > 1 && k === this.lastIdent) k = (k + 1) % pool.length;
        this.lastIdent = k;
        const id = pool[k];
        const src = ctx.createBufferSource(); src.buffer = id.buffer;
        // Radioklang: Bandpass + Kompressor
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 160;
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2800; pk.gain.value = 4;
        const cp = ctx.createDynamicsCompressor(); cp.threshold.value = -24; cp.ratio.value = 4;
        const g = ctx.createGain(); g.gain.value = 1.6;
        src.connect(hp); hp.connect(pk); pk.connect(cp); cp.connect(g); g.connect(A.master);
        src.onended = done; src.start(t + 0.5);
      } else if (window.speechSynthesis) {
        const S = window.speechSynthesis;
        const h = Math.floor(G.timeOfDay), mn = Math.floor((G.timeOfDay % 1) * 60);
        const weather = G.world.env.night > 0.5 ? 'klare Nacht, warm, leichte Brise vom Meer' : 'Sonne, neunundzwanzig Grad, kaum Wolken';
        const line = LINES[Math.floor(Math.random() * LINES.length)]
          .replace('{time}', `${h} Uhr ${mn ? mn : ''}`).replace('{last}', `${last.name} von ${last.artist}`).replace('{next}', `${next.name} von ${next.artist}`).replace('{weather}', weather);
        const u = new SpeechSynthesisUtterance(line);
        u.lang = 'de-DE'; u.rate = 1.04; u.pitch = 0.92; u.volume = Math.min(1, (G.settings.musicVol ?? 0.7) * 1.2 + 0.2);
        const vs = S.getVoices().filter((v) => v.lang && v.lang.startsWith('de'));
        if (vs.length) u.voice = vs.find((v) => /male|Markus|Yannick|Viktor|Stefan|Daniel/i.test(v.name)) || vs[0];
        u.onend = done; u.onerror = done;
        setTimeout(() => { try { S.cancel(); S.speak(u); } catch (e) { done(); } }, 500);
        setTimeout(() => { if (this.talking) done(); }, 12000);
      } else done();
    }, wait);
  }
  // Eigene Songs / Einspieler dekodieren
  async load(songs, idents) {
    const ctx = this.A.ctx;
    const dec = async (list) => { const out = []; for (const r of list) { try { const ab = await r.blob.arrayBuffer(); out.push({ name: r.name, buffer: await ctx.decodeAudioData(ab) }); } catch (e) { /* ungültige Datei */ } } return out; };
    if (!this.builtin) {
      // Moderationsstimme des Senders (KI-Stimme, ElevenLabs)
      const files = ['assets/radio/ident1.mp3', 'assets/radio/ident2.mp3'];
      const out = [];
      for (const f of files) { try { const r = await fetch(f); out.push({ name: f, buffer: await ctx.decodeAudioData(await r.arrayBuffer()) }); } catch (e) { /* */ } }
      this.builtin = out;
    }
    this.userTracks = await dec(songs);
    this.idents = await dec(idents);
    this.buildList();
  }
}
