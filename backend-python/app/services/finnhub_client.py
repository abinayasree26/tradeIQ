import httpx
from datetime import datetime, timedelta
from tenacity import retry, wait_exponential, stop_after_attempt
from app.core.config import settings
from app.utils.logger import logger

class FinnhubClient:
    def __init__(self):
        self.api_key = settings.FINNHUB_API_KEY
        self.base_url = "https://finnhub.io/api/v1"

    @retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
    async def get_quote(self, symbol: str):
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base_url}/quote", params={"symbol": symbol.upper(), "token": self.api_key})
            r.raise_for_status()
            data = r.json()
            if not data.get('c'): # Empty response check
                return None
            return data

    async def get_news(self, symbol: str):
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base_url}/company-news", params={
                "symbol": symbol.upper(), 
                "from": week_ago, 
                "to": today,
                "token": self.api_key
            })
            r.raise_for_status()
            return r.json()

    async def get_candles(self, symbol: str, resolution: str, from_ts: int, to_ts: int):
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{self.base_url}/stock/candle", params={
                "symbol": symbol.upper(),
                "resolution": resolution,
                "from": from_ts,
                "to": to_ts,
                "token": self.api_key
            })
            r.raise_for_status()
            return r.json()

finnhub_client = FinnhubClient()
