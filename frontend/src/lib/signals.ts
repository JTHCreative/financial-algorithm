import { EnrichedBar } from "./indicators";

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

const isNum = (v: number | null): v is number =>
  v !== null && Number.isFinite(v);

function rsiComponent(rsiValue: number | null): SignalComponent {
  if (!isNum(rsiValue)) {
    return { name: "RSI(14)", score: 0, rationale: "Insufficient history to compute RSI." };
  }
  if (rsiValue < 30)
    return {
      name: "RSI(14)",
      score: 2,
      rationale: `RSI is ${rsiValue.toFixed(1)} — oversold (<30). Mean-reversion buy signal.`,
    };
  if (rsiValue < 45)
    return {
      name: "RSI(14)",
      score: 1,
      rationale: `RSI is ${rsiValue.toFixed(1)} — leaning oversold, mild bullish bias.`,
    };
  if (rsiValue > 70)
    return {
      name: "RSI(14)",
      score: -2,
      rationale: `RSI is ${rsiValue.toFixed(1)} — overbought (>70). Risk of pullback; sell bias.`,
    };
  if (rsiValue > 55)
    return {
      name: "RSI(14)",
      score: -1,
      rationale: `RSI is ${rsiValue.toFixed(1)} — leaning overbought, mild bearish bias.`,
    };
  return { name: "RSI(14)", score: 0, rationale: `RSI is ${rsiValue.toFixed(1)} — neutral.` };
}

function macdComponent(curr: EnrichedBar, prev: EnrichedBar): SignalComponent {
  const m = curr.macd;
  const s = curr.macd_signal;
  const pm = prev.macd;
  const ps = prev.macd_signal;
  if (![m, s, pm, ps].every(isNum)) {
    return { name: "MACD(12,26,9)", score: 0, rationale: "Insufficient history to compute MACD." };
  }
  const crossedUp = (pm as number) < (ps as number) && (m as number) > (s as number);
  const crossedDown = (pm as number) > (ps as number) && (m as number) < (s as number);
  if (crossedUp)
    return {
      name: "MACD(12,26,9)",
      score: 2,
      rationale: `MACD line crossed above signal (${(m as number).toFixed(3)} > ${(s as number).toFixed(3)}) — bullish crossover.`,
    };
  if (crossedDown)
    return {
      name: "MACD(12,26,9)",
      score: -2,
      rationale: `MACD line crossed below signal (${(m as number).toFixed(3)} < ${(s as number).toFixed(3)}) — bearish crossover.`,
    };
  if ((m as number) > (s as number))
    return {
      name: "MACD(12,26,9)",
      score: 1,
      rationale: `MACD (${(m as number).toFixed(3)}) above signal (${(s as number).toFixed(3)}) — trend remains bullish.`,
    };
  return {
    name: "MACD(12,26,9)",
    score: -1,
    rationale: `MACD (${(m as number).toFixed(3)}) below signal (${(s as number).toFixed(3)}) — trend remains bearish.`,
  };
}

function smaComponent(curr: EnrichedBar, prev: EnrichedBar): SignalComponent {
  const price = curr.close;
  const s50 = curr.sma_50;
  const s200 = curr.sma_200;
  const ps50 = prev.sma_50;
  const ps200 = prev.sma_200;
  if (![s50, s200, ps50, ps200].every(isNum)) {
    return { name: "SMA(50/200)", score: 0, rationale: "Insufficient history for 50/200 SMAs." };
  }
  const golden = (ps50 as number) < (ps200 as number) && (s50 as number) > (s200 as number);
  const death = (ps50 as number) > (ps200 as number) && (s50 as number) < (s200 as number);
  if (golden)
    return {
      name: "SMA(50/200)",
      score: 2,
      rationale: `Golden cross: 50-day SMA (${(s50 as number).toFixed(2)}) crossed above 200-day (${(s200 as number).toFixed(2)}).`,
    };
  if (death)
    return {
      name: "SMA(50/200)",
      score: -2,
      rationale: `Death cross: 50-day SMA (${(s50 as number).toFixed(2)}) crossed below 200-day (${(s200 as number).toFixed(2)}).`,
    };
  if (price > (s50 as number) && (s50 as number) > (s200 as number))
    return {
      name: "SMA(50/200)",
      score: 1,
      rationale: `Price (${price.toFixed(2)}) above both 50-day (${(s50 as number).toFixed(2)}) and 200-day (${(s200 as number).toFixed(2)}) — uptrend.`,
    };
  if (price < (s50 as number) && (s50 as number) < (s200 as number))
    return {
      name: "SMA(50/200)",
      score: -1,
      rationale: `Price (${price.toFixed(2)}) below both 50-day (${(s50 as number).toFixed(2)}) and 200-day (${(s200 as number).toFixed(2)}) — downtrend.`,
    };
  return { name: "SMA(50/200)", score: 0, rationale: "Trend signals are mixed." };
}

function bollingerComponent(curr: EnrichedBar): SignalComponent {
  const { close: price, bb_upper: upper, bb_lower: lower, bb_middle: middle } = curr;
  if (![upper, lower, middle].every(isNum)) {
    return { name: "Bollinger(20,2)", score: 0, rationale: "Insufficient history for Bollinger Bands." };
  }
  const u = upper as number;
  const l = lower as number;
  const m = middle as number;
  const bandWidth = u - l;
  if (bandWidth <= 0) {
    return { name: "Bollinger(20,2)", score: 0, rationale: "Bands collapsed — no signal." };
  }
  const pct = (price - l) / bandWidth;
  if (pct <= 0.05)
    return {
      name: "Bollinger(20,2)",
      score: 2,
      rationale: `Price (${price.toFixed(2)}) at or below the lower band (${l.toFixed(2)}) — potentially oversold.`,
    };
  if (pct >= 0.95)
    return {
      name: "Bollinger(20,2)",
      score: -2,
      rationale: `Price (${price.toFixed(2)}) at or above the upper band (${u.toFixed(2)}) — potentially overbought.`,
    };
  if (pct < 0.3)
    return {
      name: "Bollinger(20,2)",
      score: 1,
      rationale: `Price (${price.toFixed(2)}) in the lower third of the band — mild buy bias.`,
    };
  if (pct > 0.7)
    return {
      name: "Bollinger(20,2)",
      score: -1,
      rationale: `Price (${price.toFixed(2)}) in the upper third of the band — mild sell bias.`,
    };
  return { name: "Bollinger(20,2)", score: 0, rationale: `Price near the 20-day mean (${m.toFixed(2)}).` };
}

export interface GenerateSignalOptions {
  riskBudget: number;
  maxPositionPct: number;
}

export function generateSignal(
  ticker: string,
  bars: EnrichedBar[],
  opts: GenerateSignalOptions
): SignalResult {
  if (bars.length < 2) {
    throw new Error("Need at least 2 rows of history to generate a signal.");
  }
  const curr = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  const components: SignalComponent[] = [
    rsiComponent(curr.rsi_14),
    macdComponent(curr, prev),
    smaComponent(curr, prev),
    bollingerComponent(curr),
  ];

  const score = components.reduce((a, c) => a + c.score, 0);
  const maxScore = 2 * components.length;
  const confidence = Math.min(Math.abs(score) / maxScore, 1);
  const action: SignalResult["action"] =
    score >= 3 ? "BUY" : score <= -3 ? "SELL" : "HOLD";

  let allocationPct = 0;
  let suggestedShares: number | null = null;
  const lastPrice = curr.close;
  if (action !== "HOLD" && lastPrice > 0) {
    allocationPct = +(confidence * opts.maxPositionPct).toFixed(2);
    const dollars = opts.riskBudget * (allocationPct / 100);
    suggestedShares = Math.floor(dollars / lastPrice);
  }

  return {
    ticker: ticker.toUpperCase(),
    action,
    confidence: +confidence.toFixed(3),
    score,
    suggested_allocation_pct: allocationPct,
    suggested_shares: suggestedShares,
    last_price: lastPrice,
    components,
    summary: buildSummary(action, confidence, components),
  };
}

function buildSummary(
  action: string,
  confidence: number,
  components: SignalComponent[]
): string {
  const bullish = components.filter((c) => c.score > 0).map((c) => c.name);
  const bearish = components.filter((c) => c.score < 0).map((c) => c.name);
  const parts: string[] = [
    `Net signal: ${action} (confidence ${Math.round(confidence * 100)}%).`,
  ];
  if (bullish.length) parts.push(`Bullish indicators: ${bullish.join(", ")}.`);
  if (bearish.length) parts.push(`Bearish indicators: ${bearish.join(", ")}.`);
  if (!bullish.length && !bearish.length) parts.push("All indicators are neutral.");
  return parts.join(" ");
}
