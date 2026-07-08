/**
 * PatternPanel.jsx — Candlestick Pattern Recognition
 * Displays detected patterns with signal, strength, and coaching.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { CONFIG } from '../config';

const SIGNAL_COLOR = {
  bullish: 'var(--bullish)',
  bearish: 'var(--bearish)',
  neutral: 'var(--text-muted)',
};

const STRENGTH_LABEL = { strong: '⬆⬆ Strong', medium: '⬆ Medium', weak: '— Weak' };

/* Small SVG candlestick icon per pattern type */
function CandleIcon({ signal }) {
  const color = SIGNAL_COLOR[signal] || 'var(--text-muted)';
  if (signal === 'bullish') return (
    <svg width={24} height={32} viewBox="0 0 24 32">
      <line x1={12} y1={0} x2={12} y2={6}  stroke={color} strokeWidth={2} />
      <rect  x={6}  y={6}  width={12} height={18} fill={color} rx={2} />
      <line x1={12} y1={24} x2={12} y2={32} stroke={color} strokeWidth={2} />
    </svg>
  );
  if (signal === 'bearish') return (
    <svg width={24} height={32} viewBox="0 0 24 32">
      <line x1={12} y1={0} x2={12} y2={6}  stroke={color} strokeWidth={2} />
      <rect  x={6}  y={6}  width={12} height={18} fill="none" stroke={color} strokeWidth={2} rx={2} />
      <line x1={12} y1={24} x2={12} y2={32} stroke={color} strokeWidth={2} />
    </svg>
  );
  return (
    <svg width={24} height={32} viewBox="0 0 24 32">
      <line x1={12} y1={0} x2={12} y2={8}  stroke={color} strokeWidth={2} />
      <rect  x={4}  y={8}  width={16} height={16} fill="none" stroke={color} strokeWidth={2} rx={2} />
      <line x1={12} y1={24} x2={12} y2={32} stroke={color} strokeWidth={2} />
    </svg>
  );
}

function PatternCard({ pattern }) {
  const [expanded, setExpanded] = useState(false);
  const color = SIGNAL_COLOR[pattern.signal] || 'var(--text-muted)';

  return (
    <div className={`card pattern-card ${expanded ? '' : ''}`} style={{
      background: `${color}08`,
      border: `1px solid ${color}28`,
      padding: '14px 16px',
      marginBottom: 8,
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 0,
    }}>
      <div className="flex-between" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CandleIcon signal={pattern.signal} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{pattern.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <span className="badge" style={{ background: `${color}15`, color, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', gap: 4 }}>
                {pattern.signal === 'bullish' ? <TrendingUp size={10} /> : pattern.signal === 'bearish' ? <TrendingDown size={10} /> : <Minus size={10} />}
                {pattern.signal}
              </span>
              {pattern.strength && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {STRENGTH_LABEL[pattern.strength] || pattern.strength}
                </span>
              )}
            </div>
          </div>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${color}20` }}>
          {pattern.description && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 8 }}>
              {pattern.description}
            </div>
          )}
          {pattern.candles_involved != null && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Candles: {pattern.candles_involved}
            </div>
          )}
          {pattern.reliability != null && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>Reliability</div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pattern.reliability}%`, background: color }} />
              </div>
              <div style={{ fontSize: '0.65rem', color, marginTop: 3 }}>{pattern.reliability}%</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PatternPanel({ symbol, theme = 'dark' }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchPatterns = useCallback(async () => {
    if (!symbol) return;
    setLoading(true); setError(null);
    try {
      const res  = await fetch(CONFIG.STAP.PATTERNS(symbol));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { fetchPatterns(); }, [fetchPatterns]);

  const patterns   = data?.patterns_detected || data?.patterns || [];
  const bullish    = patterns.filter(p => p.signal === 'bullish');
  const bearish    = patterns.filter(p => p.signal === 'bearish');
  const neutral    = patterns.filter(p => p.signal === 'neutral' || !p.signal);
  const overallSig = data?.pattern_signal || (bullish.length > bearish.length ? 'bullish' : bearish.length > bullish.length ? 'bearish' : 'neutral');
  const overallColor = SIGNAL_COLOR[overallSig];

  if (loading) return (
    <div>
      <div className="flex-between" style={{ marginBottom: 14 }}>
        <div className="skel" style={{ width: 160, height: 20 }} />
        <div className="skel" style={{ width: 70, height: 30 }} />
      </div>
      {Array(4).fill(0).map((_, i) => <div key={i} className="skel skel-block" />)}
    </div>
  );

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <AlertTriangle size={28} style={{ color: 'var(--warning)', marginBottom: 12 }} />
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Patterns Unavailable</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14 }}>{error}</div>
      <button className="btn btn-ghost btn-sm" onClick={fetchPatterns}>Retry</button>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Pattern Recognition</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{symbol} · {patterns.length} pattern{patterns.length !== 1 ? 's' : ''} detected</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchPatterns} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary */}
      {patterns.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: overallColor }}>{patterns.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
          </div>
          <div className="price-banner-divider" />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--bullish)' }}>{bullish.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bullish</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--bearish)' }}>{bearish.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bearish</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-muted)' }}>{neutral.length}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Neutral</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className={`signal-badge signal-${overallSig === 'bullish' ? 'BUY' : overallSig === 'bearish' ? 'SELL' : 'NEUTRAL'}`} style={{ textTransform: 'capitalize' }}>
              {overallSig}
            </span>
          </div>
        </div>
      )}

      {/* Coaching */}
      {data?.coaching && (
        <div style={{ padding: '12px 16px', background: 'var(--accent-subtle)', border: '1px solid var(--border-accent)', borderRadius: 12, marginBottom: 16, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          💡 {data.coaching}
        </div>
      )}

      {/* No patterns */}
      {patterns.length === 0 && (
        <div className="no-data">No significant candlestick patterns detected for {symbol} today.</div>
      )}

      {/* Bullish section */}
      {bullish.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--bullish)', marginBottom: 8 }}>
            ▲ Bullish Patterns ({bullish.length})
          </div>
          {bullish.map((p, i) => <PatternCard key={i} pattern={p} />)}
        </div>
      )}

      {/* Bearish section */}
      {bearish.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--bearish)', marginBottom: 8 }}>
            ▼ Bearish Patterns ({bearish.length})
          </div>
          {bearish.map((p, i) => <PatternCard key={i} pattern={p} />)}
        </div>
      )}

      {/* Neutral section */}
      {neutral.length > 0 && (
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
            — Neutral Patterns ({neutral.length})
          </div>
          {neutral.map((p, i) => <PatternCard key={i} pattern={p} />)}
        </div>
      )}
    </div>
  );
}
