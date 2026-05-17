import {
  BarChart2,
  BookOpen,
  Check,
  FileCode2,
  Info,
  Keyboard,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  RotateCcw,
  Settings,
  Wand2,
  Wrench,
  X
} from 'lucide-react';
import type { PointerEvent, RefObject } from 'react';
import React, { useEffect, useMemo, useState } from 'react';
import type {
  ApiConnectionMode,
  ApiModeSetting,
  ApiProviderOption,
  ApiRuntimeDefaults,
  DiagnosticResult,
  InputMode,
  ModelOption,
  OcrLanguage,
  OcrPreprocessMode,
  ReasoningEffortSetting,
  StudyLibraryExportFormat,
  ThemeSetting,
  TutorLanguage,
  TutorSettings,
  UpdateStatusEvent
} from '../../../shared/types';
import type {
  FloatingPosition,
  GuideKind,
  ProxyHealthStatus,
  SettingsView,
  StudyItem,
  StudyItemPatch,
  StudyReviewGrade
} from '../uiTypes';
import { BUILT_IN_PROXY_URL, CUSTOM_MODEL_VALUE, DEFAULT_SHORTCUTS, MODEL_PLACEHOLDER_VALUE } from '../constants';
import { normalizeReasoningEffort, reasoningHelpText, reasoningOptionsFor } from '../../../shared/reasoning';
import { hasDirectApiConfig, shortcutActionLabel, shortcutBindings, shortcutFromKeyboardEvent } from '../uiUtils';
import type { MessageKey } from '../i18n/types';
import { useTranslation } from '../i18n';
import { DiagnosticReport } from './DiagnosticReport';
import { ProxyAdminPanel } from './ProxyAdminPanel';
import { HistoryPanel } from './HistoryPanel';
import { ProviderConfigGenerator } from './ProviderConfigGenerator';
import { PromptTemplatePanel } from './PromptTemplatePanel';
import { EvalPanel } from './EvalPanel';
import { DashboardPanel } from './DashboardPanel';

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
  studyItems: StudyItem[];
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
  onRunDiagnostics: (deepCheck?: boolean) => void;
  onCopyDiagnosticReport: (text: string) => void;
  onOpenSetupWizard: () => void;
  onRestoreStudyItem: (item: StudyItem) => void;
  onUpdateStudyItem: (id: string, patch: StudyItemPatch) => void;
  onReviewStudyItem: (id: string, grade: StudyReviewGrade) => void;
  onDeleteStudyItem: (id: string) => void;
  onClearStudyItems: () => void;
  onReplaceStudyItems: (items: StudyItem[]) => void;
  onExportStudyItems: (format: StudyLibraryExportFormat, items: StudyItem[]) => void;
  studyLibraryExportStatus: string;
  onOpenGuide: (kind: GuideKind) => void;
  onDragPointerDown: (event: PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

type SettingsTab = 'basic' | 'library' | 'dashboard' | 'tools' | 'about';

const TAB_ICONS: Record<SettingsTab, typeof Settings> = {
  basic: Settings,
  library: BookOpen,
  dashboard: BarChart2,
  tools: Wrench,
  about: Info
};

const TAB_KEYS: SettingsTab[] = ['basic', 'library', 'dashboard', 'tools', 'about'];

const TAB_I18N_KEYS: Record<SettingsTab, MessageKey> = {
  basic: 'settings.tab.basic',
  library: 'settings.tab.library',
  dashboard: 'settings.tab.dashboard',
  tools: 'settings.tab.tools',
  about: 'settings.tab.about'
};

function tabForView(view: SettingsView): SettingsTab {
  if (view === 'history') return 'library';
  if (view === 'dashboard') return 'dashboard';
  if (view === 'eval' || view === 'promptTemplates' || view === 'providerGenerator' || view === 'proxyAdmin') return 'tools';
  if (view === 'setupGuide') return 'about';
  return 'basic';
}

function viewForTab(tab: SettingsTab): SettingsView {
  switch (tab) {
    case 'library': return 'history';
    case 'dashboard': return 'dashboard';
    case 'tools': return 'eval';
    case 'about': return 'normal';
    default: return 'normal';
  }
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
  studyItems,
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
  onOpenSetupWizard,
  onRestoreStudyItem,
  onUpdateStudyItem,
  onReviewStudyItem,
  onDeleteStudyItem,
  onClearStudyItems,
  onReplaceStudyItems,
  onExportStudyItems,
  studyLibraryExportStatus,
  onOpenGuide,
  onDragPointerDown,
  onPointerEnter,
  onPointerLeave
}: SettingsPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => tabForView(settingsView));
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
  const ocrDisabledReason = settings.inputMode !== 'ocr-text' ? t('settings.inputMode.ocrDisabled') : undefined;
  const activeShortcuts = useMemo(() => shortcutBindings(settings), [settings]);
  const shortcutConflictKeys = useMemo(() => {
    const counts = new Map<string, number>();

    for (const shortcut of activeShortcuts) {
      const key = shortcut.key.trim();

      if (shortcut.enabled && key) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    );
  }, [activeShortcuts]);

  const modelIds = useMemo(() => new Set(modelOptions.map((model) => model.id)), [modelOptions]);

  useEffect(() => {
    const trimmed = settings.model.trim();
    if (trimmed && modelIds.size > 0 && !modelIds.has(trimmed) && !isModelCustom) {
      onIsModelCustomChange(true);
    }
  }, [settings.model, modelIds, isModelCustom, onIsModelCustomChange]);

  const modelSelectValue = isModelCustom
    ? CUSTOM_MODEL_VALUE
    : settings.model.trim()
    ? modelIds.has(settings.model.trim())
      ? settings.model.trim()
      : CUSTOM_MODEL_VALUE
    : MODEL_PLACEHOLDER_VALUE;
  const modelStatusText = isModelListLoading
    ? t('settings.model.loading')
    : modelListError || (modelOptions.length > 0 ? t('settings.model.loaded', { count: modelOptions.length }) : t('settings.model.notLoaded'));

  const isCheckingUpdate = updateStatus.status === 'checking';
  const isDownloadingUpdate = updateStatus.status === 'downloading';
  const isUpdateBusy = isCheckingUpdate || isDownloadingUpdate;
  const canDownloadUpdate = updateStatus.status === 'available';
  const updateMessage = [
    appVersion ? t('update.currentVersion', { version: appVersion }) : '',
    updateStatus.version ? t('update.latestVersion', { version: updateStatus.version }) : '',
    updateStatus.message || t('update.notChecked')
  ]
    .filter(Boolean)
    .join(' · ');

  const proxyHealthText = useMemo(() => {
    const proxyKind = isBuiltInProxyUrlActive ? t('proxy.url') : t('proxy.url');

    if (!currentProxyUrl) {
      return t('proxy.health.noUrl');
    }

    if (proxyHealthStatus === 'checking') {
      return t('proxy.health.checking', { proxyKind });
    }

    if (proxyHealthStatus === 'success') {
      return t('proxy.health.success', { proxyKind });
    }

    if (proxyHealthStatus === 'error') {
      return isBuiltInProxyUrlActive
        ? t('proxy.health.errorDefault')
        : t('proxy.health.errorCustom', { reason: proxyHealthMessage || t('settings.advanced') });
    }

    return isBuiltInProxyUrlActive ? t('proxy.health.idleDefault') : t('proxy.health.idleCustom');
  }, [currentProxyUrl, isBuiltInProxyUrlActive, proxyHealthMessage, proxyHealthStatus, t]);

  const proxyValidationText = useMemo(() => {
    const isUsingDefaultProxyUrl = !settings.proxyUrl.trim();

    if (proxyHealthStatus === 'checking') {
      return t('proxy.validation.checking');
    }

    if (proxyHealthStatus === 'success') {
      return isUsingDefaultProxyUrl
        ? t('proxy.validation.successDefault')
        : t('proxy.validation.successCustom');
    }

    if (proxyHealthStatus === 'error') {
      return isUsingDefaultProxyUrl
        ? t('proxy.validation.errorDefault')
        : t('proxy.validation.errorCustom', { reason: proxyHealthMessage ? ` ${proxyHealthMessage}` : '' });
    }

    return proxyHealthMessage;
  }, [proxyHealthMessage, proxyHealthStatus, settings.proxyUrl, t]);

  const handleTabClick = (tab: SettingsTab): void => {
    setActiveTab(tab);
    onSettingsViewChange(viewForTab(tab));
  };

  return (
    <aside
      ref={settingsPanelRef as React.RefObject<HTMLElement>}
      className="settings-panel"
      role="dialog"
      aria-modal="true"
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
          <strong>{t('settings.title')}</strong>
        </div>
        <button
          className="icon-button ghost"
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          title={t('app.close')}
        >
          <X size={18} />
        </button>
      </div>

      <div className="settings-tab-bar" role="tablist">
        {TAB_KEYS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              className={`settings-tab${activeTab === tab ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => handleTabClick(tab)}
            >
              <Icon size={14} />
              {t(TAB_I18N_KEYS[tab])}
            </button>
          );
        })}
      </div>

      <div className="settings-tab-content" key={activeTab}>
        {activeTab === 'basic' && (settingsView === 'proxyAdvanced' ? (
        <div className="proxy-advanced-page">
          <div className="settings-action-row">
            <button
              className="secondary-button settings-advanced-button"
              type="button"
              onClick={() => onSettingsViewChange('normal')}
            >
              {t('settings.backToNormal')}
            </button>
          </div>
          <label>
            {t('proxy.url')}
            <input
              value={settings.proxyUrl}
              onChange={(event) => {
                onSettingsChange((current) => ({ ...current, proxyUrl: event.target.value }));
                onProxyHealthStatusChange('idle');
                onProxyHealthMessageChange('');
              }}
              placeholder={t('proxy.urlPlaceholder')}
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
            {proxyHealthStatus === 'checking' ? t('proxy.validating') : t('proxy.validate')}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              onSettingsChange((current) => ({ ...current, proxyUrl: '' }));
              onProxyHealthStatusChange('idle');
              onProxyHealthMessageChange(t('proxy.defaultRestored'));
            }}
            disabled={!settings.proxyUrl.trim()}
          >
            {t('proxy.restoreDefault')}
          </button>
          {proxyValidationText && (
            <div className={`proxy-validation-result ${proxyHealthStatus === 'error' ? 'danger' : ''}`} aria-live="polite">
              {proxyValidationText}
            </div>
          )}
        </div>
      ) : (
        <>
          {isProxyConnection && settingsView === 'normal' && (
            <div className="settings-action-row" style={{ marginBottom: 12 }}>
              <button
                className="secondary-button settings-advanced-button"
                type="button"
                onClick={() => {
                  onProxyHealthStatusChange('idle');
                  onProxyHealthMessageChange('');
                  onSettingsViewChange('proxyAdvanced');
                }}
              >
                {t('settings.advanced')}
              </button>
            </div>
          )}
          <label>
            {t('settings.apiConnection')}
            <select
              value={settings.apiConnectionMode}
              onChange={(event) => onSelectApiConnectionMode(event.target.value as ApiConnectionMode)}
            >
              <option value="direct">{t('settings.apiConnection.direct')}</option>
              <option value="proxy">{t('settings.apiConnection.proxy')}</option>
            </select>
            <span className="model-status">
              {isProxyConnection
                ? t('settings.apiConnection.proxyDesc')
                : t('settings.apiConnection.directDesc')}
            </span>
          </label>
          {isDirectSetupUnavailable ? (
            <div className="direct-setup-guide" aria-live="polite">
              <strong>{t('directSetup.title')}</strong>
              <span>{t('directSetup.desc')}</span>
              <div className="direct-setup-path">
                <span>{t('directSetup.createFile')}</span>
                <code>{localEnvPath}</code>
              </div>
              <div className="direct-setup-path">
                <span>{t('directSetup.minFields')}</span>
                <code>{t('directSetup.baseUrlExample')}</code>
                <code>{t('directSetup.apiKeyExample')}</code>
              </div>
              <span>{t('directSetup.afterSave')}</span>
            </div>
          ) : (
            <>
          {isProxyConnection && (
            <>
              <div className={`proxy-summary ${proxyHealthStatus === 'error' ? 'danger' : ''}`}>
                <strong>{t('proxy.url')}</strong>
                <span>{proxyHealthText}</span>
              </div>
              <label>
                {t('proxy.token')}
                <input
                  type="password"
                  value={settings.proxyToken}
                  onChange={(event) => onSettingsChange((current) => ({ ...current, proxyToken: event.target.value }))}
                  placeholder={t('proxy.tokenPlaceholder')}
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="model-status">
                  {settings.proxyToken.trim()
                    ? t('proxy.tokenCurrent')
                    : hasProxyToken
                      ? t('proxy.tokenSaved')
                      : t('proxy.tokenNeeded')}
                </span>
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={onRefreshApiProviders}
                disabled={isModelListLoading}
              >
                {isModelListLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                {t('settings.apiProvider.refreshProxy')}
              </button>
            </>
          )}
          <label>
            {t('settings.apiProvider')}
            <select value={settings.providerId} onChange={(event) => onSelectApiProvider(event.target.value)}>
              {apiProviders.length === 0 && <option value="">{isProxyConnection ? t('settings.apiProvider.selectFirst') : t('settings.apiProvider.manual')}</option>}
              {!isProxyConnection && apiProviders.length > 0 && <option value="">{t('settings.apiProvider.manualAlt')}</option>}
              {apiProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.isDefault ? t('wizard.providerDefault', { name: provider.name }) : provider.name}
                </option>
              ))}
            </select>
          </label>
          {!isProxyConnection && (
            <label>
              {t('settings.apiMode')}
              <select
                value={settings.apiMode}
                onChange={(event) =>
                  onSettingsChange((current) => ({ ...current, apiMode: event.target.value as ApiModeSetting }))
                }
              >
                <option value="env">{t('settings.apiMode.env')}</option>
                <option value="chat-completions">{t('settings.apiMode.chatCompletions')}</option>
                <option value="responses">{t('settings.apiMode.responses')}</option>
              </select>
            </label>
          )}
          <label>
            {t('settings.model')}
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
                  {t('settings.model.select')}
                </option>
                {modelOptions.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.ownedBy ? `${model.id} · ${model.ownedBy}` : model.id}
                  </option>
                ))}
                <option value={CUSTOM_MODEL_VALUE}>{t('settings.model.custom')}</option>
              </select>
              <button
                className="icon-button"
                type="button"
                onClick={onLoadModels}
                disabled={isModelListLoading}
                title={t('settings.model.refresh')}
              >
                {isModelListLoading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              </button>
            </div>
            {modelSelectValue === CUSTOM_MODEL_VALUE && (
              <input
                value={settings.model}
                onChange={(event) => onSettingsChange((current) => ({ ...current, model: event.target.value }))}
                placeholder={t('settings.model.customPlaceholder')}
                spellCheck={false}
              />
            )}
            <span className={`model-status ${modelListError ? 'danger' : ''}`}>{modelStatusText}</span>
          </label>
          <label>
            {t('settings.reasoning')}
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

          <div className="settings-section">
            <div className="settings-section-title">{t('settings.inputMode')}</div>
          <label>
            {t('settings.inputMode')}
            <select
              value={settings.inputMode}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, inputMode: event.target.value as InputMode }))
              }
            >
              <option value="image">{t('settings.inputMode.image')}</option>
              <option value="ocr-text">{t('settings.inputMode.ocr')}</option>
            </select>
          </label>
          <label>
            {t('settings.ocrLang')}
            <select
              value={settings.ocrLanguage}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, ocrLanguage: event.target.value as OcrLanguage }))
              }
              disabled={settings.inputMode !== 'ocr-text'}
              title={ocrDisabledReason}
            >
              <option value="chi_sim">{t('settings.ocrLang.zh')}</option>
              <option value="eng">{t('settings.ocrLang.en')}</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.ocrMathMode}
              disabled={settings.inputMode !== 'ocr-text'}
              title={ocrDisabledReason}
              onChange={(event) => onSettingsChange((current) => ({ ...current, ocrMathMode: event.target.checked }))}
            />
            {t('settings.ocrMathMode')}
          </label>
          <label>
            {t('settings.ocrPreprocess')}
            <select
              value={settings.ocrPreprocessMode}
              onChange={(event) =>
                onSettingsChange((current) => ({
                  ...current,
                  ocrPreprocessMode: event.target.value as OcrPreprocessMode
                }))
              }
              disabled={settings.inputMode !== 'ocr-text'}
              title={ocrDisabledReason}
            >
              <option value="auto">{t('settings.ocrPreprocess.auto')}</option>
              <option value="none">{t('settings.ocrPreprocess.none')}</option>
              <option value="contrast">{t('settings.ocrPreprocess.contrast')}</option>
              <option value="binary">{t('settings.ocrPreprocess.binary')}</option>
              <option value="multi">{t('settings.ocrPreprocess.multi')}</option>
            </select>
          </label>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t('settings.language')}</div>
          <label>
            {t('settings.language')}
            <select
              value={settings.language}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, language: event.target.value as TutorLanguage }))
              }
            >
              <option value="zh-CN">{t('settings.language.zh')}</option>
              <option value="en">{t('settings.language.en')}</option>
            </select>
          </label>
          <label>
            {t('settings.theme')}
            <select
              value={settings.theme ?? 'system'}
              onChange={(event) =>
                onSettingsChange((current) => ({ ...current, theme: event.target.value as ThemeSetting }))
              }
            >
              <option value="system">{t('settings.theme.system')}</option>
              <option value="light">{t('settings.theme.light')}</option>
              <option value="dark">{t('settings.theme.dark')}</option>
            </select>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.reasoningOnly}
              onChange={(event) => onSettingsChange((current) => ({ ...current, reasoningOnly: event.target.checked }))}
            />
            {t('settings.reasoningOnly')}
          </label>
          </div>
            </>
          )}
        </>
      ))}

        {activeTab === 'library' && (
          <HistoryPanel
            studyItems={studyItems}
            appVersion={appVersion}
            onRestore={onRestoreStudyItem}
            onUpdate={onUpdateStudyItem}
            onReview={onReviewStudyItem}
            onDelete={onDeleteStudyItem}
            onClear={onClearStudyItems}
            onExport={onExportStudyItems}
            onReplaceItems={onReplaceStudyItems}
            exportStatus={studyLibraryExportStatus}
          />
        )}

        {activeTab === 'dashboard' && (
          <DashboardPanel studyItems={studyItems} />
        )}

        {activeTab === 'tools' && (
          <>
            <div className="settings-guide-row">
              <button
                className={`secondary-button${settingsView === 'eval' ? ' active' : ''}`}
                type="button"
                onClick={() => onSettingsViewChange('eval')}
              >
                <MessageSquareText size={16} />
                {t('settings.modelEval')}
              </button>
              <button
                className={`secondary-button${settingsView === 'promptTemplates' ? ' active' : ''}`}
                type="button"
                onClick={() => onSettingsViewChange('promptTemplates')}
              >
                <MessageSquareText size={16} />
                {t('settings.promptTemplates')}
              </button>
              <button
                className={`secondary-button${settingsView === 'providerGenerator' ? ' active' : ''}`}
                type="button"
                onClick={() => onSettingsViewChange('providerGenerator')}
              >
                <FileCode2 size={16} />
                {t('settings.providerGenerator')}
              </button>
              <button
                className={`secondary-button${settingsView === 'proxyAdmin' ? ' active' : ''}`}
                type="button"
                onClick={() => onSettingsViewChange('proxyAdmin')}
              >
                <Network size={16} />
                {t('settings.proxyAdmin')}
              </button>
            </div>
            {settingsView === 'proxyAdmin' ? (
              <ProxyAdminPanel
                settings={settings}
                apiDefaults={apiDefaults}
                currentProxyUrl={currentProxyUrl}
                proxyHealthStatus={proxyHealthStatus}
                proxyHealthMessage={proxyHealthMessage}
                onValidateProxyConnection={onValidateProxyConnection}
                onCopy={onCopyDiagnosticReport}
              />
            ) : settingsView === 'providerGenerator' ? (
              <ProviderConfigGenerator onCopy={onCopyDiagnosticReport} />
            ) : settingsView === 'promptTemplates' ? (
              <PromptTemplatePanel settings={settings} onSettingsChange={onSettingsChange} />
            ) : (
              <EvalPanel
                settings={settings}
                apiProviders={apiProviders}
                modelOptions={modelOptions}
                onCopy={onCopyDiagnosticReport}
              />
            )}
          </>
        )}

        {activeTab === 'about' && (
          <>
            <div className="update-box">
              <div>
                <strong>{t('update.title')}</strong>
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
                  {t('update.check')}
                </button>
                {(canDownloadUpdate || isDownloadingUpdate) && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void window.studyTutor.downloadUpdate()}
                    disabled={!canDownloadUpdate || isDownloadingUpdate}
                  >
                    {isDownloadingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                    {isDownloadingUpdate ? t('update.downloading') : t('update.download')}
                  </button>
                )}
                {updateStatus.status === 'downloaded' && (
                  <button className="secondary-button" type="button" onClick={() => void window.studyTutor.installUpdate()}>
                    <Check size={16} />
                    {t('update.install')}
                  </button>
                )}
              </div>
            </div>
            <div className="diagnostic-box">
              <div className="diagnostic-box-header">
                <div>
                  <strong>{t('diagnostics.title')}</strong>
                  <span>{t('diagnostics.desc')}</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => onRunDiagnostics(false)} disabled={isDiagnosticsRunning}>
                  {isDiagnosticsRunning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                  {isDiagnosticsRunning ? t('diagnostics.running') : t('diagnostics.run')}
                </button>
                <button className="secondary-button" type="button" onClick={() => onRunDiagnostics(true)} disabled={isDiagnosticsRunning}>
                  {isDiagnosticsRunning ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                  {t('diagnostics.deep')}
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
            <div className="shortcut-settings-box">
              <div className="shortcut-settings-header">
                <div>
                  <strong>{t('shortcuts.title')}</strong>
                  <span>{t('shortcuts.desc')}</span>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    onSettingsChange((current) => ({
                      ...current,
                      shortcuts: DEFAULT_SHORTCUTS.map((shortcut) => ({ ...shortcut }))
                    }))
                  }
                >
                  <RotateCcw size={16} />
                  {t('shortcuts.restore')}
                </button>
              </div>
              <div className="shortcut-list">
                {activeShortcuts.map((shortcut) => {
                  const hasConflict = shortcut.enabled && shortcutConflictKeys.has(shortcut.key.trim());

                  return (
                    <div className={`shortcut-row${hasConflict ? ' conflict' : ''}`} key={shortcut.action}>
                      <label className="toggle-row shortcut-toggle">
                        <input
                          type="checkbox"
                          checked={shortcut.enabled}
                          onChange={(event) =>
                            onSettingsChange((current) => ({
                              ...current,
                              shortcuts: activeShortcuts.map((item) =>
                                item.action === shortcut.action ? { ...item, enabled: event.target.checked } : item
                              )
                            }))
                          }
                        />
                        {shortcutActionLabel(shortcut.action, t)}
                      </label>
                      <label className="shortcut-input-label">
                        <Keyboard size={14} />
                        <input
                          value={shortcut.key}
                          aria-invalid={hasConflict || undefined}
                          onKeyDown={(event) => {
                            const nextKey = shortcutFromKeyboardEvent(event);

                            if (!nextKey) {
                              return;
                            }

                            event.preventDefault();
                            onSettingsChange((current) => ({
                              ...current,
                              shortcuts: activeShortcuts.map((item) =>
                                item.action === shortcut.action ? { ...item, key: nextKey, enabled: true } : item
                              )
                            }));
                          }}
                          onChange={(event) =>
                            onSettingsChange((current) => ({
                              ...current,
                              shortcuts: activeShortcuts.map((item) =>
                                item.action === shortcut.action ? { ...item, key: event.target.value } : item
                              )
                            }))
                          }
                          placeholder={t('shortcuts.placeholder')}
                          spellCheck={false}
                        />
                      </label>
                      {hasConflict && <span className="shortcut-conflict">{t('shortcuts.conflict')}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="settings-guide-row">
              <button className="secondary-button" type="button" onClick={onOpenSetupWizard}>
                <Wand2 size={16} />
                {t('settings.wizard')}
              </button>
              <button className="secondary-button" type="button" onClick={() => onOpenGuide('product')}>
                {t('settings.productGuide')}
              </button>
              <button className="secondary-button" type="button" onClick={() => onOpenGuide('release')}>
                {t('settings.releaseGuide')}
              </button>
              <button className="secondary-button" type="button" onClick={() => onOpenGuide('history')}>
                {t('settings.historyGuide')}
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
