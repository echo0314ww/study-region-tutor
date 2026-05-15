import { Clock, Search, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StudyItem, StudyItemPatch, StudyItemStatus, StudySubject } from '../uiTypes';
import {
  filterStudyItems,
  STUDY_STATUS_LABELS,
  STUDY_STATUSES,
  STUDY_SUBJECT_LABELS,
  STUDY_SUBJECTS,
  tagsFromText
} from '../studyLibrary';

export interface HistoryPanelProps {
  studyItems: StudyItem[];
  onRestore: (item: StudyItem) => void;
  onUpdate: (id: string, patch: StudyItemPatch) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
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

export function HistoryPanel({ studyItems, onRestore, onUpdate, onDelete, onClear }: HistoryPanelProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<StudySubject | 'all'>('all');
  const [status, setStatus] = useState<StudyItemStatus | 'all'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const filteredItems = useMemo(
    () => filterStudyItems(studyItems, { query, subject, status, favoritesOnly }),
    [favoritesOnly, query, status, studyItems, subject]
  );

  return (
    <div className="history-page">
      <div className="history-page-header">
        <div>
          <strong>学习库</strong>
          <span>自动保存讲解文本、学科、标签和掌握状态；不保存截图、API Key 或代理 Token。</span>
        </div>
        <button className="secondary-button" type="button" onClick={onClear} disabled={studyItems.length === 0}>
          <Trash2 size={16} />
          清空
        </button>
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
              <div className="history-item-fields">
                <label>
                  标题
                  <input
                    value={item.title}
                    onChange={(event) => onUpdate(item.id, { title: event.target.value })}
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
                    value={item.tags.join(', ')}
                    onChange={(event) => onUpdate(item.id, { tags: tagsFromText(event.target.value) })}
                    placeholder="逗号分隔"
                    spellCheck={false}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
