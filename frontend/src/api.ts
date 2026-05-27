export interface SignalComponent {
  name: string;
  score: number;
  rationale: string;
}

export interface SignalResult {
  ticker: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  score: number;
  suggested_allocation_pct: number;
  suggested_shares: number | null;
  last_price: number;
  components: SignalComponent[];
  summary: string;
}

export interface SignalResponse {
  results: SignalResult[];
  errors: { ticker: string; error: string }[];
  disclaimer: string;
}

export interface HistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
}

export interface HistoryResponse {
  ticker: string;
  period: string;
  interval: string;
  points: HistoryPoint[];
}

export interface SignalRequest {
  tickers: string[];
  period: string;
  interval: string;
  risk_budget: number;
  max_position_pct: number;
}

const BASE = "/api";

export async function fetchSignals(req: SignalRequest): Promise<SignalResponse> {
  const res = await fetch(`${BASE}/signals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Signals request failed: ${res.status}`);
  return res.json();
}

export async function fetchHistory(
  ticker: string,
  period: string,
  interval: string,
  limit?: number
): Promise<HistoryResponse> {
  const params = new URLSearchParams({ period, interval });
  if (limit) params.set("limit", String(limit));
  const res = await fetch(`${BASE}/history/${ticker}?${params}`);
  if (!res.ok) throw new Error(`History request failed: ${res.status}`);
  return res.json();
}
