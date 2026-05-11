import { useCallback, useEffect, useState } from 'react';
import type { Announcement, AnnouncementEvent } from '../../shared/types';
import { ANNOUNCEMENT_HEALTH_RETRY_MS } from './constants';
import { loadReadAnnouncementRevision, saveReadAnnouncementRevision } from './uiUtils';

export function useAnnouncements(announcementSourceUrl: string): {
  announcements: Announcement[];
  announcementError: string;
  announcementPanelLevel: string;
  expandedAnnouncementIds: Set<string>;
  hasUnreadAnnouncement: boolean;
  isAnnouncementOpen: boolean;
  closeAnnouncementPanel: () => void;
  toggleAnnouncementDetails: (announcementId: string) => void;
  toggleAnnouncementPanel: () => void;
} {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementRevision, setAnnouncementRevision] = useState('');
  const [announcementError, setAnnouncementError] = useState('');
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<Set<string>>(() => new Set());
  const [readAnnouncementRevision, setReadAnnouncementRevision] = useState(() => loadReadAnnouncementRevision());

  const hasUnreadAnnouncement = Boolean(
    announcements.length > 0 && announcementRevision && announcementRevision !== readAnnouncementRevision
  );
  const announcementPanelLevel = announcements.some((item) => item.level === 'critical')
    ? 'critical'
    : announcements.some((item) => item.level === 'warning')
      ? 'warning'
      : '';

  const markAnnouncementRevisionRead = useCallback((revision: string): void => {
    if (!revision) {
      return;
    }

    saveReadAnnouncementRevision(revision);
    setReadAnnouncementRevision(revision);
  }, []);

  const handleAnnouncementEvent = useCallback((event: AnnouncementEvent): void => {
    const nextAnnouncements =
      Array.isArray(event.announcements) && event.announcements.length > 0
        ? event.announcements
        : event.announcement
          ? [event.announcement]
          : [];

    setAnnouncementError('');
    setAnnouncements(nextAnnouncements);
    setAnnouncementRevision(event.revision || '');
  }, []);

  const toggleAnnouncementPanel = useCallback((): void => {
    setIsAnnouncementOpen((current) => {
      const next = !current;

      if (next) {
        markAnnouncementRevisionRead(announcementRevision);
      } else {
        setExpandedAnnouncementIds(new Set());
      }

      return next;
    });
  }, [announcementRevision, markAnnouncementRevisionRead]);

  const closeAnnouncementPanel = useCallback((): void => {
    setIsAnnouncementOpen(false);
    setExpandedAnnouncementIds(new Set());
  }, []);

  const toggleAnnouncementDetails = useCallback((announcementId: string): void => {
    setExpandedAnnouncementIds((current) => {
      const next = new Set(current);

      if (next.has(announcementId)) {
        next.delete(announcementId);
      } else {
        next.add(announcementId);
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAnnouncementOpen || !announcementRevision || announcementRevision === readAnnouncementRevision) {
      return;
    }

    markAnnouncementRevisionRead(announcementRevision);
  }, [announcementRevision, isAnnouncementOpen, markAnnouncementRevisionRead, readAnnouncementRevision]);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribeAnnouncement = window.studyTutor.onAnnouncement((event) => {
      if (isMounted) {
        handleAnnouncementEvent(event);
      }
    });

    function scheduleRetry(): void {
      if (!isMounted) {
        return;
      }

      if (retryTimer) {
        clearTimeout(retryTimer);
      }

      retryTimer = setTimeout(() => {
        void connectWhenHealthy();
      }, ANNOUNCEMENT_HEALTH_RETRY_MS);
    }

    async function connectWhenHealthy(): Promise<void> {
      if (!announcementSourceUrl) {
        return;
      }

      const health = await window.studyTutor.checkProxyHealth(announcementSourceUrl);

      if (!isMounted) {
        return;
      }

      if (!health.ok) {
        setAnnouncementError('公告服务暂不可用，应用会在后台重试连接。');
        void window.studyTutor.connectAnnouncements('').catch(() => undefined);
        scheduleRetry();
        return;
      }

      setAnnouncementError('');

      await window.studyTutor.connectAnnouncements(announcementSourceUrl).catch((caught) => {
        if (!isMounted) {
          return;
        }

        setAnnouncementError(caught instanceof Error ? caught.message : String(caught));
      });

      const latestAnnouncementEvent = await window.studyTutor.getLatestAnnouncement(announcementSourceUrl);

      if (!isMounted) {
        return;
      }

      handleAnnouncementEvent(latestAnnouncementEvent);
    }

    if (!announcementSourceUrl) {
      setAnnouncements([]);
      setAnnouncementError('');
      void window.studyTutor.connectAnnouncements('').catch(() => undefined);

      return () => {
        isMounted = false;
        if (retryTimer) {
          clearTimeout(retryTimer);
        }
        unsubscribeAnnouncement();
      };
    }

    void connectWhenHealthy().catch((caught) => {
      if (!isMounted) {
        return;
      }

      setAnnouncementError(caught instanceof Error ? caught.message : String(caught));
      scheduleRetry();
    });

    return () => {
      isMounted = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      unsubscribeAnnouncement();
    };
  }, [announcementSourceUrl, handleAnnouncementEvent]);

  return {
    announcements,
    announcementError,
    announcementPanelLevel,
    expandedAnnouncementIds,
    hasUnreadAnnouncement,
    isAnnouncementOpen,
    closeAnnouncementPanel,
    toggleAnnouncementDetails,
    toggleAnnouncementPanel
  };
}
