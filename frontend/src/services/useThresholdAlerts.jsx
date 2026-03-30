import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

/**
 * Toast Component
 */
const Toast = ({ id, message, type, onClose }) => (
  <div className={`toast-card glass ${type}`} onMouseEnter={() => {}}>
    <div className="toast-icon">
      {type === 'positive' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
    </div>
    <div className="toast-content">
      <span>{message}</span>
    </div>
    <button className="toast-close" onClick={() => onClose(id)}>
      <X size={14} />
    </button>
  </div>
);

/**
 * Custom Hook for Monitoring Price Thresholds
 */
export const useThresholdAlerts = (currentPrice, previousClose, thresholds = [200, 300, 500]) => {
  const [toasts, setToasts] = useState([]);
  const activeThresholds = useRef(new Set()); // Store currently crossed thresholds
  
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((msg, type) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [{ id, message: msg, type }, ...prev].slice(0, 3));
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  useEffect(() => {
    if (!currentPrice || !previousClose) return;

    const diff = currentPrice - previousClose;
    const absDiff = Math.abs(diff);

    thresholds.forEach(t => {
      const thresholdId = diff >= 0 ? `up-${t}` : `down-${t}`;
      
      // Check if price crosses threshold
      if (absDiff >= t && !activeThresholds.current.has(thresholdId)) {
        activeThresholds.current.add(thresholdId);
        const direction = diff >= 0 ? '+' : '-';
        addToast(
          `Nifty crossed ${direction}${t} pts · Now at ${currentPrice.toLocaleString('en-IN')}`,
          diff >= 0 ? 'positive' : 'negative'
        );
      }
      
      // Reset threshold only after price moves back 50pts
      if (absDiff < (t - 50) && activeThresholds.current.has(thresholdId)) {
        activeThresholds.current.delete(thresholdId);
      }
    });
  }, [currentPrice, previousClose, thresholds, addToast]);

  const ToastContainer = () => (
    <div className="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} {...t} onClose={removeToast} />
      ))}
    </div>
  );

  return { ToastContainer };
};
