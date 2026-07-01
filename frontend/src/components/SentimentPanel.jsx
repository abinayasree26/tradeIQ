/**
 * SentimentPanel.jsx — STAP Phase 4
 * 
 * Displays unified sentiment analysis for a symbol:
 *  - Combined sentiment score gauge (-100 to +100)
 *  - News FinBERT breakdown
 *  - Reddit crowd sentiment
 *  - Candlestick patterns detected
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Newspaper,
  MessageCircle, CandlestickChart as CandleIcon, RefreshCw,
  AlertTriangle, ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';
import { CONFIG } from '../config';

const SENTIMENT_COLORS = {
  bullish: '#10b981',
  slightly_bullish: '#34d399',
  neutral: '#6b7280',
  slightly_bearish: '#f59e0b',
  bearish: '#ef4444',
};

const SENTIMENT_ICONS = {
  bullish: <TrendingUp size={16} />,
  slightly_bullish: <TrendingUp size={16} />,
  neutral: <Minus size={16} />,
  slightly_bearish: <TrendingDown size={16} />,
  bearish: <TrendingDown size={16} />,
};

function SentimentGauge({ score, label }) {
  // Normalize -100..+100 to 0..100 for gauge display
  const normalized = (score + 100) / 2;
  const rotation = (normalized / 100) * 180 - 90;
  const color = SENTIMENT_COLORS[label] || SENTIMENT_COLORS.neutral;

  return (
    <div className="sentiment-gauge" style={{ textAlign: 'center', padding: '1.5rem' }}>
      <div style={{ position: 'relative', width: '180px', height: '100px', margin: '0 auto', overflow: 'hidden' }}>
        {/* Background arc */}
        <div style={{
          width: '180px', height: '180px', borderRadius: '50%',
          border: '12px solid var(--border-subtle)',
          borderBottomColor: 'transparent', borderLeftColor: 'transparent',
          transform: 'rotate(225deg)', position: 'absolute', top: 0
        }} />
        {/* Active arc */}
        <div style={{
          width: '180px', height: '180px', borderRadius: '50%',
          border: '12px solid transparent',
          borderTopColor: color, borderRightColor: color,
          transform: `rotate(${225 + normalized * 1.8}deg)`,
          position: 'absolute', top: 0,
          transition: 'transform 0.8s ease-out',
        }} />
        {/* Needle */}
        <div style={{
          position: 'absolute', bottom: '0', left: '50%',
          width: '3px', height: '70px', background: color,
          transformOrigin: 'bottom center',
          transform: `translateX(-50%) rotate(${rotation}deg)`,
          borderRadius: '2px', transition: 'transform 0.8s ease-out',
          boxShadow: `0 0 8px ${color}60`
        }} />
      </div>
      <div style={{ marginTop: '1rem' }}>
        <span style={{ fontSize: '2rem', fontWeight: 900, color }}>{score > 0 ? '+' : ''}{score}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginLeft: '6px' }}>/ 100</span>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        background: `${color}15`, color, padding: '4px 12px',
        borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800,
        textTransform: 'uppercase', marginTop: '8px'
      }}>
        {SENTIMENT_ICONS[label]} {label?.replace('_', ' ')}
      </div>
    </div>
  );
}

function HeadlineItem({ headline }) {
  const color = headline.label === 'positive' ? '#10b981'
    : headline.label === 'negative' ? '#ef4444' : '#6b7280';

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: '10px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      marginBottom: '6px'
    }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-main)', flex: 1, marginRight: '12px' }}>
        {headline.text?.slice(0, 80)}{headline.text?.length > 80 ? '...' : ''}
      </span>
      <span style={{
        fontSize: '0.65rem', fontWeight: 800, color,
        background: `${color}15`, padding: '3px 8px', borderRadius: '6px',
        whiteSpace: 'nowrap'
      }}>
        {headline.label} ({(headline.score * 100).toFixed(0)}%)
      </span>
    </div>
  );
}

function PatternCard({ pattern }) {
  const color = pattern.signal === 'bullish' ? '#10b981'
    : pattern.signal === 'bearish' ? '#ef4444' : '#6b7280';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px', borderRadius: '12px',
      background: `${color}08`, border: `1px solid ${color}30`,
      marginBottom: '8px'
    }}>
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: color, boxShadow: `0 0 6px ${color}60`
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>
          {pattern.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
          {pattern.signal} · strength: {pattern.strength || 'medium'}
        </div>
      </div>
      <span style={{
        fontSize: '0.6rem', fontWeight: 900, color,
        textTransform: 'uppercase', letterSpacing: '0.05em'
      }}>
        {pattern.signal}
      </span>
    </div>
  );
}

export default function SentimentPanel({ symbol = 'RELIANCE', isFullPage = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAllHeadlines, setShowAllHeadlines] = useState(false);

  const fetchSentiment = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = CONFIG.STAP?.SENTIMENT?.(symbol) || `http://localhost:8000/sentiment/${symbol}`;
      const res = await fetch(`${url}?include_reddit=true&include_patterns=true`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Sentiment fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
  }, [symbol]);

  if (loading) {
    return (
      <div className="glass" style={{ padding: '2rem', borderRadius: '20px', textAlign: 'center' }}>
        <RefreshCw size={24} className="spin" style={{ color: 'var(--accent)', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Analyzing sentiment for {symbol}...</p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.7rem', marginTop: '4px' }}>
          FinBERT model processing (first load may take 30s)
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass" style={{ padding: '2rem', borderRadius: '20px', textAlign: 'center' }}>
        <AlertTriangle size={24} style={{ color: 'var(--warning)', marginBottom: '1rem' }} />
        <p style={{ color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 700 }}>Sentiment Unavailable</p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>
        <button onClick={fetchSentiment} style={{
          marginTop: '1rem', padding: '8px 16px', background: 'var(--accent)',
          color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.75rem',
          fontWeight: 700, cursor: 'pointer'
        }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const combinedScore = data.combined_score_with_patterns ?? data.combined_score ?? 0;
  const combinedLabel = data.combined_label || 'neutral';
  const newsResult = data.news_sentiment || {};
  const redditResult = data.reddit_sentiment || {};
  const patterns = data.candlestick_patterns || {};
  const headlines = newsResult.scored_headlines || [];
  const patternsDetected = patterns.patterns_detected || [];
  const displayHeadlines = showAllHeadlines ? headlines : headlines.slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Combined Sentiment Score */}
      <div className="glass" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0 }}>Unified Sentiment</h3>
          </div>
          <button onClick={fetchSentiment} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)',
            padding: '4px', borderRadius: '6px'
          }}>
            <RefreshCw size={14} />
          </button>
        </div>
        <SentimentGauge score={combinedScore} label={combinedLabel} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>News</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: SENTIMENT_COLORS[newsResult.overall_label] || '#6b7280' }}>
              {newsResult.overall_score > 0 ? '+' : ''}{newsResult.overall_score || 0}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Reddit</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: SENTIMENT_COLORS[redditResult.overall_label] || '#6b7280' }}>
              {redditResult.overall_score > 0 ? '+' : ''}{redditResult.overall_score || 0}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Patterns</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: SENTIMENT_COLORS[patterns.pattern_signal] || '#6b7280' }}>
              {patterns.pattern_score > 0 ? '+' : ''}{patterns.pattern_score || 0}
            </div>
          </div>
        </div>
      </div>

      {/* News Headlines */}
      {headlines.length > 0 && (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <Newspaper size={16} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>
              News Sentiment ({newsResult.count || 0} articles)
            </h3>
          </div>

          {/* Sentiment distribution bar */}
          <div style={{ display: 'flex', height: '6px', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ width: `${newsResult.positive_pct || 0}%`, background: '#10b981' }} />
            <div style={{ width: `${newsResult.neutral_pct || 0}%`, background: '#6b7280' }} />
            <div style={{ width: `${newsResult.negative_pct || 0}%`, background: '#ef4444' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            <span style={{ color: '#10b981' }}>▲ {newsResult.positive_pct || 0}% positive</span>
            <span style={{ color: '#ef4444' }}>▼ {newsResult.negative_pct || 0}% negative</span>
          </div>

          {displayHeadlines.map((h, i) => <HeadlineItem key={i} headline={h} />)}

          {headlines.length > 5 && (
            <button onClick={() => setShowAllHeadlines(!showAllHeadlines)} style={{
              width: '100%', padding: '8px', background: 'none', border: '1px solid var(--border-subtle)',
              borderRadius: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 700,
              cursor: 'pointer', marginTop: '8px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px'
            }}>
              {showAllHeadlines ? <><ChevronUp size={14} /> Show less</> : <><ChevronDown size={14} /> Show all {headlines.length}</>}
            </button>
          )}
        </div>
      )}

      {/* Reddit Sentiment */}
      {(redditResult.count > 0 || redditResult.error) && (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <MessageCircle size={16} style={{ color: '#ff4500' }} />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>
              Reddit Crowd ({redditResult.count || 0} posts)
            </h3>
          </div>
          {redditResult.error ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{redditResult.error}</p>
          ) : (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1, textAlign: 'center', padding: '1rem', background: 'var(--bg-surface)', borderRadius: '12px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: SENTIMENT_COLORS[redditResult.overall_label] }}>
                  {redditResult.overall_score > 0 ? '+' : ''}{redditResult.overall_score}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>{redditResult.overall_label?.replace('_', ' ')}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', fontSize: '0.75rem' }}>
                <div style={{ color: '#10b981' }}>▲ {redditResult.positive_pct}% bullish</div>
                <div style={{ color: '#6b7280' }}>— {redditResult.neutral_pct}% neutral</div>
                <div style={{ color: '#ef4444' }}>▼ {redditResult.negative_pct}% bearish</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Candlestick Patterns */}
      {patternsDetected.length > 0 && (
        <div className="glass" style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
            <CandleIcon size={16} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>
              Candlestick Patterns ({patternsDetected.length})
            </h3>
          </div>
          {patternsDetected.map((p, i) => <PatternCard key={i} pattern={p} />)}
          {patterns.coaching && (
            <div style={{
              marginTop: '12px', padding: '12px 16px', borderRadius: '10px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.5
            }}>
              💡 {patterns.coaching}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
