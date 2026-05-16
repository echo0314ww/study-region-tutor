import { CalendarClock, Clock, Download, Search, Star, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyItem, StudyItemPatch, StudyItemStatus, StudyReviewGrade, StudySubject } from '../uiTypes';
import {
  filterStudyItems,
  isStudyItemDue,
  mergeStudyItems,
  studyDashboardStats,
  studyLibraryStats,
  STUDY_STATUS_LABELS,
  STUDY_STATUSES,
  STUDY_SUBJECT_LABELS,
  STUDY_SUBJECTS,
  STUDY_DIFFICULTY_LABELS,
  STUDY_REVIEW_GRADE_LABELS,
  tagsFromText
} from '../studyLibrary';
import type { StudyBackupMergeStrategy, StudyLibraryBackup, StudyLibraryExportFormat } from '../../../shared/types';

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

function resultCountText(total: number, filtered: number): string {
  return total === filtered ? `${total} 条记录` : `${filtered} / ${total} 条记录`;
}

function formatDate(value: string): string {
  if (!value) {
    return '未安排';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('zh-CN');
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
    setBackupStatus('正在导出...');

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
      setBackupStatus(result.saved ? `已导出到 ${result.path}` : '已取消导出');
    } catch (error) {
      setBackupStatus(`导出失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [appVersion, studyItems]);

  const handleImportBackup = useCallback(async (): Promise<void> => {
    setBackupStatus('正在导入...');

    try {
      const result = await window.studyTutor.importStudyBackup();

      if (!result.imported || !result.backup) {
        setBackupStatus('已取消导入');
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
      setBackupStatus(`已导入 ${result.backup.itemCount} 条记录（${mergeStrategy === 'replace' ? '替换' : '合并'}模式）`);
    } catch (error) {
      setBackupStatus(`导入失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [mergeStrategy, onReplaceItems, studyItems]);

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

  return (
    <div className="history-page">
      <div className="history-page-header">
        <div>
          <strong>学习库</strong>
          <span>自动保存讲解文本、学科、标签和掌握状态；不保存截图、API Key 或代理 Token。</span>
        </div>
        <button className="danger-button" type="button" onClick={onClear} disabled={studyItems.length === 0}>
          <Trash2 size={16} />
          清空
        </button>
      </div>
      <div className="history-stats">
        <span>总计 {stats.total}</span>
        <span>待处理/复习 {stats.due}</span>
        <span>新题 {stats.newCount}</span>
        <span>复习中 {stats.reviewing}</span>
        <span>已掌握 {stats.mastered}</span>
        <span>错题 {stats.mistakes}</span>
      </div>
      <div className="study-dashboard">
        <div className="study-dashboard-card">
          <span>掌握率</span>
          <strong>{dashboardStats.masteredRate}%</strong>
        </div>
        <div className="study-dashboard-card">
          <span>近 7 天复习</span>
          <strong>{dashboardStats.reviewedLast7Days}</strong>
        </div>
        <div className="study-dashboard-card">
          <span>学科分布</span>
          <strong>
            {dashboardStats.subjectCounts.length
              ? dashboardStats.subjectCounts
                  .map((item) => `${STUDY_SUBJECT_LABELS[item.subject]} ${item.count}`)
                  .join(' / ')
              : '暂无'}
          </strong>
        </div>
        <div className="study-dashboard-card wide">
          <span>高频知识点</span>
          <strong>
            {dashboardStats.topKnowledgePoints.length
              ? dashboardStats.topKnowledgePoints.map((item) => `${item.label} ${item.count}`).join(' / ')
              : '等待结构化提取'}
          </strong>
        </div>
        <div className="study-dashboard-card wide">
          <span>常见易错点</span>
          <strong>
            {dashboardStats.topMistakeTraps.length
              ? dashboardStats.topMistakeTraps.map((item) => `${item.label} ${item.count}`).join(' / ')
              : '等待结构化提取'}
          </strong>
        </div>
      </div>
      <div className="history-toolbar">
        <label className="history-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索题目、答案、标签或模型"
            spellCheck={false}
          />
        </label>
        <select value={subject} onChange={(event) => setSubject(event.target.value as StudySubject | 'all')}>
          <option value="all">全部学科</option>
          {STUDY_SUBJECTS.map((item) => (
            <option key={item} value={item}>
              {STUDY_SUBJECT_LABELS[item]}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as StudyItemStatus | 'all')}>
          <option value="all">全部状态</option>
          {STUDY_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STUDY_STATUS_LABELS[item]}
            </option>
          ))}
        </select>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(event) => setFavoritesOnly(event.target.checked)}
          />
          只看收藏
        </label>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(event) => setDueOnly(event.target.checked)}
          />
          待处理/复习
        </label>
        <label className="history-favorite-filter">
          <input
            type="checkbox"
            checked={mistakesOnly}
            onChange={(event) => setMistakesOnly(event.target.checked)}
          />
          只看错题
        </label>
        <button className="secondary-button" type="button" onClick={clearFilters} disabled={!hasActiveFilters}>
          清空筛选
        </button>
      </div>
      <div className="history-export-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('markdown', filteredItems)}
          disabled={filteredItems.length === 0}
          title="导出为可阅读、可归档的 Markdown 文档"
        >
          <Download size={16} />
          导出当前筛选 Markdown
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('anki-csv', filteredItems)}
          disabled={filteredItems.length === 0}
          title="导出为 Anki 可导入的 CSV"
        >
          <Download size={16} />
          导出当前筛选 Anki CSV
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onExport('obsidian', filteredItems)}
          disabled={filteredItems.length === 0}
          title="导出为适合 Obsidian 笔记库的 Markdown"
        >
          <Download size={16} />
          导出当前筛选 Obsidian
        </button>
        <span className="model-status">将导出当前筛选的 {filteredItems.length} 条</span>
        {exportStatus && <span className="model-status">{exportStatus}</span>}
      </div>
      <div className="history-export-row">
        <button
          className="secondary-button"
          type="button"
          onClick={handleExportBackup}
          disabled={studyItems.length === 0}
          title="导出全部学习数据为 JSON 备份文件"
        >
          <Download size={16} />
          导出备份
        </button>
        <select
          value={mergeStrategy}
          onChange={(event) => setMergeStrategy(event.target.value as StudyBackupMergeStrategy)}
          title="导入时的合并策略"
        >
          <option value="merge-prefer-imported">合并（优先导入数据）</option>
          <option value="merge-prefer-local">合并（优先本地数据）</option>
          <option value="replace">替换（覆盖本地）</option>
        </select>
        <button
          className="secondary-button"
          type="button"
          onClick={handleImportBackup}
          title="从 JSON 备份文件导入学习数据"
        >
          <Upload size={16} />
          导入备份
        </button>
        {backupStatus && <span className="model-status">{backupStatus}</span>}
      </div>
      <div className="history-count">{resultCountText(studyItems.length, filteredItems.length)}</div>
      {studyItems.length === 0 ? (
        <div className="empty-state">暂无学习记录。完成一次截图讲解后会自动加入学习库。</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">没有匹配的学习记录。</div>
      ) : (
        <div className="history-list">
          {filteredItems.map((item) => (
            <article className={`history-item ${item.favorite ? 'favorite' : ''}`} key={item.id}>
              <button className="history-item-open" type="button" onClick={() => onRestore(item)}>
                <strong>{item.title}</strong>
                <span>
                  <Clock size={13} />
                  {formatTime(item.updatedAt)} · {item.model || '未记录模型'}
                </span>
                <span>
                  <CalendarClock size={13} />
                  下次复习：{formatDate(item.nextReviewAt)}
                  {isStudyItemDue(item) ? ' · 已到期' : ''}
                </span>
              </button>
              <div className="history-item-controls">
                <button
                  className={`icon-button ghost ${item.favorite ? 'active' : ''}`}
                  type="button"
                  onClick={() => onUpdate(item.id, { favorite: !item.favorite })}
                  title={item.favorite ? '取消收藏' : '收藏'}
                >
                  <Star size={16} />
                </button>
                <button className="icon-button ghost" type="button" onClick={() => onDelete(item.id)} title="删除">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="history-review-row">
                {(['again', 'hard', 'good', 'easy'] as StudyReviewGrade[]).map((grade) => (
                  <button className="secondary-button" type="button" key={grade} onClick={() => onReview(item.id, grade)}>
                    {STUDY_REVIEW_GRADE_LABELS[grade]}
                  </button>
                ))}
                <span>
                  {STUDY_DIFFICULTY_LABELS[item.difficulty]} · 复习 {item.reviewCount} 次 · 对 {item.correctCount} / 错 {item.wrongCount}
                </span>
              </div>
              <div className="history-item-fields">
                <label>
                  标题
                  <input
                    value={drafts[item.id]?.title ?? item.title}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { title: event.target.value })}
                    spellCheck={false}
                  />
                </label>
                <label>
                  学科
                  <select
                    value={item.subject}
                    onChange={(event) => onUpdate(item.id, { subject: event.target.value as StudySubject })}
                  >
                    {STUDY_SUBJECTS.map((subjectItem) => (
                      <option key={subjectItem} value={subjectItem}>
                        {STUDY_SUBJECT_LABELS[subjectItem]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  状态
                  <select
                    value={item.status}
                    onChange={(event) => onUpdate(item.id, { status: event.target.value as StudyItemStatus })}
                  >
                    {STUDY_STATUSES.map((statusItem) => (
                      <option key={statusItem} value={statusItem}>
                        {STUDY_STATUS_LABELS[statusItem]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="history-tags-field">
                  标签
                  <input
                    value={drafts[item.id]?.tagsText ?? item.tags.join(', ')}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { tagsText: event.target.value })}
                    placeholder="逗号分隔"
                    spellCheck={false}
                  />
                </label>
                <label className="history-tags-field">
                  易错原因
                  <input
                    value={drafts[item.id]?.mistakeReason ?? item.mistakeReason}
                    onBlur={() => commitDraft(item.id)}
                    onChange={(event) => updateDraft(item.id, { mistakeReason: event.target.value })}
                    placeholder="例如：符号看错、公式选择错误、单位遗漏"
                    spellCheck={false}
                  />
                </label>
              </div>
              {item.metadata && (
                <div className="history-metadata">
                  <span>{item.metadata.topic || '未识别知识点'}</span>
                  <span>{item.metadata.questionType || '未识别题型'}</span>
                  {item.metadata.keyPoints.map((point) => (
                    <span key={point}>{point}</span>
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
