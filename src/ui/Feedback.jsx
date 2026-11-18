import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const FeedbackContext = createContext(null);

/** Notificaciones (solo se muestran tras el resultado real de la operación) y confirmaciones. */
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);

  const push = useCallback((type, message) => {
    const id = ++seq.current;
    setToasts(list => [...list, { id, type, message }]);
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  const toast = useRef({ success: m => push('success', m), error: m => push('error', m), info: m => push('info', m) }).current;

  const confirm = useCallback(options => new Promise(resolve => setDialog({ ...options, resolve })), []);
  const close = result => { dialog?.resolve(result); setDialog(null); };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => <div key={t.id} className={`toast-item ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>{t.message}</div>)}
      </div>
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('[data-cancel]')?.focus();
    const onKey = e => { if (e.key === 'Escape') onClose(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-shell">
      <button className="modal-backdrop" type="button" aria-label="Cancelar" onClick={() => onClose(false)} />
      <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" ref={ref}>
        <h2 id="confirm-title">{title}</h2>
        {message && <p id="confirm-message">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" data-cancel onClick={() => onClose(false)}>{cancelLabel}</button>
          <button type="button" className={`button ${danger ? 'button-danger' : 'button-primary'}`} onClick={() => onClose(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function useToast() { return useContext(FeedbackContext).toast; }
export function useConfirm() { return useContext(FeedbackContext).confirm; }

export function Loading({ label = 'Cargando…' }) {
  return <div className="loading-state" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{label}</div>;
}
export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <p>{error?.message || 'No se pudo cargar la información.'}</p>
      {onRetry && <button type="button" className="button button-ghost" onClick={onRetry}>Reintentar</button>}
    </div>
  );
}
export function EmptyState({ title, children }) {
  return <div className="empty-state"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}
