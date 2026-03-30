# Database Configuration

The project uses **PostgreSQL 15** for tracking watchlists and caching market metadata.

## Service Parameters

-   **User**: `tradeuser`
-   **Password**: `tradepassword`
-   **Database**: `tradedb`
-   **Port**: `5433` (as configured in `backend-main/docker-compose.yml`)

## Table Management

The database tables are automatically initialized by the **FastAPI Backend (backend-main)** when it starts, via SQLAlchemy's `Base.metadata.create_all` in `app/main.py`.

### Key Tables:
-   **Watchlist**: Stores user-saved symbols.
-   **Market Cache**: Caches recent quotes to avoid rate-limiting.

## Local Administration

If you have `psql` installed locally:
```bash
psql -h localhost -p 5433 -U tradeuser -d tradedb
```

Alternatively, use your preferred SQL client (e.g., TablePlus, DBeaver) with the parameters above.
