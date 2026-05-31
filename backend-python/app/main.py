from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base
from app.routers import market, watchlist
from app.routers import india_market, indicators, alerts
from app.services.scheduler import start_scheduler
from app.utils.logger import logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("STAP — Smart Technical Analysis Platform starting up...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schema ready.")
    start_scheduler()
    yield
    logger.info("STAP shutting down.")


app = FastAPI(
    title="STAP — Smart Technical Analysis Platform",
    description=(
        "Real-time market intelligence for Indian traders. "
        "Milestone alerts · Indicator engine · Stop-loss engine · Coaching messages."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Legacy routes
app.include_router(market.router)
app.include_router(watchlist.router)

# STAP routes
app.include_router(india_market.router)
app.include_router(indicators.router)
app.include_router(alerts.router)


@app.get("/")
def home():
    return {
        "platform": "STAP — Smart Technical Analysis Platform",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs",
        "market": "NSE/BSE India (primary)",
        "endpoints": {
            "india_market": "/india/...",
            "indicators":   "/indicators/...",
            "alerts":        "/alerts/...",
            "market_legacy": "/market/...",
        },
    }
