import { Copy, Loader2, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiRuntimeDefaults, ProxyHealthResult, TutorSettings } from '../../../shared/types';
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

function serviceUrlSummary(health: ProxyHealthResult | null): string {
  if (!health?.serviceUrls) {
    return '';
  }

  const rows = [
    ['本机', health.serviceUrls.local || []],
    ['局域网', health.serviceUrls.lan || []],
    ['公网', health.serviceUrls.public || []]
  ];

  return rows
    .map(([label, urls]) => `${label}: ${(urls as string[]).length > 0 ? (urls as string[]).join(', ') : '未提供'}`)
    .join('\n');
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
  const [latestHealth, setLatestHealth] = useState<ProxyHealthResult | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailError, setDetailError] = useState('');
  const hasProxyToken = Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken);

  const summary = useMemo(() => {
    const health = latestHealth;

    return [
      `代理地址: ${currentProxyUrl || '未配置'}`,
      `连接状态: ${health ? (health.ok ? '可用' : '不可用') : proxyHealthStatus}`,
      `服务商数量: ${health?.providerCount ?? '未知'}`,
      `Token 数量: ${health?.tokenCount ?? '未知'}`,
      `限流: ${health?.rateLimitEnabled ? '已启用' : '未启用或未知'}`,
      `公告: ${health?.announcementEnabled === undefined ? '未知' : health.announcementEnabled ? `已启用，${health.announcementCount ?? 0} 条` : '未启用'}`,
      serviceUrlSummary(health)
    ]
      .filter(Boolean)
      .join('\n');
  }, [currentProxyUrl, latestHealth, proxyHealthStatus]);

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
        <strong>代理管理面板</strong>
        <span>用于确认代理服务地址、Token 状态、服务商数量、公告状态和服务端暴露的访问地址。</span>
      </div>
      <div className={`proxy-validation-result ${proxyHealthStatus === 'error' || detailError ? 'danger' : ''}`}>
        {detailError || proxyHealthMessage || (currentProxyUrl ? '尚未刷新代理详情。' : '未配置代理地址。')}
      </div>
      <dl className="proxy-admin-grid">
        <div>
          <dt>当前地址</dt>
          <dd>{currentProxyUrl || '未配置'}</dd>
        </div>
        <div>
          <dt>访问 Token</dt>
          <dd>{hasProxyToken ? '已保存或本次已填写' : '未填写'}</dd>
        </div>
        <div>
          <dt>服务商数量</dt>
          <dd>{latestHealth?.providerCount ?? '未知'}</dd>
        </div>
        <div>
          <dt>代理 Token 数量</dt>
          <dd>{latestHealth?.tokenCount ?? '未知'}</dd>
        </div>
        <div>
          <dt>限流</dt>
          <dd>{latestHealth?.rateLimitEnabled ? '已启用' : '未启用或未知'}</dd>
        </div>
        <div>
          <dt>公告</dt>
          <dd>
            {latestHealth?.announcementEnabled === undefined
              ? '未知'
              : latestHealth.announcementEnabled
                ? `已启用，${latestHealth.announcementCount ?? 0} 条`
                : '未启用'}
          </dd>
        </div>
      </dl>
      {latestHealth?.serviceUrls && (
        <div className="proxy-service-urls">
          <strong>服务端地址</strong>
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
          刷新代理状态
        </button>
        <button className="secondary-button" type="button" onClick={() => onCopy(summary)}>
          <Copy size={16} />
          复制摘要
        </button>
      </div>
    </div>
  );
}
