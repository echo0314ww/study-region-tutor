import { createContext, useContext } from 'react';
import type { MessageKey, Messages, TutorLocale } from './types';
import { zhCN } from './zh-CN';
import { en } from './en';

export type { MessageKey, Messages, TutorLocale } from './types';

const localeMap: Record<TutorLocale, Messages> = {
  'zh-CN': zhCN,
  en
};

export const LocaleContext = createContext<TutorLocale>('zh-CN');

export function useTranslation(): {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  locale: TutorLocale;
} {
  const locale = useContext(LocaleContext);
  const messages = localeMap[locale] || zhCN;

  function t(key: MessageKey, params?: Record<string, string | number>): string {
    let text = messages[key] || zhCN[key] || key;

    if (params) {
      for (const [param, value] of Object.entries(params)) {
        text = text.replace(`{${param}}`, String(value));
      }
    }

    return text;
  }

  return { t, locale };
}
