import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const CandlestickChart = ({ data, containerId = 'tv-chart-container' }) => {
  const chartContainerRef = useRef();
  const [timeRange, setTimeRange] = useState('1Y');

  useEffect(() => {
    if (!chartContainerRef.current || !data || data.length === 0) return;

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current.clientWidth });
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0d0d0d' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 480,
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Calculate SMA
    const calculateSMA = (data, period) => {
      const sma = [];
      for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close;
        }
        sma.push({ time: data[i].time, value: sum / period });
      }
      return sma;
    };

    const sma20Series = chart.addLineSeries({ color: '#6366f1', lineWidth: 1, title: 'SMA 20' });
    const sma50Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'SMA 50' });

    const filterByRange = (items, range) => {
      if (range === '1Y') return items;
      const countMap = { '1M': 21, '3M': 63, '6M': 126 };
      return items.slice(-(countMap[range] || 252));
    };

    // Clean and cast data to numbers (SQL results often arrive as strings)
    const cleanedData = data.map(d => ({
      time: d.time,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume || 0)
    })).sort((a, b) => (a.time > b.time ? 1 : -1));

    const filteredData = filterByRange(cleanedData, timeRange);
    candlestickSeries.setData(filteredData);
    sma20Series.setData(calculateSMA(filteredData, 20));
    sma50Series.setData(calculateSMA(filteredData, 50));

    // Volume Histogram
    const volumeSeries = chart.addHistogramSeries({
      color: '#3b82f6',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // set as an overlay
    });
    
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    volumeSeries.setData(filteredData.map(d => ({
      time: d.time,
      value: d.volume || (Math.random() * 1000000), // Random if no volume data
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
    })));

    chart.timeScale().fitContent();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, timeRange]);

  return (
    <div className="chart-container-root glass">
      <div className="range-selector">
        {['1M', '3M', '6M', '1Y'].map(r => (
          <button 
            key={r} 
            className={`range-btn ${timeRange === r ? 'active' : ''}`}
            onClick={() => setTimeRange(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }} />
    </div>
  );
};

export default CandlestickChart;
