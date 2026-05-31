"""
Indicator computation endpoints.
Fetches OHLCV data then runs the full indicator engine.
"""

import asyncio
from fastapi import APIRouter, Query, HTTPException
from app.services.india_market import fetch_ohlcv
from app.services.indicator_engine import (
    build_dataframe, compute_indicators, compute_pivot_points,
    find_swing_low, find_swing_high,
)
from app.services.stoploss_engine import calculate_all

router = APIRouter(prefix="/indicators", tags=["Indicators"])


@router.get("/{symbol}")
async def get_indicators(
    symbol: str,
    period: str = Query(default="6mo", description="Data lookback period"),
    interval: str = Query(default="1d", description="Candle interval"),
):
    """
    Full indicator snapshot for a symbol.
    Returns RSI, MACD, Bollinger Bands, ATR, RVOL, EMAs, VWAP, OBV, CMF,
    composite score, signal label, and pivot points.
    """
    ohlcv = await fetch_ohlcv(symbol.upper(), period=period, interval=interval)
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    df = build_dataframe(ohlcv)
    if df.empty:
        raise HTTPException(status_code=422, detail="Insufficient candle data for indicators.")

    indicators = compute_indicators(df)
    pivots = compute_pivot_points(df)

    return {
        "symbol": symbol.upper(),
        "period": period,
        "interval": interval,
        "candles_used": len(df),
        "indicators": indicators,
        "pivots": pivots,
        "swing_low_15": find_swing_low(df, 15),
        "swing_high_15": find_swing_high(df, 15),
    }


@router.get("/{symbol}/stoploss")
async def get_stoploss_targets(
    symbol: str,
    entry_price: float = Query(..., description="Your entry price"),
    direction: str = Query(default="long", description="long or short"),
    period: str = Query(default="6mo"),
    interval: str = Query(default="1d"),
):
    """
    Calculate all stop-loss and target levels for an entry price.
    Returns ATR, Swing, Bollinger, VWAP, and Pivot methods + recommended.
    """
    ohlcv = await fetch_ohlcv(symbol.upper(), period=period, interval=interval)
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    df = build_dataframe(ohlcv)
    if df.empty:
        raise HTTPException(status_code=422, detail="Insufficient candle data.")

    indicators = compute_indicators(df)
    results = calculate_all(df, indicators, entry_price=entry_price, direction=direction)

    return {
        "symbol": symbol.upper(),
        "entry_price": entry_price,
        "direction": direction,
        "methods": results,
    }


@router.get("/{symbol}/signal")
async def get_signal_summary(
    symbol: str,
    period: str = Query(default="6mo"),
):
    """
    Quick composite signal for a symbol.
    Returns overall STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL with score.
    """
    ohlcv = await fetch_ohlcv(symbol.upper(), period=period, interval="1d")
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"No data for {symbol}")

    df = build_dataframe(ohlcv)
    if df.empty:
        raise HTTPException(status_code=422, detail="Insufficient data.")

    ind = compute_indicators(df)
    return {
        "symbol": symbol.upper(),
        "signal": ind.get("signal_label", "NEUTRAL"),
        "score": ind.get("composite_score", 0),
        "rsi": ind.get("rsi_14"),
        "macd_hist": ind.get("macd_hist"),
        "rvol": ind.get("rvol"),
        "close": ind.get("close"),
        "bb_upper": ind.get("bb_upper"),
        "bb_lower": ind.get("bb_lower"),
        "atr_14": ind.get("atr_14"),
    }
