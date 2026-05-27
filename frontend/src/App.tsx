import { useState } from "react";
import { fetchSignals, SignalResponse } from "./api";
import { SignalCard } from "./components/SignalCard";
import { PriceChart } from "./components/PriceChart";

const PERIODS = ["3mo", "6mo", "1y", "2y", "5y"];
const INTERVALS = ["1d", "1wk"];

export default function App() {
  const [tickers, setTickers] = useState("AAPL, MSFT, NVDA");
  const [period, setPeriod] = useState("1y");
  const [interval, setInterval] = useState("1d");
  const [riskBudget, setRiskBudget] = useState(10000);
  const [maxPositionPct, setMaxPositionPct] = useState(25);

  const [data, setData] = useState<SignalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const parseTickers = (raw: string) =>
    raw
      .split(/[,\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

  const handleRun = async () => {
    const parsed = parseTickers(tickers);
    if (parsed.length === 0) {
      setError("Enter at least one ticker.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSignals({
        tickers: parsed,
        period,
        interval,
        risk_budget: riskBudget,
        max_position_pct: maxPositionPct,
      });
      setData(res);
      if (res.results.length > 0) {
        setSelectedTicker(res.results[0].ticker);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Financial Algorithm</h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Technical-analysis signals · {new Date().toLocaleDateString()}
        </span>
      </header>

      <div className="disclaimer">
        <strong>Disclaimer:</strong> These signals are for educational purposes only
        and are not financial advice. Past performance does not guarantee future
        results. Do your own research before making any investment decisions.
      </div>

      <div className="controls">
        <div>
          <label>Tickers (comma separated)</label>
          <input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="AAPL, MSFT, NVDA"
          />
        </div>
        <div>
          <label>Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Interval</label>
          <select value={interval} onChange={(e) => setInterval(e.target.value)}>
            {INTERVALS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Risk Budget ($)</label>
          <input
            type="number"
            min={100}
            step={100}
            value={riskBudget}
            onChange={(e) => setRiskBudget(Number(e.target.value))}
          />
        </div>
        <button
          className="primary"
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? "Running…" : "Generate Signals"}
        </button>
      </div>

      <div style={{ marginBottom: "1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
        Max position size:{" "}
        <input
          type="number"
          min={1}
          max={100}
          value={maxPositionPct}
          onChange={(e) => setMaxPositionPct(Number(e.target.value))}
          style={{
            width: 60,
            background: "var(--surface-2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "0.3rem 0.5rem",
          }}
        />
        % of risk budget per ticker at full confidence.
      </div>

      {error && <div className="error">{error}</div>}

      {data?.errors.map((e) => (
        <div key={e.ticker} className="error">
          {e.ticker}: {e.error}
        </div>
      ))}

      {data && (
        <div className="signal-grid">
          {data.results.map((r) => (
            <SignalCard
              key={r.ticker}
              result={r}
              onSelect={setSelectedTicker}
              selected={selectedTicker === r.ticker}
            />
          ))}
        </div>
      )}

      {selectedTicker && (
        <div className="chart-card">
          <h2>{selectedTicker} — price with SMA & Bollinger Bands</h2>
          <PriceChart
            ticker={selectedTicker}
            period={period}
            interval={interval}
          />
        </div>
      )}
    </div>
  );
}
