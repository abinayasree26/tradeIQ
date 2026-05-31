"""
STAP Stop-Loss & Target Engine

Calculates technical stop-loss levels and profit targets automatically.
Every alert that suggests a trade setup includes these values.
"""

from __future__ import annotations
from typing import Optional
import pandas as pd

from app.services.indicator_engine import (
    compute_pivot_points,
    find_swing_low,
    find_swing_high,
)


def calculate_all(
    df: pd.DataFrame,
    indicators: dict,
    entry_price: float,
    direction: str = "long",     # "long" or "short"
    atr_multiplier: float = 1.5,
) -> dict:
    """
    Returns all stop-loss and target methods as a dict.
    Also picks the recommended method based on market context.
    """
    if df.empty or entry_price <= 0:
        return {}

    atr = indicators.get("atr_14")
    vwap = indicators.get("vwap")
    bb_lower = indicators.get("bb_lower")
    bb_upper = indicators.get("bb_upper")

    results = {}

    # ── Method 1: ATR Stop (default for breakouts) ────────────────────────────
    if atr and atr > 0:
        if direction == "long":
            sl = entry_price - (atr_multiplier * atr)
            t1 = entry_price + (atr_multiplier * atr)
            t2 = entry_price + (atr_multiplier * 2 * atr)
        else:
            sl = entry_price + (atr_multiplier * atr)
            t1 = entry_price - (atr_multiplier * atr)
            t2 = entry_price - (atr_multiplier * 2 * atr)

        rr = abs(entry_price - t1) / abs(entry_price - sl) if sl != entry_price else 0
        results["atr"] = {
            "stop_loss": _r(sl),
            "target_1": _r(t1),
            "target_2": _r(t2),
            "risk_reward": _r(rr),
            "atr": _r(atr),
            "method": "ATR Stop (1.5× ATR)",
            "description": f"Stop at {atr_multiplier}× ATR below entry. Best for breakouts.",
        }

    # ── Method 2: Swing Low/High Stop ─────────────────────────────────────────
    if direction == "long":
        swing_sl = find_swing_low(df, lookback=15)
        swing_target = find_swing_high(df, lookback=20)
    else:
        swing_sl = find_swing_high(df, lookback=15)
        swing_target = find_swing_low(df, lookback=20)

    if swing_sl and swing_target:
        risk = abs(entry_price - swing_sl)
        reward = abs(swing_target - entry_price)
        rr = reward / risk if risk > 0 else 0
        results["swing"] = {
            "stop_loss": _r(swing_sl),
            "target_1": _r(swing_target),
            "target_2": _r(swing_target + (swing_target - entry_price) * 0.5) if direction == "long"
                        else _r(swing_target - (entry_price - swing_target) * 0.5),
            "risk_reward": _r(rr),
            "method": "Swing Low Stop",
            "description": "Stop below recent swing low. Best for trending pullbacks.",
        }

    # ── Method 3: Bollinger Band Stop ─────────────────────────────────────────
    if bb_lower and bb_upper:
        if direction == "long" and bb_lower < entry_price:
            rr = abs(entry_price - bb_upper) / abs(entry_price - bb_lower) if bb_lower != entry_price else 0
            results["bollinger"] = {
                "stop_loss": _r(bb_lower),
                "target_1": _r(bb_upper),
                "target_2": _r(bb_upper + (bb_upper - indicators.get("bb_mid", bb_upper)) * 0.5),
                "risk_reward": _r(rr),
                "method": "Bollinger Band Stop",
                "description": "Stop at lower band, target upper band. Best for mean-reversion setups.",
            }
        elif direction == "short" and bb_upper > entry_price:
            rr = abs(entry_price - bb_lower) / abs(entry_price - bb_upper) if bb_upper != entry_price else 0
            results["bollinger"] = {
                "stop_loss": _r(bb_upper),
                "target_1": _r(bb_lower),
                "target_2": _r(bb_lower - (indicators.get("bb_mid", bb_lower) - bb_lower) * 0.5),
                "risk_reward": _r(rr),
                "method": "Bollinger Band Stop",
                "description": "Stop at upper band, target lower band. Best for overbought reversals.",
            }

    # ── Method 4: VWAP Stop ───────────────────────────────────────────────────
    if vwap:
        if direction == "long" and vwap < entry_price:
            risk = entry_price - vwap
            t1_vwap = entry_price + risk
            rr = risk / risk if risk > 0 else 1
            results["vwap"] = {
                "stop_loss": _r(vwap),
                "target_1": _r(t1_vwap),
                "target_2": _r(t1_vwap + risk * 0.5),
                "risk_reward": 1.0,
                "method": "VWAP Stop",
                "description": "Stop below VWAP. Best for intraday momentum trades.",
            }

    # ── Method 5: Pivot Point Targets ─────────────────────────────────────────
    pivots = compute_pivot_points(df)
    if pivots:
        close = indicators.get("close", entry_price)
        if direction == "long":
            next_r = pivots["r1"] if close < pivots["r1"] else pivots["r2"]
            second_r = pivots["r2"] if close < pivots["r1"] else pivots["r3"]
            sl_pivot = pivots["s1"] if close > pivots["s1"] else pivots.get("s2", close * 0.98)
        else:
            next_r = pivots["s1"] if close > pivots["s1"] else pivots["s2"]
            second_r = pivots["s2"] if close > pivots["s1"] else pivots.get("s3", close * 1.02)
            sl_pivot = pivots["r1"] if close < pivots["r1"] else pivots.get("r2", close * 1.02)

        risk = abs(entry_price - sl_pivot)
        reward = abs(next_r - entry_price)
        rr = reward / risk if risk > 0 else 0
        results["pivot"] = {
            "stop_loss": _r(sl_pivot),
            "target_1": _r(next_r),
            "target_2": _r(second_r),
            "risk_reward": _r(rr),
            "pivot_point": pivots.get("pivot"),
            "method": "Pivot Point Target",
            "description": "Target next R1/R2 resistance. Best for intraday and swing trades.",
            "all_pivots": pivots,
        }

    # ── Best recommendation ───────────────────────────────────────────────────
    best = _pick_best_method(results, indicators)
    results["recommended"] = best

    return results


def _pick_best_method(results: dict, indicators: dict) -> Optional[dict]:
    """
    Heuristic to pick the most appropriate stop method:
    - BB squeeze → Bollinger band method
    - High RVOL breakout → ATR method
    - Near VWAP → VWAP method
    - Default → ATR
    """
    bb_bw = indicators.get("bb_bandwidth")
    rvol = indicators.get("rvol", 1)

    if bb_bw is not None and bb_bw < 0.05 and "bollinger" in results:
        return results["bollinger"]
    if rvol and rvol > 1.5 and "atr" in results:
        return results["atr"]
    if "atr" in results:
        return results["atr"]
    if results:
        return list(results.values())[0]
    return None


def _r(val: float, decimals: int = 2) -> float:
    """Round to 2 decimal places."""
    try:
        return round(float(val), decimals)
    except (TypeError, ValueError):
        return 0.0
