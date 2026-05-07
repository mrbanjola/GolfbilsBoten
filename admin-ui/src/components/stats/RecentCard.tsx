import type { RecentItem, Tag } from '../../api/types';
import { PlatformChip } from '../shared/PlatformChip';
import { ConditionBadge } from '../shared/ConditionBadge';
import { ThumbPlaceholder } from '../shared/ThumbPlaceholder';
import type { PendingPurchase } from '../portfolio/BuyDialog';

function timeAgo(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'nyss';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

const PlusIcon = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="6" y1="1" x2="6" y2="11" />
    <line x1="1" y1="6" x2="11" y2="6" />
  </svg>
);

interface Props {
  item: RecentItem;
  conditionTags: Tag[];
  onBuy: (data: PendingPurchase) => void;
}

export function RecentCard({ item, conditionTags, onBuy }: Props) {
  const tags: string[] = item.tags ? JSON.parse(item.tags) : [];

  function handleBuy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onBuy({
      listing_id: item.id,
      platform: item.platform,
      title: item.title,
      url: item.url,
      image_url: item.image_url ?? null,
      watch_query: item.watch_query ?? null,
    });
  }

  return (
    <a className="recent-card" href={item.url || '#'} target="_blank" rel="noopener">
      {item.image_url ? (
        <img
          className="recent-thumb"
          src={item.image_url}
          alt=""
          loading="lazy"
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            el.parentElement?.insertAdjacentHTML('afterbegin', '<div class="recent-thumb recent-thumb-placeholder" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>');
          }}
        />
      ) : (
        <ThumbPlaceholder />
      )}
      <div className="recent-body">
        <span className="recent-title" title={item.title}>{item.title ?? '–'}</span>
        <div className="recent-meta">
          <PlatformChip platform={item.platform} />
          <span className="recent-price">{item.price != null ? item.price.toLocaleString('sv') + ' kr' : '–'}</span>
          <span className="recent-time">{timeAgo(item.first_seen_at)}</span>
          {item.condition && <ConditionBadge condition={item.condition} conditionTags={conditionTags} className="pcard-condition recent-condition" />}
          {tags.map((tag) => <span key={tag} className="pcard-tag">{tag}</span>)}
          <button className="btn-buy" onClick={handleBuy}>
            {PlusIcon} Köpt
          </button>
        </div>
      </div>
    </a>
  );
}
