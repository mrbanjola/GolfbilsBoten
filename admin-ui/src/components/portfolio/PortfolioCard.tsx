import type { PortfolioItem, Tag, PortfolioCategory } from '../../api/types';
import { PlatformChip } from '../shared/PlatformChip';
import { ConditionBadge } from '../shared/ConditionBadge';
import { PcardImgPlaceholder } from '../shared/ThumbPlaceholder';
import type { SellTarget } from './SellDialog';

export function totalInvested(item: PortfolioItem) {
  return item.purchase_price + (item.costs ?? []).reduce((s, c) => s + c.amount, 0);
}

interface Props {
  item: PortfolioItem;
  conditionTags: Tag[];
  allTags: Tag[];
  categories: PortfolioCategory[];
  onSell: (target: SellTarget) => void;
  onEdit: (item: PortfolioItem) => void;
}

export function PortfolioCard({ item, conditionTags, allTags, categories, onSell, onEdit }: Props) {
  const costs = item.costs ?? [];
  const extraTotal = costs.reduce((s, c) => s + c.amount, 0);
  const invested = item.purchase_price + extraTotal;
  const dateStr = item.purchased_at ? new Date(item.purchased_at).toLocaleDateString('sv-SE') : '–';
  const showInvested = costs.length > 0;
  const categoryLabel = item.category ? categories.find((c) => c.value === item.category)?.label : null;

  return (
    <div className="portfolio-card">
      <div className="pcard-top">
        {item.image_url
          ? <img className="pcard-img" src={item.image_url} alt="" loading="lazy" onError={(e) => { const el = e.currentTarget; const ph = document.createElement('div'); ph.className = 'pcard-img-placeholder'; ph.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'; el.replaceWith(ph); }} />
          : <PcardImgPlaceholder />
        }
        <div className="pcard-body">
          <div className="pcard-header">
            <span className="pcard-title" title={item.title}>{item.title ?? 'Okänd annons'}</span>
            <PlatformChip platform={item.platform} style={{ flexShrink: 0 } as React.CSSProperties} />
          </div>
          <div className="pcard-date">{dateStr}{item.watch_query ? ` · ${item.watch_query}` : ''}</div>
          <div className="pcard-rows">
            <div className="pcard-row">
              <span className="pcard-row-label">Inköpspris</span>
              <span className="pcard-row-value">{item.purchase_price.toLocaleString('sv')} kr</span>
            </div>
            {costs.map((c, i) => (
              <div key={i} className="pcard-row">
                <span className="pcard-row-label">{c.description}</span>
                <span className="pcard-row-value muted">{c.amount.toLocaleString('sv')} kr</span>
              </div>
            ))}
            {showInvested && (
              <>
                <hr className="pcard-divider" />
                <div className="pcard-row pcard-invested">
                  <span className="pcard-row-label">Totalt investerat</span>
                  <span className="pcard-row-value">{invested.toLocaleString('sv')} kr</span>
                </div>
              </>
            )}
          </div>
          {item.notes && <div className="pcard-notes">{item.notes}</div>}
          {(item.condition || item.category || (item.tags ?? []).length > 0) && (
            <div className="pcard-tags">
              {item.condition && <ConditionBadge condition={item.condition} conditionTags={conditionTags} />}
              {categoryLabel && <span className="pcard-category">{categoryLabel}</span>}
              {(item.tags ?? []).map((dn) => (
                <span key={dn} className="pcard-tag">{allTags.find((t) => t.data_name === dn)?.label ?? dn}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="pcard-footer">
        {item.sold_at ? (
          <div className="pcard-result">
            {(() => {
              const p = (item.sold_price ?? 0) - invested;
              return (
                <>
                  <span className={`profit-badge ${p >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                    {p >= 0 ? '+' : ''}{p.toLocaleString('sv')} kr
                  </span>
                  <span className="profit-sold-price">Såld: {(item.sold_price ?? 0).toLocaleString('sv')} kr</span>
                </>
              );
            })()}
          </div>
        ) : (
          <div className="pcard-result">
            <span className="profit-badge profit-held">I lager</span>
            <button className="btn-sell" onClick={() => onSell({ type: 'item', id: item.id, title: item.title })}>
              Markera såld
            </button>
          </div>
        )}
        <div className="pcard-actions">
          <button className="btn-edit-portfolio" onClick={() => onEdit(item)}>Ändra</button>
        </div>
      </div>
    </div>
  );
}
