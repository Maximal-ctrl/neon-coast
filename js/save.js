// Speichern & Laden (localStorage) – 3 Speicherplätze
import { G } from './state.js';

const OLD_KEY = 'neoncoast_save_v1';
const SKEY = 'neoncoast_settings_v1';
const SLOTS = 3;
const key = (n) => `neoncoast_slot_${n}`;

function store() { try { return window.localStorage; } catch (e) { return null; } }
function get(k) { const s = store(); try { return s ? JSON.parse(s.getItem(k)) : null; } catch (e) { return null; } }

// Alten Einzelspielstand in Platz 1 übernehmen
(function migrate() {
  const s = store(); if (!s) return;
  try { const old = s.getItem(OLD_KEY); if (old && !s.getItem(key(1))) s.setItem(key(1), old); if (old) s.removeItem(OLD_KEY); } catch (e) { /* */ }
})();

const hex = (c) => (c && c.getHex ? c.getHex() : c);

export const Save = {
  SLOTS,
  slot: 1,
  setSlot(n) { this.slot = n; },
  list() { const out = []; for (let n = 1; n <= SLOTS; n++) out.push({ n, data: get(key(n)) }); return out; },
  exists() { return this.list().some((s) => s.data); },
  latest() { let best = null; for (const s of this.list()) if (s.data && (!best || (s.data.t || 0) > (best.data.t || 0))) best = s; return best ? best.n : null; },
  write() {
    const s = store(); if (!s || !G.player) return false;
    const P = G.player, M = G.missions, L = P.look;
    const data = {
      v: 2, t: Date.now(),
      name: P.name, look: { skin: hex(L.skin), hair: hex(L.hair), hairStyle: P.hairStyle || 'short', shirt: hex(L.shirt), pants: hex(L.pants), shorts: !!P.shorts, shoes: hex(L.shoes), scale: L.scale },
      contacts: [...(P.contacts || [])],
      inventory: P.inventory || {}, garage: P.garage || [],
      money: P.money, health: P.health, armor: P.armor, ammo: { ...P.ammo, fists: 0 }, weapon: P.weapon,
      outfit: P.outfit || 0,
      progress: M.done.size, done: [...M.done], rewards: [...M.rewards], shells: [...M.shells], stunts: [...P.stuntsDone], taxi: M.taxiFares,
      stats: G.stats, time: G.timeOfDay,
      x3: { boats: P.boats || [], planes: P.planes || [], wmods: P.wmods || {}, props: P.props || [], casino: P.casinoStats || null, ach: P.ach || [] },
    };
    try { s.setItem(key(this.slot), JSON.stringify(data)); return true; } catch (e) { return false; }
  },
  read(n = this.slot) { return get(key(n)); },
  clear(n = this.slot) { const s = store(); try { s && s.removeItem(key(n)); } catch (e) { /* */ } },
  writeSettings() { const s = store(); try { s && s.setItem(SKEY, JSON.stringify(G.settings)); } catch (e) { /* */ } },
  readSettings() { const s = store(); try { const d = s && JSON.parse(s.getItem(SKEY)); if (d) Object.assign(G.settings, d); } catch (e) { /* */ } },
  apply(d) {
    const P = G.player, M = G.missions;
    P.money = d.money || 0; P.health = d.health || 100; P.armor = d.armor || 0;
    for (const k in d.ammo || {}) if (k !== 'fists') P.ammo[k] = d.ammo[k];
    P.weapon = P.ammo[d.weapon] > 0 ? d.weapon : 'fists';
    M.done = new Set(d.done || []); M.rewards = new Set(d.rewards || []);
    if (!d.done) M.progress = d.progress || 0;
    M.shells = new Set(d.shells || []);
    P.stuntsDone = new Set(d.stunts || []);
    M.taxiFares = d.taxi || 0;
    Object.assign(G.stats, d.stats || {});
    if (d.time != null) G.timeOfDay = d.time;
    P.outfit = d.outfit || 0;
    P.name = d.name || 'Leo';
    P.contacts = new Set(d.contacts || []);
    P.inventory = { ...(d.inventory || {}) };
    P.garage = [...(d.garage || [])];
    const x3 = d.x3 || {};
    P.boats = [...(x3.boats || [])]; P.planes = [...(x3.planes || [])]; P.wmods = { ...(x3.wmods || {}) }; P.props = [...(x3.props || [])]; P.casinoStats = x3.casino || null; P.ach = [...(x3.ach || [])];
    if (d.look) G.applyLook(d.look);
  },
};
