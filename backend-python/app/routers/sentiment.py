"""
STAP Phase 4 — Sentiment API Router

Endpoints:
  GET /sentiment/{symbol}       — Full sentiment analysis (news + Reddit + patterns)
  GET /sentiment/{symbol}/news  — News-only FinBERT sentiment
  GET /sentiment/{symbol}/reddit — Reddit crowd sentiment
  GET /sentiment/{symbol}/patterns — Candlestick pattern detection
  GET /sentiment/score/{text}   — Score arbitrary text with FinBERT
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import asyncio, time
from datetime import datetime, timedelta
from collections import OrderedDict

from app.services.sentiment_engine import (
    score_text_finbert,
    score_headlines_batch,
    fetch_reddit_sentiment,
    compute_combined_sentiment,
)
from app.services.pattern_engine import detect_patterns, get_pattern_coaching
from app.services.india_market import fetch_ohlcv
from app.services.indicator_engine import build_dataframe  
from app.services.finnhub_client import finnhub_client  
from app.utils.logger import logger


# ─── Simple in-memory TTL cache for sentiment results ─────────────────────────

class _TTLCache:
    """Lightweight in-memory cache with per-key TTL."""
    def __init__(self, max_size: int = 200):
        self._store: OrderedDict = OrderedDict()
        self._max_size = max_size

    def get(self, key: str):
        entry = self._store.get(key)
        if entry is None:
            return None
        value, expires_at = entry
        if time.time() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value, ttl: int = 900):
        if len(self._store) >= self._max_size:
            self._store.popitem(last=False)  # Evict oldest
        self._store[key] = (value, time.time() + ttl)


_cache = _TTLCache()

router = APIRouter(prefix="/sentiment", tags=["Sentiment (Phase 4)"])


# ─── Full Sentiment Analysis ──────────────────────────────────────────────────

@router.get("/{symbol}")
async def get_full_sentiment(
    symbol: str,
    include_reddit: bool = Query(True, description="Include Reddit sentiment (slower)"),
    include_patterns: bool = Query(True, description="Include candlestick patterns"),
):
    """
    Full sentiment analysis combining:
    - FinBERT news sentiment
    - Reddit crowd sentiment (optional)
    - Candlestick pattern detection (optional)
    
    Returns unified sentiment score (-100 to +100) with breakdown.
    """
    symbol = symbol.upper()
    
    # 1. Fetch news headlines
    headlines = await _fetch_news_headlines(symbol)
    
    # 2. Run combined sentiment (FinBERT + Reddit)
    sentiment = await asyncio.get_event_loop().run_in_executor(
        None, compute_combined_sentiment, headlines, symbol, include_reddit
    )
    
    # 3. Candlestick patterns (optional)
    patterns_result = None
    if include_patterns:
        patterns_result = await _get_patterns(symbol)
        sentiment["candlestick_patterns"] = patterns_result
        
        # Blend pattern signal into overall score
        pattern_score = patterns_result.get("pattern_score", 0)
        # Patterns get 20% weight in combined signal
        sentiment["combined_score_with_patterns"] = round(
            sentiment["combined_score"] * 0.8 + pattern_score * 0.2, 1
        )
    
    return sentiment


# ─── News-Only Sentiment ──────────────────────────────────────────────────────

@router.get("/{symbol}/news")
async def get_news_sentiment(symbol: str):
    """Score recent news headlines for a symbol using FinBERT."""
    symbol = symbol.upper()
    headlines = await _fetch_news_headlines(symbol)
    
    if not headlines:
        return {
            "symbol": symbol,
            "message": "No recent news found",
            "overall_label": "neutral",
            "overall_score": 0,
            "count": 0,
        }
    
    result = await asyncio.get_event_loop().run_in_executor(
        None, score_headlines_batch, headlines
    )
    result["symbol"] = symbol
    return result


# ─── Reddit Sentiment ─────────────────────────────────────────────────────────

@router.get("/{symbol}/reddit")
async def get_reddit_sentiment(symbol: str, limit: int = Query(25, ge=5, le=50)):
    """Fetch and score Reddit posts about a symbol from Indian stock subreddits."""
    symbol = symbol.upper()
    
    result = await asyncio.get_event_loop().run_in_executor(
        None, fetch_reddit_sentiment, symbol, limit
    )
    result["symbol"] = symbol
    return result


# ─── Candlestick Patterns ─────────────────────────────────────────────────────

@router.get("/{symbol}/patterns")
async def get_candlestick_patterns(symbol: str):
    """Detect candlestick patterns for a symbol from recent OHLCV data."""
    symbol = symbol.upper()
    result = await _get_patterns(symbol)
    result["symbol"] = symbol
    return result


# ─── Score Arbitrary Text ─────────────────────────────────────────────────────

@router.get("/score/{text}")
async def score_text(text: str):
    """Score any text with FinBERT sentiment model. Useful for testing."""
    if len(text) < 5:
        raise HTTPException(status_code=400, detail="Text too short (min 5 chars)")
    
    result = await asyncio.get_event_loop().run_in_executor(
        None, score_text_finbert, text
    )
    result["input_text"] = text
    return result


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _fetch_news_headlines(symbol: str) -> list[str]:
    """Fetch news headlines from Finnhub for a symbol."""
    try:
        cache_key = f"news_headlines_{symbol}"
        cached = _cache.get(cache_key)
        if cached:
            return cached
        
        news = await finnhub_client.get_news(symbol)
        if not news:
            logger.info(f"No news returned from Finnhub for {symbol}")
            return []
        
        headlines = [article.get("headline", "") for article in news if article.get("headline")]
        
        # Cache for 15 minutes
        _cache.set(cache_key, headlines, ttl=900)
        return headlines[:20]  # Max 20 for FinBERT processing
    except Exception as e:
        logger.warning(f"Failed to fetch news for {symbol}: {e}")
        return []


async def _get_patterns(symbol: str) -> dict:
    """Get candlestick patterns for a symbol."""
    try:
        ohlcv = await fetch_ohlcv(symbol)
        if not ohlcv:
            return {"patterns_detected": [], "pattern_signal": "neutral", "pattern_score": 0}
        
        df = build_dataframe(ohlcv)
        if df.empty:
            return {"patterns_detected": [], "pattern_signal": "neutral", "pattern_score": 0}
        
        result = detect_patterns(df)
        result["coaching"] = get_pattern_coaching(result)
        return result
    except Exception as e:
        logger.error(f"Pattern detection failed for {symbol}: {e}")
        return {"patterns_detected": [], "pattern_signal": "neutral", "pattern_score": 0, "error": str(e)}
