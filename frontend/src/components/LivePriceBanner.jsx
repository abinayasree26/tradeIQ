/**
 * LivePriceBanner.jsx — Compact real-time price header
 * Fetches live quote from the STAP Python backend every 15 seconds.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { TrendingUp, TrendingDown, Clock, RefreshCw } from 'lucide-react';
import { CONFIG } from '../config';

export default function LivePriceBanner({ symbol, theme, onPriceUpdate }) {
  const [quote, setQuote]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash]     = useState('');
  const prevPrice             = useRef(null);
  const intervalRef           = useRef(null);

  const fetchQuote = useCallback(async () => {
    if (!symbol) return;
    try {
      const res = await fetch(CONFIG.STAP.QUOTE(symbol));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQuote(data);
      setLoading(false);

      if (onPriceUpdate) {
        onPriceUpdate({
          price: data.price,
          change: data.change,
          changePercent: data.change_percent,
          isMarketOpen: data.market_open,
        });
      }

      // Flash animation
      if (prevPrice.current !== null) {
        if (data.price > prevPrice.current) {
          setFlash('up');
          setTimeout(() => setFlash(''), 600);
        } else if (data.price < prevPrice.current) {
          setFlash('down');
          setTimeout(() => setFlash(''), 600);
        }
      }
      prevPrice.current = data.price;
    } catch {
      setLoading(false);
    }
  }, [symbol, onPriceUpdate]);

  useEffect(() => {
    setLoading(true);
    setQuote(null);
    prevPrice.current = null;
    fetchQuote();
    intervalRef.current = setInterval(fetchQuote, 15000);
    return () => clearInterval(intervalRef.current);
  }, [fetchQuote]);

  const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const isUp = (quote?.change ?? 0) >= 0;

  if (loading) {
    return (
      <div className="price-banner">
        <div className="skel" style={{ width: 80, height: 18 }} />
        <div className="skel" style={{ width: 120, height: 28 }} />
        <div className="skel" style={{ width: 70, height: 18 }} />
        <div className="skel" style={{ width: 70, height: 18 }} />
      </div>
    );
  }

  if (!quote) return null;

  return (
    <div className="price-banner">
      {/* Symbol */}
      <span className="price-banner-symbol">{symbol}</span>
      <div className="price-banner-divider" />

      {/* Price */}
      <span className={`price-banner-val ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}>
        ₹{fmt(quote.price)}
      </span>

      {/* Change */}
      <span className={`price-banner-chg ${isUp ? 'up' : 'down'}`}>
        {isUp ? <TrendingUp size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} /> : <TrendingDown size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }} />}
        {isUp ? '+' : ''}{fmt(quote.change)} ({isUp ? '+' : ''}{fmt(quote.change_percent)}%)
      </span>

      <div className="price-banner-divider" />

      {/* Day range */}
      <div className="price-banner-meta">
        <span className="price-meta-label">Day Low</span>
        <span className="price-meta-val" style={{ color: 'var(--bearish)' }}>₹{fmt(quote.day_low)}</span>
      </div>
      <div className="price-banner-meta">
        <span className="price-meta-label">Day High</span>
        <span className="price-meta-val" style={{ color: 'var(--bullish)' }}>₹{fmt(quote.day_high)}</span>
      </div>

      {quote['52w_low'] != null && (
        <>
          <div className="price-banner-divider" />
          <div className="price-banner-meta">
            <span className="price-meta-label">52W Low</span>
            <span className="price-meta-val">₹{fmt(quote['52w_low'])}</span>
          </div>
          <div className="price-banner-meta">
            <span className="price-meta-label">52W High</span>
            <span className="price-meta-val">₹{fmt(quote['52w_high'])}</span>
          </div>
        </>
      )}

      <div className="price-banner-divider" />

      {/* Market status + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', fontWeight: 700 }}>
          <div className={`status-dot ${quote.market_open ? 'live' : 'offline'}`} />
          <span style={{ color: quote.market_open ? 'var(--bullish)' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {quote.market_open ? 'Live' : 'Closed'}
          </span>
        </div>
        {quote.volume != null && (
          <div className="price-banner-meta" style={{ alignItems: 'flex-start' }}>
            <span className="price-meta-label">Volume</span>
            <span className="price-meta-val">{(quote.volume / 1_000_000).toFixed(2)}M</span>
          </div>
        )}
        <button
          onClick={fetchQuote}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </div>
  );
}
