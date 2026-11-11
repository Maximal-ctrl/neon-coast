// Leistung: große zusammengeführte Geometrien in Kacheln teilen (Sichtfeld- und Schatten-Culling)
// und dynamische Auflösung für flüssige Bildraten (vor allem auf dem iPad)
import * as THREE from 'three';

// Teilt alle großen Meshes der Szene in Kacheln (cell × cell Meter). Kacheln hängen als Kinder
// am ursprünglichen Mesh, damit Sichtbarkeit/Material-Änderungen weiter wirken.
export function chunkScene(scene, cell = 260, minRadius = 300, minTris = 3000) {
  const cand = [];
  const geoUse = new Map();
  scene.traverse((o) => { if (o.isMesh && o.geometry) geoUse.set(o.geometry, (geoUse.get(o.geometry) || 0) + 1); });
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material)) return;
    const g = o.geometry;
    if (!g || !g.index || !g.attributes.position || geoUse.get(g) > 1 || g.morphAttributes.position) return;
    if (g.groups && g.groups.length > 1) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere.radius < minRadius || g.index.count / 3 < minTris) return;
    cand.push(o);
  });
  let made = 0;
  for (const o of cand) {
    const parts = splitGeometry(o.geometry, cell);
    if (parts.length < 2) continue;
    const old = o.geometry;
    o.geometry = parts[0];
    o.frustumCulled = true;
    for (let i = 1; i < parts.length; i++) {
      const m = new THREE.Mesh(parts[i], o.material);
      m.castShadow = o.castShadow; m.receiveShadow = o.receiveShadow;
      m.renderOrder = o.renderOrder; m.layers.mask = o.layers.mask;
      m.matrixAutoUpdate = false;
      m.onBeforeRender = o.onBeforeRender;
      o.add(m);
    }
    old.dispose();
    made += parts.length;
  }
  return { meshes: cand.length, chunks: made };
}

export function splitGeometry(g, cell) {
  const idx = g.index.array, pos = g.attributes.position.array;
  const buckets = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const key = Math.floor(cx / cell) * 65536 + Math.floor(cz / cell);
    let arr = buckets.get(key);
    if (!arr) buckets.set(key, (arr = []));
    arr.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (buckets.size < 2) return [g];
  const names = Object.keys(g.attributes);
  const out = [];
  for (const tri of buckets.values()) {
    const remap = new Map();
    const newIdx = new Uint32Array(tri.length);
    let n = 0;
    for (let i = 0; i < tri.length; i++) {
      let v = remap.get(tri[i]);
      if (v === undefined) { v = n++; remap.set(tri[i], v); }
      newIdx[i] = v;
    }
    const ng = new THREE.BufferGeometry();
    for (const name of names) {
      const A = g.attributes[name], sz = A.itemSize, src = A.array;
      const dst = new src.constructor(n * sz);
      for (const [o, v] of remap) for (let k = 0; k < sz; k++) dst[v * sz + k] = src[o * sz + k];
      ng.setAttribute(name, new THREE.BufferAttribute(dst, sz, A.normalized));
    }
    ng.setIndex(new THREE.BufferAttribute(n > 65535 ? newIdx : new Uint16Array(newIdx), 1));
    ng.computeBoundingSphere(); ng.computeBoundingBox();
    out.push(ng);
  }
  return out;
}

// Dynamische Auflösung: misst echte Bildzeiten und passt die Pixeldichte stufenweise an
export class DynRes {
  constructor(renderer, composer, onApply, min, max) {
    this.r = renderer; this.c = composer; this.onApply = onApply;
    this.min = min; this.max = max; this.cur = renderer.getPixelRatio();
    this.ema = 16.7; this.t = 0; this.cool = 4; this.enabled = true;
  }
  frame(ms) {
    if (!this.enabled) return;
    if (ms > 250) return; // Tab-Wechsel o. Ä.
    this.ema += (ms - this.ema) * 0.05;
    this.cool -= ms / 1000;
    if (this.cool > 0) return;
    let next = this.cur;
    if (this.ema > 24) next = Math.max(this.min, this.cur * (this.ema > 40 ? 0.8 : 0.9));
    else if (this.ema < 14.5 && this.cur < this.max) next = Math.min(this.max, this.cur * 1.08);
    if (Math.abs(next - this.cur) > 0.02) {
      this.cur = next;
      this.r.setPixelRatio(next);
      if (this.c) this.c.setPixelRatio(next);
      this.onApply();
      this.cool = next < this.cur ? 2 : 3;
      this.ema = 16.7;
      this.cool = 2.5;
    }
  }
}
