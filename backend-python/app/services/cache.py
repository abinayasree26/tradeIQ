from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List

from app.core.config import settings
from app.repositories.market_repo import MarketRepository
from app.services.finnhub import finnhub_client
from app.models.domain import QuoteLatest, NewsArticle
from app.utils.logger import logger

class CacheService:
    def __init__(self, db: AsyncSession):
        self.repo = MarketRepository(db)

    async def get_or_fetch_quote(self, symbol: str) -> Optional[QuoteLatest]:
        symbol = symbol.upper()
        # 1. Fetch from DB
        quote = await self.repo.get_quote(symbol)

        # 2. Extract timestamp and verify TTL (60s)
        if quote and quote.ts:
            age_seconds = (datetime.now(timezone.utc) - quote.ts).total_seconds()
            if age_seconds < settings.QUOTE_TTL_SECONDS:
                return quote

        # 3. Cache Miss / TTL Expiration logic
        try:
            data = await finnhub_client.fetch_quote(symbol)
            new_quote = await self.repo.upsert_quote(
                symbol=symbol,
                price=data.get('c'),
                change=data.get('d'),
                pct_change=data.get('dp')
            )
            await self.repo.db.commit()
            return new_quote
            
        except Exception as e:
            logger.error(f"Fallback initiated. Error refreshing quote for {symbol}: {e}")
            await self.repo.db.rollback()
            # Stale-but-usable fallback on error
            if quote:
                return quote
            return None

    async def get_or_fetch_news(self, symbol: str) -> List[NewsArticle]:
        symbol = symbol.upper()
        
        # 1. DB Fetch
        articles = await self.repo.get_news(symbol, limit=50)

        # 2. TTL (15m) Verification based on most recently fetched item
        if articles and articles[0].fetched_at:
            age_seconds = (datetime.now(timezone.utc) - articles[0].fetched_at).total_seconds()
            if age_seconds < (settings.NEWS_TTL_MINUTES * 60):
                return articles

        # 3. Cache Miss / TTL Refresh
        try:
            fetched = await finnhub_client.fetch_news(symbol)
            await self.repo.upsert_news(symbol, fetched)
            await self.repo.db.commit()
            
            # Fetch latest again specifically tracking limits
            return await self.repo.get_news(symbol, limit=50)
            
        except Exception as e:
            logger.error(f"Fallback initiated. Error refreshing news for {symbol}: {e}")
            await self.repo.db.rollback()
            return articles
