// Neon Coast – Feedback-Vermittler (Cloudflare Worker)
// Nimmt Vorschläge aus dem Spiel an und legt sie als GitHub-Issues (Label „feedback“) im Repository an.
// Der GitHub-Schlüssel liegt nur hier als geheime Variable GITHUB_TOKEN – nie im Spielcode.
// Einrichtung: docs/FEEDBACK-RELAY.md
//
//   GET    /feedback          -> offene Vorschläge (Liste)
//   POST   /feedback          -> neuer Vorschlag { kind, text, name, version }
//   DELETE /feedback/:nummer  -> Vorschlag entfernen (Issue wird geschlossen)

const REPO = 'Maximal-ctrl/neon-coast';
const ORIGINS = ['https://maximal-ctrl.github.io', 'http://localhost:8765', 'http://127.0.0.1:8765'];
const KINDS = { idee: '💡 Idee', bug: '🐞 Fehler', sonst: '💬 Sonstiges' };

const cors = (req) => {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
};
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });
const gh = (env, path, init = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'neon-coast-feedback', 'Content-Type': 'application/json', ...(init.headers || {}) },
});

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/feedback')) return json(req, { error: 'not found' }, 404);
    try {
      if (req.method === 'GET') {
        const r = await gh(env, '/issues?labels=feedback&state=open&per_page=100');
        const list = await r.json();
        return json(req, (Array.isArray(list) ? list : []).map((i) => {
          const m = /<!--nc:(\{.*?\})-->/.exec(i.body || '');
          const meta = m ? JSON.parse(m[1]) : {};
          return { id: i.number, created: i.created_at, kind: meta.kind || 'sonst', name: meta.name || null, version: meta.version || '', text: meta.text || i.title };
        }));
      }
      if (req.method === 'POST') {
        const b = await req.json().catch(() => ({}));
        const text = String(b.text || '').trim().slice(0, 1200), kind = KINDS[b.kind] ? b.kind : 'sonst';
        const name = b.name ? String(b.name).slice(0, 30) : null, version = String(b.version || '').slice(0, 20);
        if (text.length < 3) return json(req, { error: 'zu kurz' }, 400);
        const meta = JSON.stringify({ kind, name, version, text }).replace(/-->/g, '');
        const body = `${text}\n\n— ${name || 'Anonym'} · ${KINDS[kind]} · Neon Coast ${version}\n\n<!--nc:${meta}-->`;
        const r = await gh(env, '/issues', { method: 'POST', body: JSON.stringify({ title: `${KINDS[kind]}: ${text.replace(/\s+/g, ' ').slice(0, 70)}`, body, labels: ['feedback'] }) });
        return json(req, { ok: r.ok }, r.ok ? 201 : 502);
      }
      if (req.method === 'DELETE') {
        const n = parseInt(url.pathname.split('/')[2], 10);
        if (!n) return json(req, { error: 'nummer fehlt' }, 400);
        // nur Feedback-Issues dürfen geschlossen werden
        const cur = await (await gh(env, `/issues/${n}`)).json();
        if (!cur || !(cur.labels || []).some((l) => l.name === 'feedback')) return json(req, { error: 'kein feedback' }, 403);
        const r = await gh(env, `/issues/${n}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }) });
        return json(req, { ok: r.ok }, r.ok ? 200 : 502);
      }
      return json(req, { error: 'method' }, 405);
    } catch (e) { return json(req, { error: 'fehler' }, 500); }
  },
};
