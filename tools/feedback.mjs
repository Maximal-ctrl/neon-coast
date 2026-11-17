#!/usr/bin/env node
// Holt alle Feedback-Einträge aus der Cloud (Supabase, js/cloud-config.js) in feedback/FEEDBACK.md.
//   node tools/feedback.mjs          -> Liste aktualisieren
//   node tools/feedback.mjs --clear  -> danach alle abgeholten Einträge in der Cloud löschen (nach dem Umsetzen)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = readFileSync(join(root, 'js/cloud-config.js'), 'utf8');
const url = (cfg.match(/supabaseUrl:\s*'([^']*)'/) || [])[1], key = (cfg.match(/supabaseKey:\s*'([^']*)'/) || [])[1];
if (!url || !key) { console.error('Kein Cloud-Speicher eingetragen (js/cloud-config.js). Siehe docs/ACCOUNTS.md.'); process.exit(1); }
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
const r = await fetch(`${url}/rest/v1/feedback?select=*&order=created.asc`, { headers: H });
if (!r.ok) { console.error('Fehler beim Abholen:', r.status, await r.text()); process.exit(1); }
const rows = await r.json();
const kind = { idee: '💡 Idee', bug: '🐞 Fehler', sonst: '💬 Sonstiges' };
const md = ['# Feedback & Verbesserungsvorschläge', '', `Abgeholt: ${new Date().toISOString()} · ${rows.length} Einträge`, '']
  .concat(rows.map((f, i) => `## ${i + 1}. ${kind[f.kind] || f.kind} – ${f.name || 'Anonym'} (${f.created}${f.version ? ', ' + f.version : ''})\n\n${f.text}\n`));
mkdirSync(join(root, 'feedback'), { recursive: true });
writeFileSync(join(root, 'feedback/FEEDBACK.md'), md.join('\n'));
console.log(`${rows.length} Einträge -> feedback/FEEDBACK.md`);
if (process.argv.includes('--clear') && rows.length) {
  const ids = rows.map((f) => f.id).join(',');
  const d = await fetch(`${url}/rest/v1/feedback?id=in.(${ids})`, { method: 'DELETE', headers: H });
  console.log(d.ok ? `${rows.length} Einträge in der Cloud gelöscht.` : 'Löschen fehlgeschlagen: ' + d.status);
}
