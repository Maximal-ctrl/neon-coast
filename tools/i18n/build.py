import json, re, glob, os
D = os.path.dirname(os.path.abspath(__file__))
keys = json.load(open(D + '/keys_frozen.json'))
en = {}
bad = []
for f in sorted(glob.glob(D + '/tr*.txt')):
    for line in open(f, encoding='utf-8').read().split('\n'):
        if not line.strip():
            continue
        i, t = line.split('\t', 1)
        k = keys[int(i)]
        ph_k = sorted(set(re.findall(r'\{\d+\}', k)))
        ph_t = sorted(set(re.findall(r'\{\d+\}', t)))
        if ph_k != ph_t:
            bad.append((i, k, t))
        if t != k:
            en[k] = t
# zusammengesetzte Texte, die nicht als ein Literal im Code stehen
EXTRA = {
    'Parkgarage {0}': 'Parking garage {0}',
    'Erfordert: {0} kennenlernen': 'Requires: meet {0}',
    'Erfordert: {0}': 'Requires: {0}',
    '{0} RATHAUS': '{0} TOWN HALL',
    'Garage {0}': 'Garage {0}',
    '{0} Sterne': '{0} stars',
    'Version {0}': 'Version {0}',
    'VERSION {0}': 'VERSION {0}',
}
EXTRA.update({
    'Ein Originalspiel · Grafik, Musik &amp; Sound entstehen live im Browser': 'An original game · graphics, music &amp; sound are generated live in your browser',
    'Pier &amp; Riesenrad': 'Pier &amp; Ferris wheel',
    'TASTATUR &amp; MAUS': 'KEYBOARD &amp; MOUSE',
    'Ein- &amp; Aussteigen': 'Get in &amp; out',
    'antippen für große Karte &amp; Wegpunkt': 'tap for big map &amp; waypoint',
    'Feuer &amp; Zielen · Gas &amp; Bremse': 'Fire &amp; aim · gas &amp; brake',
    'HAND&shy;BREMSE': 'HAND&shy;BRAKE',
    'HANDBREMSE': 'HANDBRAKE',
    'LEGENDE': 'LEGEND',
    'Tante Rosa': 'Aunt Rosa',
    'Handbremse': 'Handbrake',
})

EXTRA.update({
    'Account erstellen': 'Create account', 'Anmelden': 'Log in',
    'Neuer Account – du brauchst den Freischalt-Code.': 'New account – you need the unlock code.',
    'Melde dich mit deinem Account an.': 'Log in with your account.',
    'Profilbild': 'Profile picture', '📷 Eigenes Bild': '📷 Own picture',
    'Accountname': 'Account name', 'Passwort': 'Password', 'Passwort wiederholen': 'Repeat password',
    'Name deines Charakters': 'Character name', 'Freischalt-Code': 'Unlock code',
    'Schon einen Account?': 'Already have an account?', 'Zum ersten Mal hier?': 'First time here?',
    '☁️ Accounts werden in der Cloud gespeichert – Anmeldung auf jedem Gerät.': '☁️ Accounts are stored in the cloud – log in on any device.',
    '📱 Accounts werden auf diesem Gerät gespeichert. Freunde und Online-Status funktionieren geräteübergreifend.': '📱 Accounts are stored on this device. Friends and online status work across devices.',
    'Entfernen': 'Remove', 'Noch keine Freunde – gib deinen Code weiter oder füge einen hinzu.': 'No friends yet – share your code or add one.',
    'Dein Freundescode': 'Your friend code', 'Kopieren': 'Copy',
    'Noch kein Spielstand im Account – speichere im Spiel (Bett oder Handy).': 'No save in your account yet – save in the game (bed or phone).',
    '▶ Spielstand aus dem Account laden': '▶ Load save from account', 'Freunde': 'Friends',
    'Freundescode (z. B. AB12-CD34)': 'Friend code (e.g. AB12-CD34)', 'Hinzufügen': 'Add',
    'Profil bearbeiten': 'Edit profile', 'Abmelden': 'Log out',
    'Dieser Accountname ist schon vergeben.': 'This account name is already taken.',
    'Accountname oder Passwort falsch.': 'Wrong account name or password.',
    'Anmeldung fehlgeschlagen.': 'Login failed.',
    'Bitte in Supabase die E-Mail-Bestätigung ausschalten (siehe docs/ACCOUNTS.md).': 'Please turn off email confirmation in Supabase (see docs/ACCOUNTS.md).',
    'Profil nicht gefunden.': 'Profile not found.', 'Falscher Freischalt-Code.': 'Wrong unlock code.',
    'Accountname: 3–16 Zeichen (Buchstaben, Zahlen, _).': 'Account name: 3–16 characters (letters, numbers, _).',
    'Passwort: mindestens 4 Zeichen.': 'Password: at least 4 characters.',
    'Die Passwörter stimmen nicht überein.': "The passwords don't match.",
    'Ungültiger Freundescode.': 'Invalid friend code.', 'Das ist dein eigener Code.': "That's your own code.",
    'Ist schon in deiner Freundesliste.': 'Already in your friends list.', 'Code kopiert!': 'Code copied!',
    'Freund hinzugefügt: {0}': 'Friend added: {0}', 'Freund hinzugefügt.': 'Friend added.',
    '📋 Patch-Notes': '📋 Patch notes', 'Patch-Notes': 'Patch notes', 'NEU': 'NEW',
    'Accounts mit Profilbild': 'Accounts with profile pictures', 'Freundescodes & Online-Status': 'Friend codes & online status',
    'Spielstand im Account': 'Saves in your account', 'Neue Wohnung': 'New apartment', 'Neue Menüs': 'New menus',
    'Größeres Handy': 'Bigger phone', 'Auftrags-Stammbaum': 'Mission tree', 'Englisch & Deutsch': 'English & German',
    'Sprachwahl im Titel': 'Language picker on title', 'Sterne seltener': 'Fewer wanted stars',
    'Fadenkreuz im Fahrzeug': 'Vehicle crosshair', 'Fallschirm per Leertaste': 'Parachute on Space',
    'Taxi-App': 'Taxi app', 'Mehr Garagen': 'More garages', 'Reifen & Lenkung tunen': 'Tire & steering tuning',
    'Live-Titelbild': 'Live title screen', 'Nitro bis 300 km/h': 'Nitro up to 300 km/h', 'Echtes Driften': 'Real drifting',
    'Höhenmesser': 'Altimeter', 'Federung': 'Suspension', 'Glattere Straßen': 'Smoother roads',
    'Saubere Kreuzungen': 'Clean junctions', 'Neue Landhäuser': 'New country houses',
    'Granaten & Scharfschützengewehr': 'Grenades & sniper rifle', 'Straßensperren': 'Roadblocks',
    'Canyon & neue Orte': 'Canyon & new towns', 'Neue Aufträge': 'New missions', 'Boote & Flugzeug': 'Boats & plane',
    'Auto-Tuning': 'Car tuning', '35 neue Aufträge': '35 new missions', 'Gespeichert': 'Saved',
    'Straßensperren weiter entfernt': 'Roadblocks farther away',
    '📂 Vorschläge werden im GitHub-Repository des Spiels gespeichert. Alle sehen dieselbe Liste – jeder kann hinzufügen und löschen.': "📂 Suggestions are stored in the game's GitHub repository. Everyone sees the same list – anyone can add and delete.",
    '📱 Die gemeinsame Liste ist noch nicht eingerichtet – Vorschläge bleiben vorerst auf diesem Gerät.': "📱 The shared list isn't set up yet – suggestions stay on this device for now.",
    'Feedback landet in GitHub': 'Feedback goes to GitHub', 'Kein Konto nötig': 'No account needed', 'Zeit zum Abbiegen': 'Time to turn off',
    '💬 Feedback &amp; Ideen': '💬 Feedback &amp; ideas', 'Feedback & Ideen': 'Feedback & ideas',
    'Was soll besser werden? Schreib deine Idee oder einen Fehler auf.': 'What should be better? Write down your idea or a bug.',
    '💡 Idee': '💡 Idea', '🐞 Fehler': '🐞 Bug', '💬 Sonstiges': '💬 Other', 'Dein Vorschlag …': 'Your suggestion …',
    'Anonym': 'Anonymous', 'Absenden': 'Send', 'Stattdessen auf GitHub senden ↗': 'Send via GitHub instead ↗',
    'Alle Vorschläge': 'All suggestions', 'Lädt …': 'Loading …', 'Noch keine Vorschläge – sei der Erste!': 'No suggestions yet – be the first!',
    '☁️ Alle Spieler sehen dieselbe Liste. Jeder kann Vorschläge hinzufügen und löschen.': '☁️ All players see the same list. Anyone can add and delete suggestions.',
    '📱 Ohne Cloud-Speicher bleiben Vorschläge auf diesem Gerät. Für eine gemeinsame Liste: Cloud einrichten (docs/ACCOUNTS.md) oder über GitHub senden.': '📱 Without cloud storage, suggestions stay on this device. For a shared list: set up the cloud (docs/ACCOUNTS.md) or send via GitHub.',
    'Liste konnte nicht geladen werden.': 'Could not load the list.', 'Bitte schreib etwas mehr.': 'Please write a little more.',
    'Danke! Dein Vorschlag wurde gespeichert.': 'Thanks! Your suggestion was saved.', 'Senden fehlgeschlagen.': 'Sending failed.',
    'Löschen fehlgeschlagen.': 'Delete failed.', 'Löschen': 'Delete', 'Bald verfügbar': 'Coming soon',
    '📻 Noch keine Songs – das Radio-Update kommt bald.': '📻 No songs yet – the radio update is coming soon.',
    '📻 Das große Radio-Update kommt bald – dann laufen hier echte Songs.': '📻 The big radio update is coming soon – then real songs will play here.',
    'Standard-Grafik: Niedrig': 'Default graphics: Low', 'Flüssigere Grafik': 'Smoother graphics', 'Neue Radiosender': 'New radio stations', 'Neue Titel-Anordnung': 'New title layout',
    # 4.24 Radio & Boombox
    'Gute Laune für Port Solera': 'Good vibes for Port Solera',
    'Tung, tung, tung – der Beat der Straße': 'Tung, tung, tung – the beat of the street',
    'Aus dem Keller von Port Solera': 'Straight from the basements of Port Solera',
    'Radio auf der Schulter': 'Radio on your shoulder', 'Boombox': 'Boombox', '♫ AN': '♫ ON', 'AUS': 'OFF',
    '📻 Auf diesem Sender laufen noch keine Songs.': '📻 No songs on this station yet.',
    'Neue Radiosender': 'New radio stations', 'Radio-Engine mit Übergängen': 'Radio engine with transitions',
    'Neues Radio-Overlay': 'New radio overlay', 'Boombox im Waffenrad': 'Boombox in the weapon wheel',
    'Radio zu Fuß': 'Radio on foot',
    'Kein Signal': 'No signal', 'Kein Signal – Sender nicht erreichbar': 'No signal – station out of reach',
    'Tung Tung Radio mit 5 Songs': 'Tung Tung Radio with 5 songs', 'Sunshine & Underground: kein Signal': 'Sunshine & Underground: no signal',
    'Keine Wiederholung direkt hintereinander': 'No back-to-back repeats',
    'Radio-Update': 'Radio update', 'Tung Tung Radio: 12 Songs': 'Tung Tung Radio: 12 songs', 'Moderatorin Sarah': 'Host Sarah',
    'Weiche Übergänge': 'Smooth transitions', 'Einheitliche Lautstärke': 'Even volume', 'Keine Wiederholungen': 'No repeats',
})
en.update(EXTRA)
import html as _h
for k, v in list(en.items()):
    if '&' in k and ';' in k:
        dk, dv = _h.unescape(k), _h.unescape(v)
        if dk != k and dk not in en: en[dk] = dv
for b in bad:
    print('PLACEHOLDER MISMATCH', b)
out = '// Automatisch erzeugt – englische Übersetzung (Schlüssel = deutscher Originaltext)\nexport const EN = ' + json.dumps(en, ensure_ascii=False, indent=0) + ';\n'
open(os.path.join(D, '..', '..', 'js', 'lang-en.js'), 'w', encoding='utf-8').write(out)
print('entries', len(en), 'bytes', len(out.encode()))
