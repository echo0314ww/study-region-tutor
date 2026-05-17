import { Copy, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiRuntimeDefaults, ProxyHealthResult, TutorSettings } from '../../../shared/types';
import { useTranslation } from '../i18n';
import type { ProxyHealthStatus } from '../uiTypes';

export interface ProxyAdminPanelProps {
  settings: TutorSettings;
  apiDefaults: ApiRuntimeDefaults | null;
  currentProxyUrl: string;
  proxyHealthStatus: ProxyHealthStatus;
  proxyHealthMessage: string;
  onValidateProxyConnection: () => void;
  onCopy: (text: string) => void;
}

export function ProxyAdminPanel({
  settings,
  apiDefaults,
  currentProxyUrl,
  proxyHealthStatus,
  proxyHealthMessage,
  onValidateProxyConnection,
  onCopy
}: ProxyAdminPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [latestHealth, setLatestHealth] = useState<ProxyHealthResult | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');
  const hasProxyToken = Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken);

  function serviceUrlSummary(health: ProxyHealthResult | null): string {
    if (!health?.serviceUrls) {
      return '';
    }

    const rows = [
      [t('proxy.admin.local'), health.serviceUrls.local || []],
      [t('proxy.admin.lan'), health.serviceUrls.lan || []],
      [t('proxy.admin.public'), health.serviceUrls.public || []]
    ];

    return rows
      .map(([label, urls]) => `${label}: ${(urls as string[]).length > 0 ? (urls as string[]).join(', ') : t('proxy.admin.notProvided')}`)
      .join('\n');
  }

  const summary = useMemo(() => {
    const health = latestHealth;

    function serviceUrlSummaryInner(h: ProxyHealthResult | null): string {
      if (!h?.serviceUrls) {
        return '';
      }

      const rows = [
        [t('proxy.admin.local'), h.serviceUrls.local || []],
        [t('proxy.admin.lan'), h.serviceUrls.lan || []],
        [t('proxy.admin.public'), h.serviceUrls.public || []]
      ];

      return rows
        .map(([label, urls]) => `${label}: ${(urls as string[]).length > 0 ? (urls as string[]).join(', ') : t('proxy.admin.notProvided')}`)
        .join('\n');
    }

    return [
      `${t('proxy.admin.proxyAddress')}: ${currentProxyUrl || t('proxy.admin.notConfigured')}`,
      `${t('proxy.admin.connectionStatus')}: ${health ? (health.ok ? t('proxy.admin.available') : t('proxy.admin.unavailable')) : proxyHealthStatus}`,
      `${t('proxy.admin.providerCount')}: ${health?.providerCount ?? t('proxy.admin.unknown')}`,
      `Token ${t('proxy.admin.tokenCount')}: ${health?.tokenCount ?? t('proxy.admin.unknown')}`,
      `${t('proxy.admin.rateLimit')}: ${health?.rateLimitEnabled ? t('proxy.admin.enabled') : t('proxy.admin.notEnabledOrUnknown')}`,
      `${t('proxy.admin.announcements')}: ${health?.announcementEnabled === undefined ? t('proxy.admin.unknown') : health.announcementEnabled ? t('proxy.admin.enabledCount', { count: health.announcementCount ?? 0 }) : t('proxy.admin.notEnabled')}`,
      serviceUrlSummaryInner(health)
    ]
      .filter(Boolean)
      .join('\n');
  }, [currentProxyUrl, latestHealth, proxyHealthStatus, t]);

  const refreshDetails = async (): Promise<void> => {
    setIsLoadingDetails(true);
    setDetailError('');

    try {
      const health = await window.studyTutor.checkProxyHealth(currentProxyUrl);
      setLatestHealth(health);
      if (!health.ok) {
        setDetailError(health.message);
      }
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : String(caught));
      setLatestHealth(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div className="proxy-admin-page">
      <div className="proxy-admin-summary">
        <strong>{t('proxy.admin.title')}</strong>
        <span>{t('proxy.admin.desc')}</span>
      </div>
      <div className={`proxy-validation-result ${proxyHealthStatus === 'error' || detailError ? 'danger' : ''}`}>
        {detailError || proxyHealthMessage || (currentProxyUrl ? t('proxy.admin.notRefreshed') : t('proxy.admin.notConfigured'))}
      </div>
      <dl className="proxy-admin-grid">
        <div>
          <dt>{t('proxy.admin.currentAddress')}</dt>
          <dd>{currentProxyUrl || t('proxy.admin.notConfigured')}</dd>
        </div>
        <div>
          <dt>{t('proxy.admin.accessToken')}</dt>
          <dd>{hasProxyToken ? t('proxy.admin.tokenSaved') : t('proxy.admin.tokenNotSet')}</dd>
        </div>
        <div>
          <dt>{t('proxy.admin.providerCount')}</dt>
          <dd>{latestHealth?.providerCount ?? t('proxy.admin.unknown')}</dd>
        </div>
        <div>
          <dt>{t('proxy.admin.tokenCount')}</dt>
          <dd>{latestHealth?.tokenCount ?? t('proxy.admin.unknown')}</dd>
        </div>
        <div>
          <dt>{t('proxy.admin.rateLimit')}</dt>
          <dd>{latestHealth?.rateLimitEnabled ? t('proxy.admin.enabled') : t('proxy.admin.notEnabledOrUnknown')}</dd>
        </div>
        <div>
          <dt>{t('proxy.admin.announcements')}</dt>
          <dd>
            {latestHealth?.announcementEnabled === undefined
              ? t('proxy.admin.unknown')
              : latestHealth.announcementEnabled
                ? t('proxy.admin.enabledCount', { count: latestHealth.announcementCount ?? 0 })
                : t('proxy.admin.notEnabled')}
          </dd>
        </div>
      </dl>
      {latestHealth?.serviceUrls && (
        <div className="proxy-service-urls">
          <strong>{t('proxy.admin.serverUrls')}</strong>
          <pre>{serviceUrlSummary(latestHealth)}</pre>
        </div>
      )}
      <div className="settings-action-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => {
            onValidateProxyConnection();
            void refreshDetails();
          }}
          disabled={proxyHealthStatus === 'checking' || isLoadingDetails}
        >
          {proxyHealthStatus === 'checking' || isLoadingDetails ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {t('proxy.admin.refreshStatus')}
        </button>
        <button className="secondary-button" type="button" onClick={() => onCopy(summary)}>
          <Copy size={16} />
          {t('proxy.admin.copySummary')}
        </button>
      </div>
    </div>
  );
}
