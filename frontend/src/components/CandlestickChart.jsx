/**
 * CandlestickChart.jsx — TradingView Lightweight Charts candlestick
 */
import { useEffect, useRef, useState } from 'react';

let lwc = null;

export default function CandlestickChart({ data = [], theme = 'dark' }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const candleRef    = useRef(null);
  const volumeRef    = useRef(null);
  const [ready, setReady]     = useState(false);
  const [tooltip, setTooltip] = useState(null);

  const isLight = theme === 'light';

  const COLORS = {
    bg:         isLight ? '#ffffff' : '#0d0d12',
    grid:       isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)',
    text:       isLight ? '#334155' : '#64748b',
    up:         '#10b981',
    down:       '#f43f5e',
    upWick:     '#10b981',
    downWick:   '#f43f5e',
    border:     isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)',
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!lwc) {
        const mod = await import('lightweight-charts');
        lwc = mod;
      }
      if (cancelled || !containerRef.current) return;
      setReady(true);
    };

    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !data?.length) return;

    // Cleanup previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const h = containerRef.current.clientHeight || 440;

    const chart = lwc.createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: h,
      layout: {
        background: { color: COLORS.bg },
        textColor:  COLORS.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: 'rgba(99,102,241,0.4)', labelBackgroundColor: '#6366f1' },
        horzLine: { color: 'rgba(99,102,241,0.4)', labelBackgroundColor: '#6366f1' },
      },
      rightPriceScale: { borderColor: COLORS.border, scaleMargins: { top: 0.08, bottom: 0.25 } },
      timeScale: { borderColor: COLORS.border, timeVisible: true },
      watermark: { visible: false },
    });

    chartRef.current = chart;

    // Candle series
    const candleSeries = chart.addCandlestickSeries({
      upColor:          COLORS.up,
      downColor:        COLORS.down,
      borderUpColor:    COLORS.up,
      borderDownColor:  COLORS.down,
      wickUpColor:      COLORS.upWick,
      wickDownColor:    COLORS.downWick,
    });
    candleRef.current = candleSeries;

    // Volume series
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(99,102,241,0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeRef.current = volumeSeries;

    // Parse + set data
    const candles = data
      .filter(d => d.open && d.high && d.low && d.close)
      .map(d => {
        const t = typeof d.time === 'number' ? d.time : (new Date(d.time).getTime() / 1000);
        return {
          time:  t,
          open:  parseFloat(d.open),
          high:  parseFloat(d.high),
          low:   parseFloat(d.low),
          close: parseFloat(d.close),
        };
      })
      .sort((a, b) => a.time - b.time);

    if (candles.length === 0) return;

    candleSeries.setData(candles);

    volumeSeries.setData(
      candles.map(c => ({
        time:  c.time,
        value: c.volume ?? (Math.abs(c.close - c.open) * 100000),
        color: c.close >= c.open ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)',
      }))
    );

    chart.timeScale().fitContent();

    // Crosshair tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) { setTooltip(null); return; }
      const cd = param.seriesData.get(candleSeries);
      if (!cd) { setTooltip(null); return; }
      const date = new Date(param.time * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const chg  = ((cd.close - cd.open) / cd.open * 100).toFixed(2);
      setTooltip({ date, ...cd, chg });
    });

    // Responsive resize
    const observer = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, theme]);

  const fmt = (n) => n?.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return (
    <div style={{ position: 'relative', minHeight: 440 }}>
      <div ref={containerRef} style={{ width: '100%', height: 440 }} />

      {/* Custom tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', top: 12, left: 16, zIndex: 5,
          background: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(13,13,18,0.95)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 10, padding: '10px 14px', backdropFilter: 'blur(8px)',
          fontSize: '0.78rem', lineHeight: 1.6,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontWeight: 700, color: isLight ? '#1e293b' : '#94a3b8', marginBottom: 4, fontSize: '0.7rem' }}>{tooltip.date}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
            <span style={{ color: 'var(--text-muted)' }}>O</span><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{fmt(tooltip.open)}</span>
            <span style={{ color: '#10b981' }}>H</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#10b981' }}>₹{fmt(tooltip.high)}</span>
            <span style={{ color: '#f43f5e' }}>L</span><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f43f5e' }}>₹{fmt(tooltip.low)}</span>
            <span style={{ color: 'var(--text-muted)' }}>C</span><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>₹{fmt(tooltip.close)}</span>
            <span style={{ color: 'var(--text-muted)' }}>Chg</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: Number(tooltip.chg) >= 0 ? '#10b981' : '#f43f5e' }}>
              {Number(tooltip.chg) >= 0 ? '+' : ''}{tooltip.chg}%
            </span>
          </div>
        </div>
      )}

      {!data?.length && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '0.85rem' }}>No chart data available</div>
        </div>
      )}
    </div>
  );
}
