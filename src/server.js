import express from 'express';
import { getWatchesList, addWatch, removeWatch, updateWatch, getWatchByIndex } from './db/database.js';
import { LOCATIONS_LIST, CATEGORIES_LIST } from './constants.js';

/**
 * Skapar och startar Express-servern.
 * @param {number} port
 * @param {{ onManualSearch: () => Promise<{totalNew: number}> }} callbacks
 */
export function startServer(port, callbacks) {
  const app = express();
  app.use(express.json());

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), activeWatches: getWatchesList().length });
  });

  // ── REST API ───────────────────────────────────────────────────────────────
  app.get('/api/watches', (_req, res) => {
    res.json(getWatchesList());
  });

  app.post('/api/watches', (req, res) => {
    const { query, max_price, min_price, platforms } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query krävs' });
    const id = addWatch(query.trim(), max_price || null, min_price || null, platforms || 'blocket');
    res.json({ id });
  });

  app.delete('/api/watches/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const ok = removeWatch(id);
    if (!ok) return res.status(404).json({ error: 'Bevakning hittades inte' });
    res.json({ ok: true });
  });

  app.patch('/api/watches/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const allowed = ['location', 'ad_type', 'exclude_words', 'sort_order', 'max_price', 'min_price', 'platforms'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (updates.length === 0) return res.status(400).json({ error: 'Inga giltiga fält' });
    for (const [field, value] of updates) {
      updateWatch(id, field, value === '' ? null : value);
    }
    res.json({ ok: true });
  });

  app.post('/api/search', async (_req, res) => {
    try {
      const result = await callbacks.onManualSearch();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/constants', (_req, res) => {
    res.json({ locations: LOCATIONS_LIST, categories: CATEGORIES_LIST });
  });

  // ── Admin UI ───────────────────────────────────────────────────────────────
  app.get('/admin', (_req, res) => {
    res.send(adminHtml());
  });

  app.listen(port, () => {
    console.log(`[Server] Lyssnar på port ${port} — Admin: http://localhost:${port}/admin`);
  });

  return app;
}

function adminHtml() {
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Begagnat Monitor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f5f5f5; color: #222; }
  header { background: #25d366; color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 1.2rem; }
  main { max-width: 900px; margin: 24px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.1); padding: 20px; margin-bottom: 20px; }
  h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: #444; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #eee; color: #666; font-weight: 600; }
  td { padding: 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 4px; padding: 2px 7px; font-size: .75rem; }
  .badge.sell { background: #e3f2fd; color: #1565c0; }
  .badge.buy  { background: #fff3e0; color: #e65100; }
  button { cursor: pointer; border: none; border-radius: 6px; padding: 7px 14px; font-size: .85rem; font-weight: 500; }
  .btn-primary { background: #25d366; color: #fff; }
  .btn-primary:hover { background: #1ebe5d; }
  .btn-danger  { background: #ffebee; color: #c62828; }
  .btn-danger:hover  { background: #ffcdd2; }
  .btn-edit    { background: #f5f5f5; color: #333; }
  .btn-edit:hover    { background: #eee; }
  .btn-search  { background: #fff; color: #25d366; border: 2px solid #25d366; }
  .btn-search:hover  { background: #f0fdf4; }
  .actions { display: flex; gap: 6px; }
  form.add-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  form.add-form .full { grid-column: 1 / -1; }
  label { display: block; font-size: .85rem; color: #555; margin-bottom: 4px; }
  input, select { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: .9rem; }
  input:focus, select:focus { outline: none; border-color: #25d366; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #333; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: .9rem; opacity: 0; transition: opacity .3s; pointer-events: none; }
  .toast.show { opacity: 1; }
  .empty { color: #999; font-size: .9rem; padding: 20px 0; text-align: center; }
  dialog { border: none; border-radius: 10px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,.2); }
  dialog h3 { margin-bottom: 16px; }
  dialog form { display: grid; gap: 12px; }
  dialog .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  #search-result { font-size: .9rem; color: #555; margin-left: 12px; }
</style>
</head>
<body>
<header>
  <h1>🔍 Begagnat Monitor</h1>
  <div style="display:flex;align-items:center;gap:12px">
    <span id="search-result"></span>
    <button class="btn-search" onclick="manualSearch()">Sök nu</button>
  </div>
</header>
<main>
  <div class="card">
    <h2>Lägg till bevakning</h2>
    <form class="add-form" onsubmit="addWatch(event)">
      <div class="full">
        <label>Sökterm *</label>
        <input id="new-query" placeholder="t.ex. Yamaha utombordare" required>
      </div>
      <div>
        <label>Maxpris (kr)</label>
        <input id="new-max" type="number" min="0" placeholder="t.ex. 50000">
      </div>
      <div>
        <label>Minpris (kr)</label>
        <input id="new-min" type="number" min="0" placeholder="t.ex. 1000">
      </div>
      <div>
        <label>Region</label>
        <select id="new-location">
          <option value="">Hela Sverige</option>
        </select>
      </div>
      <div>
        <label>Annonstyp</label>
        <select id="new-adtype">
          <option value="all">Alla</option>
          <option value="sell">Bara säljes</option>
          <option value="buy">Bara köpes</option>
        </select>
      </div>
      <div>
        <label>Plattformar</label>
        <select id="new-platforms">
          <option value="blocket">Blocket</option>
          <option value="tradera">Tradera</option>
          <option value="blocket,tradera">Blocket + Tradera</option>
        </select>
      </div>
      <div>
        <label>Exkludera ord (kommaseparerade)</label>
        <input id="new-exclude" placeholder="t.ex. köpes,sökes,reservdelar">
      </div>
      <div class="full" style="text-align:right">
        <button type="submit" class="btn-primary">Lägg till</button>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>Aktiva bevakningar</h2>
    <div id="watches-container"><div class="empty">Laddar...</div></div>
  </div>
</main>

<dialog id="edit-dialog">
  <h3>Ändra bevakning</h3>
  <form onsubmit="saveEdit(event)">
    <input type="hidden" id="edit-id">
    <div>
      <label>Sökterm</label>
      <input id="edit-query" readonly style="background:#f5f5f5;color:#999">
    </div>
    <div>
      <label>Maxpris (kr)</label>
      <input id="edit-max" type="number" min="0">
    </div>
    <div>
      <label>Minpris (kr)</label>
      <input id="edit-min" type="number" min="0">
    </div>
    <div>
      <label>Region</label>
      <select id="edit-location">
        <option value="">Hela Sverige</option>
      </select>
    </div>
    <div>
      <label>Annonstyp</label>
      <select id="edit-adtype">
        <option value="all">Alla</option>
        <option value="sell">Bara säljes</option>
        <option value="buy">Bara köpes</option>
      </select>
    </div>
    <div>
      <label>Plattformar</label>
      <select id="edit-platforms">
        <option value="blocket">Blocket</option>
        <option value="tradera">Tradera</option>
        <option value="blocket,tradera">Blocket + Tradera</option>
      </select>
    </div>
    <div>
      <label>Exkludera ord</label>
      <input id="edit-exclude" placeholder="köpes,sökes,reservdelar">
    </div>
    <div class="dialog-actions">
      <button type="button" class="btn-edit" onclick="document.getElementById('edit-dialog').close()">Avbryt</button>
      <button type="submit" class="btn-primary">Spara</button>
    </div>
  </form>
</dialog>

<div class="toast" id="toast"></div>

<script>
let locations = [];

async function init() {
  const { locations: locs } = await fetch('/api/constants').then(r => r.json());
  locations = locs;
  const opts = locs.map(l => \`<option value="\${l.value}">\${l.label}</option>\`).join('');
  document.getElementById('new-location').insertAdjacentHTML('beforeend', opts);
  document.getElementById('edit-location').insertAdjacentHTML('beforeend', opts);
  loadWatches();
}

async function loadWatches() {
  const watches = await fetch('/api/watches').then(r => r.json());
  const el = document.getElementById('watches-container');
  if (watches.length === 0) {
    el.innerHTML = '<div class="empty">Inga aktiva bevakningar.</div>';
    return;
  }
  el.innerHTML = \`<table>
    <thead><tr>
      <th>Sökterm</th><th>Pris</th><th>Region</th><th>Typ</th><th>Plattformar</th><th>Exkluderar</th><th></th>
    </tr></thead>
    <tbody>\${watches.map(watchRow).join('')}</tbody>
  </table>\`;
}

function watchRow(w) {
  const price = [w.min_price && (w.min_price.toLocaleString('sv') + ' kr'), w.max_price && ('max ' + w.max_price.toLocaleString('sv') + ' kr')].filter(Boolean).join(' — ') || '—';
  const loc = locations.find(l => l.value === w.location)?.label ?? 'Hela Sverige';
  const adBadge = w.ad_type === 'sell' ? '<span class="badge sell">Säljes</span>' : w.ad_type === 'buy' ? '<span class="badge buy">Köpes</span>' : '<span class="badge">Alla</span>';
  const excl = w.exclude_words ? \`<span style="font-size:.8rem;color:#999">\${w.exclude_words}</span>\` : '—';
  const platforms = (w.platforms || 'blocket').split(',').map(p => p.trim()).join(' + ');
  return \`<tr>
    <td><strong>\${w.query}</strong></td>
    <td>\${price}</td>
    <td>\${loc}</td>
    <td>\${adBadge}</td>
    <td><span style="font-size:.8rem">\${platforms}</span></td>
    <td>\${excl}</td>
    <td><div class="actions">
      <button class="btn-edit" onclick='openEdit(\${JSON.stringify(w)})'>Ändra</button>
      <button class="btn-danger" onclick="deleteWatch(\${w.id}, '\${w.query.replace(/'/g,"\\\\'")}')">Ta bort</button>
    </div></td>
  </tr>\`;
}

async function addWatch(e) {
  e.preventDefault();
  const body = {
    query: document.getElementById('new-query').value.trim(),
    max_price: parseInt(document.getElementById('new-max').value) || null,
    min_price: parseInt(document.getElementById('new-min').value) || null,
    platforms: document.getElementById('new-platforms').value,
  };
  await fetch('/api/watches', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const loc = document.getElementById('new-location').value;
  const adtype = document.getElementById('new-adtype').value;
  const excl = document.getElementById('new-exclude').value.trim();
  // patch de extra fälten direkt
  const id = (await fetch('/api/watches').then(r=>r.json())).at(-1)?.id;
  if (id) {
    await fetch(\`/api/watches/\${id}\`, { method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ location: loc || null, ad_type: adtype, exclude_words: excl || null }) });
  }
  e.target.reset();
  loadWatches();
  toast('Bevakning tillagd!');
}

async function deleteWatch(id, query) {
  if (!confirm(\`Ta bort bevakning "\${query}"?\`)) return;
  await fetch(\`/api/watches/\${id}\`, { method: 'DELETE' });
  loadWatches();
  toast('Borttagen.');
}

function openEdit(w) {
  document.getElementById('edit-id').value = w.id;
  document.getElementById('edit-query').value = w.query;
  document.getElementById('edit-max').value = w.max_price ?? '';
  document.getElementById('edit-min').value = w.min_price ?? '';
  document.getElementById('edit-location').value = w.location ?? '';
  document.getElementById('edit-adtype').value = w.ad_type ?? 'all';
  document.getElementById('edit-platforms').value = w.platforms ?? 'blocket';
  document.getElementById('edit-exclude').value = w.exclude_words ?? '';
  document.getElementById('edit-dialog').showModal();
}

async function saveEdit(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  await fetch(\`/api/watches/\${id}\`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
    max_price: parseInt(document.getElementById('edit-max').value) || null,
    min_price: parseInt(document.getElementById('edit-min').value) || null,
    location: document.getElementById('edit-location').value || null,
    ad_type: document.getElementById('edit-adtype').value,
    platforms: document.getElementById('edit-platforms').value,
    exclude_words: document.getElementById('edit-exclude').value.trim() || null,
  })});
  document.getElementById('edit-dialog').close();
  loadWatches();
  toast('Sparat!');
}

async function manualSearch() {
  const el = document.getElementById('search-result');
  el.textContent = 'Söker...';
  const { totalNew } = await fetch('/api/search', { method: 'POST' }).then(r => r.json());
  el.textContent = totalNew > 0 ? \`\${totalNew} nya träffar!\` : 'Ingenting nytt.';
  setTimeout(() => el.textContent = '', 5000);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

init();
</script>
</body>
</html>`;
}
