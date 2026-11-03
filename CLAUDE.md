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
- Sprache im Spiel und in Antworten: Deutsch.
- Spiel ist ein eigenständiges Werk (keine Namen, Figuren oder Inhalte aus GTA o. Ä.).
- Änderungen direkt auf `main` committen und pushen (GitHub Pages veröffentlicht von `main`).
