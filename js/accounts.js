// Accounts (4.2): Registrierung mit Freischalt-Code, Anmeldung, Profilbild, Charaktername,
// Freundescode, Freundesliste mit Online-Status und Spielstand im Account.
// Speicher: auf dem Gerät – oder in Supabase, wenn js/cloud-config.js ausgefüllt ist (dann von überall erreichbar).
// Online-Status: über PeerJS (jeder angemeldete Spieler ist unter seinem Freundescode erreichbar).
import { G } from './state.js';
import { CLOUD } from './cloud-config.js';
import { tr } from './i18n.js';

const REG_CODE = '1111';                       // Freischalt-Code für neue Accounts
const LKEY = 'neoncoast_accounts_v1', SESS = 'neoncoast_session_v1';
const PEER_PREFIX = 'neoncoast-acc-';
const AVATARS = ['🦊', '🐺', '🦁', '🐯', '🐼', '🐸', '🦅', '🐙', '🦈', '🐲', '😎', '🤠', '👽', '🤖', '👑', '🔥', '⚡', '🌴', '🏎️', '🎧'];
const AV_COLS = ['#ff2e88,#7b2cbf', '#19e6ff,#1567d3', '#ffd23f,#ff7b00', '#7cff6b,#118ab2', '#ff6b6b,#b5179e', '#f4f2ee,#8d99ae'];
const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const cloud = !!(CLOUD.supabaseUrl && CLOUD.supabaseKey);

// ------------------------------------------------------------ Hilfen
const store = () => { try { return window.localStorage; } catch (e) { return null; } };
const readJ = (k, d) => { try { const v = JSON.parse(store().getItem(k)); return v ?? d; } catch (e) { return d; } };
const writeJ = (k, v) => { try { store().setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hashPw(pw, salt) {
  if (!crypto.subtle) return 'plain:' + pw; // sehr alte Browser
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 120000 }, key, 256);
  return b64(bits);
}
function newFriendCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(8));
  let s = ''; for (let i = 0; i < 8; i++) s += A[r[i] % A.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2');
// Profilbild: hochgeladenes Bild auf 128 px verkleinern
function fileToAvatar(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.82)); };
    img.onerror = rej; img.src = url;
  });
}
export function avatarHTML(av, size = 44) {
  if (av && av.img) return `<i class="ac-av" style="--s:${size}px;background-image:url(${av.img})"></i>`;
  const a = av || { e: '😎', c: 0 };
  return `<i class="ac-av" style="--s:${size}px;background:linear-gradient(135deg,${AV_COLS[a.c % AV_COLS.length]})">${a.e}</i>`;
}

// ------------------------------------------------------------ Speicher: Gerät
const Local = {
  all() { return readJ(LKEY, {}); },
  put(acc) { const A = this.all(); A[acc.id] = acc; writeJ(LKEY, A); },
  async register({ name, password, charName, avatar }) {
    const A = this.all(), id = name.toLowerCase();
    if (A[id]) throw new Error(tr('Dieser Accountname ist schon vergeben.'));
    const salt = newFriendCode() + Date.now();
    const acc = { id, name, salt, hash: await hashPw(password, salt), charName, avatar, friendCode: newFriendCode(), friends: [], save: null, created: Date.now() };
    this.put(acc); return acc;
  },
  async login(name, password) {
    const acc = this.all()[String(name).toLowerCase()];
    if (!acc || (await hashPw(password, acc.salt)) !== acc.hash) throw new Error(tr('Accountname oder Passwort falsch.'));
    return acc;
  },
  async update(acc) { this.put(acc); return acc; },
  async lookup(code) { return Object.values(this.all()).find((a) => a.friendCode === code) || null; },
};

// ------------------------------------------------------------ Speicher: Supabase (optional)
const Cloud = {
  h(token) { return { apikey: CLOUD.supabaseKey, Authorization: 'Bearer ' + (token || CLOUD.supabaseKey), 'Content-Type': 'application/json' }; },
  mail: (name) => `${name.toLowerCase()}@players.neoncoast.game`,
  async auth(path, body) {
    const r = await fetch(`${CLOUD.supabaseUrl}/auth/v1/${path}`, { method: 'POST', headers: this.h(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || tr('Anmeldung fehlgeschlagen.'));
    return j;
  },
  async rest(path, opts = {}, token) {
    const r = await fetch(`${CLOUD.supabaseUrl}/rest/v1/${path}`, { ...opts, headers: { ...this.h(token), Prefer: 'return=representation', ...(opts.headers || {}) } });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || 'Cloud-Fehler');
    return j;
  },
  async register({ name, password, charName, avatar }) {
    const s = await this.auth('signup', { email: this.mail(name), password });
    const token = s.access_token || (s.session && s.session.access_token);
    if (!token) throw new Error(tr('Bitte in Supabase die E-Mail-Bestätigung ausschalten (siehe docs/ACCOUNTS.md).'));
    const uid = (s.user || s).id;
    const acc = { id: uid, name, charName, avatar, friendCode: newFriendCode(), friends: [], save: null, created: Date.now() };
    await this.rest('profiles', { method: 'POST', body: JSON.stringify({ id: uid, name, char_name: charName, avatar, friend_code: acc.friendCode, friends: [] }) }, token);
    acc.token = token; acc.refresh = s.refresh_token;
    return acc;
  },
  async login(name, password) {
    const s = await this.auth('token?grant_type=password', { email: this.mail(name), password });
    const p = (await this.rest(`profiles?id=eq.${s.user.id}&select=*`, {}, s.access_token))[0];
    if (!p) throw new Error(tr('Profil nicht gefunden.'));
    const sv = (await this.rest(`saves?id=eq.${s.user.id}&select=data,updated`, {}, s.access_token))[0];
    return { id: p.id, name: p.name, charName: p.char_name, avatar: p.avatar, friendCode: p.friend_code, friends: p.friends || [], save: sv ? { data: sv.data, t: Date.parse(sv.updated) } : null, token: s.access_token, refresh: s.refresh_token };
  },
  async update(acc) {
    await this.rest(`profiles?id=eq.${acc.id}`, { method: 'PATCH', body: JSON.stringify({ char_name: acc.charName, avatar: acc.avatar, friends: acc.friends, last_seen: new Date().toISOString() }) }, acc.token);
    if (acc._saveDirty && acc.save) { await this.rest('saves', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: acc.id, data: acc.save.data, updated: new Date(acc.save.t).toISOString() }) }, acc.token); acc._saveDirty = false; }
    return acc;
  },
  async lookup(code, acc) { const r = await this.rest(`profiles?friend_code=eq.${code}&select=name,char_name,avatar,friend_code,last_seen`, {}, acc && acc.token); return r[0] ? { name: r[0].name, charName: r[0].char_name, avatar: r[0].avatar, friendCode: r[0].friend_code, lastSeen: r[0].last_seen } : null; },
};
const DB = cloud ? Cloud : Local;

// ------------------------------------------------------------ Sitzung & Online-Status
export const Account = {
  cur: null, online: new Map(), peer: null, cloud,
  get loggedIn() { return !!this.cur; },
  async restore() {
    const s = readJ(SESS, null);
    if (!s) return;
    if (!cloud) { const a = Local.all()[s.id]; if (a) this.cur = a; }
    else if (s.acc) this.cur = s.acc; // Cloud: Sitzung (Token) aus dem letzten Login
    if (this.cur) this.startPresence();
  },
  remember() { writeJ(SESS, cloud ? { id: this.cur.id, acc: this.cur } : { id: this.cur.id }); },
  async register(f) {
    if (String(f.code).trim() !== REG_CODE) throw new Error(tr('Falscher Freischalt-Code.'));
    if (!/^[A-Za-z0-9_]{3,16}$/.test(f.name)) throw new Error(tr('Accountname: 3–16 Zeichen (Buchstaben, Zahlen, _).'));
    if (String(f.password).length < 4) throw new Error(tr('Passwort: mindestens 4 Zeichen.'));
    if (f.password !== f.password2) throw new Error(tr('Die Passwörter stimmen nicht überein.'));
    this.cur = await DB.register({ name: f.name, password: f.password, charName: (f.charName || f.name).slice(0, 14), avatar: f.avatar });
    this.remember(); this.startPresence(); return this.cur;
  },
  async login(name, password) { this.cur = await DB.login(name.trim(), password); this.remember(); this.startPresence(); return this.cur; },
  logout() { this.stopPresence(); this.cur = null; try { store().removeItem(SESS); } catch (e) { /* */ } },
  async save() { if (!this.cur) return; await DB.update(this.cur); this.remember(); },
  // Spielstand nach jedem Speichern in den Account übernehmen
  syncSave(slot, data) {
    if (!this.cur || !data) return;
    this.cur.save = { data, t: Date.now(), slot }; this.cur._saveDirty = true;
    this.save().catch(() => {});
  },
  async addFriend(code) {
    code = normCode(code);
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error(tr('Ungültiger Freundescode.'));
    if (code === this.cur.friendCode) throw new Error(tr('Das ist dein eigener Code.'));
    if (this.cur.friends.some((f) => f.code === code)) throw new Error(tr('Ist schon in deiner Freundesliste.'));
    const p = await DB.lookup(code, this.cur).catch(() => null);
    this.cur.friends.push({ code, name: p ? p.charName || p.name : null, avatar: p ? p.avatar : null, added: Date.now() });
    await this.save(); this.checkFriends(); return p;
  },
  async removeFriend(code) { this.cur.friends = this.cur.friends.filter((f) => f.code !== code); await this.save(); },
  // ---------- Online über PeerJS
  async loadPeer() {
    if (window.peerjs || window.Peer) return (window.peerjs && window.peerjs.Peer) || window.Peer;
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = './lib/peerjs.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return (window.peerjs && window.peerjs.Peer) || window.Peer;
  },
  async startPresence() {
    if (this.peer || !this.cur) return;
    try {
      const Peer = await this.loadPeer();
      const p = new Peer(PEER_PREFIX + this.cur.friendCode.replace('-', ''), { debug: 0 });
      this.peer = p;
      p.on('connection', (c) => { c.on('open', () => { try { c.send({ t: 'hi', name: this.cur.charName || this.cur.name, avatar: this.cur.avatar && this.cur.avatar.img ? null : this.cur.avatar }); } catch (e) { /* */ } setTimeout(() => c.close(), 1500); }); });
      p.on('error', (e) => { if (e.type === 'peer-unavailable') { const id = String(e.message || '').match(/neoncoast-acc-([A-Z0-9]{8})/); if (id) this.setOnline(id[1].slice(0, 4) + '-' + id[1].slice(4), false); } else if (e.type === 'unavailable-id') { /* schon auf einem anderen Gerät online */ } });
      p.on('disconnected', () => { try { p.reconnect(); } catch (e) { /* */ } });
      p.on('open', () => this.checkFriends());
      clearInterval(this._t); this._t = setInterval(() => this.checkFriends(), 45000);
      if (cloud) { clearInterval(this._ls); this._ls = setInterval(() => this.save().catch(() => {}), 90000); }
    } catch (e) { this.peer = null; }
  },
  stopPresence() { clearInterval(this._t); clearInterval(this._ls); try { this.peer && this.peer.destroy(); } catch (e) { /* */ } this.peer = null; this.online.clear(); },
  setOnline(code, on, info) {
    this.online.set(code, on);
    if (info && this.cur) { const f = this.cur.friends.find((q) => q.code === code); if (f && info.name && f.name !== info.name) { f.name = info.name; if (info.avatar) f.avatar = info.avatar; this.save().catch(() => {}); } }
    if (this.onChange) this.onChange();
  },
  checkFriends() {
    if (!this.peer || !this.cur || this.peer.disconnected) return;
    for (const f of this.cur.friends) {
      const code = f.code; let done = false;
      try {
        const c = this.peer.connect(PEER_PREFIX + code.replace('-', ''), { reliable: false });
        c.on('data', (d) => { if (d && d.t === 'hi') this.setOnline(code, true, d); });
        c.on('open', () => { done = true; this.setOnline(code, true); });
        // Server kennt den Peer -> kein „peer-unavailable“ binnen 5 s = online
        setTimeout(() => { if (!done && this.online.get(code) !== false) this.setOnline(code, true); }, 5000);
        setTimeout(() => { try { c.close(); } catch (e) { /* */ } }, 9000);
      } catch (e) { /* */ }
      this.online.set(code, this.online.get(code) ?? null);
    }
    if (this.onChange) this.onChange();
  },
};

// ------------------------------------------------------------ Oberfläche (Overlay im Titelbild)
export function openAccounts() {
  let el = $('acct'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'acct'; el.className = 'acct';
  document.body.appendChild(el);
  let mode = 'login', avatar = { e: AVATARS[Math.floor(Math.random() * AVATARS.length)], c: Math.floor(Math.random() * AV_COLS.length) }, msg = '';
  const close = () => { Account.onChange = null; el.classList.remove('show'); setTimeout(() => el.remove(), 250); if (G.refreshTitle) G.refreshTitle(); };
  const keep = {};
  const render = () => {
    for (const inp of el.querySelectorAll('#ac-form input:not([type=file])')) keep[inp.id] = inp.value; // Eingaben behalten
    const A = Account.cur;
    let body;
    if (!A) {
      const reg = mode === 'register';
      body = `<h2>${reg ? 'Account erstellen' : 'Anmelden'}</h2>
        <p class="ac-sub">${reg ? 'Neuer Account – du brauchst den Freischalt-Code.' : 'Melde dich mit deinem Account an.'}</p>
        <form id="ac-form" autocomplete="on">
          ${reg ? `<div class="ac-avpick">${avatarHTML(avatar, 72)}<div><b>Profilbild</b><div class="ac-avs">${AVATARS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
            <div class="ac-cols">${AV_COLS.map((c, i) => `<button type="button" data-c="${i}" style="background:linear-gradient(135deg,${c})"></button>`).join('')}<label class="ac-up">📷 Eigenes Bild<input type="file" id="ac-file" accept="image/*" hidden></label></div></div></div>` : ''}
          <label>Accountname<input id="ac-name" maxlength="16" autocomplete="username" required></label>
          <label>Passwort<input id="ac-pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required></label>
          ${reg ? `<label>Passwort wiederholen<input id="ac-pw2" type="password" autocomplete="new-password" required></label>
          <label>Name deines Charakters<input id="ac-char" maxlength="14"></label>
          <label>Freischalt-Code<input id="ac-code" inputmode="numeric" maxlength="8" required></label>` : ''}
          <div class="ac-msg">${esc(msg)}</div>
          <button class="ac-primary" type="submit">${reg ? 'Account erstellen' : 'Anmelden'}</button>
        </form>
        <div class="ac-switch">${reg ? 'Schon einen Account?' : 'Zum ersten Mal hier?'} <button type="button" data-mode="${reg ? 'login' : 'register'}">${reg ? 'Anmelden' : 'Account erstellen'}</button></div>
        <div class="ac-note">${cloud ? '☁️ Accounts werden in der Cloud gespeichert – Anmeldung auf jedem Gerät.' : '📱 Accounts werden auf diesem Gerät gespeichert. Freunde und Online-Status funktionieren geräteübergreifend.'}</div>`;
    } else {
      const fr = A.friends.map((f) => { const on = Account.online.get(f.code); return `<div class="ac-friend">${avatarHTML(f.avatar, 38)}<div><b>${esc(f.name || f.code)}</b><span>${f.code}</span></div><em class="${on ? 'on' : on === false ? 'off' : 'unk'}">${on ? 'online' : on === false ? 'offline' : '…'}</em><button data-rm="${f.code}" title="Entfernen">✕</button></div>`; }).join('') || '<div class="ac-empty">Noch keine Freunde – gib deinen Code weiter oder füge einen hinzu.</div>';
      const sv = A.save;
      body = `<div class="ac-profile">${avatarHTML(A.avatar, 84)}<div><h2>${esc(A.charName || A.name)}</h2><span>@${esc(A.name)}</span>
          <div class="ac-code"><small>Dein Freundescode</small><b id="ac-mycode">${A.friendCode}</b><button data-copy>Kopieren</button></div></div></div>
        <div class="ac-sec"><b>Spielstand</b>${sv ? `<span>Gespeichert: ${new Date(sv.t).toLocaleString()} · ${esc(sv.data && sv.data.name || '')}</span>` : '<span>Noch kein Spielstand im Account – speichere im Spiel (Bett oder Handy).</span>'}</div>
        ${sv ? '<button class="ac-primary" data-load>▶ Spielstand aus dem Account laden</button>' : ''}
        <div class="ac-sec"><b>Freunde</b><span>${A.friends.filter((f) => Account.online.get(f.code)).length} online</span></div>
        <div class="ac-add"><input id="ac-fc" placeholder="${tr('Freundescode (z. B. AB12-CD34)')}" maxlength="9"><button data-add>Hinzufügen</button></div>
        <div class="ac-msg">${esc(msg)}</div>
        <div class="ac-friends">${fr}</div>
        <div class="ac-row"><button data-edit>Profil bearbeiten</button><button data-logout>Abmelden</button></div>`;
    }
    el.innerHTML = `<div class="ac-card"><button class="ac-x" data-close>✕</button>${body}</div>`;
    for (const inp of el.querySelectorAll('#ac-form input:not([type=file])')) if (keep[inp.id] != null) inp.value = keep[inp.id];
    bind();
  };
  const q0 = (sel) => el.querySelector(sel);
  const bind = () => {
    el.querySelector('[data-close]').onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };
    for (const b of el.querySelectorAll('[data-mode]')) b.onclick = () => { mode = b.dataset.mode; msg = ''; render(); };
    if (q0('[data-logout]')) for (const k in keep) delete keep[k];
    for (const b of el.querySelectorAll('[data-e]')) b.onclick = () => { avatar = { e: b.dataset.e, c: avatar.c || 0 }; render(); };
    for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { avatar = { e: avatar.e || '😎', c: +b.dataset.c }; render(); };
    const file = $('ac-file'); if (file) file.onchange = async () => { if (file.files[0]) { avatar = { img: await fileToAvatar(file.files[0]) }; render(); } };
    const form = $('ac-form');
    if (form) form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.ac-primary'); btn.disabled = true; btn.textContent = '…';
      try {
        if (mode === 'register') await Account.register({ name: $('ac-name').value.trim(), password: $('ac-pw').value, password2: $('ac-pw2').value, charName: $('ac-char').value.trim(), code: $('ac-code').value, avatar });
        else await Account.login($('ac-name').value, $('ac-pw').value);
        msg = ''; for (const k in keep) delete keep[k];
      } catch (err) { msg = err.message || String(err); }
      render();
    };
    const q = (s) => el.querySelector(s);
    if (q('[data-copy]')) q('[data-copy]').onclick = () => { try { navigator.clipboard.writeText(Account.cur.friendCode); msg = tr('Code kopiert!'); } catch (e) { msg = Account.cur.friendCode; } render(); };
    if (q('[data-add]')) q('[data-add]').onclick = async () => { try { const p = await Account.addFriend($('ac-fc').value); msg = p ? tr('Freund hinzugefügt: {0}').replace('{0}', p.charName || p.name) : tr('Freund hinzugefügt.'); } catch (err) { msg = err.message; } render(); };
    for (const b of el.querySelectorAll('[data-rm]')) b.onclick = async () => { await Account.removeFriend(b.dataset.rm); render(); };
    if (q('[data-logout]')) q('[data-logout]').onclick = () => { Account.logout(); mode = 'login'; msg = ''; render(); };
    if (q('[data-edit]')) q('[data-edit]').onclick = () => editProfile();
    if (q('[data-load]')) q('[data-load]').onclick = () => { if (G.loadAccountSave) { close(); G.loadAccountSave(Account.cur.save); } };
  };
  const editProfile = () => {
    const A = Account.cur; let av = A.avatar || avatar;
    const r = () => {
      el.querySelector('.ac-card').innerHTML = `<button class="ac-x" data-close>✕</button><h2>Profil bearbeiten</h2>
        <div class="ac-avpick">${avatarHTML(av, 72)}<div><b>Profilbild</b><div class="ac-avs">${AVATARS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
        <div class="ac-cols">${AV_COLS.map((c, i) => `<button type="button" data-c="${i}" style="background:linear-gradient(135deg,${c})"></button>`).join('')}<label class="ac-up">📷 Eigenes Bild<input type="file" id="ac-file" accept="image/*" hidden></label></div></div></div>
        <label>Name deines Charakters<input id="ac-char" maxlength="14" value="${esc(A.charName || '')}"></label>
        <div class="ac-row"><button data-back>Abbrechen</button><button class="ac-primary" data-ok>Speichern</button></div>`;
      el.querySelector('[data-close]').onclick = close;
      el.querySelector('[data-back]').onclick = render;
      for (const b of el.querySelectorAll('[data-e]')) b.onclick = () => { av = { e: b.dataset.e, c: av.c || 0 }; r(); };
      for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { av = { e: av.e || '😎', c: +b.dataset.c }; r(); };
      $('ac-file').onchange = async (e) => { if (e.target.files[0]) { av = { img: await fileToAvatar(e.target.files[0]) }; r(); } };
      el.querySelector('[data-ok]').onclick = async () => { A.avatar = av; A.charName = $('ac-char').value.trim() || A.name; await Account.save().catch(() => {}); render(); };
    };
    r();
  };
  Account.onChange = () => { if (Account.cur && !el.querySelector('#ac-char') && !el.querySelector('#ac-form')) render(); };
  render();
  requestAnimationFrame(() => el.classList.add('show'));
  if (Account.cur) Account.checkFriends();
}
// kleine Account-Taste oben rechts im Titelbild
export function accountBadge() {
  const A = Account.cur;
  return A ? `${avatarHTML(A.avatar, 26)}<span>${esc(A.charName || A.name)}</span>` : '<i class="ac-ico">👤</i><span>Accounts</span>';
}
