import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../i18n';

export type ConfirmDialogState =
  | { action: 'quit'; title: string; body: string; confirmLabel: string; danger?: boolean }
  | { action: 'delete-study-item'; id: string; title: string; body: string; confirmLabel: string; danger?: boolean }
  | { action: 'clear-study-items'; title: string; body: string; confirmLabel: string; danger?: boolean };

export interface ConfirmDialogActions {
  onQuitConfirmed: () => void;
  onDeleteStudyItemConfirmed: (id: string) => void;
  onClearStudyItemsConfirmed: () => void;
}

export interface UseConfirmDialogReturn {
  confirmDialog: ConfirmDialogState | null;
  openQuitConfirm: () => void;
  openDeleteStudyItemConfirm: (id: string) => void;
  openClearStudyItemsConfirm: () => void;
  closeConfirmDialog: () => void;
  confirmPendingAction: () => void;
}

export function useConfirmDialog(actions: ConfirmDialogActions): UseConfirmDialogReturn {
  const { t } = useTranslation();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  const openQuitConfirm = useCallback((): void => {
    setConfirmDialog({
      action: 'quit',
      title: t('confirm.quit.title'),
      body: t('confirm.quit.body'),
      confirmLabel: t('confirm.quit.action'),
      danger: true
    });
  }, [t]);

  const openDeleteStudyItemConfirm = useCallback((id: string): void => {
    setConfirmDialog({
      action: 'delete-study-item',
      id,
      title: t('studyLibrary.deleteConfirmTitle'),
      body: t('studyLibrary.deleteConfirmBody'),
      confirmLabel: t('studyLibrary.deleteConfirmAction'),
      danger: true
    });
  }, [t]);

  const openClearStudyItemsConfirm = useCallback((): void => {
    setConfirmDialog({
      action: 'clear-study-items',
      title: t('studyLibrary.clearConfirmTitle'),
      body: t('studyLibrary.clearConfirmBody'),
      confirmLabel: t('studyLibrary.clearConfirmAction'),
      danger: true
    });
  }, [t]);

  const closeConfirmDialog = useCallback((): void => {
    setConfirmDialog(null);
  }, []);

  const confirmPendingAction = useCallback((): void => {
    if (!confirmDialog) {
      return;
    }

    if (confirmDialog.action === 'quit') {
      actions.onQuitConfirmed();
      return;
    }

    if (confirmDialog.action === 'delete-study-item') {
      actions.onDeleteStudyItemConfirmed(confirmDialog.id);
      setConfirmDialog(null);
      return;
    }

    actions.onClearStudyItemsConfirmed();
    setConfirmDialog(null);
  }, [actions, confirmDialog]);

  useEffect(() => {
    if (!confirmDialog) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setConfirmDialog(null);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [confirmDialog]);

  return {
    confirmDialog,
    openQuitConfirm,
    openDeleteStudyItemConfirm,
    openClearStudyItemsConfirm,
    closeConfirmDialog,
    confirmPendingAction
  };
}
