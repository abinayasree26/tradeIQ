/**
 * SentimentPanel.jsx — Unified Sentiment Analysis Dashboard
 * FinBERT NLP + Reddit PRAW + Candlestick patterns combined.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Newspaper,
  MessageCircle, RefreshCw, AlertTriangle, ChevronDown,
  ChevronUp, Sparkles
} from 'lucide-react';
import { CONFIG } from '../config';

const SENT_COLORS = {
  bullish:          '#10b981',
  slightly_bullish: '#34d399',
  neutral:          '#64748b',
  slightly_bearish: '#f59e0b',
  bearish:          '#f43f5e',
};

const sentColor = (label) => SENT_COLORS[label] || '#64748b';

function SentimentGauge({ score = 0, label = 'neutral' }) {
  const norm  = Math.min(Math.max((score + 100) / 200, 0), 1);
  const color = sentColor(label);
  const r     = 56;
  const arcLen = Math.PI * r;
  const dash   = norm * arcLen;

  return (
    <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
      <svg width={136} height={84} viewBox="0 0 136 84" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="sent-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#f43f5e" />
            <stop offset="40%"  stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* Track */}
        <path d={`M ${68 - r} 68 A ${r} ${r} 0 0 1 ${68 + r} 68`}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={12} strokeLinecap="round" />
        {/* Active arc */}
        <path d={`M ${68 - r} 68 A ${r} ${r} 0 0 1 ${68 + r} 68`}
          fill="none" stroke="url(#sent-grad)" strokeWidth={12} strokeLinecap="round"
          strokeDasharray={`${dash} ${arcLen}`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.16,1,0.3,1)' }}
        />
        {/* Tick labels */}
        <text x={68 - r - 4} y={80} fontSize={9} fill="#475569" textAnchor="middle">−100</text>
        <text x={68}          y={80} fontSize={9} fill="#475569" textAnchor="middle">0</text>
        <text x={68 + r + 4} y={80} fontSize={9} fill="#475569" textAnchor="middle">+100</text>
      </svg>

      <div style={{ marginTop: 4 }}>
        <span style={{ fontSize: '2.2rem', fontWeight: 900, fontFamily: 'JetBrains Mono', color }}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
        background: `${color}15`, color, padding: '4px 14px',
        borderRadius: 99, fontSize: '0.72rem', fontWeight: 800,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        border: `1px solid ${color}30`,
      }}>
        {label?.replace(/_/g, ' ')}
      </div>
    </div>
  );
}

function HeadlineItem({ h }) {
  const color = h.label === 'positive' ? '#10b981' : h.label === 'negative' ? '#f43f5e' : '#64748b';
  const Icon  = h.label === 'positive' ? TrendingUp : h.label === 'negative' ? TrendingDown : Minus;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', marginBottom: 6 }}>
      <Icon size={12} color={color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: '0.78rem', flex: 1 }}>{h.text?.slice(0, 90)}{h.text?.length > 90 ? '…' : ''}</span>
      <span style={{ fontSize: '0.62rem', fontWeight: 800, color, background: `${color}15`, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap' }}>
        {h.label} · {((h.score || 0) * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function DistBar({ positive = 0, neutral = 0, negative = 0 }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 7, borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
        <div style={{ width: `${positive}%`, background: '#10b981' }} />
        <div style={{ width: `${neutral}%`,  background: '#64748b' }} />
        <div style={{ width: `${negative}%`, background: '#f43f5e' }} />
      </div>
      <div className="flex-between" style={{ fontSize: '0.68rem' }}>
        <span style={{ color: '#10b981' }}>▲ {positive}% bullish</span>
        <span style={{ color: '#64748b' }}>— {neutral}% neutral</span>
        <span style={{ color: '#f43f5e' }}>▼ {negative}% bearish</span>
      </div>
    </div>
  );
}

export default function SentimentPanel({ symbol = 'RELIANCE', isFullPage = false }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showAll, setShowAll]     = useState(false);

  const fetchSentiment = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const url = `${CONFIG.STAP.SENTIMENT(symbol)}?include_reddit=true&include_patterns=true`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol]);

  useEffect(() => { fetchSentiment(); }, [fetchSentiment]);

  if (loading) return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60, flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <RefreshCw size={24} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Analyzing sentiment for {symbol}…</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>FinBERT model (first load may take ~30s)</div>
      </div>
    </div>
  );

  if (error) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <AlertTriangle size={28} style={{ color: 'var(--warning)', marginBottom: 12 }} />
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Sentiment Unavailable</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {error}<br />
        Install: <code style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 4 }}>pip install transformers praw torch</code>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={fetchSentiment}>Retry</button>
    </div>
  );

  if (!data) return null;

  const combined  = data.combined_score_with_patterns ?? data.combined_score ?? 0;
  const label     = data.combined_label || 'neutral';
  const news      = data.news_sentiment || {};
  const reddit    = data.reddit_sentiment || {};
  const patterns  = data.candlestick_patterns || {};
  const headlines = news.scored_headlines || [];
  const displayed = showAll ? headlines : headlines.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Combined gauge */}
      <div className="card-accent card" style={{ padding: 20 }}>
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
            <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>Unified Sentiment Score</span>
          </div>
          <button onClick={fetchSentiment} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6, display: 'flex' }}>
            <RefreshCw size={13} />
          </button>
        </div>

        <SentimentGauge score={combined} label={label} />

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
          {[
            { label: 'News', score: news.overall_score ?? 0, lbl: news.overall_label },
            { label: 'Reddit', score: reddit.overall_score ?? 0, lbl: reddit.overall_label },
            { label: 'Patterns', score: patterns.pattern_score ?? 0, lbl: patterns.pattern_signal },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'JetBrains Mono', color: sentColor(s.lbl) }}>
                {s.score > 0 ? '+' : ''}{s.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* News sentiment */}
      {headlines.length > 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Newspaper size={16} style={{ color: 'var(--accent-light)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>News Sentiment ({news.count || 0} articles)</span>
          </div>
          <DistBar positive={news.positive_pct || 0} neutral={news.neutral_pct || 0} negative={news.negative_pct || 0} />
          <div style={{ marginTop: 14 }}>
            {displayed.map((h, i) => <HeadlineItem key={i} h={h} />)}
          </div>
          {headlines.length > 5 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {showAll ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Show all {headlines.length}</>}
            </button>
          )}
        </div>
      )}

      {/* Reddit */}
      {(reddit.count > 0 || reddit.error) && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MessageCircle size={16} style={{ color: '#ff4500' }} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Reddit Crowd ({reddit.count || 0} posts)</span>
          </div>
          {reddit.error ? (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{reddit.error}</div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: 14, background: 'var(--bg-overlay)', borderRadius: 10 }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, fontFamily: 'JetBrains Mono', color: sentColor(reddit.overall_label) }}>
                    {reddit.overall_score > 0 ? '+' : ''}{reddit.overall_score}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{reddit.overall_label?.replace(/_/g, ' ')}</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, fontSize: '0.75rem' }}>
                  <div style={{ color: '#10b981' }}>▲ {reddit.positive_pct}% bullish</div>
                  <div style={{ color: '#64748b' }}>— {reddit.neutral_pct}% neutral</div>
                  <div style={{ color: '#f43f5e' }}>▼ {reddit.negative_pct}% bearish</div>
                </div>
              </div>
              <DistBar positive={reddit.positive_pct || 0} neutral={reddit.neutral_pct || 0} negative={reddit.negative_pct || 0} />
            </>
          )}
        </div>
      )}

      {/* Candlestick patterns */}
      {(patterns.patterns_detected || []).length > 0 && (
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} style={{ color: 'var(--accent-light)' }} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>Patterns ({(patterns.patterns_detected || []).length})</span>
            {patterns.pattern_signal && (
              <span className={`badge badge-${patterns.pattern_signal === 'bullish' ? 'bullish' : patterns.pattern_signal === 'bearish' ? 'bearish' : 'neutral'}`} style={{ marginLeft: 'auto' }}>
                {patterns.pattern_signal}
              </span>
            )}
          </div>
          {(patterns.patterns_detected || []).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-overlay)', marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: sentColor(p.signal), boxShadow: `0 0 6px ${sentColor(p.signal)}60` }} />
              <span style={{ fontWeight: 600, fontSize: '0.8rem', flex: 1 }}>{p.name}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: sentColor(p.signal), textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.signal}</span>
            </div>
          ))}
          {patterns.coaching && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--accent-subtle)', border: '1px solid var(--border-accent)', borderRadius: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              💡 {patterns.coaching}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
