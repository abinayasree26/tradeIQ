"""
STAP Milestone Alert Engine

Each alert rule defines a milestone chain — a progression of thresholds
that fire sequentially, each with a contextual coaching message.

Example chain for RVOL:
  steps:     [0.8, 0.9, 1.0, 1.2, 1.5]
  base_value: 100000 (yesterday's average volume)
  current:    92000  → ratio = 0.92 → fires milestone 0.9 (index 1)

The engine:
1. Loads active alert rules from DB
2. Computes current value for each rule
3. Checks which milestone was last fired (last_milestone index)
4. If current value crossed the next step, fire the next milestone
5. Writes AlertEvent to DB and dispatches notification
"""

from __future__ import annotations
import asyncio
from datetime import datetime
from typing import Optional

import pytz

from app.utils.logger import logger

IST = pytz.timezone("Asia/Kolkata")


# ─── Condition evaluators ──────────────────────────────────────────────────────

class ConditionEvaluator:
    """
    Maps condition_type → (current_value, base_value) extractor.
    Each evaluator receives the latest indicator snapshot dict.
    """

    @staticmethod
    def volume_rvol(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """Current volume vs 20-day average (base). Ratio = current/base."""
        current_vol = indicators.get("current_volume")
        avg_vol = indicators.get("avg_volume_20")
        if current_vol is None or avg_vol is None or avg_vol == 0:
            return None, None
        return current_vol, avg_vol  # ratio computed in engine

    @staticmethod
    def rsi_level(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """RSI value directly. base_value is the target RSI level."""
        rsi = indicators.get("rsi_14")
        return rsi, None   # base_value comes from rule

    @staticmethod
    def price_breakout(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """Current close vs a fixed price level stored in base_value."""
        close = indicators.get("close")
        return close, None

    @staticmethod
    def price_pct(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """% move from previous close."""
        pct = indicators.get("pct_change")
        return pct, None

    @staticmethod
    def macd_cross(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """MACD histogram value — positive = bullish cross."""
        hist = indicators.get("macd_hist")
        return hist, None

    @staticmethod
    def bb_squeeze(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """Bollinger Band bandwidth — low value signals squeeze."""
        bw = indicators.get("bb_bandwidth")
        return bw, None

    @staticmethod
    def ema_cross(indicators: dict) -> tuple[Optional[float], Optional[float]]:
        """EMA9 vs EMA21 gap as %."""
        ema9 = indicators.get("ema_9")
        ema21 = indicators.get("ema_21")
        if ema9 and ema21 and ema21 != 0:
            pct = (ema9 - ema21) / ema21 * 100
            return pct, None
        return None, None


EVALUATORS = {
    "volume_rvol":   ConditionEvaluator.volume_rvol,
    "rsi_level":     ConditionEvaluator.rsi_level,
    "price_breakout": ConditionEvaluator.price_breakout,
    "price_pct":     ConditionEvaluator.price_pct,
    "macd_cross":    ConditionEvaluator.macd_cross,
    "bb_squeeze":    ConditionEvaluator.bb_squeeze,
    "ema_cross":     ConditionEvaluator.ema_cross,
}


# ─── Milestone checker ────────────────────────────────────────────────────────

def check_milestones(rule: dict, indicators: dict) -> list[dict]:
    """
    Evaluates a single alert rule against current indicators.
    Returns list of newly-crossed milestone dicts (may be empty or have multiple
    if the price skipped several steps in one candle).

    rule keys: id, symbol, condition_type, milestone_chain, last_milestone, is_active
    milestone_chain: {"steps": [0.8, 0.9, 1.0, 1.2], "base_value": 100000, "direction": "above"}
    """
    condition_type = rule.get("condition_type", "")
    chain = rule.get("milestone_chain", {})
    steps = chain.get("steps", [])
    base_value = chain.get("base_value")  # may be None for RSI/price rules
    direction = chain.get("direction", "above")  # "above" or "below"
    last_idx = rule.get("last_milestone", 0)

    if not steps:
        return []

    evaluator = EVALUATORS.get(condition_type)
    if not evaluator:
        logger.warning(f"Unknown condition_type: {condition_type}")
        return []

    current_value, computed_base = evaluator(indicators)
    if current_value is None:
        return []

    # Resolve base_value
    if base_value is None:
        base_value = computed_base
    if base_value is None:
        # For RSI/price — base_value must be in chain
        return []

    # Compute ratio (for volume-based) or direct comparison
    if condition_type == "volume_rvol":
        ratio = current_value / base_value if base_value > 0 else 0
    else:
        ratio = current_value   # direct value comparison against steps

    fired = []
    for idx in range(last_idx, len(steps)):
        threshold = steps[idx]
        crossed = (ratio >= threshold) if direction == "above" else (ratio <= threshold)
        if crossed:
            fired.append({
                "step_index": idx,
                "threshold": threshold,
                "current_value": current_value,
                "base_value": base_value,
                "ratio": round(ratio, 4) if condition_type == "volume_rvol" else None,
                "condition_type": condition_type,
                "direction": direction,
            })
        else:
            break   # steps are ordered — stop at first uncrossed

    return fired


# ─── Default alert rule templates ─────────────────────────────────────────────

DEFAULT_RULE_TEMPLATES = [
    {
        "rule_name": "Volume Surge Alert",
        "condition_type": "volume_rvol",
        "milestone_chain": {
            "steps": [0.8, 0.9, 1.0, 1.2, 1.5, 2.0],
            "base_value": None,   # Set dynamically from avg_volume_20
            "direction": "above",
        },
        "description": "Fires as volume approaches and surpasses the daily average.",
    },
    {
        "rule_name": "RSI Oversold Alert",
        "condition_type": "rsi_level",
        "milestone_chain": {
            "steps": [50, 40, 35, 30, 25],
            "base_value": 100,   # dummy — ratio = RSI directly
            "direction": "below",
        },
        "description": "Fires as RSI drops toward oversold territory (below 30).",
    },
    {
        "rule_name": "RSI Overbought Alert",
        "condition_type": "rsi_level",
        "milestone_chain": {
            "steps": [60, 65, 70, 75, 80],
            "base_value": 0,
            "direction": "above",
        },
        "description": "Fires as RSI climbs toward overbought territory (above 70).",
    },
    {
        "rule_name": "Big Move Alert (Price %)",
        "condition_type": "price_pct",
        "milestone_chain": {
            "steps": [1.0, 2.0, 3.0, 5.0],
            "base_value": 0,
            "direction": "above",
        },
        "description": "Fires on significant intraday % moves: 1%, 2%, 3%, 5%.",
    },
    {
        "rule_name": "MACD Bullish Cross",
        "condition_type": "macd_cross",
        "milestone_chain": {
            "steps": [0.0, 0.5, 1.0],
            "base_value": 0,
            "direction": "above",
        },
        "description": "Fires when MACD histogram turns positive (bullish crossover).",
    },
]


# ─── In-memory session state (prevents duplicate milestone fires in same session) ──

_fired_sessions: dict[str, set[str]] = {}  # rule_id -> set of "idx:date" strings


def _session_key(rule_id: int, step_idx: int) -> str:
    today = datetime.now(IST).strftime("%Y-%m-%d")
    return f"{step_idx}:{today}"


def already_fired_today(rule_id: int, step_idx: int) -> bool:
    key = _session_key(rule_id, step_idx)
    fired = _fired_sessions.get(str(rule_id), set())
    return key in fired


def mark_fired(rule_id: int, step_idx: int):
    key = _session_key(rule_id, step_idx)
    _fired_sessions.setdefault(str(rule_id), set()).add(key)


def reset_session_state():
    """Call at market open to allow re-firing from the beginning each day."""
    _fired_sessions.clear()
