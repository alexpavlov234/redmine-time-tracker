import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Toast.module.scss';

// ---------- Types ----------
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  title?: string;
}

interface ToastContextProps {
  showToast: (message: string, type?: ToastType, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

// ---------- Duration per type ----------
const DURATIONS: Record<ToastType, number> = {
  success: 4000,
  error: 7000,
  warning: 5000,
  info: 4000,
};

// ---------- Provider ----------
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
    const id = ++counterRef.current;
    setToasts(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => removeToast(id), DURATIONS[type]);
  }, [removeToast]);

  const showSuccess = useCallback((msg: string, title?: string) => showToast(msg, 'success', title), [showToast]);
  const showError = useCallback((msg: string, title?: string) => showToast(msg, 'error', title), [showToast]);
  const showWarning = useCallback((msg: string, title?: string) => showToast(msg, 'warning', title), [showToast]);
  const showInfo = useCallback((msg: string, title?: string) => showToast(msg, 'info', title), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      {createPortal(
        <div className={styles.container}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`${styles.toast} ${styles[toast.type]}`}
              onClick={() => removeToast(toast.id)}
              role="alert"
            >
              <div className={styles.icon}>{ICONS[toast.type]}</div>
              <div className={styles.content}>
                {toast.title && <strong className={styles.title}>{toast.title}</strong>}
                <span className={styles.message}>{toast.message}</span>
              </div>
              <button className={styles.closeBtn} aria-label="Dismiss">&times;</button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
