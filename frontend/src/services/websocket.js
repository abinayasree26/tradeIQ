/**
 * STAP Phase 5 — WebSocket Client
 *
 * Auto-reconnecting WebSocket client for real-time market data.
 * Subscribes to symbols and emits events for price updates and alerts.
 */

import { CONFIG } from '../config';
import { getAccessToken } from './auth';

class MarketWebSocket {
  constructor() {
    this.ws = null;
    this.listeners = new Map(); // event -> Set<callback>
    this.subscribedSymbols = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000; // Start at 1s, exponential backoff
    this.isConnected = false;
    this.shouldReconnect = true;
  }

  /**
   * Connect to WebSocket server.
   * Automatically includes auth token if available.
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const wsBase = CONFIG.STAP_API.replace('http', 'ws');
    const token = getAccessToken();
    const url = token
      ? `${wsBase}/ws/market?token=${token}`
      : `${wsBase}/ws/market`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WS] Connected to market feed');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this._emit('connected', {});

        // Re-subscribe to previously subscribed symbols
        if (this.subscribedSymbols.size > 0) {
          this._send({
            action: 'subscribe',
            symbols: Array.from(this.subscribedSymbols),
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn('[WS] Invalid message:', event.data);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this._emit('error', error);
      };

      this.ws.onclose = (event) => {
        console.log(`[WS] Disconnected (code: ${event.code})`);
        this.isConnected = false;
        this._emit('disconnected', { code: event.code, reason: event.reason });

        // Auto-reconnect with exponential backoff
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (e) {
      console.error('[WS] Connection error:', e);
    }
  }

  /**
   * Disconnect and stop reconnection.
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Subscribe to real-time updates for symbols.
   */
  subscribe(symbols) {
    const symArray = Array.isArray(symbols) ? symbols : [symbols];
    symArray.forEach(s => this.subscribedSymbols.add(s.toUpperCase()));

    if (this.isConnected) {
      this._send({ action: 'subscribe', symbols: symArray });
    }
  }

  /**
   * Unsubscribe from symbols.
   */
  unsubscribe(symbols) {
    const symArray = Array.isArray(symbols) ? symbols : [symbols];
    symArray.forEach(s => this.subscribedSymbols.delete(s.toUpperCase()));

    if (this.isConnected) {
      this._send({ action: 'unsubscribe', symbols: symArray });
    }
  }

  /**
   * Register event listener.
   * Events: 'quote', 'alert', 'subscribed', 'error', 'connected', 'disconnected'
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback); // Return unsubscribe function
  }

  /**
   * Remove event listener.
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Send ping to keep connection alive.
   */
  ping() {
    this._send({ action: 'ping' });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  _send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'quote':
        this._emit('quote', msg);
        break;
      case 'alert':
        this._emit('alert', msg);
        break;
      case 'subscribed':
        this._emit('subscribed', msg);
        break;
      case 'unsubscribed':
        this._emit('unsubscribed', msg);
        break;
      case 'pong':
        this._emit('pong', msg);
        break;
      case 'error':
        this._emit('error', msg);
        console.warn('[WS] Server error:', msg.message);
        break;
      default:
        this._emit(msg.type, msg);
    }
  }

  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try { cb(data); } catch (e) { console.error(`[WS] Listener error:`, e); }
      });
    }
  }
}

// Singleton instance
export const marketWS = new MarketWebSocket();

/**
 * React hook for WebSocket quotes.
 * Usage: const { quotes, isConnected } = useMarketStream(['RELIANCE.NS', 'TCS.NS']);
 */
export function useMarketStream(symbols = []) {
  // This is a simplified version — in real React, you'd use useState/useEffect
  // The actual hook is in useMarketStream.js
  return { marketWS, symbols };
}
