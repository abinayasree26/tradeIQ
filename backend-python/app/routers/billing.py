"""
STAP Phase 5 — Billing & Subscription Router

Endpoints:
  POST /billing/checkout       — Create Stripe checkout session
  POST /billing/webhook        — Stripe webhook handler
  GET  /billing/plans          — List available subscription plans
  POST /billing/cancel         — Cancel subscription
  GET  /billing/history        — Get payment history

Subscription Tiers:
  - free:        3 symbols, 1 alert rule, no sentiment, no websocket
  - pro:         Unlimited symbols, 50 alerts, full sentiment, live WS (₹499/mo)
  - pro_annual:  Same as pro, billed annually (₹4,999/yr — 2 months free)
  - enterprise:  Everything + API access + priority support (₹2,499/mo)
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.domain import User
from app.services.auth_service import require_user, get_tier_limits
from app.utils.logger import logger

router = APIRouter(prefix="/billing", tags=["Billing & Subscriptions (Phase 5)"])


# ─── Plans ────────────────────────────────────────────────────────────────────

PLANS = {
    "pro_monthly": {
        "id": "pro_monthly",
        "name": "Pro Monthly",
        "tier": "pro",
        "price_inr": 499,
        "price_usd": 5.99,
        "interval": "month",
        "features": [
            "Unlimited symbol tracking",
            "50 alert rules with milestone chains",
            "Full sentiment analysis (FinBERT + Reddit)",
            "Real-time WebSocket data feed",
            "Candlestick pattern detection",
            "AI coaching messages",
            "Telegram & email alerts",
        ],
        "stripe_price_id": settings.STRIPE_PRICE_PRO_MONTHLY if hasattr(settings, 'STRIPE_PRICE_PRO_MONTHLY') else "",
    },
    "pro_annual": {
        "id": "pro_annual",
        "name": "Pro Annual",
        "tier": "pro_annual",
        "price_inr": 4999,
        "price_usd": 59.99,
        "interval": "year",
        "savings": "Save ₹989 (2 months free)",
        "features": [
            "Everything in Pro Monthly",
            "2 months free",
            "Priority support",
        ],
        "stripe_price_id": settings.STRIPE_PRICE_PRO_ANNUAL if hasattr(settings, 'STRIPE_PRICE_PRO_ANNUAL') else "",
    },
    "enterprise": {
        "id": "enterprise",
        "name": "Enterprise",
        "tier": "enterprise",
        "price_inr": 2499,
        "price_usd": 29.99,
        "interval": "month",
        "features": [
            "Everything in Pro",
            "REST API access (programmatic trading)",
            "Unlimited alert rules",
            "Custom webhooks",
            "Dedicated support channel",
        ],
        "stripe_price_id": settings.STRIPE_PRICE_ENTERPRISE if hasattr(settings, 'STRIPE_PRICE_ENTERPRISE') else "",
    },
}


# ─── List Plans ───────────────────────────────────────────────────────────────

@router.get("/plans")
async def list_plans():
    """Get all available subscription plans with pricing and features."""
    return {
        "plans": list(PLANS.values()),
        "currency": "INR",
        "free_tier": {
            "name": "Free",
            "price": 0,
            "limits": get_tier_limits("free"),
        },
    }


# ─── Create Checkout Session ──────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    plan_id: str  # pro_monthly / pro_annual / enterprise

@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Stripe checkout session for subscription upgrade.
    Returns a checkout URL to redirect the user to.
    """
    if body.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {body.plan_id}")

    plan = PLANS[body.plan_id]

    # Check if Stripe is configured
    if not settings.STRIPE_SECRET_KEY:
        # Dev/demo mode — directly upgrade without payment
        logger.warning(f"Stripe not configured. Demo-upgrading user {user.email} to {plan['tier']}")
        user.subscription_tier = plan["tier"]
        await db.commit()
        return {
            "mode": "demo",
            "message": f"Upgraded to {plan['name']} (demo mode — Stripe not configured)",
            "tier": plan["tier"],
            "limits": get_tier_limits(plan["tier"]),
        }

    # Production mode — create Stripe checkout
    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        # Create or get Stripe customer
        if not user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=user.email,
                name=user.name,
                metadata={"tradeiq_user_id": str(user.id)},
            )
            user.stripe_customer_id = customer.id
            await db.commit()

        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=user.stripe_customer_id,
            mode="subscription",
            line_items=[{"price": plan["stripe_price_id"], "quantity": 1}],
            success_url=f"{settings.FRONTEND_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/billing/cancel",
            metadata={"user_id": str(user.id), "plan_id": body.plan_id},
        )

        return {
            "checkout_url": session.url,
            "session_id": session.id,
        }

    except ImportError:
        raise HTTPException(status_code=500, detail="stripe package not installed")
    except Exception as e:
        logger.error(f"Stripe checkout error: {e}")
        raise HTTPException(status_code=500, detail="Payment processing error")


# ─── Stripe Webhook ───────────────────────────────────────────────────────────

@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Handle Stripe webhook events:
    - checkout.session.completed → activate subscription
    - invoice.paid → renew subscription
    - customer.subscription.deleted → downgrade to free
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not getattr(settings, 'STRIPE_WEBHOOK_SECRET', None):
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ImportError:
        raise HTTPException(status_code=500, detail="stripe package not installed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook signature verification failed: {e}")

    # Handle events
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data, db)
    elif event_type == "invoice.paid":
        await _handle_invoice_paid(data, db)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_cancelled(data, db)
    else:
        logger.info(f"Unhandled Stripe event: {event_type}")

    return {"received": True}


# ─── Cancel Subscription ──────────────────────────────────────────────────────

@router.post("/cancel")
async def cancel_subscription(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel the current subscription. Downgrades to free at period end."""
    if user.subscription_tier == "free":
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    if settings.STRIPE_SECRET_KEY and user.stripe_subscription_id:
        try:
            import stripe
            stripe.api_key = settings.STRIPE_SECRET_KEY
            # Cancel at period end (user keeps access until billing period ends)
            stripe.Subscription.modify(
                user.stripe_subscription_id,
                cancel_at_period_end=True,
            )
            logger.info(f"Subscription cancellation scheduled: {user.email}")
        except Exception as e:
            logger.error(f"Stripe cancellation error: {e}")
    else:
        # Demo mode — immediate downgrade
        user.subscription_tier = "free"
        user.stripe_subscription_id = None
        await db.commit()

    return {
        "message": "Subscription will be cancelled at the end of the billing period",
        "current_tier": user.subscription_tier,
    }


# ─── Payment History ──────────────────────────────────────────────────────────

@router.get("/history")
async def payment_history(user: User = Depends(require_user)):
    """Get payment history from Stripe."""
    if not settings.STRIPE_SECRET_KEY or not user.stripe_customer_id:
        return {"payments": [], "message": "No payment history available"}

    try:
        import stripe
        stripe.api_key = settings.STRIPE_SECRET_KEY

        invoices = stripe.Invoice.list(
            customer=user.stripe_customer_id,
            limit=20,
        )

        payments = [
            {
                "id": inv.id,
                "amount": inv.amount_paid / 100,
                "currency": inv.currency.upper(),
                "status": inv.status,
                "date": datetime.fromtimestamp(inv.created, tz=timezone.utc).isoformat(),
                "pdf_url": inv.invoice_pdf,
            }
            for inv in invoices.data
        ]

        return {"payments": payments}

    except Exception as e:
        logger.error(f"Payment history error: {e}")
        return {"payments": [], "error": "Could not fetch payment history"}


# ─── Webhook Handlers ─────────────────────────────────────────────────────────

async def _handle_checkout_completed(session_data: dict, db: AsyncSession):
    """Activate subscription after successful checkout."""
    from app.services.auth_service import get_user_by_id

    user_id = session_data.get("metadata", {}).get("user_id")
    plan_id = session_data.get("metadata", {}).get("plan_id")
    subscription_id = session_data.get("subscription")

    if not user_id or not plan_id:
        logger.error("Checkout completed but missing metadata")
        return

    user = await get_user_by_id(int(user_id), db)
    if not user:
        logger.error(f"Checkout completed but user {user_id} not found")
        return

    plan = PLANS.get(plan_id)
    if plan:
        user.subscription_tier = plan["tier"]
        user.stripe_subscription_id = subscription_id
        await db.commit()
        logger.info(f"Subscription activated: {user.email} → {plan['tier']}")


async def _handle_invoice_paid(invoice_data: dict, db: AsyncSession):
    """Renew subscription on successful payment."""
    customer_id = invoice_data.get("customer")
    if not customer_id:
        return

    from sqlalchemy import select
    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalars().first()
    if user:
        logger.info(f"Invoice paid for {user.email}, subscription renewed")


async def _handle_subscription_cancelled(sub_data: dict, db: AsyncSession):
    """Downgrade user when subscription is cancelled/expired."""
    customer_id = sub_data.get("customer")
    if not customer_id:
        return

    from sqlalchemy import select
    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalars().first()
    if user:
        user.subscription_tier = "free"
        user.stripe_subscription_id = None
        await db.commit()
        logger.info(f"Subscription cancelled: {user.email} → free")
