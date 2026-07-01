/**
 * STAP Phase 5 — useMarketStream React Hook
 *
 * Connects to WebSocket and streams real-time quotes for given symbols.
 *
 * Usage:
 *   const { quotes, alerts, isConnected, error } = useMarketStream(['RELIANCE.NS', 'TCS.NS']);
 *   // quotes = { 'RELIANCE.NS': { price, change, ... }, ... }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { marketWS } from './websocket';

export function useMarketStream(symbols = []) {
  const [quotes, setQuotes] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const prevSymbolsRef = useRef([]);

  // Connect on mount
  useEffect(() => {
    marketWS.connect();

    const unsubConnected = marketWS.on('connected', () => {
      setIsConnected(true);
      setError(null);
    });

    const unsubDisconnected = marketWS.on('disconnected', () => {
      setIsConnected(false);
    });

    const unsubError = marketWS.on('error', (err) => {
      setError(err.message || 'WebSocket error');
    });

    const unsubQuote = marketWS.on('quote', (msg) => {
      setQuotes(prev => ({
        ...prev,
        [msg.symbol]: {
          ...msg.data,
          lastUpdate: msg.timestamp,
        },
      }));
    });

    const unsubAlert = marketWS.on('alert', (msg) => {
      setAlerts(prev => [msg, ...prev].slice(0, 50)); // Keep last 50 alerts
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubError();
      unsubQuote();
      unsubAlert();
    };
  }, []);

  // Subscribe/unsubscribe when symbols change
  useEffect(() => {
    const prev = prevSymbolsRef.current;
    const curr = symbols;

    // Unsubscribe removed symbols
    const removed = prev.filter(s => !curr.includes(s));
    if (removed.length > 0) {
      marketWS.unsubscribe(removed);
    }

    // Subscribe new symbols
    const added = curr.filter(s => !prev.includes(s));
    if (added.length > 0) {
      marketWS.subscribe(added);
    }

    prevSymbolsRef.current = curr;
  }, [symbols]);

  // Keep-alive ping every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      if (isConnected) {
        marketWS.ping();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  return {
    quotes,
    alerts,
    isConnected,
    error,
    clearAlerts,
  };
}

export default useMarketStream;
