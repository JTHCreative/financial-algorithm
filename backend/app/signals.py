from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import List, Optional

import numpy as np
import pandas as pd


@dataclass
class SignalComponent:
    name: str
    score: int  # -2..+2 where +2 is strong buy, -2 strong sell
    rationale: str


@dataclass
class StrategyResult:
    ticker: str
    action: str  # BUY, SELL, HOLD
    confidence: float  # 0..1
    score: int  # net component score
    suggested_allocation_pct: float  # 0..100, fraction of risk budget
    suggested_shares: Optional[int]
    last_price: float
    components: List[SignalComponent]
    summary: str


def _rsi_component(rsi_value: float) -> SignalComponent:
    if np.isnan(rsi_value):
        return SignalComponent("RSI(14)", 0, "Insufficient history to compute RSI.")
    if rsi_value < 30:
        return SignalComponent(
            "RSI(14)", 2,
            f"RSI is {rsi_value:.1f} — oversold (<30). Mean-reversion buy signal."
        )
    if rsi_value < 45:
        return SignalComponent(
            "RSI(14)", 1,
            f"RSI is {rsi_value:.1f} — leaning oversold, mild bullish bias."
        )
    if rsi_value > 70:
        return SignalComponent(
            "RSI(14)", -2,
            f"RSI is {rsi_value:.1f} — overbought (>70). Risk of pullback; sell bias."
        )
    if rsi_value > 55:
        return SignalComponent(
            "RSI(14)", -1,
            f"RSI is {rsi_value:.1f} — leaning overbought, mild bearish bias."
        )
    return SignalComponent("RSI(14)", 0, f"RSI is {rsi_value:.1f} — neutral.")


def _macd_component(row: pd.Series, prev: pd.Series) -> SignalComponent:
    m, s = row["macd"], row["macd_signal"]
    if any(pd.isna(x) for x in (m, s, prev["macd"], prev["macd_signal"])):
        return SignalComponent("MACD(12,26,9)", 0, "Insufficient history to compute MACD.")
    crossed_up = prev["macd"] < prev["macd_signal"] and m > s
    crossed_down = prev["macd"] > prev["macd_signal"] and m < s
    if crossed_up:
        return SignalComponent(
            "MACD(12,26,9)", 2,
            f"MACD line crossed above signal ({m:.3f} > {s:.3f}) — bullish crossover."
        )
    if crossed_down:
        return SignalComponent(
            "MACD(12,26,9)", -2,
            f"MACD line crossed below signal ({m:.3f} < {s:.3f}) — bearish crossover."
        )
    if m > s:
        return SignalComponent(
            "MACD(12,26,9)", 1,
            f"MACD ({m:.3f}) above signal ({s:.3f}) — trend remains bullish."
        )
    return SignalComponent(
        "MACD(12,26,9)", -1,
        f"MACD ({m:.3f}) below signal ({s:.3f}) — trend remains bearish."
    )


def _sma_component(row: pd.Series, prev: pd.Series) -> SignalComponent:
    price = row["close"]
    s50, s200 = row["sma_50"], row["sma_200"]
    if any(pd.isna(x) for x in (s50, s200, prev["sma_50"], prev["sma_200"])):
        return SignalComponent("SMA(50/200)", 0, "Insufficient history for 50/200 SMAs.")
    golden = prev["sma_50"] < prev["sma_200"] and s50 > s200
    death = prev["sma_50"] > prev["sma_200"] and s50 < s200
    if golden:
        return SignalComponent(
            "SMA(50/200)", 2,
            f"Golden cross: 50-day SMA ({s50:.2f}) crossed above 200-day ({s200:.2f})."
        )
    if death:
        return SignalComponent(
            "SMA(50/200)", -2,
            f"Death cross: 50-day SMA ({s50:.2f}) crossed below 200-day ({s200:.2f})."
        )
    if price > s50 > s200:
        return SignalComponent(
            "SMA(50/200)", 1,
            f"Price ({price:.2f}) above both 50-day ({s50:.2f}) and 200-day ({s200:.2f}) — uptrend."
        )
    if price < s50 < s200:
        return SignalComponent(
            "SMA(50/200)", -1,
            f"Price ({price:.2f}) below both 50-day ({s50:.2f}) and 200-day ({s200:.2f}) — downtrend."
        )
    return SignalComponent("SMA(50/200)", 0, "Trend signals are mixed.")


def _bollinger_component(row: pd.Series) -> SignalComponent:
    price = row["close"]
    upper, lower, middle = row["bb_upper"], row["bb_lower"], row["bb_middle"]
    if any(pd.isna(x) for x in (upper, lower, middle)):
        return SignalComponent("Bollinger(20,2)", 0, "Insufficient history for Bollinger Bands.")
    band_width = upper - lower
    if band_width <= 0:
        return SignalComponent("Bollinger(20,2)", 0, "Bands collapsed — no signal.")
    pct = (price - lower) / band_width  # 0 at lower, 1 at upper
    if pct <= 0.05:
        return SignalComponent(
            "Bollinger(20,2)", 2,
            f"Price ({price:.2f}) at or below the lower band ({lower:.2f}) — potentially oversold."
        )
    if pct >= 0.95:
        return SignalComponent(
            "Bollinger(20,2)", -2,
            f"Price ({price:.2f}) at or above the upper band ({upper:.2f}) — potentially overbought."
        )
    if pct < 0.3:
        return SignalComponent(
            "Bollinger(20,2)", 1,
            f"Price ({price:.2f}) in the lower third of the band — mild buy bias."
        )
    if pct > 0.7:
        return SignalComponent(
            "Bollinger(20,2)", -1,
            f"Price ({price:.2f}) in the upper third of the band — mild sell bias."
        )
    return SignalComponent("Bollinger(20,2)", 0, f"Price near the 20-day mean ({middle:.2f}).")


def generate_signal(
    ticker: str,
    df_with_indicators: pd.DataFrame,
    risk_budget: float = 10000.0,
    max_position_pct: float = 25.0,
) -> StrategyResult:
    if len(df_with_indicators) < 2:
        raise ValueError("Need at least 2 rows of history to generate a signal.")

    row = df_with_indicators.iloc[-1]
    prev = df_with_indicators.iloc[-2]

    components = [
        _rsi_component(row["rsi_14"]),
        _macd_component(row, prev),
        _sma_component(row, prev),
        _bollinger_component(row),
    ]

    score = sum(c.score for c in components)
    max_score = 2 * len(components)  # +/- 8
    confidence = min(abs(score) / max_score, 1.0)

    if score >= 3:
        action = "BUY"
    elif score <= -3:
        action = "SELL"
    else:
        action = "HOLD"

    allocation_pct = 0.0
    suggested_shares: Optional[int] = None
    last_price = float(row["close"])
    if action != "HOLD" and last_price > 0:
        allocation_pct = round(confidence * max_position_pct, 2)
        dollar_amount = risk_budget * (allocation_pct / 100.0)
        suggested_shares = int(dollar_amount // last_price)

    summary = _build_summary(action, confidence, components)

    return StrategyResult(
        ticker=ticker.upper(),
        action=action,
        confidence=round(confidence, 3),
        score=score,
        suggested_allocation_pct=allocation_pct,
        suggested_shares=suggested_shares,
        last_price=last_price,
        components=components,
        summary=summary,
    )


def _build_summary(action: str, confidence: float, components: List[SignalComponent]) -> str:
    bullish = [c.name for c in components if c.score > 0]
    bearish = [c.name for c in components if c.score < 0]
    parts = [f"Net signal: {action} (confidence {confidence:.0%})."]
    if bullish:
        parts.append(f"Bullish indicators: {', '.join(bullish)}.")
    if bearish:
        parts.append(f"Bearish indicators: {', '.join(bearish)}.")
    if not bullish and not bearish:
        parts.append("All indicators are neutral.")
    return " ".join(parts)


def result_to_dict(result: StrategyResult) -> dict:
    d = asdict(result)
    d["components"] = [asdict(c) for c in result.components]
    return d


def _row_score(curr: pd.Series, prev: pd.Series) -> int:
    components = [
        _rsi_component(curr["rsi_14"]),
        _macd_component(curr, prev),
        _sma_component(curr, prev),
        _bollinger_component(curr),
    ]
    return sum(c.score for c in components)


@dataclass
class BacktestResult:
    strategy_return_pct: float
    buy_hold_return_pct: float
    alpha_pct: float
    num_trades: int
    first_date: str
    last_date: str


def backtest(
    df_with_indicators: pd.DataFrame,
    initial_cash: float = 10000.0,
    buy_threshold: int = 3,
    sell_threshold: int = -3,
) -> BacktestResult:
    """Long/flat backtest. Enters at next bar's open after a BUY score,
    exits at next bar's open after a SELL score. No transaction costs."""
    if len(df_with_indicators) < 3:
        raise ValueError("Need at least 3 bars to backtest.")

    cash = float(initial_cash)
    shares = 0.0
    trades = 0
    in_position = False
    pending: Optional[str] = None  # 'BUY' or 'SELL' to execute next bar

    for i in range(1, len(df_with_indicators)):
        curr = df_with_indicators.iloc[i]
        prev = df_with_indicators.iloc[i - 1]

        # Execute the previous bar's pending order at this bar's open.
        if pending == "BUY" and not in_position:
            price = float(curr["open"])
            shares = cash / price
            cash = 0.0
            in_position = True
            trades += 1
        elif pending == "SELL" and in_position:
            price = float(curr["open"])
            cash = shares * price
            shares = 0.0
            in_position = False
            trades += 1
        pending = None

        score = _row_score(curr, prev)
        if not in_position and score >= buy_threshold:
            pending = "BUY"
        elif in_position and score <= sell_threshold:
            pending = "SELL"

    final_price = float(df_with_indicators.iloc[-1]["close"])
    final_value = cash + shares * final_price
    first_price = float(df_with_indicators.iloc[0]["close"])

    strategy_return = (final_value - initial_cash) / initial_cash * 100
    buy_hold_return = (final_price - first_price) / first_price * 100

    return BacktestResult(
        strategy_return_pct=round(strategy_return, 2),
        buy_hold_return_pct=round(buy_hold_return, 2),
        alpha_pct=round(strategy_return - buy_hold_return, 2),
        num_trades=trades,
        first_date=df_with_indicators.index[0].strftime("%Y-%m-%d"),
        last_date=df_with_indicators.index[-1].strftime("%Y-%m-%d"),
    )
