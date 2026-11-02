// Gemeinsamer Spielzustand – wird von allen Modulen importiert.
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  world: null,
  player: null,
  input: null,
  hud: null,
  audio: null,
  cam: null,
  effects: null,
  crowd: null,
  peds: null,
  traffic: null,
  police: null,
  missions: null,
  vehicles: [],
  time: 0,          // Echtzeit seit Start (s)
  dt: 0,
  timeOfDay: 17.5,  // Spielzeit in Stunden
  timeScale: 1 / 45, // Spielstunden pro Echtsekunde * 3600 -> 1 Spieltag = 18 Minuten
  state: 'loading', // loading | title | playing | paused | map | cutscene | wasted
  isTouch: false,
  quality: 'medium',
  settings: {
    quality: 'auto',
    musicVol: 0.6,
    sfxVol: 0.8,
    sensitivity: 1.0,
    invertY: false,
    showFps: false,
  },
  stats: {
    playTime: 0,
    distanceDriven: 0,
    distanceWalked: 0,
    carsStolen: 0,
    shotsFired: 0,
    copsEvaded: 0,
    stunts: 0,
    bestSpeed: 0,
  },
};
