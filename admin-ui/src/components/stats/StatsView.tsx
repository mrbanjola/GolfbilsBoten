import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { StatsData, Watch, Tag } from '../../api/types';
import { RecentCard } from './RecentCard';
import type { PendingPurchase } from '../portfolio/BuyDialog';
import { BuyDialog } from '../portfolio/BuyDialog';

interface Props {
  conditionTags: Tag[];
  onPortfolioChanged?: () => void;
}

export function StatsView({ conditionTags, onPortfolioChanged }: Props) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [watchCount, setWatchCount] = useState(0);
  const [buyData, setBuyData] = useState<PendingPurchase | null>(null);

  useEffect(() => {
    Promise.all([
      api<StatsData>('/api/stats').catch(() => null),
      api<Watch[]>('/api/watches').catch(() => []),
    ]).then(([s, w]) => {
      setStats(s);
      setWatchCount(w.length);
    });
  }, []);

  if (!stats) return null;

  const maxP = Math.max(...stats.perPlatform.map((r) => r.count), 1);
  const maxD = Math.max(...stats.perDay.map((r) => r.count), 1);
  const maxW = Math.max(...stats.perWatch.map((r) => r.count), 1);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-blue">📊</div>
          <h2>Sammanfattning</h2>
        </div>
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-value">{stats.total.toLocaleString('sv')}</div><div className="stat-label">Totalt indexerade</div></div>
          <div className="stat-card"><div className="stat-value">{stats.today}</div><div className="stat-label">Idag</div></div>
          <div className="stat-card"><div className="stat-value">{watchCount}</div><div className="stat-label">Bevakningar</div></div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-green">🌐</div>
          <h2>Träffar per plattform</h2>
        </div>
        <div className="bar-list">
          {stats.perPlatform.length ? stats.perPlatform.map((r) => (
            <div key={r.platform} className="bar-row">
              <span className="bar-label">{r.platform}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(r.count / maxP * 100)}%` }} /></div>
              <span className="bar-count">{r.count}</span>
            </div>
          )) : <div className="empty">Inga data ännu.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-purple">📅</div>
          <h2>Träffar per dag (30 dagar)</h2>
        </div>
        <div className="day-chart">
          {stats.perDay.length ? stats.perDay.map((r) => {
            const h = Math.max(4, Math.round(r.count / maxD * 60));
            return (
              <div key={r.day} className="day-col">
                <div className="day-bar" style={{ height: h }} title={`${r.day}: ${r.count} träffar`} />
                <span className="day-label">{r.day.slice(5)}</span>
              </div>
            );
          }) : <div className="empty" style={{ width: '100%' }}>Inga data ännu.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-amber">🔍</div>
          <h2>Träffar per bevakning</h2>
        </div>
        <div className="bar-list">
          {stats.perWatch.length ? stats.perWatch.map((r) => (
            <div key={r.query} className="bar-row">
              <span className="bar-label" title={r.query}>{r.query}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(r.count / maxW * 100)}%` }} /></div>
              <span className="bar-count">{r.count}</span>
            </div>
          )) : <div className="empty">Inga data ännu.</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-icon ci-blue">🕐</div>
          <h2>Senaste träffar</h2>
        </div>
        <div className="recent-list">
          {stats.recent.length ? stats.recent.map((r) => (
            <RecentCard key={`${r.platform}-${r.id}`} item={r} conditionTags={conditionTags} onBuy={setBuyData} />
          )) : <div className="empty">Inga data ännu.</div>}
        </div>
      </div>

      <BuyDialog
        data={buyData}
        onClose={() => setBuyData(null)}
        onSaved={() => { setBuyData(null); onPortfolioChanged?.(); }}
      />
    </>
  );
}
