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

export function translateMessage(
  locale: TutorLocale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const messages = localeMap[locale] || zhCN;
  let text = messages[key] || zhCN[key] || key;

  if (params) {
    for (const [param, value] of Object.entries(params)) {
      text = text.replace(`{${param}}`, String(value));
    }
  }

  return text;
}

export function useTranslation(): {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  locale: TutorLocale;
} {
  const locale = useContext(LocaleContext);

  function t(key: MessageKey, params?: Record<string, string | number>): string {
    return translateMessage(locale, key, params);
  }

  return { t, locale };
}
