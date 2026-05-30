"""Build a daily snapshot of S&P 500 signals + backtests.

Runs in CI (and locally) — outputs `frontend/public/snapshot.json` consumed by
the GitHub Pages site.
"""
from __future__ import annotations

import json
import sys
import time
import traceback
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
import yfinance as yf

# curl_cffi lets yfinance impersonate a real browser TLS fingerprint — required
# because Yahoo blocks plain `requests` / `urllib` traffic from cloud IPs.
try:
    from curl_cffi import requests as cffi_requests  # type: ignore
    HAS_CFFI = True
except Exception:
    HAS_CFFI = False

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.indicators import compute_all  # noqa: E402
from app.signals import backtest, generate_signal, result_to_dict  # noqa: E402

OUTPUT = REPO_ROOT / "frontend" / "public" / "snapshot.json"
PERIOD = "2y"
INTERVAL = "1d"
BATCH_SIZE = 50
SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"

UA_REQUESTS = (
    "financial-algorithm-snapshot/1.0 "
    "(+https://github.com/JTHCreative/financial-algorithm)"
)


def yahoo_session():
    """Return a session yfinance will use that mimics a real browser."""
    if HAS_CFFI:
        s = cffi_requests.Session(impersonate="chrome")
        return s
    # Fallback — likely to be blocked by Yahoo from cloud IPs.
    s = requests.Session()
    s.headers["User-Agent"] = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    return s


def load_sp500() -> pd.DataFrame:
    print(f"Fetching S&P 500 list from {SP500_URL}", flush=True)
    # Wikipedia blocks default urllib UA with 403; use a real session.
    resp = requests.get(SP500_URL, headers={"User-Agent": UA_REQUESTS}, timeout=30)
    resp.raise_for_status()
    tables = pd.read_html(StringIO(resp.text))
    df = tables[0]
    df["Symbol"] = df["Symbol"].astype(str).str.replace(".", "-", regex=False)
    df = df[["Symbol", "Security", "GICS Sector"]].rename(
        columns={"Symbol": "ticker", "Security": "name", "GICS Sector": "sector"}
    )
    df = df.drop_duplicates(subset=["ticker"]).reset_index(drop=True)
    print(f"  → {len(df)} tickers", flush=True)
    return df


def sanity_check(session) -> None:
    """Fail loud if Yahoo blocks us, instead of producing an empty snapshot."""
    print("Sanity-checking yfinance with AAPL…", flush=True)
    try:
        df = yf.Ticker("AAPL", session=session).history(period="5d", interval="1d")
    except TypeError:
        # Older yfinance versions don't accept a session kwarg on Ticker.
        df = yf.download("AAPL", period="5d", interval="1d", progress=False, session=session)
    if df is None or len(df) == 0:
        raise RuntimeError(
            "yfinance returned no data for AAPL — Yahoo is likely blocking this "
            "runner's IP. Aborting to avoid publishing an empty snapshot."
        )
    print(f"  → AAPL OK ({len(df)} bars)", flush=True)


def download_batch(tickers: list[str], session) -> dict[str, pd.DataFrame]:
    """Download a batch of tickers via yf.download (one Yahoo call, threaded)."""
    if not tickers:
        return {}
    raw = yf.download(
        tickers=" ".join(tickers),
        period=PERIOD,
        interval=INTERVAL,
        auto_adjust=True,
        group_by="ticker",
        threads=True,
        progress=False,
        session=session,
    )
    out: dict[str, pd.DataFrame] = {}
    if raw is None or raw.empty:
        return out
    # When you pass multiple tickers, yfinance returns a MultiIndex column df.
    if isinstance(raw.columns, pd.MultiIndex):
        for t in tickers:
            if t not in raw.columns.get_level_values(0):
                continue
            sub = raw[t].dropna(how="all")
            sub.columns = [c.lower() for c in sub.columns]
            out[t] = sub
    else:
        # Single-ticker batch.
        sub = raw.copy()
        sub.columns = [c.lower() for c in sub.columns]
        out[tickers[0]] = sub
    return out


def process_one(ticker: str, name: str, sector: str, df: pd.DataFrame) -> dict:
    try:
        if df is None or df.empty:
            return {"ticker": ticker, "error": "no data returned"}
        df = df[["open", "high", "low", "close", "volume"]].dropna()
        if len(df) < 220:
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
        return {"ticker": ticker, "error": f"{type(e).__name__}: {e}"}


def main() -> int:
    started = time.time()
    print(f"curl_cffi available: {HAS_CFFI}", flush=True)
    session = yahoo_session()
    sanity_check(session)

    constituents = load_sp500()
    tickers = constituents["ticker"].tolist()

    results: list[dict] = []
    errors: list[dict] = []
    error_samples: list[str] = []

    by_ticker = {row["ticker"]: row for _, row in constituents.iterrows()}

    print(f"Downloading {len(tickers)} tickers in batches of {BATCH_SIZE}…", flush=True)
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        try:
            data = download_batch(batch, session)
        except Exception as e:
            print(f"  batch {i // BATCH_SIZE} failed: {e}", flush=True)
            traceback.print_exc()
            data = {}
        for t in batch:
            row = by_ticker[t]
            res = process_one(t, row["name"], row["sector"], data.get(t))
            if "error" in res:
                errors.append(res)
                if len(error_samples) < 3:
                    error_samples.append(f"{t}: {res['error']}")
            else:
                results.append(res)
        print(
            f"  batch {i // BATCH_SIZE + 1}/{(len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE}: "
            f"+{sum(1 for t in batch if t in data)}/{len(batch)} ok",
            flush=True,
        )
        # Be polite between batches.
        time.sleep(1.0)

    results.sort(key=lambda r: r["ticker"])

    if len(results) == 0:
        # Refuse to publish a fully empty snapshot — protects the live screener.
        print("\nERROR: zero tickers succeeded. Sample errors:", flush=True)
        for s in error_samples:
            print(f"  {s}", flush=True)
        raise SystemExit(2)

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
        f"\nWrote {OUTPUT} — {len(results)} ok, {len(errors)} errors, "
        f"{elapsed:.1f}s",
        flush=True,
    )
    if error_samples:
        print("Error samples:", flush=True)
        for s in error_samples:
            print(f"  {s}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
