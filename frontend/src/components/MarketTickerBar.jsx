import React from 'react';
import { TrendingUp, TrendingDown, Clock, Activity, Target } from 'lucide-react';

const MarketTickerBar = ({ symbol = 'NIFTY 50', livePrice = { price: 0, change: 0, changePercent: 0, isMarketOpen: false } }) => {
  const isUp = livePrice.change >= 0;
  const isOpen = livePrice.isMarketOpen;
  
  return (
    <div className="market-ticker-bar">
      <div className="ticker-group">
        <div className="ticker-item status">
          <div className={`status-dot ${isOpen ? 'ready' : 'closed'}`}></div>
          <span className="label">MARKET:</span>
          <span className="val" style={{ color: isOpen ? 'var(--success)' : 'var(--text-dim)' }}>
            {isOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
        <div className="ticker-divider"></div>
        <div className="ticker-item symbol">
          <Target size={14} className="text-accent" />
          <span className="label">SYMBOL:</span>
          <span className="val">{symbol}</span>
        </div>
      </div>

      <div className="ticker-group live">
        <div className={`ticker-item ltp ${isUp ? 'up' : 'down'}`}>
          <span className="label">LTP:</span>
          <span className="val">{(livePrice?.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        </div>
        <div className={`ticker-item change ${isUp ? 'up' : 'down'}`}>
          <span className="val">
            {isUp ? '+' : ''}{(livePrice?.change || 0).toFixed(2)} 
            ({(livePrice?.changePercent || 0).toFixed(2)}%)
          </span>
        </div>
      </div>

      <div className="ticker-group range">
        <div className="ticker-item">
          <span className="label">DAY HIGH:</span>
          <span className="val" style={{ color: 'var(--success)' }}>22,510.40</span>
        </div>
        <div className="ticker-item">
          <span className="label">DAY LOW:</span>
          <span className="val" style={{ color: 'var(--error)' }}>22,380.15</span>
        </div>
      </div>

      <div className="ticker-item updated" style={{ marginLeft: 'auto' }}>
        <Clock size={14} />
        <span className="label">UPDATED:</span>
        <span className="val">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
    </div>
  );
};

export default MarketTickerBar;
