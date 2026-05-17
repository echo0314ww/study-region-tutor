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
import { useTranslation } from '../i18n';
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
  const { t } = useTranslation();
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
  const steps = [t('wizard.step.connection'), isProxyConnection ? t('wizard.step.proxySetup') : t('wizard.step.localSetup'), t('wizard.step.providerModel'), t('shortcuts.title')];
  const isLastStep = stepIndex === steps.length - 1;

  const modelStatusText = isModelListLoading
    ? t('settings.model.loading')
    : modelListError || (modelOptions.length > 0 ? t('settings.model.loaded', { count: modelOptions.length }) : t('settings.model.notLoaded'));

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
          <strong>{t('wizard.firstSetup')}</strong>
          <span>{appVersion ? t('wizard.currentVersion', { version: appVersion }) : t('wizard.stepDesc')}</span>
        </div>
        <button className="icon-button ghost" type="button" onClick={onDismiss} title={t('app.close')}>
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
            <h2>{t('wizard.selectConnection')}</h2>
            <div className="setup-choice-grid">
              <button
                className={settings.apiConnectionMode === 'direct' ? 'active' : ''}
                type="button"
                onClick={() => onSelectApiConnectionMode('direct')}
              >
                <strong>{t('settings.apiConnection.direct')}</strong>
                <span>{t('wizard.directDesc')}</span>
              </button>
              <button
                className={settings.apiConnectionMode === 'proxy' ? 'active' : ''}
                type="button"
                onClick={() => onSelectApiConnectionMode('proxy')}
              >
                <strong>{t('settings.apiConnection.proxy')}</strong>
                <span>{t('wizard.proxyDesc')}</span>
              </button>
            </div>
          </div>
        )}
        {stepIndex === 1 && !isProxyConnection && (
          <div className="setup-step">
            <h2>{t('wizard.checkLocalConfig')}</h2>
            <p className="setup-copy">{t('wizard.localConfigNote')}</p>
            <code>{localEnvPath}</code>
            <div className={`setup-status ${directConfigured ? '' : 'warning'}`}>
              {directConfigured ? t('wizard.localConfigOk') : t('wizard.localConfigMissing')}
            </div>
            <div className="setup-code-list">
              <code>{t('directSetup.baseUrlExample')}</code>
              <code>{t('directSetup.apiKeyExample')}</code>
            </div>
          </div>
        )}
        {stepIndex === 1 && isProxyConnection && (
          <div className="setup-step">
            <h2>{t('wizard.proxySetupTitle')}</h2>
            <label>
              {t('proxy.url')}
              <input
                value={settings.proxyUrl}
                onChange={(event) => onSettingsChange((current) => ({ ...current, proxyUrl: event.target.value }))}
                placeholder={t('proxy.urlPlaceholder')}
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
                {t('wizard.validateProxy')}
              </button>
              <span className={`model-status ${proxyHealthStatus === 'error' ? 'danger' : ''}`}>
                {proxyHealthStatus === 'checking'
                  ? t('wizard.proxyChecking')
                  : proxyHealthStatus === 'success'
                    ? t('wizard.proxyOk', { url: currentProxyUrl })
                    : proxyHealthMessage || t('wizard.proxyIdle')}
              </span>
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
                {hasProxyToken ? t('wizard.proxyTokenHas') : t('wizard.proxyTokenNeeded')}
              </span>
            </label>
          </div>
        )}
        {stepIndex === 2 && (
          <div className="setup-step">
            <h2>{t('wizard.selectProviderModel')}</h2>
            {isProxyConnection && (
              <button
                className="secondary-button"
                type="button"
                onClick={onRefreshApiProviders}
                disabled={isModelListLoading}
              >
                {isModelListLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                {t('settings.apiProvider.refreshProxy')}
              </button>
            )}
            <label>
              {t('settings.apiProvider')}
              <select value={settings.providerId} onChange={(event) => onSelectApiProvider(event.target.value)}>
                {apiProviders.length === 0 && <option value="">{t('wizard.noProvider')}</option>}
                {!isProxyConnection && apiProviders.length > 0 && <option value="">{t('settings.apiProvider.manualAlt')}</option>}
                {apiProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.isDefault ? t('wizard.providerDefault', { name: provider.name }) : provider.name}
                  </option>
                ))}
              </select>
            </label>
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
          </div>
        )}
        {stepIndex === 3 && (
          <div className="setup-step">
            <h2>{t('wizard.confirmShortcuts')}</h2>
            <div className="setup-shortcut-list">
              {shortcutBindings(settings).map((shortcut) => (
                <div key={shortcut.action}>
                  <span>{shortcutActionLabel(shortcut.action, t)}</span>
                  <kbd>{shortcut.enabled ? shortcut.key : t('wizard.shortcutDisabled')}</kbd>
                </div>
              ))}
            </div>
            <p className="setup-copy">{t('wizard.shortcutNote')}</p>
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
          {t('wizard.prev')}
        </button>
        {isLastStep ? (
          <button className="primary-button" type="button" onClick={onComplete} disabled={!canComplete}>
            <Check size={16} />
            {t('wizard.complete')}
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
          >
            {t('wizard.next')}
            <ChevronRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
