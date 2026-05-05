let locations = [];

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Begäran misslyckades');
  return data;
}

let portfolioCategories = [];

async function init() {
  const constants = await api('/api/constants');
  locations = constants.locations;
  portfolioCategories = constants.portfolioCategories ?? [];
  const opts = locations.map((l) => `<option value="${l.value}">${l.label}</option>`).join('');
  document.getElementById('new-location').insertAdjacentHTML('beforeend', opts);
  document.getElementById('edit-location').insertAdjacentHTML('beforeend', opts);
  const catOpts = portfolioCategories.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
  document.getElementById('pedit-category').insertAdjacentHTML('beforeend', catOpts);
  await Promise.all([loadWatches(), loadAiSettings(), loadFacebookStatus()]);
}

async function loadAiSettings() {
  const s = await api('/api/settings/ai');
  document.getElementById('ai-enabled').checked = Boolean(s.enabled);
  document.getElementById('ai-model').value = s.model || '';
  document.getElementById('ai-batch-size').value = s.batch_size ?? '';
  document.getElementById('ai-timeout-ms').value = s.timeout_ms ?? '';
  document.getElementById('ai-system-prompt').value = s.system_prompt || '';
  document.getElementById('ai-global-rules').value = s.global_rules || '';
}

async function saveAiSettings(event) {
  event.preventDefault();
  await api('/api/settings/ai', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      enabled: document.getElementById('ai-enabled').checked,
      model: document.getElementById('ai-model').value.trim(),
      batch_size: parseInt(document.getElementById('ai-batch-size').value, 10) || 8,
      timeout_ms: parseInt(document.getElementById('ai-timeout-ms').value, 10) || 15000,
      system_prompt: document.getElementById('ai-system-prompt').value.trim(),
      global_rules: document.getElementById('ai-global-rules').value.trim(),
    }),
  });
  toast('AI-inställningar sparade.');
}

async function loadFacebookStatus() {
  const data = await api('/api/settings/facebook');
  const el = document.getElementById('fb-status');
  if (data.hasSession) {
    el.innerHTML = `<span class="status-banner banner-ok"><span class="pulse"></span>Session aktiv — sparad ${data.savedAt ?? 'okänt datum'}</span>`;
  } else {
    el.innerHTML = '<span class="status-banner banner-missing">✕ &nbsp;Ingen session — klistra in JSON nedan för att aktivera Facebook-sökning</span>';
  }
}

async function saveFacebookSession(event) {
  event.preventDefault();
  const raw = document.getElementById('fb-session').value.trim();
  if (!raw) return toast('Klistra in session-JSON först.');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return toast('Ogiltig JSON.'); }
  await api('/api/settings/facebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: parsed }),
  });
  document.getElementById('fb-session').value = '';
  await loadFacebookStatus();
  toast('Facebook-session sparad.');
}

async function loadWatches() {
  const watches = await api('/api/watches');
  const el = document.getElementById('watches-container');
  if (watches.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔎</div>Inga aktiva bevakningar ännu.</div>';
    return;
  }
  el.innerHTML = `<div class="watch-list">${watches.map(watchCard).join('')}</div>`;
}

function watchCard(watch) {
  const chips = [];

  if (watch.min_price || watch.max_price) {
    const parts = [];
    if (watch.min_price) parts.push(watch.min_price.toLocaleString('sv') + ' kr');
    if (watch.max_price) parts.push('max ' + watch.max_price.toLocaleString('sv') + ' kr');
    chips.push(`<span class="chip chip-green">💰 ${parts.join(' – ')}</span>`);
  }

  const loc = locations.find((l) => l.value === watch.location)?.label;
  if (loc) chips.push(`<span class="chip chip-blue">📍 ${loc}</span>`);

  if (watch.ad_type === 'sell') chips.push('<span class="chip chip-slate">Säljes</span>');
  else if (watch.ad_type === 'buy') chips.push('<span class="chip chip-amber">Köpes</span>');

  const platforms = (watch.platforms || 'blocket').split(',').map((p) => p.trim());
  chips.push(`<span class="chip chip-slate">🌐 ${platforms.join(' · ')}</span>`);

  if (watch.exclude_words) chips.push(`<span class="chip chip-red">✕ ${watch.exclude_words}</span>`);

  const carBadge = watch.is_car ? '<span class="chip chip-blue">🚗 Bil</span>' : '';

  return `<div class="watch-card">
    <div class="watch-info">
      <div class="watch-title">${watch.query}${carBadge ? ' ' + carBadge : ''}</div>
      <div class="watch-chips">${chips.join('')}</div>
    </div>
    <div class="watch-actions">
      <button class="btn-secondary btn-sm" onclick='openEdit(${JSON.stringify(watch)})'>Ändra</button>
      <button class="btn-danger btn-sm" onclick="deleteWatch(${watch.id}, '${watch.query.replace(/'/g, "\\'")}')">Ta bort</button>
    </div>
  </div>`;
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
  await api(`/api/watches/${created.id}`, {
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
  document.getElementById('add-dialog').close();
  await loadWatches();
  toast('Bevakning tillagd.');
}

async function deleteWatch(id, query) {
  if (!confirm(`Ta bort bevakning "${query}"?`)) return;
  await api(`/api/watches/${id}`, { method: 'DELETE' });
  await loadWatches();
  toast('Bevakning borttagen.');
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
  await api(`/api/watches/${id}`, {
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
  const result = document.getElementById('search-result');
  const btn = document.getElementById('search-btn');
  result.textContent = '';
  btn.innerHTML = '<span class="spinner"></span> Söker...';
  btn.disabled = true;
  try {
    const data = await api('/api/search', { method: 'POST' });
    result.textContent = data.totalNew > 0 ? `${data.totalNew} nya träffar` : 'Ingenting nytt';
  } catch (err) {
    result.textContent = err.message;
  } finally {
    btn.innerHTML = 'Sök nu';
    btn.disabled = false;
    setTimeout(() => { result.textContent = ''; }, 5000);
  }
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

// ── Tab navigation ──
function switchTab(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.getElementById(`tab-${name}`).classList.add('active');
  if (name === 'stats') loadStats();
  if (name === 'portfolio') loadPortfolio();
}

// ── Statistics ──
const PLATFORM_COLORS = {
  blocket: '#chip-blue', tradera: '#chip-amber', klaravik: '#chip-green',
  blinto: '#chip-slate', auctionet: '#chip-green', budi: '#chip-amber',
  junora: '#chip-slate', facebook: '#chip-blue',
};

function thumbPlaceholderHtml() {
  return `<div class="recent-thumb recent-thumb-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
}

function thumbPlaceholder() {
  const el = document.createElement('div');
  el.className = 'recent-thumb recent-thumb-placeholder';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`;
  return el;
}

function platformChipClass(p) {
  const map = { blocket:'chip-blue', tradera:'chip-amber', klaravik:'chip-green',
    blinto:'chip-slate', auctionet:'chip-green', budi:'chip-amber', junora:'chip-slate', facebook:'chip-blue' };
  return map[p] ?? 'chip-slate';
}

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'nyss';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

async function loadStats() {
  const s = await api('/api/stats').catch(() => null);
  if (!s) return;

  // Summary
  const watchCount = (await api('/api/watches').catch(() => [])).length;
  document.getElementById('stat-summary').innerHTML = `
    <div class="stat-card"><div class="stat-value">${s.total.toLocaleString('sv')}</div><div class="stat-label">Totalt indexerade</div></div>
    <div class="stat-card"><div class="stat-value">${s.today}</div><div class="stat-label">Idag</div></div>
    <div class="stat-card"><div class="stat-value">${watchCount}</div><div class="stat-label">Bevakningar</div></div>`;

  // Per platform
  const maxP = Math.max(...s.perPlatform.map((r) => r.count), 1);
  document.getElementById('stat-platforms').innerHTML = s.perPlatform.length ? s.perPlatform.map((r) => `
    <div class="bar-row">
      <span class="bar-label">${r.platform}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.count/maxP*100)}%"></div></div>
      <span class="bar-count">${r.count}</span>
    </div>`).join('') : '<div class="empty">Inga data ännu.</div>';

  // Per day chart
  const maxD = Math.max(...s.perDay.map((r) => r.count), 1);
  document.getElementById('stat-days').innerHTML = s.perDay.length ? s.perDay.map((r) => {
    const h = Math.max(4, Math.round(r.count / maxD * 60));
    const label = r.day.slice(5); // MM-DD
    return `<div class="day-col"><div class="day-bar" style="height:${h}px" title="${r.day}: ${r.count} träffar"></div><span class="day-label">${label}</span></div>`;
  }).join('') : '<div class="empty" style="width:100%">Inga data ännu.</div>';

  // Per watch
  const maxW = Math.max(...s.perWatch.map((r) => r.count), 1);
  document.getElementById('stat-watches').innerHTML = s.perWatch.length ? s.perWatch.map((r) => `
    <div class="bar-row">
      <span class="bar-label" title="${r.query}">${r.query}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(r.count/maxW*100)}%"></div></div>
      <span class="bar-count">${r.count}</span>
    </div>`).join('') : '<div class="empty">Inga data ännu.</div>';

  // Recent
  document.getElementById('stat-recent').innerHTML = s.recent.length ? s.recent.map((r) => `
    <a class="recent-card" href="${r.url || '#'}" target="_blank" rel="noopener">
      ${r.image_url
        ? `<img class="recent-thumb" src="${r.image_url}" alt="" loading="lazy" onerror="this.replaceWith(thumbPlaceholder())">`
        : thumbPlaceholderHtml()}
      <span class="chip ${platformChipClass(r.platform)} recent-platform">${r.platform}</span>
      <span class="recent-title" title="${escAttr(r.title)}">${r.title ?? '–'}</span>
      <span class="recent-price">${r.price ? r.price.toLocaleString('sv') + ' kr' : '–'}</span>
      <span class="recent-time">${timeAgo(r.first_seen_at)}</span>
      <button class="btn-buy"
        data-id="${r.id}"
        data-platform="${r.platform}"
        data-title="${escAttr(r.title)}"
        data-url="${escAttr(r.url)}"
        data-image-url="${escAttr(r.image_url)}"
        data-query="${escAttr(r.watch_query)}"
        onclick="openBuyDialog(this, event)">Köpt</button>
    </a>`).join('') : '<div class="empty">Inga data ännu.</div>';
}

// ── Import from URL ──
let importImageData = null;

async function prefetchAndFill() {
  const url = document.getElementById('import-url').value.trim();
  if (!url) return;
  const btn = document.getElementById('import-fetch-btn');
  const errEl = document.getElementById('import-error');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const data = await api('/api/portfolio/prefetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    document.getElementById('import-platform').value = data.platform ?? '';
    document.getElementById('import-platform-chip').textContent = data.platform ?? 'okänd';
    document.getElementById('import-platform-chip').className = `chip ${platformChipClass(data.platform)} recent-platform`;
    document.getElementById('import-title').value = data.title ?? '';
    document.getElementById('import-fetched-image-url').value = data.imageUrl ?? '';
    importImageData = null;
    document.getElementById('import-image-file').value = '';
    setImportThumb(data.imageUrl);
    document.getElementById('import-form').style.display = '';
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Hämta';
  }
}

function onImportImagePick(input) {
  const file = input.files[0];
  if (!file) { importImageData = null; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    importImageData = e.target.result.split(',')[1];
    setImportThumb(e.target.result, true);
  };
  reader.readAsDataURL(file);
}

async function submitImport(event) {
  event.preventDefault();
  const url = document.getElementById('import-url').value.trim();
  const platform = document.getElementById('import-platform').value || getPlatformFromUrlClient(url) || 'okänd';
  const title = document.getElementById('import-title').value.trim();
  const price = parseInt(document.getElementById('import-price').value, 10);
  const fetchedImageUrl = document.getElementById('import-fetched-image-url').value;
  if (!price || price < 0) return toast('Ange ett giltigt köppris.');
  const body = {
    listing_id: `manual-${Date.now()}`,
    platform,
    title: title || null,
    url: url || null,
    watch_query: null,
    purchase_price: price,
  };
  if (importImageData) {
    body.image_data = importImageData;
  } else if (fetchedImageUrl) {
    body.image_url = fetchedImageUrl;
  }
  await api('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  resetImportForm();
  toast('Annons importerad till portfolio!');
  await loadPortfolio();
}

function resetImportForm() {
  document.getElementById('import-url').value = '';
  document.getElementById('import-form').style.display = 'none';
  document.getElementById('import-error').style.display = 'none';
  document.getElementById('import-title').value = '';
  document.getElementById('import-price').value = '';
  document.getElementById('import-image-file').value = '';
  document.getElementById('import-fetched-image-url').value = '';
  importImageData = null;
  setImportThumb(null);
}

function setImportThumb(src, isLocal = false) {
  const wrap = document.getElementById('import-thumb-wrap');
  if (!wrap) return;
  if (src) {
    const onErr = isLocal ? '' : ' onerror="this.replaceWith(thumbPlaceholder())"';
    wrap.innerHTML = `<img class="recent-thumb" src="${escAttr(src)}" alt="" loading="lazy"${onErr}>`;
  } else {
    wrap.innerHTML = thumbPlaceholderHtml();
  }
}

function getPlatformFromUrlClient(url) {
  if (!url) return null;
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

// ── Tag registry ──
let allTags = [];

async function loadTags() {
  allTags = await api('/api/tags').catch(() => []);
  const chips = document.getElementById('tag-registry-chips');
  if (!chips) return;
  if (allTags.length === 0) {
    chips.innerHTML = '<span style="font-size:.78rem;color:var(--text-4)">Inga taggar ännu.</span>';
    return;
  }
  chips.innerHTML = allTags.map((t) =>
    `<span class="tag-chip">${escAttr(t.label)}<button type="button" class="tag-chip-del" onclick="deleteTagFromRegistry('${escAttr(t.data_name)}')" title="Ta bort">×</button></span>`
  ).join('');
}

async function addTagToRegistry(event) {
  event.preventDefault();
  const data_name = document.getElementById('tag-new-name').value.trim();
  const label = document.getElementById('tag-new-label').value.trim();
  if (!data_name || !label) return;
  await api('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data_name, label }) });
  document.getElementById('tag-new-name').value = '';
  document.getElementById('tag-new-label').value = '';
  toast('Tagg tillagd.');
  await loadTags();
}

async function deleteTagFromRegistry(dataName) {
  if (!confirm('Ta bort taggen från registret?')) return;
  await api(`/api/tags/${encodeURIComponent(dataName)}`, { method: 'DELETE' });
  toast('Tagg borttagen.');
  await loadTags();
}

// ── Portfolio ──
let pendingPurchaseData = null;
let sellTarget = null; // { type: 'item'|'bundle', id: number }
let currentPortfolioItems = [];

function escAttr(s) {
  return (s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function openBuyDialog(btn, event) {
  event.preventDefault();
  event.stopPropagation();
  const d = btn.dataset;
  pendingPurchaseData = {
    listing_id: d.id,
    platform: d.platform,
    title: d.title,
    url: d.url,
    image_url: d.imageUrl,
    watch_query: d.query,
  };
  document.getElementById('buy-item-title').textContent = d.title || 'Okänd annons';
  document.getElementById('buy-price').value = '';
  document.getElementById('buy-dialog').showModal();
}

async function confirmPurchase(event) {
  event.preventDefault();
  const price = parseInt(document.getElementById('buy-price').value, 10);
  if (!price || price < 0) return toast('Ange ett giltigt pris.');
  await api('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...pendingPurchaseData, purchase_price: price }),
  });
  document.getElementById('buy-dialog').close();
  pendingPurchaseData = null;
  toast('Markerat som köpt!');
}

function openSellDialog(btn, event) {
  event.stopPropagation();
  sellTarget = { type: 'item', id: parseInt(btn.dataset.id, 10) };
  document.getElementById('sell-item-title').textContent = btn.dataset.title || 'Okänd annons';
  document.getElementById('sell-price').value = '';
  document.getElementById('sell-dialog').showModal();
}

function openSellBundle(btn, event) {
  event.stopPropagation();
  sellTarget = { type: 'bundle', id: parseInt(btn.dataset.id, 10) };
  document.getElementById('sell-item-title').textContent = btn.dataset.title || 'Paket';
  document.getElementById('sell-price').value = '';
  document.getElementById('sell-dialog').showModal();
}

async function confirmSell(event) {
  event.preventDefault();
  const price = parseInt(document.getElementById('sell-price').value, 10);
  if (!price || price < 0) return toast('Ange ett giltigt pris.');
  const url = sellTarget.type === 'bundle'
    ? `/api/portfolio/bundles/${sellTarget.id}/sold`
    : `/api/portfolio/${sellTarget.id}/sold`;
  await api(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sold_price: price }),
  });
  document.getElementById('sell-dialog').close();
  sellTarget = null;
  toast('Markerat som såld!');
  await loadPortfolio();
}

function totalInvested(item) {
  const extraCosts = (item.costs ?? []).reduce((s, c) => s + c.amount, 0);
  return item.purchase_price + extraCosts;
}

async function loadPortfolio() {
  const [items, bundles] = await Promise.all([
    api('/api/portfolio').catch(() => []),
    api('/api/portfolio/bundles').catch(() => []),
  ]);
  await loadTags();
  currentPortfolioItems = items;

  const bundledIds = new Set(bundles.flatMap((b) => b.items.map((i) => i.id)));
  const standalone = items.filter((i) => !bundledIds.has(i.id));

  const heldStandalone = standalone.filter((i) => !i.sold_at);
  const soldStandalone = standalone.filter((i) => i.sold_at);
  const heldBundles = bundles.filter((b) => !b.sold_at);
  const soldBundles = bundles.filter((b) => b.sold_at);

  const allInvested = items.reduce((s, i) => s + totalInvested(i), 0);
  let totalRevenue = soldStandalone.reduce((s, i) => s + (i.sold_price ?? 0), 0);
  let profit = soldStandalone.reduce((s, i) => s + (i.sold_price ?? 0) - totalInvested(i), 0);
  for (const b of soldBundles) {
    totalRevenue += b.sold_price ?? 0;
    profit += (b.sold_price ?? 0) - b.items.reduce((s, i) => s + totalInvested(i), 0);
  }
  const hasSold = soldStandalone.length > 0 || soldBundles.length > 0;

  document.getElementById('port-invested').textContent = allInvested ? allInvested.toLocaleString('sv') + ' kr' : '–';
  document.getElementById('port-revenue').textContent = totalRevenue ? totalRevenue.toLocaleString('sv') + ' kr' : '–';
  const profitEl = document.getElementById('port-profit');
  if (hasSold) {
    const sign = profit >= 0 ? '+' : '';
    profitEl.textContent = sign + profit.toLocaleString('sv') + ' kr';
    profitEl.style.color = profit > 0 ? 'var(--primary)' : profit < 0 ? 'var(--danger)' : '';
  } else {
    profitEl.textContent = '–';
    profitEl.style.color = '';
  }
  document.getElementById('port-held-count').textContent = heldStandalone.length + heldBundles.length;

  const createBtn = document.getElementById('create-bundle-btn');
  if (createBtn) createBtn.style.display = heldStandalone.length >= 2 ? '' : 'none';

  const list = document.getElementById('portfolio-list');
  if (items.length === 0 && bundles.length === 0) {
    list.innerHTML = '<div class="empty"><div class="empty-icon">🛒</div>Inga köp registrerade ännu.<br>Klicka "Köpt" på en annons i Statistik-fliken.</div>';
    return;
  }
  list.innerHTML = [
    ...heldBundles.map(bundleCard),
    ...heldStandalone.map(portfolioCard),
    ...soldBundles.map(bundleCard),
    ...soldStandalone.map(portfolioCard),
  ].join('');
}

function portfolioCard(item) {
  const thumb = item.image_url
    ? `<img class="pcard-img" src="${item.image_url}" alt="" loading="lazy" onerror="this.className='pcard-img-placeholder';this.outerHTML=\`<div class='pcard-img-placeholder'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'><rect x='3' y='3' width='18' height='18' rx='3'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='M21 15l-5-5L5 21'/></svg></div>\`">`
    : `<div class="pcard-img-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

  const dateStr = item.purchased_at ? new Date(item.purchased_at).toLocaleDateString('sv-SE') : '–';
  const costs = item.costs ?? [];
  const extraTotal = costs.reduce((s, c) => s + c.amount, 0);
  const invested = item.purchase_price + extraTotal;

  const costsRows = costs.map((c) =>
    `<div class="pcard-row"><span class="pcard-row-label">${escAttr(c.description)}</span><span class="pcard-row-value muted">${c.amount.toLocaleString('sv')} kr</span></div>`
  ).join('');

  const showInvested = costs.length > 0;

  let resultHtml;
  if (item.sold_at) {
    const p = (item.sold_price ?? 0) - invested;
    const sign = p >= 0 ? '+' : '';
    const cls = p >= 0 ? 'profit-positive' : 'profit-negative';
    resultHtml = `
      <div class="pcard-result">
        <span class="profit-badge ${cls}">${sign}${p.toLocaleString('sv')} kr</span>
        <span class="profit-sold-price">Såld: ${(item.sold_price ?? 0).toLocaleString('sv')} kr</span>
      </div>`;
  } else {
    resultHtml = `
      <div class="pcard-result">
        <span class="profit-badge profit-held">I lager</span>
        <button class="btn-sell" data-id="${item.id}" data-title="${escAttr(item.title)}" onclick="openSellDialog(this, event)">Markera såld</button>
      </div>`;
  }

  const itemJson = escAttr(JSON.stringify(item));
  return `<div class="portfolio-card">
    <div class="pcard-top">
      ${thumb}
      <div class="pcard-body">
        <div class="pcard-header">
          <span class="pcard-title" title="${escAttr(item.title)}">${item.title ?? 'Okänd annons'}</span>
          <span class="chip ${platformChipClass(item.platform)} recent-platform" style="flex-shrink:0">${item.platform}</span>
        </div>
        <div class="pcard-date">${dateStr}${item.watch_query ? ` · ${item.watch_query}` : ''}</div>
        <div class="pcard-rows">
          <div class="pcard-row"><span class="pcard-row-label">Inköpspris</span><span class="pcard-row-value">${item.purchase_price.toLocaleString('sv')} kr</span></div>
          ${costsRows}
          ${showInvested ? `<hr class="pcard-divider"><div class="pcard-row pcard-invested"><span class="pcard-row-label">Totalt investerat</span><span class="pcard-row-value">${invested.toLocaleString('sv')} kr</span></div>` : ''}
        </div>
        ${item.notes ? `<div class="pcard-notes">${escAttr(item.notes)}</div>` : ''}
        ${(item.category || (item.tags ?? []).length) ? `<div class="pcard-tags">
          ${item.category ? `<span class="pcard-category">${escAttr(portfolioCategories.find(c=>c.value===item.category)?.label ?? item.category)}</span>` : ''}
          ${(item.tags ?? []).map(dn => `<span class="pcard-tag">${escAttr(allTags.find(t=>t.data_name===dn)?.label ?? dn)}</span>`).join('')}
        </div>` : ''}
      </div>
    </div>
    <div class="pcard-footer">
      ${resultHtml}
      <div class="pcard-actions">
        <button class="btn-edit-portfolio" data-item="${itemJson}" onclick="openPortfolioEdit(this)">Ändra</button>
      </div>
    </div>
  </div>`;
}

function bundleCard(bundle) {
  const bundleInvested = bundle.items.reduce((s, i) => s + totalInvested(i), 0);

  const itemRows = bundle.items.map((item) => {
    const thumb = item.image_url
      ? `<img class="bundle-item-thumb" src="${escAttr(item.image_url)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'bundle-item-thumb-ph\\'><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'3\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><path d=\\'M21 15l-5-5L5 21\\'/></svg></div>'">`
      : `<div class="bundle-item-thumb-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;
    const invested = totalInvested(item);
    const costsNote = item.costs?.length ? ` +${item.costs.length} kostnad${item.costs.length > 1 ? 'er' : ''}` : '';
    return `<div class="bundle-item-row">
      ${thumb}
      <span class="bundle-item-title" title="${escAttr(item.title)}">${escAttr(item.title ?? 'Okänd annons')}</span>
      <span class="bundle-item-price">${invested.toLocaleString('sv')} kr${costsNote}</span>
    </div>`;
  }).join('');

  let footerHtml;
  if (bundle.sold_at) {
    const p = (bundle.sold_price ?? 0) - bundleInvested;
    const sign = p >= 0 ? '+' : '';
    const cls = p >= 0 ? 'profit-positive' : 'profit-negative';
    footerHtml = `
      <div class="pcard-result">
        <span class="profit-badge ${cls}">${sign}${p.toLocaleString('sv')} kr</span>
        <span class="profit-sold-price">Såld: ${(bundle.sold_price ?? 0).toLocaleString('sv')} kr</span>
      </div>
      <div class="pcard-actions">
        <button class="btn-dissolve" onclick="openDissolveBundle(${bundle.id})">Upplös paket</button>
      </div>`;
  } else {
    footerHtml = `
      <div class="pcard-result">
        <span class="profit-badge profit-held">I lager</span>
        <button class="btn-sell" data-id="${bundle.id}" data-title="${escAttr(bundle.name)}" onclick="openSellBundle(this, event)">Markera såld</button>
      </div>
      <div class="pcard-actions">
        <button class="btn-dissolve" onclick="openDissolveBundle(${bundle.id})">Upplös paket</button>
      </div>`;
  }

  return `<div class="portfolio-card bundle-card">
    <div class="pcard-top bundle-header">
      <span class="bundle-icon">📦</span>
      <div class="pcard-body">
        <div class="pcard-header">
          <span class="pcard-title">${escAttr(bundle.name)}</span>
          <span class="chip chip-slate" style="flex-shrink:0;font-size:.68rem">paket · ${bundle.items.length} obj</span>
        </div>
      </div>
    </div>
    <div class="bundle-items">${itemRows}</div>
    <div class="bundle-total-row">
      <span>Totalt investerat</span>
      <span>${bundleInvested.toLocaleString('sv')} kr</span>
    </div>
    <div class="pcard-footer">${footerHtml}</div>
  </div>`;
}

function openCreateBundle() {
  const unbundledUnsold = currentPortfolioItems.filter((i) => !i.bundle_id && !i.sold_at);
  document.getElementById('bundle-items-list').innerHTML = unbundledUnsold.map((i) =>
    `<label class="bundle-item-check">
      <input type="checkbox" name="bundle-item" value="${i.id}">
      <span>${escAttr(i.title ?? 'Okänd annons')}</span>
      <span>${totalInvested(i).toLocaleString('sv')} kr</span>
    </label>`
  ).join('');
  document.getElementById('bundle-name').value = '';
  document.getElementById('bundle-create-dialog').showModal();
}

async function submitCreateBundle(event) {
  event.preventDefault();
  const name = document.getElementById('bundle-name').value.trim();
  const checked = [...document.querySelectorAll('[name="bundle-item"]:checked')].map((el) => parseInt(el.value, 10));
  if (checked.length < 2) return toast('Välj minst 2 objekt.');
  await api('/api/portfolio/bundles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, item_ids: checked }),
  });
  document.getElementById('bundle-create-dialog').close();
  toast('Paket skapat!');
  await loadPortfolio();
}

async function openDissolveBundle(bundleId) {
  if (!confirm('Upplösa paketet? Objekten återgår till enskilda kort.')) return;
  await api(`/api/portfolio/bundles/${bundleId}`, { method: 'DELETE' });
  toast('Paket upplöst.');
  await loadPortfolio();
}

// ── Portfolio edit ──
let editImageData = null;
let editCosts = [];

function renderEditCosts() {
  const list = document.getElementById('pedit-costs-list');
  if (editCosts.length === 0) {
    list.innerHTML = '<div class="cost-empty">Inga extrakostnader.</div>';
    return;
  }
  list.innerHTML = `<div class="cost-list">${editCosts.map((c, i) => `
    <div class="cost-row">
      <span class="cost-desc" title="${escAttr(c.description)}">${escAttr(c.description)}</span>
      <span class="cost-amount">${Number(c.amount).toLocaleString('sv')} kr</span>
      <button type="button" class="cost-remove" onclick="removeEditCost(${i})">×</button>
    </div>`).join('')}</div>`;
}

function addEditCost() {
  const desc = document.getElementById('pedit-cost-desc').value.trim();
  const amount = parseInt(document.getElementById('pedit-cost-amount').value, 10);
  if (!desc || !amount || amount < 0) return;
  editCosts.push({ description: desc, amount });
  document.getElementById('pedit-cost-desc').value = '';
  document.getElementById('pedit-cost-amount').value = '';
  renderEditCosts();
}

function removeEditCost(index) {
  editCosts.splice(index, 1);
  renderEditCosts();
}

function openPortfolioEdit(btn) {
  const item = JSON.parse(btn.dataset.item);
  editImageData = null;
  editCosts = (item.costs ?? []).map((c) => ({ description: c.description, amount: c.amount }));
  document.getElementById('pedit-id').value = item.id;
  document.getElementById('pedit-title').textContent = item.title ?? 'Okänd annons';
  document.getElementById('pedit-purchase-price').value = item.purchase_price ?? '';
  document.getElementById('pedit-sold-price').value = item.sold_price ?? '';
  document.getElementById('pedit-notes').value = item.notes ?? '';
  document.getElementById('pedit-category').value = item.category ?? '';
  document.getElementById('pedit-cost-desc').value = '';
  document.getElementById('pedit-cost-amount').value = '';
  document.getElementById('pedit-image-file').value = '';
  renderEditCosts();
  const itemTags = new Set(item.tags ?? []);
  document.getElementById('pedit-tags-list').innerHTML = allTags.map((t) =>
    `<label class="tag-checkbox-label">
      <input type="checkbox" name="pedit-tag" value="${escAttr(t.data_name)}"${itemTags.has(t.data_name) ? ' checked' : ''}>
      <span>${escAttr(t.label)}</span>
    </label>`
  ).join('') || '<span style="font-size:.78rem;color:var(--text-4)">Inga taggar i registret.</span>';
  const wrap = document.getElementById('pedit-thumb-wrap');
  wrap.innerHTML = item.image_url
    ? `<img class="recent-thumb" src="${escAttr(item.image_url)}" alt="" loading="lazy" onerror="this.replaceWith(thumbPlaceholder())">`
    : thumbPlaceholderHtml();
  document.getElementById('portfolio-edit-dialog').showModal();
}

function onEditImagePick(input) {
  const file = input.files[0];
  if (!file) { editImageData = null; return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    editImageData = e.target.result.split(',')[1];
    document.getElementById('pedit-thumb-wrap').innerHTML =
      `<img class="recent-thumb" src="${e.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);
}

async function submitPortfolioEdit(event) {
  event.preventDefault();
  const id = document.getElementById('pedit-id').value;
  const soldVal = document.getElementById('pedit-sold-price').value.trim();
  const selectedTags = [...document.querySelectorAll('[name="pedit-tag"]:checked')].map((el) => el.value);
  const body = {
    purchase_price: parseInt(document.getElementById('pedit-purchase-price').value, 10),
    sold_price: soldVal ? parseInt(soldVal, 10) : null,
    notes: document.getElementById('pedit-notes').value.trim() || null,
    category: document.getElementById('pedit-category').value || null,
    tags: selectedTags,
    costs: editCosts,
  };
  if (editImageData) body.image_data = editImageData;
  await api(`/api/portfolio/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  document.getElementById('portfolio-edit-dialog').close();
  editImageData = null;
  toast('Sparat.');
  await loadPortfolio();
}

init().catch((err) => toast(err.message));