import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Activity, Target, Zap, Clock, Sparkles } from 'lucide-react';
import { CONFIG } from '../config';

// ── Signal badge ────────────────────────────────────────────────────────────
const SIGNAL_CONFIG = {
  bullish:  { color: '#69f0ae', bg: 'rgba(105,240,174,0.12)', label: '🟢 Bullish Reversal' },
  bearish:  { color: '#ff5252', bg: 'rgba(255,82,82,0.12)',  label: '🔴 Bearish Reversal' },
  neutral:  { color: '#90a4ae', bg: 'rgba(144,164,174,0.10)', label: '⚪ Neutral / Indecision' },
};

function PatternSignalBadge({ label, score }) {
  const cfg = SIGNAL_CONFIG[label] || SIGNAL_CONFIG.neutral;
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

// ── Single Pattern Row ───────────────────────────────────────────────────────
function PatternItem({ pattern }) {
  const isBullish = pattern.signal === 'bullish';
  const isBearish = pattern.signal === 'bearish';
  const color = isBullish ? '#69f0ae' : isBearish ? '#ff5252' : '#90a4ae';
  
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(255,255,255,0.02)',
      borderRadius: 8,
      borderLeft: `4px solid ${color}`,
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#e0e0e0' }}>{pattern.name}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.05)',
          color: color
        }}>{pattern.strength?.replace('_', ' ')}</span>
      </div>
      <div style={{ fontSize: 12, color: '#b0bec5', marginBottom: 4 }}>
        <strong>Meaning:</strong> {pattern.meaning}
      </div>
      <div style={{ fontSize: 12, color: '#90a4ae' }}>
        <strong>Coaching Recommendation:</strong> <span style={{ color: '#ffcc02' }}>{pattern.action}</span>
      </div>
    </div>
  );
}

export default function PatternPanel({ symbol }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchPatterns = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch current patterns
      const res = await window.fetch(CONFIG.STAP.PATTERNS(symbol));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(new Date().toLocaleTimeString('en-IN'));

      // 2. Fetch pattern history
      const historyRes = await window.fetch(CONFIG.STAP.PATTERNS_HISTORY(symbol));
      if (historyRes.ok) {
        const historyJson = await historyRes.json();
        setHistory(historyJson);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  const patterns = data?.patterns_detected || [];
  const overallSignal = data?.pattern_signal || 'neutral';
  const overallScore = data?.pattern_score || 0;

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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Candlestick Pattern Dashboard</h3>
          <span style={{ fontSize: 11, color: '#666' }}>{symbol} · {lastFetch ? `Updated ${lastFetch}` : 'Loading...'}</span>
        </div>
        <button
          onClick={fetchPatterns}
          disabled={loading}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: '#e0e0e0',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          {loading ? 'Analyzing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(255,82,82,0.1)', border: '1px solid #ff525240', borderRadius: 8, padding: 12, marginBottom: 14, color: '#ff5252', fontSize: 12 }}>
          ⚠ Backend not reachable ({error}). Start the Python backend on port 8000.
        </div>
      )}

      {/* Overall Signal */}
      {card('Overall Pattern Direction', <Zap size={15} color="#ffcc02" />,
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <PatternSignalBadge label={overallSignal} score={overallScore} />
          <div style={{ fontSize: 11, color: '#666', marginTop: 8 }}>
            Combined score of detected candlestick patterns (Bullish = +20, Bearish = -20)
          </div>
        </div>
      )}

      {/* Detected Patterns List */}
      {card('Detected Patterns', <Sparkles size={15} color="#69f0ae" />,
        patterns.length > 0 ? (
          <div>
            {patterns.map((p, idx) => (
              <PatternItem key={idx} pattern={p} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#666', fontSize: 13 }}>
             No distinct candlestick patterns detected in recent candles.
          </div>
        )
      )}

      {/* Coach Interpretation */}
      {data?.coaching && card('Pattern Coaching Insight', <Activity size={15} color="#ce93d8" />,
        <div style={{
          background: 'rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: '12px 14px',
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#e0e0e0',
          whiteSpace: 'pre-wrap',
          lineHeight: '1.6'
        }}>
          {data.coaching}
        </div>
      )}

      {/* Pattern History */}
      {card('Detection History', <Clock size={15} color="#ffb74d" />,
        history.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#90a4ae', textAlign: 'left' }}>
                  <th style={{ padding: '8px 4px' }}>Time</th>
                  <th style={{ padding: '8px 4px' }}>Signal</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right' }}>Score</th>
                  <th style={{ padding: '8px 4px' }}>Detected Patterns</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => {
                  const sigColor = h.pattern_signal === 'bullish' ? '#69f0ae' : h.pattern_signal === 'bearish' ? '#ff5252' : '#90a4ae';
                  const timestampStr = h.timestamp 
                    ? new Date(h.timestamp).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' })
                    : '—';
                  const pats = h.patterns_detected || [];
                  
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 4px', color: '#666' }}>{timestampStr}</td>
                      <td style={{ padding: '8px 4px', color: sigColor, fontWeight: 600 }}>{h.pattern_signal?.toUpperCase()}</td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 600 }}>{h.pattern_score > 0 ? '+' : ''}{h.pattern_score}</td>
                      <td style={{ padding: '8px 4px', color: '#b0bec5' }}>
                        {pats.length > 0 ? pats.map(p => p.name).join(', ') : 'None'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#666', fontSize: 13 }}>
            No history recorded yet for {symbol}. Try clicking refresh above.
          </div>
        )
      )}
    </div>
  );
}
