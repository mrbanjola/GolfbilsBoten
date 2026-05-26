import type { AnalyticsData, PortfolioCategory } from '../../api/types';

function fmt(n: number) { return n.toLocaleString('sv') + ' kr'; }

function profitCell(invested_sold: number, revenue: number) {
  if (!revenue) return <td>–</td>;
  const p = revenue - invested_sold;
  const cls = p > 0 ? 'profit-pos' : p < 0 ? 'profit-neg' : '';
  return <td className={cls}>{p >= 0 ? '+' : ''}{fmt(p)}</td>;
}

function marginCell(invested_sold: number, revenue: number) {
  if (!revenue || !invested_sold) return <td>–</td>;
  const m = Math.round(((revenue - invested_sold) / invested_sold) * 100);
  const cls = m > 0 ? 'profit-pos' : m < 0 ? 'profit-neg' : '';
  return <td className={cls}>{m > 0 ? '+' : ''}{m}%</td>;
}

interface Props {
  analytics: AnalyticsData;
  categories: PortfolioCategory[];
}

export function AnalyticsSection({ analytics, categories }: Props) {
  const { byCategory, byTag } = analytics;
  const hasSoldCategory = byCategory.some((r) => r.sold > 0);
  const hasSoldTag = byTag.some((r) => r.sold > 0);

  if (!hasSoldCategory && !hasSoldTag) return null;

  const catLabel = (val: string | null) =>
    categories.find((c) => c.value === val)?.label ?? 'Okategoriserad';

  return (
    <div className="analytics-wrap">
      {hasSoldCategory && (
        <div className="analytics-section">
          <div className="analytics-title">Vinst per kategori</div>
          <div className="analytics-scroll">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th className="analytics-hide-xs">Köpta</th>
                  <th>Sålda</th>
                  <th>Inv. (sålda)</th>
                  <th>Intäkt</th>
                  <th>Vinst</th>
                  <th className="analytics-hide-xs">Marginal</th>
                  <th className="analytics-hide-xs">Snitt tid</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.filter((r) => r.sold > 0).map((r, i) => (
                  <tr key={i}>
                    <td>{catLabel(r.category)}</td>
                    <td className="analytics-hide-xs">{r.items}</td>
                    <td>{r.sold}</td>
                    <td>{fmt(r.invested_sold)}</td>
                    <td>{fmt(r.revenue)}</td>
                    {profitCell(r.invested_sold, r.revenue)}
                    <td className="analytics-hide-xs">{marginCell(r.invested_sold, r.revenue)}</td>
                    <td className="analytics-hide-xs">{r.avg_days != null ? r.avg_days + ' dgr' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {hasSoldTag && (
        <div className="analytics-section" style={{ marginTop: 14 }}>
          <div className="analytics-title">Vinst per konditionstagg</div>
          <div className="analytics-scroll">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Tagg</th>
                  <th className="analytics-hide-xs">Köpta</th>
                  <th>Sålda</th>
                  <th>Inv. (sålda)</th>
                  <th>Intäkt</th>
                  <th>Vinst</th>
                </tr>
              </thead>
              <tbody>
                {byTag.filter((r) => r.sold > 0).map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td className="analytics-hide-xs">{r.items}</td>
                    <td>{r.sold}</td>
                    <td>{fmt(r.invested_sold)}</td>
                    <td>{fmt(r.revenue)}</td>
                    {profitCell(r.invested_sold, r.revenue)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
