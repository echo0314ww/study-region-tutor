import { Bell, ChevronDown, ChevronRight, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Announcement } from '../../../shared/types';
import { AnswerRenderer } from '../AnswerRenderer';
import { useFocusTrap } from '../useFocusTrap';
import { useTranslation } from '../i18n';
import { announcementCategory, announcementMetaText, isReleaseAnnouncement } from '../uiUtils';

export interface AnnouncementPanelProps {
  announcements: Announcement[];
  announcementError: string;
  announcementSourceUrl: string;
  announcementPanelLevel: string;
  expandedAnnouncementIds: Set<string>;
  onClose: () => void;
  onToggleDetails: (id: string) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function AnnouncementPanel({
  announcements,
  announcementError,
  announcementSourceUrl,
  announcementPanelLevel,
  expandedAnnouncementIds,
  onClose,
  onToggleDetails,
  onPointerEnter,
  onPointerLeave
}: AnnouncementPanelProps): JSX.Element {
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLElement>();

  const groupedAnnouncements = useMemo(
    () =>
      announcements.reduce<Array<{ category: string; items: Announcement[] }>>((groups, item) => {
        const category = announcementCategory(item);
        const group = groups.find((entry) => entry.category === category);

        if (group) {
          group.items.push(item);
        } else {
          groups.push({ category, items: [item] });
        }

        return groups;
      }, []),
    [announcements]
  );

  return (
    <aside
      ref={trapRef}
      className="announcement-panel"
      role="dialog"
      aria-modal="true"
      aria-label="announcement"
      data-interactive="true"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="panel-header">
        <div className={`status announcement-status ${announcementPanelLevel}`}>
          <Bell size={16} />
          <span>{t('announcements.title')}</span>
        </div>
        <button
          className="icon-button ghost"
          type="button"
          onClick={onClose}
          title={t('app.close')}
        >
          <X size={18} />
        </button>
      </div>
      {announcements.length > 0 ? (
        <div className="announcement-list">
          {groupedAnnouncements.map((group) => (
            <section className="announcement-group" key={group.category}>
              <div className="announcement-group-title">{group.category}</div>
              {group.items.map((item) => {
                const releaseAnnouncement = isReleaseAnnouncement(item);
                const isExpanded = expandedAnnouncementIds.has(item.id);
                const contentId = `announcement-content-${item.id}`;

                return (
                  <section
                    className={`announcement-content ${releaseAnnouncement ? 'release-announcement' : ''}`}
                    key={item.id}
                  >
                    {releaseAnnouncement ? (
                      <>
                        <button
                          className="announcement-toggle-header"
                          type="button"
                          onClick={() => onToggleDetails(item.id)}
                          aria-expanded={isExpanded}
                          aria-controls={contentId}
                        >
                          <span className="announcement-meta">
                            <strong>{item.title}</strong>
                            <span>{announcementMetaText(item)}</span>
                          </span>
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </button>
                        {isExpanded && (
                          <div className="announcement-detail" id={contentId}>
                            <AnswerRenderer text={item.content} />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="announcement-meta">
                          <strong>{item.title}</strong>
                          <span>{announcementMetaText(item)}</span>
                        </div>
                        <AnswerRenderer text={item.content} />
                      </>
                    )}
                  </section>
                );
              })}
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          {announcementError || (announcementSourceUrl ? t('announcements.empty') : t('announcements.noSource'))}
        </div>
      )}
    </aside>
  );
}
