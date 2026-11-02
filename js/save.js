// Speichern & Laden (localStorage)
import { G } from './state.js';

const KEY = 'neoncoast_save_v1';
const SKEY = 'neoncoast_settings_v1';

function store() { try { return window.localStorage; } catch (e) { return null; } }

export const Save = {
  exists() { const s = store(); try { return !!(s && s.getItem(KEY)); } catch (e) { return false; } },
  write() {
    const s = store(); if (!s || !G.player) return false;
    const P = G.player, M = G.missions;
    const data = {
      v: 1, t: Date.now(),
      money: P.money, health: P.health, armor: P.armor, ammo: { ...P.ammo, fists: 0 }, weapon: P.weapon,
      outfit: P.outfit || 0,
      progress: M.progress, shells: [...M.shells], stunts: [...P.stuntsDone], taxi: M.taxiFares,
      stats: G.stats, time: G.timeOfDay,
    };
    try { s.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  },
  read() {
    const s = store(); if (!s) return null;
    try { return JSON.parse(s.getItem(KEY)); } catch (e) { return null; }
  },
  clear() { const s = store(); try { s && s.removeItem(KEY); } catch (e) { /* */ } },
  writeSettings() { const s = store(); try { s && s.setItem(SKEY, JSON.stringify(G.settings)); } catch (e) { /* */ } },
  readSettings() { const s = store(); try { const d = s && JSON.parse(s.getItem(SKEY)); if (d) Object.assign(G.settings, d); } catch (e) { /* */ } },
  apply(d) {
    const P = G.player, M = G.missions;
    P.money = d.money || 0; P.health = d.health || 100; P.armor = d.armor || 0;
    for (const k in d.ammo || {}) if (k !== 'fists') P.ammo[k] = d.ammo[k];
    P.weapon = P.ammo[d.weapon] > 0 ? d.weapon : 'fists';
    M.progress = d.progress || 0;
    M.shells = new Set(d.shells || []);
    P.stuntsDone = new Set(d.stunts || []);
    M.taxiFares = d.taxi || 0;
    Object.assign(G.stats, d.stats || {});
    if (d.time != null) G.timeOfDay = d.time;
    P.outfit = d.outfit || 0;
  },
};
