from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Index, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base

class Symbol(Base):
    __tablename__ = "symbols"
    symbol = Column(String(20), primary_key=True, index=True)
    name = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WatchlistSymbol(Base):
    __tablename__ = "watchlist_symbols"
    symbol = Column(String(20), primary_key=True, index=True)
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
    ts = Column(Integer) # Provider timestamp
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class NewsArticle(Base):
    __tablename__ = "news_articles"
    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), index=True)
    title = Column(String(500), nullable=False)
    source = Column(String(100))
    url = Column(String(1000), unique=True, nullable=False)
    summary = Column(Text)
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
        Index('idx_hist_symbol_ts', 'symbol', 'candle_ts'),
    )
