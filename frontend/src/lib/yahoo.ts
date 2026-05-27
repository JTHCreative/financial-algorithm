import { Bar } from "./indicators";

// Yahoo's chart endpoint doesn't expose CORS headers for browser callers, so
// we route requests through a public CORS proxy. Swap this for a self-hosted
// proxy or a paid data source if you need higher reliability.
const DEFAULT_PROXY = "https://corsproxy.io/?";

export interface FetchOptions {
  range?: string; // 3mo, 6mo, 1y, 2y, 5y, max
  interval?: string; // 1d, 1wk, 1mo
  proxy?: string;
}

interface YahooChartResponse {
  chart: {
    result?: Array<{
      meta: { regularMarketPrice?: number; currency?: string; symbol?: string };
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose: (number | null)[] }>;
      };
    }>;
    error?: { code: string; description: string } | null;
  };
}

export async function fetchBars(
  ticker: string,
  opts: FetchOptions = {}
): Promise<Bar[]> {
  const range = opts.range ?? "1y";
  const interval = opts.interval ?? "1d";
  const proxy = opts.proxy ?? DEFAULT_PROXY;

  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker.toUpperCase()
  )}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`;
  const url = `${proxy}${encodeURIComponent(target)}`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Yahoo request failed (${res.status}) for ${ticker}`);
  }
  const json: YahooChartResponse = await res.json();
  if (json.chart.error) {
    throw new Error(`${ticker}: ${json.chart.error.description}`);
  }
  const result = json.chart.result?.[0];
  if (!result || !result.timestamp || !result.indicators.quote[0]) {
    throw new Error(`${ticker}: no data returned`);
  }

  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const adj = result.indicators.adjclose?.[0]?.adjclose;

  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = adj?.[i] ?? q.close[i];
    if (
      close == null ||
      q.open[i] == null ||
      q.high[i] == null ||
      q.low[i] == null
    ) {
      continue;
    }
    bars.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open[i] as number,
      high: q.high[i] as number,
      low: q.low[i] as number,
      close: close as number,
      volume: (q.volume[i] ?? 0) as number,
    });
  }
  return bars;
}

export interface QuoteSummary {
  ticker: string;
  price: number;
  previousClose: number | null;
  changePercent: number | null;
  currency: string | null;
}

export async function fetchQuote(
  ticker: string,
  proxy = DEFAULT_PROXY
): Promise<QuoteSummary> {
  const bars = await fetchBars(ticker, { range: "5d", interval: "1d", proxy });
  if (bars.length === 0) throw new Error(`${ticker}: no quote available`);
  const last = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  return {
    ticker: ticker.toUpperCase(),
    price: last.close,
    previousClose: prev?.close ?? null,
    changePercent: prev ? ((last.close - prev.close) / prev.close) * 100 : null,
    currency: null,
  };
}
