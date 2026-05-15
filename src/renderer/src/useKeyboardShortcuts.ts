import { useEffect } from 'react';
import type { ShortcutAction, ShortcutBinding } from '../../shared/types';
import { shortcutFromKeyboardEvent } from './uiUtils';

type ShortcutHandlers = Record<ShortcutAction, () => void | Promise<void>>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function useKeyboardShortcuts(shortcuts: ShortcutBinding[], handlers: ShortcutHandlers): void {
  useEffect(() => {
    const activeShortcuts = shortcuts.filter((shortcut) => shortcut.enabled && shortcut.key.trim());

    if (activeShortcuts.length === 0) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = shortcutFromKeyboardEvent(event);
      const shortcut = activeShortcuts.find((item) => item.key === key);

      if (!shortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handlers[shortcut.action]();
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [handlers, shortcuts]);
}
