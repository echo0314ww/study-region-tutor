import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyLibraryExportFormat, TutorSettings } from '../../../shared/types';
import type { StudyItem, StudyItemPatch, StudyReviewGrade, UiConversationTurn } from '../uiTypes';
import {
  loadStudyItems,
  saveStudyItems,
  updateStudyItemMetadata,
  updateStudyItemReviewResult,
  upsertStudyItem
} from '../studyLibrary';
import { settingsWithEffectiveProxyUrl } from '../uiUtils';
import { translateMessage } from '../i18n';
import type { MessageKey } from '../i18n';

export interface UseStudyLibraryReturn {
  studyItems: StudyItem[];
  setStudyItems: React.Dispatch<React.SetStateAction<StudyItem[]>>;
  studyLibraryExportStatus: string;
  restoreStudyItem: (item: StudyItem) => void;
  updateStudyItem: (id: string, patch: StudyItemPatch) => void;
  reviewStudyItem: (id: string, grade: StudyReviewGrade) => void;
  reviewCurrentStudyItem: (grade: StudyReviewGrade) => void;
  exportStudyItems: (format: StudyLibraryExportFormat, items: StudyItem[]) => Promise<void>;
  deleteStudyItem: (id: string) => void;
  clearStudyItems: () => void;
  replaceStudyItems: (items: StudyItem[]) => void;
  toggleCurrentStudyItemFavorite: () => void;
  isCurrentStudyItemFavorite: boolean;
}

interface UseStudyLibraryDeps {
  activeStudyItemId: string;
  conversationTurns: UiConversationTurn[];
  isLoading: boolean;
  ocrPreviewActive: boolean;
  settings: TutorSettings;
  appVersion: string;
  canExportConversation: boolean;
  onRestoreItem: (item: StudyItem) => void;
  onDeleteConfirm: (id: string) => void;
  onClearConfirm: () => void;
}

export function useStudyLibrary(deps: UseStudyLibraryDeps): UseStudyLibraryReturn {
  const {
    activeStudyItemId,
    conversationTurns,
    isLoading,
    ocrPreviewActive,
    settings,
    appVersion,
    canExportConversation,
    onRestoreItem,
    onDeleteConfirm,
    onClearConfirm
  } = deps;

  const [studyItems, setStudyItems] = useState<StudyItem[]>(() => loadStudyItems());
  const [studyLibraryExportStatus, setStudyLibraryExportStatus] = useState('');
  const t = useCallback(
    (key: MessageKey, params?: Record<string, string | number>) => translateMessage(settings.language, key, params),
    [settings.language]
  );

  const saveStudyItemsTimerRef = useRef<number | undefined>(undefined);
  const metadataRequestIdsRef = useRef(new Set<string>());
  const prevUpsertKeyRef = useRef('');

  useEffect(() => {
    if (!studyLibraryExportStatus) {
      return undefined;
    }

    const timer = window.setTimeout(() => setStudyLibraryExportStatus(''), 6000);
    return () => window.clearTimeout(timer);
  }, [studyLibraryExportStatus]);

  useEffect(() => {
    window.clearTimeout(saveStudyItemsTimerRef.current);
    saveStudyItemsTimerRef.current = window.setTimeout(() => saveStudyItems(studyItems), 200);

    return () => window.clearTimeout(saveStudyItemsTimerRef.current);
  }, [studyItems]);

  // Bug #14 fix: force-save on beforeunload to prevent data loss on quit
  useEffect(() => {
    const onBeforeUnload = (): void => {
      saveStudyItems(studyItems);
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [studyItems]);

  // Bug #9 fix: only upsert when activeStudyItemId or turn content actually changes
  useEffect(() => {
    if (!activeStudyItemId || ocrPreviewActive || isLoading || conversationTurns.length === 0) {
      return;
    }

    const upsertKey = `${activeStudyItemId}:${conversationTurns.length}:${conversationTurns[conversationTurns.length - 1]?.content.slice(0, 32) || ''}`;
    if (upsertKey === prevUpsertKeyRef.current) {
      return;
    }
    prevUpsertKeyRef.current = upsertKey;

    setStudyItems((current) =>
      upsertStudyItem(current, {
        id: activeStudyItemId,
        appVersion,
        settings,
        turns: conversationTurns
      })
    );
  }, [activeStudyItemId, appVersion, conversationTurns, isLoading, ocrPreviewActive, settings]);

  useEffect(() => {
    if (!activeStudyItemId || ocrPreviewActive || isLoading || conversationTurns.length === 0 || !settings.model.trim()) {
      return;
    }

    const existing = studyItems.find((item) => item.id === activeStudyItemId);

    if (existing?.metadata || metadataRequestIdsRef.current.has(activeStudyItemId)) {
      return;
    }

    const hasAssistantAnswer = conversationTurns.some((turn) => turn.role === 'assistant' && turn.content.trim());

    if (!hasAssistantAnswer) {
      return;
    }

    const studyItemId = activeStudyItemId;
    const text = conversationTurns.map((turn) => `${turn.role}: ${turn.content}`).join('\n\n');
    metadataRequestIdsRef.current.add(studyItemId);

    void window.studyTutor
      .extractStudyMetadata({
        text,
        settings: settingsWithEffectiveProxyUrl(settings)
      })
      .then(({ metadata }) => {
        setStudyItems((current) => {
          const item = current.find((candidate) => candidate.id === studyItemId);

          if (!item) {
            return current;
          }

          const mergedTags = [...new Set([...item.tags, ...metadata.tags, ...metadata.keyPoints].filter(Boolean))];

          return updateStudyItemMetadata(current, studyItemId, {
            metadata,
            subject: metadata.subject,
            tags: mergedTags,
            difficulty: metadata.difficulty,
            mistakeReason: item.mistakeReason || metadata.mistakeTraps[0] || ''
          });
        });
      })
      .catch(() => metadataRequestIdsRef.current.delete(studyItemId));
  }, [activeStudyItemId, conversationTurns, isLoading, ocrPreviewActive, settings, studyItems]);

  const isCurrentStudyItemFavorite = Boolean(
    activeStudyItemId && studyItems.find((item) => item.id === activeStudyItemId)?.favorite
  );

  const toggleCurrentStudyItemFavorite = useCallback((): void => {
    if (!activeStudyItemId || !canExportConversation) {
      return;
    }

    setStudyItems((current) => {
      const existing = current.find((item) => item.id === activeStudyItemId);

      if (!existing) {
        return upsertStudyItem(current, {
          id: activeStudyItemId,
          appVersion,
          settings,
          turns: conversationTurns
        }).map((item) => (item.id === activeStudyItemId ? { ...item, favorite: true } : item));
      }

      return updateStudyItemMetadata(current, activeStudyItemId, { favorite: !existing.favorite });
    });
  }, [activeStudyItemId, appVersion, canExportConversation, conversationTurns, settings]);

  const restoreStudyItem = useCallback(
    (item: StudyItem): void => {
      setStudyItems((current) =>
        updateStudyItemMetadata(current, item.id, { lastReviewedAt: new Date().toISOString() })
      );
      onRestoreItem(item);
    },
    [onRestoreItem]
  );

  const updateStudyItem = useCallback((id: string, patch: StudyItemPatch): void => {
    setStudyItems((current) => updateStudyItemMetadata(current, id, patch));
  }, []);

  const reviewStudyItem = useCallback((id: string, grade: StudyReviewGrade): void => {
    setStudyItems((current) => updateStudyItemReviewResult(current, id, grade));
  }, []);

  const reviewCurrentStudyItem = useCallback(
    (grade: StudyReviewGrade): void => {
      if (!activeStudyItemId || !canExportConversation) {
        return;
      }

      setStudyItems((current) => {
        const items = current.some((item) => item.id === activeStudyItemId)
          ? current
          : upsertStudyItem(current, {
              id: activeStudyItemId,
              appVersion,
              settings,
              turns: conversationTurns
            });

        return updateStudyItemReviewResult(items, activeStudyItemId, grade);
      });
    },
    [activeStudyItemId, appVersion, canExportConversation, conversationTurns, settings]
  );

  const exportStudyItems = useCallback(
    async (format: StudyLibraryExportFormat, items: StudyItem[]): Promise<void> => {
      if (items.length === 0) {
        return;
      }

      setStudyLibraryExportStatus('');

      try {
        const response = await window.studyTutor.exportStudyLibrary({
          appVersion,
          exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          format,
          items: items.map((item) => ({
            ...item,
            turns: item.turns.map((turn) => ({ role: turn.role, content: turn.content }))
          }))
        });

        if (!response.canceled) {
          setStudyLibraryExportStatus(
            response.filePath
              ? t('studyLibrary.exported', { path: response.filePath })
              : t('studyLibrary.exportedGeneric')
          );
        }
      } catch (caught) {
        setStudyLibraryExportStatus(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [appVersion, t]
  );

  const deleteStudyItem = useCallback(
    (id: string): void => {
      onDeleteConfirm(id);
    },
    [onDeleteConfirm]
  );

  const clearStudyItems = useCallback((): void => {
    onClearConfirm();
  }, [onClearConfirm]);

  const replaceStudyItems = useCallback((items: StudyItem[]): void => {
    setStudyItems(items);
  }, []);

  return {
    studyItems,
    setStudyItems,
    studyLibraryExportStatus,
    restoreStudyItem,
    updateStudyItem,
    reviewStudyItem,
    reviewCurrentStudyItem,
    exportStudyItems,
    deleteStudyItem,
    clearStudyItems,
    replaceStudyItems,
    toggleCurrentStudyItemFavorite,
    isCurrentStudyItemFavorite
  };
}
