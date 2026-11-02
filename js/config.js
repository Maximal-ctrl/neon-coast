// Weltaufbau von Port Solera
export const CELL = 80;          // Abstand zwischen Straßenachsen (m)
export const NB = 9;             // Blöcke pro Achse
export const HALF = (NB * CELL) / 2; // 360
export const ROAD_HW = 8;        // halbe Fahrbahnbreite
export const WALK_HW = 12;       // Fahrbahn + Gehweg
export const LANES = [2, 6];     // Spurmitte vom Mittelstreifen
export const WATER_Y = -0.8;
export const LAND = { minX: -HALF - WALK_HW - 12, maxX: HALF + WALK_HW, minZ: -HALF - WALK_HW - 12, maxZ: HALF + WALK_HW + 12 };
export const BEACH_X0 = HALF + WALK_HW; // 372
export const PIER = { x0: 405, x1: 640, z0: 33, z1: 47, y: 1.3, rampEnd: 452 };
export const PIER_PLAT = { x0: 585, x1: 660, z0: 5, z1: 75 };

export const roadPos = (i) => -HALF + i * CELL;
export const blockCenter = (bi, bj) => [roadPos(bi) + CELL / 2, roadPos(bj) + CELL / 2];
export const blockOf = (x, z) => [Math.floor((x + HALF) / CELL), Math.floor((z + HALF) / CELL)];
export const nodeId = (i, j) => j * (NB + 1) + i;

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
  pier: 'Sunset Pier',
  sea: 'Offenes Meer',
};

export function districtAt(x, z) {
  if (x > PIER.rampEnd - 10 && z > PIER_PLAT.z0 - 10 && z < PIER_PLAT.z1 + 10 && x < PIER_PLAT.x1 + 5) return 'pier';
  if (x > 470) return 'sea';
  if (x > BEACH_X0) return 'beach';
  if (x < LAND.minX || z < LAND.minZ || z > LAND.maxZ) return 'sea';
  const [bi, bj] = blockOf(x, z);
  return districtOf(Math.max(0, Math.min(NB - 1, bi)), Math.max(0, Math.min(NB - 1, bj)));
}

// Rampen für Stuntsprünge: Mittelpunkt Start, Richtung, Länge, Breite, Höhe
export const RAMPS = [
  { x: -240, z: 293, dir: 0, len: 14, wid: 7, h: 2.8 },           // Containerhof
  { x: 214, z: 240, dir: Math.PI / 2, len: 14, wid: 7, h: 3.0 },  // Parkplatz
  { x: 405, z: -250, dir: 0, len: 12, wid: 7, h: 2.4 },           // Strand Nord
  { x: -106, z: 160, dir: Math.PI / 2, len: 12, wid: 7, h: 2.2 }, // Plaza
  { x: 405, z: 250, dir: Math.PI, len: 12, wid: 7, h: 2.6 },      // Strand Süd
];
