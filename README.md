# TradeIQ App Realignment

This project has been reorganized into a clean, separated architecture to improve management of the frontend, backend, and data layers.

## 📁 Project Structure

| Folder | Purpose | Technologies |
| :--- | :--- | :--- |
| **`frontend/`** | Visual User Interface | React 18, Vite, Lightweight Charts, Recharts |
| **`backend-python`** | Core Data & Logic API | Python 3.10+, FastAPI, SQLAlchemy, PostgreSQL |
| **`backend-proxy`** | Market Data Bridge | Node.js, Express, Finnhub, Yahoo, Claude |
| **`database/`** | Persistent Data Layer | PostgreSQL 15 (Docker) |

---

## 🚀 Getting Started

To run the full suite from the root, open three terminal windows:

### 1. The Core Backend (Python)
This handles persistence, watchlists, and advanced analysis.
```bash
cd backend-python
docker-compose up -d  # Start Postgres
python -m uvicorn app.main:app --reload --port 8000
```
*Accessible at: http://localhost:8000*

### 2. The Helper Proxy (Node.js)
This handles live quotes, news sentiment, and the AI Chat with Claude.
```bash
cd backend-proxy
npm install
npm start
```
*Accessible at: http://localhost:3000*

### 3. The Frontend (React)
The visual dashboard.
```bash
cd frontend
npm install
npm run dev
```
*Accessible at: http://localhost:5173*

---

## 🔑 Environment Setup
Ensure each folder has a valid `.env` file. You can copy the template below into `frontend/` and both `backend` directories:
```env
FINNHUB_API_KEY=YOUR_KEY
ANTHROPIC_KEY=YOUR_KEY
DATABRICKS_HOST=...
DATABRICKS_TOKEN=...
```
