import type { AnalyticsData, PortfolioCategory } from '../../api/types';

function profitCell(invested: number, revenue: number) {
  if (!revenue) return <td>–</td>;
  const p = revenue - invested;
  const cls = p > 0 ? 'profit-pos' : p < 0 ? 'profit-neg' : '';
  return <td className={cls}>{p >= 0 ? '+' : ''}{p.toLocaleString('sv')} kr</td>;
}

function marginCell(invested: number, revenue: number) {
  if (!revenue || !invested) return <td>–</td>;
  const m = Math.round(((revenue - invested) / invested) * 100);
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
                <tr><th>Kategori</th><th>Köp</th><th>Sålda</th><th>Investerat</th><th>Intäkt</th><th>Vinst</th><th>Marginal</th><th>Snitt tid</th></tr>
              </thead>
              <tbody>
                {byCategory.filter((r) => r.sold > 0).map((r, i) => (
                  <tr key={i}>
                    <td>{catLabel(r.category)}</td>
                    <td>{r.items}</td>
                    <td>{r.sold}</td>
                    <td>{r.invested.toLocaleString('sv')} kr</td>
                    <td>{r.revenue.toLocaleString('sv')} kr</td>
                    {profitCell(r.invested, r.revenue)}
                    {marginCell(r.invested, r.revenue)}
                    <td>{r.avg_days != null ? r.avg_days + ' dgr' : '–'}</td>
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
                <tr><th>Tagg</th><th>Köp</th><th>Sålda</th><th>Investerat</th><th>Intäkt</th><th>Vinst</th></tr>
              </thead>
              <tbody>
                {byTag.filter((r) => r.sold > 0).map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td>{r.items}</td>
                    <td>{r.sold}</td>
                    <td>{r.invested.toLocaleString('sv')} kr</td>
                    <td>{r.revenue.toLocaleString('sv')} kr</td>
                    {profitCell(r.invested, r.revenue)}
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
