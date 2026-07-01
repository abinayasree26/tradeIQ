"""
STAP Phase 4 — Sentiment Engine

Combines multiple sentiment sources into a unified sentiment signal:
1. FinBERT (HuggingFace) — NLP sentiment scoring of news headlines
2. Reddit PRAW — Crowd sentiment from r/IndianStockMarket
3. Finnhub News — Pre-fetched headlines for FinBERT processing

Output: sentiment_score (-100 to +100), sentiment_label, confidence
"""

from __future__ import annotations
from typing import Optional
import asyncio
from datetime import datetime, timedelta
from functools import lru_cache

from app.utils.logger import logger

# FinBERT will be loaded lazily on first use (heavy model)
_finbert_pipeline = None


def _get_finbert():
    """Lazy-load FinBERT pipeline (downloads ~420MB on first run)."""
    global _finbert_pipeline
    if _finbert_pipeline is None:
        try:
            from transformers import pipeline
            logger.info("Loading FinBERT model (first time may download ~420MB)...")
            _finbert_pipeline = pipeline(
                "sentiment-analysis",
                model="ProsusAI/finbert",
                tokenizer="ProsusAI/finbert",
                top_k=None,  # Return all labels with scores
            )
            logger.info("FinBERT model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load FinBERT: {e}")
            _finbert_pipeline = None
    return _finbert_pipeline


# ─── FinBERT Sentiment Scoring ─────────────────────────────────────────────────

def score_text_finbert(text: str) -> dict:
    """
    Score a single text with FinBERT.
    Returns: {"label": "positive/negative/neutral", "score": float, "all_scores": {...}}
    """
    pipe = _get_finbert()
    if pipe is None:
        return {"label": "neutral", "score": 0.0, "all_scores": {}, "error": "FinBERT not loaded"}

    try:
        # FinBERT max input is 512 tokens — truncate long texts
        truncated = text[:500]
        results = pipe(truncated)

        # results is [[{"label": "positive", "score": 0.95}, ...]]
        scores_list = results[0] if results else []
        all_scores = {item["label"]: round(item["score"], 4) for item in scores_list}

        # Find dominant label
        best = max(scores_list, key=lambda x: x["score"]) if scores_list else {"label": "neutral", "score": 0.0}

        return {
            "label": best["label"],
            "score": round(best["score"], 4),
            "all_scores": all_scores,
        }
    except Exception as e:
        logger.error(f"FinBERT scoring error: {e}")
        return {"label": "neutral", "score": 0.0, "all_scores": {}, "error": str(e)}


def score_headlines_batch(headlines: list[str]) -> dict:
    """
    Score multiple headlines and return aggregate sentiment.
    Returns: {
        "overall_label": str,
        "overall_score": float (-100 to +100),
        "confidence": float (0-1),
        "positive_pct": float,
        "negative_pct": float,
        "neutral_pct": float,
        "scored_headlines": [{text, label, score}],
        "count": int
    }
    """
    if not headlines:
        return _empty_result()

    scored = []
    for h in headlines[:20]:  # Limit to 20 headlines for performance
        result = score_text_finbert(h)
        scored.append({
            "text": h,
            "label": result["label"],
            "score": result["score"],
        })

    # Calculate aggregate
    positive_count = sum(1 for s in scored if s["label"] == "positive")
    negative_count = sum(1 for s in scored if s["label"] == "negative")
    neutral_count = sum(1 for s in scored if s["label"] == "neutral")
    total = len(scored)

    # Weighted score: positive = +1, negative = -1, neutral = 0
    # Weighted by confidence of each prediction
    weighted_sum = sum(
        s["score"] * (1 if s["label"] == "positive" else -1 if s["label"] == "negative" else 0)
        for s in scored
    )
    # Normalize to -100 to +100
    overall_score = round((weighted_sum / total) * 100, 1) if total > 0 else 0

    # Average confidence
    avg_confidence = sum(s["score"] for s in scored) / total if total > 0 else 0

    # Overall label
    if overall_score >= 30:
        overall_label = "bullish"
    elif overall_score >= 10:
        overall_label = "slightly_bullish"
    elif overall_score <= -30:
        overall_label = "bearish"
    elif overall_score <= -10:
        overall_label = "slightly_bearish"
    else:
        overall_label = "neutral"

    return {
        "overall_label": overall_label,
        "overall_score": overall_score,
        "confidence": round(avg_confidence, 3),
        "positive_pct": round(positive_count / total * 100, 1) if total else 0,
        "negative_pct": round(negative_count / total * 100, 1) if total else 0,
        "neutral_pct": round(neutral_count / total * 100, 1) if total else 0,
        "scored_headlines": scored,
        "count": total,
    }


def _empty_result() -> dict:
    return {
        "overall_label": "neutral",
        "overall_score": 0,
        "confidence": 0,
        "positive_pct": 0,
        "negative_pct": 0,
        "neutral_pct": 0,
        "scored_headlines": [],
        "count": 0,
    }


# ─── Reddit Sentiment (PRAW) ──────────────────────────────────────────────────

def fetch_reddit_sentiment(symbol: str, limit: int = 25) -> dict:
    """
    Scrape r/IndianStockMarket for posts mentioning the symbol.
    Score each post title with FinBERT.
    Returns same structure as score_headlines_batch.
    """
    try:
        import praw
        from app.core.config import settings

        if not settings.REDDIT_CLIENT_ID:
            return {**_empty_result(), "error": "Reddit credentials not configured"}

        reddit = praw.Reddit(
            client_id=settings.REDDIT_CLIENT_ID,
            client_secret=settings.REDDIT_CLIENT_SECRET,
            user_agent=settings.REDDIT_USER_AGENT,
        )

        # Search in multiple Indian stock subreddits
        subreddits = ["IndianStockMarket", "IndianStreetBets", "DalalStreetTalks"]
        posts = []

        for sub_name in subreddits:
            try:
                subreddit = reddit.subreddit(sub_name)
                results = subreddit.search(symbol, sort="new", time_filter="week", limit=limit)
                for post in results:
                    posts.append(post.title)
            except Exception as e:
                logger.warning(f"Reddit search failed for r/{sub_name}: {e}")
                continue

        if not posts:
            return {**_empty_result(), "source": "reddit", "message": f"No posts found for {symbol}"}

        # Score with FinBERT
        result = score_headlines_batch(posts)
        result["source"] = "reddit"
        result["subreddits"] = subreddits
        return result

    except ImportError:
        return {**_empty_result(), "error": "praw not installed (pip install praw)"}
    except Exception as e:
        logger.error(f"Reddit sentiment error: {e}")
        return {**_empty_result(), "error": str(e)}


# ─── Combined Sentiment Signal ────────────────────────────────────────────────

def compute_combined_sentiment(
    news_headlines: list[str],
    symbol: str,
    include_reddit: bool = True,
) -> dict:
    """
    Combine news sentiment + Reddit sentiment into one unified signal.
    News is weighted 60%, Reddit 40% (news is more reliable).
    """
    news_result = score_headlines_batch(news_headlines)

    if include_reddit:
        reddit_result = fetch_reddit_sentiment(symbol, limit=15)
    else:
        reddit_result = _empty_result()

    # Weighted combination
    news_weight = 0.6
    reddit_weight = 0.4

    news_score = news_result["overall_score"]
    reddit_score = reddit_result["overall_score"]

    # If one source has no data, use only the other
    if news_result["count"] == 0 and reddit_result["count"] == 0:
        combined_score = 0
    elif news_result["count"] == 0:
        combined_score = reddit_score
    elif reddit_result.get("count", 0) == 0:
        combined_score = news_score
    else:
        combined_score = round(news_score * news_weight + reddit_score * reddit_weight, 1)

    # Label
    if combined_score >= 30:
        label = "bullish"
    elif combined_score >= 10:
        label = "slightly_bullish"
    elif combined_score <= -30:
        label = "bearish"
    elif combined_score <= -10:
        label = "slightly_bearish"
    else:
        label = "neutral"

    return {
        "symbol": symbol,
        "combined_score": combined_score,
        "combined_label": label,
        "news_sentiment": news_result,
        "reddit_sentiment": reddit_result,
        "weights": {"news": news_weight, "reddit": reddit_weight},
        "timestamp": datetime.utcnow().isoformat(),
    }
