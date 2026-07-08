/**
 * NewsPanel.jsx — Market Intelligence Feed
 * Fetches from Finnhub via Node proxy, displays with sentiment badges.
 */
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, TrendingDown, Minus, Newspaper } from 'lucide-react';
import { CONFIG } from '../config';

const CATEGORIES = [
  { id: 'all',      label: 'All News' },
  { id: 'bullish',  label: '▲ Bullish' },
  { id: 'bearish',  label: '▼ Bearish' },
  { id: 'neutral',  label: '— Neutral' },
];

const sentColor = {
  bullish: 'var(--bullish)',
  bearish: 'var(--bearish)',
  neutral: 'var(--text-muted)',
};

const SentIcon = ({ s }) => {
  if (s === 'bullish') return <TrendingUp size={11} />;
  if (s === 'bearish') return <TrendingDown size={11} />;
  return <Minus size={11} />;
};

function timeAgo(ts) {
  const diff = (Date.now() / 1000) - ts;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function NewsPanel({ isFullPage = false }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState('all');

  const fetchNews = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(CONFIG.ENDPOINTS.NEWS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.articles || data.news || []);
      setArticles(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const displayed = filter === 'all'
    ? articles
    : articles.filter(a => {
        const s = (a.sentiment || a.category || '').toLowerCase();
        return s.includes(filter);
      });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="tab-bar" style={{ width: 'auto' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} className={`tab-btn ${filter === c.id ? 'active' : ''}`} onClick={() => setFilter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchNews} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--error)', marginBottom: 16 }}>
          <Newspaper size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>News Unavailable</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Ensure the Node proxy is running on port 3000
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={fetchNews}>Retry</button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="news-grid">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div className="skel" style={{ width: 60, height: 14 }} />
                <div className="skel" style={{ width: 80, height: 14, marginLeft: 'auto' }} />
              </div>
              <div className="skel skel-title" />
              <div className="skel skel-line" />
              <div className="skel skel-line" style={{ width: '75%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Articles */}
      {!loading && !error && (
        <>
          {displayed.length === 0 ? (
            <div className="no-data">No articles found for "{filter}"</div>
          ) : (
            <div className="news-grid">
              {displayed.map((a, i) => {
                const sent = (a.sentiment || a.category || 'neutral').toLowerCase().includes('bull') ? 'bullish'
                           : (a.sentiment || a.category || '').toLowerCase().includes('bear') ? 'bearish' : 'neutral';
                const color = sentColor[sent];
                const url = a.url || a.link || '#';

                return (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card news-card"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <div className="news-card-meta">
                      <span className="badge" style={{ background: `${color}15`, color, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <SentIcon s={sent} /> {sent}
                      </span>
                      <span className="news-source">{a.source || a.publisher || 'Market'}</span>
                      <span className="news-time">{a.datetime ? timeAgo(a.datetime) : (a.date || '')}</span>
                    </div>

                    <div className="news-headline">{a.headline || a.title || a.summary}</div>

                    {(a.summary || a.description) && (
                      <div className="news-summary">{a.summary || a.description}</div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, fontSize: '0.68rem', color: 'var(--accent-light)' }}>
                      <ExternalLink size={11} /> Read full article
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
