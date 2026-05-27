# Financial Algorithm

A web app that pulls market data for user-selected stocks and generates
educational buy/sell/hold signals using classic technical indicators. Each
signal explains *why* — every contributing indicator returns a score and a
human-readable rationale — and the engine suggests a position size scaled
to a user-defined risk budget.

> **Disclaimer:** Educational use only. Not financial advice. Past performance
> does not guarantee future results.

## Architecture

```
financial-algorithm/
├── backend/        FastAPI + yfinance signal engine
│   └── app/
│       ├── main.py        REST endpoints
│       ├── data.py        yfinance wrapper + caching
│       ├── indicators.py  SMA, EMA, RSI, MACD, Bollinger Bands
│       └── signals.py     Per-indicator scoring + aggregated signal
└── frontend/       React + Vite + Recharts UI
```

### Signal model

Four indicator components each return a score in `[-2, +2]`:

| Indicator | +2 (strong buy) | −2 (strong sell) |
|---|---|---|
| RSI(14) | < 30 (oversold) | > 70 (overbought) |
| MACD(12,26,9) | Bullish crossover | Bearish crossover |
| SMA(50/200) | Golden cross | Death cross |
| Bollinger(20,2) | Price ≤ lower band | Price ≥ upper band |

The components sum to a net score (range −8 to +8). `BUY` if score ≥ 3,
`SELL` if ≤ −3, else `HOLD`. Position sizing scales with confidence
(`|score| / 8`) times a user-configurable `max_position_pct` of the
risk budget.

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs at <http://localhost:8000/docs>.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/*` to the
backend on port 8000.

## API

- `GET  /api/health` — service status + disclaimer
- `GET  /api/quote/{ticker}` — current quote
- `GET  /api/history/{ticker}?period=1y&interval=1d&limit=250` — OHLCV with
  indicators
- `POST /api/signals` — body: `{ tickers, period, interval, risk_budget,
  max_position_pct }` → ranked signals with per-component rationale

## Extending

- Add more indicators in `backend/app/indicators.py` and a corresponding
  scoring function in `backend/app/signals.py`.
- Swap the data source by replacing `backend/app/data.py` (e.g., Alpha
  Vantage, Polygon).
- Wire up paper trading by POSTing the signal results to a brokerage API
  (e.g., Alpaca) — keep this gated behind explicit user confirmation.
