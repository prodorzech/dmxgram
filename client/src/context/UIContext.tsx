import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './UIContext.css';

/* ─── Toast ──────────────────────────────────────────────────────────────── */
export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

/* ─── Confirm ────────────────────────────────────────────────────────────── */
interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
}

/* ─── Context shape ──────────────────────────────────────────────────────── */
interface UIContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string) => Promise<boolean>;
}

const UIContext = createContext<UIContextValue | null>(null);

/* ─── Provider ───────────────────────────────────────────────────────────── */
let _id = 0;

export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>({
    open: false,
    message: '',
    resolve: null,
  });
  const timerRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  /* toast */
  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, message, type }]);
    timerRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timerRef.current[id];
    }, 3500);
  }, []);

  const dismissToast = (id: number) => {
    clearTimeout(timerRef.current[id]);
    delete timerRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  /* confirm */
  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmState({ open: true, message, resolve });
    });
  }, []);

  const handleConfirmAnswer = (answer: boolean) => {
    confirmState.resolve?.(answer);
    setConfirmState({ open: false, message: '', resolve: null });
  };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}

      {/* ── Toasts ────────────────────────────────────────────── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismissToast(t.id)}>
            <span className="toast-icon">{icons[t.type]}</span>
            <span className="toast-message">{t.message}</span>
            <button className="toast-close" onClick={e => { e.stopPropagation(); dismissToast(t.id); }}>×</button>
          </div>
        ))}
      </div>

      {/* ── Confirm dialog ────────────────────────────────────── */}
      {confirmState.open && (
        <div className="confirm-overlay" onClick={() => handleConfirmAnswer(false)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <p className="confirm-message">{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn confirm-btn-cancel" onClick={() => handleConfirmAnswer(false)}>
                {t('dialog.cancel')}
              </button>
              <button className="confirm-btn confirm-btn-ok" onClick={() => handleConfirmAnswer(true)}>
                {t('dialog.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
};

/* ─── Hook ───────────────────────────────────────────────────────────────── */
export const useUI = (): UIContextValue => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
};

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const icons: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};
