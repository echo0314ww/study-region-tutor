import { CheckCircle, XCircle } from 'lucide-react';
import type { ToastItem } from '../hooks/useToast';

export interface ToastContainerProps {
  toasts: ToastItem[];
}

export function ToastContainer({ toasts }: ToastContainerProps): JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      ))}
    </div>
  );
}
