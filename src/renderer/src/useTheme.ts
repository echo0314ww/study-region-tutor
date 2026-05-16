import { useEffect } from 'react';
import type { ThemeSetting } from '../../shared/types';

export function useTheme(theme: ThemeSetting): void {
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (resolved: 'light' | 'dark'): void => {
      root.dataset.theme = resolved;
    };

    if (theme !== 'system') {
      applyTheme(theme);
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(mq.matches ? 'dark' : 'light');

    const handler = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? 'dark' : 'light');
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);
}
