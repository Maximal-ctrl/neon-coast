# Neon Coast – Hinweise für Claude

## Versionsnummer (Pflicht bei jedem Update)
Die Version steht in `js/main.js` (`GAME_VERSION`) und wird im Titelbildschirm neben dem Logo angezeigt.

- **Kleines Update** (Standard, wenn nichts anderes gesagt wird): zweistellige Nachkommazahl um 1 erhöhen,
  z. B. 1.01 → 1.02 → … → 1.09 → 1.10.
- **Großes Update** (nur wenn der Nutzer "großes Update" sagt): erste Zahl erhöhen und hinten zurücksetzen,
  z. B. 1.07 → 2.0, danach 2.01, 2.02 …
- Bei jedem Update zusätzlich `VERSION` in `sw.js` ändern, damit Geräte die neue Version laden.
- Nach dem Update in der Antwort die neue Versionsnummer nennen.

## Sonstiges
- Antworten an den Nutzer: Deutsch.
- Spielsprache: Englisch (Standard) und Deutsch (Einstellungen / EN-DE-Taste im Titel).
  Texte im Code bleiben Deutsch; `js/i18n.js` übersetzt sie beim Anzeigen mit dem Wörterbuch `js/lang-en.js`
  (Schlüssel = deutscher Originaltext, `{0}`, `{1}` … für Platzhalter in Template-Strings).
  Neue oder geänderte Texte immer auch in `js/lang-en.js` eintragen.
- Spiel ist ein eigenständiges Werk (keine Namen, Figuren oder Inhalte aus GTA o. Ä.).
- Änderungen direkt auf `main` committen und pushen (GitHub Pages veröffentlicht von `main`).
