/**
 * TradeIQ Frontend Configuration
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const CONFIG = {
  API_BASE_URL,
  ENDPOINTS: {
    DATAPROX: `${API_BASE_URL}/dataprox`,
    LIVE_PRICE: `${API_BASE_URL}/live-price`,
    HISTORICAL: `${API_BASE_URL}/historical`,
    NEWS: `${API_BASE_URL}/news`,
    AI_CHAT: `${API_BASE_URL}/ai-chat`,
  }
};
