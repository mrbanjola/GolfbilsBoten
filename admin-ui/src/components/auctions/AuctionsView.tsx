import { useEffect, useMemo, useState } from 'react';
import { api, jsonPatch } from '../../api/client';
import type { AuctionItem, AuctionListResponse, AuctionReviewState, AuctionSummary } from '../../api/types';
import { useToast } from '../../hooks/useToast';
import { AuctionCard } from './AuctionCard';

type ReviewFilter = 'visible' | 'interesting' | 'ignored';
type Sort = 'end_asc' | 'end_desc' | 'price_asc' | 'price_desc' | 'newest' | 'interesting';

const CATEGORY_LABELS: Record<string, string> = {
  car: 'Bil', boat: 'Båt', boat_motor: 'Båtmotor', golf_cart: 'Golfbil', excavator: 'Grävmaskin',
  accessory: 'Tillbehör', other_machine: 'Övriga maskiner', fordon: 'Fordon', bat: 'Båt',
  elektronik: 'Elektronik', sport: 'Sport & friluftsliv', mobler: 'Möbler & inredning',
  klader: 'Kläder', uncategorized: 'Okategoriserat',
};

const priceFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

function updatedLabel(value: string | null) {
  if (!value) return 'Ingen inhämtning ännu';
  const parsed = new Date(value.endsWith('Z') ? value : `${value}Z`);
  if (Number.isNaN(parsed.getTime())) return 'Okänd uppdateringstid';
  return `Senast uppdaterad ${new Intl.DateTimeFormat('sv-SE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(parsed)}`;
}

export function AuctionsView() {
  const toast = useToast();
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [summary, setSummary] = useState<AuctionSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [review, setReview] = useState<ReviewFilter>('visible');
  const [category, setCategory] = useState('');
  const [platform, setPlatform] = useState('');
  const [sort, setSort] = useState<Sort>('end_asc');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const listUrl = useMemo(() => {
    const params = new URLSearchParams({ review, sort, limit: '200' });
    if (category) params.set('category', category);
    if (platform) params.set('platform', platform);
    if (query) params.set('q', query);
    return `/api/auctions?${params.toString()}`;
  }, [category, platform, query, review, sort]);

  useEffect(() => {
    const controller = new AbortController();
    api<AuctionListResponse>(listUrl, { signal: controller.signal })
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setError('');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Kunde inte hämta auktioner');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [listUrl]);

  useEffect(() => {
    const controller = new AbortController();
    api<AuctionSummary>('/api/auctions/summary', { signal: controller.signal })
      .then(setSummary)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function handleReview(item: AuctionItem, state: AuctionReviewState) {
    const key = `${item.platform}:${item.external_id}`;
    const previousItems = items;
    const shouldDisappear = state === 'ignored' && review !== 'ignored'
      || state !== 'ignored' && review === 'ignored'
      || review === 'interesting' && state !== 'interesting';

    setBusyKey(key);
    setItems((current) => shouldDisappear
      ? current.filter((candidate) => `${candidate.platform}:${candidate.external_id}` !== key)
      : current.map((candidate) => `${candidate.platform}:${candidate.external_id}` === key
        ? { ...candidate, review_state: state }
        : candidate));

    try {
      await jsonPatch(`/api/auctions/${encodeURIComponent(item.platform)}/${encodeURIComponent(item.external_id)}/review`, {
        review_state: state,
      });
      const nextSummary = await api<AuctionSummary>('/api/auctions/summary');
      setSummary(nextSummary);
      if (shouldDisappear) setTotal((value) => Math.max(0, value - 1));
      toast(state === 'interesting' ? 'Markerad som intressant' : state === 'ignored' ? 'Auktionen ignorerades' : 'Markeringen togs bort');
    } catch (err: unknown) {
      setItems(previousItems);
      toast(err instanceof Error ? err.message : 'Kunde inte spara markeringen');
    } finally {
      setBusyKey('');
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setQuery(searchDraft.trim());
  }

  function changeReview(next: ReviewFilter) {
    setLoading(true);
    setReview(next);
  }

  return (
    <section className="auctions-view">
      <div className="auction-hero">
        <div>
          <span className="auction-eyebrow">Liveutbud</span>
          <h1>Auktionsradar</h1>
          <p>Alla aktiva objekt från dina auktionsbevakningar, samlade och prioriterade.</p>
        </div>
        <span className="auction-updated">{updatedLabel(summary?.last_updated_at ?? null)}</span>
      </div>

      <div className="auction-summary-grid">
        <button type="button" className="auction-summary-card" onClick={() => changeReview('visible')}>
          <span>Aktiva</span><strong>{summary?.active ?? '–'}</strong><small>i utbudet nu</small>
        </button>
        <button type="button" className="auction-summary-card summary-interest" onClick={() => changeReview('interesting')}>
          <span>Intressanta</span><strong>{summary?.interesting ?? '–'}</strong><small>markerade objekt</small>
        </button>
        <div className="auction-summary-card summary-urgent">
          <span>Slutar snart</span><strong>{summary?.ending_1h ?? '–'}</strong><small>inom en timme</small>
        </div>
        <div className="auction-summary-card">
          <span>Idag</span><strong>{summary?.ending_24h ?? '–'}</strong><small>slutar inom 24 h</small>
        </div>
      </div>

      {(summary?.byCategory.length ?? 0) > 0 && (
        <div className="auction-category-strip" aria-label="Kategorier">
          <button type="button" className={!category ? 'active' : ''} onClick={() => setCategory('')}>
            Alla <span>{summary?.active ?? 0}</span>
          </button>
          {summary?.byCategory.map((entry) => (
            <button
              type="button"
              className={category === entry.category ? 'active' : ''}
              key={entry.category}
              onClick={() => setCategory(category === entry.category ? '' : entry.category)}
            >
              {CATEGORY_LABELS[entry.category] ?? entry.category}
              <span>{entry.count}</span>
              {entry.avg_price != null && <small>snitt {priceFormatter.format(entry.avg_price)} kr</small>}
            </button>
          ))}
        </div>
      )}

      <div className="auction-toolbar">
        <div className="auction-review-tabs">
          <button type="button" className={review === 'visible' ? 'active' : ''} onClick={() => changeReview('visible')}>Alla</button>
          <button type="button" className={review === 'interesting' ? 'active' : ''} onClick={() => changeReview('interesting')}>★ Intressanta</button>
          <button type="button" className={review === 'ignored' ? 'active' : ''} onClick={() => changeReview('ignored')}>Ignorerade ({summary?.ignored ?? 0})</button>
        </div>
        <form className="auction-search" onSubmit={submitSearch}>
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Sök titel eller plats" aria-label="Sök auktioner" />
          <button type="submit">Sök</button>
        </form>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Filtrera plattform">
          <option value="">Alla plattformar</option>
          {summary?.byPlatform.map((entry) => <option value={entry.platform} key={entry.platform}>{entry.platform} ({entry.count})</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sortera auktioner">
          <option value="end_asc">Kortast tid kvar</option>
          <option value="end_desc">Längst tid kvar</option>
          <option value="price_asc">Lägst pris</option>
          <option value="price_desc">Högst pris</option>
          <option value="newest">Nyligen hittade</option>
          <option value="interesting">Intressanta först</option>
        </select>
      </div>

      <div className="auction-list-head">
        <strong>{loading ? 'Hämtar auktioner…' : `${total} ${total === 1 ? 'auktion' : 'auktioner'}`}</strong>
        {(category || platform || query) && (
          <button type="button" onClick={() => { setCategory(''); setPlatform(''); setQuery(''); setSearchDraft(''); }}>Rensa filter</button>
        )}
      </div>

      {error && <div className="auction-error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="auction-empty">
          <span>◌</span>
          <strong>Inga auktioner i den här vyn</strong>
          <p>Justera filtren eller invänta nästa auktionspollning.</p>
        </div>
      )}
      <div className="auction-list">
        {items.map((item) => {
          const key = `${item.platform}:${item.external_id}`;
          return <AuctionCard key={key} item={item} busy={busyKey === key} onReview={handleReview} />;
        })}
      </div>
    </section>
  );
}
