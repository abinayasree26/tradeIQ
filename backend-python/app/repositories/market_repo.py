from sqlalchemy.future import select
from sqlalchemy.dialects.postgresql import insert
from app.models.domain import QuoteLatest, NewsArticle, WatchlistSymbol
from datetime import datetime, timezone

class MarketRepository:
    def __init__(self, db):
        self.db = db

    async def get_latest_quote(self, symbol: str):
        res = await self.db.execute(select(QuoteLatest).where(QuoteLatest.symbol == symbol.upper()))
        return res.scalar_one_or_none()

    async def upsert_quote(self, symbol: str, data: dict):
        stmt = insert(QuoteLatest).values(symbol=symbol.upper(), **data)
        stmt = stmt.on_conflict_do_update(
            index_elements=['symbol'],
            set_=data
        )
        await self.db.execute(stmt)
        await self.db.commit()
        return await self.get_latest_quote(symbol)

    async def batch_upsert_news(self, symbol: str, articles: list):
        for art in articles:
            # Using loop for deduplication safety
            stmt = insert(NewsArticle).values(
                symbol=symbol.upper(),
                title=art.get('headline'),
                source=art.get('source'),
                url=art.get('url'),
                summary=art.get('summary'),
                published_at=datetime.fromtimestamp(art.get('datetime'), timezone.utc) if art.get('datetime') else None
            ).on_conflict_do_nothing(index_elements=['url'])
            await self.db.execute(stmt)
        await self.db.commit()

    async def get_cached_news(self, symbol: str):
        res = await self.db.execute(
            select(NewsArticle)
            .where(NewsArticle.symbol == symbol.upper())
            .order_by(NewsArticle.published_at.desc())
            .limit(50)
        )
        return list(res.scalars().all())
