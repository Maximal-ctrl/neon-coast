// Himmel, Wasser, Licht & Tag/Nacht-Zyklus
import * as THREE from 'three';
import { G } from './state.js';
import { clamp, lerp, smoothstep } from './utils.js';
import { WATER_Y, BEACH_X0 } from './config.js';

// Atmosphärischer Dunst: Entfernungsnebel + bodennaher Höhennebel (für alle Materialien)
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth; varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = dot(viewMatrix[1].xyz, mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
    float hzF = exp( - max( vFogY, 0.0 ) * 0.011 );
    float haze = ( 1.0 - exp( - vFogDepth * ( 1.1 / fogFar ) ) ) * mix( 0.3, 0.8, hzF );
    fogFactor = max( fogFactor, haze );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform vec3 groundColor;
uniform float night; uniform float time; uniform float clouds;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float h31(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h >= 0.0) {
    col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.45));
  } else {
    col = mix(horizon, groundColor, clamp(-h * 6.0, 0.0, 1.0));
  }
  float sd = max(dot(d, sunDir), 0.0);
  float sunVis = smoothstep(-0.12, 0.02, sunDir.y);
  col += sunColor * (pow(sd, 900.0) * 30.0 + pow(sd, 10.0) * 0.35 + pow(sd, 3.0) * 0.12 * (1.0 - clamp(h*2.0,0.0,1.0))) * sunVis;
  // Mond
  vec3 md = normalize(vec3(-sunDir.x, max(0.25, -sunDir.y), -sunDir.z + 0.3));
  float mdd = max(dot(d, md), 0.0);
  col += vec3(0.75, 0.82, 1.0) * (smoothstep(0.9993, 0.9996, mdd) * 1.4 + pow(mdd, 60.0) * 0.08) * night;
  // Sterne
  if (night > 0.01 && h > 0.0) {
    vec3 sp = floor(d * 420.0);
    float s = h31(sp);
    float tw = 0.6 + 0.4 * sin(time * 3.0 + s * 100.0);
    col += vec3(smoothstep(0.9975, 1.0, s)) * 1.6 * night * tw * smoothstep(0.0, 0.25, h);
  }
  // Wolken
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.12) * 1.3;
    float n = fbm(uv * 0.9 + vec2(time * 0.004, time * 0.002));
    float c = smoothstep(0.52 - clouds * 0.25, 0.85, n) * smoothstep(0.0, 0.18, h);
    vec3 cc = mix(horizon * 1.1 + sunColor * 0.25, vec3(1.0), 0.45 * (1.0 - night));
    cc = mix(cc, vec3(0.06, 0.07, 0.12), night * 0.85);
    cc += sunColor * pow(sd, 6.0) * 0.6 * sunVis;
    col = mix(col, cc, c * 0.85);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const WATER_VERT = /* glsl */`
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */`
uniform float time; uniform vec3 deepColor; uniform vec3 shallowColor; uniform vec3 zenith; uniform vec3 horizon;
uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
uniform float night; uniform float waterY;
varying vec3 vWorld;
float sandY(vec2 p){
  float s = p.x - ${BEACH_X0.toFixed(1)} + 6.0*sin(p.y*0.021) + 3.0*sin(p.y*0.067+1.7);
  float y = -0.05 - 0.0095*s - 0.06*max(0.0, s-80.0);
  float az = abs(p.y);
  if (az > 384.0) y -= (az-384.0)*0.06;
  return y;
}
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 p = vWorld.xz;
  float t = time;
  // Wellen-Normalen
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.3) * cos(dot(p, vec2(0.08, 0.03)) + t * 1.1) * 0.10;
  g += vec2(-0.4, 0.9) * cos(dot(p, vec2(-0.05, 0.11)) + t * 1.4) * 0.08;
  g += vec2(0.7, -0.7) * cos(dot(p, vec2(0.19, -0.17)) + t * 2.1) * 0.05;
  g += vec2(0.2, 1.0) * cos(dot(p, vec2(0.03, 0.31)) + t * 2.7) * 0.03;
  float n1 = vnoise(p * 0.35 + vec2(t*0.3, t*0.2)) - 0.5;
  float n2 = vnoise(p * 0.9 - vec2(t*0.25, -t*0.4)) - 0.5;
  g += vec2(n1, n2) * 0.18;
  vec3 N = normalize(vec3(g.x, 1.0, g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  N = normalize(mix(N, vec3(0.0,1.0,0.0), smoothstep(80.0, 600.0, dist) * 0.7));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = mix(horizon, zenith, clamp(R.y * 1.6, 0.0, 1.0));
  // Tiefe für Strandnähe
  float depth = 6.0;
  if (p.x > ${(BEACH_X0 - 2).toFixed(1)}) depth = waterY - sandY(p);
  float shallow = 1.0 - smoothstep(0.0, 2.2, depth);
  vec3 base = mix(deepColor, shallowColor, shallow);
  vec3 col = mix(base, refl, fres * (1.0 - shallow * 0.5));
  float spec = pow(max(dot(R, sunDir), 0.0), 220.0) * 6.0 * smoothstep(-0.05, 0.1, sunDir.y);
  col += sunColor * spec;
  // Mondglitzern
  vec3 md = normalize(vec3(-sunDir.x, max(0.25, -sunDir.y), -sunDir.z + 0.3));
  col += vec3(0.6, 0.7, 1.0) * pow(max(dot(R, md), 0.0), 300.0) * 2.0 * night;
  // Schaum an der Küste
  float foamBand = 1.0 - smoothstep(0.0, 0.35, depth);
  float waveFoam = smoothstep(0.55, 0.9, sin(depth * 9.0 - t * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(0.0, 0.9, depth));
  float foam = clamp(foamBand + waveFoam * 0.6, 0.0, 1.0) * (0.6 + 0.4 * vnoise(p * 2.0 + t));
  col = mix(col, vec3(0.95) * (1.0 - night * 0.75), foam * step(0.0, depth) * 0.85);
  float fogF = max(smoothstep(fogNear, fogFar, dist), (1.0 - exp(-dist * (1.1 / fogFar))) * 0.8);
  col = mix(col, fogColor, fogF);
  float alpha = mix(0.92, 0.55, shallow) ;
  alpha = mix(alpha, 1.0, fogF);
  alpha = max(alpha, foam * 0.9);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Farbtabellen nach Sonnenhöhe (Grad)
const KEYS = [
  { e: -20, zen: 0x03050f, hor: 0x0b1230, sun: 0x6f88ff, gnd: 0x05060a, hs: 0x4a5a98, hg: 0x22222e },
  { e: -8, zen: 0x0a1233, hor: 0x2b2450, sun: 0x8c7cff, gnd: 0x0a0a12, hs: 0x515a90, hg: 0x24222c },
  { e: -2, zen: 0x162a62, hor: 0xc0566e, sun: 0xff6b4a, gnd: 0x16121a, hs: 0x5a5080, hg: 0x2a1e22 },
  { e: 3, zen: 0x24489a, hor: 0xff8a50, sun: 0xff8a3c, gnd: 0x2a2228, hs: 0x8a7aa8, hg: 0x4a3a30 },
  { e: 12, zen: 0x3468b8, hor: 0xf2c9a4, sun: 0xffc287, gnd: 0x3a3a3a, hs: 0xb4bccb, hg: 0x6a5c48 },
  { e: 30, zen: 0x3a74c8, hor: 0xc4dcf2, sun: 0xffeed6, gnd: 0x4a4a48, hs: 0xbcc6d4, hg: 0x7a6e5a },
  { e: 90, zen: 0x2f6cc4, hor: 0xbcd8f2, sun: 0xfff5e6, gnd: 0x4a4a48, hs: 0xc0cad6, hg: 0x7a6e5a },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function lerpKey(e, field, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((e - a.e) / (b.e - a.e), 0, 1);
  _ca.setHex(a[field]); _cb.setHex(b[field]);
  return out.copy(_ca).lerp(_cb, t);
}

export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.night = 0;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.envTimer = 999;
    this.lastEnvHour = -10;

    const u = {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() }, sunDir: { value: this.sunDir },
      groundColor: { value: new THREE.Color() }, night: { value: 0 }, time: { value: 0 }, clouds: { value: 0.35 },
    };
    this.skyUniforms = u;
    this.skyMat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), this.skyMat);
    this.sky.renderOrder = -1000;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // Wasser
    this.waterUniforms = {
      time: { value: 0 }, deepColor: { value: new THREE.Color(0x0a3d5c) }, shallowColor: { value: new THREE.Color(0x2fc4c0) },
      zenith: u.zenith, horizon: u.horizon, sunDir: u.sunDir, sunColor: u.sunColor,
      fogColor: { value: new THREE.Color() }, fogNear: { value: 200 }, fogFar: { value: 900 }, night: u.night, waterY: { value: WATER_Y },
    };
    const wmat = new THREE.ShaderMaterial({ uniforms: this.waterUniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false, fog: false });
    const wgeo = new THREE.PlaneGeometry(7000, 7000, 1, 1);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, wmat);
    this.water.position.y = WATER_Y;
    this.water.renderOrder = 1;
    scene.add(this.water);

    // Licht
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.position.set(100, 200, 50);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.shadowSize = 0;
    this.setShadows(quality);

    scene.fog = new THREE.Fog(0x888888, 150, 900);

    // Szene für Umgebungs-Reflexionen
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), this.skyMat);
    this.envScene.add(envSky);
    this.envRT = null;
  }

  setShadows(q) {
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 0;
    this.shadowSize = size;
    const s = this.sun;
    if (size) {
      s.castShadow = true;
      s.shadow.mapSize.set(size, size);
      const r = q === 'high' ? 110 : 80;
      s.shadow.camera.left = -r; s.shadow.camera.right = r; s.shadow.camera.top = r; s.shadow.camera.bottom = -r;
      s.shadow.camera.near = 1; s.shadow.camera.far = 600;
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.6;
      s.shadow.camera.updateProjectionMatrix();
      if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
    } else {
      s.castShadow = false;
    }
  }

  setFogRange(near, far) {
    this.scene.fog.near = near; this.scene.fog.far = far;
    this.waterUniforms.fogNear.value = near; this.waterUniforms.fogFar.value = far;
  }

  update(dt, hour, focus) {
    const u = this.skyUniforms;
    u.time.value += dt;
    this.waterUniforms.time.value += dt;
    // Sonnenstand: Aufgang 6 Uhr (Osten, +x), Untergang 18 Uhr (Westen)
    const a = ((hour - 5.5) / 15) * Math.PI;
    const el = Math.sin(a);
    const elevDeg = Math.asin(clamp(el, -1, 1)) * 57.3 * 0.82;
    const elRad = elevDeg / 57.3;
    const az = Math.cos(a);
    this.sunDir.set(az * Math.cos(elRad), Math.sin(elRad), 0.35 * Math.cos(elRad)).normalize();
    const e = elevDeg;
    lerpKey(e, 'zen', u.zenith.value);
    lerpKey(e, 'hor', u.horizon.value);
    lerpKey(e, 'sun', u.sunColor.value);
    lerpKey(e, 'gnd', u.groundColor.value);
    lerpKey(e, 'hs', this.hemi.color);
    lerpKey(e, 'hg', this.hemi.groundColor);
    this.night = smoothstep(2, -9, e);
    u.night.value = this.night;

    // Sonne oder Mond als gerichtetes Licht
    const sunUp = e > -3;
    const lightDir = sunUp ? this.sunDir : new THREE.Vector3(-this.sunDir.x, Math.max(0.35, -this.sunDir.y), -this.sunDir.z + 0.3).normalize();
    this.sun.color.copy(u.sunColor.value);
    if (!sunUp) this.sun.color.setHex(0x8fa6ff);
    const sunI = sunUp ? lerp(0.6, 3.7, smoothstep(-3, 25, e)) : 0.7;
    this.sun.intensity = sunI;
    this.hemi.intensity = lerp(0.85, 1.25, this.night);
    // Schattenkamera folgt dem Fokus (mit Texel-Snapping)
    const fx = focus.x, fz = focus.z;
    const snap = this.shadowSize ? (this.sun.shadow.camera.right * 2) / this.shadowSize : 1;
    const sx = Math.round(fx / snap) * snap, sz = Math.round(fz / snap) * snap;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.position.set(sx + lightDir.x * 300, lightDir.y * 300, sz + lightDir.z * 300);

    // Nebel & Wasser
    const fog = this.scene.fog.color;
    fog.copy(u.horizon.value).lerp(u.zenith.value, 0.15);
    if (this.night > 0) fog.lerp(new THREE.Color(0x0a0c1c), this.night * 0.6);
    this.waterUniforms.fogColor.value.copy(fog);
    this.waterUniforms.deepColor.value.setHex(0x0a3d5c).lerp(new THREE.Color(0x020a14), this.night * 0.85);
    this.waterUniforms.shallowColor.value.setHex(0x2fc4c0).lerp(new THREE.Color(0x05222a), this.night * 0.85);

    this.renderer.toneMappingExposure = lerp(0.95, 1.0, this.night);
    // Innenräume: eigenes, warmes Raumlicht statt Tageslicht
    if (G.interior) {
      const k = G.interior.kind;
      const warm = { home: 0xffe6c8, shop: 0xf4f6ff, bank: 0xfff1dc, dealer: 0xffffff, club: 0xb48cff }[k] || 0xfff1dc;
      this.hemi.color.setHex(warm);
      this.hemi.groundColor.setHex(k === 'club' ? 0x2a1438 : 0x6a5c4c);
      this.hemi.intensity = { club: 0.9, home: 0.85, shop: 1.0 }[k] || 1.2;
      this.sun.intensity = 0.25;
      this.sun.color.setHex(0xffffff);
      this.renderer.toneMappingExposure = k === 'home' ? 0.88 : 1.0;
    }

    this.sky.position.copy(G.camera.position);

    // Reflexions-Umgebung periodisch erneuern
    if (Math.abs(hour - this.lastEnvHour) > 0.35 && Math.abs(hour - this.lastEnvHour) < 23.6 || !this.envRT) {
      this.lastEnvHour = hour;
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
      this.scene.environment = this.envRT.texture;
    }
  }
}
