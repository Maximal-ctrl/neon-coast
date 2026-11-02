// Partikel, Explosionen, Leuchtspuren, Bremsspuren
import * as THREE from 'three';
import { G } from './state.js';
import * as TX from './textures.js';
import { rand, clamp } from './utils.js';

const PVERT = /* glsl */`
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC;
uniform float scale;
void main(){
  vA = alpha; vC = pcolor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(size * scale / max(0.5, -mv.z), 400.0);
  gl_Position = projectionMatrix * mv;
}`;
const PFRAG = /* glsl */`
uniform sampler2D map;
varying float vA; varying vec3 vC;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC * t.rgb, t.a * vA);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class ParticleSystem {
  constructor(scene, n, map, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { map: { value: map }, scale: { value: 600 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PVERT, fragmentShader: PFRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    scene.add(this.points);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, gg, b, alpha = 1, grav = 0, grow = 0, drag = 0) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i3] = r; this.col[i3 + 1] = gg; this.col[i3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.a0[i] = alpha; this.alpha[i] = alpha;
    this.grav[i] = grav; this.grow[i] = grow; this.drag[i] = drag;
  }
  update(dt) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const i3 = i * 3;
      const d = 1 - this.drag[i] * dt;
      this.vel[i3] *= d; this.vel[i3 + 2] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5) * (t < 0 ? 0 : 1);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.alpha.needsUpdate = true; a.size.needsUpdate = true; a.pcolor.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    const glow = TX.radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64, 'rgba(255,255,255,0.5)');
    this.add = new ParticleSystem(scene, 900, glow, true);
    this.alpha = new ParticleSystem(scene, 900, TX.smokeTexture(), false);
    this.flash = new THREE.PointLight(0xffaa55, 0, 40, 1.6);
    scene.add(this.flash);
    this.flashT = 0;
    // Leuchtspuren
    this.tracerN = 48;
    this.tracerPos = new Float32Array(this.tracerN * 6);
    this.tracerCol = new Float32Array(this.tracerN * 6);
    this.tracerLife = new Float32Array(this.tracerN);
    this.tracerCursor = 0;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    // Bremsspuren
    this.skidN = 700;
    this.skidPos = new Float32Array(this.skidN * 4 * 3);
    this.skidAlpha = new Float32Array(this.skidN * 4);
    const idx = [];
    for (let k = 0; k < this.skidN; k++) { const b = k * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('alpha', new THREE.BufferAttribute(this.skidAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    sg.setIndex(idx);
    this.skidMat = new THREE.ShaderMaterial({
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA); }',
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.skids = new THREE.Mesh(sg, this.skidMat);
    this.skids.frustumCulled = false;
    this.skids.renderOrder = 1;
    scene.add(this.skids);
    this.skidCursor = 0;
    this.skidDirty = false;
    this.shakeAmt = 0;
  }

  setScale(h, fov) {
    const s = h / (2 * Math.tan((fov * Math.PI) / 360));
    this.add.uniforms.scale.value = s;
    this.alpha.uniforms.scale.value = s;
  }

  smoke(x, y, z, n = 1, dark = 0.4) {
    for (let k = 0; k < n; k++) {
      const c = dark + rand(-0.05, 0.05);
      this.alpha.emit(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), rand(-0.5, 0.5), rand(1.2, 2.5), rand(-0.5, 0.5), rand(1.2, 2.2), rand(1.0, 1.8), c, c, c, 0.55, -0.3, 2.2, 0.6);
    }
  }
  dust(x, y, z, n = 6, col = [0.75, 0.68, 0.55]) {
    for (let k = 0; k < n; k++) {
      this.alpha.emit(x + rand(-1, 1), y + 0.2, z + rand(-1, 1), rand(-2, 2), rand(0.3, 1.2), rand(-2, 2), rand(0.6, 1.2), rand(0.8, 1.6), col[0], col[1], col[2], 0.45, 0, 2.0, 1.5);
    }
  }
  tireSmoke(x, y, z, amt) {
    if (Math.random() > amt) return;
    this.alpha.emit(x, y + 0.25, z, rand(-0.6, 0.6), rand(0.4, 1.0), rand(-0.6, 0.6), rand(0.8, 1.5), rand(0.7, 1.2), 0.85, 0.85, 0.85, 0.35, -0.1, 2.4, 1.2);
  }
  fire(x, y, z, n = 1) {
    for (let k = 0; k < n; k++) {
      this.add.emit(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), rand(-0.4, 0.4), rand(1.5, 3.5), rand(-0.4, 0.4), rand(0.35, 0.7), rand(0.8, 1.5), 1.0, rand(0.35, 0.6), 0.08, 0.9, -1, -0.8, 0.5);
    }
  }
  sparks(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) {
      this.add.emit(x, y, z, rand(-6, 6), rand(1, 7), rand(-6, 6), rand(0.25, 0.6), rand(0.12, 0.25), 1.0, rand(0.6, 0.9), 0.3, 1, 14, 0, 0.5);
    }
  }
  impact(x, y, z, kind = 'dust') {
    if (kind === 'metal') this.sparks(x, y, z, 6);
    else for (let k = 0; k < 4; k++) this.alpha.emit(x, y, z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(0.3, 0.6), rand(0.25, 0.5), 0.6, 0.58, 0.55, 0.7, 3, 1.2, 1);
  }
  splash(x, y, z, n = 20) {
    for (let k = 0; k < n; k++) this.alpha.emit(x + rand(-1, 1), y + 0.1, z + rand(-1, 1), rand(-3, 3), rand(3, 8), rand(-3, 3), rand(0.6, 1.2), rand(0.5, 1.2), 0.9, 0.95, 1.0, 0.8, 14, 1.0, 0.5);
  }
  muzzle(x, y, z) {
    this.add.emit(x, y, z, 0, 0, 0, 0.06, 0.9, 1.0, 0.85, 0.5, 1, 0, 0, 0);
    this.light(x, y, z, 6, 0.06, 0xffcc88);
  }
  light(x, y, z, intensity, dur, color = 0xffaa55) {
    this.flash.position.set(x, y, z);
    this.flash.color.setHex(color);
    this.flash.intensity = Math.max(this.flash.intensity, intensity * 40);
    this.flashDecay = this.flash.intensity / Math.max(0.01, dur);
  }
  explosion(x, y, z, scale = 1) {
    for (let k = 0; k < 70 * scale; k++) {
      const a = rand(0, Math.PI * 2), sp = rand(2, 12) * scale, up = rand(1, 9) * scale;
      this.add.emit(x, y, z, Math.cos(a) * sp, up, Math.sin(a) * sp, rand(0.5, 1.1), rand(2.5, 4.5) * scale, 1.0, rand(0.4, 0.75), rand(0.05, 0.2), 1, 2, 1.5, 2.5);
    }
    for (let k = 0; k < 40 * scale; k++) {
      const a = rand(0, Math.PI * 2), sp = rand(1, 6) * scale;
      const c = rand(0.08, 0.25);
      this.alpha.emit(x, y + rand(0, 2), z, Math.cos(a) * sp, rand(2, 6), Math.sin(a) * sp, rand(2, 4), rand(3, 5) * scale, c, c, c, 0.7, -0.5, 2.5, 1.2);
    }
    this.sparks(x, y, z, 40);
    this.light(x, y + 2, z, 30, 0.6, 0xff8833);
    G.audio.explosion(x, z);
    const d = Math.hypot(G.camera.position.x - x, G.camera.position.z - z);
    G.cam.shake(clamp(1.4 - d / 60, 0, 1.2));
  }
  tracer(x0, y0, z0, x1, y1, z1, col = [1, 0.85, 0.5]) {
    const i = this.tracerCursor; this.tracerCursor = (i + 1) % this.tracerN;
    const p = this.tracerPos, c = this.tracerCol, o = i * 6;
    // nur ein Teilstück zeichnen
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const L = Math.hypot(dx, dy, dz) || 1;
    const seg = Math.min(L, 6), s0 = Math.min(0.6, L * 0.1);
    p[o] = x0 + dx / L * s0; p[o + 1] = y0 + dy / L * s0; p[o + 2] = z0 + dz / L * s0;
    p[o + 3] = x0 + dx / L * (s0 + seg); p[o + 4] = y0 + dy / L * (s0 + seg); p[o + 5] = z0 + dz / L * (s0 + seg);
    for (let k = 0; k < 6; k += 3) { c[o + k] = col[0]; c[o + k + 1] = col[1]; c[o + k + 2] = col[2]; }
    this.tracerLife[i] = 0.08;
    this.tracerVel = this.tracerVel || new Float32Array(this.tracerN * 3);
    this.tracerVel[i * 3] = dx / L * 300; this.tracerVel[i * 3 + 1] = dy / L * 300; this.tracerVel[i * 3 + 2] = dz / L * 300;
    this.tracerEnd = this.tracerEnd || new Float32Array(this.tracerN);
    this.tracerEnd[i] = L;
    this.tracerTrav = this.tracerTrav || new Float32Array(this.tracerN);
    this.tracerTrav[i] = s0 + seg;
  }
  skid(ax, az, bx, bz, y, w, alpha) {
    const i = this.skidCursor; this.skidCursor = (i + 1) % this.skidN;
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.05 || L > 4) return;
    const nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const p = this.skidPos, o = i * 12, yy = y + 0.04;
    p[o] = ax - nx; p[o + 1] = yy; p[o + 2] = az - nz;
    p[o + 3] = bx - nx; p[o + 4] = yy; p[o + 5] = bz - nz;
    p[o + 6] = bx + nx; p[o + 7] = yy; p[o + 8] = bz + nz;
    p[o + 9] = ax + nx; p[o + 10] = yy; p[o + 11] = az + nz;
    for (let k = 0; k < 4; k++) this.skidAlpha[i * 4 + k] = alpha;
    this.skidDirty = true;
  }

  update(dt) {
    this.add.update(dt);
    this.alpha.update(dt);
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - (this.flashDecay || 100) * dt);
    // Leuchtspuren bewegen
    let any = false;
    for (let i = 0; i < this.tracerN; i++) {
      if (this.tracerLife[i] <= 0) continue;
      any = true;
      const o = i * 6, v = this.tracerVel, i3 = i * 3;
      this.tracerTrav[i] += 300 * dt;
      if (this.tracerTrav[i] > this.tracerEnd[i] + 6) { this.tracerLife[i] = 0; }
      for (let k = 0; k < 6; k += 3) { this.tracerPos[o + k] += v[i3] * dt; this.tracerPos[o + k + 1] += v[i3 + 1] * dt; this.tracerPos[o + k + 2] += v[i3 + 2] * dt; }
      this.tracerLife[i] -= dt;
      if (this.tracerLife[i] <= 0) for (let k = 0; k < 6; k++) this.tracerCol[o + k] = 0;
    }
    if (any || this._tracerWas) { this.tracers.geometry.attributes.position.needsUpdate = true; this.tracers.geometry.attributes.color.needsUpdate = true; }
    this._tracerWas = any;
    // Bremsspuren verblassen langsam
    this.skidFade = (this.skidFade || 0) + dt;
    if (this.skidFade > 0.5) {
      this.skidFade = 0;
      for (let k = 0; k < this.skidAlpha.length; k++) if (this.skidAlpha[k] > 0) this.skidAlpha[k] = Math.max(0, this.skidAlpha[k] - 0.006);
      this.skidDirty = true;
    }
    if (this.skidDirty) {
      this.skids.geometry.attributes.position.needsUpdate = true;
      this.skids.geometry.attributes.alpha.needsUpdate = true;
      this.skidDirty = false;
    }
  }
}
