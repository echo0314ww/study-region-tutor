import { Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { PointerEvent, RefObject } from 'react';
import React, { useMemo } from 'react';
import type {
  ApiConnectionMode,
  ApiModeSetting,
  ApiProviderOption,
  ApiRuntimeDefaults,
  DiagnosticResult,
  InputMode,
  ModelOption,
  OcrLanguage,
  ReasoningEffortSetting,
  TutorLanguage,
  TutorSettings,
  UpdateStatusEvent
} from '../../../shared/types';
import type { FloatingPosition, GuideKind, ProxyHealthStatus, SettingsView } from '../uiTypes';
import { BUILT_IN_PROXY_URL, CUSTOM_MODEL_VALUE, MODEL_PLACEHOLDER_VALUE } from '../constants';
import { normalizeReasoningEffort, reasoningHelpText, reasoningOptionsFor } from '../../../shared/reasoning';
import { hasDirectApiConfig } from '../uiUtils';
import { DiagnosticReport } from './DiagnosticReport';

export interface SettingsPanelProps {
  settingsPanelRef: RefObject<HTMLElement | null>;
  settings: TutorSettings;
  settingsView: SettingsView;
  apiDefaults: ApiRuntimeDefaults | null;
  apiProviders: ApiProviderOption[];
  modelOptions: ModelOption[];
  modelListError: string;
  isModelListLoading: boolean;
  isModelCustom: boolean;
  proxyHealthStatus: ProxyHealthStatus;
  proxyHealthMessage: string;
  appVersion: string;
  updateStatus: UpdateStatusEvent;
  diagnosticResult: DiagnosticResult | null;
  diagnosticError: string;
  isDiagnosticsRunning: boolean;
  settingsPanelPosition: FloatingPosition | null;
  onSettingsChange: (updater: (current: TutorSettings) => TutorSettings) => void;
  onSettingsViewChange: (view: SettingsView) => void;
  onProxyHealthStatusChange: (status: ProxyHealthStatus) => void;
  onProxyHealthMessageChange: (message: string) => void;
  onIsModelCustomChange: (custom: boolean) => void;
  onClose: () => void;
  onSelectApiConnectionMode: (mode: ApiConnectionMode) => void;
  onSelectApiProvider: (providerId: string) => void;
  onRefreshApiProviders: () => void;
  onLoadModels: () => void;
  onValidateProxyConnection: () => void;
  onRunDiagnostics: () => void;
  onCopyDiagnosticReport: (text: string) => void;
  onOpenGuide: (kind: GuideKind) => void;
  onDragPointerDown: (event: PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function SettingsPanel({
  settingsPanelRef,
  settings,
  settingsView,
  apiDefaults,
  apiProviders,
  modelOptions,
  modelListError,
  isModelListLoading,
  isModelCustom,
  proxyHealthStatus,
  proxyHealthMessage,
  appVersion,
  updateStatus,
  diagnosticResult,
  diagnosticError,
  isDiagnosticsRunning,
  settingsPanelPosition,
  onSettingsChange,
  onSettingsViewChange,
  onProxyHealthStatusChange,
  onProxyHealthMessageChange,
  onIsModelCustomChange,
  onClose,
  onSelectApiConnectionMode,
  onSelectApiProvider,
  onRefreshApiProviders,
  onLoadModels,
  onValidateProxyConnection,
  onRunDiagnostics,
  onCopyDiagnosticReport,
  onOpenGuide,
  onDragPointerDown,
  onPointerEnter,
  onPointerLeave
}: SettingsPanelProps): JSX.Element {
  const isProxyConnection = settings.apiConnectionMode === 'proxy';
  const manualProxyUrl = settings.proxyUrl.trim();
  const currentProxyUrl = manualProxyUrl || BUILT_IN_PROXY_URL || apiDefaults?.proxyUrl || '';
  const isBuiltInProxyUrlActive = Boolean(!manualProxyUrl && BUILT_IN_PROXY_URL && currentProxyUrl === BUILT_IN_PROXY_URL);
  const hasProxyToken = Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken);
  const localEnvPath = apiDefaults?.localEnvPath || '%APPDATA%\\study-region-tutor\\.env.local';
  const isDirectSetupUnavailable = Boolean(
    !isProxyConnection && (modelListError || (apiDefaults && !hasDirectApiConfig(apiDefaults)))
  );
  const currentProvider = useMemo(() => {
    if (settings.providerId.trim()) {
      return apiProviders.find((provider) => provider.id === settings.providerId);
    }

    return apiProviders.find((provider) => provider.isDefault) || apiProviders[0];
  }, [apiProviders, settings.providerId]);
  const currentProviderType = currentProvider?.apiProviderType || 'openai-compatible';
  const reasoningOptions = useMemo(
    () => reasoningOptionsFor(currentProviderType, settings.model),
    [currentProviderType, settings.model]
  );
  const reasoningSelectValue = normalizeReasoningEffort(settings.reasoningEffort, currentProviderType, settings.model);
  const reasoningStatusText = reasoningHelpText(currentProviderType, settings.model);

  const modelIds = useMemo(() => new Set(modelOptions.map((model) => model.id)), [modelOptions]);
  const modelSelectValue = isModelCustom
    ? CUSTOM_MODEL_VALUE
    : settings.model.trim()
    ? modelIds.has(settings.model.trim())
      ? settings.model.trim()
      : CUSTOM_MODEL_VALUE
    : MODEL_PLACEHOLDER_VALUE;
  const modelStatusText = isModelListLoading
    ? '正在获取模型列表...'
    : modelListError || (modelOptions.length > 0 ? `已加载 ${modelOptions.length} 个模型` : '尚未加载模型列表');

  const isCheckingUpdate = updateStatus.status === 'checking';
  const isDownloadingUpdate = updateStatus.status === 'downloading';
  const isUpdateBusy = isCheckingUpdate || isDownloadingUpdate;
  const canDownloadUpdate = updateStatus.status === 'available';
  const updateMessage = [
    appVersion ? `当前版本：${appVersion}` : '',
    updateStatus.version ? `最新版本：${updateStatus.version}` : '',
    updateStatus.message
  ]
    .filter(Boolean)
    .join(' · ');

  const proxyHealthText = useMemo(() => {
    const proxyKind = isBuiltInProxyUrlActive ? '默认代理服务地址' : '自定义代理服务地址';

    if (!currentProxyUrl) {
      return '未配置默认代理服务地址，请到高级设置自行配置远程服务地址。';
    }

    if (proxyHealthStatus === 'checking') {
      return `正在检测${proxyKind}...`;
    }

    if (proxyHealthStatus === 'success') {
      return `${proxyKind}连接成功。`;
    }

    if (proxyHealthStatus === 'error') {
      return isBuiltInProxyUrlActive
        ? '默认代理服务地址连接失败，请到高级设置自行配置远程服务地址。'
        : `代理服务地址连接失败，请检查地址是否正确，或向开发者申请正确代理服务地址。
        失败原因：${proxyHealthMessage || '请检查高级设置。'}`;
    }

    return isBuiltInProxyUrlActive ? '默认代理服务地址待检测。' : '代理服务地址待检测。';
  }, [currentProxyUrl, isBuiltInProxyUrlActive, proxyHealthMessage, proxyHealthStatus]);

  const proxyValidationText = useMemo(() => {
    const isUsingDefaultProxyUrl = !settings.proxyUrl.trim();

    if (proxyHealthStatus === 'checking') {
      return '正在验证代理服务地址...';
    }

    if (proxyHealthStatus === 'success') {
      return isUsingDefaultProxyUrl
        ? '默认代理服务地址连接成功，可以返回普通设置选择 API 服务。'
        : '代理服务地址连接成功，可以返回普通设置选择 API 服务。';
    }

    if (proxyHealthStatus === 'error') {
      return isUsingDefaultProxyUrl
        ? '默认代理服务地址连接失败，请检查地址是否正确，或向开发者申请正确代理服务地址。'
        : `代理服务地址连接失败，请检查地址是否正确，或向开发者申请正确代理服务地址。${proxyHealthMessage ? ` ${proxyHealthMessage}` : ''}`;
    }

    return proxyHealthMessage;
  }, [proxyHealthMessage, proxyHealthStatus, settings.proxyUrl]);

  return (
    <aside
      ref={settingsPanelRef as React.RefObject<HTMLElement>}
      className="settings-panel"
      aria-label="settings"
      data-interactive="true"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={
        settingsPanelPosition
          ? {
              left: settingsPanelPosition.x,
              top: settingsPanelPosition.y,
              right: 'auto'
            }
          : undefined
      }
    >
      <div className="panel-header" onPointerDown={onDragPointerDown}>
        <div className="settings-title-row">
          <strong>{settingsView === 'proxyAdvanced' ? '高级设置' : '设置'}</strong>
          {settingsView === 'normal' && isProxyConnection && (
            <button
              className="secondary-button settings-advanced-button"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                onProxyHealthStatusChange('idle');
                onProxyHealthMessageChange('');
                onSettingsViewChange('proxyAdvanced');
              }}
            >
              高级设置
            </button>
          )}
          {settingsView === 'proxyAdvanced' && (
            <button
              className="secondary-button settings-advanced-button"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSettingsViewChange('normal')}
            >
              返回普通设置
            </button>
          )}
        </div>
        <button
          className="icon-button ghost"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          title="关闭"
        >
          <X size={18} />
        </button>
      </div>
      {settingsView === 'proxyAdvanced' ? (
        <div className="proxy-advanced-page">
          <label>
            代理服务地址
            <input
              value={settings.proxyUrl}
              onChange={(event) => {
                onSettingsChange((current) => ({ ...current, proxyUrl: event.target.value }));
                onProxyHealthStatusChange('idle');
                onProxyHealthMessageChange('');
              }}
              placeholder="留空使用默认代理服务地址"
              spellCheck={false}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={onValidateProxyConnection}
            disabled={proxyHealthStatus === 'checking'}
          >
            {proxyHealthStatus === 'checking' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            {proxyHealthStatus === 'checking' ? '验证中...' : '验证是否连接成功'}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onSettingsChange((current) => ({ ...current, proxyUrl: '' }));
              onProxyHealthStatusChange('idle');
              onProxyHealthMessageChange('已恢复默认地址，请点击验证是否连接成功。');
            }}
            disabled={!settings.proxyUrl.trim()}
          >
            恢复默认地址
          </button>
          {proxyValidationText && (
            <div className={`proxy-validation-result ${proxyHealthStatus === 'error' ? 'danger' : ''}`} aria-live="polite">
              {proxyValidationText}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="settings-guide-row">
            <button className="secondary-button" type="button" onClick={() => onOpenGuide('product')}>
              整体功能向导
            </button>
            <button className="secondary-button" type="button" onClick={() => onOpenGuide('release')}>
              本版本新增向导
            </button>
            <button className="secondary-button" type="button" onClick={() => onOpenGuide('history')}>
              历史版本向导回顾
            </button>
          </div>
          <div className="update-box">
            <div>
              <strong>应用更新</strong>
              <span className={`model-status ${updateStatus.status === 'error' ? 'danger' : ''}`}>{updateMessage}</span>
            </div>
            <div className="update-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => void window.studyTutor.checkForUpdates()}
                disabled={isUpdateBusy}
              >
                {isCheckingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                检查更新
              </button>
              {(canDownloadUpdate || isDownloadingUpdate) && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void window.studyTutor.downloadUpdate()}
                  disabled={!canDownloadUpdate || isDownloadingUpdate}
                >
                  {isDownloadingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                  {isDownloadingUpdate ? '下载中' : '立即更新'}
                </button>
              )}
              {updateStatus.status === 'downloaded' && (
                <button className="secondary-button" type="button" onClick={() => void window.studyTutor.installUpdate()}>
                  <Check size={16} />
                  重启安装
                </button>
              )}
            </div>
          </div>
          <div className="diagnostic-box">
            <div className="diagnostic-box-header">
              <div>
                <strong>一键诊断</strong>
                <span>检查配置、代理、Token、服务商、模型列表和当前模型，并给出修复建议。</span>
              </div>
              <button className="secondary-button" type="button" onClick={onRunDiagnostics} disabled={isDiagnosticsRunning}>
                {isDiagnosticsRunning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                {isDiagnosticsRunning ? '诊断中' : '开始诊断'}
              </button>
            </div>
            {diagnosticError && <div className="proxy-validation-result danger">{diagnosticError}</div>}
            {diagnosticResult && (
              <DiagnosticReport
                result={diagnosticResult}
                onCopy={onCopyDiagnosticReport}
              />
            )}
          </div>
          <label>
            API 连接模式
            <select
              value={settings.apiConnectionMode}
              onChange={(event) => onSelectApiConnectionMode(event.target.value as ApiConnectionMode)}
            >
              <option value="direct">本地直连</option>
              <option value="proxy">代理服务</option>
            </select>
            <span className="model-status">
              {isProxyConnection
                ? '通过本机/局域网代理服务接收公告；填写 Token 后可转发 API 请求，用户端不需要保存第三方 API Key。'
                : '应用直接读取本机配置或设置面板里的第三方 API 配置。'}
            </span>
          </label>
          {isDirectSetupUnavailable ? (
            <div className="direct-setup-guide" aria-live="polite">
              <strong>本地直连还没有配置完成</strong>
              <span>本地直连需要在这台电脑上配置第三方 API 后才能使用。</span>
              <div className="direct-setup-path">
                <span>请创建或编辑这个文件：</span>
                <code>{localEnvPath}</code>
              </div>
              <div className="direct-setup-path">
                <span>最少填写：</span>
                <code>AI_BASE_URL=https://你的第三方-api地址/v1</code>
                <code>AI_API_KEY=你的第三方 API Key</code>
              </div>
              <span>保存后重启应用，再回到这里刷新模型列表。也可以切换为&ldquo;代理服务&rdquo;模式，填写开发者提供的 TUTOR_PROXY_TOKEN。</span>
            </div>
          ) : (
            <>
          {isProxyConnection && (
            <>
              <div className={`proxy-summary ${proxyHealthStatus === 'error' ? 'danger' : ''}`}>
                <strong>代理服务地址</strong>
                <span>{proxyHealthText}</span>
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
                  {settings.proxyToken.trim()
                    ? '将使用当前输入的 Token；刷新代理服务商成功后会保存到本机。'
                    : hasProxyToken
                      ? '已保存代理访问 Token，可直接使用 API 代理。'
                      : '未填写 Token 时仍可接收公告；使用 API 代理需填写 TUTOR_PROXY_TOKEN。'}
                </span>
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={onRefreshApiProviders}
                disabled={isModelListLoading}
              >
                {isModelListLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                刷新代理服务商
              </button>
            </>
          )}
          <label>
            API 服务商
            <select value={settings.providerId} onChange={(event) => onSelectApiProvider(event.target.value)}>
              {apiProviders.length === 0 && <option value="">{isProxyConnection ? '请先刷新代理服务商' : '手动配置'}</option>}
              {!isProxyConnection && apiProviders.length > 0 && <option value="">手动配置/不使用预设</option>}
              {apiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.isDefault ? `${provider.name}（默认）` : provider.name}
                </option>
              ))}
            </select>
          </label>
          {!isProxyConnection && (
            <label>
              接口模式
              <select
                value={settings.apiMode}
                onChange={(event) =>
                  onSettingsChange((current) => ({ ...current, apiMode: event.target.value as ApiModeSetting }))
                }
              >
                <option value="env">使用当前 API 配置</option>
                <option value="chat-completions">Chat Completions 兼容</option>
                <option value="responses">Responses 兼容</option>
              </select>
            </label>
          )}
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
          <label>
            思考程度
            <select
              value={reasoningSelectValue}
              onChange={(event) =>
                onSettingsChange((current) => ({
                  ...current,
                  reasoningEffort: event.target.value as ReasoningEffortSetting
                }))
              }
            >
              {reasoningOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="model-status">{reasoningStatusText}</span>
          </label>
          <label>
            输入方式
            <select
              value={settings.inputMode}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, inputMode: event.target.value as InputMode }))
              }
            >
              <option value="image">直接发送图片</option>
              <option value="ocr-text">本地 OCR 后发文字</option>
            </select>
          </label>
          <label>
            OCR 语言
            <select
              value={settings.ocrLanguage}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, ocrLanguage: event.target.value as OcrLanguage }))
              }
              disabled={settings.inputMode !== 'ocr-text'}
            >
              <option value="chi_sim">中文</option>
              <option value="eng">English</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.ocrMathMode}
              disabled={settings.inputMode !== 'ocr-text'}
              onChange={(event) => onSettingsChange((current) => ({ ...current, ocrMathMode: event.target.checked }))}
            />
            数学公式增强
          </label>
          <label>
            语言
            <select
              value={settings.language}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, language: event.target.value as TutorLanguage }))
              }
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.reasoningOnly}
              onChange={(event) => onSettingsChange((current) => ({ ...current, reasoningOnly: event.target.checked }))}
            />
            只讲思路
          </label>
            </>
          )}
        </>
      )}
    </aside>
  );
}
