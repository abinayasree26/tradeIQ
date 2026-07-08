/**
 * IndicatorPanel.jsx — Technical Indicator Dashboard
 * Tabbed: Momentum | Trend | Volatility | Volume
 */
import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, Minus,
  Activity, BarChart3, Zap, Target, Droplets
} from 'lucide-react';
import { CONFIG } from '../config';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const fmtN = (n, dp = 2) =>
  n == null ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: dp });

const bullish  = 'var(--bullish)';
const bearish  = 'var(--bearish)';
const neutral  = 'var(--text-muted)';
const accent   = 'var(--accent-light)';

/* ─── Signal config ───────────────────────────────────────────────────────── */
const SIG = {
  STRONG_BUY:  { label: '⬆⬆ Strong Buy',  cls: 'signal-STRONG_BUY'  },
  BUY:         { label: '⬆ Buy',          cls: 'signal-BUY'          },
  NEUTRAL:     { label: '— Neutral',       cls: 'signal-NEUTRAL'      },
  SELL:        { label: '⬇ Sell',          cls: 'signal-SELL'         },
  STRONG_SELL: { label: '⬇⬇ Strong Sell', cls: 'signal-STRONG_SELL'  },
};

/* ─── Sub-components ──────────────────────────────────────────────────────── */
function IndRow({ label, value, sub, color, tooltip }) {
  return (
    <div className="ind-row" title={tooltip}>
      <span className="ind-row-label">{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span className="ind-row-val" style={{ color: color || 'var(--text-primary)' }}>
          {value ?? '—'}
        </span>
        {sub && <div className="ind-row-sub">{sub}</div>}
      </div>
    </div>
  );
}

function GaugeBar({ value, min = 0, max = 100, colorFn, label }) {
  const pct = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);
  const color = colorFn ? colorFn(value) : accent;
  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 900, fontFamily: 'JetBrains Mono', color }}>{fmtN(value, 1)}</span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}50` }} />
      </div>
      <div className="flex-between" style={{ marginTop: 4, fontSize: '0.62rem', color: 'var(--text-muted)' }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

function ScoreArc({ score }) {
  // SVG arc gauge -100 to +100
  const norm   = Math.min(Math.max((score + 100) / 200, 0), 1);
  const color  = score > 20 ? '#10b981' : score < -20 ? '#f43f5e' : '#f59e0b';
  const r      = 54;
  const cx     = 64;
  const cy     = 64;
  const arcLen = Math.PI * r;
  const dash   = norm * arcLen;

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <svg width={128} height={80} viewBox="0 0 128 80" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#f43f5e" />
            <stop offset="50%"  stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" strokeLinecap="round" />
        {/* Active */}
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="url(#arc-grad)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
        />
        {/* Labels */}
        <text x={cx - r - 2} y={cy + 18} fontSize="9" fill="#64748b" textAnchor="middle">-100</text>
        <text x={cx + r + 2} y={cy + 18} fontSize="9" fill="#64748b" textAnchor="middle">+100</text>
      </svg>
      <div style={{ marginTop: -12 }}>
        <span style={{ fontSize: '2rem', fontWeight: 900, fontFamily: 'JetBrains Mono', color }}>
          {score > 0 ? '+' : ''}{score}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: 4 }}>/ 100</span>
      </div>
    </div>
  );
}

/* ─── Tab content ─────────────────────────────────────────────────────────── */
function MomentumTab({ ind }) {
  return (
    <div className="ind-section">
      <div className="ind-card">
        <div className="ind-card-header"><Activity size={14} color="#10b981" /><span className="ind-card-title">RSI 14</span></div>
        <GaugeBar value={ind.rsi_14} min={0} max={100}
          colorFn={v => v < 30 ? bullish : v > 70 ? bearish : neutral}
          label={ind.rsi_14 < 30 ? 'Oversold' : ind.rsi_14 > 70 ? 'Overbought' : 'Neutral'} />
        <IndRow label="Zone" value={ind.rsi_14 < 30 ? 'Oversold (<30)' : ind.rsi_14 > 70 ? 'Overbought (>70)' : 'Neutral (30–70)'}
          color={ind.rsi_14 < 30 ? bullish : ind.rsi_14 > 70 ? bearish : neutral} />
      </div>

      <div className="ind-card">
        <div className="ind-card-header"><Activity size={14} color="#ffe082" /><span className="ind-card-title">Stochastic Oscillator</span></div>
        <IndRow label="%K" value={fmtN(ind.stoch_k, 1)}
          color={ind.stoch_k < 20 ? bullish : ind.stoch_k > 80 ? bearish : neutral}
          sub={ind.stoch_k < 20 ? 'Oversold' : ind.stoch_k > 80 ? 'Overbought' : ''} />
        <IndRow label="%D" value={fmtN(ind.stoch_d, 1)} />
        <IndRow label="Williams %R" value={fmtN(ind.williams_r, 1)}
          color={ind.williams_r > -20 ? bearish : ind.williams_r < -80 ? bullish : neutral}
          tooltip=">-20 = overbought, <-80 = oversold" />
      </div>

      <div className="ind-card">
        <div className="ind-card-header"><TrendingUp size={14} color={ind.macd_hist >= 0 ? '#10b981' : '#f43f5e'} /><span className="ind-card-title">MACD (12,26,9)</span></div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MACD</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#90caf9' }}>{fmtN(ind.macd)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signal</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ffcc02' }}>{fmtN(ind.macd_signal)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histogram</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: ind.macd_hist >= 0 ? bullish : bearish }}>{fmtN(ind.macd_hist)}</div>
          </div>
        </div>
        {ind.macd != null && ind.macd_signal != null && (
          <span className={`badge ${ind.macd > ind.macd_signal ? 'badge-bullish' : 'badge-bearish'}`}>
            {ind.macd > ind.macd_signal ? '▲ Bullish cross' : '▼ Bearish cross'}
          </span>
        )}
      </div>
    </div>
  );
}

function TrendTab({ ind }) {
  return (
    <div className="ind-section">
      <div className="ind-card">
        <div className="ind-card-header"><TrendingUp size={14} color="#80cbc4" /><span className="ind-card-title">Exponential Moving Averages</span></div>
        {[9, 21, 50, 200].map(p => {
          const val   = ind[`ema_${p}`];
          const above = ind.close && val && ind.close > val;
          const color = above ? bullish : bearish;
          return (
            <IndRow key={p}
              label={`EMA ${p}`}
              value={val != null ? `₹${fmtN(val)}` : null}
              color={color}
              sub={ind.close && val ? (above ? '↑ Price above' : '↓ Price below') : ''}
            />
          );
        })}
      </div>

      <div className="ind-card">
        <div className="ind-card-header"><Activity size={14} color="#ce93d8" /><span className="ind-card-title">ADX — Trend Strength</span></div>
        <GaugeBar value={ind.adx} min={0} max={60}
          colorFn={v => v > 25 ? bullish : v > 15 ? '#f59e0b' : neutral}
          label={ind.adx > 25 ? 'Strong trend' : ind.adx > 15 ? 'Moderate' : 'Ranging'} />
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
          ADX &gt; 25 = trending market · &lt; 20 = sideways / ranging
        </div>
      </div>
    </div>
  );
}

function VolatilityTab({ ind, pivots }) {
  if (!ind.bb_upper && !ind.atr_14) {
    return <div className="no-data">Volatility data not available yet</div>;
  }
  const range = ind.bb_upper - ind.bb_lower;
  const pos   = range > 0 ? ((ind.close - ind.bb_lower) / range) * 100 : 50;
  const zone  = pos < 15 ? 'Near lower band' : pos > 85 ? 'Near upper band' : 'Mid-band';

  return (
    <div className="ind-section">
      <div className="ind-card">
        <div className="ind-card-header"><BarChart3 size={14} color="#ce93d8" /><span className="ind-card-title">Bollinger Bands (20, 2)</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 8 }}>
          <span style={{ color: bullish }}>Lower ₹{fmtN(ind.bb_lower)}</span>
          <span style={{ color: neutral }}>Mid ₹{fmtN(ind.bb_mid)}</span>
          <span style={{ color: bearish }}>Upper ₹{fmtN(ind.bb_upper)}</span>
        </div>
        <div className="progress-track" style={{ position: 'relative', marginBottom: 6 }}>
          <div style={{
            position: 'absolute', left: `${Math.min(Math.max(pos, 1), 99)}%`,
            width: 10, height: 10, borderRadius: '50%',
            background: pos < 15 ? bullish : pos > 85 ? bearish : accent,
            top: -2.5, transform: 'translateX(-50%)',
            boxShadow: `0 0 8px ${pos < 15 ? 'var(--bullish)' : pos > 85 ? 'var(--bearish)' : 'var(--accent)'}`,
            transition: 'left 0.4s',
            zIndex: 1,
          }} />
        </div>
        <div style={{ fontSize: '0.72rem', color: pos < 15 ? bullish : pos > 85 ? bearish : neutral }}>{zone} · {pos.toFixed(0)}% position</div>
        <IndRow label="BB Width (squeeze)" value={fmtN(ind.bb_width, 4)}
          sub={ind.bb_width < 0.05 ? '⚡ Squeeze — breakout imminent' : ''} />
      </div>

      <div className="ind-card">
        <div className="ind-card-header"><Target size={14} color="#f48fb1" /><span className="ind-card-title">ATR & Pivot Points</span></div>
        <IndRow label="ATR 14" value={`₹${fmtN(ind.atr_14)}`} tooltip="Average True Range — typical daily move. Use for stop-loss sizing." />
        {pivots && <>
          <IndRow label="Pivot" value={`₹${pivots.pivot}`} />
          <IndRow label="R1"    value={`₹${pivots.r1}`}    color={bearish} />
          <IndRow label="R2"    value={`₹${pivots.r2}`}    color={bearish} />
          <IndRow label="S1"    value={`₹${pivots.s1}`}    color={bullish} />
          <IndRow label="S2"    value={`₹${pivots.s2}`}    color={bullish} />
        </>}
      </div>
    </div>
  );
}

function VolumeTab({ ind }) {
  return (
    <div className="ind-section">
      <div className="ind-card">
        <div className="ind-card-header"><BarChart3 size={14} color="#ffb74d" /><span className="ind-card-title">Relative Volume (RVOL)</span></div>
        <GaugeBar value={Math.min(ind.rvol ?? 0, 3)} min={0} max={3}
          colorFn={v => v > 1.5 ? bullish : v < 0.5 ? bearish : neutral}
          label={`${fmtN(ind.rvol)}× avg`} />
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
          &gt;1.5× = above-average conviction · &lt;0.5× = quiet session
        </div>
      </div>

      <div className="ind-card">
        <div className="ind-card-header"><Droplets size={14} color="#38bdf8" /><span className="ind-card-title">Volume Details</span></div>
        <IndRow label="Current Volume"   value={fmtN(ind.current_volume, 0)} />
        <IndRow label="Avg Volume (20d)" value={fmtN(ind.avg_volume_20, 0)} />
        <IndRow label="VWAP" value={ind.vwap != null ? `₹${fmtN(ind.vwap)}` : null}
          color={ind.close && ind.vwap ? (ind.close > ind.vwap ? bullish : bearish) : neutral}
          tooltip="Volume-Weighted Avg Price. Above VWAP = bullish today." />
        <IndRow label="CMF (Chaikin)" value={fmtN(ind.cmf, 3)}
          color={ind.cmf > 0 ? bullish : bearish}
          tooltip=">0 = buying pressure, <0 = selling pressure" />
        <IndRow label="OBV" value={fmtN(ind.obv, 0)} />
      </div>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'momentum',   label: 'Momentum'   },
  { id: 'trend',      label: 'Trend'      },
  { id: 'volatility', label: 'Volatility' },
  { id: 'volume',     label: 'Volume'     },
];

export default function IndicatorPanel({ symbol, theme = 'dark' }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [tab, setTab]         = useState('momentum');

  const fetchData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(CONFIG.STAP.INDICATORS(symbol));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(new Date().toLocaleTimeString('en-IN'));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const ind    = data?.indicators || {};
  const pivots = data?.pivots;
  const sig    = ind.signal_label || 'NEUTRAL';
  const cfg    = SIG[sig] || SIG.NEUTRAL;

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Indicator Dashboard</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {symbol} · {lastFetch ? `Updated ${lastFetch}` : 'Loading...'}
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="btn btn-ghost btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'var(--error-dim)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, color: 'var(--error)', fontSize: '0.78rem' }}>
          ⚠ Backend not reachable ({error}). Ensure Python backend is running on port 8000.
        </div>
      )}

      {/* Overall signal */}
      <div className="ind-card" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div className="ind-card-header" style={{ justifyContent: 'center' }}>
          <Zap size={14} color="#ffcc02" /><span className="ind-card-title">Overall Signal</span>
        </div>
        <ScoreArc score={ind.composite_score ?? 0} />
        <div style={{ marginTop: 10 }}>
          <span className={`signal-badge ${cfg.cls}`}>{cfg.label}</span>
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 8 }}>
          Composite of RSI · MACD · EMA · Bollinger Bands · Volume
        </div>
      </div>

      {/* Tab switcher */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading && !data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array(3).fill(0).map((_, i) => <div key={i} className="skel skel-block" />)}
        </div>
      )}

      {data && (
        <>
          {tab === 'momentum'   && <MomentumTab   ind={ind} />}
          {tab === 'trend'      && <TrendTab       ind={ind} />}
          {tab === 'volatility' && <VolatilityTab  ind={ind} pivots={pivots} />}
          {tab === 'volume'     && <VolumeTab      ind={ind} />}
        </>
      )}
    </div>
  );
}
