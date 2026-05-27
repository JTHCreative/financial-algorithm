from __future__ import annotations

from typing import List, Optional

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .data import get_history, get_quote
from .indicators import compute_all
from .signals import generate_signal, result_to_dict

app = FastAPI(
    title="Financial Algorithm API",
    description=(
        "Educational technical-analysis signals from public market data. "
        "NOT financial advice."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DISCLAIMER = (
    "These signals are for educational purposes only and are not financial advice. "
    "Past performance does not guarantee future results."
)


class HistoryPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None


class SignalRequest(BaseModel):
    tickers: List[str] = Field(..., min_length=1, max_length=20)
    period: str = "1y"
    interval: str = "1d"
    risk_budget: float = Field(10000.0, gt=0)
    max_position_pct: float = Field(25.0, gt=0, le=100)


def _clean(value):
    if value is None:
        return None
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    return value


def _history_to_points(df: pd.DataFrame) -> List[HistoryPoint]:
    points: List[HistoryPoint] = []
    for ts, row in df.iterrows():
        points.append(
            HistoryPoint(
                date=ts.strftime("%Y-%m-%d"),
                open=_clean(float(row["open"])),
                high=_clean(float(row["high"])),
                low=_clean(float(row["low"])),
                close=_clean(float(row["close"])),
                volume=_clean(float(row["volume"])),
                sma_20=_clean(float(row.get("sma_20", np.nan))),
                sma_50=_clean(float(row.get("sma_50", np.nan))),
                sma_200=_clean(float(row.get("sma_200", np.nan))),
                rsi_14=_clean(float(row.get("rsi_14", np.nan))),
                macd=_clean(float(row.get("macd", np.nan))),
                macd_signal=_clean(float(row.get("macd_signal", np.nan))),
                macd_hist=_clean(float(row.get("macd_hist", np.nan))),
                bb_upper=_clean(float(row.get("bb_upper", np.nan))),
                bb_middle=_clean(float(row.get("bb_middle", np.nan))),
                bb_lower=_clean(float(row.get("bb_lower", np.nan))),
            )
        )
    return points


@app.get("/api/health")
def health():
    return {"status": "ok", "disclaimer": DISCLAIMER}


@app.get("/api/quote/{ticker}")
def quote(ticker: str):
    try:
        q = get_quote(ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    if q.get("price") is None:
        raise HTTPException(status_code=404, detail=f"No quote available for {ticker}")
    return q


@app.get("/api/history/{ticker}")
def history(
    ticker: str,
    period: str = Query("1y"),
    interval: str = Query("1d"),
    limit: Optional[int] = Query(None, gt=0, le=2000),
):
    try:
        df = get_history(ticker, period=period, interval=interval)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    df = compute_all(df)
    if limit:
        df = df.tail(limit)
    return {
        "ticker": ticker.upper(),
        "period": period,
        "interval": interval,
        "points": [p.model_dump() for p in _history_to_points(df)],
    }


@app.post("/api/signals")
def signals(req: SignalRequest):
    results = []
    errors = []
    for ticker in req.tickers:
        try:
            df = get_history(ticker, period=req.period, interval=req.interval)
            df = compute_all(df)
            result = generate_signal(
                ticker,
                df,
                risk_budget=req.risk_budget,
                max_position_pct=req.max_position_pct,
            )
            results.append(result_to_dict(result))
        except Exception as e:
            errors.append({"ticker": ticker.upper(), "error": str(e)})
    return {
        "results": results,
        "errors": errors,
        "disclaimer": DISCLAIMER,
    }
