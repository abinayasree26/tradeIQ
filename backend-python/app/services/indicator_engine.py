"""
STAP Indicator Engine
Computes the full suite of technical indicators from OHLCV data using pandas-ta.
All functions are synchronous — wrap with run_in_executor for async use.
"""

from __future__ import annotations
from typing import Optional
import pandas as pd
import numpy as np
import pandas_ta as ta

from app.utils.logger import logger


# ─── Data prep ────────────────────────────────────────────────────────────────

def build_dataframe(ohlcv: list[dict]) -> pd.DataFrame:
    """Convert list of {time, open, high, low, close, volume} dicts to DataFrame."""
    if not ohlcv or len(ohlcv) < 10:
        return pd.DataFrame()

    df = pd.DataFrame(ohlcv)
    df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
    df = df.set_index("time").sort_index()
    df = df.rename(columns={"open": "Open", "high": "High",
                              "low": "Low", "close": "Close", "volume": "Volume"})
    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna()
    return df


# ─── Core indicator calculations ──────────────────────────────────────────────

def compute_indicators(df: pd.DataFrame) -> dict:
    """
    Compute all STAP indicators from an OHLCV DataFrame.
    Requires at least 30 rows for reliable values.
    Returns a flat dict with the latest value of each indicator.
    """
    if df.empty or len(df) < 20:
        return {"error": "Insufficient data (need ≥ 20 candles)"}

    result: dict = {}

    # ── Trend: EMAs ──────────────────────────────────────────────────────────
    for period in [9, 21, 50, 200]:
        if len(df) >= period:
            ema = ta.ema(df["Close"], length=period)
            result[f"ema_{period}"] = _last(ema)
        else:
            result[f"ema_{period}"] = None

    # ── Trend: MACD ──────────────────────────────────────────────────────────
    try:
        macd_df = ta.macd(df["Close"], fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            result["macd"]        = _last(macd_df.iloc[:, 0])   # MACD line
            result["macd_signal"] = _last(macd_df.iloc[:, 2])   # Signal line
            result["macd_hist"]   = _last(macd_df.iloc[:, 1])   # Histogram
        else:
            result.update({"macd": None, "macd_signal": None, "macd_hist": None})
    except Exception as e:
        logger.warning(f"MACD error: {e}")
        result.update({"macd": None, "macd_signal": None, "macd_hist": None})

    # ── Trend: ADX ───────────────────────────────────────────────────────────
    try:
        adx_df = ta.adx(df["High"], df["Low"], df["Close"], length=14)
        if adx_df is not None and not adx_df.empty:
            result["adx"] = _last(adx_df.iloc[:, 0])
        else:
            result["adx"] = None
    except Exception:
        result["adx"] = None

    # ── Momentum: RSI ────────────────────────────────────────────────────────
    try:
        rsi = ta.rsi(df["Close"], length=14)
        result["rsi_14"] = _last(rsi)
    except Exception:
        result["rsi_14"] = None

    # ── Momentum: Stochastic ─────────────────────────────────────────────────
    try:
        stoch_df = ta.stoch(df["High"], df["Low"], df["Close"])
        if stoch_df is not None and not stoch_df.empty:
            result["stoch_k"] = _last(stoch_df.iloc[:, 0])
            result["stoch_d"] = _last(stoch_df.iloc[:, 1])
        else:
            result.update({"stoch_k": None, "stoch_d": None})
    except Exception:
        result.update({"stoch_k": None, "stoch_d": None})

    # ── Momentum: Williams %R ────────────────────────────────────────────────
    try:
        wr = ta.willr(df["High"], df["Low"], df["Close"], length=14)
        result["williams_r"] = _last(wr)
    except Exception:
        result["williams_r"] = None

    # ── Volatility: Bollinger Bands ───────────────────────────────────────────
    try:
        bb_df = ta.bbands(df["Close"], length=20, std=2)
        if bb_df is not None and not bb_df.empty:
            result["bb_lower"] = _last(bb_df.iloc[:, 0])
            result["bb_mid"]   = _last(bb_df.iloc[:, 1])
            result["bb_upper"] = _last(bb_df.iloc[:, 2])
            bw_col = [c for c in bb_df.columns if "BBB" in c or "bandwidth" in c.lower()]
            result["bb_bandwidth"] = _last(bb_df[bw_col[0]]) if bw_col else None
        else:
            result.update({"bb_upper": None, "bb_mid": None, "bb_lower": None, "bb_bandwidth": None})
    except Exception:
        result.update({"bb_upper": None, "bb_mid": None, "bb_lower": None, "bb_bandwidth": None})

    # ── Volatility: ATR ──────────────────────────────────────────────────────
    try:
        atr = ta.atr(df["High"], df["Low"], df["Close"], length=14)
        result["atr_14"] = _last(atr)
    except Exception:
        result["atr_14"] = None

    # ── Volume: RVOL (Relative Volume) ───────────────────────────────────────
    try:
        avg_vol_20 = df["Volume"].tail(21).iloc[:-1].mean()
        curr_vol = float(df["Volume"].iloc[-1])
        result["rvol"] = round(curr_vol / avg_vol_20, 3) if avg_vol_20 > 0 else None
        result["avg_volume_20"] = round(avg_vol_20, 0)
        result["current_volume"] = curr_vol
    except Exception:
        result.update({"rvol": None, "avg_volume_20": None, "current_volume": None})

    # ── Volume: OBV ──────────────────────────────────────────────────────────
    try:
        obv = ta.obv(df["Close"], df["Volume"])
        result["obv"] = _last(obv)
    except Exception:
        result["obv"] = None

    # ── Volume: VWAP ─────────────────────────────────────────────────────────
    try:
        vwap = ta.vwap(df["High"], df["Low"], df["Close"], df["Volume"])
        result["vwap"] = _last(vwap)
    except Exception:
        result["vwap"] = None

    # ── Volume: CMF (Chaikin Money Flow) ─────────────────────────────────────
    try:
        cmf = ta.cmf(df["High"], df["Low"], df["Close"], df["Volume"], length=20)
        result["cmf"] = _last(cmf)
    except Exception:
        result["cmf"] = None

    # ── Derived: Current close ───────────────────────────────────────────────
    result["close"] = round(float(df["Close"].iloc[-1]), 2)
    result["prev_close"] = round(float(df["Close"].iloc[-2]), 2) if len(df) > 1 else result["close"]
    result["pct_change"] = round(
        (result["close"] - result["prev_close"]) / result["prev_close"] * 100, 2
    ) if result["prev_close"] else 0

    # ── Composite Score ──────────────────────────────────────────────────────
    score, label = _composite_signal(result)
    result["composite_score"] = score
    result["signal_label"] = label

    return result


def _last(series: Optional[pd.Series]) -> Optional[float]:
    if series is None or series.empty:
        return None
    val = series.dropna().iloc[-1] if not series.dropna().empty else None
    return round(float(val), 4) if val is not None else None


def _composite_signal(ind: dict) -> tuple[float, str]:
    """
    Score from -100 (extreme sell) to +100 (extreme buy).
    Each sub-signal contributes equally.
    """
    signals = []

    # RSI signal
    rsi = ind.get("rsi_14")
    if rsi is not None:
        if rsi < 30:
            signals.append(100)
        elif rsi < 40:
            signals.append(60)
        elif rsi < 50:
            signals.append(20)
        elif rsi < 60:
            signals.append(-20)
        elif rsi < 70:
            signals.append(-60)
        else:
            signals.append(-100)

    # MACD signal (histogram direction)
    hist = ind.get("macd_hist")
    macd = ind.get("macd")
    sig = ind.get("macd_signal")
    if hist is not None:
        signals.append(100 if hist > 0 else -100)
    if macd is not None and sig is not None:
        signals.append(60 if macd > sig else -60)

    # EMA trend (price vs EMA 50)
    ema50 = ind.get("ema_50")
    close = ind.get("close")
    if ema50 and close:
        pct = (close - ema50) / ema50 * 100
        signals.append(min(max(pct * 10, -100), 100))

    # Bollinger Band position
    bb_upper = ind.get("bb_upper")
    bb_lower = ind.get("bb_lower")
    bb_mid = ind.get("bb_mid")
    if bb_upper and bb_lower and bb_mid and close:
        band_range = bb_upper - bb_lower
        if band_range > 0:
            pos = (close - bb_lower) / band_range  # 0 = at lower, 1 = at upper
            signals.append((0.5 - pos) * 200)       # +100 at lower, -100 at upper

    # Volume confirmation (RVOL)
    rvol = ind.get("rvol")
    if rvol is not None and close and ind.get("prev_close"):
        direction = 1 if close >= ind["prev_close"] else -1
        vol_boost = min(rvol - 1, 1) * 40  # up to +40 / -40
        signals.append(direction * vol_boost)

    if not signals:
        return 0.0, "NEUTRAL"

    score = round(float(np.mean(signals)), 1)

    if score >= 60:
        label = "STRONG_BUY"
    elif score >= 25:
        label = "BUY"
    elif score >= -25:
        label = "NEUTRAL"
    elif score >= -60:
        label = "SELL"
    else:
        label = "STRONG_SELL"

    return score, label


# ─── Pivot Points (used for targets) ─────────────────────────────────────────

def compute_pivot_points(df: pd.DataFrame) -> dict:
    """Classic floor pivot points from the previous session."""
    if len(df) < 2:
        return {}
    prev = df.iloc[-2]
    H, L, C = float(prev["High"]), float(prev["Low"]), float(prev["Close"])
    P  = (H + L + C) / 3
    R1 = 2 * P - L
    R2 = P + (H - L)
    R3 = H + 2 * (P - L)
    S1 = 2 * P - H
    S2 = P - (H - L)
    S3 = L - 2 * (H - P)
    return {
        "pivot": round(P, 2),
        "r1": round(R1, 2), "r2": round(R2, 2), "r3": round(R3, 2),
        "s1": round(S1, 2), "s2": round(S2, 2), "s3": round(S3, 2),
    }


# ─── Swing high/low (used for stop-loss) ─────────────────────────────────────

def find_swing_low(df: pd.DataFrame, lookback: int = 10) -> Optional[float]:
    """Most significant swing low in last `lookback` candles."""
    if len(df) < lookback:
        return None
    recent = df.tail(lookback)
    return round(float(recent["Low"].min()), 2)


def find_swing_high(df: pd.DataFrame, lookback: int = 10) -> Optional[float]:
    if len(df) < lookback:
        return None
    recent = df.tail(lookback)
    return round(float(recent["High"].max()), 2)
