import { useState } from 'react';
import { api } from './api/client';
import { WatchesView } from './components/watches/WatchesView';
import { StatsView } from './components/stats/StatsView';
import { PortfolioView } from './components/portfolio/PortfolioView';
import { AuctionsView } from './components/auctions/AuctionsView';
import type { Tag } from './api/types';

type Tab = 'watches' | 'auctions' | 'stats' | 'portfolio';

export function App() {
  const [tab, setTab] = useState<Tab>('watches');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState('');
  const [conditionTags, setConditionTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);

  function handleTagsLoaded(cond: Tag[], all: Tag[]) {
    setConditionTags(cond);
    setAllTags(all);
  }

  async function manualSearch() {
    setSearching(true);
    setSearchResult('');
    try {
      const data = await api<{ totalNew: number }>('/api/search', { method: 'POST' });
      setSearchResult(data.totalNew > 0 ? `${data.totalNew} nya träffar` : 'Ingenting nytt');
    } catch (err: unknown) {
      setSearchResult(err instanceof Error ? err.message : 'Fel');
    } finally {
      setSearching(false);
      setTimeout(() => setSearchResult(''), 5000);
    }
  }

  return (
    <>
      <header>
        <div className="brand">
          <div className="brand-icon">🔍</div>
          <span className="brand-name">Begagnat Monitor</span>
        </div>
        <div className="header-right">
          {tab === 'auctions' ? (
            <span style={{ fontSize: '.76rem', color: 'var(--text-3)' }}>Uppdateras automatiskt</span>
          ) : (
            <>
              <span style={{ fontSize: '.82rem', color: 'var(--text-3)' }}>{searchResult}</span>
              <button className="btn-ghost" onClick={manualSearch} disabled={searching}>
                {searching ? <><span className="spinner" /> Söker...</> : 'Sök nu'}
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        {tab === 'watches' && <WatchesView />}
        {tab === 'auctions' && <AuctionsView />}
        {tab === 'stats' && <StatsView conditionTags={conditionTags} />}
        {tab === 'portfolio' && (
          <PortfolioView conditionTags={conditionTags} allTags={allTags} onTagsLoaded={handleTagsLoaded} />
        )}
      </main>

      <nav className="bottom-nav">
        {(['watches', 'auctions', 'stats', 'portfolio'] as Tab[]).map((t) => {
          const icons: Record<Tab, string> = { watches: '📋', auctions: '🔨', stats: '📊', portfolio: '💰' };
          const labels: Record<Tab, string> = { watches: 'Bevakningar', auctions: 'Auktioner', stats: 'Statistik', portfolio: 'Portfolio' };
          return (
            <button key={t} className={`nav-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              <span className="nav-icon">{icons[t]}</span>
              {labels[t]}
            </button>
          );
        })}
      </nav>
    </>
  );
}
