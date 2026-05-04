import express from 'express';
import basicAuth from 'express-basic-auth';
import { existsSync, writeFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWatchesList, addWatch, removeWatch, updateWatch, getAiSettings, updateAiSettings, getStats } from './db/database.js';
import { LOCATIONS_LIST, CATEGORIES_LIST } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    if (!settings.model) return 'Modell krävs när AI-filtrering är aktiverad.';
    if (!settings.system_prompt) return 'System prompt krävs när AI-filtrering är aktiverad.';
  }
  if ('timeout_ms' in settings && (!Number.isInteger(settings.timeout_ms) || settings.timeout_ms < 1000))
    return 'Timeout måste vara minst 1000 ms.';
  if ('batch_size' in settings && (!Number.isInteger(settings.batch_size) || settings.batch_size < 1 || settings.batch_size > 25))
    return 'Batch size måste vara mellan 1 och 25.';
  return null;
}

export function startServer(port, callbacks) {
  const app = express();
  app.use(express.json());

  // ── Hälsa (publik) ────────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.floor(process.uptime()), activeWatches: getWatchesList().length });
  });

  // ── Auth (skyddar /admin och /api) ───────────────────────────────────────

  if (callbacks.adminPass) {
    const auth = basicAuth({
      users: { [callbacks.adminUser]: callbacks.adminPass },
      challenge: true,
      realm: 'Begagnat Monitor',
    });
    app.use('/admin', auth);
    app.use('/api', auth);
  } else {
    console.warn('[Server] ADMIN_PASS ej satt — admin-panel är oskyddad!');
  }

  // ── Bevakningar ───────────────────────────────────────────────────────────

  app.get('/api/watches', (_req, res) => {
    res.json(getWatchesList());
  });

  app.post('/api/watches', (req, res) => {
    const { query, max_price, min_price, platforms, is_car } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: 'query krävs' });
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
    if (updates.length === 0) return res.status(400).json({ error: 'Inga giltiga fält' });
    for (const [field, value] of updates) {
      updateWatch(id, field, value === '' ? null : value);
    }
    res.json({ ok: true });
  });

  // ── Manuell sökning ───────────────────────────────────────────────────────

  app.post('/api/search', async (_req, res) => {
    try {
      const result = await callbacks.onManualSearch();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Konstanter ────────────────────────────────────────────────────────────

  app.get('/api/constants', (_req, res) => {
    res.json({ locations: LOCATIONS_LIST, categories: CATEGORIES_LIST });
  });

  // ── Statistik ─────────────────────────────────────────────────────────────

  app.get('/api/stats', (_req, res) => {
    res.json(getStats());
  });

  // ── AI-inställningar ──────────────────────────────────────────────────────

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

  // ── Facebook-session ──────────────────────────────────────────────────────

  app.get('/api/settings/facebook', (req, res) => {
    const authFile = join(callbacks.dataDir, 'facebook-auth.json');
    if (!existsSync(authFile)) return res.json({ hasSession: false });
    const savedAt = new Date(statSync(authFile).mtime).toLocaleDateString('sv-SE');
    res.json({ hasSession: true, savedAt });
  });

  app.post('/api/settings/facebook', (req, res) => {
    const { session } = req.body;
    if (!session || typeof session !== 'object') {
      return res.status(400).json({ error: 'session måste vara ett JSON-objekt' });
    }
    try {
      const authFile = join(callbacks.dataDir, 'facebook-auth.json');
      writeFileSync(authFile, JSON.stringify(session, null, 2), 'utf8');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin-panel ───────────────────────────────────────────────────────────

  app.get('/admin', (_req, res) => {
    res.sendFile(join(__dirname, 'public', 'admin.html'));
  });

  app.listen(port, () => {
    console.log(`[Server] Lyssnar på port ${port} — Admin: http://localhost:${port}/admin`);
  });

  return app;
}
