# StockIQ — Nifty 50 Analytics Dashboard

A modern, full-stack **stock market analytics dashboard** that connects a live **Databricks SQL Warehouse** to an interactive React UI, enabling real-time querying of historical Nifty 50 data with a built-in AI chat assistant.

---

## 🚀 Project Overview

This project demonstrates an end-to-end data analytics pipeline — from raw historical market data ingested into **Databricks** to a polished, interactive dashboard with **AI-powered natural language querying** — with no static files or manual data exports.

The system ingests one full year (2024) of **Nifty 50 index data**, processes and aggregates it using Databricks notebooks, stores the results in structured Delta Lake tables, and serves them live to the UI through a secure Node.js proxy.

---

## 🗄️ Database Tables (Databricks — `workspace.default`)

| Table | Description | Key Columns |
|---|---|---|
| `nifty_daily_prices` | Raw daily OHLC prices for each trading day | `trade_date`, `open`, `high`, `low`, `close` |
| `nifty_monthly_summary_2024` | Month-wise aggregated averages & counts | `year_month`, `avg_open`, `avg_close`, `avg_day_range` |
| `nifty_summary_2024` | Full-year KPI summary with threshold metrics | `avg_open`, `avg_close`, `avg_day_range`, threshold counts |

### Threshold Metrics
- **`open_above_prev_close_200_count`** — Days where the index opened 200+ points above the previous close
- **`close_above_prev_close_500_count`** — Days where the index closed 500+ points above the previous close
- **`close_below_prev_close_500_count`** — Days where the index closed 500+ points below the previous close

---

## 🖥️ Dashboard Features

### 📊 KPI Cards
Real-time display of full-year 2024 aggregated metrics:
- **Average Open Price** — Annual average of daily open prices
- **Average Close Price** — Annual average of daily close prices
- **Average Day Range** — Mean of (High − Low) per trading day

### 📈 Monthly Trend Chart
Interactive area chart comparing **Avg Open vs. Avg Close** month by month, drawn from `nifty_monthly_summary_2024`.

### 📋 Month-by-Month Table
Full breakdown of all months in 2024 showing Avg Open, Avg Close, and Avg Day Range side by side.

### 🎯 Point Threshold Progress Bars
Visual representation of how frequently the Nifty 50 hit significant movement targets in 2024, shown as percentage progress bars.

### 🤖 AI Chat Assistant
Natural language querying powered by a rule-based SQL translator:
- Ask questions like *"What was the avg open in February?"*
- The AI translates the query into live SQL and executes it against Databricks
- Results are returned in clean, human-readable format

**Example queries:**
```
What was the average open in February?
What was the avg close in August?
Show me the best day
Worst day in 2024?
What is the avg day range?
Best month?
Show threshold counts
```

---

## 🏗️ Architecture

```
┌───────────────────┐       ┌──────────────────────────┐
│   React Frontend  │──────▶│  Node.js CORS Proxy       │
│   (Vite, port 5173)│       │  (Native HTTP, port 3000) │
└───────────────────┘       └──────────────┬───────────┘
                                           │ HTTPS
                                           ▼
                              ┌─────────────────────────┐
                              │  Databricks SQL Warehouse│
                              │  dbc-90895339-f24a       │
                              │  workspace.default.*     │
                              └─────────────────────────┘
```

> **Why a proxy?** Browsers block direct API calls to Databricks due to CORS restrictions. The lightweight Node.js proxy forwards requests server-side, keeping credentials secure and bypassing CORS.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Styling** | Vanilla CSS (Dark glassmorphism theme) |
| **Typography** | Google Fonts — Outfit |
| **Proxy Server** | Node.js (native `http` / `https` modules) |
| **Database** | Databricks SQL Warehouse (Delta Lake) |
| **API** | Databricks SQL Statement Execution API v2.0 |

---

## 📁 Project Structure

```
stockui/
├── index.html
├── package.json
├── vite.config.js
├── server/
│   └── proxy.js              # CORS proxy for Databricks API
├── src/
│   ├── main.jsx
│   ├── App.jsx               # Main dashboard layout & components
│   ├── App.css               # Full styling — dark theme
│   ├── index.css             # Global base styles
│   └── services/
│       ├── databricks.js     # Databricks SQL execution service
│       └── aiQuery.js        # Natural language → SQL translator
```

---

## ⚡ Getting Started

### Prerequisites
- Node.js 18+
- A Databricks workspace with the Nifty 50 tables loaded

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Credentials
Open `src/services/databricks.js` and update:
```js
const DATABRICKS_CONFIG = {
  host: "your-workspace.cloud.databricks.com",
  token: "dapi...",
  warehouseId: "your-warehouse-id",
};
```

### 3. Start the Proxy Server
```bash
node server/proxy.js
# Runs on http://localhost:3000
```

### 4. Start the Frontend
```bash
npm run dev
# Runs on http://localhost:5173
```

---

## 🔒 Security Note

The Personal Access Token (PAT) is stored in the frontend config for local development only. For production deployment, move the token to an environment variable on the backend proxy and never expose it in the browser bundle.

---

## 📌 Data Source

- **Index:** Nifty 50 (NSE India)
- **Period:** January 2024 — December 2024
- **Instrument Type:** INDEX

---

## 👤 Author

Built as part of a Databricks-powered data engineering and analytics project.
