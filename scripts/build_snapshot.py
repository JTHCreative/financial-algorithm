"""Build a daily snapshot of S&P 500 signals + backtests.

Runs in CI (and locally) — outputs `frontend/public/snapshot.json` consumed by
the GitHub Pages site. Pulls the S&P 500 constituent list from Wikipedia,
downloads ~2 years of daily history for each ticker via yfinance, then
applies the same indicator engine the live UI uses.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import sys
import time
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
import yfinance as yf

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.indicators import compute_all  # noqa: E402
from app.signals import backtest, generate_signal, result_to_dict  # noqa: E402

OUTPUT = REPO_ROOT / "frontend" / "public" / "snapshot.json"
PERIOD = "2y"
INTERVAL = "1d"
MAX_WORKERS = 12
SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
# Wikipedia 403s the default Python urllib UA — a descriptive UA is required.
USER_AGENT = (
    "financial-algorithm-snapshot/1.0 "
    "(+https://github.com/JTHCreative/financial-algorithm)"
)


def load_sp500() -> pd.DataFrame:
    print(f"Fetching S&P 500 list from {SP500_URL}", flush=True)
    resp = requests.get(SP500_URL, headers={"User-Agent": USER_AGENT}, timeout=30)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = tables[0]
    # Yahoo expects "-" instead of "." in tickers (e.g., BRK.B -> BRK-B).
    df["Symbol"] = df["Symbol"].astype(str).str.replace(".", "-", regex=False)
    keep = ["Symbol", "Security", "GICS Sector"]
    df = df[keep].rename(
        columns={"Symbol": "ticker", "Security": "name", "GICS Sector": "sector"}
    )
    df = df.drop_duplicates(subset=["ticker"]).reset_index(drop=True)
    print(f"  → {len(df)} tickers", flush=True)
    return df


def process_one(ticker: str, name: str, sector: str) -> Optional[dict]:
    try:
        raw = yf.Ticker(ticker).history(period=PERIOD, interval=INTERVAL, auto_adjust=True)
        if raw.empty:
            return {"ticker": ticker, "error": "no data"}
        raw.columns = [c.lower() for c in raw.columns]
        df = raw[["open", "high", "low", "close", "volume"]].dropna()
        if len(df) < 220:  # need 200d SMA + a bit of headroom
            return {"ticker": ticker, "error": f"too few bars ({len(df)})"}

        enriched = compute_all(df)
        signal = generate_signal(ticker, enriched, risk_budget=10000, max_position_pct=25)
        bt = backtest(enriched)

        return {
            "ticker": ticker,
            "name": name,
            "sector": sector,
            "last_price": float(df.iloc[-1]["close"]),
            "last_date": df.index[-1].strftime("%Y-%m-%d"),
            "signal": result_to_dict(signal),
            "backtest": {
                "strategy_return_pct": bt.strategy_return_pct,
                "buy_hold_return_pct": bt.buy_hold_return_pct,
                "alpha_pct": bt.alpha_pct,
                "num_trades": bt.num_trades,
                "first_date": bt.first_date,
                "last_date": bt.last_date,
            },
        }
    except Exception as e:
        return {"ticker": ticker, "error": str(e)}


def main() -> int:
    started = time.time()
    constituents = load_sp500()

    results: list[dict] = []
    errors: list[dict] = []

    print(f"Processing {len(constituents)} tickers (workers={MAX_WORKERS})…", flush=True)
    with cf.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {
            ex.submit(process_one, row["ticker"], row["name"], row["sector"]): row["ticker"]
            for _, row in constituents.iterrows()
        }
        done = 0
        for fut in cf.as_completed(futures):
            done += 1
            res = fut.result()
            if res is None:
                continue
            if "error" in res:
                errors.append(res)
            else:
                results.append(res)
            if done % 25 == 0 or done == len(futures):
                print(f"  {done}/{len(futures)}", flush=True)

    results.sort(key=lambda r: r["ticker"])

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "period": PERIOD,
        "interval": INTERVAL,
        "universe": "S&P 500",
        "count": len(results),
        "tickers": results,
        "errors": errors,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, separators=(",", ":")))
    elapsed = time.time() - started
    print(
        f"Wrote {OUTPUT} — {len(results)} ok, {len(errors)} errors, {elapsed:.1f}s",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
