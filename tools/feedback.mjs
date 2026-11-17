#!/usr/bin/env node
// Holt alle offenen Vorschläge (GitHub-Issues mit Label „feedback“) nach feedback/FEEDBACK.md.
//   node tools/feedback.mjs          -> Liste aktualisieren
//   node tools/feedback.mjs --clear  -> danach alle abgeholten Vorschläge schließen (nach dem Umsetzen)
// Benötigt die GitHub-CLI „gh“ (angemeldet).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'Maximal-ctrl/neon-coast';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
const issues = JSON.parse(gh('issue', 'list', '--repo', REPO, '--label', 'feedback', '--state', 'open', '--limit', '200', '--json', 'number,title,body,createdAt'));
issues.sort((a, b) => a.number - b.number);
const md = ['# Feedback & Verbesserungsvorschläge', '', `Abgeholt: ${new Date().toISOString()} · ${issues.length} offene Vorschläge`, '']
  .concat(issues.map((i) => {
    const m = /<!--nc:(\{.*?\})-->/.exec(i.body || ''); const meta = m ? JSON.parse(m[1]) : {};
    return `## #${i.number} · ${i.title}\n\n${meta.text || (i.body || '').replace(/<!--[\s\S]*?-->/g, '').trim()}\n\n_${meta.name || 'Anonym'} · ${i.createdAt}${meta.version ? ' · ' + meta.version : ''}_\n`;
  }));
if (!issues.length) md.push('_Keine offenen Vorschläge._');
mkdirSync(join(root, 'feedback'), { recursive: true });
writeFileSync(join(root, 'feedback/FEEDBACK.md'), md.join('\n'));
console.log(`${issues.length} Vorschläge -> feedback/FEEDBACK.md`);
if (process.argv.includes('--clear')) {
  for (const i of issues) gh('issue', 'close', String(i.number), '--repo', REPO, '--reason', 'completed', '--comment', 'Umgesetzt – danke für den Vorschlag!');
  console.log(`${issues.length} Vorschläge geschlossen.`);
}
