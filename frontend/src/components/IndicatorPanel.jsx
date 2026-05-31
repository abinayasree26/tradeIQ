import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity, BarChart3, Zap, Target } from 'lucide-react';
import { CONFIG } from '../config';

// ── Signal badge ────────────────────────────────────────────────────────────
const SIGNAL_CONFIG = {
  STRONG_BUY:  { color: '#00c853', bg: 'rgba(0,200,83,0.15)',  label: '⬆⬆ Strong Buy',  icon: TrendingUp },
  BUY:         { color: '#69f0ae', bg: 'rgba(105,240,174,0.12)', label: '⬆ Buy',         icon: TrendingUp },
  NEUTRAL:     { color: '#90a4ae', bg: 'rgba(144,164,174,0.10)', label: '— Neutral',      icon: Minus },
  SELL:        { color: '#ff5252', bg: 'rgba(255,82,82,0.12)',  label: '⬇ Sell',         icon: TrendingDown },
  STRONG_SELL: { color: '#d50000', bg: 'rgba(213,0,0,0.15)',   label: '⬇⬇ Strong Sell', icon: TrendingDown },
};

function SignalBadge({ label, score }) {
  const cfg = SIGNAL_CONFIG[label] || SIGNAL_CONFIG.NEUTRAL;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 14px', borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.color}40`,
      color: cfg.color, fontWeight: 700, fontSize: 14,
    }}>
      {cfg.label}
      {score !== undefined && (
        <span style={{ fontSize: 11, opacity: 0.8 }}>({score > 0 ? '+' : ''}{score})</span>
      )}
    </div>
  );
}

// ── RSI gauge ───────────────────────────────────────────────────────────────
function RsiGauge({ value }) {
  if (value == null) return <span style={{ color: '#666' }}>—</span>;
  const color = value < 30 ? '#69f0ae' : value > 70 ? '#ff5252' : '#90a4ae';
  const zone  = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral';
  const pct   = Math.min(Math.max(value, 0), 100);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color, fontWeight: 600, fontSize: 18 }}>{value.toFixed(1)}</span>
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>{zone}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#666', marginTop: 2 }}>
        <span>Oversold (&lt;30)</span><span>Overbought (&gt;70)</span>
      </div>
    </div>
  );
}

// ── Indicator row ────────────────────────────────────────────────────────────
function IndRow({ label, value, sub, color, tooltip }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
    }} title={tooltip}>
      <span style={{ fontSize: 12, color: '#90a4ae' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontWeight: 600, color: color || '#e0e0e0', fontSize: 13 }}>
          {value != null ? (typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : value) : '—'}
        </span>
        {sub && <div style={{ fontSize: 10, color: '#666' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── MACD mini chart ─────────────────────────────────────────────────────────
function MacdBar({ macd, signal, hist }) {
  if (hist == null) return <span style={{ color: '#666' }}>—</span>;
  const histColor = hist >= 0 ? '#69f0ae' : '#ff5252';
  const cross = macd != null && signal != null
    ? (macd > signal ? 'Bullish cross' : 'Bearish cross')
    : '';
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 4, fontSize: 12 }}>
        <span>MACD <b style={{ color: '#90caf9' }}>{macd?.toFixed(2) ?? '—'}</b></span>
        <span>Sig <b style={{ color: '#ffcc02' }}>{signal?.toFixed(2) ?? '—'}</b></span>
        <span>Hist <b style={{ color: histColor }}>{hist?.toFixed(2)}</b></span>
      </div>
      {cross && <div style={{ fontSize: 10, color: histColor }}>{cross}</div>}
    </div>
  );
}

// ── Bollinger position ────────────────────────────────────────────────────────
function BbPosition({ upper, mid, lower, close }) {
  if (!upper || !lower || !close) return <span style={{ color: '#666' }}>—</span>;
  const range = upper - lower;
  const pos   = range > 0 ? ((close - lower) / range) * 100 : 50;
  const zone  = pos < 15 ? 'Near lower band' : pos > 85 ? 'Near upper band' : 'Mid-band';
  const color = pos < 15 ? '#69f0ae' : pos > 85 ? '#ff5252' : '#90a4ae';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: '#69f0ae' }}>₹{lower?.toFixed(2)}</span>
        <span style={{ color }}>Price {pos.toFixed(0)}%</span>
        <span style={{ color: '#ff5252' }}>₹{upper?.toFixed(2)}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, position: 'relative' }}>
        <div style={{
          position: 'absolute', left: `${Math.min(Math.max(pos, 1), 99)}%`,
          width: 8, height: 8, borderRadius: '50%',
          background: color, top: -1, transform: 'translateX(-50%)',
          transition: 'left 0.4s',
        }} />
      </div>
      <div style={{ fontSize: 10, color, marginTop: 4 }}>{zone}</div>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────
export default function IndicatorPanel({ symbol }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetch = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch(CONFIG.STAP.INDICATORS(symbol));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(new Date().toLocaleTimeString('en-IN'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => { fetch(); }, [fetch]);

  const ind = data?.indicators || {};
  const sig = ind.signal_label || 'NEUTRAL';

  const card = (title, icon, children) => (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)', padding: '16px 18px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {icon}
        <span style={{ fontWeight: 600, fontSize: 13, color: '#b0bec5' }}>{title}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Indicator Dashboard</h3>
          <span style={{ fontSize: 11, color: '#666' }}>{symbol} · {lastFetch ? `Updated ${lastFetch}` : 'Loading...'}</span>
        </div>
        <button
          onClick={fetch}
          disabled={loading}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#e0e0e0',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid #ff525240', borderRadius: 8, padding: 12, marginBottom: 14, color: '#ff5252', fontSize: 12 }}>
          ⚠ Backend not reachable ({error}). Start the Python backend on port 8000.
        </div>
      )}

      {/* Overall Signal */}
      {card('Overall Signal', <Zap size={15} color="#ffcc02" />,
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <SignalBadge label={sig} score={ind.composite_score} />
          <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
            Composite of RSI · MACD · EMA · BB · Volume
          </div>
        </div>
      )}

      {/* RSI */}
      {card('Momentum · RSI 14', <Activity size={15} color="#69f0ae" />,
        <RsiGauge value={ind.rsi_14} />
      )}

      {/* MACD */}
      {card('Trend · MACD (12,26,9)', <TrendingUp size={15} color="#90caf9" />,
        <MacdBar macd={ind.macd} signal={ind.macd_signal} hist={ind.macd_hist} />
      )}

      {/* Bollinger Bands */}
      {card('Volatility · Bollinger Bands (20,2)', <BarChart3 size={15} color="#ce93d8" />,
        <BbPosition upper={ind.bb_upper} mid={ind.bb_mid} lower={ind.bb_lower} close={ind.close} />
      )}

      {/* Volume */}
      {card('Volume Analysis', <BarChart3 size={15} color="#ffb74d" />, <>
        <IndRow label="RVOL (vs 20-day avg)"
          value={ind.rvol != null ? `${ind.rvol.toFixed(2)}×` : null}
          color={ind.rvol > 1.5 ? '#69f0ae' : ind.rvol < 0.5 ? '#ff5252' : '#e0e0e0'}
          tooltip="Relative Volume: >1.5 = unusually active, <0.5 = quiet"
        />
        <IndRow label="Current Volume"  value={ind.current_volume}  />
        <IndRow label="Avg Volume (20d)" value={ind.avg_volume_20}  />
        <IndRow label="VWAP"            value={ind.vwap != null ? `₹${ind.vwap?.toFixed(2)}` : null}
          color={ind.close && ind.vwap ? (ind.close > ind.vwap ? '#69f0ae' : '#ff5252') : '#e0e0e0'}
          tooltip="Volume-Weighted Average Price. Price above VWAP = bullish today."
        />
        <IndRow label="CMF"             value={ind.cmf?.toFixed(3)}
          color={ind.cmf > 0 ? '#69f0ae' : '#ff5252'}
          tooltip="Chaikin Money Flow. >0 = buying pressure, <0 = selling pressure."
        />
        <IndRow label="OBV"             value={ind.obv}             />
      </>)}

      {/* EMAs */}
      {card('Trend · EMAs', <TrendingUp size={15} color="#80cbc4" />, <>
        {[9, 21, 50, 200].map(p => {
          const val = ind[`ema_${p}`];
          const color = ind.close && val
            ? (ind.close > val ? '#69f0ae' : '#ff5252')
            : '#e0e0e0';
          return (
            <IndRow key={p} label={`EMA ${p}`}
              value={val != null ? `₹${val.toFixed(2)}` : null}
              color={color}
              sub={ind.close && val ? (ind.close > val ? 'Price above ↑' : 'Price below ↓') : ''}
            />
          );
        })}
        <IndRow label="ADX (14)" value={ind.adx?.toFixed(1)}
          color={ind.adx > 25 ? '#69f0ae' : '#90a4ae'}
          sub={ind.adx ? (ind.adx > 25 ? 'Strong trend' : 'Weak trend') : ''}
          tooltip="ADX > 25 = trending market. < 20 = ranging/sideways."
        />
      </>)}

      {/* ATR & Pivots */}
      {card('Volatility & Pivots', <Target size={15} color="#f48fb1" />, <>
        <IndRow label="ATR 14" value={ind.atr_14 != null ? `₹${ind.atr_14?.toFixed(2)}` : null}
          tooltip="Average True Range: typical daily move size. Use for stop-loss sizing."
        />
        {data?.pivots && <>
          <IndRow label="Pivot" value={`₹${data.pivots.pivot}`} />
          <IndRow label="R1"    value={`₹${data.pivots.r1}`}    color="#ff5252" />
          <IndRow label="R2"    value={`₹${data.pivots.r2}`}    color="#ff5252" />
          <IndRow label="S1"    value={`₹${data.pivots.s1}`}    color="#69f0ae" />
          <IndRow label="S2"    value={`₹${data.pivots.s2}`}    color="#69f0ae" />
        </>}
      </>)}

      {/* Stochastic */}
      {card('Momentum · Stochastic', <Activity size={15} color="#ffe082" />, <>
        <IndRow label="Stoch %K" value={ind.stoch_k?.toFixed(1)}
          color={ind.stoch_k < 20 ? '#69f0ae' : ind.stoch_k > 80 ? '#ff5252' : '#e0e0e0'}
        />
        <IndRow label="Stoch %D" value={ind.stoch_d?.toFixed(1)} />
        <IndRow label="Williams %R" value={ind.williams_r?.toFixed(1)}
          color={ind.williams_r > -20 ? '#ff5252' : ind.williams_r < -80 ? '#69f0ae' : '#e0e0e0'}
          tooltip=">-20 = overbought, <-80 = oversold"
        />
      </>)}
    </div>
  );
}
