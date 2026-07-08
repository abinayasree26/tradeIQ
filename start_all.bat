@echo off
echo ====================================================
echo Starting TradeIQ Platform Services
echo ====================================================

:: 1. Start Node Proxy Server (Port 3000)
echo Starting Node Proxy Server on Port 3000...
start "TradeIQ Node Proxy" cmd /k "cd /d %~dp0backend-proxy && npm start"

:: 2. Start Python Backend App (Port 8000)
echo Starting Python Backend App on Port 8000...
start "TradeIQ Python Backend" cmd /k "cd /d %~dp0backend-python && venv\Scripts\activate && uvicorn app.main:app --port 8000"

:: 3. Start Frontend Dev Server (Port 5173)
echo Starting Frontend Dev Server on Port 5173...
start "TradeIQ Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo ====================================================
echo All services have been launched in separate windows!
echo Please open: http://localhost:5173
echo ====================================================
pause
