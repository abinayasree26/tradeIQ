# TradeIQ — Smart Technical Analysis Platform (STAP)

> Real-time market intelligence for Indian retail traders.
> Milestone alerts · Indicator engine · Stop-loss engine · Plain-language coaching.

---

## What This Platform Does (and Why)

Most retail traders lose money not because they lack access to data, but because they cannot
interpret raw numbers fast enough. STAP solves this by:

1. **Pulling live NSE/BSE data** using yfinance (free, no API key)
2. **Computing 20+ technical indicators** on every request (RSI, MACD, Bollinger Bands, etc.)
3. **Firing progressive milestone alerts** as price/volume approaches key levels — not just when it crosses them
4. **Explaining every alert in plain language** with a coaching message that tells you WHAT happened, WHY it matters, and WHAT to watch next
5. **Calculating stop-loss + targets** automatically so you never enter a trade without defined risk
6. **Delivering alerts to Telegram** instantly and for free

STAP is **not** a trading bot. It does not place orders. It is a cockpit that amplifies your decision-making.

---

## Architecture

```
Browser (React) :5173
    │
    ├── Node.js Proxy :3000  ──→ Yahoo Finance (price, OHLCV - legacy charts)
    │                        ──→ Finnhub API   (market news, free)
    │                        ──→ Anthropic Claude (AI chat assistant)
    │                        ──→ Databricks (historical aggregations)
    │
    └── Python FastAPI :8000 ──→ yfinance (FREE live NSE/BSE data)
                              ──→ pandas-ta (indicator computation engine)
                              ──→ PostgreSQL :5432 on Proxmox VM 104
                              │     └── alert_rules, alert_events,
                              │         indicator_snapshots, stop_loss_records
                              └── Telegram Bot API (FREE push alerts)
```

**Why two backends?**
- The Node proxy handles APIs that need CORS bypass + Databricks SQL (already existed in TradeIQ)
- The Python backend handles all the computation-heavy work: indicators, milestone checks, coaching messages

---

## Database — Proxmox VM 104

| Field         | Value                   |
|---------------|-------------------------|
| Host          | 192.168.86.245          |
| Port          | 5432                    |
| Database      | tradeiq_db              |
| User          | tradeiq                 |
| Password      | tradeiq123              |
| PostgreSQL    | 14 (Ubuntu 22.04)       |
| Proxmox VM    | 104 — moneyflow-server  |

**Why Proxmox instead of Docker?**
The database runs on a dedicated Proxmox VM on your home server. This means:
- The DB stays running 24/7 even when you stop the development server
- All alert history, rules, and indicator snapshots are persistently stored
- You can SSH in at any time and query data directly

**Why PostgreSQL?**
- Alert rules need structured querying (filter by symbol, condition type, active status)
- Alert events need ordered history with timestamps
- JSON columns store flexible milestone chain configs without needing schema changes

---

## Tech Stack

| Layer       | Technology              | Why chosen                                          |
|-------------|-------------------------|-----------------------------------------------------|
| Backend     | Python 3.11 + FastAPI   | Async, WebSocket-ready, auto Swagger docs           |
| Indicators  | pandas-ta + numpy       | 130+ indicators, pure Python, no C compiler needed  |
| Market Data | yfinance (FREE)         | NSE/BSE stocks via .NS suffix, no signup            |
| Database    | PostgreSQL 14           | Alert rules, events, snapshots — relational + JSON  |
| DB Driver   | asyncpg + SQLAlchemy    | Async I/O — non-blocking DB queries in FastAPI      |
| Alerts      | Telegram Bot API (FREE) | Instant push, free forever, works on phone          |
| Frontend    | React 18 + Vite         | Fast HMR, component-based                           |
| Charts      | TradingView Lightweight | Professional candlestick charts, free               |
| Node Proxy  | Express.js              | CORS bridge for news + AI + Databricks              |

---

## Free APIs Used (Zero Cost)

| Service          | Purpose                         | Key?      | How to get                              |
|------------------|---------------------------------|-----------|-----------------------------------------|
| **yfinance**     | NSE/BSE live price + OHLCV      | None      | `pip install yfinance` — no signup      |
| **Telegram Bot** | Real-time alert delivery        | Bot Token | /newbot on @BotFather — 2 min, free     |
| **Finnhub**      | Market news                     | Free key  | finnhub.io/register (60 req/min free)   |
| **Reddit PRAW**  | r/IndianStockMarket sentiment   | Free app  | reddit.com/prefs/apps → script app      |
| **FinBERT**      | NLP sentiment scoring (Phase 4) | None      | HuggingFace local inference, free       |

Paid (optional):
| **Anthropic Claude** | AI chat assistant           | Paid      | console.anthropic.com                   |
| **Databricks**       | Historical aggregations     | Token     | Already configured in backend-proxy     |

---

## NSE Symbol Reference

| Your Symbol  | yfinance Ticker | Name                  |
|--------------|-----------------|-----------------------|
| NIFTY50      | ^NSEI           | Nifty 50 Index        |
| BANKNIFTY    | ^NSEBANK        | Bank Nifty Index      |
| SENSEX       | ^BSESN          | BSE Sensex            |
| RELIANCE     | RELIANCE.NS     | Reliance Industries   |
| TCS          | TCS.NS          | TCS                   |
| HDFCBANK     | HDFCBANK.NS     | HDFC Bank             |
| INFY         | INFY.NS         | Infosys               |
| SBIN         | SBIN.NS         | State Bank of India   |
| BAJFINANCE   | BAJFINANCE.NS   | Bajaj Finance         |
| *(+35 more — see backend-python/app/services/india_market.py)* | | |

**Why .NS suffix?** Yahoo Finance uses country suffixes — .NS = National Stock Exchange India,
.BO = Bombay Stock Exchange. Indices use ^ prefix (^NSEI = Nifty 50).

---

## Quick Start

### Prerequisites
- Python 3.11+ — `python --version`
- Node.js 18+ — `node --version`
- Proxmox VM 104 running (192.168.86.245) — PostgreSQL is already set up there

### Step 1: Python Backend (STAP Engine)
```bash
cd backend-python

# Create virtual environment (keeps packages isolated from system Python)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

# Install all packages
pip install -r requirements.txt

# Database is already configured in .env (points to 192.168.86.245)
# Start — automatically creates all DB tables on first run
uvicorn app.main:app --reload --port 8000
```
Open http://localhost:8000/docs — full Swagger API explorer.

### Step 2: Test DB Connection
```bash
cd backend-python
pip install asyncpg
python test_db_connection.py
# Should show: ✓ PASSED — Proxmox DB is ready!
```

### Step 3: Node Proxy (news + AI + Databricks)
```bash
cd backend-proxy
npm install
npm start
# Runs on port 3000
```

### Step 4: Frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## How the Indicator Engine Works

Every time you call `GET /indicators/RELIANCE`, the engine:

1. Fetches 6 months of daily OHLCV from yfinance (cached 60s)
2. Builds a DataFrame with DatetimeIndex
3. Runs pandas-ta to compute all indicators in one pass
4. Scores each indicator and produces a composite signal (−100 to +100)
5. Returns a flat JSON with every value

**Why pandas-ta instead of TA-Lib?**
TA-Lib requires compiling C binaries which often fails on Windows. pandas-ta is pure Python,
installs with a single `pip install`, and supports 130+ indicators.

**Composite score logic:**
```
RSI < 30          → +20 (oversold = buy opportunity)
RSI > 70          → −20 (overbought = sell pressure)
MACD histogram > 0 → +15 (bullish momentum)
Price > EMA50     → +15 (uptrend)
Price inside BB   → +10 (normal range)
RVOL > 1.5        → +15 (above-average volume = conviction)
```
Total → mapped to: STRONG_BUY (+60 to +100) / BUY (+20 to +59) /
NEUTRAL (−19 to +19) / SELL (−20 to −59) / STRONG_SELL (−100 to −60)

---

## How Milestone Alerts Work

Traditional alerts fire once when price crosses a level. STAP fires **progressively**:

```
Alert: "RELIANCE volume reaches 1× daily average"

80% milestone  → "Volume building — approaching average (0.8× RVOL)"
90% milestone  → "Volume almost there — 0.9× RVOL"
100% milestone → "Volume target HIT — 1.0× RVOL, full conviction signal"
120% milestone → "Volume exceeded — 1.2× RVOL, strong institutional activity"
150% milestone → "Exceptional volume — 1.5× RVOL, major event in play"
```

**Why progressive?**
Because 90% of the way to a signal is still useful information. You can prepare your position
before the signal fully triggers — same as how you watch a kettle before it boils.

**7 condition types:**
| Type             | Tracks                          | Example use                        |
|------------------|---------------------------------|------------------------------------|
| volume_rvol      | Volume vs daily average (RVOL)  | Detect institutional accumulation  |
| rsi_level        | RSI value                       | Alert when oversold/overbought      |
| price_breakout   | Price vs fixed level            | 52-week high breakout alerts       |
| price_pct        | % move from yesterday's close   | Alert on 2%+ intraday moves        |
| macd_cross       | MACD histogram sign change      | Trend reversal detection           |
| bb_squeeze       | Bollinger Band width            | Low volatility → breakout setup    |
| ema_cross        | EMA9 vs EMA21 crossover         | Golden/death cross signals         |

---

## How the Stop-Loss Engine Works

When you call `GET /indicators/RELIANCE/stoploss?entry_price=2450&direction=long`,
the engine calculates stop-loss using 5 different methods and recommends one:

| Method         | Formula                    | Recommended when              |
|----------------|----------------------------|-------------------------------|
| ATR Stop       | Entry − (1.5 × ATR14)     | Default — works in all markets|
| Swing Low      | Lowest low in last 15 bars | Trending / pullback entries   |
| Bollinger Band | Lower band value           | Mean-reversion trades         |
| VWAP Stop      | Below VWAP level           | Intraday momentum trades      |
| Pivot Points   | S1 support level           | Intraday swing trades         |

**Selection logic:** If BB is squeezed → use Bollinger method. If RVOL > 1.5 → use ATR
(high volume moves fast). Default → ATR.

**Why 5 methods?** Different market conditions call for different stop strategies.
A trending stock needs a swing-low stop; a range-bound stock needs a Bollinger stop.

---

## How Coaching Messages Work

Every milestone alert generates a coaching message. Example for RELIANCE volume:

```
📊 VOLUME ALERT — RELIANCE
Volume at 100% of daily average (1.00× RVOL).
Daily volume target HIT. Price is at ₹2,450.00. This is a potential entry zone.

📌 Multi-Signal Context:
  RSI: 58.3 (Neutral — room to run)
  MACD Histogram: +12.45 (Bullish momentum)
  RVOL: 1.00× average (volume confirming)
  Overall Signal: 🟢 BUY (Score: +45/100)

🎯 Trade Levels:
  Stop Loss: ₹2,415.00 (ATR method, 1.4% risk)
  Target 1:  ₹2,485.00 (1:1 R:R)
  Target 2:  ₹2,520.00 (1:2 R:R)
  Risk/Reward: 1:2.0

⚠️ STAP is a signal tool. Always apply your own judgement.
```

**Why plain language?** Most trading platforms show numbers. STAP tells you what the numbers
mean and what action they suggest — lowering the cognitive load at the critical moment.

---

## Setting Up Telegram Alerts (FREE — 5 minutes)

1. Telegram → search **@BotFather** → `/newbot` → follow prompts → get **BOT_TOKEN**
2. Add to `backend-python/.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_token_here
   ```
3. Message your new bot once (any text — this creates the chat)
4. Visit http://localhost:8000/alerts/telegram/chat-id → copy your `chat_id`
5. Add to `.env`:
   ```
   TELEGRAM_CHAT_ID=your_chat_id_here
   ```
6. Restart backend → http://localhost:8000/alerts/telegram/test → "connected" confirms it works

**Why Telegram and not email/SMS?**
Telegram delivers instantly, works on mobile, is free forever, and supports HTML formatting
in messages. SMS costs money per message; email is too slow for trading alerts.

---

## API Reference (http://localhost:8000/docs for full Swagger)

### India Market (yfinance — FREE)
```
GET /india/symbols                     All 45+ NSE/BSE symbols with names
GET /india/session                     Market open/closed + current IST time
GET /india/quote/{SYMBOL}              Live price, % change, high, low, volume, 52w
GET /india/quotes?symbols=A,B,C        Bulk quotes for multiple symbols
GET /india/ohlcv/{SYMBOL}              OHLCV candles (period=1y, interval=1d)
GET /india/watchlist                   Quotes for default 15-symbol watchlist
```

### Indicators
```
GET /indicators/{SYMBOL}               Full snapshot: all 20+ indicators + composite score
GET /indicators/{SYMBOL}/signal        Quick signal: STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL
GET /indicators/{SYMBOL}/stoploss      Stop-loss + targets for given entry
                                        ?entry_price=2450&direction=long
```

### Milestone Alerts
```
GET  /alerts/templates                 5 pre-built rule templates to get started
POST /alerts/rules                     Create a new alert rule with milestone chain
GET  /alerts/rules                     List all active alert rules
DELETE /alerts/rules/{id}              Deactivate an alert rule
GET  /alerts/check/{SYMBOL}            Dry-run: see what milestones would fire now
POST /alerts/fire/{SYMBOL}             Run engine + send Telegram for newly crossed milestones
GET  /alerts/history                   Recent alert events with full coaching messages
GET  /alerts/telegram/test             Verify Telegram bot is connected
GET  /alerts/telegram/chat-id          Discover your Telegram chat_id
```

---

## Database Tables

| Table                | Purpose                                              |
|----------------------|------------------------------------------------------|
| symbols              | NSE/BSE symbol registry (name, exchange, sector)     |
| watchlist_items      | User watchlist (legacy from original TradeIQ)        |
| indicator_snapshots  | Cached indicator values per symbol + timestamp       |
| alert_rules          | User-defined rules with milestone chains (JSON)      |
| alert_events         | Every fired milestone = one row (coaching + levels)  |
| stop_loss_records    | Historical stop calculations per entry               |

**Tables are auto-created** on first backend startup via SQLAlchemy `create_all`.
You never need to write SQL migrations manually during development.

---

## Project Structure

```
d:\Tradeiq\
├── README.md                           This file
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── IndicatorPanel.jsx      All indicators in one dashboard panel
│       │   ├── MilestoneAlerts.jsx     Alert rule creator + history + Telegram setup
│       │   ├── CandlestickChart.jsx    TradingView price chart
│       │   ├── LivePriceBanner.jsx     Real-time price ticker
│       │   ├── NewsPanel.jsx           Finnhub news feed
│       │   └── AiChat.jsx              Claude AI chat
│       ├── config.js                   All API endpoint URLs + India symbol list
│       └── App.jsx                     Main app (5 tabs: Chart, News, AI, Signals, Alerts)
│
├── backend-python/                     STAP core engine (Python + FastAPI)
│   ├── requirements.txt                All Python packages
│   ├── docker-compose.yml              Optional: local PostgreSQL (not needed if using Proxmox)
│   ├── .env                            Your real config (not committed to git)
│   ├── .env.example                    Template for new developers
│   ├── test_db_connection.py           Run to verify Proxmox DB is reachable
│   └── app/
│       ├── main.py                     FastAPI app + DB startup + router registration
│       ├── core/
│       │   ├── config.py               All settings (read from .env)
│       │   └── database.py             SQLAlchemy async engine + session factory
│       ├── models/domain.py            All database table definitions
│       ├── routers/
│       │   ├── india_market.py         /india/... endpoints
│       │   ├── indicators.py           /indicators/... endpoints
│       │   ├── alerts.py               /alerts/... endpoints
│       │   ├── market.py               Legacy /market/... (original TradeIQ)
│       │   └── watchlist.py            Legacy /watchlist/... (original TradeIQ)
│       ├── services/
│       │   ├── india_market.py         yfinance wrapper — fetches NSE/BSE data
│       │   ├── indicator_engine.py     Computes all 20+ indicators via pandas-ta
│       │   ├── milestone_engine.py     Checks milestone chains, deduplicates firings
│       │   ├── stoploss_engine.py      Calculates stop-loss by 5 methods
│       │   ├── coaching_engine.py      Builds plain-language alert messages
│       │   └── telegram_service.py     Sends alerts to Telegram Bot API
│       └── utils/
│           └── logger.py               Structured logging
│
├── backend-proxy/                      Node.js proxy (already existed)
│   └── proxy.js                        CORS bridge for news, AI, Databricks
│
└── proxmox-setup/
    ├── PROXMOX_SETUP.md                Full PostgreSQL setup guide for your VM
    └── setup-postgres.sh               One-paste PostgreSQL install script
```

---

## Build Phases

| Phase | Status      | What was built                                                  |
|-------|-------------|------------------------------------------------------------------|
| 1     | ✅ Complete  | yfinance NSE/BSE data · 20+ indicators · Milestone engine        |
| 2     | ✅ Complete  | FastAPI backend · PostgreSQL on Proxmox · Full REST API          |
| 3     | ✅ Complete  | React dashboard · Indicator panel · Alert UI · Telegram setup    |
| 4     | 🔜 Next     | FinBERT sentiment · Reddit PRAW · Candlestick pattern recognition|
| 5     | 🔜 Later    | React Native mobile · Stripe billing · Referral system           |

---

## Subscription Tiers (Phase 5 — future)

| Tier       | Price       | Symbols  | Features                                         |
|------------|-------------|----------|--------------------------------------------------|
| Free       | ₹0          | 3        | Basic indicators, 1 alert rule, daily digest     |
| Pro        | ₹499/month  | Unlimited| All indicators, milestone chains, Telegram       |
| Pro Annual | ₹4,499/year | Unlimited| Pro + 25% off + priority support                |
| Enterprise | ₹4,999+/mo  | Unlimited| API access, white-label, team accounts           |

Break-even: 8 Pro users covers early launch server costs.
100 Pro users = ₹49,900/month revenue.
