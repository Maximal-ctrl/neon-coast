// Service Worker: Spiel offline verfügbar machen
const VERSION = 'neoncoast-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/style.css',
  './lib/three.module.js',
  './lib/addons/postprocessing/EffectComposer.js', './lib/addons/postprocessing/RenderPass.js', './lib/addons/postprocessing/UnrealBloomPass.js',
  './lib/addons/postprocessing/OutputPass.js', './lib/addons/postprocessing/ShaderPass.js', './lib/addons/postprocessing/MaskPass.js', './lib/addons/postprocessing/Pass.js',
  './lib/addons/shaders/CopyShader.js', './lib/addons/shaders/LuminosityHighPassShader.js', './lib/addons/shaders/OutputShader.js',
  './js/main.js', './js/state.js', './js/utils.js', './js/config.js', './js/textures.js', './js/geo.js', './js/env.js', './js/world.js',
  './js/models.js', './js/physics.js', './js/vehicle.js', './js/effects.js', './js/peds.js', './js/traffic.js', './js/police.js',
  './js/combat.js', './js/player.js', './js/camera.js', './js/input.js', './js/audio.js', './js/hud.js', './js/missions.js', './js/save.js',
  './fonts/russo-one.woff2', './fonts/rajdhani-500.woff2', './fonts/rajdhani-600.woff2', './fonts/rajdhani-700.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((res) => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
