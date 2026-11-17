// Feedback & Verbesserungsvorschläge (4.22) – Taste im Titelbild.
// Abholen ins Repository: node tools/feedback.mjs  (schreibt feedback/FEEDBACK.md)
import { FEEDBACK } from './feedback-config.js';
import { Account } from './accounts.js';
import { tr } from './i18n.js';

// 4.23: Vorschläge werden über den Vermittler als GitHub-Issues (Label „feedback“) im Repository gespeichert.
const relay = (FEEDBACK.relayUrl || '').replace(/\/$/, '');
const cloud = !!relay;
const LKEY = 'neoncoast_feedback_v1';
const KINDS = [['idee', '💡 Idee'], ['bug', '🐞 Fehler'], ['sonst', '💬 Sonstiges']];
const esc = (t) => String(t ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const J = { 'Content-Type': 'application/json' };

const Store = {
  async list() {
    if (cloud) { const r = await fetch(`${relay}/feedback`); if (!r.ok) throw new Error('Fehler'); return r.json(); }
    try { return JSON.parse(localStorage.getItem(LKEY)) || []; } catch (e) { return []; }
  },
  async add(e) {
    if (cloud) { const r = await fetch(`${relay}/feedback`, { method: 'POST', headers: J, body: JSON.stringify(e) }); if (!r.ok) throw new Error('Fehler'); return; }
    const L = await this.list(); L.unshift({ ...e, id: Date.now(), created: new Date().toISOString() }); localStorage.setItem(LKEY, JSON.stringify(L.slice(0, 200)));
  },
  async del(id) {
    if (cloud) { const r = await fetch(`${relay}/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' }); if (!r.ok) throw new Error('Fehler'); return; }
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
      <div class="ac-sec"><b>Alle Vorschläge</b><span>${list ? list.length : '…'}</span></div>
      <div class="fb-list">${list === null ? '<div class="ac-empty">Lädt …</div>' : list.length ? list.map((f) => `<div class="fb-item"><i>${(KINDS.find((k) => k[0] === f.kind) || KINDS[2])[1].split(' ')[0]}</i><div><p>${esc(f.text)}</p><span>${esc(f.name || 'Anonym')} · ${new Date(f.created).toLocaleString()}</span></div><button data-del="${esc(f.id)}" title="Löschen">✕</button></div>`).join('') : '<div class="ac-empty">Noch keine Vorschläge – sei der Erste!</div>'}</div>
      <div class="ac-note">${cloud ? '📂 Vorschläge werden im GitHub-Repository des Spiels gespeichert. Alle sehen dieselbe Liste – jeder kann hinzufügen und löschen.' : '📱 Die gemeinsame Liste ist noch nicht eingerichtet – Vorschläge bleiben vorerst auf diesem Gerät.'}</div></div>`;
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
    for (const b of el.querySelectorAll('[data-del]')) b.onclick = async () => { try { await Store.del(b.dataset.del); } catch (e) { msg = tr('Löschen fehlgeschlagen.'); } await load(); };
  };
  render(); load();
  requestAnimationFrame(() => el.classList.add('show'));
}
