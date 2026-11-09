// Fotorealistische Oberflächen: echte PBR-Fototexturen (CC0, Poly Haven) werden per Shader
// als Detailschicht über die prozeduralen Materialien gelegt (Farbe, Normalen, Rauheit, AO).
import * as THREE from 'three';

const SETS = ['asphalt', 'pavement', 'plaster', 'concrete', 'grass', 'rock', 'sand', 'rooftile'];
export const TEX = {};

export async function loadPBR(renderer, quality) {
  if (quality === 'low') return false;
  const L = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = (url, srgb) => new Promise((res) => L.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, () => res(null)));
  await Promise.all(SETS.map(async (k) => {
    const [d, n, a] = await Promise.all([load(`assets/tex/${k}_d.jpg`, true), load(`assets/tex/${k}_n.jpg`, false), load(`assets/tex/${k}_a.jpg`, false)]);
    if (d && n && a) TEX[k] = { d, n, a };
  }));
  return Object.keys(TEX).length > 0;
}

let uid = 0;
// cfg: { a: setName, b?: setName, mode: 'xz' | 'box' | 'uv' | 'terrain', scale, scaleB, col (0..1), nrm (0..1), mask: 'metal' | null, split: 'lum' }
export function applyDetail(mat, cfg) {
  const A = TEX[cfg.a]; if (!A) return;
  const B = cfg.b ? TEX[cfg.b] : null;
  const id = ++uid;
  const defs = [`#define DT_MODE_${cfg.mode.toUpperCase()}`];
  if (B) defs.push('#define DT_B');
  if (cfg.mask === 'metal') defs.push('#define DT_MASK_METAL');
  if (cfg.split === 'lum') defs.push('#define DT_SPLIT_LUM');
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prevCompile) prevCompile(sh, r);
    sh.uniforms.dtAd = { value: A.d }; sh.uniforms.dtAn = { value: A.n }; sh.uniforms.dtAa = { value: A.a };
    if (B) { sh.uniforms.dtBd = { value: B.d }; sh.uniforms.dtBn = { value: B.n }; sh.uniforms.dtBa = { value: B.a }; }
    sh.uniforms.dtScale = { value: cfg.scale || 4 }; sh.uniforms.dtScaleB = { value: cfg.scaleB || cfg.scale || 4 };
    sh.uniforms.dtCol = { value: cfg.col ?? 0.75 }; sh.uniforms.dtNrm = { value: cfg.nrm ?? 0.8 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDtW; varying vec3 vDtN; varying vec2 vDtUv;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 dtw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          dtw = instanceMatrix * dtw;
        #endif
        dtw = modelMatrix * dtw;
        vDtW = dtw.xyz;
        vDtN = normalize(mat3(modelMatrix) * objectNormal);
        vDtUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${defs.join('\n')}
        varying vec3 vDtW; varying vec3 vDtN; varying vec2 vDtUv;
        uniform sampler2D dtAd, dtAn, dtAa;
        #ifdef DT_B
          uniform sampler2D dtBd, dtBn, dtBa;
        #endif
        uniform float dtScale, dtScaleB, dtCol, dtNrm;
        // dominante Achse -> UV & Tangentenbasis (Welt)
        void dtPlane(vec3 p, vec3 n, out vec2 uv, out vec3 T, out vec3 Bt, out vec3 N) {
          vec3 a = abs(n);
          if (a.y >= a.x && a.y >= a.z) { uv = vec2(p.x, -p.z); T = vec3(1.0, 0.0, 0.0); Bt = vec3(0.0, 0.0, -1.0); N = vec3(0.0, sign(n.y), 0.0); }
          else if (a.x >= a.z) { uv = vec2(-p.z * sign(n.x), p.y); T = vec3(0.0, 0.0, -sign(n.x)); Bt = vec3(0.0, 1.0, 0.0); N = vec3(sign(n.x), 0.0, 0.0); }
          else { uv = vec2(p.x * sign(n.z), p.y); T = vec3(sign(n.z), 0.0, 0.0); Bt = vec3(0.0, 1.0, 0.0); N = vec3(0.0, 0.0, sign(n.z)); }
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 gN = normalize(vDtN);
          vec2 duv; vec3 dT, dB, dN;
          #if defined(DT_MODE_XZ)
            duv = vec2(vDtW.x, -vDtW.z); dT = vec3(1.0, 0.0, 0.0); dB = vec3(0.0, 0.0, -1.0); dN = vec3(0.0, 1.0, 0.0);
          #elif defined(DT_MODE_UV)
            duv = vDtUv * 3.0; dT = normalize(cross(vec3(0.0, 1.0, 0.0), gN) + vec3(1e-4)); dB = normalize(cross(gN, dT)); dN = gN;
          #else
            dtPlane(vDtW, gN, duv, dT, dB, dN);
          #endif
          vec2 uvA = duv / dtScale;
          vec3 cA = texture2D(dtAd, uvA).rgb, avgA = textureLod(dtAd, vec2(0.5), 12.0).rgb;
          vec3 nA = texture2D(dtAn, uvA).rgb * 2.0 - 1.0;
          vec3 rA = texture2D(dtAa, uvA).rgb;
          float wB = 0.0;
          #ifdef DT_B
            #if defined(DT_SPLIT_LUM)
              float dl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); wB = smoothstep(0.16, 0.26, dl) * (1.0 - smoothstep(0.5, 0.62, dl));
            #elif defined(DT_MODE_TERRAIN)
              wB = smoothstep(0.86, 0.68, gN.y);
            #endif
            vec2 uvB = duv / dtScaleB;
            #ifdef DT_MODE_TERRAIN
              vec2 uvR; vec3 rT, rB, rN; dtPlane(vDtW, gN, uvR, rT, rB, rN); uvB = uvR / dtScaleB;
              if (wB > 0.01) { dT = mix(dT, rT, wB); dB = mix(dB, rB, wB); dN = normalize(mix(dN, rN, wB)); }
            #endif
            vec3 cB = texture2D(dtBd, uvB).rgb, avgB = textureLod(dtBd, vec2(0.5), 12.0).rgb;
            vec3 nB = texture2D(dtBn, uvB).rgb * 2.0 - 1.0;
            vec3 rB2 = texture2D(dtBa, uvB).rgb;
            cA = mix(cA / max(avgA, vec3(0.02)), cB / max(avgB, vec3(0.02)), wB);
            nA = normalize(mix(nA, nB, wB)); rA = mix(rA, rB2, wB);
          #else
            cA = cA / max(avgA, vec3(0.02));
          #endif
          float k = 1.0;
          #ifdef DT_MASK_METAL
            k = 1.0 - smoothstep(0.25, 0.55, metalnessFactor);
          #endif
          diffuseColor.rgb *= mix(vec3(1.0), clamp(cA, 0.0, 2.2), dtCol * k);
          diffuseColor.rgb *= mix(1.0, rA.r, 0.6 * k);
          roughnessFactor = mix(roughnessFactor, clamp(rA.g * 1.05, 0.05, 1.0), 0.75 * k);
          vec3 nw = normalize(dT * nA.x * dtNrm + dB * nA.y * dtNrm + dN * max(nA.z, 0.2));
          if (dot(nw, gN) < 0.0) nw = gN;
          normal = normalize(mix(normal, normalize((viewMatrix * vec4(nw, 0.0)).xyz), k));
        }`);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => prevKey() + '|dt' + defs.join(',') + id;
  mat.needsUpdate = true;
}
