// Radiosender (4.24). Songs und Einsprecher liegen unter assets/radio/<key>/songs/ bzw. assets/radio/<key>/idents/.
// tracks:  { file, title, artist }   – file relativ zu assets/radio/<key>/songs/
// idents:  { file }                   – kurze Zwischeneinsprecher/Jingles, relativ zu assets/radio/<key>/idents/
export const RADIO = [
  { key: 'sunshine', name: 'SUNSHINE RADIO', freq: '98.6', tagline: 'Gute Laune für Port Solera', c1: '#ffd23f', c2: '#ff7b00', logo: '☀️', tracks: [], idents: [] },
  { key: 'tungtung', name: 'TUNG TUNG RADIO', freq: '104.2', tagline: 'Tung, tung, tung – der Beat der Straße', c1: '#ff2e88', c2: '#7b2cbf', logo: '🥁', tracks: [], idents: [] },
  { key: 'underground', name: 'UNDERGROUND RADIO', freq: '89.9', tagline: 'Aus dem Keller von Port Solera', c1: '#19e6ff', c2: '#111827', logo: '🎧', tracks: [], idents: [] },
];
