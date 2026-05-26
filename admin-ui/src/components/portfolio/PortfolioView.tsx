import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../hooks/useToast';
import { useConstants } from '../../hooks/useConstants';
import type { PortfolioItem, Bundle, AnalyticsData, Tag, AnalyzeResponse } from '../../api/types';
import { PortfolioCard, totalInvested } from './PortfolioCard';
import { BundleCard } from './BundleCard';
import { SellDialog, type SellTarget } from './SellDialog';
import { EditPortfolioDialog } from './EditPortfolioDialog';
import { CreateBundleDialog } from './CreateBundleDialog';
import { ImportSection } from './ImportDialog';
import { AnalyticsSection } from './AnalyticsSection';
import { TagRegistry } from '../settings/TagRegistry';

interface Props {
  conditionTags: Tag[];
  allTags: Tag[];
  onTagsLoaded: (cond: Tag[], all: Tag[]) => void;
}

export function PortfolioView({ conditionTags, allTags, onTagsLoaded }: Props) {
  const toast = useToast();
  const constants = useConstants();
  const categories = constants?.portfolioCategories ?? [];

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const [sellTarget, setSellTarget] = useState<SellTarget | null>(null);
  const [editItem, setEditItem] = useState<PortfolioItem | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  async function load() {
    const [it, bu, an] = await Promise.all([
      api<PortfolioItem[]>('/api/portfolio').catch(() => []),
      api<Bundle[]>('/api/portfolio/bundles').catch(() => []),
      api<AnalyticsData>('/api/portfolio/analytics').catch(() => null),
    ]);
    setItems(it);
    setBundles(bu);
    setAnalytics(an);
  }

  useEffect(() => { load(); }, []);

  const bundledIds = new Set(bundles.flatMap((b) => b.items.map((i) => i.id)));
  const standalone = items.filter((i) => !bundledIds.has(i.id));
  const heldStandalone = standalone.filter((i) => !i.sold_at);
  const soldStandalone = standalone.filter((i) => i.sold_at);
  const heldBundles = bundles.filter((b) => !b.sold_at);
  const soldBundles = bundles.filter((b) => b.sold_at);

  const allInvested = items.reduce((s, i) => s + totalInvested(i), 0);
  let totalRevenue = soldStandalone.reduce((s, i) => s + (i.sold_price ?? 0), 0);
  let soldInvested = soldStandalone.reduce((s, i) => s + totalInvested(i), 0);
  for (const b of soldBundles) {
    totalRevenue += b.sold_price ?? 0;
    soldInvested += b.items.reduce((s, i) => s + totalInvested(i), 0);
  }
  const profit = totalRevenue - soldInvested;
  const margin = soldInvested > 0 ? Math.round((profit / soldInvested) * 100) : null;
  const hasSold = soldStandalone.length > 0 || soldBundles.length > 0;
  const heldCount = heldStandalone.length + heldBundles.length;

  async function handleDissolve(id: number) {
    if (!confirm('Upplösa paketet? Objekten återgår till enskilda kort.')) return;
    await fetch(`/api/portfolio/bundles/${id}`, { method: 'DELETE' });
    toast('Paket upplöst.');
    load();
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await api<AnalyzeResponse>('/api/portfolio/analyze', { method: 'POST' });
      setAnalysis(r.analysis);
    } catch {
      toast('Kunde inte hämta analys.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDelete(item: PortfolioItem) {
    if (!confirm(`Radera "${item.title ?? 'objektet'}" permanent? Detta kan inte ångras.`)) return;
    await fetch(`/api/portfolio/${item.id}`, { method: 'DELETE' });
    toast('Raderat.');
    load();
  }

  const unbundledUnsold = items.filter((i) => !i.bundle_id && !i.sold_at);
  const canBundle = unbundledUnsold.length >= 2;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-green">💰</div>
          <h2>Portfolio</h2>
        </div>
        <div className="port-stats">
          <div className="port-stats-row">
            <div className="stat-card">
              <div className="stat-value">{allInvested ? allInvested.toLocaleString('sv') + ' kr' : '–'}</div>
              <div className="stat-label">Totalt in</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalRevenue ? totalRevenue.toLocaleString('sv') + ' kr' : '–'}</div>
              <div className="stat-label">Totalt ut</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{heldCount || '–'}</div>
              <div className="stat-label">I lager</div>
            </div>
          </div>
          {hasSold && (
            <div className="port-stats-row port-stats-sold">
              <div className="port-stats-sold-label">Sålda objekt</div>
              <div className="stat-card">
                <div className="stat-value">{soldInvested.toLocaleString('sv')} kr</div>
                <div className="stat-label">Investerat</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{totalRevenue.toLocaleString('sv')} kr</div>
                <div className="stat-label">Intäkter</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: profit > 0 ? 'var(--primary)' : profit < 0 ? 'var(--danger)' : undefined }}>
                  {profit >= 0 ? '+' : ''}{profit.toLocaleString('sv')} kr
                </div>
                <div className="stat-label">Vinst</div>
              </div>
              {margin !== null && (
                <div className="stat-card">
                  <div className="stat-value" style={{ color: margin > 0 ? 'var(--primary)' : margin < 0 ? 'var(--danger)' : undefined }}>
                    {margin >= 0 ? '+' : ''}{margin}%
                  </div>
                  <div className="stat-label">Marginal</div>
                </div>
              )}
            </div>
          )}
        </div>
        {analytics && <AnalyticsSection analytics={analytics} categories={categories} />}
      </div>

      <ImportSection onSaved={load} />

      <TagRegistry onTagsLoaded={onTagsLoaded} />

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-amber">🛒</div>
          <h2>Affärer</h2>
          {canBundle && (
            <button className="btn-secondary btn-sm" onClick={() => setBundleOpen(true)} style={{ marginLeft: 'auto' }}>
              📦 Skapa paket
            </button>
          )}
        </div>
        <div className="portfolio-list">
          {items.length === 0 && bundles.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🛒</div>
              Inga köp registrerade ännu.<br />Klicka "Köpt" på en annons i Statistik-fliken.
            </div>
          ) : (
            <>
              {heldBundles.map((b) => <BundleCard key={b.id} bundle={b} onSell={setSellTarget} onDissolve={handleDissolve} />)}
              {heldStandalone.map((i) => <PortfolioCard key={i.id} item={i} conditionTags={conditionTags} allTags={allTags} categories={categories} onSell={setSellTarget} onEdit={setEditItem} onDelete={handleDelete} />)}
              {soldBundles.map((b) => <BundleCard key={b.id} bundle={b} onSell={setSellTarget} onDissolve={handleDissolve} />)}
              {soldStandalone.map((i) => <PortfolioCard key={i.id} item={i} conditionTags={conditionTags} allTags={allTags} categories={categories} onSell={setSellTarget} onEdit={setEditItem} onDelete={handleDelete} />)}
            </>
          )}
        </div>
      </div>

      <SellDialog target={sellTarget} onClose={() => setSellTarget(null)} onSaved={() => { setSellTarget(null); load(); }} />
      <EditPortfolioDialog key={editItem?.id ?? 0} item={editItem} conditionTags={conditionTags} allTags={allTags} categories={categories} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); load(); }} />
      <CreateBundleDialog open={bundleOpen} items={unbundledUnsold} onClose={() => setBundleOpen(false)} onSaved={() => { setBundleOpen(false); load(); }} />

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-blue">🤖</div>
          <h2>AI-analys</h2>
          <button
            className="btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={handleAnalyze}
            disabled={analyzing || items.length === 0}
          >
            {analyzing ? 'Analyserar…' : '✨ Fråga Claude'}
          </button>
        </div>
        {analysis ? (
          <div className="ai-analysis-body">
            {analysis.split('\n').map((line, i) => <p key={i}>{line}</p>)}
          </div>
        ) : (
          <div className="empty" style={{ paddingTop: 12, paddingBottom: 16 }}>
            {analyzing ? 'Hämtar analys…' : 'Klicka "Fråga Claude" för råd om ditt lager.'}
          </div>
        )}
      </div>
    </>
  );
}
