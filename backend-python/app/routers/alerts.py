"""
Alert rule management and milestone engine endpoints.

POST /alerts/rules         — create a new alert rule
GET  /alerts/rules         — list all active rules
DELETE /alerts/rules/{id}  — deactivate a rule
GET  /alerts/check/{symbol} — run milestone engine for a symbol right now
GET  /alerts/history       — recent fired alert events
GET  /alerts/telegram/test — verify Telegram bot connectivity
GET  /alerts/telegram/chat-id — discover chat_id from recent bot messages
POST /alerts/fire/{symbol} — manually trigger check + send Telegram (dev/test)
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, desc

from app.core.database import get_db
from app.models.domain import AlertRule, AlertEvent
from app.services.india_market import fetch_ohlcv, fetch_quote
from app.services.indicator_engine import build_dataframe, compute_indicators
from app.services.milestone_engine import (
    check_milestones, already_fired_today, mark_fired, DEFAULT_RULE_TEMPLATES,
)
from app.services.stoploss_engine import calculate_all
from app.services.coaching_engine import build_milestone_message
from app.services.telegram_service import send_alert, test_connection, get_chat_id_hint
from app.utils.logger import logger

router = APIRouter(prefix="/alerts", tags=["Alerts"])


# ─── Request / Response models ────────────────────────────────────────────────

class MilestoneChain(BaseModel):
    steps: list[float]
    base_value: Optional[float] = None
    direction: str = "above"   # "above" or "below"


class AlertRuleCreate(BaseModel):
    symbol: str
    rule_name: Optional[str] = None
    condition_type: str
    milestone_chain: MilestoneChain
    notify_telegram: bool = True
    notify_email: bool = False
    user_id: str = "default"


# ─── CRUD ─────────────────────────────────────────────────────────────────────

@router.post("/rules")
async def create_rule(body: AlertRuleCreate, db: AsyncSession = Depends(get_db)):
    """Create a new alert rule with milestone chain."""
    rule = AlertRule(
        user_id=body.user_id,
        symbol=body.symbol.upper(),
        rule_name=body.rule_name or f"{body.condition_type} — {body.symbol.upper()}",
        condition_type=body.condition_type,
        milestone_chain=body.milestone_chain.model_dump(),
        notify_telegram=body.notify_telegram,
        notify_email=body.notify_email,
        last_milestone=0,
        is_active=True,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"ok": True, "rule_id": rule.id, "message": f"Alert rule created for {body.symbol.upper()}"}


@router.get("/rules")
async def list_rules(
    user_id: str = Query(default="default"),
    db: AsyncSession = Depends(get_db),
):
    """List all active alert rules for a user."""
    result = await db.execute(
        select(AlertRule)
        .where(AlertRule.user_id == user_id, AlertRule.is_active == True)
        .order_by(desc(AlertRule.created_at))
    )
    rules = result.scalars().all()
    return {
        "rules": [
            {
                "id": r.id,
                "symbol": r.symbol,
                "rule_name": r.rule_name,
                "condition_type": r.condition_type,
                "milestone_chain": r.milestone_chain,
                "last_milestone": r.last_milestone,
                "notify_telegram": r.notify_telegram,
                "created_at": r.created_at,
            }
            for r in rules
        ]
    }


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    """Deactivate an alert rule."""
    await db.execute(
        update(AlertRule)
        .where(AlertRule.id == rule_id)
        .values(is_active=False)
    )
    await db.commit()
    return {"ok": True, "message": f"Rule {rule_id} deactivated."}


@router.get("/templates")
async def get_templates():
    """Return default alert rule templates ready to POST."""
    return {"templates": DEFAULT_RULE_TEMPLATES}


# ─── Milestone check ──────────────────────────────────────────────────────────

@router.get("/check/{symbol}")
async def check_symbol_milestones(symbol: str, db: AsyncSession = Depends(get_db)):
    """
    Run the milestone engine for a symbol right now.
    Returns which rules fired (if any) and the coaching messages that would be sent.
    Does NOT send Telegram — use /fire/{symbol} for that.
    """
    sym = symbol.upper()
    ohlcv = await fetch_ohlcv(sym, period="6mo", interval="1d")
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    df = build_dataframe(ohlcv)
    indicators = compute_indicators(df)

    # Fetch active rules for this symbol
    result = await db.execute(
        select(AlertRule).where(AlertRule.symbol == sym, AlertRule.is_active == True)
    )
    rules = result.scalars().all()

    fired_events = []
    for rule in rules:
        rule_dict = {
            "id": rule.id,
            "symbol": rule.symbol,
            "condition_type": rule.condition_type,
            "milestone_chain": rule.milestone_chain,
            "last_milestone": rule.last_milestone,
        }

        # Auto-fill base_value for RVOL rules from live data
        if rule.condition_type == "volume_rvol" and rule.milestone_chain.get("base_value") is None:
            avg_vol = indicators.get("avg_volume_20")
            if avg_vol:
                rule_dict["milestone_chain"] = {
                    **rule.milestone_chain,
                    "base_value": avg_vol,
                }

        fired_steps = check_milestones(rule_dict, indicators)
        for step in fired_steps:
            sl_data = calculate_all(df, indicators, entry_price=indicators.get("close", 0))
            rec = sl_data.get("recommended") or {}
            msg = build_milestone_message(
                symbol=sym,
                condition_type=rule.condition_type,
                milestone_pct=step["threshold"],
                current_value=step["current_value"],
                base_value=step["base_value"],
                indicators=indicators,
                stop_loss=rec.get("stop_loss"),
                target_1=rec.get("target_1"),
                target_2=rec.get("target_2"),
            )
            fired_events.append({
                "rule_id": rule.id,
                "rule_name": rule.rule_name,
                "step_index": step["step_index"],
                "threshold": step["threshold"],
                "message": msg,
            })

    return {
        "symbol": sym,
        "indicators_snapshot": {
            "close": indicators.get("close"),
            "rsi_14": indicators.get("rsi_14"),
            "rvol": indicators.get("rvol"),
            "signal": indicators.get("signal_label"),
        },
        "rules_checked": len(rules),
        "fired_count": len(fired_events),
        "fired_events": fired_events,
    }


@router.post("/fire/{symbol}")
async def fire_alerts(symbol: str, db: AsyncSession = Depends(get_db)):
    """
    Run milestone engine + send Telegram for newly crossed milestones.
    Updates last_milestone in DB. Use during market hours for live monitoring.
    """
    sym = symbol.upper()
    quote = await fetch_quote(sym)
    ohlcv = await fetch_ohlcv(sym, period="6mo", interval="1d")
    if not ohlcv:
        raise HTTPException(status_code=404, detail=f"No data for {sym}")

    df = build_dataframe(ohlcv)
    indicators = compute_indicators(df)
    if quote:
        indicators["close"] = quote["price"]
        indicators["current_volume"] = quote.get("volume", indicators.get("current_volume", 0))

    result = await db.execute(
        select(AlertRule).where(AlertRule.symbol == sym, AlertRule.is_active == True)
    )
    rules = result.scalars().all()

    sent = []
    for rule in rules:
        chain = dict(rule.milestone_chain)
        if rule.condition_type == "volume_rvol" and chain.get("base_value") is None:
            avg = indicators.get("avg_volume_20")
            if avg:
                chain["base_value"] = avg

        rule_dict = {
            "id": rule.id,
            "symbol": rule.symbol,
            "condition_type": rule.condition_type,
            "milestone_chain": chain,
            "last_milestone": rule.last_milestone,
        }

        fired_steps = check_milestones(rule_dict, indicators)
        for step in fired_steps:
            idx = step["step_index"]
            if already_fired_today(rule.id, idx):
                continue

            sl_data = calculate_all(df, indicators, entry_price=indicators.get("close", 0))
            rec = sl_data.get("recommended") or {}
            msg = build_milestone_message(
                symbol=sym,
                condition_type=rule.condition_type,
                milestone_pct=step["threshold"],
                current_value=step["current_value"],
                base_value=step["base_value"],
                indicators=indicators,
                stop_loss=rec.get("stop_loss"),
                target_1=rec.get("target_1"),
                target_2=rec.get("target_2"),
            )

            # Send Telegram
            tg_ok = False
            if rule.notify_telegram:
                tg_ok = await send_alert(msg, sym)

            # Write event to DB
            event = AlertEvent(
                rule_id=rule.id,
                symbol=sym,
                milestone_index=idx,
                milestone_pct=step["threshold"],
                value_at_trigger=step["current_value"],
                base_value=step["base_value"],
                price_at_trigger=indicators.get("close"),
                rsi_at_trigger=indicators.get("rsi_14"),
                message=msg,
                stop_loss=rec.get("stop_loss"),
                target_1=rec.get("target_1"),
                target_2=rec.get("target_2"),
                delivered_via=["telegram"] if tg_ok else [],
            )
            db.add(event)

            # Update rule's last_milestone
            await db.execute(
                update(AlertRule)
                .where(AlertRule.id == rule.id)
                .values(last_milestone=idx + 1)
            )

            mark_fired(rule.id, idx)
            sent.append({"rule_id": rule.id, "step": idx, "telegram_sent": tg_ok})

    await db.commit()
    return {"symbol": sym, "fired": len(sent), "details": sent}


# ─── Alert history ─────────────────────────────────────────────────────────────

@router.get("/history")
async def alert_history(
    symbol: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Recent alert events."""
    q = select(AlertEvent).order_by(desc(AlertEvent.triggered_at)).limit(limit)
    if symbol:
        q = q.where(AlertEvent.symbol == symbol.upper())
    result = await db.execute(q)
    events = result.scalars().all()
    return {
        "total": len(events),
        "events": [
            {
                "id": e.id,
                "symbol": e.symbol,
                "rule_id": e.rule_id,
                "milestone_pct": e.milestone_pct,
                "price_at_trigger": e.price_at_trigger,
                "rsi_at_trigger": e.rsi_at_trigger,
                "stop_loss": e.stop_loss,
                "target_1": e.target_1,
                "target_2": e.target_2,
                "message": e.message,
                "triggered_at": e.triggered_at,
                "delivered_via": e.delivered_via,
            }
            for e in events
        ],
    }


# ─── Telegram setup helpers ───────────────────────────────────────────────────

@router.get("/telegram/test")
async def telegram_test():
    """Verify Telegram bot connection."""
    return await test_connection()


@router.get("/telegram/chat-id")
async def telegram_chat_id():
    """
    Discover your Telegram chat_id.
    Send any message to your bot first, then call this endpoint.
    """
    return await get_chat_id_hint()
