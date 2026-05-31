from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, Boolean,
    Index, JSON
)
from sqlalchemy.sql import func
from app.core.database import Base


# ─── Existing tables (kept intact) ───────────────────────────────────────────

class Symbol(Base):
    __tablename__ = "symbols"
    symbol = Column(String(20), primary_key=True, index=True)
    name = Column(String(100))
    exchange = Column(String(10), default="NSE")   # NSE / BSE
    sector = Column(String(100))
    is_index = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WatchlistSymbol(Base):
    __tablename__ = "watchlist_symbols"
    symbol = Column(String(20), primary_key=True, index=True)
    user_id = Column(String(100), default="default")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class QuoteLatest(Base):
    __tablename__ = "quotes_latest"
    symbol = Column(String(20), primary_key=True, index=True)
    price = Column(Float)
    change = Column(Float)
    pct_change = Column(Float)
    high = Column(Float)
    low = Column(Float)
    open = Column(Float)
    prev_close = Column(Float)
    volume = Column(Float)
    avg_volume = Column(Float)
    ts = Column(Integer)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), index=True)
    title = Column(String(500), nullable=False)
    source = Column(String(100))
    url = Column(String(1000), unique=True, nullable=False)
    summary = Column(Text)
    sentiment = Column(String(20), default="neutral")   # bullish / bearish / neutral
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class QuoteHistory(Base):
    __tablename__ = "quotes_history"
    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    candle_ts = Column(DateTime(timezone=True))

    __table_args__ = (
        Index("idx_hist_symbol_ts", "symbol", "candle_ts"),
    )


# ─── STAP: Indicator snapshots ────────────────────────────────────────────────

class IndicatorSnapshot(Base):
    """Latest computed indicator values per symbol — refreshed every fetch cycle."""
    __tablename__ = "indicator_snapshots"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), index=True, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    # Trend
    ema_9 = Column(Float)
    ema_21 = Column(Float)
    ema_50 = Column(Float)
    ema_200 = Column(Float)
    macd = Column(Float)
    macd_signal = Column(Float)
    macd_hist = Column(Float)
    adx = Column(Float)

    # Momentum
    rsi_14 = Column(Float)
    stoch_k = Column(Float)
    stoch_d = Column(Float)
    williams_r = Column(Float)

    # Volatility
    bb_upper = Column(Float)
    bb_mid = Column(Float)
    bb_lower = Column(Float)
    bb_bandwidth = Column(Float)
    atr_14 = Column(Float)

    # Volume
    rvol = Column(Float)         # Relative volume (current / 20-day avg)
    obv = Column(Float)
    vwap = Column(Float)
    cmf = Column(Float)          # Chaikin Money Flow

    # Composite signal (-100 to +100)
    composite_score = Column(Float)
    signal_label = Column(String(30))  # STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL

    __table_args__ = (
        Index("idx_ind_symbol_ts", "symbol", "timestamp"),
    )


# ─── STAP: Alert rules with milestone chains ─────────────────────────────────

class AlertRule(Base):
    """User-defined alert rules. milestone_chain stored as JSON array of thresholds."""
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), default="default", index=True)
    symbol = Column(String(20), nullable=False, index=True)
    rule_name = Column(String(100))
    condition_type = Column(String(30), nullable=False)
    # condition_type options:
    #   volume_rvol    — RVOL vs baseline
    #   rsi_level      — RSI crossing threshold
    #   price_breakout — Price vs a fixed level
    #   macd_cross     — MACD/signal line crossover
    #   bb_squeeze     — Bollinger Band squeeze
    #   ema_cross      — EMA cross (e.g. EMA9 > EMA21)
    #   price_pct      — % move from prev close

    # JSON: {"steps":[0.8,0.9,1.0,1.2], "base_value":100000, "direction":"above"}
    milestone_chain = Column(JSON, nullable=False)
    last_milestone = Column(Integer, default=0)  # index into steps array
    is_active = Column(Boolean, default=True)
    notify_telegram = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        Index("idx_rule_user_symbol", "user_id", "symbol"),
    )


# ─── STAP: Alert events log ───────────────────────────────────────────────────

class AlertEvent(Base):
    """Every time a milestone fires, one row is written here."""
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    rule_id = Column(Integer, index=True)
    symbol = Column(String(20), index=True)
    milestone_index = Column(Integer)
    milestone_pct = Column(Float)        # e.g. 0.8 = 80%
    triggered_at = Column(DateTime(timezone=True), server_default=func.now())
    value_at_trigger = Column(Float)
    base_value = Column(Float)
    price_at_trigger = Column(Float)
    rsi_at_trigger = Column(Float)
    message = Column(Text)               # coaching message sent
    stop_loss = Column(Float)
    target_1 = Column(Float)
    target_2 = Column(Float)
    delivered_via = Column(JSON)         # ["telegram", "push"]

    __table_args__ = (
        Index("idx_event_symbol_ts", "symbol", "triggered_at"),
    )


# ─── STAP: Stop-loss / target suggestions ────────────────────────────────────

class StopLossRecord(Base):
    """Persisted stop-loss and target calculations for a symbol at a given time."""
    __tablename__ = "stoploss_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    entry_price = Column(Float)
    method = Column(String(30))         # atr / swing_low / bb / vwap / pivot
    stop_loss = Column(Float)
    target_1 = Column(Float)
    target_2 = Column(Float)
    risk_reward = Column(Float)
    atr_14 = Column(Float)
