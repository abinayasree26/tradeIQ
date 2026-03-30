import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.routers import market, watchlist, health
from app.services.scheduler import start_scheduler
from app.utils.logger import logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup DB Tables on boot
    logger.info("Initializing DB Schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database migration complete.")

    # Start Workers
    start_scheduler()
    
    yield
    logger.info("Server shutting down.")

app = FastAPI(title="TradeUI Market Engine", lifespan=lifespan)

# Allow React frontend calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)
app.include_router(watchlist.router)

@app.get("/")
def home():
    return {"message": "TradeUI Backend v1.0.0 Online"}
