"""
STAP Telegram Alert Service

Sends milestone coaching messages via Telegram Bot API.

Setup (one-time, FREE):
  1. Open Telegram → search @BotFather → /newbot → get BOT_TOKEN
  2. Message your new bot once, then GET /getUpdates to find CHAT_ID
  3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env

No Telegram library dependency — uses raw HTTP so it works anywhere.
"""

from __future__ import annotations
import asyncio
from typing import Optional

import httpx

from app.utils.logger import logger

from app.core.config import settings

# Read from shared settings (loaded from root .env via Pydantic Settings)
TELEGRAM_BOT_TOKEN = settings.TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID   = settings.TELEGRAM_CHAT_ID
TELEGRAM_API_BASE  = "https://api.telegram.org"


async def send_message(
    text: str,
    chat_id: Optional[str] = None,
    parse_mode: str = "HTML",
    disable_notification: bool = False,
) -> bool:
    """
    Send a text message via Telegram Bot API.
    Returns True on success, False on failure.
    """
    token = TELEGRAM_BOT_TOKEN
    cid   = chat_id or TELEGRAM_CHAT_ID

    if not token or not cid:
        logger.warning("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing).")
        return False

    url = f"{TELEGRAM_API_BASE}/bot{token}/sendMessage"
    payload = {
        "chat_id": cid,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
        "disable_notification": disable_notification,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200 and resp.json().get("ok"):
                logger.info(f"Telegram message sent to {cid}")
                return True
            else:
                logger.error(f"Telegram API error: {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Telegram send_message exception: {e}")
        return False


async def send_alert(
    coaching_message: str,
    symbol: str,
    chat_id: Optional[str] = None,
) -> bool:
    """
    Format and send an alert coaching message.
    Wraps the plain-text coaching message in an HTML-safe format.
    """
    html_text = _escape_html(coaching_message)
    return await send_message(html_text, chat_id=chat_id, parse_mode="HTML")


def _escape_html(text: str) -> str:
    """Escape characters that would break Telegram HTML parse mode."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def test_connection() -> dict:
    """
    Test Telegram bot connectivity.
    Call /api/alerts/telegram/test to verify config.
    """
    token = TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set in .env"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/getMe"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            data = resp.json()
            if data.get("ok"):
                bot = data["result"]
                return {
                    "ok": True,
                    "bot_name": bot.get("first_name"),
                    "bot_username": bot.get("username"),
                    "chat_id_configured": bool(TELEGRAM_CHAT_ID),
                }
            return {"ok": False, "error": data.get("description", "Unknown error")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def get_chat_id_hint() -> dict:
    """
    Polls /getUpdates to help user find their chat_id.
    User must have sent at least one message to the bot first.
    """
    token = TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not set"}

    url = f"{TELEGRAM_API_BASE}/bot{token}/getUpdates"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            data = resp.json()
            if not data.get("ok"):
                return {"ok": False, "error": data.get("description")}

            updates = data.get("result", [])
            if not updates:
                return {
                    "ok": False,
                    "error": "No messages found. Send any message to your bot first, then retry.",
                }

            chat_ids = list({
                u["message"]["chat"]["id"]
                for u in updates if "message" in u
            })
            return {"ok": True, "chat_ids": chat_ids, "tip": "Use one of these as TELEGRAM_CHAT_ID"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
