# Feedback ins GitHub-Repository – Einrichtung (einmalig, ca. 10 Minuten)

Vorschläge aus „Feedback & Ideen“ landen als **Issues mit dem Label `feedback`** in
`Maximal-ctrl/neon-coast`. Spieler brauchen kein Konto. „Löschen“ im Spiel schließt das Issue.

Dazwischen sitzt ein kleiner **Vermittler** (Cloudflare Worker). Er speichert nichts, sondern hält nur den
GitHub-Schlüssel geschützt. Ohne ihn müsste der Schlüssel offen im Spielcode stehen – dann könnte jeder den
Code des Spiels auf GitHub Pages verändern.

## 1. GitHub-Schlüssel (nur Issues, nur dieses Repository)
1. GitHub → Settings → Developer settings → **Fine-grained tokens** → *Generate new token*.
2. Repository access: **Only select repositories** → `neon-coast`.
3. Permissions → Repository permissions → **Issues: Read and write** (sonst nichts).
4. Token kopieren.
5. Im Repository unter *Issues → Labels* ein Label **`feedback`** anlegen.

## 2. Vermittler anlegen
1. Kostenloses Konto auf cloudflare.com → **Workers & Pages** → *Create* → *Create Worker*.
2. Namen wählen (z. B. `neon-coast-feedback`) → *Deploy* → *Edit code*.
3. Inhalt von `tools/feedback-relay/worker.js` einfügen → *Deploy*.
4. Worker → *Settings → Variables and Secrets* → **Secret** `GITHUB_TOKEN` = Token aus Schritt 1.
5. Die Adresse des Workers kopieren (z. B. `https://neon-coast-feedback.<name>.workers.dev`).

## 3. Im Spiel eintragen
In `js/feedback-config.js`:
```js
export const FEEDBACK = { relayUrl: 'https://neon-coast-feedback.<name>.workers.dev' };
```
Committen – fertig. (Oder Claude die Adresse nennen.)

## Vorschläge umsetzen
- Abholen in den Projektordner: `node tools/feedback.mjs` → `feedback/FEEDBACK.md`
- Nach dem Umsetzen schließen: `node tools/feedback.mjs --clear`
  (beides nutzt die GitHub-CLI `gh`; Claude macht das auf Zuruf).
