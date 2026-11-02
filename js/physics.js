// 2D-Kollisionshilfen (Draufsicht x/z)

// SAT zwischen zwei Rechtecken. Achse u=(ux,uz), v=(-uz,ux), Halbachsen hu/hv.
// Ergebnis: Normale zeigt von A nach B, depth = Eindringtiefe.
const _res = { nx: 0, nz: 0, depth: 0 };
export function satRect(ax, az, aux, auz, ahu, ahv, bx, bz, bux, buz, bhu, bhv) {
  const avx = -auz, avz = aux, bvx = -buz, bvz = bux;
  const dx = bx - ax, dz = bz - az;
  let min = Infinity, nx = 0, nz = 0;
  const axes = [aux, auz, avx, avz, bux, buz, bvx, bvz];
  for (let k = 0; k < 8; k += 2) {
    const x = axes[k], z = axes[k + 1];
    const ra = ahu * Math.abs(aux * x + auz * z) + ahv * Math.abs(avx * x + avz * z);
    const rb = bhu * Math.abs(bux * x + buz * z) + bhv * Math.abs(bvx * x + bvz * z);
    const d = dx * x + dz * z;
    const o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (o < min) { min = o; const sg = d < 0 ? -1 : 1; nx = x * sg; nz = z * sg; }
  }
  _res.nx = nx; _res.nz = nz; _res.depth = min;
  return _res;
}

// Fahrzeug (OBB) gegen achsenparallele Box
export function vehVsBox(v, b) {
  const fx = Math.sin(v.h), fz = Math.cos(v.h);
  return satRect(v.x, v.z, fx, fz, v.hl, v.hw, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 1, 0, (b.x1 - b.x0) / 2, (b.z1 - b.z0) / 2);
}
export function vehVsVeh(a, b) {
  return satRect(a.x, a.z, Math.sin(a.h), Math.cos(a.h), a.hl, a.hw, b.x, b.z, Math.sin(b.h), Math.cos(b.h), b.hl, b.hw);
}

// Kreis gegen Fahrzeug: liefert {nx,nz,depth} mit Normale vom Fahrzeug weg
const _cr = { nx: 0, nz: 0, depth: 0, lu: 0 };
export function circleVsVeh(cx, cz, r, v) {
  const fx = Math.sin(v.h), fz = Math.cos(v.h);
  const rx = -fz, rz = fx;
  const dx = cx - v.x, dz = cz - v.z;
  const lu = dx * fx + dz * fz, lv = dx * rx + dz * rz;
  const qu = Math.max(-v.hl, Math.min(v.hl, lu)), qv = Math.max(-v.hw, Math.min(v.hw, lv));
  let ddx = lu - qu, ddz = lv - qv;
  let d2 = ddx * ddx + ddz * ddz;
  if (d2 > r * r) return null;
  if (d2 < 1e-6) {
    // Mittelpunkt im Rechteck
    const pu = v.hl - Math.abs(lu), pv = v.hw - Math.abs(lv);
    if (pu < pv) { ddx = Math.sign(lu) || 1; ddz = 0; _cr.depth = pu + r; }
    else { ddx = 0; ddz = Math.sign(lv) || 1; _cr.depth = pv + r; }
  } else {
    const d = Math.sqrt(d2);
    ddx /= d; ddz /= d; _cr.depth = r - d;
  }
  _cr.nx = ddx * fx + ddz * rx;
  _cr.nz = ddx * fz + ddz * rz;
  _cr.lu = lu;
  return _cr;
}

// Kreis gegen Box: Normale von Box weg
const _cb = { nx: 0, nz: 0, depth: 0 };
export function circleVsBox(cx, cz, r, b) {
  const qx = Math.max(b.x0, Math.min(b.x1, cx)), qz = Math.max(b.z0, Math.min(b.z1, cz));
  let dx = cx - qx, dz = cz - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 < 1e-8) {
    const l = cx - b.x0, rr = b.x1 - cx, t = cz - b.z0, bb = b.z1 - cz;
    const m = Math.min(l, rr, t, bb);
    if (m === l) { _cb.nx = -1; _cb.nz = 0; } else if (m === rr) { _cb.nx = 1; _cb.nz = 0; } else if (m === t) { _cb.nx = 0; _cb.nz = -1; } else { _cb.nx = 0; _cb.nz = 1; }
    _cb.depth = m + r;
    return _cb;
  }
  const d = Math.sqrt(d2);
  _cb.nx = dx / d; _cb.nz = dz / d; _cb.depth = r - d;
  return _cb;
}

// Strahl (3D) gegen achsenparallele Box -> t oder -1
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let tmin = 0, tmax = maxT;
  const ax = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Strahl gegen Fahrzeug (OBB mit Höhe) -> t oder -1
export function rayVeh(ox, oy, oz, dx, dy, dz, v, maxT) {
  const fx = Math.sin(v.h), fz = Math.cos(v.h), rx = -fz, rz = fx;
  const lox = ox - v.x, loz = oz - v.z;
  const b = { x0: -v.hl, x1: v.hl, y0: v.y, y1: v.y + v.height, z0: -v.hw, z1: v.hw };
  return rayBox(lox * fx + loz * fz, oy, lox * rx + loz * rz, dx * fx + dz * fz, dy, dx * rx + dz * rz, b, maxT);
}

// Strahl gegen vertikale Kapsel (Figur) -> t oder -1
export function rayChar(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, h, maxT) {
  const px = cx - ox, pz = cz - oz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const t = (px * dx + pz * dz) / a;
  if (t < 0 || t > maxT) return -1;
  const qx = ox + dx * t - cx, qz = oz + dz * t - cz;
  if (qx * qx + qz * qz > r * r) return -1;
  const y = oy + dy * t;
  if (y < cy || y > cy + h) return -1;
  return t;
}
