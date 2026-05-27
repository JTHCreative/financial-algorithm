# Financial Algorithm

A web app that pulls market data for user-selected stocks and generates
educational buy/sell/hold signals using classic technical indicators. Each
signal explains *why* — every contributing indicator returns a score and a
human-readable rationale — and the engine suggests a position size scaled
to a user-defined risk budget.

> **Disclaimer:** Educational use only. Not financial advice. Past performance
> does not guarantee future results.

## Deployments

### GitHub Pages (default)

The frontend is fully client-side and is deployed via the
`.github/workflows/deploy-pages.yml` workflow.

1. In the repo: **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
2. Push to `main` (or run the workflow manually). The site publishes to
   `https://jthcreative.github.io/financial-algorithm/`.

Market data is fetched in the browser from Yahoo Finance's chart endpoint
via a public CORS proxy (`corsproxy.io`). To swap to a self-hosted proxy or
a paid data source, edit `frontend/src/lib/yahoo.ts`.

### Local development

```bash
cd frontend
npm install
VITE_BASE=/ npm run dev
```

Open <http://localhost:5173>. `VITE_BASE=/` overrides the Pages base path.

The optional Python backend (`backend/`) is not used by the deployed site —
it's kept as a reference implementation and a starting point if you want
to move the algorithms server-side (e.g., to avoid the CORS proxy or to
back-test with `pandas`/`numpy`).

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Daily S&P 500 snapshot

The `.github/workflows/snapshot.yml` action runs every weekday at 22:00 UTC
(also runnable manually via **Actions → Daily S&P 500 snapshot → Run workflow**).
It:

1. Pulls the S&P 500 constituents from Wikipedia.
2. Downloads ~2 years of daily history per ticker (yfinance, ~12 parallel
   workers).
3. Computes the current signal and runs a long/flat backtest using the
   identical RSI/MACD/SMA/Bollinger rules the live UI uses (no lookahead:
   enter at next bar's open after a BUY score, exit at next bar's open
   after a SELL score, no transaction costs).
4. Writes `frontend/public/snapshot.json` and commits it to `main` — which
   then triggers the Pages deploy workflow automatically.

The Screener tab in the UI ranks all ~500 stocks by signal action, sector,
confidence, strategy return, buy-and-hold return, and alpha. Click any row
to see the per-component rationale, suggested position size, and the live
price chart.



```
financial-algorithm/
├── .github/workflows/
│   └── deploy-pages.yml   GH Pages CI
├── frontend/              React + Vite + Recharts (deployed)
│   └── src/lib/
│       ├── indicators.ts  SMA, EMA, RSI, MACD, Bollinger
│       ├── signals.ts     Per-indicator scoring + aggregated signal
│       └── yahoo.ts       CORS-proxied Yahoo chart fetch
└── backend/               Optional FastAPI mirror (not deployed)
```

### Signal model

Four indicator components each return a score in `[-2, +2]`:

| Indicator      | +2 (strong buy)      | −2 (strong sell)     |
| -------------- | -------------------- | -------------------- |
| RSI(14)        | < 30 (oversold)      | > 70 (overbought)    |
| MACD(12,26,9)  | Bullish crossover    | Bearish crossover    |
| SMA(50/200)    | Golden cross         | Death cross          |
| Bollinger(20,2)| Price ≤ lower band   | Price ≥ upper band   |

Components sum to a net score in `[−8, +8]`. `BUY` if score ≥ 3, `SELL`
if ≤ −3, else `HOLD`. Position size = `(|score|/8) × max_position_pct ×
risk_budget / last_price`.

## Extending

- Add more indicators in `frontend/src/lib/indicators.ts` and a scoring
  function in `frontend/src/lib/signals.ts`.
- Swap data source by replacing `frontend/src/lib/yahoo.ts` (e.g., Alpha
  Vantage or Finnhub — both have CORS-enabled free tiers with an API key).
- Wire up paper trading by POSTing signal results to a brokerage API
  (e.g., Alpaca) — gate it behind explicit user confirmation.
