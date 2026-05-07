import type { Watch, Location, PortfolioCategory } from '../../api/types';

interface WatchCardProps {
  watch: Watch;
  locations: Location[];
  categories: PortfolioCategory[];
  onTogglePause: (id: number, paused: number) => void;
  onEdit: (watch: Watch) => void;
  onDelete: (id: number, query: string) => void;
}

export function WatchCard({ watch, locations, categories, onTogglePause, onEdit, onDelete }: WatchCardProps) {
  const chips: React.ReactNode[] = [];

  if (watch.paused) chips.push(<span key="paused" className="chip chip-paused">⏸ Pausad</span>);

  if (watch.min_price || watch.max_price) {
    const parts: string[] = [];
    if (watch.min_price) parts.push(watch.min_price.toLocaleString('sv') + ' kr');
    if (watch.max_price) parts.push('max ' + watch.max_price.toLocaleString('sv') + ' kr');
    chips.push(<span key="price" className="chip chip-green">💰 {parts.join(' – ')}</span>);
  }

  const loc = locations.find((l) => l.value === watch.location)?.label;
  if (loc) chips.push(<span key="loc" className="chip chip-blue">📍 {loc}</span>);

  if (watch.ad_type === 'sell') chips.push(<span key="adtype" className="chip chip-slate">Säljes</span>);
  else if (watch.ad_type === 'buy') chips.push(<span key="adtype" className="chip chip-amber">Köpes</span>);

  const platforms = (watch.platforms || 'blocket').split(',').map((p) => p.trim());
  chips.push(<span key="platforms" className="chip chip-slate">🌐 {platforms.join(' · ')}</span>);

  if (watch.exclude_words) chips.push(<span key="excl" className="chip chip-red">✕ {watch.exclude_words}</span>);

  const categoryLabel = watch.category ? categories.find((c) => c.value === watch.category)?.label : null;
  if (categoryLabel) chips.push(<span key="cat" className="chip chip-teal">🏷 {categoryLabel}</span>);

  return (
    <div className={`watch-card${watch.paused ? ' paused' : ''}`}>
      <div className="watch-info">
        <div className="watch-title">
          {watch.query}
          {watch.is_car ? <span className="chip chip-blue">🚗 Bil</span> : null}
        </div>
        <div className="watch-chips">{chips}</div>
      </div>
      <div className="watch-actions">
        <button className="btn-secondary btn-sm" onClick={() => onTogglePause(watch.id, watch.paused)}>
          {watch.paused ? '▶ Återuppta' : '⏸ Pausa'}
        </button>
        <button className="btn-secondary btn-sm" onClick={() => onEdit(watch)}>Ändra</button>
        <button className="btn-danger btn-sm" onClick={() => onDelete(watch.id, watch.query)}>Ta bort</button>
      </div>
    </div>
  );
}
