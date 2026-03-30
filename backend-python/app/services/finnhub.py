import httpx
from datetime import datetime, timedelta
from typing import Dict, Any, List
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

from app.core.config import settings
from app.utils.logger import logger

class FinnhubError(Exception):
    pass

class FinnhubClient:
    def __init__(self):
        self.api_key = settings.FINNHUB_API_KEY
        self.base_url = "https://finnhub.io/api/v1"
        self.timeout = 10.0

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((httpx.RequestError, FinnhubError)),
        after=lambda rs: logger.warning(f"Retrying quote fetch after {rs.attempt_number} attempts")
    )
    async def fetch_quote(self, symbol: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}/quote",
                params={"symbol": symbol.upper(), "token": self.api_key}
            )
            if resp.status_code == 429:
                logger.error(f"Finnhub quote rate limit exceeded for {symbol}")
                raise FinnhubError("Rate limit exceeded")
            resp.raise_for_status()
            data = resp.json()
            # Finnhub returns 'c' for current price, 'd' for change, 'dp' for pct change
            if "c" not in data or data["c"] == 0:
                raise FinnhubError(f"Invalid quote data returned for {symbol}")
            return data

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=10),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((httpx.RequestError, FinnhubError)),
        after=lambda rs: logger.warning(f"Retrying news fetch after {rs.attempt_number} attempts")
    )
    async def fetch_news(self, symbol: str) -> List[Dict[str, Any]]:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(
                f"{self.base_url}/company-news",
                params={
                    "symbol": symbol.upper(),
                    "from": start_date.strftime("%Y-%m-%d"),
                    "to": end_date.strftime("%Y-%m-%d"),
                    "token": self.api_key
                }
            )
            if resp.status_code == 429:
                logger.error(f"Finnhub news rate limit exceeded for {symbol}")
                raise FinnhubError("Rate limit exceeded")
            resp.raise_for_status()
            return resp.json()

finnhub_client = FinnhubClient()
