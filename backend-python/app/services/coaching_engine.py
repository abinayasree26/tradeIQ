"""
STAP Coaching Message Engine

Generates plain-language coaching messages for every alert.
Goal: every trader, even a beginner, should understand exactly what happened
and what to watch next.
"""

from __future__ import annotations
from typing import Optional
import random


# ─── Condition-type coaching templates ───────────────────────────────────────

def build_milestone_message(
    symbol: str,
    condition_type: str,
    milestone_pct: float,
    current_value: float,
    base_value: float,
    indicators: dict,
    stop_loss: Optional[float] = None,
    target_1: Optional[float] = None,
    target_2: Optional[float] = None,
) -> str:
    """
    Build the full coaching message for a fired milestone.
    Includes what happened, what it means, and what to watch next.
    """
    price = indicators.get("close", 0)
    rsi = indicators.get("rsi_14")
    macd_hist = indicators.get("macd_hist")
    rvol = indicators.get("rvol")
    signal = indicators.get("signal_label", "NEUTRAL")
    score = indicators.get("composite_score", 0)

    # Dispatch to condition-specific builder
    builders = {
        "volume_rvol":    _msg_volume,
        "rsi_level":      _msg_rsi,
        "price_breakout": _msg_price_breakout,
        "price_pct":      _msg_price_pct,
        "macd_cross":     _msg_macd,
        "bb_squeeze":     _msg_bb_squeeze,
        "ema_cross":      _msg_ema_cross,
    }

    builder = builders.get(condition_type, _msg_generic)
    core_msg = builder(
        symbol=symbol,
        milestone_pct=milestone_pct,
        current_value=current_value,
        base_value=base_value,
        price=price,
        indicators=indicators,
    )

    # Append multi-signal context
    context_lines = _build_context(rsi, macd_hist, rvol, signal, score)

    # Append stop-loss / target
    trade_lines = _build_trade_levels(price, stop_loss, target_1, target_2)

    return "\n".join(filter(None, [core_msg] + context_lines + trade_lines))


# ─── Per-condition message builders ──────────────────────────────────────────

def _msg_volume(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    pct_int = int(milestone_pct * 100)
    ratio = current_value / base_value if base_value else 0

    if milestone_pct <= 0.85:
        sentiment = "Momentum is building"
        action = "Watch for a potential breakout if volume continues to rise."
    elif milestone_pct <= 0.95:
        sentiment = "Volume approaching key threshold"
        action = "Prepare for a possible move. Set your alert levels."
    elif milestone_pct <= 1.05:
        sentiment = "Daily volume target HIT"
        action = f"Price is at ₹{price:,.2f}. This is a potential entry zone on confirmation."
    elif milestone_pct <= 1.4:
        sentiment = "Volume surge — high conviction"
        action = "Strong institutional or retail interest. Consider entry with tight stop."
    else:
        sentiment = "Exceptional volume spike"
        action = "This is a high-momentum event. Manage risk carefully — reversals are possible."

    return (
        f"📊 VOLUME ALERT — {symbol}\n"
        f"Volume at {pct_int}% of daily average ({ratio:.2f}× RVOL).\n"
        f"{sentiment}. {action}"
    )


def _msg_rsi(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    rsi = current_value
    if rsi <= 30:
        interpretation = "RSI deeply oversold — historically a strong reversal zone."
        action = "Watch for a bullish candle confirmation before entering long."
        emoji = "🟢"
    elif rsi <= 40:
        interpretation = "RSI approaching oversold — weakness is showing."
        action = "Dip buyers may step in. Look for support levels."
        emoji = "🟡"
    elif rsi >= 70:
        interpretation = "RSI overbought — the stock has moved fast and far."
        action = "Consider taking partial profits. Momentum may stall here."
        emoji = "🔴"
    elif rsi >= 60:
        interpretation = "RSI elevated — bullish momentum is strong."
        action = "Trend-followers can hold. Watch for divergence."
        emoji = "🟠"
    else:
        interpretation = "RSI neutral zone."
        action = "No strong signal from RSI alone. Look at other indicators."
        emoji = "⚪"

    return (
        f"{emoji} RSI ALERT — {symbol}\n"
        f"RSI: {rsi:.1f} | Price: ₹{price:,.2f}\n"
        f"{interpretation}\n"
        f"What to do: {action}"
    )


def _msg_price_breakout(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    direction = "above" if current_value >= base_value else "below"
    emoji = "🚀" if direction == "above" else "📉"
    return (
        f"{emoji} PRICE BREAKOUT — {symbol}\n"
        f"Price ₹{price:,.2f} has moved {direction} the key level ₹{base_value:,.2f}.\n"
        f"Breakouts above resistance on high volume signal continuation.\n"
        f"What to do: Confirm close above level. Entry on retest is lower risk."
    )


def _msg_price_pct(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    pct = current_value
    direction = "up" if pct >= 0 else "down"
    emoji = "🚀" if pct >= 2 else ("📈" if pct >= 0 else "📉")
    abs_pct = abs(pct)

    if abs_pct >= 5:
        context = "This is an unusually large intraday move. Check for news or earnings."
    elif abs_pct >= 3:
        context = "Significant move. Volume confirmation is key."
    else:
        context = "Notable move developing. Watch for continuation or reversal."

    return (
        f"{emoji} PRICE MOVE — {symbol}\n"
        f"Stock is {direction} {abs_pct:.2f}% | Price: ₹{price:,.2f}\n"
        f"{context}"
    )


def _msg_macd(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    hist = current_value
    macd_line = indicators.get("macd", 0) or 0
    signal_line = indicators.get("macd_signal", 0) or 0

    if hist > 0 and macd_line > signal_line:
        msg = "MACD has crossed above the signal line — bullish momentum is turning ON."
        action = "Consider long entry. Stop below recent swing low."
        emoji = "🟢"
    elif hist > 0:
        msg = "MACD histogram is positive — bullish pressure building."
        action = "Wait for MACD line to confirm cross above signal."
        emoji = "🟡"
    else:
        msg = "MACD histogram turned negative — bearish momentum emerging."
        action = "Longs should be cautious. Bears may look for short entries."
        emoji = "🔴"

    return (
        f"{emoji} MACD SIGNAL — {symbol}\n"
        f"MACD: {macd_line:.2f} | Signal: {signal_line:.2f} | Histogram: {hist:.2f}\n"
        f"{msg}\n"
        f"What to do: {action}"
    )


def _msg_bb_squeeze(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    bw = current_value
    bb_upper = indicators.get("bb_upper", price)
    bb_lower = indicators.get("bb_lower", price)
    return (
        f"⚡ BOLLINGER SQUEEZE — {symbol}\n"
        f"Band width compressed to {bw:.4f} | Price: ₹{price:,.2f}\n"
        f"Bands: ₹{bb_lower:,.2f} — ₹{bb_upper:,.2f}\n"
        f"A tight squeeze typically precedes a sharp directional move.\n"
        f"What to do: Wait for the breakout candle. Don't guess direction in advance.\n"
        f"Targets: ₹{bb_upper:,.2f} (upper band) or ₹{bb_lower:,.2f} (lower band)."
    )


def _msg_ema_cross(symbol, milestone_pct, current_value, base_value, price, indicators, **_) -> str:
    pct_gap = current_value
    ema9 = indicators.get("ema_9", price)
    ema21 = indicators.get("ema_21", price)
    cross_type = "Golden (bullish)" if pct_gap > 0 else "Death (bearish)"
    emoji = "🌟" if pct_gap > 0 else "💀"
    action = ("Trend-following traders can consider longs on dips to EMA9."
              if pct_gap > 0 else
              "Avoid new longs. Bears may look for short entries on bounces.")
    return (
        f"{emoji} EMA CROSS — {symbol}\n"
        f"{cross_type} cross | EMA9: ₹{ema9:,.2f} | EMA21: ₹{ema21:,.2f}\n"
        f"Price: ₹{price:,.2f} | Gap: {pct_gap:+.2f}%\n"
        f"What to do: {action}"
    )


def _msg_generic(symbol, milestone_pct, current_value, base_value, price, **_) -> str:
    return (
        f"📡 SIGNAL — {symbol}\n"
        f"Alert triggered at {milestone_pct * 100:.0f}% threshold.\n"
        f"Current value: {current_value:.2f} | Reference: {base_value:.2f}\n"
        f"Price: ₹{price:,.2f}"
    )


# ─── Context block (multi-signal summary) ────────────────────────────────────

def _build_context(rsi, macd_hist, rvol, signal_label, score) -> list[str]:
    lines = ["\n📌 Multi-Signal Context:"]
    if rsi is not None:
        zone = "Oversold" if rsi < 30 else ("Overbought" if rsi > 70 else "Neutral")
        lines.append(f"  RSI: {rsi:.1f} ({zone})")
    if macd_hist is not None:
        direction = "Bullish" if macd_hist > 0 else "Bearish"
        lines.append(f"  MACD Histogram: {macd_hist:.2f} ({direction})")
    if rvol is not None:
        lines.append(f"  RVOL: {rvol:.2f}× average")
    if signal_label:
        labels = {
            "STRONG_BUY": "🟢🟢 STRONG BUY",
            "BUY": "🟢 BUY",
            "NEUTRAL": "⚪ NEUTRAL",
            "SELL": "🔴 SELL",
            "STRONG_SELL": "🔴🔴 STRONG SELL",
        }
        lines.append(f"  Overall Signal: {labels.get(signal_label, signal_label)} (Score: {score:.0f}/100)")
    return lines if len(lines) > 1 else []


def _build_trade_levels(price, stop_loss, target_1, target_2) -> list[str]:
    if not stop_loss and not target_1:
        return []
    lines = ["\n🎯 Trade Levels:"]
    if stop_loss:
        risk_pct = abs(price - stop_loss) / price * 100 if price else 0
        lines.append(f"  Stop Loss: ₹{stop_loss:,.2f} ({risk_pct:.1f}% risk)")
    if target_1:
        reward_pct = abs(target_1 - price) / price * 100 if price else 0
        lines.append(f"  Target 1:  ₹{target_1:,.2f} ({reward_pct:.1f}% reward)")
    if target_2:
        reward_pct2 = abs(target_2 - price) / price * 100 if price else 0
        lines.append(f"  Target 2:  ₹{target_2:,.2f} ({reward_pct2:.1f}% reward)")
    if stop_loss and target_1 and price:
        risk = abs(price - stop_loss)
        reward = abs(target_1 - price)
        rr = reward / risk if risk > 0 else 0
        lines.append(f"  Risk/Reward: 1:{rr:.1f}")
    lines.append("\n⚠️ STAP is a signal tool. Always apply your own judgement and risk management.")
    return lines


# ─── Indicator education tooltips ────────────────────────────────────────────

INDICATOR_EDUCATION = {
    "rsi": (
        "RSI (Relative Strength Index) measures how fast price moved recently. "
        "Below 30 = oversold (may reverse up). Above 70 = overbought (may reverse down)."
    ),
    "macd": (
        "MACD (Moving Average Convergence Divergence) shows momentum direction. "
        "When the MACD line crosses above the signal line = bullish. Below = bearish."
    ),
    "bollinger": (
        "Bollinger Bands show where price is relative to its recent range. "
        "Near the lower band = potentially oversold. Near the upper band = potentially overbought."
    ),
    "rvol": (
        "RVOL (Relative Volume) compares today's volume to the 20-day average. "
        "RVOL > 1.5 means unusually high activity — big players are moving."
    ),
    "atr": (
        "ATR (Average True Range) measures how much the stock typically moves each day. "
        "Used to set stop-losses that are not too tight or too wide."
    ),
    "vwap": (
        "VWAP (Volume-Weighted Average Price) is the average price institutions trade at. "
        "Price above VWAP = bullish for the day. Below = bearish."
    ),
}
