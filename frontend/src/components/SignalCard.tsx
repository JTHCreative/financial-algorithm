import { SignalResult } from "../api";

interface Props {
  result: SignalResult;
  onSelect: (ticker: string) => void;
  selected: boolean;
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function SignalCard({ result, onSelect, selected }: Props) {
  const scoreClass = (s: number) =>
    s > 0 ? "score-pos" : s < 0 ? "score-neg" : "score-zero";
  const dollars =
    result.suggested_shares !== null
      ? result.suggested_shares * result.last_price
      : null;

  return (
    <div
      className="card"
      style={{
        cursor: "pointer",
        outline: selected ? "2px solid var(--accent)" : "none",
      }}
      onClick={() => onSelect(result.ticker)}
    >
      <div className="card-header">
        <div>
          <div className="ticker">{result.ticker}</div>
          <div className="price">{formatCurrency(result.last_price)}</div>
        </div>
        <span className={`action-badge action-${result.action}`}>
          {result.action}
        </span>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">Confidence</div>
          <div className="metric-value">
            {(result.confidence * 100).toFixed(0)}%
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Allocation</div>
          <div className="metric-value">
            {result.suggested_allocation_pct.toFixed(1)}%
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Suggested</div>
          <div className="metric-value">
            {result.suggested_shares !== null
              ? `${result.suggested_shares} sh`
              : "—"}
          </div>
        </div>
      </div>

      {dollars !== null && result.action !== "HOLD" && (
        <div className="summary">
          <strong>{result.action}</strong> ~{result.suggested_shares} shares
          (≈ {formatCurrency(dollars)}).
        </div>
      )}

      <div className="summary">{result.summary}</div>

      <div className="components">
        {result.components.map((c) => (
          <div key={c.name} className="component">
            <div className="component-name">{c.name}</div>
            <div className={`component-score ${scoreClass(c.score)}`}>
              {c.score > 0 ? `+${c.score}` : c.score}
            </div>
            <div className="component-rationale">{c.rationale}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
