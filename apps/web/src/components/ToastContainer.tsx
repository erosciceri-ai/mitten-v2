import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContextValue {
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast = { ...toast, id };
    setToasts(prev => [...prev, newToast]);

    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const getIcon = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success': return CheckCircle2;
      case 'error': return CircleAlert;
      case 'warning': return TriangleAlert;
      case 'info': return Info;
    }
  };

  const getClasses = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success': return 'bg-success-light border-success text-success';
      case 'error': return 'bg-error-light border-error text-error';
      case 'warning': return 'bg-warning-light border-warning text-warning';
      case 'info': return 'bg-primary-light border-signal/40 text-[#b9f8fb]';
    }
  };

  return (
    <div className="pointer-events-none fixed top-20 right-4 left-4 z-50 flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        const Icon = getIcon(toast.type);
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-slide-in ${getClasses(toast.type)}`}
            role="alert"
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="grid size-11 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10"
              aria-label="Cerrar notificación"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
