from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.models.domain import WatchlistSymbol

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

@router.get("")
async def get_watchlist(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(WatchlistSymbol))
    return res.scalars().all()

@router.post("")
async def add_to_watchlist(symbol: str, db: AsyncSession = Depends(get_db)):
    symbol = symbol.upper()
    existing = await db.execute(select(WatchlistSymbol).where(WatchlistSymbol.symbol == symbol))
    if existing.scalar_one_or_none():
        return {"status": "already_exists"}
    
    new_sym = WatchlistSymbol(symbol=symbol)
    db.add(new_sym)
    await db.commit()
    return {"status": "added", "symbol": symbol}

@router.delete("/{symbol}")
async def remove_from_watchlist(symbol: str, db: AsyncSession = Depends(get_db)):
    symbol = symbol.upper()
    res = await db.execute(select(WatchlistSymbol).where(WatchlistSymbol.symbol == symbol))
    sym = res.scalar_one_or_none()
    if not sym: raise HTTPException(404, "Not found")
    
    await db.delete(sym)
    await db.commit()
    return {"status": "removed"}
