// Sprachen (3.14): Englisch ist Standard, Deutsch wählbar.
// Die Texte im Code sind Deutsch. Bei Englisch werden alle angezeigten Texte beim Einfügen
// in die Seite (innerHTML/textContent/…), auf Canvas-Schildern und in der Sprachausgabe übersetzt.
import { EN } from './lang-en.js';

const LS = 'neoncoast_settings_v1';
let lang = 'en';
try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); if (s.lang === 'de' || s.lang === 'en') lang = s.lang; } catch (e) { /* Standard */ }
export const LANG = lang;
export const isEN = lang === 'en';

const INLINE = /^<\/?(b|strong|em|u|br)\b[^>]*>$/i;
const HAS_LETTERS = /[A-Za-zÄÖÜäöüß]{2}/;
const UPPER = new Map();
const pats = [];
if (isEN) {
  for (const [k, v] of Object.entries(EN)) {
    if (/\{\d+\}/.test(k)) {
      const lit = k.replace(/\{\d+\}/g, '');
      if ((lit.match(/[A-Za-zÄÖÜäöüß]/g) || []).length < 4) continue; // zu allgemeine Muster (z. B. „{0} von {1}“) nicht verwenden
      const order = [];
      const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)\}/g, (m, n) => { order.push(+n); return '([\\s\\S]*?)'; }) + '$');
      pats.push({ re, order, v, len: lit.length });
    } else if (k === k.toLowerCase() || k !== k.toUpperCase()) UPPER.set(k.toUpperCase(), v.toUpperCase());
  }
  pats.sort((a, b) => b.len - a.len);
}
const cache = new Map();
const remember = (k, v) => { if (cache.size > 6000) cache.clear(); cache.set(k, v); return v; };

// einen Textblock (ohne Block-Tags) übersetzen
function block(s, depth = 0, pieces = true) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  const core = m[2];
  if (!core || !HAS_LETTERS.test(core)) return s;
  let t = EN[core];
  if (t === undefined && core === core.toUpperCase()) t = UPPER.get(core);
  if (t === undefined) { const q = /^([\s\S]*?[^:!?.…\s])([:!?.…]+)$/.exec(core); if (q && EN[q[1]] !== undefined) t = EN[q[1]] + q[2]; } // „Schläger:“ -> „Thug:“
  if (t === undefined && depth < 3 && core.length < 600) {
    for (const p of pats) {
      const r = p.re.exec(core);
      if (!r) continue;
      t = p.v.replace(/\{(\d+)\}/g, (mm, n) => { const i = p.order.indexOf(+n); return i < 0 ? mm : block(r[i + 1], depth + 1); });
      break;
    }
  }
  if (t === undefined && pieces && depth < 4 && core.indexOf('<') >= 0) {
    // Inline-Tags im Block (z. B. <b>Rosa:</b> Text): Textstücke einzeln übersetzen
    const pieces = core.split(/(<[^>]+>)/);
    let changed = false;
    const res = pieces.map((p) => { if (!p || p[0] === '<') return p; const q = block(p, depth + 1); if (q !== p) changed = true; return q; }).join('');
    if (changed) t = res;
  }
  const plain = core.indexOf('<') < 0;
  if (t === undefined && plain && depth < 4 && core.indexOf(': ') > 0) {
    // „Name: Titel“ (z. B. Kartenbeschriftung der Auftraggeber)
    const i = core.indexOf(': '), l = block(core.slice(0, i), depth + 1, pieces), r = block(core.slice(i + 2), depth + 1, pieces);
    if (l !== core.slice(0, i) || r !== core.slice(i + 2)) t = l + ': ' + r;
  }
  if (t === undefined && plain && depth < 4 && core.indexOf('·') > 0) {
    // „Titel  ·  +$4000“: Teile zwischen den Punkten einzeln übersetzen
    const parts = core.split(/(\s*·\s*)/);
    let ch = false;
    const res = parts.map((p, i) => { if (i % 2) return p; const q = block(p, depth + 1, pieces); if (q !== p) ch = true; return q; }).join('');
    if (ch) t = res;
  }
  if (t === undefined && (plain || pieces) && depth < 4) {
    // Symbol- oder Zahlenpräfix (z. B. „🦺 Ausrüstung“, „3. Goldene Mähne“)
    const q = /^([^A-Za-zÄÖÜäöüß¡¿"„<]+)([A-Za-zÄÖÜäöüß¡¿"„<][\s\S]*)$/.exec(core);
    if (q) { const r2 = block(q[2], depth + 1, pieces); if (r2 !== q[2]) t = q[1] + r2; }
  }
  if (t === undefined && depth < 4) {
    // ganz in Inline-Tags verpackt (z. B. <b>Titel</b>): Inhalt übersetzen
    const w = /^((?:<(?:b|strong|em|u)\b[^>]*>)+)([\s\S]*?)((?:<\/(?:b|strong|em|u)>)+)$/i.exec(core);
    if (w) { const inner = block(w[2], depth + 1); if (inner !== w[2]) t = w[1] + inner + w[3]; }
  }
  return t === undefined ? s : m[1] + t + m[3];
}
export function tr(s) {
  if (!isEN || typeof s !== 'string' || !HAS_LETTERS.test(s)) return s;
  const c = cache.get(s); if (c !== undefined) return c;
  if (s.indexOf('<') < 0) return remember(s, block(s));
  // HTML: an Block-Tags trennen, Inline-Tags (<b>, <em> …) bleiben im Satz
  const whole = block(s, 0, false);
  if (whole !== s) return remember(s, whole);
  const parts = s.split(/(<[^>]+>)/);
  let out = '', cur = '';
  for (const p of parts) {
    if (p.length > 1 && p[0] === '<' && p[p.length - 1] === '>') {
      if (INLINE.test(p)) { cur += p; continue; }
      out += block(cur) + p; cur = '';
    } else cur += p;
  }
  out += block(cur);
  return remember(s, out);
}

// ------------------------------------------------------------ Einhängen (nur für Englisch)
function hook(proto, prop, wrap) {
  const d = Object.getOwnPropertyDescriptor(proto, prop);
  if (!d || !d.set) return;
  Object.defineProperty(proto, prop, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { d.set.call(this, wrap(v, this)); } });
}
if (isEN) {
  const skip = (el) => el && (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
  hook(Element.prototype, 'innerHTML', (v, el) => (typeof v === 'string' && !skip(el) ? tr(v) : v));
  hook(Node.prototype, 'textContent', (v, el) => (typeof v === 'string' && !skip(el) ? tr(v) : v));
  hook(HTMLElement.prototype, 'innerText', (v, el) => (typeof v === 'string' && !skip(el) ? tr(v) : v));
  hook(Node.prototype, 'nodeValue', (v) => (typeof v === 'string' ? tr(v) : v));
  const ia = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, html) { return ia.call(this, pos, tr(html)); };
  const sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { return sa.call(this, n, (n === 'placeholder' || n === 'title' || n === 'aria-label') ? tr(String(v)) : v); };
  const ctn = Document.prototype.createTextNode;
  Document.prototype.createTextNode = function (t) { return ctn.call(this, tr(t)); };
  // Canvas-Schilder und Kartenbeschriftung
  const C2 = CanvasRenderingContext2D.prototype;
  for (const fn of ['fillText', 'strokeText', 'measureText']) { const o = C2[fn]; C2[fn] = function (t, ...a) { return o.call(this, tr(String(t)), ...a); }; }
  // Zahlenformat: $1,000 statt $1.000
  const tl = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, o) { return tl.call(this, loc === 'de-DE' || loc === 'de' ? 'en-US' : loc, o); };
  // statische Seite einmal übersetzen (bevor andere Module Elemente binden)
  const inlineOnly = (el) => [...el.children].every((c) => INLINE.test('<' + c.tagName.toLowerCase() + '>'));
  const done = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const texts = []; for (let n = walk.nextNode(); n; n = walk.nextNode()) texts.push(n);
  for (const n of texts) {
    const p = n.parentElement;
    if (!p || skip(p) || !HAS_LETTERS.test(n.data)) continue;
    if (inlineOnly(p) && p.children.length) { if (!done.has(p)) { done.add(p); p.innerHTML = p.innerHTML; } }
    else n.data = tr(n.data);
  }
  for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder', 'title', 'aria-label']) if (el.hasAttribute(a)) el.setAttribute(a, el.getAttribute(a));
  document.title = tr(document.title);
}
document.documentElement.lang = lang;
// Sprache wechseln: speichern und neu laden
export function setLanguage(l) {
  try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); s.lang = l; localStorage.setItem(LS, JSON.stringify(s)); } catch (e) { /* */ }
}
