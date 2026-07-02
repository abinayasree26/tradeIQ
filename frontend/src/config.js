/**
 * STAP — Smart Technical Analysis Platform
 * Frontend Configuration
 */

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://localhost:3000';
const STAP_API  = import.meta.env.VITE_STAP_API  || 'http://localhost:8000';

export const CONFIG = {
  API_BASE_URL: PROXY_URL,
  STAP_API,

  // Legacy proxy endpoints
  ENDPOINTS: {
    DATAPROX:   `${PROXY_URL}/dataprox`,
    LIVE_PRICE: `${PROXY_URL}/live-price`,
    HISTORICAL: `${PROXY_URL}/historical`,
    NEWS:       `${PROXY_URL}/news`,
    AI_CHAT:    `${PROXY_URL}/ai-chat`,
  },

  // STAP Python backend endpoints
  STAP: {
    BASE:            STAP_API,
    SYMBOLS:         `${STAP_API}/india/symbols`,
    SESSION:         `${STAP_API}/india/session`,
    QUOTE:           (sym) => `${STAP_API}/india/quote/${sym}`,
    QUOTES:          `${STAP_API}/india/quotes`,
    OHLCV:           (sym, period='1y', interval='1d') =>
                       `${STAP_API}/india/ohlcv/${sym}?period=${period}&interval=${interval}`,
    INDICATORS:      (sym) => `${STAP_API}/indicators/${sym}`,
    SIGNAL:          (sym) => `${STAP_API}/indicators/${sym}/signal`,
    STOPLOSS:        (sym, entry, dir='long') =>
                       `${STAP_API}/indicators/${sym}/stoploss?entry_price=${entry}&direction=${dir}`,
    ALERT_RULES:     `${STAP_API}/alerts/rules`,
    ALERT_HISTORY:   `${STAP_API}/alerts/history`,
    ALERT_CHECK:     (sym) => `${STAP_API}/alerts/check/${sym}`,
    ALERT_FIRE:      (sym) => `${STAP_API}/alerts/fire/${sym}`,
    ALERT_TEMPLATES: `${STAP_API}/alerts/templates`,
    TG_TEST:         `${STAP_API}/alerts/telegram/test`,
    TG_CHATID:       `${STAP_API}/alerts/telegram/chat-id`,
    SENTIMENT:       (sym) => `${STAP_API}/sentiment/${sym}`,
    SENTIMENT_NEWS:  (sym) => `${STAP_API}/sentiment/${sym}/news`,
    SENTIMENT_REDDIT:(sym) => `${STAP_API}/sentiment/${sym}/reddit`,
    PATTERNS:        (sym) => `${STAP_API}/patterns/${sym}`,
    PATTERNS_HISTORY:(sym) => `${STAP_API}/patterns/${sym}/history`,

    // Phase 5: Auth + Billing + WebSocket
    AUTH_REGISTER:   `${STAP_API}/auth/register`,
    AUTH_LOGIN:      `${STAP_API}/auth/login`,
    AUTH_REFRESH:    `${STAP_API}/auth/refresh`,
    AUTH_ME:         `${STAP_API}/auth/me`,
    AUTH_SUBSCRIPTION: `${STAP_API}/auth/subscription`,
    BILLING_PLANS:   `${STAP_API}/billing/plans`,
    BILLING_CHECKOUT:`${STAP_API}/billing/checkout`,
    BILLING_CANCEL:  `${STAP_API}/billing/cancel`,
    WS_MARKET:       `${STAP_API.replace('http', 'ws')}/ws/market`,
    WS_STATUS:       `${STAP_API}/ws/status`,
  },
};

// India NSE symbols for the UI symbol picker
export const INDIA_SYMBOLS = [
  { symbol: 'NIFTY50',    name: 'Nifty 50',          type: 'index' },
  { symbol: 'BANKNIFTY',  name: 'Bank Nifty',         type: 'index' },
  { symbol: 'SENSEX',     name: 'BSE Sensex',          type: 'index' },
  { symbol: 'RELIANCE',   name: 'Reliance',            type: 'equity' },
  { symbol: 'TCS',        name: 'TCS',                 type: 'equity' },
  { symbol: 'HDFCBANK',   name: 'HDFC Bank',           type: 'equity' },
  { symbol: 'INFY',       name: 'Infosys',             type: 'equity' },
  { symbol: 'ICICIBANK',  name: 'ICICI Bank',          type: 'equity' },
  { symbol: 'SBIN',       name: 'State Bank of India', type: 'equity' },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance',       type: 'equity' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel',       type: 'equity' },
  { symbol: 'KOTAKBANK',  name: 'Kotak Bank',          type: 'equity' },
  { symbol: 'LT',         name: 'L&T',                 type: 'equity' },
  { symbol: 'AXISBANK',   name: 'Axis Bank',           type: 'equity' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors',         type: 'equity' },
  { symbol: 'MARUTI',     name: 'Maruti Suzuki',       type: 'equity' },
  { symbol: 'WIPRO',      name: 'Wipro',               type: 'equity' },
  { symbol: 'SUNPHARMA',  name: 'Sun Pharma',          type: 'equity' },
  { symbol: 'ITC',        name: 'ITC',                 type: 'equity' },
  { symbol: 'TITAN',      name: 'Titan',               type: 'equity' },
  { symbol: 'ADANIENT',   name: 'Adani Enterprises',   type: 'equity' },
  { symbol: 'NTPC',       name: 'NTPC',                type: 'equity' },
  { symbol: 'ONGC',       name: 'ONGC',                type: 'equity' },
  { symbol: 'HCLTECH',    name: 'HCL Tech',            type: 'equity' },
  { symbol: 'M&M',        name: 'Mahindra & Mahindra', type: 'equity' },
];
