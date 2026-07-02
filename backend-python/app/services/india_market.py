"""
India Market Data Service — fetches NSE/BSE data via yfinance (FREE, no API key).

NSE symbols  → append .NS  (e.g. RELIANCE.NS)
BSE symbols  → append .BO  (e.g. RELIANCE.BO)
NSE indices  → ^NSEI (Nifty 50), ^NSEBANK (Bank Nifty)
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional
import pytz

import yfinance as yf
import pandas as pd

from app.utils.logger import logger

IST = pytz.timezone("Asia/Kolkata")

# ─── Symbol registry ──────────────────────────────────────────────────────────

INDIA_SYMBOLS = {
    # Indices
    "NIFTY50":    {"yf": "^NSEI",        "name": "Nifty 50",          "type": "index"},
    "BANKNIFTY":  {"yf": "^NSEBANK",     "name": "Bank Nifty",        "type": "index"},
    "MIDCAP":     {"yf": "^NSMIDCP",     "name": "Nifty Midcap 100",  "type": "index"},
    "SENSEX":     {"yf": "^BSESN",       "name": "BSE Sensex",        "type": "index"},

    # Large Cap NSE
    "RELIANCE":   {"yf": "RELIANCE.NS",  "name": "Reliance Industries", "type": "equity"},
    "TCS":        {"yf": "TCS.NS",       "name": "TCS",                 "type": "equity"},
    "HDFCBANK":   {"yf": "HDFCBANK.NS",  "name": "HDFC Bank",           "type": "equity"},
    "INFY":       {"yf": "INFY.NS",      "name": "Infosys",             "type": "equity"},
    "ICICIBANK":  {"yf": "ICICIBANK.NS", "name": "ICICI Bank",          "type": "equity"},
    "HINDUNILVR": {"yf": "HINDUNILVR.NS","name": "Hindustan Unilever",  "type": "equity"},
    "SBIN":       {"yf": "SBIN.NS",      "name": "State Bank of India", "type": "equity"},
    "BAJFINANCE": {"yf": "BAJFINANCE.NS","name": "Bajaj Finance",       "type": "equity"},
    "BHARTIARTL": {"yf": "BHARTIARTL.NS","name": "Bharti Airtel",       "type": "equity"},
    "KOTAKBANK":  {"yf": "KOTAKBANK.NS", "name": "Kotak Mahindra Bank", "type": "equity"},
    "LT":         {"yf": "LT.NS",        "name": "Larsen & Toubro",     "type": "equity"},
    "AXISBANK":   {"yf": "AXISBANK.NS",  "name": "Axis Bank",           "type": "equity"},
    "TATAMOTORS": {"yf": "TATAMOTORS.NS","name": "Tata Motors",         "type": "equity"},
    "MARUTI":     {"yf": "MARUTI.NS",    "name": "Maruti Suzuki",       "type": "equity"},
    "WIPRO":      {"yf": "WIPRO.NS",     "name": "Wipro",               "type": "equity"},
    "SUNPHARMA":  {"yf": "SUNPHARMA.NS", "name": "Sun Pharma",          "type": "equity"},
    "TITAN":      {"yf": "TITAN.NS",     "name": "Titan Company",       "type": "equity"},
    "ADANIENT":   {"yf": "ADANIENT.NS",  "name": "Adani Enterprises",   "type": "equity"},
    "ADANIPORTS": {"yf": "ADANIPORTS.NS","name": "Adani Ports",         "type": "equity"},
    "NTPC":       {"yf": "NTPC.NS",      "name": "NTPC",                "type": "equity"},
    "POWERGRID":  {"yf": "POWERGRID.NS", "name": "Power Grid",          "type": "equity"},
    "ONGC":       {"yf": "ONGC.NS",      "name": "ONGC",                "type": "equity"},
    "COALINDIA":  {"yf": "COALINDIA.NS", "name": "Coal India",          "type": "equity"},
    "TATASTEEL":  {"yf": "TATASTEEL.NS", "name": "Tata Steel",          "type": "equity"},
    "JSWSTEEL":   {"yf": "JSWSTEEL.NS",  "name": "JSW Steel",           "type": "equity"},
    "HINDALCO":   {"yf": "HINDALCO.NS",  "name": "Hindalco",            "type": "equity"},
    "M&M":        {"yf": "M&M.NS",       "name": "Mahindra & Mahindra", "type": "equity"},
    "BAJAJFINSV": {"yf": "BAJAJFINSV.NS","name": "Bajaj Finserv",       "type": "equity"},
    "HCLTECH":    {"yf": "HCLTECH.NS",   "name": "HCL Technologies",    "type": "equity"},
    "TECHM":      {"yf": "TECHM.NS",     "name": "Tech Mahindra",       "type": "equity"},
    "DRREDDY":    {"yf": "DRREDDY.NS",   "name": "Dr. Reddy's Labs",    "type": "equity"},
    "CIPLA":      {"yf": "CIPLA.NS",     "name": "Cipla",               "type": "equity"},
    "DIVISLAB":   {"yf": "DIVISLAB.NS",  "name": "Divi's Laboratories", "type": "equity"},
    "ASIANPAINT": {"yf": "ASIANPAINT.NS","name": "Asian Paints",        "type": "equity"},
    "NESTLEIND":  {"yf": "NESTLEIND.NS", "name": "Nestle India",        "type": "equity"},
    "ULTRACEMCO": {"yf": "ULTRACEMCO.NS","name": "UltraTech Cement",    "type": "equity"},
    "GRASIM":     {"yf": "GRASIM.NS",    "name": "Grasim Industries",   "type": "equity"},
    "BPCL":       {"yf": "BPCL.NS",      "name": "BPCL",                "type": "equity"},
    "HEROMOTOCO": {"yf": "HEROMOTOCO.NS","name": "Hero MotoCorp",       "type": "equity"},
    "EICHERMOT":  {"yf": "EICHERMOT.NS", "name": "Eicher Motors",       "type": "equity"},
    "INDUSINDBK": {"yf": "INDUSINDBK.NS","name": "IndusInd Bank",       "type": "equity"},
    "APOLLOHOSP": {"yf": "APOLLOHOSP.NS","name": "Apollo Hospitals",    "type": "equity"},
    "TATACONSUM": {"yf": "TATACONSUM.NS","name": "Tata Consumer",       "type": "equity"},
    "BRITANNIA":  {"yf": "BRITANNIA.NS", "name": "Britannia",           "type": "equity"},
    "ITC":        {"yf": "ITC.NS",       "name": "ITC",                 "type": "equity"},
}

DEFAULT_WATCHLIST = [
    "NIFTY50", "BANKNIFTY", "RELIANCE", "TCS", "HDFCBANK",
    "INFY", "ICICIBANK", "SBIN", "BAJFINANCE", "BHARTIARTL",
]


def _yf_symbol(symbol: str) -> str:
    """Resolve internal symbol name to yfinance ticker string."""
    clean_symbol = symbol.upper().replace(" ", "").replace("-", "")
    info = INDIA_SYMBOLS.get(clean_symbol)
    if info:
        return info["yf"]
    # Fallback: assume user passed raw yfinance ticker
    return symbol


def is_market_open() -> bool:
    """Returns True if NSE is currently open (Mon–Fri 09:15–15:30 IST)."""
    now_ist = datetime.now(IST)
    if now_ist.weekday() >= 5:
        return False
    open_t = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
    close_t = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
    return open_t <= now_ist <= close_t


def get_market_session_info() -> dict:
    now_ist = datetime.now(IST)
    return {
        "is_open": is_market_open(),
        "current_time_ist": now_ist.strftime("%Y-%m-%d %H:%M:%S IST"),
        "day": now_ist.strftime("%A"),
        "exchange": "NSE",
        "open_time": "09:15 IST",
        "close_time": "15:30 IST",
    }


async def fetch_quote(symbol: str) -> Optional[dict]:
    """Fetch latest quote for a symbol. Returns None on failure."""
    yf_sym = _yf_symbol(symbol)
    try:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(None, _sync_fetch_quote, yf_sym, symbol)
        return data
    except Exception as e:
        logger.error(f"fetch_quote error [{symbol}]: {e}")
        return None


def _sync_fetch_quote(yf_sym: str, original_symbol: str) -> dict:
    ticker = yf.Ticker(yf_sym)
    info = ticker.fast_info

    price = float(info.last_price or 0)
    prev_close = float(info.previous_close or price)
    change = price - prev_close
    pct_change = (change / prev_close * 100) if prev_close else 0

    meta = INDIA_SYMBOLS.get(original_symbol.upper(), {})
    return {
        "symbol": original_symbol.upper(),
        "name": meta.get("name", original_symbol),
        "price": round(price, 2),
        "change": round(change, 2),
        "pct_change": round(pct_change, 2),
        "day_high": round(float(info.day_high or price), 2),
        "day_low": round(float(info.day_low or price), 2),
        "open": round(float(info.open or price), 2),
        "prev_close": round(prev_close, 2),
        "volume": int(info.shares or 0),
        "market_cap": float(info.market_cap or 0),
        "fifty_two_week_high": round(float(info.year_high or 0), 2),
        "fifty_two_week_low": round(float(info.year_low or 0), 2),
        "exchange": meta.get("type", "equity"),
        "is_market_open": is_market_open(),
        "fetched_at": datetime.now(IST).isoformat(),
    }


async def fetch_ohlcv(
    symbol: str,
    period: str = "1y",
    interval: str = "1d"
) -> Optional[list]:
    """
    Fetch OHLCV history.
    period:   1d 5d 1mo 3mo 6mo 1y 2y 5y
    interval: 1m 2m 5m 15m 30m 60m 90m 1h 1d 5d 1wk 1mo 3mo
    For intraday (1m/5m): max lookback is 7 days.
    """
    yf_sym = _yf_symbol(symbol)
    try:
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None, _sync_fetch_ohlcv, yf_sym, period, interval
        )
        return data
    except Exception as e:
        logger.error(f"fetch_ohlcv error [{symbol}]: {e}")
        return []


def _sync_fetch_ohlcv(yf_sym: str, period: str, interval: str) -> list:
    df = yf.download(yf_sym, period=period, interval=interval, progress=False, auto_adjust=True)
    if df.empty:
        return []

    # Flatten MultiIndex if present (yfinance >=0.2.38)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.rename(columns=str.lower)
    records = []
    for ts, row in df.iterrows():
        records.append({
            "time": int(pd.Timestamp(ts).timestamp()),
            "open": round(float(row.get("open", 0)), 2),
            "high": round(float(row.get("high", 0)), 2),
            "low": round(float(row.get("low", 0)), 2),
            "close": round(float(row.get("close", 0)), 2),
            "volume": int(row.get("volume", 0)),
        })
    return records


async def fetch_multi_quote(symbols: list) -> dict:
    """Fetch quotes for multiple symbols concurrently."""
    tasks = [fetch_quote(s) for s in symbols]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = {}
    for sym, res in zip(symbols, results):
        if isinstance(res, dict):
            out[sym] = res
    return out


def get_symbol_list() -> list:
    """Return all known India market symbols with metadata."""
    return [
        {
            "symbol": sym,
            "name": meta["name"],
            "yf_ticker": meta["yf"],
            "type": meta["type"],
        }
        for sym, meta in INDIA_SYMBOLS.items()
    ]
