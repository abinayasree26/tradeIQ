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
  const isInitialMount = useRef(true);
  
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

    // Filter thresholds that are crossed but not yet active
    const newlyCrossed = thresholds
      .filter(t => absDiff >= t)
      .map(t => ({ t, id: diff >= 0 ? `up-${t}` : `down-${t}` }))
      .filter(item => !activeThresholds.current.has(item.id));

    // 1. Initial Mount: Populate activeThresholds without showing toasts
    if (isInitialMount.current) {
      newlyCrossed.forEach(item => activeThresholds.current.add(item.id));
      isInitialMount.current = false;
      return;
    }

    // 2. Regular Update: Only show the HIGHEST threshold newly crossed
    if (newlyCrossed.length > 0) {
      // Sort by threshold value descending
      newlyCrossed.sort((a, b) => b.t - a.t);
      const top = newlyCrossed[0];
      
      // Mark all crossed thresholds as active to avoid duplicate firing later
      newlyCrossed.forEach(item => activeThresholds.current.add(item.id));

      const direction = diff >= 0 ? '+' : '-';
      addToast(
        `Nifty crossed ${direction}${top.t} pts · Now at ${currentPrice.toLocaleString('en-IN')}`,
        diff >= 0 ? 'positive' : 'negative'
      );
    }
    
    // 3. Reset thresholds only after price moves back 50pts
    thresholds.forEach(t => {
      const upId = `up-${t}`;
      const downId = `down-${t}`;
      if (absDiff < (t - 50)) {
        activeThresholds.current.delete(upId);
        activeThresholds.current.delete(downId);
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
