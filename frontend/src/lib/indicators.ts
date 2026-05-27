export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function nan(): number {
  return Number.NaN;
}

export function sma(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length).fill(nan());
  if (window <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) out[i] = sum / window;
  }
  return out;
}

export function ema(values: number[], span: number): number[] {
  const out: number[] = new Array(values.length).fill(nan());
  if (span <= 0 || values.length === 0) return out;
  const alpha = 2 / (span + 1);
  // Seed with values[0] (matches pandas adjust=False semantics after warmup).
  let prev = values[0];
  out[0] = Number.isFinite(values[0]) ? Number.NaN : Number.NaN;
  for (let i = 0; i < values.length; i++) {
    if (i === 0) prev = values[0];
    else prev = alpha * values[i] + (1 - alpha) * prev;
    out[i] = i >= span - 1 ? prev : Number.NaN;
  }
  return out;
}

export function rsi(values: number[], window = 14): number[] {
  const out: number[] = new Array(values.length).fill(nan());
  if (values.length < window + 1) return out;
  const alpha = 1 / window;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    if (i === 1) {
      avgGain = gain;
      avgLoss = loss;
    } else {
      avgGain = alpha * gain + (1 - alpha) * avgGain;
      avgLoss = alpha * loss + (1 - alpha) * avgLoss;
    }
    if (i >= window) {
      const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalSpan = 9
): MacdResult {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  // EMA over the (defined) portion of the MACD line.
  const cleanMacd = macdLine.map((v) => (Number.isFinite(v) ? v : 0));
  const signalRaw = ema(cleanMacd, signalSpan);
  const signal = signalRaw.map((v, i) =>
    Number.isFinite(macdLine[i]) ? v : Number.NaN
  );
  const histogram = macdLine.map((m, i) => m - signal[i]);
  return { macd: macdLine, signal, histogram };
}

export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

export function bollingerBands(
  values: number[],
  window = 20,
  numStd = 2
): BollingerResult {
  const middle = sma(values, window);
  const upper: number[] = new Array(values.length).fill(nan());
  const lower: number[] = new Array(values.length).fill(nan());
  for (let i = window - 1; i < values.length; i++) {
    let s = 0;
    let s2 = 0;
    for (let j = i - window + 1; j <= i; j++) {
      s += values[j];
      s2 += values[j] * values[j];
    }
    const mean = s / window;
    const variance = (s2 - s * mean) / (window - 1);
    const std = Math.sqrt(Math.max(variance, 0));
    upper[i] = mean + numStd * std;
    lower[i] = mean - numStd * std;
  }
  return { middle, upper, lower };
}

export interface EnrichedBar extends Bar {
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  rsi_14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_middle: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
}

const finiteOrNull = (v: number): number | null =>
  Number.isFinite(v) ? v : null;

export function enrich(bars: Bar[]): EnrichedBar[] {
  const close = bars.map((b) => b.close);
  const sma20 = sma(close, 20);
  const sma50 = sma(close, 50);
  const sma200 = sma(close, 200);
  const rsi14 = rsi(close, 14);
  const macdResult = macd(close);
  const bb = bollingerBands(close);

  return bars.map((b, i) => ({
    ...b,
    sma_20: finiteOrNull(sma20[i]),
    sma_50: finiteOrNull(sma50[i]),
    sma_200: finiteOrNull(sma200[i]),
    rsi_14: finiteOrNull(rsi14[i]),
    macd: finiteOrNull(macdResult.macd[i]),
    macd_signal: finiteOrNull(macdResult.signal[i]),
    macd_hist: finiteOrNull(macdResult.histogram[i]),
    bb_middle: finiteOrNull(bb.middle[i]),
    bb_upper: finiteOrNull(bb.upper[i]),
    bb_lower: finiteOrNull(bb.lower[i]),
  }));
}
