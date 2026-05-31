import { useState, useEffect } from 'react'
import {
  TrendingUp, Activity, Calendar, Info,
  Search, Bell, Settings, LayoutDashboard, Database,
  ArrowUpRight, ArrowDownLeft, Target, Send, X, Bot, Sparkles, User,
  FileText, Clock, RefreshCw, BarChart3, Moon, Sun, Plus, Trash, Filter
} from 'lucide-react';
import './App.css'
import { executeQuery, TABLES } from './services/databricks';

// New Components
import LivePriceBanner from './components/LivePriceBanner';
import NewsPanel from './components/NewsPanel';
import AiChat from './components/AiChat';
import CandlestickChart from './components/CandlestickChart';
import MarketTickerBar from './components/MarketTickerBar';
import { CONFIG, INDIA_SYMBOLS } from './config';
import { useThresholdAlerts } from './services/useThresholdAlerts';
import IndicatorPanel from './components/IndicatorPanel';
import MilestoneAlerts from './components/MilestoneAlerts';

const LOADING_STATE = {
  kpi: { avg_open: null, avg_close: null, avg_day_range: null },
  monthly: [],
  daily: [],
  loading: true,
  error: null
};

const formatNum = (n) => {
  if (n == null || isNaN(Number(n))) return '...';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState(LOADING_STATE);
  const [livePrice, setLivePrice] = useState({ price: 0, change: 0, changePercent: 0 });

  const { ToastContainer } = useThresholdAlerts(
    livePrice.price, 
    livePrice.price - livePrice.change
  );

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('tradeiq-theme') || 'dark');
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY 50');
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem('tradeiq-watchlist');
    return saved ? JSON.parse(saved) : ['NIFTY 50', 'BANKNIFTY', 'RELIANCE'];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('tradeiq-user');
    return saved ? JSON.parse(saved) : null;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    localStorage.setItem('tradeiq-theme', theme);
    document.documentElement.className = theme === 'light' ? 'light-mode' : '';
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('tradeiq-watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('tradeiq-user', JSON.stringify(user));
    } else {
      localStorage.removeItem('tradeiq-user');
    }
  }, [user]);

  const handleGoogleSignIn = () => {
    // Mock Google Sign-In
    const mockUser = {
      name: 'Admin Developer',
      email: 'admin@tradeiq.io',
      avatar: 'AD',
      lastLogin: new Date().toLocaleString()
    };
    setUser(mockUser);
  };

  const handleLogout = () => {
    setUser(null);
    setActiveTab('dashboard');
  };

  const STOCKS = INDIA_SYMBOLS.map(s => ({ symbol: s.symbol, name: s.name }));

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        let kpiRes, monthlyRes, dailyRes;

        if (selectedSymbol === 'NIFTY 50') {
          [kpiRes, monthlyRes, dailyRes] = await Promise.all([
            executeQuery(`SELECT avg_open, avg_close, avg_day_range, open_above_prev_close_200_count, close_above_prev_close_500_count, close_below_prev_close_500_count FROM ${TABLES.summary} LIMIT 1`),
            executeQuery(`SELECT year_month, avg_open, avg_close, avg_day_range FROM ${TABLES.monthlySummary} ORDER BY year_month ASC`),
            executeQuery(`SELECT trade_date as time, open, high, low, close FROM ${TABLES.dailyPrices} ORDER BY trade_date ASC`)
          ]);
        } else {
          // Fallback to Live API Historical for non-Nifty symbols
          const res = await fetch(`${CONFIG.ENDPOINTS.HISTORICAL}?symbol=${encodeURIComponent(selectedSymbol)}`);
          dailyRes = await res.json();
          // Mock some KPI data for specific stocks
          const last = dailyRes[dailyRes.length - 1] || {};
          kpiRes = [{
            avg_open: parseFloat(last.open) || 0,
            avg_close: parseFloat(last.close) || 0,
            avg_day_range: (parseFloat(last.high) - parseFloat(last.low)) || 0,
            open_above_prev_close_200_count: 0,
            close_above_prev_close_500_count: 0,
            close_below_prev_close_500_count: 0
          }];
          monthlyRes = []; 
        }

        setData({
          kpi: {
            avg_open: kpiRes?.[0]?.avg_open,
            avg_close: kpiRes?.[0]?.avg_close,
            avg_day_range: kpiRes?.[0]?.avg_day_range,
            open_above_200: kpiRes?.[0]?.open_above_prev_close_200_count,
            close_above_500: kpiRes?.[0]?.close_above_prev_close_500_count,
            close_below_500: kpiRes?.[0]?.close_below_prev_close_500_count,
          },
          monthly: monthlyRes?.map(r => ({
            month: r.year_month,
            avgOpen: parseFloat(r.avg_open) || 0,
            avgClose: parseFloat(r.avg_close) || 0,
            avgRange: parseFloat(r.avg_day_range) || 0
          })) || [],
          daily: dailyRes || [],
          loading: false,
          error: null
        });

        // Set baseline for alerts from previous day close
      } catch (err) {
        console.error("Dashboard load error:", err);
        setData(s => ({ ...s, loading: false, error: err.message }));
      }
    };
    loadData();
  }, [selectedSymbol]);

  const renderNewsTab = () => (
    <div className="dashboard-content">
      <div className="welcome">
        <div>
          <h1>Market Intelligence Feed</h1>
          <p>Real-time sector news and sentiment analysis</p>
        </div>
      </div>
      <div className="news-tab-container">
        <NewsPanel isFullPage={true} />
      </div>
    </div>
  );



  const renderDashboard = () => {
    if (data.error) {
      return (
        <div className="dashboard-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="glass" style={{ padding: '3rem', borderRadius: '24px', textAlign: 'center', maxWidth: '500px' }}>
            <Activity size={48} color="var(--error)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1rem' }}>Connection Interrupted</h2>
            <p style={{ color: 'var(--text-dim)', marginBottom: '2rem' }}>We're having trouble reaching the TradeIQ Market Engine. Please ensure the backend proxy is running.</p>
            <button 
              onClick={() => window.location.reload()}
              style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '0.8rem 2rem', borderRadius: '12px', fontWeight: 700, cursor: 'pointer' }}
            >
              Retry Connection
            </button>
            {data.error && <p style={{ fontSize: '0.7rem', color: 'var(--error)', marginTop: '2rem', opacity: 0.6 }}>Details: {data.error}</p>}
          </div>
        </div>
      );
    }

    return (
      <div className="dashboard-content dashboard-fade-in" style={{ padding: '0 1rem' }}>
        {/* Premium Header Status Row */}
        <div className="dashboard-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.03em' }}>Strategic Analytics</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span className="status-dot ready"></span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>{selectedSymbol} · Real-time Intelligence</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="sync-status" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', background: 'var(--border-subtle)', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-main)' }}>
            <RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} /> Syncing 14ms
          </div>
          <button className="export-btn" style={{ padding: '0.6rem 1.5rem', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px var(--accent-glow)' }}>Analyze</button>
        </div>
      </div>

      {/* Condensed KPI Row - Optimized Spacing */}
      <section className="kpi-grid" style={{ marginBottom: '2.5rem', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
        {[
          { label: 'Yearly Avg Open', val: data.kpi?.avg_open, trend: '+2.4%', color: 'var(--accent)', insight: 'Ascending' },
          { label: 'Yearly Avg Close', val: data.kpi?.avg_close, trend: '+1.8%', color: 'var(--success)', insight: 'Stable' },
          { label: 'Volatility Index', val: data.kpi?.avg_day_range, trend: '-0.3%', color: 'var(--warning)', insight: 'Contracting' }
        ].map((k, i) => (
          <div key={i} className="kpi-card glass" style={{ padding: '1.5rem', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: k.color, background: `${k.color}10`, padding: '4px 8px', borderRadius: '6px' }}>{k.trend}</span>
            </div>
            <div style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.04em', margin: '0.25rem 0' }}>
              {data.loading ? <span className="skeleton">...</span> : formatNum(k.val)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: k.color }}></div> {k.insight} Market Phase
            </div>
          </div>
        ))}
      </section>

      {/* DOMINANT Focal Chart  */}
      <section style={{ marginBottom: '3rem' }}>
        <div className="chart-wrapper-full" style={{ minHeight: '680px', border: '1px solid var(--border-main)', borderRadius: '24px', background: 'var(--bg-sidebar)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)' }}>
          <div style={{ padding: '2rem 2.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>Advanced Market Price Action</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: '4px' }}>Real-time OHLC candlestick pattern analysis</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(t => (
                <button key={t} style={{ background: t === '1D' ? 'var(--accent)' : 'var(--border-subtle)', border: 'none', color: t === '1D' ? 'white' : 'var(--text-muted)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>{t}</button>
              ))}
            </div>
          </div>
          <CandlestickChart data={data.daily} />
        </div>
      </section>

      {/* Balanced Secondary Analytics */}
      <div style={{ display: 'flex', gap: '2rem' }}>
        <div className="glass" style={{ flex: 1, padding: '2rem', borderRadius: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '2rem' }}>Threshold Frequency Breadth</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {[
              { label: 'Gap Ups > 200 pts', count: data.kpi?.open_above_200, color: 'var(--accent)', total: 50 },
              { label: 'Bullish Rallies > 500', count: data.kpi?.close_above_500, color: 'var(--success)', total: 30 },
              { label: 'Bearish Sell-offs > 500', count: data.kpi?.close_below_500, color: 'var(--error)', total: 30 }
            ].map((t, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: t.color }}>{t.count} D</span>
                </div>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (t.count / t.total) * 100)}%`, background: t.color, borderRadius: '10px', boxShadow: `0 0 10px ${t.color}40` }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ flex: 1, padding: '2rem', borderRadius: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '2rem' }}>Rolling Volatility Heat</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.monthly.slice(-5).map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '10px', background: i % 2 === 0 ? 'var(--border-subtle)' : 'transparent', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{m.month}</span>
                <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>±{formatNum(m.avgRange)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderMarketData = () => (
    <div className="dashboard-content dashboard-fade-in" style={{ padding: '2rem 1.5rem' }}>
      {/* 2. Page Header Area */}
      <div className="page-header" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="header-left">
          <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.04em', margin: 0 }}>Market Data Explorer</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '1rem', marginTop: '4px' }}>Full historical dataset access for {selectedSymbol}</p>
        </div>
        <div className="header-right" style={{ display: 'flex', gap: '12px' }}>
          <div className="search-box-container">
            <Search size={16} className="search-icon" />
            <input type="text" placeholder="Search indices, symbols..." style={{ fontSize: '0.85rem' }} />
          </div>
          <button className="icon-btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-main)' }}><RefreshCw size={16} /></button>
          <button className="icon-btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-main)', width: 'auto', padding: '0 1rem', fontSize: '0.75rem', fontWeight: 700 }}>EXPORT CSV</button>
          <button className="icon-btn" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-main)' }}><Filter size={16} /></button>
        </div>
      </div>

      {/* 3. Summary Cards Row */}
      <div className="summary-cards-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
        {[
          { label: 'Average Close', val: formatNum(data.kpi?.avg_close), icon: <Activity size={18} />, color: 'var(--accent)' },
          { label: 'Highest High', val: formatNum(Math.max(...data.daily.map(d => d.high || 0))), icon: <ArrowUpRight size={18} />, color: 'var(--success)' },
          { label: 'Lowest Low', val: formatNum(Math.min(...data.daily.map(d => d.low || 0))), icon: <ArrowDownLeft size={18} />, color: 'var(--error)' },
          { label: 'Total Records', val: data.daily.length, icon: <Database size={18} />, color: 'var(--text-muted)' }
        ].map((c, i) => (
          <div key={i} className="glass" style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '12px' }}>
              <div style={{ color: c.color }}>{c.icon}</div> {c.label}
            </div>
            <div style={{ fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.03em' }}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* 4. Main Table Card */}
      <div className="data-explorer-card">
        <div className="sticky-table-container">
          <table className="sticky-table">
            <thead>
              <tr>
                <th style={{ width: '150px' }}>Trade Date</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Close</th>
                <th>Change</th>
                <th>Change %</th>
                <th style={{ width: '120px' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {data.loading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i} className="skeleton-row">
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                    <td><div className="skeleton-shimmer"></div></td>
                  </tr>
                ))
              ) : (
                data.daily.slice().reverse().map((row, idx) => {
                  const change = row.close - row.open;
                  const changePct = (change / row.open) * 100;
                  const isUp = change >= 0;
                  return (
                    <tr key={idx}>
                      <td style={{ color: 'var(--text-muted)', fontWeight: 800 }}>{row.time}</td>
                      <td>{formatNum(row.open)}</td>
                      <td>{formatNum(row.high)}</td>
                      <td>{formatNum(row.low)}</td>
                      <td style={{ color: isUp ? 'var(--success)' : 'var(--error)', fontWeight: 900 }}>{formatNum(row.close)}</td>
                      <td className={isUp ? 'text-bullish' : 'text-bearish'}>
                        {isUp ? '+' : ''}{change.toFixed(2)}
                      </td>
                      <td className={isUp ? 'text-bullish' : 'text-bearish'}>
                        {isUp ? '+' : ''}{changePct.toFixed(2)}%
                      </td>
                      <td>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 900, 
                          padding: '3px 8px', 
                          borderRadius: '4px', 
                          background: 'rgba(255,255,255,0.03)', 
                          color: 'var(--text-dim)',
                          border: '1px solid var(--border-subtle)'
                        }}>
                          {selectedSymbol}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Behavior: Pagination Footer */}
        <div className="table-pagination">
          <div className="rows-selector">
            <span>Show rows:</span>
            <select defaultValue="100">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
            </select>
          </div>
          <div className="page-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginRight: '1rem' }}>Page 1 of {Math.ceil(data.daily.length / 100)}</span>
            <button className="page-btn active">1</button>
            <button className="page-btn">2</button>
            <button className="page-btn">3</button>
            <span style={{ color: 'var(--text-dim)' }}>...</span>
            <button className="page-btn">{Math.ceil(data.daily.length / 100)}</button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHistorical = () => (
    <div className="dashboard-content">
      <div className="welcome">
        <div>
          <h1>Historical Aggregations</h1>
          <p>Consolidated reports from {selectedSymbol === 'NIFTY 50' ? 'Databricks' : 'Real-time API'}</p>
        </div>
      </div>
      <div className="data-explorer-card" style={{ marginTop: '0' }}>
        <div className="sticky-table-container" style={{ maxHeight: '500px' }}>
          <table className="sticky-table">
            <thead>
              <tr>
                <th>Year-Month</th>
                <th style={{ textAlign: 'right' }}>Average Open</th>
                <th style={{ textAlign: 'center' }}>Average Close</th>
                <th style={{ textAlign: 'center' }}>Avg Day Range</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 800 }}>{row.month}</td>
                  <td style={{ textAlign: 'right' }}>{formatNum(row.avgOpen)}</td>
                  <td style={{ textAlign: 'center' }}>{formatNum(row.avgClose)}</td>
                  <td style={{ textAlign: 'center' }}>{formatNum(row.avgRange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="dashboard-content">
      <div className="welcome">
        <div>
          <h1>Application Settings</h1>
          <p>Manage your profile, preferences, and notifications</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card glass">
          <div className="card-header">
            <User size={20} />
            <h3>User Profile</h3>
          </div>
          <div className="card-body">
            {user ? (
              <div className="user-profile-detailed">
                <div className="avatar-large">{user.avatar}</div>
                <div className="info">
                  <p className="p-name">{user.name}</p>
                  <p className="p-email">{user.email}</p>
                  <p className="p-sub">Last sync: {user.lastLogin}</p>
                </div>
                <button className="auth-btn logout" onClick={handleLogout}>Sign Out from Google</button>
              </div>
            ) : (
              <div className="auth-placeholder">
                <p>Sign in to sync your watchlist across devices.</p>
                <button className="auth-btn login" onClick={handleGoogleSignIn}>
                  <img src="https://www.google.com/favicon.ico" alt="Google" />
                  Sign in with Google
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="settings-card glass">
          <div className="card-header">
            <Settings size={20} />
            <h3>General Preferences</h3>
          </div>
          <div className="card-body">
            <div className="setting-row">
              <div className="s-text">
                <p className="s-label">Visual Theme</p>
                <p className="s-desc">Switch between dark and light mode</p>
              </div>
              <button className="theme-pill" onClick={toggleTheme}>
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </button>
            </div>
            <div className="setting-row">
              <div className="s-text">
                <p className="s-label">Real-time Notifications</p>
                <p className="s-desc">Receive alerts on price threshold crossings</p>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={notificationsEnabled} 
                  onChange={() => setNotificationsEnabled(!notificationsEnabled)} 
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </section>

        <section className="settings-card glass">
          <div className="card-header">
            <Bell size={20} />
            <h3>Market Alerts</h3>
          </div>
          <div className="card-body">
             <div className="alert-config">
                <p className="s-desc">Configure your point thresholds for Nifty metrics (Current: ±200, ±300, ±500)</p>
                <div className="badge-list">
                  <span className="badge">Aggressive</span>
                  <span className="badge secondary">Moderate</span>
                  <span className="badge secondary">Conservative</span>
                </div>
             </div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderSignals = () => (
    <div className="dashboard-content">
      <div className="welcome">
        <div>
          <h1>Technical Signals</h1>
          <p>RSI · MACD · Bollinger Bands · RVOL · EMA · ATR · VWAP · Composite Score</p>
        </div>
      </div>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <IndicatorPanel symbol={selectedSymbol} />
      </div>
    </div>
  );

  const renderAlerts = () => (
    <div className="dashboard-content">
      <div className="welcome">
        <div>
          <h1>Milestone Alerts</h1>
          <p>Progressive alerts with plain-language coaching · Stop-loss · Targets · Telegram delivery</p>
        </div>
      </div>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <MilestoneAlerts symbol={selectedSymbol} />
      </div>
    </div>
  );

  return (
    <div className="main-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <MarketTickerBar symbol={selectedSymbol} livePrice={livePrice} />
      
      <div className="layout" style={{ flex: 1, overflow: 'hidden' }}>
        {/* Sidebar - Precision Engineered */}
      <aside className="sidebar">
        <div className="logo" onClick={() => setActiveTab('dashboard')} style={{ cursor: 'pointer' }}>
          <TrendingUp className="logo-icon" />
          <span>TradeIQ</span>
        </div>
        
        <nav className="nav">
          <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <LayoutDashboard size={18} /> <span>Analytics</span>
          </button>
          <button className={`nav-item ${activeTab === 'data' ? 'active' : ''}`} onClick={() => setActiveTab('data')}>
            <Database size={18} /> <span>Market Data</span>
          </button>
          <button className={`nav-item ${activeTab === 'news' ? 'active' : ''}`} onClick={() => setActiveTab('news')}>
            <FileText size={18} /> <span>Market News</span>
          </button>
          <button className={`nav-item ${activeTab === 'historical' ? 'active' : ''}`} onClick={() => setActiveTab('historical')}>
            <Target size={18} /> <span>Aggregations</span>
          </button>
          <button className={`nav-item ${activeTab === 'signals' ? 'active' : ''}`} onClick={() => setActiveTab('signals')}>
            <Activity size={18} /> <span>Signals</span>
          </button>
          <button className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}>
            <Bell size={18} /> <span>Alerts</span>
          </button>
          <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <Settings size={18} /> <span>Settings</span>
          </button>
        </nav>

        {/* Watchlist below nav as per spec */}
        <div className="watchlist-section" style={{ marginTop: '2.5rem', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0 0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Watchlist</span>
            <button className="icon-btn" style={{ width: '24px', height: '24px' }}><Plus size={14} /></button>
          </div>
          <div className="watchlist-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
            {watchlist.map(sym => {
              const stock = STOCKS.find(s => s.symbol === sym) || { symbol: sym, name: '' };
              return (
                <div key={sym} className={`watchlist-item ${selectedSymbol === sym ? 'active' : ''}`} onClick={() => setSelectedSymbol(sym)} style={{ padding: '0.85rem 1rem', marginBottom: '4px', border: '1px solid transparent' }}>
                  <div className="w-info" style={{ flex: 1 }}>
                    <span className="w-symbol" style={{ fontWeight: 800, fontSize: '0.9rem' }}>{sym}</span>
                    <span className="w-name" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{stock.name}</span>
                  </div>
                  
                  {/* Sparkline Indicator */}
                  <div className="w-sparkline" style={{ width: '48px', height: '24px', margin: '0 12px' }}>
                     <svg width="100%" height="100%" viewBox="0 0 48 24">
                        <path 
                           d={sym.startsWith('N') ? "M0 18 Q12 12 24 14 T48 4" : "M0 6 Q12 18 24 12 T48 20"} 
                           fill="none" 
                           stroke={sym.startsWith('N') ? "var(--success)" : "var(--error)"} 
                           strokeWidth="2"
                           strokeLinecap="round"
                        />
                     </svg>
                  </div>

                  <div className="w-meta" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: sym.startsWith('N') ? 'var(--success)' : 'var(--error)' }}>
                      {sym.startsWith('N') ? '+1.24%' : '-0.42%'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', opacity: 0.6 }}>VOL: 1.2M</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sidebar-footer" style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-main)' }}>
          <div className="user-profile" onClick={() => setActiveTab('settings')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="avatar" style={{ width: '36px', height: '36px', borderRadius: '10px', fontSize: '0.8rem' }}>{user ? user.avatar : '??'}</div>
            <div className="user-info">
              <p className="name" style={{ fontSize: '0.85rem' }}>{user ? user.name : 'Guest'}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--success)' }}>
                <div className="status-dot ready"></div>
                <span>Live Status</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-wrapper">
        <LivePriceBanner symbol={selectedSymbol} theme={theme} onPriceUpdate={setLivePrice} />
        
        <header className="top-search-bar">
          <div className="search-box-container">
            <Search size={18} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search assets, indices, analysts..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
            />
            {showSearchResults && searchQuery && (
              <div className="search-results">
                {STOCKS.filter(s => s.symbol.includes(searchQuery.toUpperCase())).map(s => (
                  <div key={s.symbol} className="search-result-item" style={{ padding: '0.75rem 1rem', cursor: 'pointer' }} onClick={() => {
                    setSelectedSymbol(s.symbol);
                    setSearchQuery('');
                    setShowSearchResults(false);
                  }}>
                    <span className="res-symbol" style={{ fontWeight: 700, fontSize: '0.9rem' }}>{s.symbol}</span>
                    <span className="res-name" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block' }}>{s.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="top-actions">
             <div className="market-status-pill">
               <Clock size={14} /> <span>MARKET OPEN</span>
             </div>
            <button className="icon-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="icon-btn"><Bell size={20} /></button>
          </div>
        </header>

        <main className="dashboard-container">
          <div className="main-scroll-area">
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'data' && renderMarketData()}
            {activeTab === 'news' && renderNewsTab()}
            {activeTab === 'historical' && renderHistorical()}
            {activeTab === 'signals' && renderSignals()}
            {activeTab === 'alerts' && renderAlerts()}
            {activeTab === 'settings' && renderSettings()}
          </div>
        </main>

        <AiChat 
          isOpen={isChatOpen} 
          onClose={() => setIsChatOpen(!isChatOpen)} 
          selectedSymbol={selectedSymbol}
          databricksData={{
            summary: data.kpi,
            monthly: data.monthly,
            recent: data.daily.slice(-10),
            symbol: selectedSymbol
          }}
        />

        {notificationsEnabled && <ToastContainer />}
      </div>
    </div>
    </div>
  );
}

export default App
