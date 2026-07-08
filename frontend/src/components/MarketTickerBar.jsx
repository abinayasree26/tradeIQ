/**
 * MarketTickerBar.jsx — Scrolling marquee with live NSE/BSE data
 */
import { useState, useEffect, useRef } from 'react';
import { CONFIG, INDIA_SYMBOLS } from '../config';

const TICKER_SYMBOLS = ['NIFTY50', 'BANKNIFTY', 'SENSEX', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'SBIN', 'BAJFINANCE', 'BHARTIARTL', 'TATAMOTORS', 'ITC', 'WIPRO', 'MARUTI'];

export default function MarketTickerBar({ onSymbolClick }) {
  const [quotes, setQuotes] = useState([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchAll = async () => {
      try {
        const params = TICKER_SYMBOLS.join(',');
        const res = await fetch(`${CONFIG.STAP.QUOTES}?symbols=${encodeURIComponent(params)}`);
        if (!res.ok) return;
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.quotes || Object.values(data));
        setQuotes(results.filter(Boolean));
      } catch {
        // Silently fail — ticker is decorative
      }
    };

    fetchAll();
    const iv = setInterval(fetchAll, 30000);
    return () => clearInterval(iv);
  }, []);

  const displayItems = quotes.length > 0
    ? quotes
    : TICKER_SYMBOLS.map(sym => ({ symbol: sym, price: null, change_percent: null }));

  // Duplicate for infinite scroll
  const doubled = [...displayItems, ...displayItems];

  const fmt = (n) => n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return (
    <div className="ticker-bar">
      <div className="ticker-track">
        {doubled.map((q, i) => {
          const up = (q.change_percent ?? 0) >= 0;
          return (
            <div
              key={`${q.symbol}-${i}`}
              className="ticker-item"
              onClick={() => onSymbolClick?.(q.symbol)}
            >
              <span className="ticker-sym">{q.symbol}</span>
              <span className="ticker-price">
                {q.price != null ? `₹${fmt(q.price)}` : '—'}
              </span>
              {q.change_percent != null && (
                <span className={`ticker-chg ${up ? 'up' : 'down'}`}>
                  {up ? '+' : ''}{fmt(q.change_percent)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
