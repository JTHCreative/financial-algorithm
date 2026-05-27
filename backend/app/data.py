from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Optional

import pandas as pd
import yfinance as yf


def _normalize_history(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.lower() for c in df.columns]
    df.index = pd.to_datetime(df.index)
    return df[["open", "high", "low", "close", "volume"]].dropna()


@lru_cache(maxsize=128)
def _cached_history(ticker: str, period: str, interval: str, cache_key: str) -> pd.DataFrame:
    raw = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=True)
    if raw.empty:
        raise ValueError(f"No data returned for ticker '{ticker}'")
    return _normalize_history(raw)


def get_history(ticker: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    cache_key = datetime.utcnow().strftime("%Y-%m-%d-%H")
    return _cached_history(ticker.upper(), period, interval, cache_key)


def get_quote(ticker: str) -> dict:
    t = yf.Ticker(ticker)
    fast = getattr(t, "fast_info", {}) or {}
    info: dict = {}
    try:
        info = t.info or {}
    except Exception:
        info = {}
    price = fast.get("last_price") or info.get("regularMarketPrice")
    prev_close = fast.get("previous_close") or info.get("previousClose")
    change = None
    change_pct: Optional[float] = None
    if price is not None and prev_close:
        change = price - prev_close
        change_pct = (change / prev_close) * 100
    return {
        "ticker": ticker.upper(),
        "name": info.get("shortName") or info.get("longName") or ticker.upper(),
        "price": price,
        "previous_close": prev_close,
        "change": change,
        "change_percent": change_pct,
        "currency": fast.get("currency") or info.get("currency"),
        "market_cap": info.get("marketCap"),
    }
