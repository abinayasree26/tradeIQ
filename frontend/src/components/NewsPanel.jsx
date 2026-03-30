import React, { useState, useEffect } from 'react';
import { ExternalLink, Filter, TrendingUp, TrendingDown, Clock, Info } from 'lucide-react';
import { CONFIG } from '../config';

const NewsPanel = ({ isFullPage = false }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'bullish' | 'bearish'
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchNews = async () => {
    try {
      const res = await fetch(CONFIG.ENDPOINTS.NEWS);
      const data = await res.json();
      setNews(data.articles || []);
      setLastUpdated(data.fetchedAt);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching news:', err);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 600000); // 10 minutes
    return () => clearInterval(interval);
  }, []);

  const filteredNews = news.filter(item => filter === 'all' || item.sentiment === filter);

  const renderSkeleton = () => (
    <div className="news-skeleton">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-line full"></div>
          <div className="skeleton-line half"></div>
          <div className="skeleton-line half" style={{ width: '30%' }}></div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`news-panel ${isFullPage ? 'full-page' : ''}`}>
      <div className="news-header">
        <div className="header-top">
          <h3>Live Market News</h3>
          <span className="count">{news.length} articles</span>
        </div>
        <div className="filter-row">
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button className={`filter-btn ${filter === 'bullish' ? 'active' : ''}`} onClick={() => setFilter('bullish')}>
            <TrendingUp size={14} /> Bullish
          </button>
          <button className={`filter-btn ${filter === 'bearish' ? 'active' : ''}`} onClick={() => setFilter('bearish')}>
            <TrendingDown size={14} /> Bearish
          </button>
        </div>
      </div>

      <div className={`news-list ${isFullPage ? 'grid' : ''}`}>
        {loading ? renderSkeleton() : filteredNews.map((item, idx) => (
          <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="news-card glass-hover">
            <div className="news-card-header">
              <span className={`sentiment-tag ${item.sentiment}`}>{item.sentiment.toUpperCase()}</span>
              <span className="source-tag">{item.source}</span>
            </div>
            <h4 className="headline">
              {item.headline.length > 90 ? item.headline.substring(0, 90) + '...' : item.headline}
            </h4>
            <p className="news-summary" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: '0.5rem 0', lineHeight: '1.5' }}>
              {item.summary && item.summary.length > 100 ? item.summary.substring(0, 100) + '...' : item.summary}
            </p>
            <div className="news-meta">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} />
                <span className="time">{item.timeAgo}</span>
              </div>
              <ExternalLink size={12} className="card-arrow" />
            </div>
          </a>
        ))}
      </div>

      <div className="news-footer">
        <Info size={14} />
        <span>Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}</span>
      </div>
    </div>
  );
};

export default NewsPanel;
