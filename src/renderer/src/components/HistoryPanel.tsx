import { CalendarClock, Clock, Download, Search, Star, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyItem, StudyItemPatch, StudyItemStatus, StudyReviewGrade, StudySubject } from '../uiTypes';
import {
  filterStudyItems,
  isStudyItemDue,
  mergeStudyItems,
  studyDashboardStats,
  studyLibraryStats,
  STUDY_STATUSES,
  STUDY_SUBJECTS,
  tagsFromText
} from '../studyLibrary';
import type { StudyBackupMergeStrategy, StudyLibraryBackup, StudyLibraryExportFormat } from '../../../shared/types';
import { useTranslation } from '../i18n';

interface StudyItemDraft {
  title?: string;
  tagsText?: string;
  mistakeReason?: string;
}

export interface HistoryPanelProps {
  studyItems: StudyItem[];
  appVersion: string;
  onRestore: (item: StudyItem) => void;
  onUpdate: (id: string, patch: StudyItemPatch) => void;
  onReview: (id: string, grade: StudyReviewGrade) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: (format: StudyLibraryExportFormat, items: StudyItem[]) => void;
  onReplaceItems: (items: StudyItem[]) => void;
  exportStatus: string;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

function draftPatch(draft: StudyItemDraft): StudyItemPatch {
  const patch: StudyItemPatch = {};

  if (draft.title !== undefined) {
    patch.title = draft.title;
  }

  if (draft.tagsText !== undefined) {
    patch.tags = tagsFromText(draft.tagsText);
  }

  if (draft.mistakeReason !== undefined) {
    patch.mistakeReason = draft.mistakeReason;
  }

  return patch;
}

export function HistoryPanel({
  studyItems,
  appVersion,
  onRestore,
  onUpdate,
  onReview,
  onDelete,
  onClear,
  onExport,
  onReplaceItems,
  exportStatus
}: HistoryPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<StudySubject | 'all'>('all');
  const [status, setStatus] = useState<StudyItemStatus | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [mistakesOnly, setMistakesOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, StudyItemDraft>>({});
  const [backupStatus, setBackupStatus] = useState('');
  const [mergeStrategy, setMergeStrategy] = useState<StudyBackupMergeStrategy>('merge-prefer-imported');
  const stats = useMemo(() => studyLibraryStats(studyItems), [studyItems]);
  const dashboardStats = useMemo(() => studyDashboardStats(studyItems), [studyItems]);
  const filteredItems = useMemo(
    () => filterStudyItems(studyItems, { query, subject, status, favoritesOnly, dueOnly, mistakesOnly }),
    [dueOnly, favoritesOnly, mistakesOnly, query, status, studyItems, subject]
  );
  const hasActiveFilters = Boolean(query.trim() || subject !== 'all' || status !== 'all' || favoritesOnly || dueOnly || mistakesOnly);
  const clearFilters = useCallback((): void => {
    setQuery('');
    setSubject('all');
    setStatus('all');
    setFavoritesOnly(false);
    setDueOnly(false);
    setMistakesOnly(false);
  }, []);
  const updateDraft = useCallback((id: string, patch: StudyItemDraft): void => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch
      }
    }));
  }, []);
  const commitDraft = useCallback(
    (id: string): void => {
      const draft = drafts[id];

      if (!draft) {
        return;
      }

      onUpdate(id, draftPatch(draft));
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [drafts, onUpdate]
  );

  const handleExportBackup = useCallback(async (): Promise<void> => {
    setBackupStatus(t('studyLibrary.exporting'));

    try {
      const backup: StudyLibraryBackup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion,
        itemCount: studyItems.length,
        items: studyItems.map((item) => ({
          ...item,
          turns: item.turns.map((turn) => ({ role: turn.role, content: turn.content }))
        }))
      };
      const result = await window.studyTutor.exportStudyBackup(backup);
      setBackupStatus(result.saved ? t('studyLibrary.exported', { path: result.path || '' }) : t('studyLibrary.exportCancelled'));
    } catch (error) {
      setBackupStatus(t('studyLibrary.exportFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }, [appVersion, studyItems, t]);

  const handleImportBackup = useCallback(async (): Promise<void> => {
    setBackupStatus(t('studyLibrary.importing'));

    try {
      const result = await window.studyTutor.importStudyBackup();

      if (!result.imported || !result.backup) {
        setBackupStatus(t('studyLibrary.importCancelled'));
        return;
      }

      const importedItems = result.backup.items.map((item) => ({
        ...item,
        turns: item.turns.map((turn) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: turn.role,
          content: turn.content
        }))
      })) as StudyItem[];

      const merged = mergeStudyItems(studyItems, importedItems, mergeStrategy);
      onReplaceItems(merged);
      setBackupStatus(t('studyLibrary.imported', { count: result.backup.itemCount, mode: mergeStrategy === 'replace' ? t('studyLibrary.mergeReplace') : t('studyLibrary.mergePreferImported') }));
    } catch (error) {
      setBackupStatus(t('studyLibrary.importFailed', { error: error instanceof Error ? error.message : String(error) }));
    }
  }, [mergeStrategy, onReplaceItems, studyItems, t]);

  useEffect(() => {
    const entries = Object.entries(drafts);

    if (entries.length === 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      for (const [id, draft] of entries) {
        onUpdate(id, draftPatch(draft));
      }

      setDrafts((current) => {
        const next = { ...current };

        for (const [id] of entries) {
          delete next[id];
        }

        return next;
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [drafts, onUpdate]);

  const formatDate = (value: string): string => {
    if (!value) {
      return t('studyLibrary.notScheduled');
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('zh-CN');
  };

  const resultCountText = (total: number, filtered: number): string => {
    return total === filtered
      ? t('studyLibrary.count', { count: total })
      : t('studyLibrary.filteredCount', { filtered, total });
  };

  return (
    <div className="history-page">
      <div className="history-page-header">
        <div>
          <strong>{t('studyLibrary.title')}</strong>
          <span>{t('studyLibrary.subtitle')}</span>
        </div>
        <button className="danger-button" type="button" onClick={onClear} disabled={studyItems.length === 0}>
          <Trash2 size={16} />
          {t('studyLibrary.clearAll')}
        </button>
      </div>
      <div className="history-stats">
        <span>{t('stats.total', { count: stats.total })}</span>
        <span>{t('stats.due', { count: stats.due })}</span>
        <span>{t('stats.new', { count: stats.newCount })}</span>
        <span>{t('stats.reviewing', { count: stats.reviewing })}</span>
        <span>{t('stats.mastered', { count: stats.mastered })}</span>
        <span>{t('stats.mistakes', { count: stats.mistakes })}</span>
      </div>
      <div className="study-dashboard">
        <div className="study-dashboard-card">
          <span>{t('dashboard.masteredRate')}</span>
          <strong>{dashboardStats.masteredRate}%</strong>
        </div>
        <div className="study-dashboard-card">
          <span>{t('dashboard.reviewedLast7Days')}</span>
          <strong>{dashboardStats.reviewedLast7Days}</strong>
        </div>
        <div className="study-dashboard-card">
          <span>{t('dashboard.subjectDistribution')}</span>
          <strong>
            {dashboardStats.subjectCounts.length
              ? dashboardStats.subjectCounts
                  .map((item) => `${t(`subject.${item.subject}` as const)} ${item.count}`)
                  .join(' / ')
              : t('dashboard.noData')}
          </strong>
        </div>
        <div className="study-dashboard-card wide">
          <span>{t('dashboard.topKnowledgePoints')}</span>
          <strong>
            {dashboardStats.topKnowledgePoints.length
              ? dashboardStats.topKnowledgePoints.map((item) => `${item.label} ${item.count}`).join(' / ')
              : t('dashboard.awaitingExtraction')}
          </strong>
        </div>
        <div className="study-dashboard-card wide">
          <span>{t('dashboard.topMistakeTraps')}</span>
          <strong>
            {dashboardStats.topMistakeTraps.length
              ? dashboardStats.topMistakeTraps.map((item) => `${item.label} ${item.count}`).join(' / ')
              : t('dashboard.awaitingExtraction')}
          </strong>
        </div>
      </div>
      <div className="history-toolbar">
        <label className="history-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('studyLibrary.searchPlaceholder')}
            spellCheck={false}
          />
        </label>
        <select value={subject} onChange={(event) => setSubject(event.target.value as StudySubject | 'all')}>
          <option value="all">{t('studyLibrary.allSubjects')}</option>
          {STUDY_SUBJECTS.map((item) => (
            <option key={item} value={item}>
              {t(`subject.${item}` as const)}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as StudyItemStatus | 'all')}>
          <option value="all">{t('studyLibrary.allStatuses')}</option>
          {STUDY_STATUSES.map((item) => (
            <option key={item} value={item}>
              {t(`status.${item}` as const)}
            </option>
          ))}
        </select>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
          />
          {t('studyLibrary.showFavorites')}
        </label>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(event) => setDueOnly(event.target.checked)}
          />
          {t('studyLibrary.showDue')}
        </label>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={mistakesOnly}
            onChange={(event) => setMistakesOnly(event.target.checked)}
          />
          {t('studyLibrary.showMistakes')}
        </label>
        <button className="secondary-button" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
          {t('studyLibrary.clearFilters')}
        </button>
      </div>
      <div className="history-export-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('markdown', filteredItems)}
          disabled={filteredItems.length === 0}
        >
          <Download size={16} />
          {t('studyLibrary.exportMarkdown')}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('anki-csv', filteredItems)}
          disabled={filteredItems.length === 0}
        >
          <Download size={16} />
          {t('studyLibrary.exportAnki')}
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('obsidian', filteredItems)}
          disabled={filteredItems.length === 0}
        >
          <Download size={16} />
          {t('studyLibrary.exportObsidian')}
        </button>
        <span className="model-status">{t('studyLibrary.exportWillExport', { count: filteredItems.length })}</span>
        {exportStatus && <span className="model-status">{exportStatus}</span>}
      </div>
      <div className="history-export-row">
        <button
          className="secondary-button"
          type="button"
          onClick={handleExportBackup}
          disabled={studyItems.length === 0}
        >
          <Download size={16} />
          {t('studyLibrary.exportBackup')}
        </button>
        <select
          value={mergeStrategy}
          onChange={(event) => setMergeStrategy(event.target.value as StudyBackupMergeStrategy)}
        >
          <option value="merge-prefer-imported">{t('studyLibrary.mergePreferImported')}</option>
          <option value="merge-prefer-local">{t('studyLibrary.mergePreferLocal')}</option>
          <option value="replace">{t('studyLibrary.mergeReplace')}</option>
        </select>
        <button
          className="secondary-button"
          type="button"
          onClick={handleImportBackup}
        >
          <Upload size={16} />
          {t('studyLibrary.importBackup')}
        </button>
        {backupStatus && <span className="model-status">{backupStatus}</span>}
      </div>
      <div className="history-count">{resultCountText(studyItems.length, filteredItems.length)}</div>
      {studyItems.length === 0 ? (
        <div className="empty-state">{t('studyLibrary.empty')}</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">{t('studyLibrary.noMatch')}</div>
      ) : (
        <div className="history-list">
          {filteredItems.map((item, i) => (
            <article className={`history-item ${item.favorite ? 'favorite' : ''}`} key={item.id} style={{ '--item-index': i } as React.CSSProperties}>
              <button className="history-item-open" type="button" onClick={() => onRestore(item)}>
                <strong>{item.title}</strong>
                <span>
                  <Clock size={13} />
                  {formatTime(item.updatedAt)} · {item.model || t('studyLibrary.modelUnknown')}
                </span>
                <span>
                  <CalendarClock size={13} />
                  {t('studyLibrary.nextReview', { date: formatDate(item.nextReviewAt) })}
                  {isStudyItemDue(item) ? ` · ${t('studyLibrary.due')}` : ''}
                </span>
              </button>
              <div className="history-item-controls">
                <button
                  className={`icon-button ghost ${item.favorite ? 'active' : ''}`}
                  type="button"
                  onClick={() => onUpdate(item.id, { favorite: !item.favorite })}
                  title={item.favorite ? t('studyItem.unfavorite') : t('studyItem.favorite')}
                >
                  <Star size={16} />
                </button>
                <button className="icon-button ghost" type="button" onClick={() => onDelete(item.id)} title={t('app.delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="history-review-row">
                {(['again', 'hard', 'good', 'easy'] as StudyReviewGrade[]).map((grade) => (
                  <button className="secondary-button" type="button" key={grade} onClick={() => onReview(item.id, grade)}>
                    {t(`studyItem.review${grade.charAt(0).toUpperCase()}${grade.slice(1)}` as 'studyItem.reviewEasy' | 'studyItem.reviewGood' | 'studyItem.reviewHard' | 'studyItem.reviewWrong')}
                  </button>
                ))}
                <span>
                  {t('studyItem.reviewCount', { difficulty: t(`difficulty.${item.difficulty}` as const), reviewCount: item.reviewCount, correctCount: item.correctCount, wrongCount: item.wrongCount })}
                </span>
              </div>
              <div className="history-item-fields">
                <label>
                  {t('studyItem.title')}
                  <input
                    value={drafts[item.id]?.title ?? item.title}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { title: event.target.value })}
                    spellCheck={false}
                  />
                </label>
                <label>
                  {t('studyItem.subject')}
                  <select
                    value={item.subject}
                    onChange={(event) => onUpdate(item.id, { subject: event.target.value as StudySubject })}
                  >
                    {STUDY_SUBJECTS.map((subjectItem) => (
                      <option key={subjectItem} value={subjectItem}>
                        {t(`subject.${subjectItem}` as const)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('studyItem.status')}
                  <select
                    value={item.status}
                    onChange={(event) => onUpdate(item.id, { status: event.target.value as StudyItemStatus })}
                  >
                    {STUDY_STATUSES.map((statusItem) => (
                      <option key={statusItem} value={statusItem}>
                        {t(`status.${statusItem}` as const)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-tags-field">
                  {t('studyItem.tags')}
                  <input
                    value={drafts[item.id]?.tagsText ?? item.tags.join(', ')}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { tagsText: event.target.value })}
                    placeholder={t('studyItem.tagsPlaceholder')}
                    spellCheck={false}
                  />
                </label>
                <label className="history-tags-field">
                  {t('studyItem.mistakeReason')}
                  <input
                    value={drafts[item.id]?.mistakeReason ?? item.mistakeReason}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { mistakeReason: event.target.value })}
                    placeholder={t('studyItem.mistakeReasonPlaceholder')}
                    spellCheck={false}
                  />
                </label>
              </div>
              {item.metadata && (
                <div className="history-metadata">
                  <span>{item.metadata.topic || t('studyLibrary.topicUnknown')}</span>
                  <span>{item.metadata.questionType || t('studyLibrary.questionTypeUnknown')}</span>
                  {item.metadata.keyPoints.map((point, idx) => (
                    <span key={`${point}-${idx}`}>{point}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
