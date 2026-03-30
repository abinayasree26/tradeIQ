from datetime import datetime, timezone, timedelta
from app.services.finnhub_client import finnhub_client
from app.repositories.market_repo import MarketRepository
from app.core.config import settings
from app.utils.logger import logger

class CacheManager:
    def __init__(self, db):
        self.repo = MarketRepository(db)

    async def get_quote(self, symbol: str):
        symbol = symbol.upper()
        # 1. Check DB Cache
        cached = await self.repo.get_latest_quote(symbol)
        
        if cached:
            age = datetime.now(timezone.utc) - cached.updated_at
            if age < timedelta(seconds=settings.QUOTE_TTL_SECONDS):
                return cached

        # 2. TTL Expired or Miss -> Fetch
        try:
            raw = await finnhub_client.get_quote(symbol)
            if not raw: return cached # Stale fallback
            
            # 3. Normalize & Upsert
            updated = await self.repo.upsert_quote(symbol, {
                "price": raw['c'],
                "change": raw['d'],
                "pct_change": raw['dp'],
                "high": raw['h'],
                "low": raw['l'],
                "open": raw['o'],
                "prev_close": raw['pc'],
                "ts": raw['t']
            })
            return updated
        except Exception:
            return cached # Stale fallback

    async def get_news(self, symbol: str):
        # Similar TTL logic for News
        articles = await self.repo.get_cached_news(symbol)
        if articles:
            # Check latest article fetched_at
            if (datetime.now(timezone.utc) - articles[0].created_at) < timedelta(minutes=settings.NEWS_TTL_MINUTES):
                return articles

        try:
            raw_news = await finnhub_client.get_news(symbol)
            await self.repo.batch_upsert_news(symbol, raw_news)
            return await self.repo.get_cached_news(symbol)
        except Exception:
            return articles
