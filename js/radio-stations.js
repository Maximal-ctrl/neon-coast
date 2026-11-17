// Radiosender. Songs und Einsprecher liegen unter assets/radio/<key>/songs/ bzw. assets/radio/<key>/idents/.
// tracks:  { file, title, artist }   – file relativ zu assets/radio/<key>/songs/
// idents:  { file }                   – kurze Zwischeneinsprecher/Jingles, relativ zu assets/radio/<key>/idents/
// nosignal: true                      – Platzhalter: Sender zeigt „Kein Signal“ und rauscht nur
export const RADIO = [
  { key: 'sunshine', name: 'SUNSHINE RADIO', freq: '98.6', tagline: 'Gute Laune für Port Solera', c1: '#ffd23f', c2: '#ff7b00', logo: '☀️', nosignal: true, tracks: [], idents: [] },
  {
    key: 'tungtung', name: 'TUNG TUNG RADIO', freq: '104.2', tagline: 'Tung, tung, tung – der Beat der Straße', c1: '#ff2e88', c2: '#7b2cbf', logo: '🥁',
    tracks: [
      { file: 'allein-im-wald.mp3', title: 'Allein im Wald', artist: 'calypsoviola640' },
      { file: 'crunchos-deluxe.mp3', title: 'Crunchos Deluxe', artist: 'ruinousform526' },
      { file: 'elektrisiert.mp3', title: 'Elektrisiert', artist: 'ruinousform526' },
      { file: 'gluten-free.mp3', title: 'Gluten Free', artist: 'calypsoviola640' },
      { file: 'hafenparty.mp3', title: 'Hafenparty', artist: 'calypsoviola640' },
      { file: 'ich-lieb-dich.mp3', title: 'Ich lieb dich (ich hab 2,4)', artist: 'calypsoviola640' },
      { file: 'keiner-hats-gemerkt.mp3', title: "Keiner hat's gemerkt", artist: 'calypsoviola640' },
      { file: 'links-und-rechts.mp3', title: 'Links und rechts', artist: 'ruinousform526' },
      { file: 'mama-hat-den-verlauf-gesehen.mp3', title: 'Mama hat den Verlauf gesehen', artist: 'ruinousform526' },
      { file: 'mein-eigener-valentin.mp3', title: 'Mein eigener Valentin', artist: 'calypsoviola640' },
      { file: 'opa-hat-die-blauen-genommen.mp3', title: 'Opa hat die Blauen genommen', artist: 'ruinousform526' },
      { file: 'super-mega-gay.mp3', title: 'Super Mega Gay', artist: 'calypsoviola640' },
    ],
    idents: [],
  },
  { key: 'underground', name: 'UNDERGROUND RADIO', freq: '89.9', tagline: 'Aus dem Keller von Port Solera', c1: '#19e6ff', c2: '#111827', logo: '🎧', nosignal: true, tracks: [], idents: [] },
];
