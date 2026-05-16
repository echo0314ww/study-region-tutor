import { Check, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  ApiConnectionMode,
  ApiProviderOption,
  ApiRuntimeDefaults,
  ModelOption,
  TutorSettings
} from '../../../shared/types';
import type { ProxyHealthStatus } from '../uiTypes';
import { CUSTOM_MODEL_VALUE, MODEL_PLACEHOLDER_VALUE } from '../constants';
import { useFocusTrap } from '../useFocusTrap';
import { hasDirectApiConfig, shortcutActionLabel, shortcutBindings } from '../uiUtils';

export interface SetupWizardProps {
  settings: TutorSettings;
  apiDefaults: ApiRuntimeDefaults | null;
  apiProviders: ApiProviderOption[];
  modelOptions: ModelOption[];
  modelListError: string;
  isModelListLoading: boolean;
  isModelCustom: boolean;
  proxyHealthStatus: ProxyHealthStatus;
  proxyHealthMessage: string;
  appVersion: string;
  currentProxyUrl: string;
  canComplete: boolean;
  onSettingsChange: (updater: (current: TutorSettings) => TutorSettings) => void;
  onSelectApiConnectionMode: (mode: ApiConnectionMode) => void;
  onSelectApiProvider: (providerId: string) => void;
  onRefreshApiProviders: () => void;
  onLoadModels: () => void;
  onValidateProxyConnection: () => void;
  onIsModelCustomChange: (custom: boolean) => void;
  onComplete: () => void;
  onDismiss: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function SetupWizard({
  settings,
  apiDefaults,
  apiProviders,
  modelOptions,
  modelListError,
  isModelListLoading,
  isModelCustom,
  proxyHealthStatus,
  proxyHealthMessage,
  appVersion,
  currentProxyUrl,
  canComplete,
  onSettingsChange,
  onSelectApiConnectionMode,
  onSelectApiProvider,
  onRefreshApiProviders,
  onLoadModels,
  onValidateProxyConnection,
  onIsModelCustomChange,
  onComplete,
  onDismiss,
  onPointerEnter,
  onPointerLeave
}: SetupWizardProps): JSX.Element {
  const trapRef = useFocusTrap<HTMLElement>();
  const [stepIndex, setStepIndex] = useState(0);
  const isProxyConnection = settings.apiConnectionMode === 'proxy';
  const localEnvPath = apiDefaults?.localEnvPath || '%APPDATA%\\study-region-tutor\\.env.local';
  const hasProxyToken = Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken);
  const directConfigured = hasDirectApiConfig(apiDefaults);
  const modelIds = useMemo(() => new Set(modelOptions.map((model) => model.id)), [modelOptions]);
  const modelSelectValue = isModelCustom
    ? CUSTOM_MODEL_VALUE
    : settings.model.trim()
      ? modelIds.has(settings.model.trim())
        ? settings.model.trim()
        : CUSTOM_MODEL_VALUE
      : MODEL_PLACEHOLDER_VALUE;
  const steps = ['连接方式', isProxyConnection ? '代理连接' : '本地配置', '服务商与模型', '快捷键'];
  const isLastStep = stepIndex === steps.length - 1;

  const modelStatusText = isModelListLoading
    ? '正在获取模型列表...'
    : modelListError || (modelOptions.length > 0 ? `已加载 ${modelOptions.length} 个模型` : '尚未加载模型列表');

  return (
    <section
      ref={trapRef}
      className="setup-wizard"
      data-interactive="true"
      role="dialog"
      aria-modal="true"
      aria-label="first setup wizard"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="setup-wizard-header">
        <div>
          <strong>首次配置向导</strong>
          <span>{appVersion ? `当前版本 ${appVersion}` : '按步骤完成基本配置'}</span>
        </div>
        <button className="icon-button ghost" type="button" onClick={onDismiss} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="setup-wizard-progress">
        {steps.map((step, index) => (
          <button
            key={step}
            type="button"
            className={index === stepIndex ? 'active' : ''}
            aria-current={index === stepIndex ? 'step' : undefined}
            onClick={() => setStepIndex(index)}
          >
            <span>{index + 1}</span>
            {step}
          </button>
        ))}
      </div>
      <div className="setup-wizard-body">
        {stepIndex === 0 && (
          <div className="setup-step">
            <h2>选择 API 连接方式</h2>
            <div className="setup-choice-grid">
              <button
                className={settings.apiConnectionMode === 'direct' ? 'active' : ''}
                type="button"
                onClick={() => onSelectApiConnectionMode('direct')}
              >
                <strong>本地直连</strong>
                <span>API Key 保存在本机配置文件中，适合自己维护服务商配置。</span>
              </button>
              <button
                className={settings.apiConnectionMode === 'proxy' ? 'active' : ''}
                type="button"
                onClick={() => onSelectApiConnectionMode('proxy')}
              >
                <strong>代理服务</strong>
                <span>客户端只保存代理 Token，由代理端统一管理第三方 API Key。</span>
              </button>
            </div>
          </div>
        )}
        {stepIndex === 1 && !isProxyConnection && (
          <div className="setup-step">
            <h2>检查本地配置</h2>
            <p className="setup-copy">本地直连需要可用的第三方 API 配置。配置文件位置如下：</p>
            <code>{localEnvPath}</code>
            <div className={`setup-status ${directConfigured ? '' : 'warning'}`}>
              {directConfigured ? '已读取到本地 API 配置。' : '尚未读取到完整本地 API 配置。'}
            </div>
            <div className="setup-code-list">
              <code>AI_BASE_URL=https://你的第三方-api地址/v1</code>
              <code>AI_API_KEY=你的第三方 API Key</code>
            </div>
          </div>
        )}
        {stepIndex === 1 && isProxyConnection && (
          <div className="setup-step">
            <h2>配置代理连接</h2>
            <label>
              代理服务地址
              <input
                value={settings.proxyUrl}
                onChange={(event) => onSettingsChange((current) => ({ ...current, proxyUrl: event.target.value }))}
                placeholder="留空使用默认代理服务地址"
                spellCheck={false}
              />
            </label>
            <div className="setup-inline-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={onValidateProxyConnection}
                disabled={proxyHealthStatus === 'checking'}
              >
                {proxyHealthStatus === 'checking' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                验证代理
              </button>
              <span className={`model-status ${proxyHealthStatus === 'error' ? 'danger' : ''}`}>
                {proxyHealthStatus === 'checking'
                  ? '正在验证代理连接...'
                  : proxyHealthStatus === 'success'
                    ? `代理可用：${currentProxyUrl}`
                    : proxyHealthMessage || '尚未验证代理连接。'}
              </span>
            </div>
            <label>
              代理访问 Token
              <input
                type="password"
                value={settings.proxyToken}
                onChange={(event) => onSettingsChange((current) => ({ ...current, proxyToken: event.target.value }))}
                placeholder="首次填写后会记住；留空使用已保存 Token"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="model-status">
                {hasProxyToken ? '已具备代理访问 Token。' : '使用 API 代理前需要填写开发者提供的 Token。'}
              </span>
            </label>
          </div>
        )}
        {stepIndex === 2 && (
          <div className="setup-step">
            <h2>选择服务商与模型</h2>
            {isProxyConnection && (
              <button
                className="secondary-button"
                type="button"
                onClick={onRefreshApiProviders}
                disabled={isModelListLoading}
              >
                {isModelListLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                刷新代理服务商
              </button>
            )}
            <label>
              API 服务商
              <select value={settings.providerId} onChange={(event) => onSelectApiProvider(event.target.value)}>
                {apiProviders.length === 0 && <option value="">暂无可选服务商</option>}
                {!isProxyConnection && apiProviders.length > 0 && <option value="">手动配置/不使用预设</option>}
                {apiProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.isDefault ? `${provider.name}（默认）` : provider.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              模型
              <div className="model-picker">
                <select
                  value={modelSelectValue}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (value === CUSTOM_MODEL_VALUE) {
                      onIsModelCustomChange(true);
                      onSettingsChange((current) => ({ ...current, model: current.model || '' }));
                      return;
                    }

                    if (value === MODEL_PLACEHOLDER_VALUE) {
                      onIsModelCustomChange(false);
                      onSettingsChange((current) => ({ ...current, model: '' }));
                      return;
                    }

                    onIsModelCustomChange(false);
                    onSettingsChange((current) => ({ ...current, model: value }));
                  }}
                >
                  <option value={MODEL_PLACEHOLDER_VALUE} disabled>
                    请选择模型
                  </option>
                  {modelOptions.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.ownedBy ? `${model.id} · ${model.ownedBy}` : model.id}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_VALUE}>手动填写模型名</option>
                </select>
                <button
                  className="icon-button"
                  type="button"
                  onClick={onLoadModels}
                  disabled={isModelListLoading}
                  title="刷新模型列表"
                >
                  {isModelListLoading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                </button>
              </div>
              {modelSelectValue === CUSTOM_MODEL_VALUE && (
                <input
                  value={settings.model}
                  onChange={(event) => onSettingsChange((current) => ({ ...current, model: event.target.value }))}
                  placeholder="输入服务商支持的模型名"
                  spellCheck={false}
                />
              )}
              <span className={`model-status ${modelListError ? 'danger' : ''}`}>{modelStatusText}</span>
            </label>
          </div>
        )}
        {stepIndex === 3 && (
          <div className="setup-step">
            <h2>确认默认快捷键</h2>
            <div className="setup-shortcut-list">
              {shortcutBindings(settings).map((shortcut) => (
                <div key={shortcut.action}>
                  <span>{shortcutActionLabel(shortcut.action)}</span>
                  <kbd>{shortcut.enabled ? shortcut.key : '已停用'}</kbd>
                </div>
              ))}
            </div>
            <p className="setup-copy">这些快捷键已默认启用，后续可以在设置中逐项修改或停用。</p>
          </div>
        )}
      </div>
      <div className="setup-wizard-actions">
        <button
          className="secondary-button"
          type="button"
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          disabled={stepIndex === 0}
        >
          <ChevronLeft size={16} />
          上一步
        </button>
        {isLastStep ? (
          <button className="primary-button" type="button" onClick={onComplete} disabled={!canComplete}>
            <Check size={16} />
            完成配置
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
          >
            下一步
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
