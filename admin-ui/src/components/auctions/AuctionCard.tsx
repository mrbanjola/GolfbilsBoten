import { useState } from 'react';
import type { AuctionItem, AuctionReviewState } from '../../api/types';
import { PlatformChip } from '../shared/PlatformChip';
import { ThumbPlaceholder } from '../shared/ThumbPlaceholder';

const CATEGORY_LABELS: Record<string, string> = {
  car: 'Bil',
  boat: 'Båt',
  boat_motor: 'Båtmotor',
  golf_cart: 'Golfbil',
  excavator: 'Grävmaskin',
  accessory: 'Tillbehör',
  other_machine: 'Övriga maskiner',
  fordon: 'Fordon',
  bat: 'Båt',
  elektronik: 'Elektronik',
  sport: 'Sport & friluftsliv',
  mobler: 'Möbler & inredning',
  klader: 'Kläder',
  uncategorized: 'Okategoriserat',
};

const priceFormatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const endFormatter = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

function remaining(end: string | null) {
  if (!end) return { label: 'Sluttid saknas', urgency: 'unknown' };
  const milliseconds = new Date(end).getTime() - Date.now();
  if (!Number.isFinite(milliseconds)) return { label: 'Sluttid saknas', urgency: 'unknown' };
  if (milliseconds <= 0) return { label: 'Avslutad', urgency: 'ended' };

  const minutes = Math.ceil(milliseconds / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const label = days > 0
    ? `${days} d ${hours % 24} h kvar`
    : hours > 0
      ? `${hours} h ${minutes % 60} min kvar`
      : `${minutes} min kvar`;
  const urgency = minutes <= 60 ? 'critical' : minutes <= 360 ? 'soon' : minutes <= 1440 ? 'today' : 'normal';
  return { label, urgency };
}

function AuctionThumb({ item }: { item: AuctionItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.image_url || failed) return <ThumbPlaceholder className="auction-thumb auction-thumb-placeholder" />;
  return <img className="auction-thumb" src={item.image_url} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

interface Props {
  item: AuctionItem;
  busy: boolean;
  onReview: (item: AuctionItem, state: AuctionReviewState) => void;
}

export function AuctionCard({ item, busy, onReview }: Props) {
  const countdown = remaining(item.auction_end);
  const isInteresting = item.review_state === 'interesting';
  const isIgnored = item.review_state === 'ignored';

  return (
    <article className={`auction-row${isInteresting ? ' is-interesting' : ''}${isIgnored ? ' is-ignored' : ''}`}>
      <AuctionThumb item={item} />

      <div className="auction-main">
        <div className="auction-title-line">
          <a href={item.url} target="_blank" rel="noreferrer" className="auction-title">{item.title}</a>
          {isInteresting && <span className="auction-interest-label">★ Intressant</span>}
        </div>
        {item.subtitle && <p className="auction-subtitle">{item.subtitle}</p>}
        <div className="auction-chips">
          <PlatformChip platform={item.platform} />
          {item.categories.map((category) => (
            <span className="chip auction-category-chip" key={category}>
              {CATEGORY_LABELS[category] ?? category}
            </span>
          ))}
          {item.no_reserve === 1 && <span className="chip chip-green">Inget reservationspris</span>}
          {item.no_reserve !== 1 && item.reserve_met === 1 && <span className="chip chip-blue">Reservationspris uppnått</span>}
        </div>
        <div className="auction-secondary">
          {item.location && <span>⌖ {item.location}</span>}
          {item.watch_queries.length > 0 && <span>Bevakning: {item.watch_queries.join(', ')}</span>}
        </div>
      </div>

      <div className="auction-numbers">
        <strong>{item.current_price == null ? 'Pris saknas' : `${priceFormatter.format(item.current_price)} kr`}</strong>
        <span>{item.bid_count} {item.bid_count === 1 ? 'bud' : 'bud'}</span>
      </div>

      <div className={`auction-time urgency-${countdown.urgency}`}>
        <strong>{countdown.label}</strong>
        {item.auction_end && <span>{endFormatter.format(new Date(item.auction_end))}</span>}
      </div>

      <div className="auction-actions">
        {!isIgnored && (
          <button
            type="button"
            className={`auction-action-interest${isInteresting ? ' active' : ''}`}
            disabled={busy}
            onClick={() => onReview(item, isInteresting ? 'unreviewed' : 'interesting')}
            aria-label={isInteresting ? 'Ta bort intressemarkering' : 'Markera som intressant'}
            title={isInteresting ? 'Ta bort intressemarkering' : 'Markera som intressant'}
          >
            {isInteresting ? '★' : '☆'}
          </button>
        )}
        <button
          type="button"
          className={isIgnored ? 'auction-action-restore' : 'auction-action-ignore'}
          disabled={busy}
          onClick={() => onReview(item, isIgnored ? 'unreviewed' : 'ignored')}
        >
          {isIgnored ? 'Återställ' : 'Ignorera'}
        </button>
      </div>
    </article>
  );
}
