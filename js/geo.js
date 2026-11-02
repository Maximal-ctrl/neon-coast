// Werkzeug zum Zusammenbauen großer, zusammengeführter Geometrien (wenige Draw Calls)
import * as THREE from 'three';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class GeoBuilder {
  constructor(useColor = false) {
    this.p = []; this.n = []; this.u = []; this.c = []; this.i = [];
    this.useColor = useColor; this.vc = 0;
  }
  // a,b,c,d gegen den Uhrzeigersinn von außen gesehen (unten links, unten rechts, oben rechts, oben links)
  quad(a, b, c, d, uv = [0, 0, 1, 1], col = null, normal = null) {
    let nx, ny, nz;
    if (normal) { [nx, ny, nz] = normal; } else {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      _n.crossVectors(_a, _b).normalize();
      nx = _n.x; ny = _n.y; nz = _n.z;
    }
    const base = this.vc;
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); }
    this.u.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    if (this.useColor) { const cc = col || [1, 1, 1]; for (let k = 0; k < 4; k++) this.c.push(cc[0], cc[1], cc[2]); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.vc += 4;
  }
  tri(a, b, c, uv = [0, 0, 1, 0, 0.5, 1], col = null) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b).normalize();
    const base = this.vc;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(_n.x, _n.y, _n.z); }
    this.u.push(...uv);
    if (this.useColor) { const cc = col || [1, 1, 1]; for (let k = 0; k < 3; k++) this.c.push(cc[0], cc[1], cc[2]); }
    this.i.push(base, base + 1, base + 2);
    this.vc += 3;
  }
  // Quader. o: uw/vh = Meter pro Texturwiederholung, uo/vo = Versatz, col, top, bottom, sides
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const uw = o.uw || 1, vh = o.vh || 1, uo = o.uo || 0, vo = o.vo || 0, col = o.col || null;
    const v0 = y0 / vh + vo, v1 = y1 / vh + vo;
    const W = (x1 - x0) / uw, D = (z1 - z0) / uw;
    if (o.sides !== false) {
      // Süd (+z)
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [uo, v0, uo + W, v1], col, [0, 0, 1]);
      // Nord (-z)
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [uo + 0.37, v0, uo + 0.37 + W, v1], col, [0, 0, -1]);
      // Ost (+x)
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [uo + 0.61, v0, uo + 0.61 + D, v1], col, [1, 0, 0]);
      // West (-x)
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [uo + 0.13, v0, uo + 0.13 + D, v1], col, [-1, 0, 0]);
    }
    if (o.top !== false) {
      const tu = o.topScale || uw;
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [x0 / tu, -z1 / tu, x1 / tu, -z0 / tu], o.topCol || col, [0, 1, 0]);
    }
    if (o.bottom) {
      this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, 0, W, D], col, [0, -1, 0]);
    }
  }
  // Satteldach entlang x (firstAlongX) oder z
  gable(x0, z0, x1, z1, y0, rh, alongX, col = null, overhang = 0.4) {
    x0 -= overhang; z0 -= overhang; x1 += overhang; z1 += overhang;
    const yr = y0 + rh;
    if (alongX) {
      const zm = (z0 + z1) / 2;
      const L = (x1 - x0) / 3, S = Math.hypot(zm - z0, rh) / 3;
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, yr, zm], [x0, yr, zm], [0, 0, L, S], col);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, yr, zm], [x1, yr, zm], [0, 0, L, S], col);
      this.tri([x1, y0, z1], [x1, y0, z0], [x1, yr, zm], [0, 0, 1, 0, 0.5, 0.5], col);
      this.tri([x0, y0, z0], [x0, y0, z1], [x0, yr, zm], [0, 0, 1, 0, 0.5, 0.5], col);
    } else {
      const xm = (x0 + x1) / 2;
      const L = (z1 - z0) / 3, S = Math.hypot(xm - x0, rh) / 3;
      this.quad([x1, y0, z1], [x1, y0, z0], [xm, yr, z0], [xm, yr, z1], [0, 0, L, S], col);
      this.quad([x0, y0, z0], [x0, y0, z1], [xm, yr, z1], [xm, yr, z0], [0, 0, L, S], col);
      this.tri([x0, y0, z1], [x1, y0, z1], [xm, yr, z1], [0, 0, 1, 0, 0.5, 0.5], col);
      this.tri([x1, y0, z0], [x0, y0, z0], [xm, yr, z0], [0, 0, 1, 0, 0.5, 0.5], col);
    }
  }
  // Fremde Geometrie mit Matrix einfügen
  addGeometry(geo, matrix, col = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, gc = g.attributes.color;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.vc;
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(matrix);
      this.p.push(_v.x, _v.y, _v.z);
      if (nor) { _n.fromBufferAttribute(nor, k).applyMatrix3(nm).normalize(); this.n.push(_n.x, _n.y, _n.z); } else this.n.push(0, 1, 0);
      if (uv) this.u.push(uv.getX(k), uv.getY(k)); else this.u.push(0, 0);
      if (this.useColor) {
        if (col) this.c.push(col[0], col[1], col[2]);
        else if (gc) this.c.push(gc.getX(k), gc.getY(k), gc.getZ(k));
        else this.c.push(1, 1, 1);
      }
      this.i.push(base + k);
    }
    this.vc += pos.count;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.vc === 0; }
}

// Hilfsfunktion: Farbe als [r,g,b] linear aus Hex
const _c = new THREE.Color();
export function rgb(hex, mul = 1) {
  _c.setHex(hex);
  return [_c.r * mul, _c.g * mul, _c.b * mul];
}
export function rgbLerp(h1, h2, t) {
  const a = rgb(h1), b = rgb(h2);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Mehrere Geometrien (nicht indiziert) zusammenführen, optional mit Vertexfarben
export function mergeColored(list) {
  const b = new GeoBuilder(true);
  for (const { geo, matrix, col } of list) b.addGeometry(geo, matrix || new THREE.Matrix4(), col);
  return b.build();
}
