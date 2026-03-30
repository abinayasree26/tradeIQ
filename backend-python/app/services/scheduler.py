from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.core.database import AsyncSessionLocal
from app.services.cache_manager import CacheManager
from app.models.domain import WatchlistSymbol
from sqlalchemy.future import select
from app.utils.logger import logger

scheduler = AsyncIOScheduler()

async def refresh_watchlist_data():
    logger.info("Executing periodic watchlist refresh...")
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(WatchlistSymbol))
        symbols = [s.symbol for s in res.scalars().all()]
        
        manager = CacheManager(db)
        for sym in symbols:
            # Re-fetch both quotes and news
            await manager.get_quote(sym)
            await manager.get_news(sym)

def start_scheduler():
    # Quotes every 60s
    scheduler.add_job(refresh_watchlist_data, 'interval', seconds=60, id='master_refresh')
    scheduler.start()
    logger.info("Background scheduler started.")
