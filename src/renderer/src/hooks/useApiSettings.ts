import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApiConnectionMode,
  ApiProviderOption,
  ApiRuntimeDefaults,
  ModelOption,
  TutorSettings
} from '../../../shared/types';
import type { ProxyHealthStatus, SettingsView } from '../uiTypes';
import {
  BUILT_IN_PROXY_URL,
  DEFAULT_SETTINGS,
  PROXY_TOKEN_INVALID_MESSAGE
} from '../constants';
import {
  hasSelectedDirectApiConfig,
  isProxyTokenInvalidMessage,
  savePersistedSettings,
  settingsWithApiDefaults,
  settingsWithEffectiveProxyUrl,
  settingsWithPersistedUserSettings
} from '../uiUtils';

export interface UseApiSettingsReturn {
  settings: TutorSettings;
  setSettings: React.Dispatch<React.SetStateAction<TutorSettings>>;
  modelOptions: ModelOption[];
  modelListError: string;
  isModelListLoading: boolean;
  isModelCustom: boolean;
  setIsModelCustom: React.Dispatch<React.SetStateAction<boolean>>;
  apiDefaults: ApiRuntimeDefaults | null;
  apiProviders: ApiProviderOption[];
  settingsView: SettingsView;
  setSettingsView: React.Dispatch<React.SetStateAction<SettingsView>>;
  isSetupWizardOpen: boolean;
  setIsSetupWizardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasInitializedSettings: boolean;
  proxyHealthStatus: ProxyHealthStatus;
  setProxyHealthStatus: React.Dispatch<React.SetStateAction<ProxyHealthStatus>>;
  proxyHealthMessage: string;
  setProxyHealthMessage: React.Dispatch<React.SetStateAction<string>>;
  appVersion: string;
  currentProxyUrl: string;
  isProxyConnection: boolean;
  canCompleteSetupWizard: boolean;
  loadModels: (sourceSettings: TutorSettings) => Promise<void>;
  refreshApiProviders: (sourceSettings: TutorSettings) => Promise<void>;
  selectApiConnectionMode: (mode: ApiConnectionMode) => void;
  selectApiProvider: (providerId: string) => void;
  validateProxyConnection: (proxyUrl?: string) => Promise<void>;
  addProviderSwitchHint: (message: string) => string;
  clearSavedProxyTokenState: (message?: string) => void;
  proxyHealthRequestIdRef: React.MutableRefObject<number>;
}

export function useApiSettings(): UseApiSettingsReturn {
  const [settings, setSettings] = useState<TutorSettings>(() => settingsWithPersistedUserSettings(DEFAULT_SETTINGS));
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [modelListError, setModelListError] = useState('');
  const [isModelListLoading, setIsModelListLoading] = useState(false);
  const [isModelCustom, setIsModelCustom] = useState(false);
  const [apiDefaults, setApiDefaults] = useState<ApiRuntimeDefaults | null>(null);
  const [apiProviders, setApiProviders] = useState<ApiProviderOption[]>([]);
  const [settingsView, setSettingsView] = useState<SettingsView>('normal');
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false);
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);
  const [proxyHealthStatus, setProxyHealthStatus] = useState<ProxyHealthStatus>('idle');
  const [proxyHealthMessage, setProxyHealthMessage] = useState('');
  const [appVersion, setAppVersion] = useState('');

  const modelRequestIdRef = useRef(0);
  const proxyHealthRequestIdRef = useRef(0);
  const isModelCustomRef = useRef(false);
  const setupWizardAutoOpenRef = useRef(false);

  useEffect(() => {
    isModelCustomRef.current = isModelCustom;
  }, [isModelCustom]);

  useEffect(() => {
    savePersistedSettings(settings);
  }, [settings]);

  const isProxyConnection = settings.apiConnectionMode === 'proxy';
  const manualProxyUrl = settings.proxyUrl.trim();
  const currentProxyUrl = manualProxyUrl || BUILT_IN_PROXY_URL || apiDefaults?.proxyUrl || '';
  const canCompleteSetupWizard =
    Boolean(settings.model.trim()) &&
    (isProxyConnection
      ? Boolean(currentProxyUrl.trim()) && (Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken))
      : hasSelectedDirectApiConfig(apiDefaults, settings.providerId));

  const clearSavedProxyTokenState = useCallback((message = PROXY_TOKEN_INVALID_MESSAGE): void => {
    setSettings((current) => ({ ...current, proxyToken: '' }));
    setApiProviders([]);
    setModelOptions([]);
    setModelListError(message);

    void window.studyTutor
      .clearProxyToken()
      .then((defaults) => setApiDefaults(defaults))
      .catch(() => {
        setApiDefaults((current) => (current ? { ...current, hasProxyToken: false } : current));
      });
  }, []);

  const loadModels = useCallback(
    async (sourceSettings: TutorSettings): Promise<void> => {
      const requestId = modelRequestIdRef.current + 1;
      modelRequestIdRef.current = requestId;
      setIsModelListLoading(true);
      setModelListError('');

      try {
        const response = await window.studyTutor.listModels(settingsWithEffectiveProxyUrl(sourceSettings));

        if (modelRequestIdRef.current !== requestId) {
          return;
        }

        setModelOptions(response.models);

        if (response.models.length === 0) {
          setModelListError('第三方 API 没有返回可选择的模型。');
        } else if (!isModelCustomRef.current) {
          const firstModelId = response.models[0]?.id;

          setSettings((current) =>
            !firstModelId || response.models.some((model) => model.id === current.model.trim())
              ? current
              : { ...current, model: firstModelId }
          );
        }
      } catch (caught) {
        if (modelRequestIdRef.current !== requestId) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);

        if (isProxyTokenInvalidMessage(message)) {
          clearSavedProxyTokenState(message);
          return;
        }

        setModelOptions([]);
        setModelListError(message || '模型列表获取失败，请检查第三方 API 配置。');
      } finally {
        if (modelRequestIdRef.current === requestId) {
          setIsModelListLoading(false);
        }
      }
    },
    [clearSavedProxyTokenState]
  );

  const refreshApiProviders = useCallback(
    async (sourceSettings: TutorSettings): Promise<void> => {
      setModelListError('');

      try {
        const providers = await window.studyTutor.listApiProviders(settingsWithEffectiveProxyUrl(sourceSettings));
        const enteredProxyToken = sourceSettings.proxyToken.trim();
        let shouldClearEnteredProxyToken = false;

        if (sourceSettings.apiConnectionMode === 'proxy' && enteredProxyToken) {
          try {
            const defaults = await window.studyTutor.saveProxyToken(enteredProxyToken);
            setApiDefaults(defaults);
            shouldClearEnteredProxyToken = true;
          } catch {
            shouldClearEnteredProxyToken = false;
          }
        }

        const currentProvider = providers.find((provider) => provider.id === sourceSettings.providerId);
        const defaultProvider = providers.find((provider) => provider.isDefault) || providers[0];
        const nextProvider = currentProvider || defaultProvider;
        const nextSettings: TutorSettings = {
          ...sourceSettings,
          proxyToken: shouldClearEnteredProxyToken ? '' : sourceSettings.proxyToken,
          providerId: nextProvider?.id || '',
          model: '',
          apiBaseUrl:
            sourceSettings.apiConnectionMode === 'direct' && nextProvider
              ? nextProvider.baseUrl
              : sourceSettings.apiBaseUrl,
          apiMode:
            sourceSettings.apiConnectionMode === 'direct' && nextProvider ? 'env' : sourceSettings.apiMode
        };

        setApiProviders(providers);
        setIsModelCustom(false);
        setModelOptions([]);
        setSettings(nextSettings);

        if (nextSettings.providerId || nextSettings.apiConnectionMode === 'direct') {
          void loadModels(nextSettings);
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);

        if (isProxyTokenInvalidMessage(message)) {
          clearSavedProxyTokenState(message);
          return;
        }

        setApiProviders([]);
        setModelOptions([]);
        setModelListError(message || 'API 服务商列表获取失败，请检查代理地址、Token 或本地 API 配置。');
      }
    },
    [clearSavedProxyTokenState, loadModels]
  );

  const addProviderSwitchHint = useCallback(
    (message: string): string => {
      const provider = apiProviders.find((item) => item.id === settings.providerId);

      if (!provider || apiProviders.length < 2 || message.includes('切换到其他 API')) {
        return message;
      }

      return [
        message,
        '',
        `提示：当前使用的 API 服务商是「${provider.name}」。如果该服务商持续失败，可以在设置中切换到其他 API 后点击重试。`
      ].join('\n');
    },
    [apiProviders, settings.providerId]
  );

  const validateProxyConnection = useCallback(
    async (proxyUrl = currentProxyUrl): Promise<void> => {
      if (!proxyUrl) {
        proxyHealthRequestIdRef.current += 1;
        setProxyHealthStatus('error');
        setProxyHealthMessage('未配置代理服务地址。');
        return;
      }

      const requestId = proxyHealthRequestIdRef.current + 1;
      proxyHealthRequestIdRef.current = requestId;
      setProxyHealthStatus('checking');
      setProxyHealthMessage('');

      try {
        const health = await window.studyTutor.checkProxyHealth(proxyUrl);

        if (proxyHealthRequestIdRef.current !== requestId) {
          return;
        }

        setProxyHealthStatus(health.ok ? 'success' : 'error');
        setProxyHealthMessage(health.message);
      } catch (caught) {
        if (proxyHealthRequestIdRef.current !== requestId) {
          return;
        }

        setProxyHealthStatus('error');
        setProxyHealthMessage(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [currentProxyUrl]
  );

  const selectApiConnectionMode = useCallback(
    (apiConnectionMode: ApiConnectionMode): void => {
      const nextSettings: TutorSettings = {
        ...settings,
        apiConnectionMode,
        providerId: '',
        model: '',
        proxyUrl: settings.proxyUrl
      };

      setIsModelCustom(false);
      setModelOptions([]);
      setModelListError('');
      setSettingsView((current) => (apiConnectionMode === 'proxy' ? current : 'normal'));

      if (apiConnectionMode === 'proxy') {
        setSettings(nextSettings);
        void refreshApiProviders(nextSettings);
        return;
      }

      const providers = apiDefaults?.providers || [];
      const defaultProvider = providers.find((provider) => provider.isDefault) || providers[0];
      const directSettings: TutorSettings = {
        ...nextSettings,
        providerId: defaultProvider?.id || '',
        apiBaseUrl: defaultProvider?.baseUrl || apiDefaults?.apiBaseUrl || settings.apiBaseUrl,
        apiMode: defaultProvider ? 'env' : apiDefaults?.apiMode || settings.apiMode
      };

      setApiProviders(providers);
      setSettings(directSettings);

      if (hasSelectedDirectApiConfig(apiDefaults, directSettings.providerId)) {
        void loadModels(directSettings);
      }
    },
    [apiDefaults, loadModels, refreshApiProviders, settings]
  );

  const selectApiProvider = useCallback(
    (providerId: string): void => {
      const provider = apiProviders.find((item) => item.id === providerId);
      const nextSettings: TutorSettings = {
        ...settings,
        providerId,
        model: '',
        apiBaseUrl: provider ? provider.baseUrl : settings.apiBaseUrl,
        apiMode: provider ? 'env' : settings.apiMode
      };

      setIsModelCustom(false);
      setModelOptions([]);
      setSettings(nextSettings);

      if (
        nextSettings.apiConnectionMode === 'proxy' ||
        hasSelectedDirectApiConfig(apiDefaults, nextSettings.providerId)
      ) {
        void loadModels(nextSettings);
      }
    },
    [apiDefaults, apiProviders, loadModels, settings]
  );

  useEffect(() => {
    let isMounted = true;

    const initializeApiSettings = async (): Promise<void> => {
      let sourceSettings = DEFAULT_SETTINGS;

      try {
        const defaults = await window.studyTutor.getApiDefaults();

        if (!isMounted) {
          return;
        }

        setApiDefaults(defaults);
        sourceSettings = settingsWithPersistedUserSettings(settingsWithApiDefaults(defaults));
        setSettings(sourceSettings);

        if (sourceSettings.apiConnectionMode === 'proxy') {
          await refreshApiProviders(sourceSettings);
          setHasInitializedSettings(true);
          return;
        }

        setApiProviders(defaults.providers);
        if (!hasSelectedDirectApiConfig(defaults, sourceSettings.providerId)) {
          setHasInitializedSettings(true);
          return;
        }
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setModelListError(message || '第三方 API 配置文件读取失败。');
        setHasInitializedSettings(true);
        return;
      }

      void loadModels(sourceSettings);
      setHasInitializedSettings(true);
    };

    void initializeApiSettings();

    window.studyTutor.getAppVersion().then(setAppVersion).catch(() => {
      setAppVersion('');
    });

    return () => {
      isMounted = false;
    };
  }, [loadModels, refreshApiProviders]);

  useEffect(() => {
    if (!appVersion || !hasInitializedSettings || setupWizardAutoOpenRef.current) {
      return;
    }

    try {
      const setupVersionKey = appVersion.split('.').slice(0, 2).join('.') || appVersion;
      const completedVersion = localStorage.getItem('study-region-tutor-setup-wizard-completed-version');
      const dismissedVersion = localStorage.getItem('study-region-tutor-setup-wizard-dismissed-version');

      if (
        completedVersion === setupVersionKey ||
        completedVersion === appVersion ||
        dismissedVersion === setupVersionKey ||
        dismissedVersion === appVersion
      ) {
        return;
      }
    } catch {
      return;
    }

    setupWizardAutoOpenRef.current = true;
    setIsSetupWizardOpen(true);
  }, [appVersion, hasInitializedSettings]);

  useEffect(() => {
    if (!isProxyConnection || settingsView !== 'normal') {
      proxyHealthRequestIdRef.current += 1;
      return;
    }
  }, [isProxyConnection, settingsView]);

  return {
    settings,
    setSettings,
    modelOptions,
    modelListError,
    isModelListLoading,
    isModelCustom,
    setIsModelCustom,
    apiDefaults,
    apiProviders,
    settingsView,
    setSettingsView,
    isSetupWizardOpen,
    setIsSetupWizardOpen,
    hasInitializedSettings,
    proxyHealthStatus,
    setProxyHealthStatus,
    proxyHealthMessage,
    setProxyHealthMessage,
    appVersion,
    currentProxyUrl,
    isProxyConnection,
    canCompleteSetupWizard,
    loadModels,
    refreshApiProviders,
    selectApiConnectionMode,
    selectApiProvider,
    validateProxyConnection,
    addProviderSwitchHint,
    clearSavedProxyTokenState,
    proxyHealthRequestIdRef
  };
}
