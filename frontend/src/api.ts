import { enrich, EnrichedBar } from "./lib/indicators";
import { generateSignal, SignalResult } from "./lib/signals";
import { fetchBars } from "./lib/yahoo";

export type { SignalComponent, SignalResult } from "./lib/signals";
export type { EnrichedBar } from "./lib/indicators";

export interface SignalResponse {
  results: SignalResult[];
  errors: { ticker: string; error: string }[];
  disclaimer: string;
}

export interface SignalRequest {
  tickers: string[];
  period: string;
  interval: string;
  risk_budget: number;
  max_position_pct: number;
}

export interface HistoryResponse {
  ticker: string;
  period: string;
  interval: string;
  points: EnrichedBar[];
}

const DISCLAIMER =
  "These signals are for educational purposes only and are not financial advice. Past performance does not guarantee future results.";

export async function fetchSignals(req: SignalRequest): Promise<SignalResponse> {
  const results: SignalResult[] = [];
  const errors: { ticker: string; error: string }[] = [];
  await Promise.all(
    req.tickers.map(async (t) => {
      try {
        const bars = await fetchBars(t, {
          range: req.period,
          interval: req.interval,
        });
        const enriched = enrich(bars);
        const result = generateSignal(t, enriched, {
          riskBudget: req.risk_budget,
          maxPositionPct: req.max_position_pct,
        });
        results.push(result);
      } catch (e) {
        errors.push({
          ticker: t.toUpperCase(),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })
  );
  results.sort((a, b) => req.tickers.indexOf(a.ticker) - req.tickers.indexOf(b.ticker));
  return { results, errors, disclaimer: DISCLAIMER };
}

export async function fetchHistory(
  ticker: string,
  period: string,
  interval: string,
  limit?: number
): Promise<HistoryResponse> {
  const bars = await fetchBars(ticker, { range: period, interval });
  const enriched = enrich(bars);
  const points = limit ? enriched.slice(-limit) : enriched;
  return { ticker: ticker.toUpperCase(), period, interval, points };
}
