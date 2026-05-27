import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, Snapshot, SnapshotTicker } from "../lib/snapshot";

type SortKey =
  | "ticker"
  | "name"
  | "sector"
  | "last_price"
  | "action"
  | "confidence"
  | "strategy_return_pct"
  | "buy_hold_return_pct"
  | "alpha_pct"
  | "num_trades";

type SortDir = "asc" | "desc";

const ACTION_RANK: Record<string, number> = { BUY: 0, HOLD: 1, SELL: 2 };

interface Props {
  onSelect: (ticker: string) => void;
  selected: string | null;
}

export function Screener({ onSelect, selected }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<"ALL" | "BUY" | "SELL" | "HOLD">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("alpha_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    loadSnapshot()
      .then((s) => !cancelled && setSnapshot(s))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const sectors = useMemo(() => {
    if (!snapshot) return [] as string[];
    return Array.from(new Set(snapshot.tickers.map((t) => t.sector))).sort();
  }, [snapshot]);
  const [sector, setSector] = useState<string>("ALL");

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const q = query.trim().toUpperCase();
    let r = snapshot.tickers.filter((t) => {
      if (action !== "ALL" && t.signal.action !== action) return false;
      if (sector !== "ALL" && t.sector !== sector) return false;
      if (!q) return true;
      return t.ticker.includes(q) || t.name.toUpperCase().includes(q);
    });
    r = r.slice().sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
    return r;
  }, [snapshot, query, action, sector, sortKey, sortDir]);

  if (loading) return <div className="summary">Loading snapshot…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!snapshot || snapshot.tickers.length === 0) {
    return (
      <div className="error">
        No snapshot data yet. Trigger the <code>Daily S&amp;P 500 snapshot</code>{" "}
        workflow in GitHub Actions to build it.
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(numericKey(key) ? "desc" : "asc");
    }
  };

  return (
    <div>
      <div className="screener-meta">
        Snapshot generated{" "}
        <strong>
          {snapshot.generated_at
            ? new Date(snapshot.generated_at).toLocaleString()
            : "—"}
        </strong>{" "}
        · {snapshot.count} tickers · backtest window {snapshot.period}
      </div>

      <div className="filters">
        <input
          placeholder="Search ticker or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as "ALL" | "BUY" | "SELL" | "HOLD")}
        >
          <option value="ALL">All signals</option>
          <option value="BUY">BUY only</option>
          <option value="SELL">SELL only</option>
          <option value="HOLD">HOLD only</option>
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="ALL">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="row-count">
          {rows.length} of {snapshot.count}
        </div>
      </div>

      <div className="table-wrap">
        <table className="screener">
          <thead>
            <tr>
              <Th label="Ticker" k="ticker" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Sector" k="sector" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Price" k="last_price" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <Th label="Signal" k="action" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <Th label="Conf" k="confidence" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <Th label="Strategy %" k="strategy_return_pct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <Th label="Buy&Hold %" k="buy_hold_return_pct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <Th label="Alpha" k="alpha_pct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
              <Th label="Trades" k="num_trades" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr
                key={t.ticker}
                onClick={() => onSelect(t.ticker)}
                className={selected === t.ticker ? "selected" : ""}
              >
                <td className="mono"><strong>{t.ticker}</strong></td>
                <td className="truncate" title={t.name}>{t.name}</td>
                <td className="muted">{t.sector}</td>
                <td className="right mono">{t.last_price.toFixed(2)}</td>
                <td>
                  <span className={`action-badge action-${t.signal.action}`}>
                    {t.signal.action}
                  </span>
                </td>
                <td className="right mono">{(t.signal.confidence * 100).toFixed(0)}%</td>
                <td className={`right mono ${pnlClass(t.backtest.strategy_return_pct)}`}>
                  {fmtPct(t.backtest.strategy_return_pct)}
                </td>
                <td className={`right mono ${pnlClass(t.backtest.buy_hold_return_pct)}`}>
                  {fmtPct(t.backtest.buy_hold_return_pct)}
                </td>
                <td className={`right mono ${pnlClass(t.backtest.alpha_pct)}`}>
                  {fmtPct(t.backtest.alpha_pct)}
                </td>
                <td className="right mono muted">{t.backtest.num_trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function numericKey(k: SortKey): boolean {
  return ["last_price", "confidence", "strategy_return_pct", "buy_hold_return_pct", "alpha_pct", "num_trades"].includes(k);
}

function getSortValue(t: SnapshotTicker, k: SortKey): number | string {
  switch (k) {
    case "ticker": return t.ticker;
    case "name": return t.name;
    case "sector": return t.sector;
    case "last_price": return t.last_price;
    case "action": return ACTION_RANK[t.signal.action] ?? 99;
    case "confidence": return t.signal.confidence;
    case "strategy_return_pct": return t.backtest.strategy_return_pct;
    case "buy_hold_return_pct": return t.backtest.buy_hold_return_pct;
    case "alpha_pct": return t.backtest.alpha_pct;
    case "num_trades": return t.backtest.num_trades;
  }
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function pnlClass(v: number): string {
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "muted";
}

interface ThProps {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}

function Th({ label, k, sortKey, sortDir, onSort, align = "left" }: ThProps) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
      className={`${active ? "active" : ""} ${align === "right" ? "right" : ""}`}
    >
      {label}
      {active && <span className="sort-arrow">{sortDir === "asc" ? " ▲" : " ▼"}</span>}
    </th>
  );
}
