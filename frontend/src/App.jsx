import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, Activity, Info, Search, Bell, Settings,
  LayoutDashboard, Database, ArrowUpRight, ArrowDownLeft,
  Target, Sun, Moon, Plus, Filter, RefreshCw, BarChart3,
  Sparkles, FileText, Clock, Zap, MessageSquare, ChevronRight,
  User, CreditCard, Bot
} from 'lucide-react';
import './App.css';
import { executeQuery, TABLES } from './services/databricks';
import LivePriceBanner from './components/LivePriceBanner';
import NewsPanel from './components/NewsPanel';
import AiChat from './components/AiChat';
import CandlestickChart from './components/CandlestickChart';
import MarketTickerBar from './components/MarketTickerBar';
import { CONFIG, INDIA_SYMBOLS } from './config';
import { useThresholdAlerts } from './services/useThresholdAlerts';
import IndicatorPanel from './components/IndicatorPanel';
import MilestoneAlerts from './components/MilestoneAlerts';
import PatternPanel from './components/PatternPanel';
import SentimentPanel from './components/SentimentPanel';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmtNum = (n) => {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const LOADING_STATE = {
  kpi: { avg_open: null, avg_close: null, avg_day_range: null },
  monthly: [],
  daily: [],
  loading: true,
  error: null,
};

/* ─── NAV config ──────────────────────────────────────────────────────────── */
const NAV = [
  { id: 'dashboard',  label: 'Analytics',    icon: LayoutDashboard, group: 'main' },
  { id: 'data',       label: 'Market Data',  icon: Database,        group: 'main' },
  { id: 'news',       label: 'News Feed',    icon: FileText,        group: 'main' },
  { id: 'signals',    label: 'Signals',      icon: Activity,        group: 'analysis' },
  { id: 'patterns',   label: 'Patterns',     icon: Sparkles,        group: 'analysis' },
  { id: 'sentiment',  label: 'Sentiment',    icon: MessageSquare,   group: 'analysis', badge: 'AI' },
  { id: 'alerts',     label: 'Alerts',       icon: Bell,            group: 'tools' },
  { id: 'historical', label: 'Aggregations', icon: BarChart3,       group: 'tools' },
  { id: 'settings',   label: 'Settings',     icon: Settings,        group: 'account' },
];

const NAV_GROUPS = [
  { id: 'main',     label: 'Overview' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'tools',    label: 'Tools' },
  { id: 'account',  label: 'Account' },
];

/* ═══════════════════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeTab, setActiveTab]     = useState('dashboard');
  const [data, setData]               = useState(LOADING_STATE);
  const [livePrice, setLivePrice]     = useState({ price: 0, change: 0, changePercent: 0, isMarketOpen: false });
  const [isChatOpen, setIsChatOpen]   = useState(false);
  const [theme, setTheme]             = useState(localStorage.getItem('tradeiq-theme') || 'dark');
  const [selectedSymbol, setSelectedSymbol] = useState('NIFTY50');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch]   = useState(false);
  const [notificationsEnabled]        = useState(true);
  const [activeTimeframe, setActiveTimeframe] = useState('1D');
  const searchRef = useRef(null);

  /* auth */
  const [user, setUser]               = useState(() => {
    const s = localStorage.getItem('tradeiq-user');
    return s ? JSON.parse(s) : null;
  });
  const [authTab, setAuthTab]         = useState('login');
  const [authEmail, setAuthEmail]     = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName]       = useState('');
  const [authError, setAuthError]     = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  const { ToastContainer } = useThresholdAlerts(livePrice.price, livePrice.price - livePrice.change);

  /* ─── theme ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    localStorage.setItem('tradeiq-theme', theme);
    document.documentElement.className = theme === 'light' ? 'light-mode' : '';
  }, [theme]);

  /* ─── watchlist ─────────────────────────────────────────────────────────── */
  const [watchlist, setWatchlist] = useState(() => {
    const s = localStorage.getItem('tradeiq-watchlist');
    return s ? JSON.parse(s) : ['NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK'];
  });

  useEffect(() => {
    localStorage.setItem('tradeiq-watchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (user) localStorage.setItem('tradeiq-user', JSON.stringify(user));
    else localStorage.removeItem('tradeiq-user');
  }, [user]);

  /* ─── close search on outside click ─────────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ─── data fetch ─────────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setData(s => ({ ...s, loading: true, error: null }));
    try {
      let kpiRes, monthlyRes, dailyRes;
      try {
        if (selectedSymbol === 'NIFTY50' || selectedSymbol === 'NIFTY 50') {
          [kpiRes, monthlyRes, dailyRes] = await Promise.all([
            executeQuery(`SELECT avg_open, avg_close, avg_day_range, open_above_prev_close_200_count, close_above_prev_close_500_count, close_below_prev_close_500_count FROM ${TABLES.summary} LIMIT 1`),
            executeQuery(`SELECT year_month, avg_open, avg_close, avg_day_range FROM ${TABLES.monthlySummary} ORDER BY year_month ASC`),
            executeQuery(`SELECT trade_date as time, open, high, low, close FROM ${TABLES.dailyPrices} ORDER BY trade_date ASC`),
          ]);
          if (!dailyRes || dailyRes.length === 0) {
            throw new Error("Databricks returned empty, fallback to local API");
          }
        } else throw new Error('Use live API');
      } catch (err) {
        console.warn("Databricks query failed or skipped, falling back to local STAP API", err);
        const res = await fetch(CONFIG.STAP.OHLCV(selectedSymbol));
        const json = await res.json();
        dailyRes = json.candles || [];
        
        if (dailyRes.length > 0) {
          let sumOpen = 0, sumClose = 0, sumRange = 0;
          let openAbove200 = 0, closeAbove500 = 0, closeBelow500 = 0;
          const monthlyGroups = {};
          
          for (let i = 0; i < dailyRes.length; i++) {
            const candle = dailyRes[i];
            const open = parseFloat(candle.open) || 0;
            const close = parseFloat(candle.close) || 0;
            const high = parseFloat(candle.high) || 0;
            const low = parseFloat(candle.low) || 0;
            const range = high - low;
            
            sumOpen += open;
            sumClose += close;
            sumRange += range;
            
            if (i > 0) {
              const prevClose = parseFloat(dailyRes[i - 1].close) || open;
              if (open - prevClose > 200) openAbove200++;
              if (close - prevClose > 500) closeAbove500++;
              if (prevClose - close > 500) closeBelow500++;
            }
            
            const dateObj = new Date(candle.time * 1000);
            const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyGroups[yearMonth]) {
              monthlyGroups[yearMonth] = { sumOpen: 0, sumClose: 0, sumRange: 0, count: 0 };
            }
            monthlyGroups[yearMonth].sumOpen += open;
            monthlyGroups[yearMonth].sumClose += close;
            monthlyGroups[yearMonth].sumRange += range;
            monthlyGroups[yearMonth].count++;
          }
          
          const len = dailyRes.length;
          kpiRes = [{
            avg_open: sumOpen / len,
            avg_close: sumClose / len,
            avg_day_range: sumRange / len,
            open_above_prev_close_200_count: openAbove200,
            close_above_prev_close_500_count: closeAbove500,
            close_below_prev_close_500_count: closeBelow500
          }];
          
          monthlyRes = Object.keys(monthlyGroups).sort().map(ym => {
            const group = monthlyGroups[ym];
            return {
              year_month: ym,
              avg_open: group.sumOpen / group.count,
              avg_close: group.sumClose / group.count,
              avg_day_range: group.sumRange / group.count
            };
          });
        } else {
          kpiRes = [{ avg_open: 0, avg_close: 0, avg_day_range: 0 }];
          monthlyRes = [];
        }
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
        monthly: monthlyRes?.map(r => ({ month: r.year_month, avgOpen: parseFloat(r.avg_open) || 0, avgClose: parseFloat(r.avg_close) || 0, avgRange: parseFloat(r.avg_day_range) || 0 })) || [],
        daily: dailyRes || [],
        loading: false,
        error: null,
      });
    } catch (err) {
      setData(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [selectedSymbol]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ─── auth ───────────────────────────────────────────────────────────────── */
  const handleLogin = async (e) => {
    e?.preventDefault();
    if (!authEmail || !authPassword) { setAuthError('Email and password required'); return; }
    setAuthError(null); setAuthLoading(true);
    try {
      const params = new URLSearchParams({ username: authEmail, password: authPassword });
      const res = await fetch(CONFIG.STAP.AUTH_LOGIN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Login failed');
      const initials = d.user.name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
      localStorage.setItem('tradeiq-token', d.access_token);
      setUser({ name: d.user.name, email: d.user.email, avatar: initials || 'US', lastLogin: new Date().toLocaleString() });
      setAuthEmail(''); setAuthPassword('');
    } catch (err) { setAuthError(err.message); }
    finally { setAuthLoading(false); }
  };

  const handleSignup = async (e) => {
    e?.preventDefault();
    if (!authEmail || !authPassword || !authName) { setAuthError('All fields required'); return; }
    if (authPassword.length < 8) { setAuthError('Password must be at least 8 characters'); return; }
    setAuthError(null); setAuthLoading(true);
    try {
      const signupUrl = CONFIG.STAP.AUTH_REGISTER.replace('/register', '/signup');
      const res = await fetch(signupUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: authEmail, password: authPassword, name: authName }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Signup failed');
      const initials = d.user.name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
      localStorage.setItem('tradeiq-token', d.access_token);
      setUser({ name: d.user.name, email: d.user.email, avatar: initials || 'US', lastLogin: new Date().toLocaleString() });
      setAuthEmail(''); setAuthPassword(''); setAuthName('');
    } catch (err) { setAuthError(err.message); }
    finally { setAuthLoading(false); }
  };

  const handleLogout = () => { localStorage.removeItem('tradeiq-token'); setUser(null); setActiveTab('dashboard'); };

  const handleGoogleLogin = async (idToken) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch(CONFIG.STAP.AUTH_GOOGLE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Google login failed');
      const initials = d.user.name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
      localStorage.setItem('tradeiq-token', d.access_token);
      setUser({ name: d.user.name, email: d.user.email, avatar: initials || 'US', lastLogin: new Date().toLocaleString() });
      setAuthEmail('');
      setAuthPassword('');
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (user || activeTab !== 'settings') return;

    let checkInterval;
    const initGoogleSignIn = () => {
      if (typeof window.google !== 'undefined' && window.google.accounts) {
        clearInterval(checkInterval);
        try {
          window.google.accounts.id.initialize({
            client_id: "44230614620-v0b6pig1g702nllkv043hp00755kfpif.apps.googleusercontent.com",
            callback: (response) => {
              if (response.credential) {
                handleGoogleLogin(response.credential);
              }
            }
          });
          
          const btnElem = document.getElementById("google-signin-btn");
          if (btnElem) {
            window.google.accounts.id.renderButton(btnElem, {
              theme: "outline",
              size: "large",
              width: 320,
              text: "signin_with"
            });
          }
        } catch (err) {
          console.warn("Failed to initialize Google Sign-In:", err);
        }
      }
    };

    checkInterval = setInterval(initGoogleSignIn, 500);
    initGoogleSignIn();

    return () => clearInterval(checkInterval);
  }, [user, activeTab]);

  /* ─── symbol selection ───────────────────────────────────────────────────── */
  const selectSymbol = (sym) => {
    setSelectedSymbol(sym);
    setSearchQuery('');
    setShowSearch(false);
  };

  const filteredSymbols = INDIA_SYMBOLS.filter(s =>
    s.symbol.includes(searchQuery.toUpperCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 8);

  /* ─── RENDERS ────────────────────────────────────────────────────────────── */

  const renderDashboard = () => (
    <div className="fade-in" style={{ animation: 'fadeIn 0.4s ease' }}>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Strategic Analytics</h1>
          <p className="page-subtitle">
            <span className="status-dot live" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />
            {selectedSymbol} · Real-time Intelligence
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '5px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={12} /> Syncing live
          </div>
          <button className="btn btn-primary btn-sm" onClick={loadData}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-grid">
        {[
          { label: 'Yearly Avg Open', val: data.kpi?.avg_open, trend: '+2.4%', dir: 'up', icon: <TrendingUp size={14} />, insight: 'Ascending phase', color: 'var(--accent)' },
          { label: 'Yearly Avg Close', val: data.kpi?.avg_close, trend: '+1.8%', dir: 'up', icon: <Activity size={14} />, insight: 'Stable distribution', color: 'var(--bullish)' },
          { label: 'Volatility Range', val: data.kpi?.avg_day_range, trend: '-0.3%', dir: 'down', icon: <BarChart3 size={14} />, insight: 'Contracting band', color: 'var(--warning)' },
        ].map((k, i) => (
          <div key={i} className="card kpi-card">
            <div className="kpi-label" style={{ color: k.color }}>
              {k.icon} {k.label}
            </div>
            <div className="kpi-value">
              {data.loading ? <div className="skel" style={{ width: '60%', height: 28 }} /> : fmtNum(k.val)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={`kpi-trend ${k.dir}`}>{k.trend}</span>
              <span className="kpi-insight">{k.insight}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="chart-section">
        <div className="chart-card">
          <div className="chart-card-header">
            <div>
              <div className="chart-title">Advanced Price Action</div>
              <div className="chart-subtitle">OHLC candlestick · {selectedSymbol}</div>
            </div>
            <div className="timeframe-btns">
              {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(t => (
                <button key={t} className={`tf-btn ${activeTimeframe === t ? 'active' : ''}`} onClick={() => setActiveTimeframe(t)}>{t}</button>
              ))}
            </div>
          </div>
          <CandlestickChart data={data.daily} theme={theme} />
        </div>
      </div>

      {/* Secondary analytics */}
      <div className="dashboard-grid">
        {/* Threshold breadth */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 20, color: 'var(--text-primary)' }}>Threshold Frequency Breadth</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              { label: 'Gap Ups > 200 pts', count: data.kpi?.open_above_200, color: 'var(--accent)', total: 50 },
              { label: 'Bullish Rallies > 500', count: data.kpi?.close_above_500, color: 'var(--bullish)', total: 30 },
              { label: 'Bearish Sell-offs > 500', count: data.kpi?.close_below_500, color: 'var(--bearish)', total: 30 },
            ].map((t, i) => (
              <div key={i}>
                <div className="flex-between" style={{ marginBottom: 7 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: t.color }}>{t.count ?? '—'} days</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.min(100, ((t.count || 0) / t.total) * 100)}%`, background: t.color, boxShadow: `0 0 8px ${t.color}40` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rolling volatility */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: 20 }}>Rolling Volatility Heat</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {data.monthly.slice(-6).map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 8, background: i % 2 === 0 ? 'var(--bg-overlay)' : 'transparent', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{m.month}</span>
                <span className="mono fw-700">±{fmtNum(m.avgRange)}</span>
              </div>
            ))}
            {data.monthly.length === 0 && !data.loading && (
              <div className="no-data">No aggregation data available for {selectedSymbol}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderMarketData = () => (
    <div style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Market Data Explorer</h1>
          <p className="page-subtitle">Historical OHLCV dataset · {selectedSymbol}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="icon-btn"><RefreshCw size={15} onClick={loadData} /></button>
          <button className="btn btn-ghost btn-sm"><Filter size={13} /> Filter</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[
          { label: 'Average Close', val: fmtNum(data.kpi?.avg_close), icon: <Activity size={16} />, color: 'var(--accent)' },
          { label: 'Highest High', val: fmtNum(Math.max(...(data.daily.map(d => d.high || 0)), 0)), icon: <ArrowUpRight size={16} />, color: 'var(--bullish)' },
          { label: 'Lowest Low', val: fmtNum(Math.min(...(data.daily.filter(d => d.low > 0).map(d => d.low || Infinity)), Infinity) || 0), icon: <ArrowDownLeft size={16} />, color: 'var(--bearish)' },
          { label: 'Total Records', val: data.daily.length, icon: <Database size={16} />, color: 'var(--text-muted)' },
        ].map((c, i) => (
          <div key={i} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.color, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {c.icon} {c.label}
            </div>
            <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.03em' }}>{c.val}</div>
          </div>
        ))}
      </div>

      <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 340px)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Trade Date</th>
              <th>Open</th>
              <th>High</th>
              <th>Low</th>
              <th>Close</th>
              <th>Change</th>
              <th>Change %</th>
              <th>Symbol</th>
            </tr>
          </thead>
          <tbody>
            {data.loading ? (
              Array(12).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(8).fill(0).map((_, j) => (
                    <td key={j}><div className="skel skel-line" /></td>
                  ))}
                </tr>
              ))
            ) : (
              data.daily.slice().reverse().map((row, idx) => {
                const change = row.close - row.open;
                const pct    = (change / row.open) * 100;
                const up     = change >= 0;
                return (
                  <tr key={idx}>
                    <td className="mono" style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{row.time}</td>
                    <td className="mono">{fmtNum(row.open)}</td>
                    <td className="mono">{fmtNum(row.high)}</td>
                    <td className="mono">{fmtNum(row.low)}</td>
                    <td className={`mono fw-700 td-${up ? 'bullish' : 'bearish'}`}>{fmtNum(row.close)}</td>
                    <td className={`mono ${up ? 'text-bullish' : 'text-bearish'}`}>{up ? '+' : ''}{change.toFixed(2)}</td>
                    <td className={`mono ${up ? 'text-bullish' : 'text-bearish'}`}>{up ? '+' : ''}{pct.toFixed(2)}%</td>
                    <td><span className="badge badge-neutral">{selectedSymbol}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHistorical = () => (
    <div style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Historical Aggregations</h1>
          <p className="page-subtitle">Monthly summary from {selectedSymbol === 'NIFTY50' ? 'Databricks' : 'live API'}</p>
        </div>
      </div>
      <div className="table-wrapper" style={{ maxHeight: 'calc(100vh - 250px)' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Year-Month</th>
              <th style={{ textAlign: 'right' }}>Avg Open</th>
              <th style={{ textAlign: 'right' }}>Avg Close</th>
              <th style={{ textAlign: 'right' }}>Avg Day Range</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.length === 0 ? (
              <tr><td colSpan={4} className="no-data">No aggregation data available</td></tr>
            ) : data.monthly.map((row, idx) => (
              <tr key={idx}>
                <td className="mono fw-700" style={{ color: 'var(--text-secondary)' }}>{row.month}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmtNum(row.avgOpen)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{fmtNum(row.avgClose)}</td>
                <td className="mono" style={{ textAlign: 'right' }}>±{fmtNum(row.avgRange)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div style={{ animation: 'fadeIn 0.4s ease' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Application Settings</h1>
          <p className="page-subtitle">Manage profile, preferences & notifications</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <User size={18} style={{ color: 'var(--accent-light)' }} />
            <span className="settings-card-title">User Profile</span>
          </div>
          {user ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '16px', background: 'var(--bg-overlay)', borderRadius: 12 }}>
                <div className="user-avatar" style={{ width: 48, height: 48, fontSize: '1rem' }}>{user.avatar}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem' }}>{user.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{user.email}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 3 }}>Last login: {user.lastLogin}</div>
                </div>
              </div>
              <button className="btn btn-danger" style={{ width: '100%' }} onClick={handleLogout}>Sign Out</button>
            </div>
          ) : (
            <div>
              <div className="auth-tabs">
                {['login', 'signup'].map(t => (
                  <button key={t} className={`auth-tab-btn ${authTab === t ? 'active' : ''}`} onClick={() => { setAuthTab(t); setAuthError(null); }}>
                    {t === 'login' ? 'Log In' : 'Sign Up'}
                  </button>
                ))}
              </div>
              <form onSubmit={authTab === 'login' ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {authTab === 'signup' && (
                  <div>
                    <label className="form-label">Full Name</label>
                    <input className="form-input" type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="John Doe" required />
                  </div>
                )}
                <div>
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="user@example.com" required />
                </div>
                <div>
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="••••••••" required />
                </div>
                {authError && <div style={{ color: 'var(--error)', fontSize: '0.75rem', padding: '8px 12px', background: 'var(--error-dim)', borderRadius: 8, border: '1px solid rgba(244,63,94,0.2)' }}>⚠ {authError}</div>}
                <button type="submit" className="btn btn-primary" disabled={authLoading} style={{ marginTop: 4 }}>
                  {authLoading ? 'Processing...' : authTab === 'login' ? 'Log In' : 'Create Account'}
                </button>
              </form>
              <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ padding: '0 8px' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div id="google-signin-btn" />
              </div>
            </div>
          )}
        </div>

        {/* Preferences */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Settings size={18} style={{ color: 'var(--accent-light)' }} />
            <span className="settings-card-title">General Preferences</span>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Visual Theme</div>
              <div className="setting-desc">Switch between dark and light mode</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {theme === 'dark' ? <><Sun size={14} /> Light</> : <><Moon size={14} /> Dark</>}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Default Symbol</div>
              <div className="setting-desc">Currently: {selectedSymbol}</div>
            </div>
            <select className="form-input form-select" style={{ width: 130 }} value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)}>
              {INDIA_SYMBOLS.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
            </select>
          </div>
        </div>

        {/* Alert config */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Bell size={18} style={{ color: 'var(--warning)' }} />
            <span className="settings-card-title">Market Alerts</span>
          </div>
          <div style={{ padding: '12px 0' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Configure point thresholds for milestone alerts (±200, ±300, ±500)
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Aggressive', 'Moderate', 'Conservative'].map(m => (
                <span key={m} className="badge badge-accent">{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Subscription */}
        <div className="card settings-card card-accent">
          <div className="settings-card-header">
            <CreditCard size={18} style={{ color: 'var(--accent-light)' }} />
            <span className="settings-card-title">Subscription</span>
          </div>
          <div style={{ padding: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span className="badge badge-accent">FREE TIER</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>3 symbols · 1 alert rule</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
              Upgrade to Pro for unlimited symbols, milestone chains, and Telegram alerts.
            </p>
            <button className="btn btn-primary btn-sm" style={{ width: '100%' }}>
              Upgrade to Pro — ₹499/mo <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── nav group renderer ─────────────────────────────────────────────────── */
  const renderSidebar = () => (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => setActiveTab('dashboard')}>
        <div className="sidebar-logo-icon">
          <TrendingUp size={16} />
        </div>
        <span className="sidebar-logo-text">TradeIQ</span>
        <span className="sidebar-logo-badge">STAP</span>
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {NAV_GROUPS.map(group => {
          const items = NAV.filter(n => n.group === group.id);
          return (
            <div key={group.id} className="sidebar-section">
              <div className="sidebar-section-label">{group.label}</div>
              {items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <item.icon size={15} className="nav-item-icon" />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && <span className="nav-item-badge">{item.badge}</span>}
                </button>
              ))}
            </div>
          );
        })}

        {/* Watchlist */}
        <div className="sidebar-watchlist">
          <div className="watchlist-header">
            <span className="watchlist-label">Watchlist</span>
            <button className="watchlist-add-btn"><Plus size={12} /></button>
          </div>
          <div className="watchlist-scroll">
            {watchlist.map(sym => {
              const stock = INDIA_SYMBOLS.find(s => s.symbol === sym) || { symbol: sym, name: sym };
              const initials = sym.replace(/[^A-Z]/g, '').slice(0, 2);
              return (
                <div
                  key={sym}
                  className={`watchlist-item ${selectedSymbol === sym ? 'active' : ''}`}
                  onClick={() => selectSymbol(sym)}
                >
                  <div className="wl-icon">{initials}</div>
                  <div className="wl-info">
                    <span className="wl-symbol">{sym}</span>
                    <span className="wl-name">{stock.name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="user-pill" onClick={() => setActiveTab('settings')}>
          <div className="user-avatar">{user ? user.avatar : <User size={14} />}</div>
          <div className="user-info-text">
            <span className="user-name">{user ? user.name : 'Guest'}</span>
            <span className="user-status">
              <div className="status-dot live" />
              Live Trading
            </span>
          </div>
          <Settings size={13} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
        </div>
      </div>
    </aside>
  );

  /* ─── MAIN RETURN ─────────────────────────────────────────────────────────── */
  return (
    <div className="app-root">
      {/* Ticker bar */}
      <MarketTickerBar symbol={selectedSymbol} livePrice={livePrice} />

      <div className="app-body">
        {renderSidebar()}

        <div className="main-area">
          {/* Live price banner */}
          <LivePriceBanner symbol={selectedSymbol} theme={theme} onPriceUpdate={setLivePrice} />

          {/* Top bar */}
          <header className="top-bar">
            <div className="search-wrapper" ref={searchRef}>
              <div className="search-input-row">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search symbols, indices…"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                />
              </div>
              {showSearch && searchQuery && (
                <div className="search-dropdown">
                  {filteredSymbols.length === 0
                    ? <div style={{ padding: '14px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No results</div>
                    : filteredSymbols.map(s => (
                      <div key={s.symbol} className="search-result" onClick={() => selectSymbol(s.symbol)}>
                        <span className="search-result-symbol">{s.symbol}</span>
                        <span className="search-result-name">{s.name}</span>
                        <span className="search-result-type">{s.type}</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            <div className="top-bar-actions">
              <div className={`market-status-pill ${livePrice.isMarketOpen ? 'open' : 'closed'}`}>
                <div className={`status-dot ${livePrice.isMarketOpen ? 'live' : 'offline'}`} />
                {livePrice.isMarketOpen ? 'Market Open' : 'Market Closed'}
              </div>
              <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="icon-btn">
                <Bell size={16} />
              </button>
              <button className="icon-btn" onClick={() => setActiveTab('settings')}>
                <Settings size={16} />
              </button>
            </div>
          </header>

          {/* Content */}
          <main className="content-area">
            {activeTab === 'dashboard'  && renderDashboard()}
            {activeTab === 'data'       && renderMarketData()}
            {activeTab === 'historical' && renderHistorical()}
            {activeTab === 'settings'   && renderSettings()}

            {activeTab === 'news' && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">Market Intelligence Feed</h1>
                    <p className="page-subtitle">Real-time sector news · Sentiment scored</p>
                  </div>
                </div>
                <NewsPanel isFullPage={true} />
              </div>
            )}

            {activeTab === 'signals' && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">Technical Signals</h1>
                    <p className="page-subtitle">RSI · MACD · Bollinger Bands · RVOL · EMA · ATR · VWAP · Score</p>
                  </div>
                </div>
                <div style={{ maxWidth: 720, margin: '0 auto' }}>
                  <IndicatorPanel symbol={selectedSymbol} theme={theme} />
                </div>
              </div>
            )}

            {activeTab === 'patterns' && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">Candlestick Patterns</h1>
                    <p className="page-subtitle">Doji · Hammer · Engulfing · Morning/Evening Star · Harami · More</p>
                  </div>
                </div>
                <div style={{ maxWidth: 720, margin: '0 auto' }}>
                  <PatternPanel symbol={selectedSymbol} theme={theme} />
                </div>
              </div>
            )}

            {activeTab === 'sentiment' && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">Sentiment Analysis</h1>
                    <p className="page-subtitle">FinBERT NLP · Reddit crowd · Unified sentiment score · {selectedSymbol}</p>
                  </div>
                </div>
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                  <SentimentPanel symbol={selectedSymbol} isFullPage={true} />
                </div>
              </div>
            )}

            {activeTab === 'alerts' && (
              <div style={{ animation: 'fadeIn 0.4s ease' }}>
                <div className="page-header">
                  <div>
                    <h1 className="page-title">Milestone Alerts</h1>
                    <p className="page-subtitle">Progressive alerts · Coaching messages · Stop-loss · Telegram</p>
                  </div>
                </div>
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                  <MilestoneAlerts symbol={selectedSymbol} theme={theme} />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* AI Chat FAB */}
      <button className="chat-fab" onClick={() => setIsChatOpen(o => !o)}>
        <Bot size={18} />
        Ask AI
      </button>

      {isChatOpen && (
        <AiChat
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          selectedSymbol={selectedSymbol}
          databricksData={{ summary: data.kpi, monthly: data.monthly, recent: data.daily.slice(-10), symbol: selectedSymbol }}
        />
      )}

      {notificationsEnabled && <ToastContainer />}
    </div>
  );
}
