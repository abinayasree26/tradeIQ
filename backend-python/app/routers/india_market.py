"""India market data endpoints — powered by yfinance (FREE)."""

from fastapi import APIRouter, Query, HTTPException
from app.services.india_market import (
    fetch_quote,
    fetch_ohlcv,
    fetch_multi_quote,
    get_symbol_list,
    get_market_session_info,
    DEFAULT_WATCHLIST,
)

router = APIRouter(prefix="/india", tags=["India Market"])


@router.get("/symbols")
async def list_symbols():
    """All supported NSE/BSE symbols with metadata."""
    return {"symbols": get_symbol_list(), "total": len(get_symbol_list())}


@router.get("/session")
async def market_session():
    """Current NSE market session status."""
    return get_market_session_info()


@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    """Latest quote for a single symbol (price, change, high, low, volume)."""
    data = await fetch_quote(symbol.upper())
    if not data:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found or data unavailable.")
    return data


@router.get("/quotes")
async def get_multiple_quotes(
    symbols: str = Query(default=",".join(DEFAULT_WATCHLIST),
                         description="Comma-separated symbol list")
):
    """Bulk quotes for multiple symbols in one call."""
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=400, detail="No symbols provided.")
    return await fetch_multi_quote(sym_list)


@router.get("/ohlcv/{symbol}")
async def get_ohlcv(
    symbol: str,
    period: str = Query(default="1y", description="1d 5d 1mo 3mo 6mo 1y 2y 5y"),
    interval: str = Query(default="1d", description="1m 5m 15m 30m 1h 1d 1wk"),
):
    """
    OHLCV history for charting.
    - Daily candles: period=1y, interval=1d
    - Intraday (max 7 days): period=5d, interval=5m
    """
    data = await fetch_ohlcv(symbol.upper(), period=period, interval=interval)
    if not data:
        raise HTTPException(status_code=404, detail=f"No OHLCV data for {symbol}.")
    return {"symbol": symbol.upper(), "period": period, "interval": interval, "candles": data}


@router.get("/watchlist")
async def get_default_watchlist():
    """Default watchlist with live quotes."""
    quotes = await fetch_multi_quote(DEFAULT_WATCHLIST)
    return {"watchlist": DEFAULT_WATCHLIST, "quotes": quotes}
