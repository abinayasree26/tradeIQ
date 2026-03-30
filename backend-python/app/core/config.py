from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    FINNHUB_API_KEY: str = ""
    DATABASE_URL: str = "postgresql+asyncpg://tradeuser:tradepassword@localhost:5432/tradedb"
    ENV: str = "development"
    
    # Cache settings
    QUOTE_TTL_SECONDS: int = 60
    NEWS_TTL_MINUTES: int = 15

    class Config:
        env_file = ".env"

settings = Settings()
