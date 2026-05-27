import type { SignalResult } from "./signals";

export interface BacktestSummary {
  strategy_return_pct: number;
  buy_hold_return_pct: number;
  alpha_pct: number;
  num_trades: number;
  first_date: string;
  last_date: string;
}

export interface SnapshotTicker {
  ticker: string;
  name: string;
  sector: string;
  last_price: number;
  last_date: string;
  signal: SignalResult;
  backtest: BacktestSummary;
}

export interface Snapshot {
  generated_at: string | null;
  period: string;
  interval: string;
  universe: string;
  count: number;
  tickers: SnapshotTicker[];
  errors: { ticker: string; error: string }[];
}

export async function loadSnapshot(): Promise<Snapshot> {
  const url = `${import.meta.env.BASE_URL}snapshot.json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Snapshot not available (${res.status}). The daily workflow may not have run yet.`
    );
  }
  return res.json();
}
