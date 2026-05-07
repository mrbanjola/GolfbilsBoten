import type { Bundle } from '../../api/types';
import { BundleThumbPlaceholder } from '../shared/ThumbPlaceholder';
import { totalInvested } from './PortfolioCard';
import type { SellTarget } from './SellDialog';

interface Props {
  bundle: Bundle;
  onSell: (target: SellTarget) => void;
  onDissolve: (id: number) => void;
}

export function BundleCard({ bundle, onSell, onDissolve }: Props) {
  const bundleInvested = bundle.items.reduce((s, i) => s + totalInvested(i), 0);

  return (
    <div className="portfolio-card bundle-card">
      <div className="pcard-top bundle-header">
        <span className="bundle-icon">📦</span>
        <div className="pcard-body">
          <div className="pcard-header">
            <span className="pcard-title">{bundle.name}</span>
            <span className="chip chip-slate" style={{ flexShrink: 0, fontSize: '.68rem' }}>
              paket · {bundle.items.length} obj
            </span>
          </div>
        </div>
      </div>
      <div className="bundle-items">
        {bundle.items.map((item) => {
          const invested = totalInvested(item);
          const costsNote = item.costs?.length
            ? ` +${item.costs.length} kostnad${item.costs.length > 1 ? 'er' : ''}`
            : '';
          return (
            <div key={item.id} className="bundle-item-row">
              {item.image_url
                ? <img className="bundle-item-thumb" src={item.image_url} alt="" loading="lazy" />
                : <BundleThumbPlaceholder />
              }
              <span className="bundle-item-title" title={item.title ?? undefined}>{item.title ?? 'Okänd annons'}</span>
              <span className="bundle-item-price">{invested.toLocaleString('sv')} kr{costsNote}</span>
            </div>
          );
        })}
      </div>
      <div className="bundle-total-row">
        <span>Totalt investerat</span>
        <span>{bundleInvested.toLocaleString('sv')} kr</span>
      </div>
      <div className="pcard-footer">
        {bundle.sold_at ? (
          <>
            <div className="pcard-result">
              {(() => {
                const p = (bundle.sold_price ?? 0) - bundleInvested;
                return (
                  <>
                    <span className={`profit-badge ${p >= 0 ? 'profit-positive' : 'profit-negative'}`}>
                      {p >= 0 ? '+' : ''}{p.toLocaleString('sv')} kr
                    </span>
                    <span className="profit-sold-price">Såld: {(bundle.sold_price ?? 0).toLocaleString('sv')} kr</span>
                  </>
                );
              })()}
            </div>
            <div className="pcard-actions">
              <button className="btn-dissolve" onClick={() => onDissolve(bundle.id)}>Upplös paket</button>
            </div>
          </>
        ) : (
          <>
            <div className="pcard-result">
              <span className="profit-badge profit-held">I lager</span>
              <button className="btn-sell" onClick={() => onSell({ type: 'bundle', id: bundle.id, title: bundle.name })}>
                Markera såld
              </button>
            </div>
            <div className="pcard-actions">
              <button className="btn-dissolve" onClick={() => onDissolve(bundle.id)}>Upplös paket</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
