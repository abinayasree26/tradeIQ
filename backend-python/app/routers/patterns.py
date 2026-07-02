from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.models.domain import SentimentSnapshot
from app.services.pattern_engine import detect_patterns, get_pattern_coaching
from app.services.india_market import fetch_ohlcv
from app.services.indicator_engine import build_dataframe
from app.utils.logger import logger

router = APIRouter(prefix="/patterns", tags=["Patterns"])

@router.get("/{symbol}")
async def get_patterns(symbol: str, db: AsyncSession = Depends(get_db)):
    """
    Detect candlestick patterns for a symbol.
    Saves a record of the pattern results in sentiment_snapshots.
    """
    symbol = symbol.upper()
    try:
        ohlcv = await fetch_ohlcv(symbol)
        if not ohlcv:
            raise HTTPException(status_code=404, detail=f"No data found for symbol: {symbol}")
        
        df = build_dataframe(ohlcv)
        if df.empty:
            raise HTTPException(status_code=422, detail=f"Insufficient candle data for pattern detection on {symbol}")
        
        # Run detection
        result = detect_patterns(df)
        coaching = get_pattern_coaching(result)
        
        # Format the response
        response_data = {
            "symbol": symbol,
            "patterns_detected": result.get("patterns_detected", []),
            "bullish_count": result.get("bullish_count", 0),
            "bearish_count": result.get("bearish_count", 0),
            "neutral_count": result.get("neutral_count", 0),
            "pattern_signal": result.get("pattern_signal", "neutral"),
            "pattern_score": result.get("pattern_score", 0),
            "coaching": coaching
        }
        
        # Save a snapshot to sentiment_snapshots for history
        db_snapshot = SentimentSnapshot(
            symbol=symbol,
            pattern_score=response_data["pattern_score"],
            pattern_signal=response_data["pattern_signal"],
            patterns_detected=response_data["patterns_detected"],
        )
        db.add(db_snapshot)
        await db.commit()
        
        return response_data
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Pattern detection failed for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{symbol}/history")
async def get_pattern_history(
    symbol: str,
    limit: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Fetch the last N detected patterns history.
    Query from sentiment_snapshots as they contain patterns_detected.
    """
    symbol = symbol.upper()
    try:
        stmt = (
            select(SentimentSnapshot)
            .where(SentimentSnapshot.symbol == symbol)
            .where(SentimentSnapshot.patterns_detected.isnot(None))
            .order_by(SentimentSnapshot.timestamp.desc())
            .limit(limit)
        )
        res = await db.execute(stmt)
        snapshots = res.scalars().all()
        
        history = []
        for s in snapshots:
            history.append({
                "id": s.id,
                "symbol": s.symbol,
                "timestamp": s.timestamp.isoformat() if s.timestamp else None,
                "pattern_score": s.pattern_score,
                "pattern_signal": s.pattern_signal,
                "patterns_detected": s.patterns_detected
            })
        return history
    except Exception as e:
        logger.error(f"Failed to fetch pattern history for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
