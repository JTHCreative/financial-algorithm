import { SnapshotTicker } from "../lib/snapshot";
import { PriceChart } from "./PriceChart";

interface Props {
  ticker: SnapshotTicker;
  chartPeriod: string;
  chartInterval: string;
}

export function SnapshotDetail({ ticker, chartPeriod, chartInterval }: Props) {
  const t = ticker;
  const scoreClass = (s: number) => (s > 0 ? "score-pos" : s < 0 ? "score-neg" : "score-zero");

  return (
    <div className="chart-card">
      <div className="card-header">
        <div>
          <div className="ticker">
            {t.ticker} <span className="muted" style={{ fontSize: "0.9rem" }}>· {t.name}</span>
          </div>
          <div className="price">
            ${t.last_price.toFixed(2)} · {t.sector} · as of {t.last_date}
          </div>
        </div>
        <span className={`action-badge action-${t.signal.action}`}>{t.signal.action}</span>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">Backtest return ({t.backtest.first_date} → {t.backtest.last_date})</div>
          <div className={`metric-value ${t.backtest.strategy_return_pct >= 0 ? "pos" : "neg"}`}>
            {fmtPct(t.backtest.strategy_return_pct)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Buy & hold</div>
          <div className={`metric-value ${t.backtest.buy_hold_return_pct >= 0 ? "pos" : "neg"}`}>
            {fmtPct(t.backtest.buy_hold_return_pct)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Alpha</div>
          <div className={`metric-value ${t.backtest.alpha_pct >= 0 ? "pos" : "neg"}`}>
            {fmtPct(t.backtest.alpha_pct)}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Trades</div>
          <div className="metric-value">{t.backtest.num_trades}</div>
        </div>
      </div>

      <div className="summary">{t.signal.summary}</div>

      <div className="components">
        {t.signal.components.map((c) => (
          <div key={c.name} className="component">
            <div className="component-name">{c.name}</div>
            <div className={`component-score ${scoreClass(c.score)}`}>
              {c.score > 0 ? `+${c.score}` : c.score}
            </div>
            <div className="component-rationale">{c.rationale}</div>
          </div>
        ))}
      </div>

      {t.signal.action !== "HOLD" && t.signal.suggested_shares != null && (
        <div className="summary" style={{ marginTop: "0.75rem" }}>
          <strong>{t.signal.action}</strong> ~{t.signal.suggested_shares} shares
          (~${(t.signal.suggested_shares * t.last_price).toLocaleString(undefined, { maximumFractionDigits: 0 })})
          at {t.signal.suggested_allocation_pct.toFixed(1)}% of a $10k risk budget.
        </div>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>
        {t.ticker} — price with SMA & Bollinger Bands
      </h2>
      <PriceChart ticker={t.ticker} period={chartPeriod} interval={chartInterval} />
    </div>
  );
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
