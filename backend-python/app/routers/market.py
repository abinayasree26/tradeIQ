from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.cache_manager import CacheManager
from app.services.finnhub_client import finnhub_client

router = APIRouter(prefix="/market", tags=["market"])

@router.get("/quote")
async def get_quote(symbol: str, db: AsyncSession = Depends(get_db)):
    cache = CacheManager(db)
    return await cache.get_quote(symbol)

@router.get("/news")
async def get_news(symbol: str, db: AsyncSession = Depends(get_db)):
    cache = CacheManager(db)
    return await cache.get_news(symbol)

@router.get("/candles")
async def get_candles(
    symbol: str, 
    resolution: str = "D", 
    from_ts: int = Query(...), 
    to_ts: int = Query(...)
):
    # Direct pass-through for candles as they are usually long-tail 
    # but normalized for the UI
    raw = await finnhub_client.get_candles(symbol, resolution, from_ts, to_ts)
    if raw.get('s') != 'ok': return {"error": "No data"}
    
    # Map to Chart.js / TradingView format
    return [
        {"time": raw['t'][i], "open": raw['o'][i], "high": raw['h'][i], "low": raw['l'][i], "close": raw['c'][i], "volume": raw['v'][i]}
        for i in range(len(raw['t']))
    ]
