import express from 'express';
import basicAuth from 'express-basic-auth';
import { existsSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getWatchesList, addWatch, removeWatch, updateWatch, getAiSettings, updateAiSettings, getStats, addPurchase, markSold, getPortfolio, updatePortfolioImageUrl, updatePortfolioItem, replacePortfolioCosts, createBundle, getBundles, markBundleSold, updateBundle, dissolveBundle, getTags, addTag, deleteTag, setPortfolioTags } from './db/database.js';
import { LOCATIONS_LIST, CATEGORIES_LIST, PORTFOLIO_CATEGORIES } from './constants.js';
import { fetchListingPageDetails } from './adapters/detail-fetch.js';

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

function getPlatformFromUrl(url) {
  if (url.includes('blocket.se'))    return 'blocket';
  if (url.includes('tradera.com'))   return 'tradera';
  if (url.includes('klaravik.se'))   return 'klaravik';
  if (url.includes('auctionet.com')) return 'auctionet';
  if (url.includes('junora.se'))     return 'junora';
  if (url.includes('budi.se'))       return 'budi';
  if (url.includes('blinto.se'))     return 'blinto';
  if (url.includes('facebook.com'))  return 'facebook';
  return null;
}

async function downloadPortfolioImage(imageUrl, portfolioId, dataDir) {
  const dir = join(dataDir, 'portfolio-images');
  mkdirSync(dir, { recursive: true });

  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentType = response.headers.get('content-type') ?? '';
  const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(join(dir, `${portfolioId}${ext}`), buffer);
  return `/portfolio-images/${portfolioId}${ext}`;
}

export function startServer(port, callbacks) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

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
    res.json({ locations: LOCATIONS_LIST, categories: CATEGORIES_LIST, portfolioCategories: PORTFOLIO_CATEGORIES });
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

  // ── Portfolio ─────────────────────────────────────────────────────────────

  app.get('/api/portfolio', (_req, res) => {
    res.json(getPortfolio());
  });

  app.use('/portfolio-images', express.static(join(callbacks.dataDir, 'portfolio-images')));

  app.post('/api/portfolio/prefetch', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url krävs' });
    const platform = getPlatformFromUrl(url);
    try {
      const { metadata, imageUrl } = await fetchListingPageDetails(url);
      res.json({ platform, title: metadata.pageTitle ?? null, imageUrl: imageUrl ?? null });
    } catch {
      res.json({ platform, title: null, imageUrl: null });
    }
  });

  app.post('/api/portfolio', async (req, res) => {
    const { listing_id, platform, title, url, image_url, image_data, watch_query, purchase_price } = req.body;
    if (!listing_id || !platform) return res.status(400).json({ error: 'listing_id och platform krävs' });
    const price = Number(purchase_price);
    if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'purchase_price måste vara ett positivt heltal' });
    const id = addPurchase({ listingId: listing_id, platform, title, url, imageUrl: image_url ?? null, watchQuery: watch_query, purchasePrice: price });
    if (image_data) {
      try {
        const dir = join(callbacks.dataDir, 'portfolio-images');
        mkdirSync(dir, { recursive: true });
        const buffer = Buffer.from(image_data, 'base64');
        writeFileSync(join(dir, `${id}.jpg`), buffer);
        updatePortfolioImageUrl(id, `/portfolio-images/${id}.jpg`);
      } catch (err) {
        console.warn(`[Portfolio] Kunde inte spara uppladdad bild för #${id}: ${err.message}`);
      }
    } else if (image_url) {
      try {
        const localPath = await downloadPortfolioImage(image_url, id, callbacks.dataDir);
        updatePortfolioImageUrl(id, localPath);
      } catch (err) {
        console.warn(`[Portfolio] Bild-nedladdning misslyckades för #${id}: ${err.message}`);
      }
    }
    res.json({ id });
  });

  app.patch('/api/portfolio/:id/sold', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const price = Number(req.body.sold_price);
    if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'sold_price måste vara ett positivt heltal' });
    const ok = markSold(id, price);
    if (!ok) return res.status(404).json({ error: 'Portfolio-post hittades inte' });
    res.json({ ok: true });
  });

  app.patch('/api/portfolio/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { purchase_price, sold_price, notes, image_data, costs, tags, category } = req.body;
    const updates = {};
    if ('purchase_price' in req.body) {
      const p = Number(purchase_price);
      if (!Number.isInteger(p) || p < 0) return res.status(400).json({ error: 'purchase_price måste vara ett positivt heltal' });
      updates.purchasePrice = p;
    }
    if ('sold_price' in req.body) {
      updates.soldPrice = sold_price ? Number(sold_price) : null;
    }
    if ('notes' in req.body) {
      updates.notes = notes || null;
    }
    if (image_data) {
      try {
        const dir = join(callbacks.dataDir, 'portfolio-images');
        mkdirSync(dir, { recursive: true });
        const buffer = Buffer.from(image_data, 'base64');
        writeFileSync(join(dir, `${id}.jpg`), buffer);
        updates.imageUrl = `/portfolio-images/${id}.jpg`;
      } catch (err) {
        console.warn(`[Portfolio] Kunde inte spara redigerad bild för #${id}: ${err.message}`);
      }
    }
    if ('category' in req.body) updates.category = category || null;
    updatePortfolioItem(id, updates);
    if (Array.isArray(costs)) {
      replacePortfolioCosts(id, costs.filter((c) => c.description && Number(c.amount) > 0));
    }
    if (Array.isArray(tags)) {
      setPortfolioTags(id, tags);
    }
    res.json({ ok: true });
  });

  // ── Taggar ────────────────────────────────────────────────────────────────

  app.get('/api/tags', (_req, res) => {
    res.json(getTags());
  });

  app.post('/api/tags', (req, res) => {
    const { data_name, label, color } = req.body;
    if (!data_name?.trim() || !label?.trim()) return res.status(400).json({ error: 'data_name och label krävs' });
    if (!/^[a-z][a-z0-9_]*$/.test(data_name.trim())) return res.status(400).json({ error: 'data_name får bara innehålla a-z, 0-9 och _' });
    addTag(data_name.trim(), label.trim(), color?.trim() || null);
    res.json({ ok: true });
  });

  app.delete('/api/tags/:data_name', (req, res) => {
    deleteTag(req.params.data_name);
    res.json({ ok: true });
  });

  // ── Portfolio bundles ─────────────────────────────────────────────────────

  app.get('/api/portfolio/bundles', (_req, res) => {
    res.json(getBundles());
  });

  app.post('/api/portfolio/bundles', (req, res) => {
    const { name, item_ids } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name krävs' });
    if (!Array.isArray(item_ids) || item_ids.length < 2) return res.status(400).json({ error: 'Minst 2 objekt krävs' });
    const id = createBundle(name.trim(), item_ids);
    res.json({ id });
  });

  app.patch('/api/portfolio/bundles/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const updates = {};
    if ('name' in req.body) updates.name = String(req.body.name ?? '').trim() || null;
    if ('notes' in req.body) updates.notes = req.body.notes || null;
    if (updates.name === null) return res.status(400).json({ error: 'name får inte vara tomt' });
    updateBundle(id, updates);
    res.json({ ok: true });
  });

  app.patch('/api/portfolio/bundles/:id/sold', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const price = Number(req.body.sold_price);
    if (!Number.isInteger(price) || price < 0) return res.status(400).json({ error: 'sold_price måste vara ett positivt heltal' });
    const ok = markBundleSold(id, price);
    if (!ok) return res.status(404).json({ error: 'Paket hittades inte' });
    res.json({ ok: true });
  });

  app.delete('/api/portfolio/bundles/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    dissolveBundle(id);
    res.json({ ok: true });
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
