# Radio – Songs & Einsprecher hinzufügen

Drei Sender: **Sunshine Radio** (`sunshine`), **Tung Tung Radio** (`tungtung`), **Underground Radio** (`underground`).

1. Song-Datei (am besten `.mp3`, 128–192 kbit/s) nach `assets/radio/<sender>/songs/` legen.
2. Kurze Zwischeneinsprecher/Jingles nach `assets/radio/<sender>/idents/` legen.
3. In `js/radio-stations.js` beim Sender eintragen:
   ```js
   tracks: [ { file: 'mein-song.mp3', title: 'Songtitel', artist: 'Künstler' } ],
   idents: [ { file: 'jingle1.mp3' } ],
   ```

Die Engine (`js/radio.js`) mischt die Reihenfolge, blendet Songs weich über (2,6 s), legt nach jedem
zweiten Song (sonst zu 35 %) einen Einsprecher über den Songanfang und senkt dabei die Musik ab.
Jeder Sender läuft „live“ weiter, auch wenn man umschaltet.
