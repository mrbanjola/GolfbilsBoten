import express from 'express';
import { getWatchesList, addWatch, removeWatch, updateWatch, getAiSettings, updateAiSettings } from './db/database.js';
import { LOCATIONS_LIST, CATEGORIES_LIST } from './constants.js';

function normalizeAiSettings(body) {
  const settings = {};

  if ('enabled' in body) settings.enabled = Boolean(body.enabled);
  if ('model' in body) settings.model = String(body.model ?? '').trim();
  if ('system_prompt' in body) settings.system_prompt = String(body.system_prompt ?? '').trim();
  if ('global_rules' in body) settings.global_rules = String(body.global_rules ?? '').trim();
  if ('timeout_ms' in body) settings.timeout_ms = parseInt(body.timeout_ms, 10);
  if ('batch_size' in body) settings.batch_size = parseInt(body.batch_size, 10);

  return settings;
}

function validateAiSettings(settings) {
  if (settings.enabled) {
    if (!settings.model) return 'Model kravs nar AI-filtrering ar aktiverad.';
    if (!settings.system_prompt) return 'System prompt kravs nar AI-filtrering ar aktiverad.';
  }

  if ('timeout_ms' in settings && (!Number.isInteger(settings.timeout_ms) || settings.timeout_ms < 1000)) {
    return 'Timeout maste vara minst 1000 ms.';
  }

  if ('batch_size' in settings && (!Number.isInteger(settings.batch_size) || settings.batch_size < 1 || settings.batch_size > 25)) {
    return 'Batch size maste vara mellan 1 och 25.';
  }

  return null;
}

export function startServer(port, callbacks) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), activeWatches: getWatchesList().length });
  });

  app.get('/api/watches', (_req, res) => {
    res.json(getWatchesList());
  });

  app.post('/api/watches', (req, res) => {
    const { query, max_price, min_price, platforms, is_car } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query kravs' });
    const id = addWatch(query.trim(), max_price || null, min_price || null, platforms || 'blocket');
    if (is_car) updateWatch(id, 'is_car', 1);
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
    const allowed = ['location', 'ad_type', 'exclude_words', 'sort_order', 'max_price', 'min_price', 'platforms', 'is_car'];
    const updates = Object.entries(req.body).filter(([key]) => allowed.includes(key));
    if (updates.length === 0) return res.status(400).json({ error: 'Inga giltiga falt' });
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

  app.get('/api/settings/ai', (_req, res) => {
    res.json(getAiSettings());
  });

  app.patch('/api/settings/ai', (req, res) => {
    const incoming = normalizeAiSettings(req.body);
    const merged = { ...getAiSettings(), ...incoming };
    const error = validateAiSettings(merged);
    if (error) return res.status(400).json({ error });
    res.json(updateAiSettings(incoming));
  });

  app.get('/admin', (_req, res) => {
    res.send(adminHtml());
  });

  app.listen(port, () => {
    console.log(`[Server] Lyssnar pa port ${port} - Admin: http://localhost:${port}/admin`);
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
  header { background: #25d366; color: #fff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header h1 { font-size: 1.2rem; }
  main { max-width: 1000px; margin: 24px auto; padding: 0 16px; }
  .card { background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.1); padding: 20px; margin-bottom: 20px; }
  h2 { font-size: 1rem; font-weight: 600; margin-bottom: 16px; color: #444; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; font-size: .9rem; }
  th { text-align: left; padding: 8px 10px; border-bottom: 2px solid #eee; color: #666; font-weight: 600; }
  td { padding: 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 4px; padding: 2px 7px; font-size: .75rem; }
  .badge.sell { background: #e3f2fd; color: #1565c0; }
  .badge.buy { background: #fff3e0; color: #e65100; }
  button { cursor: pointer; border: none; border-radius: 6px; padding: 7px 14px; font-size: .85rem; font-weight: 500; }
  .btn-primary { background: #25d366; color: #fff; }
  .btn-primary:hover { background: #1ebe5d; }
  .btn-danger { background: #ffebee; color: #c62828; }
  .btn-danger:hover { background: #ffcdd2; }
  .btn-edit { background: #f5f5f5; color: #333; }
  .btn-edit:hover { background: #eee; }
  .btn-search { background: #fff; color: #25d366; border: 2px solid #25d366; }
  .btn-search:hover { background: #f0fdf4; }
  .actions { display: flex; gap: 6px; }
  form.add-form, form.ai-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  form.add-form .full, form.ai-form .full { grid-column: 1 / -1; }
  label { display: block; font-size: .85rem; color: #555; margin-bottom: 4px; }
  input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: .9rem; }
  textarea { min-height: 110px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #25d366; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #333; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: .9rem; opacity: 0; transition: opacity .3s; pointer-events: none; max-width: 360px; }
  .toast.show { opacity: 1; }
  .empty { color: #999; font-size: .9rem; padding: 20px 0; text-align: center; }
  dialog { border: none; border-radius: 10px; padding: 24px; max-width: 480px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,.2); }
  dialog h3 { margin-bottom: 16px; }
  dialog form { display: grid; gap: 12px; }
  dialog .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .hint { color: #666; font-size: .82rem; line-height: 1.4; }
  .toggle { display: flex; align-items: center; gap: 10px; }
  .toggle input { width: auto; }
  #search-result { font-size: .9rem; color: #f5fff8; }
  @media (max-width: 720px) {
    form.add-form, form.ai-form { grid-template-columns: 1fr; }
    header { align-items: flex-start; flex-direction: column; }
    .actions { flex-direction: column; }
  }
</style>
</head>
<body>
<header>
  <h1>Begagnat Monitor</h1>
  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <span id="search-result"></span>
    <button class="btn-search" onclick="manualSearch()">Sok nu</button>
  </div>
</header>
<main>
  <div class="card">
    <h2>Lagg till bevakning</h2>
    <form class="add-form" onsubmit="addWatch(event)">
      <div class="full">
        <label>Sokterm *</label>
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
          <option value="sell">Bara saljes</option>
          <option value="buy">Bara kopes</option>
        </select>
      </div>
      <div>
        <label>Plattformar</label>
        <select id="new-platforms">
          <option value="blocket">Blocket</option>
          <option value="tradera">Tradera</option>
          <option value="klaravik">Klaravik</option>
          <option value="blinto">Blinto</option>
          <option value="blocket,tradera">Blocket + Tradera</option>
          <option value="blocket,klaravik,blinto">Blocket + Klaravik + Blinto</option>
          <option value="blocket,tradera,klaravik,blinto">Alla</option>
        </select>
      </div>
      <div class="toggle" style="align-self:end;padding-bottom:8px">
        <input id="new-is-car" type="checkbox">
        <label for="new-is-car" style="margin:0">Blocket bilsokning</label>
      </div>
      <div>
        <label>Exkludera ord (kommaseparerade)</label>
        <input id="new-exclude" placeholder="t.ex. kopes,sokes,reservdelar">
      </div>
      <div class="full" style="text-align:right">
        <button type="submit" class="btn-primary">Lagg till</button>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>AI-filter</h2>
    <form class="ai-form" onsubmit="saveAiSettings(event)">
      <div class="full toggle">
        <input id="ai-enabled" type="checkbox">
        <label for="ai-enabled" style="margin:0">Aktivera Claude-baserad relevansfiltrering</label>
      </div>
      <div>
        <label>Model</label>
        <input id="ai-model" placeholder="t.ex. claude-sonnet-4-20250514">
      </div>
      <div>
        <label>Batch size</label>
        <input id="ai-batch-size" type="number" min="1" max="25">
      </div>
      <div>
        <label>Timeout (ms)</label>
        <input id="ai-timeout-ms" type="number" min="1000" step="1000">
      </div>
      <div class="full">
        <div class="hint">API-nyckeln redigeras inte har. Servern laser <code>CLAUDE_API_KEY</code> fran <code>.env</code>.</div>
      </div>
      <div class="full">
        <label>System prompt</label>
        <textarea id="ai-system-prompt" placeholder="Instruktioner som alltid skickas som system prompt till Claude"></textarea>
      </div>
      <div class="full">
        <label>Globala regler</label>
        <textarea id="ai-global-rules" placeholder="Projektregler som hjalper Claude att avgora relevans"></textarea>
      </div>
      <div class="full" style="text-align:right">
        <button type="submit" class="btn-primary">Spara AI-installningar</button>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>Aktiva bevakningar</h2>
    <div id="watches-container"><div class="empty">Laddar...</div></div>
  </div>
</main>

<dialog id="edit-dialog">
  <h3>Andra bevakning</h3>
  <form onsubmit="saveEdit(event)">
    <input type="hidden" id="edit-id">
    <div>
      <label>Sokterm</label>
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
        <option value="sell">Bara saljes</option>
        <option value="buy">Bara kopes</option>
      </select>
    </div>
    <div>
      <label>Plattformar</label>
      <select id="edit-platforms">
        <option value="blocket">Blocket</option>
        <option value="tradera">Tradera</option>
        <option value="klaravik">Klaravik</option>
        <option value="blinto">Blinto</option>
        <option value="blocket,tradera">Blocket + Tradera</option>
        <option value="blocket,klaravik,blinto">Blocket + Klaravik + Blinto</option>
        <option value="blocket,tradera,klaravik,blinto">Alla</option>
      </select>
    </div>
    <div class="toggle" style="align-self:end;padding-bottom:8px">
      <input id="edit-is-car" type="checkbox">
      <label for="edit-is-car" style="margin:0">Blocket bilsokning</label>
    </div>
    <div>
      <label>Exkludera ord</label>
      <input id="edit-exclude" placeholder="kopes,sokes,reservdelar">
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

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Begaran misslyckades');
  }
  return data;
}

async function init() {
  const constants = await api('/api/constants');
  locations = constants.locations;
  const opts = locations.map((location) => \`<option value="\${location.value}">\${location.label}</option>\`).join('');
  document.getElementById('new-location').insertAdjacentHTML('beforeend', opts);
  document.getElementById('edit-location').insertAdjacentHTML('beforeend', opts);
  await Promise.all([loadWatches(), loadAiSettings()]);
}

async function loadAiSettings() {
  const settings = await api('/api/settings/ai');
  document.getElementById('ai-enabled').checked = Boolean(settings.enabled);
  document.getElementById('ai-model').value = settings.model || '';
  document.getElementById('ai-batch-size').value = settings.batch_size ?? '';
  document.getElementById('ai-timeout-ms').value = settings.timeout_ms ?? '';
  document.getElementById('ai-system-prompt').value = settings.system_prompt || '';
  document.getElementById('ai-global-rules').value = settings.global_rules || '';
}

async function saveAiSettings(event) {
  event.preventDefault();
  const body = {
    enabled: document.getElementById('ai-enabled').checked,
    model: document.getElementById('ai-model').value.trim(),
    batch_size: parseInt(document.getElementById('ai-batch-size').value, 10) || 8,
    timeout_ms: parseInt(document.getElementById('ai-timeout-ms').value, 10) || 15000,
    system_prompt: document.getElementById('ai-system-prompt').value.trim(),
    global_rules: document.getElementById('ai-global-rules').value.trim(),
  };
  await api('/api/settings/ai', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  toast('AI-installningar sparade.');
}

async function loadWatches() {
  const watches = await api('/api/watches');
  const el = document.getElementById('watches-container');
  if (watches.length === 0) {
    el.innerHTML = '<div class="empty">Inga aktiva bevakningar.</div>';
    return;
  }
  el.innerHTML = \`<table>
    <thead><tr>
      <th>Sokterm</th><th>Pris</th><th>Region</th><th>Typ</th><th>Plattformar</th><th>Exkluderar</th><th></th>
    </tr></thead>
    <tbody>\${watches.map(watchRow).join('')}</tbody>
  </table>\`;
}

function watchRow(watch) {
  const price = [
    watch.min_price && (watch.min_price.toLocaleString('sv') + ' kr'),
    watch.max_price && ('max ' + watch.max_price.toLocaleString('sv') + ' kr')
  ].filter(Boolean).join(' - ') || '-';
  const loc = locations.find((location) => location.value === watch.location)?.label ?? 'Hela Sverige';
  const adBadge = watch.ad_type === 'sell'
    ? '<span class="badge sell">Saljes</span>'
    : watch.ad_type === 'buy'
      ? '<span class="badge buy">Kopes</span>'
      : '<span class="badge">Alla</span>';
  const excl = watch.exclude_words ? \`<span style="font-size:.8rem;color:#999">\${watch.exclude_words}</span>\` : '-';
  const platforms = (watch.platforms || 'blocket').split(',').map((platform) => platform.trim()).join(' + ');
  const queryLabel = watch.is_car ? \`\${watch.query} <span class="badge">Bil</span>\` : watch.query;
  return \`<tr>
    <td><strong>\${queryLabel}</strong></td>
    <td>\${price}</td>
    <td>\${loc}</td>
    <td>\${adBadge}</td>
    <td><span style="font-size:.8rem">\${platforms}</span></td>
    <td>\${excl}</td>
    <td><div class="actions">
      <button class="btn-edit" onclick='openEdit(\${JSON.stringify(watch)})'>Andra</button>
      <button class="btn-danger" onclick="deleteWatch(\${watch.id}, '\${watch.query.replace(/'/g, "\\\\'")}')">Ta bort</button>
    </div></td>
  </tr>\`;
}

async function addWatch(event) {
  event.preventDefault();
  const body = {
    query: document.getElementById('new-query').value.trim(),
    max_price: parseInt(document.getElementById('new-max').value, 10) || null,
    min_price: parseInt(document.getElementById('new-min').value, 10) || null,
    platforms: document.getElementById('new-platforms').value,
    is_car: document.getElementById('new-is-car').checked,
  };
  const created = await api('/api/watches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  await api(\`/api/watches/\${created.id}\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: document.getElementById('new-location').value || null,
      ad_type: document.getElementById('new-adtype').value,
      is_car: document.getElementById('new-is-car').checked ? 1 : 0,
      exclude_words: document.getElementById('new-exclude').value.trim() || null,
    }),
  });

  event.target.reset();
  await loadWatches();
  toast('Bevakning tillagd.');
}

async function deleteWatch(id, query) {
  if (!confirm(\`Ta bort bevakning "\${query}"?\`)) return;
  await api(\`/api/watches/\${id}\`, { method: 'DELETE' });
  await loadWatches();
  toast('Borttagen.');
}

function openEdit(watch) {
  document.getElementById('edit-id').value = watch.id;
  document.getElementById('edit-query').value = watch.query;
  document.getElementById('edit-max').value = watch.max_price ?? '';
  document.getElementById('edit-min').value = watch.min_price ?? '';
  document.getElementById('edit-location').value = watch.location ?? '';
  document.getElementById('edit-adtype').value = watch.ad_type ?? 'all';
  document.getElementById('edit-platforms').value = watch.platforms ?? 'blocket';
  document.getElementById('edit-is-car').checked = Boolean(watch.is_car);
  document.getElementById('edit-exclude').value = watch.exclude_words ?? '';
  document.getElementById('edit-dialog').showModal();
}

async function saveEdit(event) {
  event.preventDefault();
  const id = document.getElementById('edit-id').value;
  await api(\`/api/watches/\${id}\`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_price: parseInt(document.getElementById('edit-max').value, 10) || null,
      min_price: parseInt(document.getElementById('edit-min').value, 10) || null,
      location: document.getElementById('edit-location').value || null,
      ad_type: document.getElementById('edit-adtype').value,
      platforms: document.getElementById('edit-platforms').value,
      is_car: document.getElementById('edit-is-car').checked ? 1 : 0,
      exclude_words: document.getElementById('edit-exclude').value.trim() || null,
    }),
  });
  document.getElementById('edit-dialog').close();
  await loadWatches();
  toast('Sparat.');
}

async function manualSearch() {
  const el = document.getElementById('search-result');
  el.textContent = 'Soker...';
  try {
    const result = await api('/api/search', { method: 'POST' });
    el.textContent = result.totalNew > 0 ? \`\${result.totalNew} nya traffar.\` : 'Ingenting nytt.';
  } catch (err) {
    el.textContent = err.message;
  }
  setTimeout(() => { el.textContent = ''; }, 5000);
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

init().catch((err) => toast(err.message));
</script>
</body>
</html>`;
}
