// Prozedurale Texturen (alles per Canvas generiert – keine Bilddateien nötig)
import * as THREE from 'three';
import { mulberry32 } from './utils.js';

let ANISO = 4;
export function setAniso(a) { ANISO = a; }

function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = true, flipY = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.flipY = flipY;
  t.anisotropy = ANISO;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

function noise(ctx, w, h, amount, alpha, rnd, size = 1) {
  for (let i = 0; i < amount; i++) {
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rnd()})`;
    ctx.fillRect(rnd() * w, rnd() * h, size, size);
  }
}

// ---------------------------------------------------------------- Straße
// Eine Kachel = 80 m. Straße liegt mittig auf dem Kachelrand.
export function roadTexture(size = 2048) {
  const [c, g] = cv(size);
  const s = size / 80; // px pro m
  const rnd = mulberry32(7);
  const R = (x0, z0, x1, z1, col) => { g.fillStyle = col; g.fillRect(x0 * s, z0 * s, (x1 - x0) * s, (z1 - z0) * s); };
  // Blockinneres (Beton)
  R(0, 0, 80, 80, '#8d8c88');
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = Math.max(1, s * 0.05);
  for (let m = 12; m <= 68; m += 4) {
    g.beginPath(); g.moveTo(m * s, 12 * s); g.lineTo(m * s, 68 * s); g.stroke();
    g.beginPath(); g.moveTo(12 * s, m * s); g.lineTo(68 * s, m * s); g.stroke();
  }
  // Gehwege
  const walk = '#a9a7a2';
  R(0, 0, 12, 80, walk); R(68, 0, 80, 80, walk); R(0, 0, 80, 12, walk); R(0, 68, 80, 80, walk);
  g.strokeStyle = 'rgba(60,60,60,0.25)'; g.lineWidth = Math.max(1, s * 0.04);
  for (let m = 0; m <= 80; m += 1.5) {
    g.beginPath(); g.moveTo(m * s, 0); g.lineTo(m * s, 12 * s); g.moveTo(m * s, 68 * s); g.lineTo(m * s, 80 * s); g.stroke();
    g.beginPath(); g.moveTo(0, m * s); g.lineTo(12 * s, m * s); g.moveTo(68 * s, m * s); g.lineTo(80 * s, m * s); g.stroke();
  }
  // Asphalt
  const asph = '#34363b';
  R(0, 0, 8, 80, asph); R(72, 0, 80, 80, asph); R(0, 0, 80, 8, asph); R(0, 72, 80, 80, asph);
  // Asphalt-Rauschen
  g.save();
  g.beginPath();
  g.rect(0, 0, 8 * s, size); g.rect(72 * s, 0, 8 * s, size); g.rect(0, 0, size, 8 * s); g.rect(0, 72 * s, size, 8 * s);
  g.clip();
  noise(g, size, size, size * 60, 0.18, rnd, Math.max(1, s * 0.08));
  // Ölflecken & Flicken
  for (let i = 0; i < 40; i++) {
    const along = 14 + rnd() * 52, side = rnd() < 0.5 ? 1 + rnd() * 6 : 73 + rnd() * 6;
    const [x, z] = rnd() < 0.5 ? [side, along] : [along, side];
    const gr = g.createRadialGradient(x * s, z * s, 0, x * s, z * s, s * (0.6 + rnd() * 1.2));
    gr.addColorStop(0, 'rgba(10,10,12,0.35)'); gr.addColorStop(1, 'rgba(10,10,12,0)');
    g.fillStyle = gr; g.fillRect((x - 2) * s, (z - 2) * s, 4 * s, 4 * s);
  }
  for (let i = 0; i < 10; i++) {
    const along = 14 + rnd() * 50, side = rnd() < 0.5 ? 0.5 + rnd() * 5 : 73 + rnd() * 5;
    const [x, z] = rnd() < 0.5 ? [side, along] : [along, side];
    g.fillStyle = 'rgba(25,26,30,0.5)'; g.fillRect(x * s, z * s, (1 + rnd() * 2) * s, (1 + rnd() * 3) * s);
  }
  g.restore();
  // Bordsteine
  g.fillStyle = '#c9c6bf';
  const cw = 0.25;
  R(8, 12, 8 + cw, 68, '#c9c6bf'); R(72 - cw, 12, 72, 68, '#c9c6bf');
  R(12, 8, 68, 8 + cw, '#c9c6bf'); R(12, 72 - cw, 68, 72, '#c9c6bf');
  R(8, 0, 8 + cw, 8, '#34363b');
  // Markierungen
  const white = '#e9e9e4', yellow = '#e7b923';
  // Doppelte gelbe Mittellinie (an den Kachelrändern)
  R(0.12, 12.5, 0.27, 67.5, yellow); R(79.73, 12.5, 79.88, 67.5, yellow);
  R(12.5, 0.12, 67.5, 0.27, yellow); R(12.5, 79.73, 67.5, 79.88, yellow);
  // gestrichelte Spurtrennung
  for (let m = 14; m < 66; m += 6) {
    R(3.9, m, 4.1, m + 3, white); R(75.9, m, 76.1, m + 3, white);
    R(m, 3.9, m + 3, 4.1, white); R(m, 75.9, m + 3, 76.1, white);
  }
  // Zebrastreifen
  for (let k = 0.6; k < 8; k += 1.0) {
    R(k, 8.6, k + 0.55, 11.4, white); R(80 - k - 0.55, 8.6, 80 - k, 11.4, white);
    R(k, 68.6, k + 0.55, 71.4, white); R(80 - k - 0.55, 68.6, 80 - k, 71.4, white);
    R(8.6, k, 11.4, k + 0.55, white); R(8.6, 80 - k - 0.55, 11.4, 80 - k, white);
    R(68.6, k, 71.4, k + 0.55, white); R(68.6, 80 - k - 0.55, 71.4, 80 - k, white);
  }
  // Haltelinien (Rechtsverkehr)
  // Nordwärts (östl. Hälfte, x 0..8) kommt von Süden zur Kreuzung bei z=0 -> Linie bei z=12
  R(0.4, 11.8, 7.8, 12.3, white);
  // Südwärts (westl. Hälfte, x 72..80) kommt von Norden zur Kreuzung bei z=80 -> Linie bei z=68
  R(72.2, 67.7, 79.6, 68.2, white);
  // Ostwärts (südl. Hälfte z 0..8) kommt von Westen zur Kreuzung bei x=80 -> Linie bei x=68
  R(67.7, 0.4, 68.2, 7.8, white);
  // Westwärts (nördl. Hälfte z 72..80) kommt von Osten zur Kreuzung bei x=0 -> Linie bei x=12
  R(11.8, 72.2, 12.3, 79.6, white);
  // Gullideckel
  g.fillStyle = '#26272b';
  for (const [x, z] of [[2, 40], [78, 30], [40, 6], [25, 77]]) {
    g.beginPath(); g.arc(x * s, z * s, 0.4 * s, 0, Math.PI * 2); g.fill();
  }
  return tex(c, { flipY: false });
}

// ---------------------------------------------------------------- Fassaden
// Kachel: 8 Fenster breit, 8 Etagen hoch
function facadeBase(size, style, seed) {
  const [c, g] = cv(size);
  const [ce, ge] = cv(size / 2);
  const rnd = mulberry32(seed);
  const cell = size / 8, ec = size / 16;
  ge.fillStyle = '#000'; ge.fillRect(0, 0, size / 2, size / 2);
  const litColors = ['#ffd9a0', '#ffe6bf', '#fff2d6', '#cfe3ff', '#ffc98a', '#b9d3ff'];
  const lit = (cx, cy, wx, wy, ww, wh, p = 0.38) => {
    if (rnd() < p) {
      const col = litColors[Math.floor(rnd() * litColors.length)];
      const gr = ge.createLinearGradient(0, wy, 0, wy + wh);
      gr.addColorStop(0, col); gr.addColorStop(1, shade(col, 0.6 + rnd() * 0.3));
      ge.fillStyle = gr;
      ge.fillRect(wx, wy, ww, wh);
      if (rnd() < 0.3) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(wx + ww * rnd() * 0.6, wy, ww * 0.3, wh); }
    }
  };
  if (style === 'glass') {
    g.fillStyle = '#1b2129'; g.fillRect(0, 0, size, size);
    for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
      const x = fx * cell, y = fy * cell;
      const gr = g.createLinearGradient(x, y, x + cell * 0.4, y + cell);
      const b = 0.8 + rnd() * 0.4;
      gr.addColorStop(0, `rgb(${110 * b},${165 * b},${200 * b})`);
      gr.addColorStop(0.5, `rgb(${50 * b},${95 * b},${135 * b})`);
      gr.addColorStop(1, `rgb(${28 * b},${52 * b},${80 * b})`);
      g.fillStyle = gr;
      g.fillRect(x + cell * 0.04, y + cell * 0.04, cell * 0.92, cell * 0.74);
      g.fillStyle = '#2a323c'; g.fillRect(x, y + cell * 0.8, cell, cell * 0.2);
      lit(0, 0, (fx * ec) + ec * 0.04, fy * ec + ec * 0.04, ec * 0.92, ec * 0.74, 0.32);
    }
  } else if (style === 'office') {
    g.fillStyle = '#c4bdb0'; g.fillRect(0, 0, size, size);
    noise(g, size, size, size * 30, 0.08, rnd, 2);
    for (let fy = 0; fy < 8; fy++) {
      const y = fy * cell;
      g.fillStyle = '#26323e'; g.fillRect(0, y + cell * 0.22, size, cell * 0.56);
      for (let fx = 0; fx < 8; fx++) {
        const x = fx * cell;
        const gr = g.createLinearGradient(x, y + cell * 0.22, x, y + cell * 0.78);
        gr.addColorStop(0, '#5f7f99'); gr.addColorStop(1, '#22313f');
        g.fillStyle = gr; g.fillRect(x + cell * 0.1, y + cell * 0.25, cell * 0.8, cell * 0.5);
        g.fillStyle = '#b8b1a4'; g.fillRect(x, y + cell * 0.22, cell * 0.08, cell * 0.56);
        lit(0, 0, fx * ec + ec * 0.1, fy * ec + ec * 0.25, ec * 0.8, ec * 0.5, 0.35);
      }
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, y + cell * 0.78, size, cell * 0.04);
    }
  } else if (style === 'apt' || style === 'deco' || style === 'house') {
    g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, size, size);
    noise(g, size, size, size * 25, 0.06, rnd, 2);
    for (let fy = 0; fy < 8; fy++) {
      const y = fy * cell;
      if (style === 'deco') {
        g.fillStyle = 'rgba(120,110,105,0.22)'; g.fillRect(0, y + cell * 0.86, size, cell * 0.1);
      }
      for (let fx = 0; fx < 8; fx++) {
        const x = fx * cell;
        const skip = style === 'house' ? (fx % 2 === 1) : (style === 'deco' && fx % 4 === 3);
        if (skip) {
          if (style === 'deco') { g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + cell * 0.35, y, cell * 0.3, cell); }
          continue;
        }
        const ww = style === 'house' ? 0.5 : 0.56, wh = style === 'house' ? 0.5 : 0.56;
        const wx = x + cell * (1 - ww) / 2, wy = y + cell * 0.18;
        g.fillStyle = '#ffffff'; g.fillRect(wx - cell * 0.04, wy - cell * 0.04, cell * (ww + 0.08), cell * (wh + 0.08));
        const gr = g.createLinearGradient(wx, wy, wx, wy + cell * wh);
        gr.addColorStop(0, '#7894ad'); gr.addColorStop(1, '#2b3a4a');
        g.fillStyle = gr; g.fillRect(wx, wy, cell * ww, cell * wh);
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(wx + cell * ww / 2 - 1, wy, 2, cell * wh);
        if (style === 'house') {
          g.fillStyle = 'rgba(70,90,80,0.85)';
          g.fillRect(wx - cell * 0.16, wy - cell * 0.02, cell * 0.12, cell * (wh + 0.04));
          g.fillRect(wx + cell * ww + cell * 0.04, wy - cell * 0.02, cell * 0.12, cell * (wh + 0.04));
        }
        if (style === 'apt' && rnd() < 0.35) {
          g.fillStyle = 'rgba(80,80,85,0.9)'; g.fillRect(x + cell * 0.12, y + cell * 0.62, cell * 0.76, cell * 0.04);
          for (let k = 0; k < 7; k++) g.fillRect(x + cell * (0.14 + k * 0.11), y + cell * 0.62, 2, cell * 0.16);
          g.fillRect(x + cell * 0.12, y + cell * 0.78, cell * 0.76, cell * 0.03);
        }
        if (style === 'apt' && rnd() < 0.12) { g.fillStyle = '#d5d5d5'; g.fillRect(x + cell * 0.65, y + cell * 0.7, cell * 0.2, cell * 0.12); }
        lit(0, 0, (wx / cell) * ec, (wy / cell) * ec, ec * ww, ec * wh, style === 'house' ? 0.45 : 0.4);
      }
    }
  } else if (style === 'warehouse') {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += size / 64) {
      g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x, 0, size / 160, size);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + size / 128, 0, size / 200, size);
    }
    noise(g, size, size, size * 20, 0.08, rnd, 3);
    for (let fx = 0; fx < 8; fx += 2) {
      const x = fx * cell;
      g.fillStyle = '#34414c'; g.fillRect(x + cell * 0.2, cell * 0.3, cell * 1.6, cell * 0.35);
      lit(0, 0, (fx + 0.2) * ec, ec * 0.3, ec * 1.6, ec * 0.35, 0.3);
    }
    g.fillStyle = 'rgba(80,60,40,0.18)'; g.fillRect(0, size * 0.9, size, size * 0.1);
  }
  return { map: tex(c), emi: tex(ce) };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 255) * f), gg = Math.floor(((n >> 8) & 255) * f), b = Math.floor((n & 255) * f);
  return `rgb(${r},${gg},${b})`;
}

export function facadeTextures(q) {
  const big = q === 'low' ? 512 : 1024;
  return {
    glass: facadeBase(big, 'glass', 11),
    office: facadeBase(big, 'office', 12),
    apt: facadeBase(512, 'apt', 13),
    deco: facadeBase(512, 'deco', 14),
    warehouse: facadeBase(512, 'warehouse', 15),
    house: facadeBase(512, 'house', 16),
  };
}

// Erdgeschoss-Ladenzeile: 4 Läden pro Kachel (24 m)
export function storefrontTexture() {
  const [c, g] = cv(1024, 256);
  const [ce, ge] = cv(512, 128);
  const rnd = mulberry32(21);
  g.fillStyle = '#3b3631'; g.fillRect(0, 0, 1024, 256);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 512, 128);
  const awn = ['#d9435f', '#2a9d8f', '#e9a23b', '#3d5a80', '#8e44ad', '#e76f51', '#118ab2', '#06d6a0'];
  for (let i = 0; i < 4; i++) {
    const x = i * 256;
    g.fillStyle = '#d8d2c6'; g.fillRect(x, 0, 256, 256);
    // Schaufenster
    const gr = g.createLinearGradient(0, 80, 0, 240);
    gr.addColorStop(0, '#506a80'); gr.addColorStop(1, '#1d2731');
    g.fillStyle = gr; g.fillRect(x + 16, 86, 150, 150);
    g.fillStyle = '#20262c'; g.fillRect(x + 180, 96, 60, 140); // Tür
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 186, 102, 48, 70);
    // Markise
    const col = awn[Math.floor(rnd() * awn.length)];
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? col : '#f3efe6'; g.fillRect(x + 8 + k * 30, 40, 30, 34); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 8, 70, 240, 6);
    // Ladenschild
    g.fillStyle = '#1c1c1c'; g.fillRect(x + 20, 6, 216, 28);
    // Leuchtender Innenraum nachts
    const lc = ['#ffe2b0', '#fff5dd', '#c8f0ff', '#ffd0e6'][Math.floor(rnd() * 4)];
    ge.fillStyle = lc; ge.fillRect((x + 16) / 2, 86 / 2, 75, 75);
    ge.fillStyle = shade(lc, 0.7); ge.fillRect((x + 186) / 2, 102 / 2, 24, 35);
    const nc = ['#ff2e88', '#19e6ff', '#ffd23f', '#7cff6b', '#ff7b39'][Math.floor(rnd() * 5)];
    ge.fillStyle = nc; ge.fillRect((x + 30) / 2, 12 / 2, 98, 8);
    g.fillStyle = nc; g.globalAlpha = 0.6; g.fillRect(x + 30, 12, 196, 16); g.globalAlpha = 1;
  }
  return { map: tex(c), emi: tex(ce) };
}

export function roofTexture() {
  const [c, g] = cv(256);
  const rnd = mulberry32(31);
  g.fillStyle = '#6f6d69'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 9000, 0.25, rnd, 2);
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c);
}

export function tileRoofTexture() {
  const [c, g] = cv(256);
  g.fillStyle = '#b5543a'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 12, 256, 4);
    for (let x = (y / 16) % 2 ? 0 : 8; x < 256; x += 16) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, 8, 12); }
  }
  return tex(c);
}

export function grassTexture() {
  const [c, g] = cv(512);
  const rnd = mulberry32(41);
  g.fillStyle = '#4f8a3a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(40,90,30,${0.4 * rnd()})` : `rgba(140,190,80,${0.35 * rnd()})`;
    g.fillRect(rnd() * 512, rnd() * 512, 2, 3 + rnd() * 3);
  }
  return tex(c);
}

export function sandTexture() {
  const [c, g] = cv(512);
  const rnd = mulberry32(51);
  g.fillStyle = '#e8d3a5'; g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, 60000, 0.25, rnd, 1.5);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(150,120,80,${0.15 * rnd()})`; g.beginPath(); g.arc(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 0, 7); g.fill(); }
  return tex(c);
}

export function woodTexture() {
  const [c, g] = cv(256);
  const rnd = mulberry32(61);
  for (let i = 0; i < 16; i++) {
    const b = 0.75 + rnd() * 0.3;
    g.fillStyle = `rgb(${140 * b},${100 * b},${68 * b})`; g.fillRect(0, i * 16, 256, 15);
    g.fillStyle = 'rgba(40,25,15,0.8)'; g.fillRect(0, i * 16 + 15, 256, 1);
    for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(60,40,20,${0.2 * rnd()})`; g.fillRect(rnd() * 256, i * 16 + rnd() * 14, 20 + rnd() * 50, 1); }
  }
  return tex(c);
}

export function concreteTexture() {
  const [c, g] = cv(256);
  const rnd = mulberry32(71);
  g.fillStyle = '#8f8d88'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 12000, 0.2, rnd, 2);
  return tex(c);
}

export function containerTexture() {
  const [c, g] = cv(256);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 12) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 4, 256); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 6, 0, 2, 256); }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, 256, 8); g.fillRect(0, 248, 256, 8);
  return tex(c);
}

// ------------------------------------------------------- Leuchtschild-Atlas
export const SIGN_WORDS = [
  ['HOTEL', '#ff2e88'], ['MOTEL', '#19e6ff'], ['BAR', '#ffd23f'], ['CLUB', '#b26bff'],
  ['DINER', '#ff5a5a'], ['TACOS', '#7cff6b'], ['PIZZA', '#ff9f1c'], ['24 H', '#19e6ff'],
  ['SOLERA', '#ff2e88'], ['PARADISE', '#00f5d4'], ['DANCE', '#f15bb5'], ['VELVET', '#ff2e88'],
  ['NEON FM', '#19e6ff'], ['KLINIK', '#ff4d4d'], ['SURF', '#ffd23f'], ['SUNSET PIER', '#ff9f1c'],
  ['GARAGE', '#ffd23f'], ['BANK', '#ffe08a'], ['POLIZEI', '#4d8bff'], ['WAFFEN', '#ff7b39'],
];
export function signAtlas() {
  const [c, g] = cv(1024, 1280);
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 1280);
  SIGN_WORDS.forEach(([w, col], i) => {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
    g.fillStyle = '#120a18'; g.fillRect(x + 4, y + 70, 248, 116);
    g.strokeStyle = col; g.lineWidth = 5; g.strokeRect(x + 12, y + 78, 232, 100);
    const fs = w.length > 9 ? 30 : w.length > 6 ? 38 : 56;
    g.font = `${fs}px "Russo One", Impact, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 18;
    g.fillStyle = col; g.fillText(w, x + 128, y + 130);
    g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.55; g.fillText(w, x + 128, y + 130); g.globalAlpha = 1;
  });
  return tex(c, { repeat: false });
}

export function billboardTexture() {
  const [c, g] = cv(1024, 512);
  const ads = [
    { bg: ['#ff7e5f', '#feb47b'], t1: 'VISIT', t2: 'PORT SOLERA', fg: '#2b1055' },
    { bg: ['#0f0c29', '#302b63'], t1: 'NEON FM', t2: '88.3', fg: '#19e6ff' },
    { bg: ['#11998e', '#38ef7d'], t1: 'FRESH', t2: 'JUICE', fg: '#ffffff' },
    { bg: ['#c31432', '#240b36'], t1: 'COLA', t2: 'ICE COLD', fg: '#ffd23f' },
  ];
  ads.forEach((a, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    const gr = g.createLinearGradient(x, y, x + 512, y + 256);
    gr.addColorStop(0, a.bg[0]); gr.addColorStop(1, a.bg[1]);
    g.fillStyle = gr; g.fillRect(x, y, 512, 256);
    g.fillStyle = a.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 54px "Russo One", Impact, sans-serif'; g.fillText(a.t1, x + 256, y + 90);
    g.font = 'bold 70px "Russo One", Impact, sans-serif'; g.fillText(a.t2, x + 256, y + 170);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.strokeRect(x + 8, y + 8, 496, 240);
  });
  return tex(c, { repeat: false });
}

// --------------------------------------------------------- Sprites/Decals
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, mid = null) {
  const [c, g] = cv(size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner);
  if (mid) gr.addColorStop(0.4, mid);
  gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return tex(c, { repeat: false });
}

export function markerTexture() {
  const [c, g] = cv(64, 256);
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0.9)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  return tex(c, { repeat: false });
}

export function smokeTexture() {
  const [c, g] = cv(128);
  const rnd = mulberry32(81);
  for (let i = 0; i < 18; i++) {
    const x = 34 + rnd() * 60, y = 34 + rnd() * 60, r = 18 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return tex(c, { repeat: false });
}

export function skidTexture() {
  const [c, g] = cv(64);
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 4) { g.fillStyle = `rgba(15,15,15,${0.5 + Math.random() * 0.3})`; g.fillRect(x, 0, 3, 64); }
  return tex(c);
}
