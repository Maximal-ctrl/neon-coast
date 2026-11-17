// Feedback & Verbesserungsvorschläge (4.22) – Taste im Titelbild.
// Speicher: Supabase-Tabelle „feedback“ (wenn js/cloud-config.js ausgefüllt ist) – dann sehen alle Spieler
// dieselbe Liste und jeder darf Einträge hinzufügen und löschen. Ohne Cloud: auf dem Gerät + „Auf GitHub senden“.
// Abholen ins Repository: node tools/feedback.mjs  (schreibt feedback/FEEDBACK.md)
import { CLOUD } from './cloud-config.js';
import { Account } from './accounts.js';
import { tr } from './i18n.js';

const cloud = !!(CLOUD.supabaseUrl && CLOUD.supabaseKey);
const LKEY = 'neoncoast_feedback_v1';
const REPO = 'Maximal-ctrl/neon-coast';
const KINDS = [['idee', '💡 Idee'], ['bug', '🐞 Fehler'], ['sonst', '💬 Sonstiges']];
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const H = () => ({ apikey: CLOUD.supabaseKey, Authorization: 'Bearer ' + CLOUD.supabaseKey, 'Content-Type': 'application/json' });

const Store = {
  async list() {
    if (cloud) { const r = await fetch(`${CLOUD.supabaseUrl}/rest/v1/feedback?select=*&order=created.desc`, { headers: H() }); if (!r.ok) throw new Error('Cloud-Fehler'); return r.json(); }
    try { return JSON.parse(localStorage.getItem(LKEY)) || []; } catch (e) { return []; }
  },
  async add(e) {
    if (cloud) { const r = await fetch(`${CLOUD.supabaseUrl}/rest/v1/feedback`, { method: 'POST', headers: { ...H(), Prefer: 'return=minimal' }, body: JSON.stringify(e) }); if (!r.ok) throw new Error('Cloud-Fehler'); return; }
    const L = await this.list(); L.unshift({ ...e, id: Date.now(), created: new Date().toISOString() }); localStorage.setItem(LKEY, JSON.stringify(L.slice(0, 200)));
  },
  async del(id) {
    if (cloud) { const r = await fetch(`${CLOUD.supabaseUrl}/rest/v1/feedback?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: H() }); if (!r.ok) throw new Error('Cloud-Fehler'); return; }
    const L = (await this.list()).filter((x) => String(x.id) !== String(id)); localStorage.setItem(LKEY, JSON.stringify(L));
  },
};

export function openFeedback() {
  let el = document.getElementById('fb'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'fb'; el.className = 'acct';
  document.body.appendChild(el);
  let kind = 'idee', msg = '', list = null, sending = false;
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
  const load = async () => { try { list = await Store.list(); } catch (e) { list = []; msg = tr('Liste konnte nicht geladen werden.'); } render(); };
  const render = () => {
    const keepText = el.querySelector('#fb-text') ? el.querySelector('#fb-text').value : '';
    const name = Account.cur ? (Account.cur.charName || Account.cur.name) : '';
    el.innerHTML = `<div class="ac-card fb-card"><button class="ac-x" data-close>✕</button>
      <h2>Feedback & Ideen</h2><p class="ac-sub">Was soll besser werden? Schreib deine Idee oder einen Fehler auf.</p>
      <div class="fb-kinds">${KINDS.map(([k, l]) => `<button class="${k === kind ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <textarea id="fb-text" maxlength="1200" rows="5" placeholder="${tr('Dein Vorschlag …')}"></textarea>
      <div class="fb-row"><span>${name ? '👤 ' + esc(name) : 'Anonym'}</span><span id="fb-count">0/1200</span></div>
      <div class="ac-msg">${esc(msg)}</div>
      <button class="ac-primary" data-send ${sending ? 'disabled' : ''}>${sending ? '…' : 'Absenden'}</button>
      ${cloud ? '' : `<button class="fb-gh" data-gh>Stattdessen auf GitHub senden ↗</button>`}
      <div class="ac-sec"><b>Alle Vorschläge</b><span>${list ? list.length : '…'}</span></div>
      <div class="fb-list">${list === null ? '<div class="ac-empty">Lädt …</div>' : list.length ? list.map((f) => `<div class="fb-item"><i>${(KINDS.find((k) => k[0] === f.kind) || KINDS[2])[1].split(' ')[0]}</i><div><p>${esc(f.text)}</p><span>${esc(f.name || 'Anonym')} · ${new Date(f.created).toLocaleString()}</span></div><button data-del="${esc(f.id)}" title="Löschen">✕</button></div>`).join('') : '<div class="ac-empty">Noch keine Vorschläge – sei der Erste!</div>'}</div>
      <div class="ac-note">${cloud ? '☁️ Alle Spieler sehen dieselbe Liste. Jeder kann Vorschläge hinzufügen und löschen.' : '📱 Ohne Cloud-Speicher bleiben Vorschläge auf diesem Gerät. Für eine gemeinsame Liste: Cloud einrichten (docs/ACCOUNTS.md) oder über GitHub senden.'}</div></div>`;
    const ta = el.querySelector('#fb-text'); ta.value = keepText;
    const cnt = () => { el.querySelector('#fb-count').textContent = ta.value.length + '/1200'; }; cnt(); ta.oninput = cnt;
    el.querySelector('[data-close]').onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };
    for (const b of el.querySelectorAll('[data-k]')) b.onclick = () => { kind = b.dataset.k; render(); };
    el.querySelector('[data-send]').onclick = async () => {
      const text = ta.value.trim();
      if (text.length < 3) { msg = tr('Bitte schreib etwas mehr.'); render(); return; }
      sending = true; render();
      try { await Store.add({ kind, text, name: name || null, version: (window.__ncVersion || '') }); el.querySelector('#fb-text').value = ''; msg = tr('Danke! Dein Vorschlag wurde gespeichert.'); } catch (e) { msg = tr('Senden fehlgeschlagen.'); }
      sending = false; await load();
    };
    const gh = el.querySelector('[data-gh]');
    if (gh) gh.onclick = () => {
      const text = ta.value.trim(); if (!text) { msg = tr('Bitte schreib etwas mehr.'); render(); return; }
      const title = `[${kind}] ${text.slice(0, 60)}`, body = `${text}\n\n— ${name || 'Anonym'} · Neon Coast ${window.__ncVersion || ''}`;
      window.open(`https://github.com/${REPO}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank', 'noopener');
    };
    for (const b of el.querySelectorAll('[data-del]')) b.onclick = async () => { try { await Store.del(b.dataset.del); } catch (e) { msg = tr('Löschen fehlgeschlagen.'); } await load(); };
  };
  render(); load();
  requestAnimationFrame(() => el.classList.add('show'));
}
