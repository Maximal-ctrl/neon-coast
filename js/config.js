// Weltaufbau von Port Solera
export const CELL = 80;          // Abstand zwischen Straßenachsen (m)
export const NB = 9;             // Blöcke pro Achse
export const HALF = (NB * CELL) / 2; // 360
export const I0 = -3;            // Westliche Erweiterung (Altstadt): Blockindizes -3..-1
export const NI = NB + 1 - I0;   // Knoten pro Zeile
export const WEST_X = -HALF + I0 * CELL; // -600
export const ROAD_HW = 8;        // halbe Fahrbahnbreite
export const WALK_HW = 12;       // Fahrbahn + Gehweg
export const LANES = [2, 6];     // Spurmitte vom Mittelstreifen
export const WATER_Y = -0.8;
export const LAND = { minX: WEST_X - WALK_HW - 12, maxX: HALF + WALK_HW, minZ: -HALF - WALK_HW - 12, maxZ: HALF + WALK_HW + 12 };
export const BEACH_X0 = HALF + WALK_HW; // 372
export const PIER = { x0: 405, x1: 640, z0: 33, z1: 47, y: 1.3, rampEnd: 452 };
export const PIER_PLAT = { x0: 585, x1: 660, z0: 5, z1: 75 };

export const roadPos = (i) => -HALF + i * CELL;
export const blockCenter = (bi, bj) => [roadPos(bi) + CELL / 2, roadPos(bj) + CELL / 2];
export const blockOf = (x, z) => [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)];
export const nodeId = (i, j) => j * NI + (i - I0);

// Sandhöhe am Strand (identisch zum Wasser-Shader!)
export function sandHeight(x, z) {
  let s = x - BEACH_X0 + 6 * Math.sin(z * 0.021) + 3 * Math.sin(z * 0.067 + 1.7);
  let y = -0.05 - 0.0095 * s - 0.06 * Math.max(0, s - 80);
  const az = Math.abs(z);
  if (az > 384) y -= (az - 384) * 0.06;
  return y;
}

// Besondere Blöcke
export const SPECIAL = {
  safehouse: { bi: 7, bj: 2, name: 'Unterschlupf' },
  diner: { bi: 2, bj: 3, name: "Rosa's Diner" },
  garage: { bi: 5, bj: 7, name: "Dex' Werkstatt" },
  club: { bi: 7, bj: 5, name: 'Club Velvet' },
  bank: { bi: 4, bj: 4, name: 'Solera Bank' },
  hospital: { bi: 1, bj: 2, name: 'Krankenhaus' },
  police: { bi: 5, bj: 2, name: 'Polizeirevier' },
  gunshop: { bi: 2, bj: 6, name: 'Waffenladen' },
  dealer: { bi: 6, bj: 4, name: 'Solera Motors' },
};
export const PARKS = [[4, 1], [1, 4], [6, 6]];
export const OPEN_LOTS = [[1, 8], [7, 7], [3, 6]]; // Containerhof, Parkplatz, Plaza

export function isSpecialBlock(bi, bj) {
  for (const k in SPECIAL) if (SPECIAL[k].bi === bi && SPECIAL[k].bj === bj) return k;
  return null;
}
export const isPark = (bi, bj) => PARKS.some((p) => p[0] === bi && p[1] === bj);
export const isOpenLot = (bi, bj) => OPEN_LOTS.some((p) => p[0] === bi && p[1] === bj);

// Markerposition vor einem Block (südlicher Gehweg)
export function blockFrontPos(bi, bj) {
  return [roadPos(bi) + CELL / 2, roadPos(bj + 1) - 10];
}

export function districtOf(bi, bj) {
  if (bi >= NB) return 'beach';
  if (bi < 0) return 'oldtown';
  if (bi === 8) return 'seaside';
  if (bj >= 7 && bi <= 4) return 'harbor';
  if (bj <= 1) return 'heights';
  if (bi >= 3 && bi <= 5 && bj >= 3 && bj <= 5) return 'downtown';
  if (bi <= 2) return 'westside';
  return 'midtown';
}

export const DISTRICT_NAMES = {
  beach: 'Solera Beach',
  seaside: 'Seaside Boulevard',
  harbor: 'Hafen',
  heights: 'Coral Heights',
  downtown: 'Downtown',
  westside: 'Westside',
  midtown: 'Midtown',
  oldtown: 'Altstadt',
  village: 'Monte Solera',
  pier: 'Sunset Pier',
  sea: 'Offenes Meer',
  hills: 'Solera Hills',
  sierra: 'Sierra Alta',
  westland: 'Tierra Seca',
  eastcoast: 'Costa Este',
  estate: 'Anwesen Valcourt',
  valverde: 'Valverde',
  bahia: 'Bahía Blanca',
  ranchos: 'Los Ranchos',
  santacruz: 'Santa Cruz',
  lagoverde: 'Lago Verde',
  pinar: 'Pinar Alto',
  sanlucar: 'San Lúcar',
  piedra: 'Piedra Roja',
  canyon: 'Cañón Rojo',
  montenegro: 'Monte Negro',
  finca: 'Finca Escondida',
  club: 'Club Velvet',
  bank: 'Solera Bank',
};

export function districtAt(x, z) {
  if (x > PIER.rampEnd - 10 && z > PIER_PLAT.z0 - 10 && z < PIER_PLAT.z1 + 10 && x < PIER_PLAT.x1 + 5) return 'pier';
  if (Math.hypot(x + 160, z + 752) < 112) return 'village';
  { const t = townAt(x, z); if (t) return t.key; }
  if (Math.hypot(x - 530, z + 912) < 70) return 'estate';
  if (Math.hypot(x - 1000, z + 2300) < 280) return 'montenegro';
  if (x > -680 && x < -260 && z > -1430 && z < -1280) return 'finca';
  if (x < -1150 && x > -1460 && z < -1600 && z > -2050) return 'canyon';
  if (z < -440 && z > REGION.z0 && x > REGION.x0 && x < REGION.x1) return z < -2150 ? 'sierra' : x < -700 ? 'westland' : x > 900 ? 'eastcoast' : 'hills';
  if (x > 470) return 'sea';
  if (x > BEACH_X0) return 'beach';
  if (x < LAND.minX || z < LAND.minZ || z > LAND.maxZ) return 'sea';
  const [bi, bj] = blockOf(x, z);
  return districtOf(Math.max(I0, Math.min(NB - 1, bi)), Math.max(0, Math.min(NB - 1, bj)));
}

// Rampen für Stuntsprünge: Mittelpunkt Start, Richtung, Länge, Breite, Höhe
export const RAMPS = [
  { x: -240, z: 293, dir: 0, len: 14, wid: 7, h: 2.8 },           // Containerhof
  { x: 214, z: 240, dir: Math.PI / 2, len: 14, wid: 7, h: 3.0 },  // Parkplatz
  { x: 405, z: -250, dir: 0, len: 12, wid: 7, h: 2.4 },           // Strand Nord
  { x: -106, z: 160, dir: Math.PI / 2, len: 12, wid: 7, h: 2.2 }, // Plaza
  { x: 405, z: 250, dir: Math.PI, len: 12, wid: 7, h: 2.6 },      // Strand Süd
];

// ------------------------------------------------------------ Solera County (Umland)
// Region nördlich der Stadt: Küste im Süden, Ringgebirge im Westen, Norden und Osten
export const REGION = { x0: -1800, x1: 2100, z0: -3100, z1: -436 };
// Dämme von der Stadt zum Festland (x-Mitte, Breite 16 m)
export const CAUSEWAYS = [
  { x0: 32, x1: 48, z0: -492, z1: -384, y1: 0.9, node: [5, 0] },
  { x0: -528, x1: -512, z0: -492, z1: -384, y1: 0.9, node: [-2, 0] },
];
// Orte im Umland: Straßenraster mit nx × nz Blöcken (Zellgröße cs)
export const TOWN_CS = 70;
export const TOWNS = [
  { key: 'valverde', name: 'Valverde', cx: 300, cz: -1900, nx: 4, nz: 3, style: 'town' },
  { key: 'bahia', name: 'Bahía Blanca', cx: 1450, cz: -650, nx: 4, nz: 2, style: 'coast', y: 5 },
  { key: 'ranchos', name: 'Los Ranchos', cx: -1250, cz: -1250, nx: 3, nz: 2, style: 'desert' },
  { key: 'santacruz', name: 'Santa Cruz', cx: -1000, cz: -640, nx: 4, nz: 2, style: 'coast' },
  { key: 'lagoverde', name: 'Lago Verde', cx: 600, cz: -1450, nx: 3, nz: 2, style: 'town' },
  { key: 'pinar', name: 'Pinar Alto', cx: -400, cz: -2480, nx: 3, nz: 2, style: 'town', y: 62 },
  { key: 'sanlucar', name: 'San Lúcar', cx: 1530, cz: -1030, nx: 3, nz: 2, style: 'desert' },
  { key: 'piedra', name: 'Piedra Roja', cx: -1500, cz: -2150, nx: 3, nz: 2, style: 'desert', y: 95 },
];
export const townNode = (t, i, j) => [t.cx + (i - t.nx / 2) * TOWN_CS, t.cz + (j - t.nz / 2) * TOWN_CS];
export const townRect = (t, m = 0) => ({ x0: t.cx - (t.nx / 2) * TOWN_CS - m, x1: t.cx + (t.nx / 2) * TOWN_CS + m, z0: t.cz - (t.nz / 2) * TOWN_CS - m, z1: t.cz + (t.nz / 2) * TOWN_CS + m });
export function townAt(x, z, m = 30) {
  for (const t of TOWNS) { const r = townRect(t, m); if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return t; }
  return null;
}

// ------------------------------------------------------------ Bootsstege (Docks)
// rects: begehbare Stegflächen [x0, z0, x1, z1]; gap: Lücke in der Kaimauer; slips: Liegeplätze [x, z, Richtung]
export const DOCKS = [
  { key: 'marina', name: 'Solera Marina', side: 'S', gap: [85.5, 94.5], y: 0.35,
    rects: [[86, 383.8, 94, 440], [84, 440, 96, 452]],
    shop: [90, 378.5], slips: [[99.4, 404, 0], [99.4, 420, 0], [99.4, 434, 0], [80.6, 410, 0], [80.6, 428, 0]] },
  { key: 'strand', name: 'Strandsteg', side: 'E', y: 0.4,
    rects: [[417, -203, 498, -197], [490, -208, 502, -192]],
    shop: [413.5, -200], slips: [[468, -206.4, Math.PI / 2], [484, -206.4, Math.PI / 2], [470, -193.6, Math.PI / 2], [485, -193.6, Math.PI / 2]] },
  { key: 'altstadt', name: 'Altstadt-Kai', side: 'W', gap: [-4.5, 4.5], y: 0.35,
    rects: [[-680, -4, -623.8, 4], [-692, -12, -680, 12]],
    shop: [-618.5, 8], slips: [[-650, -6.6, -Math.PI / 2], [-668, -6.6, -Math.PI / 2], [-656, 6.6, -Math.PI / 2]] },
  { key: 'suedwest', name: 'Yachthafen Südwest', side: 'S', gap: [-484.5, -475.5], y: 0.35,
    rects: [[-484, 383.8, -476, 444], [-488, 444, -472, 456]],
    shop: [-480, 378.5], slips: [[-469.4, 404, 0], [-469.4, 424, 0], [-490.6, 410, 0], [-490.6, 432, 0]] },
];
