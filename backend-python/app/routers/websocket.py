"""
STAP Phase 5 — WebSocket Live Data Feed

Provides real-time market data streaming over WebSocket.
Clients subscribe to symbols and receive live price updates.

Protocol:
  → Client sends: {"action": "subscribe", "symbols": ["RELIANCE.NS", "TCS.NS"]}
  → Client sends: {"action": "unsubscribe", "symbols": ["TCS.NS"]}
  ← Server pushes: {"type": "quote", "symbol": "RELIANCE.NS", "data": {...}}
  ← Server pushes: {"type": "alert", "symbol": "RELIANCE.NS", "message": "..."}
  ← Server pushes: {"type": "indicator", "symbol": "RELIANCE.NS", "data": {...}}
"""

from __future__ import annotations
import asyncio
import json
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt

from app.core.config import settings
from app.services.india_market import fetch_quote
from app.utils.logger import logger

router = APIRouter(tags=["WebSocket (Phase 5)"])


# ─── Connection Manager ───────────────────────────────────────────────────────

class ConnectionManager:
    """Manages active WebSocket connections and their subscriptions."""

    def __init__(self):
        # {websocket: {"user_id": str, "symbols": set, "tier": str}}
        self.active_connections: dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, user_id: str, tier: str):
        await websocket.accept()
        self.active_connections[websocket] = {
            "user_id": user_id,
            "symbols": set(),
            "tier": tier,
        }
        logger.info(f"WS connected: user={user_id}, tier={tier}")

    def disconnect(self, websocket: WebSocket):
        info = self.active_connections.pop(websocket, {})
        logger.info(f"WS disconnected: user={info.get('user_id', 'unknown')}")

    async def subscribe(self, websocket: WebSocket, symbols: list[str]):
        """Add symbols to this connection's subscription list."""
        if websocket not in self.active_connections:
            return
        conn = self.active_connections[websocket]

        # Tier-based limits
        tier = conn["tier"]
        max_subs = 3 if tier == "free" else 50
        current = conn["symbols"]

        for sym in symbols:
            if len(current) >= max_subs:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Max {max_subs} symbols for {tier} tier. Upgrade to Pro for unlimited.",
                })
                break
            current.add(sym.upper())

        conn["symbols"] = current
        await websocket.send_json({
            "type": "subscribed",
            "symbols": list(current),
        })

    async def unsubscribe(self, websocket: WebSocket, symbols: list[str]):
        """Remove symbols from subscription."""
        if websocket not in self.active_connections:
            return
        conn = self.active_connections[websocket]
        for sym in symbols:
            conn["symbols"].discard(sym.upper())
        await websocket.send_json({
            "type": "unsubscribed",
            "symbols": list(conn["symbols"]),
        })

    async def broadcast_quote(self, symbol: str, data: dict):
        """Push a quote update to all connections subscribed to this symbol."""
        disconnected = []
        for ws, conn in self.active_connections.items():
            if symbol.upper() in conn["symbols"]:
                try:
                    await ws.send_json({
                        "type": "quote",
                        "symbol": symbol,
                        "data": data,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                except Exception:
                    disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    async def send_alert(self, websocket: WebSocket, alert: dict):
        """Send an alert event to a specific connection."""
        try:
            await websocket.send_json({"type": "alert", **alert})
        except Exception:
            self.disconnect(websocket)

    def get_all_subscribed_symbols(self) -> set[str]:
        """Get union of all symbols anyone is subscribed to."""
        all_syms = set()
        for conn in self.active_connections.values():
            all_syms.update(conn["symbols"])
        return all_syms

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


manager = ConnectionManager()


# ─── Background Price Pusher ──────────────────────────────────────────────────

async def price_push_loop():
    """
    Background task that fetches prices for all subscribed symbols
    and broadcasts to connected clients every N seconds.
    """
    while True:
        try:
            symbols = manager.get_all_subscribed_symbols()
            if symbols:
                for symbol in symbols:
                    try:
                        price_data = await fetch_quote(symbol)
                        if price_data:
                            await manager.broadcast_quote(symbol, price_data)
                    except Exception as e:
                        logger.warning(f"WS price fetch error for {symbol}: {e}")
                    # Small delay between symbols to avoid rate limiting
                    await asyncio.sleep(0.5)
        except Exception as e:
            logger.error(f"WS price push loop error: {e}")

        # Wait before next cycle (5 seconds for live updates)
        await asyncio.sleep(5)


# ─── Auth Helper ──────────────────────────────────────────────────────────────

def verify_ws_token(token: str) -> Optional[dict]:
    """Verify JWT token for WebSocket auth (no DB call — just decode)."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


# ─── WebSocket Endpoint ───────────────────────────────────────────────────────

@router.websocket("/ws/market")
async def websocket_market_feed(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    """
    Real-time market data WebSocket endpoint.

    Connect with: ws://host/ws/market?token=<jwt_access_token>
    Or without token for limited free-tier access.

    Messages from client:
      {"action": "subscribe", "symbols": ["RELIANCE.NS"]}
      {"action": "unsubscribe", "symbols": ["TCS.NS"]}
      {"action": "ping"}

    Messages from server:
      {"type": "quote", "symbol": "...", "data": {...}}
      {"type": "alert", "symbol": "...", "message": "..."}
      {"type": "subscribed", "symbols": [...]}
      {"type": "error", "message": "..."}
    """
    # Authenticate
    user_id = "anonymous"
    tier = "free"

    if token:
        payload = verify_ws_token(token)
        if payload:
            user_id = payload.get("sub", "anonymous")
            tier = payload.get("tier", "free")
        else:
            await websocket.close(code=4001, reason="Invalid token")
            return

    # Check tier access
    if tier == "free":
        # Free tier gets limited WS access (3 symbols, delayed)
        pass  # Allow connection but with limits enforced in subscribe()

    await manager.connect(websocket, user_id, tier)

    try:
        while True:
            # Receive messages from client
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            action = msg.get("action")

            if action == "subscribe":
                symbols = msg.get("symbols", [])
                if not isinstance(symbols, list):
                    symbols = [symbols]
                await manager.subscribe(websocket, symbols)

            elif action == "unsubscribe":
                symbols = msg.get("symbols", [])
                if not isinstance(symbols, list):
                    symbols = [symbols]
                await manager.unsubscribe(websocket, symbols)

            elif action == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.now(timezone.utc).isoformat()})

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WS error: {e}")
        manager.disconnect(websocket)


# ─── Status Endpoint ──────────────────────────────────────────────────────────

@router.get("/ws/status")
async def ws_status():
    """Get WebSocket connection stats."""
    return {
        "active_connections": manager.connection_count,
        "subscribed_symbols": list(manager.get_all_subscribed_symbols()),
        "status": "online",
    }
