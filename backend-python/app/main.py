from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.routers import market, watchlist
from app.routers import india_market, indicators, alerts
from app.services.scheduler import start_scheduler
from app.utils.logger import logger

# Phase 4+5 imports — graceful fallback if dependencies missing
try:
    from app.routers import sentiment
    HAS_SENTIMENT = True
except ImportError as e:
    HAS_SENTIMENT = False
    logger.warning(f"Phase 4 (Sentiment) disabled — missing dependency: {e}")

try:
    from app.routers import patterns
    HAS_PATTERNS = True
except ImportError as e:
    HAS_PATTERNS = False
    logger.warning(f"Patterns disabled — missing dependency: {e}")

try:
    from app.routers import auth, billing, websocket
    HAS_AUTH = True
except ImportError as e:
    HAS_AUTH = False
    logger.warning(f"Phase 5 (Auth/Billing/WS) disabled — missing dependency: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("STAP — Smart Technical Analysis Platform starting up...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schema ready.")
    start_scheduler()

    # Start WebSocket price push background task (Phase 5)
    if HAS_AUTH:
        try:
            from app.routers.websocket import price_push_loop
            asyncio.create_task(price_push_loop())
            logger.info("WebSocket price push loop started.")
        except Exception as e:
            logger.warning(f"WebSocket loop failed to start: {e}")

    yield
    logger.info("STAP shutting down.")


app = FastAPI(
    title="STAP — Smart Technical Analysis Platform",
    description=(
        "Real-time market intelligence for Indian traders. "
        "Milestone alerts · Indicator engine · Stop-loss engine · Coaching messages."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core routes (always available)
app.include_router(market.router)
app.include_router(watchlist.router)
app.include_router(india_market.router)
app.include_router(indicators.router)
app.include_router(alerts.router)

# Phase 4: Sentiment (requires transformers, praw)
if HAS_SENTIMENT:
    app.include_router(sentiment.router)

if HAS_PATTERNS:
    app.include_router(patterns.router)

# Phase 5: Auth + Billing + WebSocket (requires jose, passlib, stripe)
if HAS_AUTH:
    app.include_router(auth.router)
    app.include_router(billing.router)
    app.include_router(websocket.router)


@app.get("/")
def home():
    return {
        "platform": "STAP — Smart Technical Analysis Platform",
        "version": "2.0.0",
        "status": "online",
        "docs": "/docs",
        "market": "NSE/BSE India (primary)",
        "phases": {
            "phase_1_data": "active",
            "phase_2_api": "active",
            "phase_3_frontend": "active",
            "phase_4_sentiment": "active" if HAS_SENTIMENT else "disabled (install: transformers, praw)",
            "phase_4_patterns": "active" if HAS_PATTERNS else "disabled",
            "phase_5_auth": "active" if HAS_AUTH else "disabled (install: python-jose, passlib, stripe)",
        },
        "endpoints": {
            "india_market": "/india/...",
            "indicators": "/indicators/...",
            "alerts": "/alerts/...",
            **({"sentiment": "/sentiment/..."} if HAS_SENTIMENT else {}),
            **({"patterns": "/patterns/..."} if HAS_PATTERNS else {}),
            **({"auth": "/auth/...", "billing": "/billing/...", "websocket": "ws://host/ws/market"} if HAS_AUTH else {}),
        },
    }
