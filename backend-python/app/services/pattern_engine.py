"""
STAP Phase 4 — Candlestick Pattern Detection Engine

Detects common candlestick patterns using pandas-ta's candlestick module.
Returns pattern signals with interpretation for coaching messages.

Patterns detected:
- Doji (indecision)
- Hammer / Inverted Hammer (reversal at bottom)
- Engulfing (bullish / bearish reversal)
- Morning Star / Evening Star (3-bar reversal)
- Shooting Star (reversal at top)
- Three White Soldiers / Three Black Crows (strong continuation)
- Harami (potential reversal)
"""

from __future__ import annotations
from typing import Optional
import pandas as pd
import numpy as np
import pandas_ta as ta

from app.utils.logger import logger


# ─── Pattern definitions with interpretation ──────────────────────────────────

PATTERN_INFO = {
    "doji": {
        "name": "Doji",
        "signal": "neutral",
        "meaning": "Market indecision — bulls and bears are balanced",
        "action": "Wait for confirmation candle before entering",
    },
    "hammer": {
        "name": "Hammer",
        "signal": "bullish",
        "meaning": "Buyers rejected lower prices — potential reversal from downtrend",
        "action": "Watch for bullish follow-through next candle",
    },
    "inverted_hammer": {
        "name": "Inverted Hammer",
        "signal": "bullish",
        "meaning": "Buying interest emerging after decline",
        "action": "Needs confirmation — green candle next day strengthens signal",
    },
    "shooting_star": {
        "name": "Shooting Star",
        "signal": "bearish",
        "meaning": "Sellers rejected higher prices at top — potential reversal",
        "action": "Consider tightening stops if in long position",
    },
    "bullish_engulfing": {
        "name": "Bullish Engulfing",
        "signal": "bullish",
        "meaning": "Strong buying overwhelmed previous selling — trend reversal likely",
        "action": "High-confidence buy signal, especially near support",
    },
    "bearish_engulfing": {
        "name": "Bearish Engulfing",
        "signal": "bearish",
        "meaning": "Strong selling overwhelmed buyers — downtrend may begin",
        "action": "Consider exiting longs or entering shorts",
    },
    "morning_star": {
        "name": "Morning Star",
        "signal": "bullish",
        "meaning": "Three-bar reversal at bottom — very reliable bullish signal",
        "action": "Strong entry signal with stop below the star candle",
    },
    "evening_star": {
        "name": "Evening Star",
        "signal": "bearish",
        "meaning": "Three-bar reversal at top — very reliable bearish signal",
        "action": "Strong exit/short signal with stop above the star candle",
    },
    "three_white_soldiers": {
        "name": "Three White Soldiers",
        "signal": "bullish",
        "meaning": "Three consecutive strong green candles — sustained buying pressure",
        "action": "Trend continuation confirmed — ride the momentum",
    },
    "three_black_crows": {
        "name": "Three Black Crows",
        "signal": "bearish",
        "meaning": "Three consecutive strong red candles — sustained selling",
        "action": "Exit longs immediately — strong downtrend in progress",
    },
    "bullish_harami": {
        "name": "Bullish Harami",
        "signal": "bullish",
        "meaning": "Small green candle inside large red — selling exhaustion",
        "action": "Moderate signal — wait for volume confirmation",
    },
    "bearish_harami": {
        "name": "Bearish Harami",
        "signal": "bearish",
        "meaning": "Small red candle inside large green — buying exhaustion",
        "action": "Moderate signal — tighten stops, watch next candle",
    },
}


# ─── Core Pattern Detection ───────────────────────────────────────────────────

def detect_patterns(df: pd.DataFrame) -> dict:
    """
    Detect candlestick patterns from OHLCV DataFrame.
    
    Args:
        df: DataFrame with Open, High, Low, Close, Volume columns
        
    Returns: {
        "patterns_detected": [{"name", "signal", "meaning", "action", "strength"}],
        "bullish_count": int,
        "bearish_count": int,
        "neutral_count": int,
        "pattern_signal": str (bullish/bearish/neutral),
        "pattern_score": float (-100 to +100),
    }
    """
    if df.empty or len(df) < 5:
        return _empty_result()

    detected = []
    
    # Use last 5 candles for pattern detection
    recent = df.tail(5)
    
    # Manual pattern detection (more reliable than pandas-ta cdl functions)
    try:
        patterns = _detect_manual_patterns(recent)
        detected.extend(patterns)
    except Exception as e:
        logger.warning(f"Pattern detection error: {e}")

    # Also try pandas-ta candlestick patterns
    try:
        ta_patterns = _detect_ta_patterns(df)
        # Only add patterns not already detected
        existing_names = {p["name"] for p in detected}
        for p in ta_patterns:
            if p["name"] not in existing_names:
                detected.append(p)
    except Exception as e:
        logger.warning(f"pandas-ta pattern error: {e}")

    # Aggregate
    bullish = [p for p in detected if p["signal"] == "bullish"]
    bearish = [p for p in detected if p["signal"] == "bearish"]
    neutral = [p for p in detected if p["signal"] == "neutral"]

    # Score: each bullish pattern = +20, bearish = -20, neutral = 0
    score = (len(bullish) * 20) - (len(bearish) * 20)
    score = max(-100, min(100, score))  # Clamp

    if score >= 20:
        signal = "bullish"
    elif score <= -20:
        signal = "bearish"
    else:
        signal = "neutral"

    return {
        "patterns_detected": detected,
        "bullish_count": len(bullish),
        "bearish_count": len(bearish),
        "neutral_count": len(neutral),
        "pattern_signal": signal,
        "pattern_score": score,
    }


def _detect_manual_patterns(df: pd.DataFrame) -> list[dict]:
    """Detect patterns using manual OHLC analysis on recent candles."""
    patterns = []
    
    if len(df) < 3:
        return patterns
    
    # Get the last 3 candles
    c1 = df.iloc[-3]  # 3 candles ago
    c2 = df.iloc[-2]  # 2 candles ago (previous)
    c3 = df.iloc[-1]  # Most recent candle
    
    body_3 = abs(c3["Close"] - c3["Open"])
    range_3 = c3["High"] - c3["Low"]
    body_2 = abs(c2["Close"] - c2["Open"])
    range_2 = c2["High"] - c2["Low"]
    
    # Avoid division by zero
    if range_3 == 0:
        range_3 = 0.001
    if range_2 == 0:
        range_2 = 0.001
    
    # ── Doji: body < 10% of range ──
    if body_3 < (range_3 * 0.1) and range_3 > 0:
        patterns.append({**PATTERN_INFO["doji"], "strength": "moderate"})
    
    # ── Hammer: small body at top, long lower shadow ──
    lower_shadow_3 = min(c3["Open"], c3["Close"]) - c3["Low"]
    upper_shadow_3 = c3["High"] - max(c3["Open"], c3["Close"])
    
    if (lower_shadow_3 > body_3 * 2 and 
        upper_shadow_3 < body_3 * 0.5 and
        c2["Close"] < c2["Open"]):  # Previous candle was bearish (downtrend context)
        patterns.append({**PATTERN_INFO["hammer"], "strength": "strong"})
    
    # ── Shooting Star: small body at bottom, long upper shadow ──
    if (upper_shadow_3 > body_3 * 2 and 
        lower_shadow_3 < body_3 * 0.5 and
        c2["Close"] > c2["Open"]):  # Previous was bullish (uptrend context)
        patterns.append({**PATTERN_INFO["shooting_star"], "strength": "strong"})
    
    # ── Bullish Engulfing: red → green, green body covers red body ──
    if (c2["Close"] < c2["Open"] and      # prev was red
        c3["Close"] > c3["Open"] and      # current is green
        c3["Open"] <= c2["Close"] and     # opens at or below prev close
        c3["Close"] >= c2["Open"]):       # closes at or above prev open
        patterns.append({**PATTERN_INFO["bullish_engulfing"], "strength": "strong"})
    
    # ── Bearish Engulfing: green → red, red body covers green body ──
    if (c2["Close"] > c2["Open"] and      # prev was green
        c3["Close"] < c3["Open"] and      # current is red
        c3["Open"] >= c2["Close"] and     # opens at or above prev close
        c3["Close"] <= c2["Open"]):       # closes at or below prev open
        patterns.append({**PATTERN_INFO["bearish_engulfing"], "strength": "strong"})
    
    # ── Three White Soldiers: 3 consecutive green candles with higher closes ──
    if (c1["Close"] > c1["Open"] and
        c2["Close"] > c2["Open"] and
        c3["Close"] > c3["Open"] and
        c2["Close"] > c1["Close"] and
        c3["Close"] > c2["Close"]):
        patterns.append({**PATTERN_INFO["three_white_soldiers"], "strength": "very_strong"})
    
    # ── Three Black Crows: 3 consecutive red candles with lower closes ──
    if (c1["Close"] < c1["Open"] and
        c2["Close"] < c2["Open"] and
        c3["Close"] < c3["Open"] and
        c2["Close"] < c1["Close"] and
        c3["Close"] < c2["Close"]):
        patterns.append({**PATTERN_INFO["three_black_crows"], "strength": "very_strong"})
    
    # ── Bullish Harami: large red → small green inside ──
    if (c2["Close"] < c2["Open"] and      # prev was red
        c3["Close"] > c3["Open"] and      # current is green
        c3["Open"] > c2["Close"] and      # current body inside prev
        c3["Close"] < c2["Open"] and
        body_3 < body_2 * 0.5):           # current is much smaller
        patterns.append({**PATTERN_INFO["bullish_harami"], "strength": "moderate"})
    
    # ── Bearish Harami: large green → small red inside ──
    if (c2["Close"] > c2["Open"] and      # prev was green
        c3["Close"] < c3["Open"] and      # current is red
        c3["Open"] < c2["Close"] and      # current body inside prev
        c3["Close"] > c2["Open"] and
        body_3 < body_2 * 0.5):           # current is much smaller
        patterns.append({**PATTERN_INFO["bearish_harami"], "strength": "moderate"})
    
    return patterns


def _detect_ta_patterns(df: pd.DataFrame) -> list[dict]:
    """Use pandas-ta cdl functions as backup detection."""
    patterns = []
    
    try:
        # pandas-ta candlestick detection
        cdl = df.ta.cdl_pattern(name="all")
        if cdl is None or cdl.empty:
            return patterns
        
        # Check last row for any non-zero signals
        last_row = cdl.iloc[-1]
        for col in cdl.columns:
            val = last_row[col]
            if val != 0:
                # Extract pattern name from column (e.g., "CDL_DOJI" → "doji")
                pattern_key = col.replace("CDL_", "").lower()
                
                # Map to our pattern info if we have it
                if val > 0 and f"bullish_{pattern_key}" in PATTERN_INFO:
                    info = PATTERN_INFO[f"bullish_{pattern_key}"]
                    patterns.append({**info, "strength": "moderate"})
                elif val < 0 and f"bearish_{pattern_key}" in PATTERN_INFO:
                    info = PATTERN_INFO[f"bearish_{pattern_key}"]
                    patterns.append({**info, "strength": "moderate"})
    except Exception as e:
        logger.debug(f"pandas-ta cdl_pattern: {e}")
    
    return patterns


def _empty_result() -> dict:
    return {
        "patterns_detected": [],
        "bullish_count": 0,
        "bearish_count": 0,
        "neutral_count": 0,
        "pattern_signal": "neutral",
        "pattern_score": 0,
    }


# ─── Coaching integration helper ──────────────────────────────────────────────

def get_pattern_coaching(patterns_result: dict) -> str:
    """Generate coaching message segment for detected patterns."""
    detected = patterns_result.get("patterns_detected", [])
    if not detected:
        return ""
    
    lines = ["📊 Candlestick Patterns Detected:"]
    for p in detected[:3]:  # Max 3 patterns in message
        emoji = "🟢" if p["signal"] == "bullish" else "🔴" if p["signal"] == "bearish" else "⚪"
        lines.append(f"  {emoji} {p['name']} — {p['meaning']}")
        lines.append(f"     Action: {p['action']}")
    
    return "\n".join(lines)
