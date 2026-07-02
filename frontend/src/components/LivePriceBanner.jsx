import React, { useState, useEffect, useRef } from 'react';
import { Activity, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { CONFIG } from '../config';

const LivePriceBanner = ({ symbol = 'NIFTY 50', onPriceUpdate }) => {
  const [data, setData] = useState({
    price: null,
    change: 0,
    changePct: 0,
    dayHigh: 0,
    dayLow: 0,
    isMarketOpen: false,
    timestamp: null
  });
  const [loading, setLoading] = useState(true);
  const [flashType, setFlashType] = useState(null); // 'up' | 'down' | null
  const prevPriceRef = useRef(null);

  const fetchPrice = async () => {
    try {
      const res = await fetch(`${CONFIG.ENDPOINTS.LIVE_PRICE}?symbol=${encodeURIComponent(symbol)}`);
      const result = await res.json();
      
      if (prevPriceRef.current !== null && result.price !== prevPriceRef.current) {
        setFlashType(result.price > prevPriceRef.current ? 'up' : 'down');
        setTimeout(() => setFlashType(null), 1000);
      }
      
      if (onPriceUpdate) {
        onPriceUpdate({
          price: result.price,
          change: result.change,
          changePercent: result.changePct,
          isMarketOpen: result.isMarketOpen
        });
      }
      
      prevPriceRef.current = result.price;
      setData(result);
      setLoading(false);
      setData(prev => ({ ...prev, error: null }));
    } catch (err) {
      console.error('Error fetching live price:', err);
      setData(prev => ({ ...prev, error: 'Connection Failed' }));
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPrice();
    
    // Polling logic: 60s during market hours, 5min outside
    const intervalTime = data.isMarketOpen ? 60000 : 300000;
    const interval = setInterval(fetchPrice, intervalTime);
    
    return () => clearInterval(interval);
  }, [symbol, data.isMarketOpen]);

  const getTimeAgo = (ts) => {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'seconds ago';
    return `${Math.floor(diff / 60)}m ago`;
  };

  if (loading && !data.price) return null;

  const isPositive = data.change >= 0;

  return (
    <div className="live-price-banner">
      <div className="banner-left">
        <div className={`market-status ${data.isMarketOpen ? 'open' : 'closed'}`}>
          <div className="pulse-dot-small"></div>
          <span>{data.isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}</span>
        </div>
        <div className="symbol-info">
          <span className="symbol">{symbol}</span>
          <span className="index-name">{symbol.includes('NIFTY') ? 'NSE Index' : 'NSE Equity'}</span>
        </div>
      </div>

      <div className="price-display">
        <div className={`price-value ${flashType ? `flash-${flashType}` : ''}`}>
          {data.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          <span className="points-label">points</span>
        </div>
        <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          <span>{Math.abs(data.change).toFixed(2)} ({Math.abs(data.changePct).toFixed(2)}%)</span>
        </div>
      </div>

      <div className="day-range">
        <div className="range-item">
          <span className="label">Day High</span>
          <span className="value">{data.dayHigh?.toLocaleString('en-IN')}</span>
        </div>
        <div className="range-divider"></div>
        <div className="range-item">
          <span className="label">Day Low</span>
          <span className="value">{data.dayLow?.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="last-updated">
        <Clock size={14} />
        <span>Last updated: {getTimeAgo(data.timestamp)}</span>
      </div>
    </div>
  );
};

export default LivePriceBanner;
