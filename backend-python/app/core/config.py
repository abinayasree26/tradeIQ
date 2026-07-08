from pathlib import Path
from pydantic_settings import BaseSettings

# Resolve the absolute path of the workspace root .env file
# config.py is at: <root>/backend-python/app/core/config.py
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent


class Settings(BaseSettings):
    # ── Market data ───────────────────────────────────────────────────────────
    # Finnhub: free news API (60 req/min). Get key at finnhub.io/register
    FINNHUB_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""

    # ── Database — Proxmox VM 104 (moneyflow-server, 192.168.86.245) ─────────
    # PostgreSQL 14 running on the home Proxmox server.
    # URL format: postgresql+asyncpg://user:password@host:port/dbname
    # asyncpg = async PostgreSQL driver (required by SQLAlchemy async engine)
    DATABASE_URL: str = "postgresql+asyncpg://tradeiq:tradeiq123@192.168.86.245:5432/tradeiq_db"

    # ── App ───────────────────────────────────────────────────────────────────
    ENV: str = "development"
    APP_PORT: int = 8000

    # ── Cache TTLs ────────────────────────────────────────────────────────────
    # How long to reuse cached market data before re-fetching from yfinance.
    # yfinance has no rate limit but has a ~15 min delay for free data.
    QUOTE_TTL_SECONDS: int = 60
    NEWS_TTL_MINUTES: int = 15

    # ── Telegram alerts — FREE, instant push notifications ───────────────────
    # 1. Open Telegram → search @BotFather → /newbot → get BOT_TOKEN
    # 2. Message your new bot once, then GET /alerts/telegram/chat-id to find CHAT_ID
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""

    # ── Reddit sentiment — FREE ───────────────────────────────────────────────
    # Used in Phase 4 to scrape r/IndianStockMarket for retail sentiment signals.
    # Register at: reddit.com/prefs/apps → create "script" app
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "TradeIQ/1.0"

    # ── Anthropic Claude — AI chat assistant ─────────────────────────────────
    # Powers the AI chat panel in the frontend. Paid API.
    ANTHROPIC_KEY: str = ""

    # ── JWT Authentication ─────────────────────────────────────────────────────
    # Secret key for signing JWT tokens. MUST be changed in production.
    # Generate with: python -c "import secrets; print(secrets.token_urlsafe(64))"
    JWT_SECRET_KEY: str = "CHANGE-ME-in-production-use-secrets-token-urlsafe-64"
    JWT_ALGORITHM: str = "HS256"

    # ── Stripe Billing ─────────────────────────────────────────────────────────
    # Leave empty for demo mode (upgrades work without payment).
    # Get keys at: dashboard.stripe.com/apikeys
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_PRO_MONTHLY: str = ""
    STRIPE_PRICE_PRO_ANNUAL: str = ""
    STRIPE_PRICE_ENTERPRISE: str = ""

    # ── Frontend URL (for Stripe redirects) ────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Indicator engine defaults ─────────────────────────────────────────────
    # 6 months of daily candles gives enough data for EMA 200 + all indicators.
    # "1d" interval = end-of-day data. For intraday use "15m" or "1h".
    INDICATOR_LOOKBACK_PERIOD: str = "6mo"
    INDICATOR_INTERVAL: str = "1d"

    # Databricks (used by Node proxy — kept here so pydantic doesn't reject them from .env)
    DATABRICKS_HOST: str = ""
    DATABRICKS_TOKEN: str = ""
    DATABRICKS_WAREHOUSE_ID: str = ""

    # Twelve Data Key (used by Node proxy — kept here for schema completeness)
    TWELVE_DATA_KEY: str = ""

    # Node Proxy Port (used by Node proxy — kept here for schema completeness)
    PORT: int = 3000

    class Config:
        # Load from the shared root .env first; fall back to relative paths
        # so that starting from anywhere inside the project works.
        env_file = (
            str(BASE_DIR / ".env"),
            "../.env",
            ".env",
            "../../.env"
        )
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
