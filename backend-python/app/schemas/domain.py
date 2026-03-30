from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SymbolResponse(BaseModel):
    symbol: str
    added_at: datetime
    
    class Config:
        from_attributes = True

class SymbolCreate(BaseModel):
    symbol: str

class QuoteResponse(BaseModel):
    symbol: str
    price: Optional[float]
    change: Optional[float]
    pct_change: Optional[float]
    ts: datetime
    
    class Config:
        from_attributes = True

class NewsResponse(BaseModel):
    id: int
    title: str
    source: Optional[str]
    url: str
    published_at: Optional[datetime]
    summary: Optional[str]
    symbols: str
    
    class Config:
        from_attributes = True
