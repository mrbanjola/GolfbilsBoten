import type { Location, PortfolioCategory } from '../../api/types';

const PLATFORMS = ['blocket', 'tradera', 'klaravik', 'blinto', 'auctionet', 'budi', 'junora', 'facebook'];

export interface WatchFormValues {
  query: string;
  min_price: string;
  max_price: string;
  location: string;
  ad_type: string;
  platforms: string;
  category: string;
  exclude_words: string;
  is_car: boolean;
}

interface Props {
  values: WatchFormValues;
  onChange: (values: WatchFormValues) => void;
  locations: Location[];
  categories: PortfolioCategory[];
  showQuery?: boolean;
}

export function WatchFormFields({ values, onChange, locations, categories, showQuery = true }: Props) {
  const set = (field: keyof WatchFormValues, value: string | boolean) =>
    onChange({ ...values, [field]: value });

  return (
    <>
      {showQuery && (
        <div className="field">
          <label>Sökterm *</label>
          <input
            value={values.query}
            onChange={(e) => set('query', e.target.value)}
            placeholder="t.ex. Yamaha utombordare"
            required
          />
        </div>
      )}
      <div className="field">
        <label>Minpris (kr)</label>
        <input type="number" min="0" value={values.min_price} onChange={(e) => set('min_price', e.target.value)} placeholder="t.ex. 1 000" />
      </div>
      <div className="field">
        <label>Maxpris (kr)</label>
        <input type="number" min="0" value={values.max_price} onChange={(e) => set('max_price', e.target.value)} placeholder="t.ex. 50 000" />
      </div>
      <div className="field">
        <label>Region</label>
        <select value={values.location} onChange={(e) => set('location', e.target.value)}>
          <option value="">Hela Sverige</option>
          {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Annonstyp</label>
        <select value={values.ad_type} onChange={(e) => set('ad_type', e.target.value)}>
          <option value="all">Alla</option>
          <option value="sell">Bara säljes</option>
          <option value="buy">Bara köpes</option>
        </select>
      </div>
      <div className="field">
        <label>Plattformar</label>
        <div className="tag-checkbox-list">
          {PLATFORMS.map((p) => {
            const selected = values.platforms.split(',').map((s) => s.trim()).includes(p);
            return (
              <label key={p} className="tag-checkbox-label">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = new Set(values.platforms.split(',').map((s) => s.trim()).filter(Boolean));
                    if (current.has(p)) current.delete(p); else current.add(p);
                    set('platforms', [...current].join(','));
                  }}
                />
                <span>{p.charAt(0).toUpperCase() + p.slice(1)}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="field">
        <label>Kategori <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(för AI-kontext)</span></label>
        <select value={values.category} onChange={(e) => set('category', e.target.value)}>
          <option value="">– Ingen –</option>
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Exkludera ord</label>
        <input value={values.exclude_words} onChange={(e) => set('exclude_words', e.target.value)} placeholder="t.ex. köpes, sökes, reservdelar" />
      </div>
      <div className="check-row">
        <input className="styled" id="watch-is-car" type="checkbox" checked={values.is_car} onChange={(e) => set('is_car', e.target.checked)} />
        <label className="check-label" htmlFor="watch-is-car">Blocket bilsökning</label>
      </div>
    </>
  );
}

export const EMPTY_WATCH_FORM: WatchFormValues = {
  query: '',
  min_price: '',
  max_price: '',
  location: '',
  ad_type: 'all',
  platforms: 'blocket',
  category: '',
  exclude_words: '',
  is_car: false,
};
