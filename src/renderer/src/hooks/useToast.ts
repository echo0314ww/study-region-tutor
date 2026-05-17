import { useCallback, useState } from 'react';

export interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let nextId = 1;

export interface UseToastReturn {
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'error') => void;
  dismissToast: (id: number) => void;
}

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      const id = nextId++;
      setToasts((current) => [...current, { id, message, type }]);
      window.setTimeout(() => dismissToast(id), 3000);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}
