import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiConnectionMode,
  ApiProviderOption,
  ApiRuntimeDefaults,
  DiagnosticResult,
  ExportConversationRequest,
  ModelOption,
  OcrPreviewResult,
  RegionBounds,
  StudyLibraryExportFormat,
  TutorSettings,
  UpdateStatusEvent
} from '../../shared/types';
import type {
  FloatingPosition,
  GuideKind,
  ProxyHealthStatus,
  SettingsView,
  StudyItem,
  StudyItemPatch,
  StudyReviewGrade,
  UiConversationTurn
} from './uiTypes';
import {
  BUILT_IN_PROXY_URL,
  DEFAULT_REGION,
  DEFAULT_SETTINGS,
  PRODUCT_GUIDE_SEEN_VERSION_KEY,
  PROXY_TOKEN_INVALID_MESSAGE,
  RELEASE_GUIDE_SEEN_VERSION_KEY,
  SETUP_WIZARD_COMPLETED_VERSION_KEY,
  SETUP_WIZARD_DISMISSED_VERSION_KEY
} from './constants';
import { buildConversationMarkdown } from '../../shared/exportConversation';
import {
  clampRegion,
  clampResultPanel,
  createRequestId,
  defaultResultPanel,
  hasSelectedDirectApiConfig,
  isCanceledError,
  isOcrPreviewResult,
  isProxyTokenInvalidMessage,
  savePersistedSettings,
  settingsWithApiDefaults,
  settingsWithEffectiveProxyUrl,
  settingsWithPersistedUserSettings,
  shortcutBindings
} from './uiUtils';
import { useAnnouncements } from './useAnnouncements';
import { usePointerInteractions } from './usePointerInteractions';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import {
  loadStudyItems,
  saveStudyItems,
  updateStudyItemMetadata,
  updateStudyItemReviewResult,
  upsertStudyItem
} from './studyLibrary';
import { CaptureConfirmOverlay } from './components/CaptureConfirmOverlay';
import { DragCaptureOverlay } from './components/DragCaptureOverlay';
import { Toolbar } from './components/Toolbar';
import { AnnouncementPanel } from './components/AnnouncementPanel';
import { ResultPanel } from './components/ResultPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { GuidePanel } from './components/GuidePanel';
import { SetupWizard } from './components/SetupWizard';
import { guideDefinition, hasGuideContent } from './guides';

export function App(): JSX.Element {
  const [region, setRegion] = useState(() => clampRegion(DEFAULT_REGION));
  const [resultPanel, setResultPanel] = useState(() => clampResultPanel(defaultResultPanel()));
  const [overlayBounds, setOverlayBounds] = useState<RegionBounds>({ x: 0, y: 0, width: 0, height: 0 });
  const [settings, setSettings] = useState<TutorSettings>(() => settingsWithPersistedUserSettings(DEFAULT_SETTINGS));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isCaptureUiVisible, setIsCaptureUiVisible] = useState(true);
  const [isDragCaptureActive, setIsDragCaptureActive] = useState(false);
  const [pendingCaptureRegion, setPendingCaptureRegion] = useState<RegionBounds | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<FloatingPosition | null>(null);
  const [settingsPanelPosition, setSettingsPanelPosition] = useState<FloatingPosition | null>(null);
  const [result, setResult] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeStudyItemId, setActiveStudyItemId] = useState('');
  const [studyItems, setStudyItems] = useState<StudyItem[]>(() => loadStudyItems());
  const [conversationTurns, setConversationTurns] = useState<UiConversationTurn[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [progressText, setProgressText] = useState('');
  const [ocrPreview, setOcrPreview] = useState<OcrPreviewResult | null>(null);
  const [error, setError] = useState('');
  const [stoppedMessage, setStoppedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
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
  const [activeGuideKind, setActiveGuideKind] = useState<GuideKind | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [diagnosticError, setDiagnosticError] = useState('');
  const [isDiagnosticsRunning, setIsDiagnosticsRunning] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [studyLibraryExportStatus, setStudyLibraryExportStatus] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent>({
    status: 'idle',
    message: '尚未检查更新。'
  });
  const lastRequestRef = useRef<RegionBounds | null>(null);
  const activeRequestIdRef = useRef('');
  const cancelingRequestIdRef = useRef('');
  const latestProgressTextRef = useRef('');
  const hasAnswerStartedRef = useRef(false);
  const streamingAssistantTurnIdRef = useRef('');
  const streamingAnswerTextRef = useRef('');
  const modelRequestIdRef = useRef(0);
  const proxyHealthRequestIdRef = useRef(0);
  const isModelCustomRef = useRef(false);
  const setupWizardAutoOpenRef = useRef(false);
  const metadataRequestIdsRef = useRef(new Set<string>());
  useEffect(() => {
    isModelCustomRef.current = isModelCustom;
  }, [isModelCustom]);

  useEffect(() => {
    savePersistedSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveStudyItems(studyItems);
  }, [studyItems]);

  const hasPendingCaptureConfirm = pendingCaptureRegion !== null;
  const floatingPassthroughMode = isCaptureUiVisible && !isDragCaptureActive && !hasPendingCaptureConfirm;
  const isProxyConnection = settings.apiConnectionMode === 'proxy';
  const manualProxyUrl = settings.proxyUrl.trim();
  const currentProxyUrl = manualProxyUrl || BUILT_IN_PROXY_URL || apiDefaults?.proxyUrl || '';
  const announcementSourceUrl = currentProxyUrl;

  const {
    announcements,
    announcementError,
    announcementPanelLevel,
    expandedAnnouncementIds,
    hasUnreadAnnouncement,
    isAnnouncementOpen,
    closeAnnouncementPanel,
    toggleAnnouncementDetails,
    toggleAnnouncementPanel
  } = useAnnouncements(announcementSourceUrl);

  const {
    toolbarRef,
    settingsPanelRef,
    enterInteractiveSurface,
    leaveInteractiveSurface,
    onPointerDownCapture,
    onResultPanelPointerDown,
    onFloatingPointerDown,
    onPointerMove,
    onPointerUp
  } = usePointerInteractions({
    floatingPassthroughMode,
    region,
    resultPanel,
    toolbarPosition,
    settingsPanelPosition,
    isAnnouncementOpen,
    isResultOpen,
    isSettingsOpen,
    setRegion,
    setResultPanel,
    setToolbarPosition,
    setSettingsPanelPosition
  });

  const canRetry = Boolean(lastRequestRef.current) && !isLoading;

  useEffect(() => {
    if (!activeStudyItemId || ocrPreview || conversationTurns.length === 0) {
      return;
    }

    setStudyItems((current) =>
      upsertStudyItem(current, {
        id: activeStudyItemId,
        appVersion,
        settings,
        turns: conversationTurns
      })
    );
  }, [activeStudyItemId, appVersion, conversationTurns, ocrPreview, settings]);

  useEffect(() => {
    if (!activeStudyItemId || ocrPreview || isLoading || conversationTurns.length === 0 || !settings.model.trim()) {
      return;
    }

    const existing = studyItems.find((item) => item.id === activeStudyItemId);

    if (existing?.metadata || metadataRequestIdsRef.current.has(activeStudyItemId)) {
      return;
    }

    const hasAssistantAnswer = conversationTurns.some((turn) => turn.role === 'assistant' && turn.content.trim());

    if (!hasAssistantAnswer) {
      return;
    }

    const studyItemId = activeStudyItemId;
    const text = conversationTurns.map((turn) => `${turn.role === 'user' ? '用户' : '助手'}：${turn.content}`).join('\n\n');
    metadataRequestIdsRef.current.add(studyItemId);

    void window.studyTutor
      .extractStudyMetadata({
        text,
        settings: settingsWithEffectiveProxyUrl(settings)
      })
      .then(({ metadata }) => {
        setStudyItems((current) => {
          const item = current.find((candidate) => candidate.id === studyItemId);

          if (!item) {
            return current;
          }

          const mergedTags = [...new Set([...item.tags, ...metadata.tags, ...metadata.keyPoints].filter(Boolean))];

          return updateStudyItemMetadata(current, studyItemId, {
            metadata,
            subject: metadata.subject,
            tags: mergedTags,
            difficulty: metadata.difficulty,
            mistakeReason: item.mistakeReason || metadata.mistakeTraps[0] || ''
          });
        });
      })
      .catch(() => undefined);
  }, [activeStudyItemId, conversationTurns, isLoading, ocrPreview, settings, studyItems]);

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

  const loadModels = useCallback(async (sourceSettings: TutorSettings): Promise<void> => {
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
  }, [clearSavedProxyTokenState]);

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
            sourceSettings.apiConnectionMode === 'direct' && nextProvider
              ? 'env'
              : sourceSettings.apiMode
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

  const activeGuide = activeGuideKind ? guideDefinition(activeGuideKind, appVersion || 'dev') : null;

  const markGuideSeen = useCallback(
    (kind: GuideKind): void => {
      if (appVersion && kind !== 'history') {
        const key = kind === 'product' ? PRODUCT_GUIDE_SEEN_VERSION_KEY : RELEASE_GUIDE_SEEN_VERSION_KEY;
        try {
          localStorage.setItem(key, appVersion);
        } catch {
          // Local storage can be unavailable in hardened environments; closing the guide still works.
        }
      }

      setActiveGuideKind(null);
    },
    [appVersion]
  );

  const openGuide = useCallback((kind: GuideKind): void => {
    setActiveGuideKind(kind);
  }, []);

  const copyTextToClipboard = useCallback((text: string): void => {
    if (!navigator.clipboard?.writeText) {
      setExportStatus('当前系统剪贴板不可用，请使用导出答案。');
      return;
    }

    void navigator.clipboard
      .writeText(text)
      .then(() => setExportStatus('已复制到剪贴板。'))
      .catch((caught) => {
        setExportStatus(caught instanceof Error ? caught.message : String(caught));
      });
  }, []);

  const runSettingsDiagnostics = useCallback(async (deepCheck = false): Promise<void> => {
    setIsDiagnosticsRunning(true);
    setDiagnosticError('');
    setDiagnosticResult(null);

    try {
      const response = await window.studyTutor.runDiagnostics({
        settings: settingsWithEffectiveProxyUrl(settings),
        appVersion,
        deepCheck
      });
      setDiagnosticResult(response);
    } catch (caught) {
      setDiagnosticError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsDiagnosticsRunning(false);
    }
  }, [appVersion, settings]);

  const buildExportRequest = useCallback((): ExportConversationRequest => {
    return {
      appVersion,
      exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      model: settings.model.trim(),
      language: settings.language,
      inputMode: settings.inputMode,
      reasoningOnly: settings.reasoningOnly,
      turns: conversationTurns
        .map((turn) => ({ role: turn.role, content: turn.content }))
        .filter((turn) => turn.content.trim())
    };
  }, [appVersion, conversationTurns, settings.inputMode, settings.language, settings.model, settings.reasoningOnly]);

  const canExportConversation = conversationTurns.some((turn) => turn.content.trim());
  const isCurrentStudyItemFavorite = Boolean(
    activeStudyItemId && studyItems.find((item) => item.id === activeStudyItemId)?.favorite
  );

  const toggleCurrentStudyItemFavorite = useCallback((): void => {
    if (!activeStudyItemId || !canExportConversation) {
      return;
    }

    setStudyItems((current) => {
      const existing = current.find((item) => item.id === activeStudyItemId);

      if (!existing) {
        return upsertStudyItem(current, {
          id: activeStudyItemId,
          appVersion,
          settings,
          turns: conversationTurns
        }).map((item) => (item.id === activeStudyItemId ? { ...item, favorite: true } : item));
      }

      return updateStudyItemMetadata(current, activeStudyItemId, { favorite: !existing.favorite });
    });
  }, [activeStudyItemId, appVersion, canExportConversation, conversationTurns, settings]);

  const copyConversationMarkdown = useCallback((): void => {
    if (!canExportConversation) {
      return;
    }

    copyTextToClipboard(buildConversationMarkdown(buildExportRequest()));
  }, [buildExportRequest, canExportConversation, copyTextToClipboard]);

  const exportConversationMarkdown = useCallback(async (): Promise<void> => {
    if (!canExportConversation) {
      return;
    }

    setExportStatus('');

    try {
      const response = await window.studyTutor.exportConversation(buildExportRequest());

      if (!response.canceled) {
        setExportStatus(response.filePath ? `已导出：${response.filePath}` : '已导出答案。');
      }
    } catch (caught) {
      setExportStatus(caught instanceof Error ? caught.message : String(caught));
    }
  }, [buildExportRequest, canExportConversation]);

  const appendAnswerDelta = useCallback((text: string, reset = false): void => {
    if (reset) {
      const previousTurnId = streamingAssistantTurnIdRef.current;
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setResult('');

      if (previousTurnId) {
        setConversationTurns((current) => current.filter((turn) => turn.id !== previousTurnId));
      }

      if (!text) {
        return;
      }
    }

    const turnId = streamingAssistantTurnIdRef.current || createRequestId();
    streamingAssistantTurnIdRef.current = turnId;
    streamingAnswerTextRef.current += text;
    const nextText = streamingAnswerTextRef.current;
    setResult(nextText);
    setConversationTurns((current) => {
      const existingIndex = current.findIndex((turn) => turn.id === turnId);

      if (existingIndex === -1) {
        return [
          ...current,
          {
            id: turnId,
            role: 'assistant',
            content: nextText
          }
        ];
      }

      const nextTurns = [...current];
      nextTurns[existingIndex] = {
        ...nextTurns[existingIndex],
        content: nextText
      };
      return nextTurns;
    });
  }, []);

  const hideProgressWhenAnswerStarts = useCallback((text: string): void => {
    if (!text.trim()) {
      return;
    }

    hasAnswerStartedRef.current = true;
    setProgressText('');
  }, []);

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

    window.studyTutor.getOverlayBounds().then(setOverlayBounds).catch(() => {
      setOverlayBounds({ x: window.screenX, y: window.screenY, width: window.innerWidth, height: window.innerHeight });
    });

    window.studyTutor.getAppVersion().then(setAppVersion).catch(() => {
      setAppVersion('');
    });

    const onResize = (): void => {
      setRegion((current) => clampRegion(current));
      setResultPanel((current) => clampResultPanel(current));
    };
    const unsubscribeCaptureUi = window.studyTutor.onCaptureUiVisible(setIsCaptureUiVisible);
    const unsubscribeUpdateStatus = window.studyTutor.onUpdateStatus(setUpdateStatus);
    const unsubscribeProgress = window.studyTutor.onExplainProgress((progress) => {
      if (progress.requestId !== activeRequestIdRef.current) {
        return;
      }

      latestProgressTextRef.current = progress.text;
      if (!hasAnswerStartedRef.current) {
        setProgressText(progress.text);
      }
      setIsResultOpen(true);
    });
    const unsubscribeAnswerDelta = window.studyTutor.onAnswerDelta((delta) => {
      if (delta.requestId !== activeRequestIdRef.current) {
        return;
      }

      if (delta.reset) {
        hasAnswerStartedRef.current = false;
      }
      hideProgressWhenAnswerStarts(delta.text);
      appendAnswerDelta(delta.text, delta.reset);
      setIsResultOpen(true);
    });
    window.addEventListener('resize', onResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', onResize);
      unsubscribeCaptureUi();
      unsubscribeUpdateStatus();
      unsubscribeProgress();
      unsubscribeAnswerDelta();
    };
  }, [appendAnswerDelta, hideProgressWhenAnswerStarts, loadModels, refreshApiProviders]);

  useEffect(() => {
    if (!appVersion || activeGuideKind) {
      return;
    }

    try {
      const productSeenVersion = localStorage.getItem(PRODUCT_GUIDE_SEEN_VERSION_KEY);

      if (productSeenVersion !== appVersion) {
        setActiveGuideKind('product');
        return;
      }

      const releaseSeenVersion = localStorage.getItem(RELEASE_GUIDE_SEEN_VERSION_KEY);

      if (releaseSeenVersion !== appVersion && hasGuideContent('release', appVersion)) {
        setActiveGuideKind('release');
      }
    } catch {
      setActiveGuideKind('product');
    }
  }, [activeGuideKind, appVersion]);

  useEffect(() => {
    if (!appVersion || !hasInitializedSettings || activeGuideKind || setupWizardAutoOpenRef.current) {
      return;
    }

    try {
      const completedVersion = localStorage.getItem(SETUP_WIZARD_COMPLETED_VERSION_KEY);
      const dismissedVersion = localStorage.getItem(SETUP_WIZARD_DISMISSED_VERSION_KEY);

      if (completedVersion === appVersion || dismissedVersion === appVersion) {
        return;
      }
    } catch {
      // If localStorage is unavailable, the wizard can still be opened manually from settings.
      return;
    }

    setupWizardAutoOpenRef.current = true;
    setIsSetupWizardOpen(true);
  }, [activeGuideKind, appVersion, hasInitializedSettings]);

  useEffect(() => {
    if (!isSettingsOpen || !isProxyConnection || settingsView !== 'normal') {
      proxyHealthRequestIdRef.current += 1;
      return;
    }

    void validateProxyConnection();
  }, [isProxyConnection, isSettingsOpen, settingsView, validateProxyConnection]);

  const absoluteRegion = useCallback(
    (localRegion: RegionBounds): RegionBounds => ({
      x: Math.round(overlayBounds.x + localRegion.x),
      y: Math.round(overlayBounds.y + localRegion.y),
      width: Math.round(localRegion.width),
      height: Math.round(localRegion.height)
    }),
    [overlayBounds]
  );

  const showOcrPreview = useCallback((preview: OcrPreviewResult): void => {
    latestProgressTextRef.current = preview.processLog;
    hasAnswerStartedRef.current = false;
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setOcrPreview(preview);
    setResult('');
    setActiveSessionId('');
    setConversationTurns([]);
    setProgressText(preview.processLog);
    setStoppedMessage('');
    setError('');
    setIsResultOpen(true);
  }, []);

  const runExplain = useCallback(
    async (targetRegion = region): Promise<void> => {
      const requestId = createRequestId();
      activeRequestIdRef.current = requestId;
      setActiveStudyItemId(createRequestId());
      latestProgressTextRef.current = '';
      hasAnswerStartedRef.current = false;
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setIsLoading(true);
      setIsCancelling(false);
      setIsDragCaptureActive(false);
      setPendingCaptureRegion(null);
      setStoppedMessage('');
      setError('');
      setExportStatus('');
      setOcrPreview(null);
      setResult('');
      setConversationTurns([]);
      setProgressText('');
      setIsResultOpen(true);
      lastRequestRef.current = targetRegion;

      try {
        if (activeSessionId) {
          await window.studyTutor.endQuestionSession({ sessionId: activeSessionId }).catch(() => undefined);
          setActiveSessionId('');
        }

        const requestSettings = settingsWithEffectiveProxyUrl(settings);
        const requestRegion = absoluteRegion(targetRegion);
        const response =
          settings.inputMode === 'ocr-text'
            ? await window.studyTutor.recognizeRegion({
                requestId,
                region: requestRegion,
                settings: requestSettings
              })
            : await window.studyTutor.explainRegion({
                requestId,
                region: requestRegion,
                settings: requestSettings
              });

        if (isOcrPreviewResult(response)) {
          showOcrPreview(response);
          return;
        }

        const streamedTurnId = streamingAssistantTurnIdRef.current;
        const streamedText = streamingAnswerTextRef.current;
        const finalText = streamedText || response.text;
        hideProgressWhenAnswerStarts(finalText);
        streamingAssistantTurnIdRef.current = '';
        streamingAnswerTextRef.current = '';
        setResult(finalText);
        setActiveSessionId(response.sessionId);
        if (streamedTurnId) {
          setConversationTurns((current) =>
            current.map((turn) => (turn.id === streamedTurnId ? { ...turn, content: finalText } : turn))
          );
        } else {
          setConversationTurns([
            {
              id: createRequestId(),
              role: 'assistant',
              content: finalText
            }
          ]);
        }
        latestProgressTextRef.current = '';
        setProgressText('');
      } catch (caught) {
        const streamedTurnId = streamingAssistantTurnIdRef.current;
        streamingAssistantTurnIdRef.current = '';
        streamingAnswerTextRef.current = '';

        if (cancelingRequestIdRef.current === requestId || isCanceledError(caught)) {
          cancelingRequestIdRef.current = '';
          if (streamedTurnId) {
            setConversationTurns((current) => current.filter((turn) => turn.id !== streamedTurnId));
          }
          setResult('');
          setIsDragCaptureActive(false);
          setStoppedMessage('已停止当前识别/回答。');
          setProgressText('');
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        if (isProxyTokenInvalidMessage(message)) {
          clearSavedProxyTokenState(message);
        }
        const fallbackMessage = addProviderSwitchHint(message || '识别失败，请稍后重试。');
        const visibleMessage =
          latestProgressTextRef.current && !fallbackMessage.includes('## 处理过程')
            ? [latestProgressTextRef.current, '', '## 失败原因', '', fallbackMessage].join('\n')
            : fallbackMessage;
        setProgressText('');
        setError(visibleMessage);
        if (streamedTurnId) {
          setConversationTurns((current) => current.filter((turn) => turn.id !== streamedTurnId));
        }
        setResult('');
        setIsDragCaptureActive(false);
      } finally {
        setIsLoading(false);
        setIsCancelling(false);
      }
    },
    [
      absoluteRegion,
      activeSessionId,
      addProviderSwitchHint,
      clearSavedProxyTokenState,
      hideProgressWhenAnswerStarts,
      region,
      settings,
      showOcrPreview
    ]
  );

  const sendOcrPreview = useCallback(async (): Promise<void> => {
    if (!ocrPreview || isLoading) {
      return;
    }

    const confirmedText = ocrPreview.recognizedText.trim();

    if (!confirmedText) {
      setError('OCR 结果为空，请重新框选更清晰的题目区域。');
      return;
    }

    const previewSnapshot = { ...ocrPreview, recognizedText: confirmedText };
    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    latestProgressTextRef.current = '';
    hasAnswerStartedRef.current = false;
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setIsLoading(true);
    setIsCancelling(false);
    setStoppedMessage('');
    setError('');
    setExportStatus('');
    setOcrPreview(null);
    setResult('');
    setConversationTurns([]);
    setProgressText('');
    setIsResultOpen(true);

    try {
      const response = await window.studyTutor.explainRecognizedText({
        requestId,
        recognizedText: previewSnapshot.recognizedText,
        settings: settingsWithEffectiveProxyUrl(settings),
        sourceMode: previewSnapshot.sourceMode,
        reason: previewSnapshot.reason,
        fallbackReason: previewSnapshot.fallbackReason
      });
      const streamedTurnId = streamingAssistantTurnIdRef.current;
      const streamedText = streamingAnswerTextRef.current;
      const finalText = streamedText || response.text;
      hideProgressWhenAnswerStarts(finalText);
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setResult(finalText);
      setActiveSessionId(response.sessionId);
      if (streamedTurnId) {
        setConversationTurns((current) =>
          current.map((turn) => (turn.id === streamedTurnId ? { ...turn, content: finalText } : turn))
        );
      } else {
        setConversationTurns([
          {
            id: createRequestId(),
            role: 'assistant',
            content: finalText
          }
        ]);
      }
      latestProgressTextRef.current = '';
      setProgressText('');
    } catch (caught) {
      const streamedTurnId = streamingAssistantTurnIdRef.current;
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setOcrPreview(previewSnapshot);

      if (cancelingRequestIdRef.current === requestId || isCanceledError(caught)) {
        cancelingRequestIdRef.current = '';
        if (streamedTurnId) {
          setConversationTurns((current) => current.filter((turn) => turn.id !== streamedTurnId));
        }
        setResult('');
        setStoppedMessage('已停止当前识别/回答。');
        setProgressText('');
        return;
      }

      const message = caught instanceof Error ? caught.message : String(caught);
      if (isProxyTokenInvalidMessage(message)) {
        clearSavedProxyTokenState(message);
      }
      const fallbackMessage = addProviderSwitchHint(message || '讲解失败，请稍后重试。');
      const visibleMessage =
        latestProgressTextRef.current && !fallbackMessage.includes('## 处理过程')
          ? [latestProgressTextRef.current, '', '## 失败原因', '', fallbackMessage].join('\n')
          : fallbackMessage;
      setProgressText('');
      setError(visibleMessage);
      if (streamedTurnId) {
        setConversationTurns((current) => current.filter((turn) => turn.id !== streamedTurnId));
      }
      setResult('');
    } finally {
      setIsLoading(false);
      setIsCancelling(false);
    }
  }, [addProviderSwitchHint, clearSavedProxyTokenState, hideProgressWhenAnswerStarts, isLoading, ocrPreview, settings]);

  const retry = useCallback(() => {
    if (lastRequestRef.current) {
      void runExplain(lastRequestRef.current);
    }
  }, [runExplain]);

  const endCurrentQuestion = useCallback(async (): Promise<void> => {
    if (activeSessionId) {
      await window.studyTutor.endQuestionSession({ sessionId: activeSessionId }).catch(() => undefined);
    }

    setActiveSessionId('');
    setConversationTurns([]);
    setActiveStudyItemId('');
    setResult('');
    setProgressText('');
    setOcrPreview(null);
    setError('');
    setStoppedMessage('');
    setFollowUpText('');
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setPendingCaptureRegion(null);
    setIsDragCaptureActive(true);
    setIsResultOpen(false);
  }, [activeSessionId]);

  const startNextQuestion = useCallback(async (): Promise<void> => {
    if (activeSessionId) {
      await window.studyTutor.endQuestionSession({ sessionId: activeSessionId }).catch(() => undefined);
      setActiveSessionId('');
    }

    setConversationTurns([]);
    setResult('');
    setProgressText('');
    setOcrPreview(null);
    setError('');
    setStoppedMessage('');
    setFollowUpText('');
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setPendingCaptureRegion(null);
    setIsDragCaptureActive(true);
    setIsResultOpen(false);
  }, [activeSessionId]);

  const sendFollowUp = useCallback(async (): Promise<void> => {
    const question = followUpText.trim();

    if (!activeSessionId || !question || isLoading) {
      return;
    }

    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    latestProgressTextRef.current = '';
    hasAnswerStartedRef.current = false;
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setIsLoading(true);
    setIsCancelling(false);
    setStoppedMessage('');
    setError('');
    setExportStatus('');
    setProgressText('');
    setFollowUpText('');
    setIsResultOpen(true);
    const pendingUserTurnId = createRequestId();
    setConversationTurns((current) => [
      ...current,
      {
        id: pendingUserTurnId,
        role: 'user',
        content: question
      }
    ]);

    try {
      const response = await window.studyTutor.askFollowUp({
        requestId,
        sessionId: activeSessionId,
        question,
        settings: settingsWithEffectiveProxyUrl(settings)
      });

      const streamedTurnId = streamingAssistantTurnIdRef.current;
      const streamedText = streamingAnswerTextRef.current;
      const finalText = streamedText || response.text;
      hideProgressWhenAnswerStarts(finalText);
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setResult(finalText);
      setActiveSessionId(response.sessionId);
      if (streamedTurnId) {
        setConversationTurns((current) =>
          current.map((turn) => (turn.id === streamedTurnId ? { ...turn, content: finalText } : turn))
        );
      } else {
        setConversationTurns((current) => [
          ...current,
          {
            id: createRequestId(),
            role: 'assistant',
            content: finalText
          }
        ]);
      }
      latestProgressTextRef.current = '';
      setProgressText('');
    } catch (caught) {
      const streamedTurnId = streamingAssistantTurnIdRef.current;
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';

      if (cancelingRequestIdRef.current === requestId || isCanceledError(caught)) {
        cancelingRequestIdRef.current = '';
        setConversationTurns((current) =>
          current.filter((turn) => turn.id !== pendingUserTurnId && turn.id !== streamedTurnId)
        );
        setResult('');
        setStoppedMessage('已停止本轮追问。');
        setIsDragCaptureActive(false);
        setProgressText('');
        return;
      }

      const message = caught instanceof Error ? caught.message : String(caught);
      if (isProxyTokenInvalidMessage(message)) {
        clearSavedProxyTokenState(message);
      }
      const fallbackMessage = addProviderSwitchHint(message || '追问失败，请稍后重试。');
      const visibleMessage =
        latestProgressTextRef.current && !fallbackMessage.includes('## 处理过程')
          ? [latestProgressTextRef.current, '', '## 失败原因', '', fallbackMessage].join('\n')
          : fallbackMessage;
      setConversationTurns((current) => [
        ...current.filter((turn) => turn.id !== streamedTurnId),
        {
          id: createRequestId(),
          role: 'assistant',
          content: visibleMessage
        }
      ]);
      setResult('');
      setProgressText('');
    } finally {
      setIsLoading(false);
      setIsCancelling(false);
    }
  }, [
    activeSessionId,
    addProviderSwitchHint,
    clearSavedProxyTokenState,
    followUpText,
    hideProgressWhenAnswerStarts,
    isLoading,
    settings
  ]);

  const cancelCurrentRequest = useCallback((): void => {
    const requestId = activeRequestIdRef.current;

    if (!requestId || !isLoading) {
      return;
    }

    cancelingRequestIdRef.current = requestId;
    setIsCancelling(true);
    setStoppedMessage('正在停止当前识别/回答...');
    void window.studyTutor.cancelRequest({ requestId });
  }, [isLoading]);

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

  const quitApp = useCallback((): void => {
    if (!window.confirm('确定要退出应用吗？')) {
      return;
    }

    void window.studyTutor.quitApp();
  }, []);

  // --- Callback adapters for child components ---

  const handleOcrPreviewCancel = useCallback((): void => {
    setOcrPreview(null);
    setActiveStudyItemId('');
    setProgressText('');
    setError('');
    setStoppedMessage('');
    setResult('');
    setConversationTurns([]);
    setIsResultOpen(false);
  }, []);

  const handleOcrPreviewTextChange = useCallback((text: string): void => {
    setOcrPreview((current) => (current ? { ...current, recognizedText: text } : current));
  }, []);

  const handleOcrPreviewCandidateApply = useCallback((candidateId: string): void => {
    setOcrPreview((current) => {
      const candidate = current?.candidates?.find((item) => item.id === candidateId);

      return current && candidate
        ? { ...current, recognizedText: candidate.text, selectedCandidateId: candidate.id }
        : current;
    });
  }, []);

  const handleToggleSettings = useCallback((): void => {
    if (isSettingsOpen) {
      setSettingsView('normal');
    }

    setIsSettingsOpen((open) => !open);
  }, [isSettingsOpen]);

  const handleCloseSettings = useCallback((): void => {
    setSettingsView('normal');
    setIsSettingsOpen(false);
  }, []);

  const openSetupWizard = useCallback((): void => {
    setIsSetupWizardOpen(true);
    setIsSettingsOpen(false);
    setSettingsView('normal');
    setActiveGuideKind(null);
    closeAnnouncementPanel();
  }, [closeAnnouncementPanel]);

  const completeSetupWizard = useCallback((): void => {
    if (appVersion) {
      try {
        localStorage.setItem(SETUP_WIZARD_COMPLETED_VERSION_KEY, appVersion);
      } catch {
        // Completion is best-effort; closing the wizard should still work.
      }
    }

    setIsSetupWizardOpen(false);
  }, [appVersion]);

  const dismissSetupWizard = useCallback((): void => {
    if (appVersion) {
      try {
        localStorage.setItem(SETUP_WIZARD_DISMISSED_VERSION_KEY, appVersion);
      } catch {
        // Dismissal is best-effort; closing the wizard should still work.
      }
    }

    setIsSetupWizardOpen(false);
  }, [appVersion]);

  const restoreStudyItem = useCallback(
    (item: StudyItem): void => {
      setActiveStudyItemId(item.id);
      setActiveSessionId('');
      setConversationTurns(item.turns);
      setResult([...item.turns].reverse().find((turn) => turn.role === 'assistant')?.content || '');
      setStudyItems((current) =>
        updateStudyItemMetadata(current, item.id, { lastReviewedAt: new Date().toISOString() })
      );
      setProgressText('');
      setOcrPreview(null);
      setError('');
      setStoppedMessage('');
      setFollowUpText('');
      setIsResultOpen(true);
      setIsSettingsOpen(false);
      setSettingsView('normal');
      closeAnnouncementPanel();
    },
    [closeAnnouncementPanel]
  );

  const updateStudyItem = useCallback((id: string, patch: StudyItemPatch): void => {
    setStudyItems((current) => updateStudyItemMetadata(current, id, patch));
  }, []);

  const reviewStudyItem = useCallback((id: string, grade: StudyReviewGrade): void => {
    setStudyItems((current) => updateStudyItemReviewResult(current, id, grade));
  }, []);

  const reviewCurrentStudyItem = useCallback(
    (grade: StudyReviewGrade): void => {
      if (!activeStudyItemId || !canExportConversation) {
        return;
      }

      setStudyItems((current) => {
        const items = current.some((item) => item.id === activeStudyItemId)
          ? current
          : upsertStudyItem(current, {
              id: activeStudyItemId,
              appVersion,
              settings,
              turns: conversationTurns
            });

        return updateStudyItemReviewResult(items, activeStudyItemId, grade);
      });
    },
    [activeStudyItemId, appVersion, canExportConversation, conversationTurns, settings]
  );

  const exportStudyItems = useCallback(
    async (format: StudyLibraryExportFormat, items: StudyItem[]): Promise<void> => {
      if (items.length === 0) {
        return;
      }

      setStudyLibraryExportStatus('');

      try {
        const response = await window.studyTutor.exportStudyLibrary({
          appVersion,
          exportedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
          format,
          items: items.map((item) => ({
            ...item,
            turns: item.turns.map((turn) => ({ role: turn.role, content: turn.content }))
          }))
        });

        if (!response.canceled) {
          setStudyLibraryExportStatus(response.filePath ? `已导出：${response.filePath}` : '已导出学习库。');
        }
      } catch (caught) {
        setStudyLibraryExportStatus(caught instanceof Error ? caught.message : String(caught));
      }
    },
    [appVersion]
  );

  const deleteStudyItem = useCallback((id: string): void => {
    setStudyItems((current) => current.filter((item) => item.id !== id));
    setActiveStudyItemId((current) => (current === id ? '' : current));
  }, []);

  const clearStudyItems = useCallback((): void => {
    setStudyItems([]);
    setActiveStudyItemId('');
  }, []);

  const startDragCapture = useCallback((): void => {
    setPendingCaptureRegion(null);
    setIsDragCaptureActive(true);
    setIsResultOpen(false);
    setSettingsView('normal');
    setIsSettingsOpen(false);
    closeAnnouncementPanel();
  }, [closeAnnouncementPanel]);

  const cancelDragCapture = useCallback((): void => {
    setIsDragCaptureActive(false);
    setPendingCaptureRegion(null);
  }, []);

  const handleDragCapture = useCallback(
    (selectedRegion: RegionBounds): void => {
      const nextRegion = {
        x: Math.round(selectedRegion.x),
        y: Math.round(selectedRegion.y),
        width: Math.round(selectedRegion.width),
        height: Math.round(selectedRegion.height)
      };

      setRegion(nextRegion);
      setIsDragCaptureActive(false);
      setPendingCaptureRegion(nextRegion);
    },
    []
  );

  const confirmPendingCapture = useCallback((): void => {
    if (!pendingCaptureRegion) {
      return;
    }

    const confirmedRegion = pendingCaptureRegion;
    setPendingCaptureRegion(null);
    void runExplain(confirmedRegion);
  }, [pendingCaptureRegion, runExplain]);

  const cancelPendingCapture = useCallback((): void => {
    setPendingCaptureRegion(null);
  }, []);

  const activeShortcutBindings = useMemo(() => shortcutBindings(settings), [settings]);
  const shortcutHandlers = useMemo(
    () => ({
      'start-capture': (): void => {
        if (!isLoading) {
          startDragCapture();
        }
      },
      'cancel-capture': (): void => {
        if (isLoading) {
          cancelCurrentRequest();
          return;
        }

        if (pendingCaptureRegion) {
          cancelPendingCapture();
          return;
        }

        if (isDragCaptureActive) {
          cancelDragCapture();
          return;
        }

        if (isSetupWizardOpen) {
          dismissSetupWizard();
          return;
        }

        if (isSettingsOpen) {
          handleCloseSettings();
          return;
        }

        if (isAnnouncementOpen) {
          closeAnnouncementPanel();
        }
      },
      'confirm-capture': (): void => {
        if (pendingCaptureRegion && !isLoading) {
          confirmPendingCapture();
        }
      },
      'toggle-result': (): void => setIsResultOpen((open) => !open),
      'open-settings': (): void => handleToggleSettings(),
      'open-announcements': (): void => toggleAnnouncementPanel(),
      'finish-question': (): void => {
        if (!isLoading && (activeSessionId || conversationTurns.length > 0 || result || ocrPreview)) {
          void endCurrentQuestion();
        }
      }
    }),
    [
      activeSessionId,
      cancelCurrentRequest,
      cancelDragCapture,
      cancelPendingCapture,
      closeAnnouncementPanel,
      confirmPendingCapture,
      conversationTurns.length,
      dismissSetupWizard,
      endCurrentQuestion,
      handleCloseSettings,
      handleToggleSettings,
      isAnnouncementOpen,
      isDragCaptureActive,
      isLoading,
      isSettingsOpen,
      isSetupWizardOpen,
      ocrPreview,
      pendingCaptureRegion,
      result,
      startDragCapture,
      toggleAnnouncementPanel
    ]
  );

  useKeyboardShortcuts(activeShortcutBindings, shortcutHandlers);

  return (
    <main
      className="app-shell"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {isCaptureUiVisible && isDragCaptureActive && (
        <DragCaptureOverlay
          onCancel={cancelDragCapture}
          onCapture={handleDragCapture}
        />
      )}

      {isCaptureUiVisible && pendingCaptureRegion && !isDragCaptureActive && (
        <CaptureConfirmOverlay
          region={pendingCaptureRegion}
          onCancel={cancelPendingCapture}
        />
      )}

      {isCaptureUiVisible && (
        <Toolbar
          toolbarRef={toolbarRef}
          isCaptureModeActive={isDragCaptureActive}
          hasPendingCaptureConfirm={hasPendingCaptureConfirm}
          isLoading={isLoading}
          isCancelling={isCancelling}
          hasUnreadAnnouncement={hasUnreadAnnouncement}
          toolbarPosition={toolbarPosition}
          onStartCapture={startDragCapture}
          onCancelCapture={cancelDragCapture}
          onConfirmCapture={confirmPendingCapture}
          onCancel={cancelCurrentRequest}
          onToggleResult={() => setIsResultOpen((open) => !open)}
          onToggleAnnouncement={toggleAnnouncementPanel}
          onToggleSettings={handleToggleSettings}
          onQuit={quitApp}
          onDragPointerDown={(event) => onFloatingPointerDown(event, 'toolbar')}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && activeGuide && (
        <GuidePanel
          guide={activeGuide}
          onSwitchGuide={openGuide}
          onDismiss={markGuideSeen}
          onClose={() => markGuideSeen(activeGuide.kind)}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isSetupWizardOpen && (
        <SetupWizard
          settings={settings}
          apiDefaults={apiDefaults}
          apiProviders={apiProviders}
          modelOptions={modelOptions}
          modelListError={modelListError}
          isModelListLoading={isModelListLoading}
          isModelCustom={isModelCustom}
          proxyHealthStatus={proxyHealthStatus}
          proxyHealthMessage={proxyHealthMessage}
          appVersion={appVersion}
          currentProxyUrl={currentProxyUrl}
          onSettingsChange={setSettings}
          onSelectApiConnectionMode={selectApiConnectionMode}
          onSelectApiProvider={selectApiProvider}
          onRefreshApiProviders={() => void refreshApiProviders(settings)}
          onLoadModels={() => void loadModels(settings)}
          onValidateProxyConnection={() => void validateProxyConnection()}
          onIsModelCustomChange={setIsModelCustom}
          onComplete={completeSetupWizard}
          onDismiss={dismissSetupWizard}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isAnnouncementOpen && (
        <AnnouncementPanel
          announcements={announcements}
          announcementError={announcementError}
          announcementSourceUrl={announcementSourceUrl}
          announcementPanelLevel={announcementPanelLevel}
          expandedAnnouncementIds={expandedAnnouncementIds}
          onClose={closeAnnouncementPanel}
          onToggleDetails={toggleAnnouncementDetails}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isResultOpen && (
        <ResultPanel
          resultPanel={resultPanel}
          isLoading={isLoading}
          isCancelling={isCancelling}
          error={error}
          stoppedMessage={stoppedMessage}
          result={result}
          ocrPreview={ocrPreview}
          conversationTurns={conversationTurns}
          progressText={progressText}
          followUpText={followUpText}
          activeSessionId={activeSessionId}
          canRetry={canRetry}
          canExport={canExportConversation}
          exportStatus={exportStatus}
          isCurrentFavorite={isCurrentStudyItemFavorite}
          onClose={() => setIsResultOpen(false)}
          onPanelPointerDown={onResultPanelPointerDown}
          onFollowUpTextChange={setFollowUpText}
          onSendFollowUp={() => void sendFollowUp()}
          onSendOcrPreview={() => void sendOcrPreview()}
          onOcrPreviewTextChange={handleOcrPreviewTextChange}
          onOcrPreviewCandidateApply={handleOcrPreviewCandidateApply}
          onOcrPreviewCancel={handleOcrPreviewCancel}
          onStartNextQuestion={() => void startNextQuestion()}
          onEndCurrentQuestion={() => void endCurrentQuestion()}
          onRetry={retry}
          onToggleFavorite={toggleCurrentStudyItemFavorite}
          onReviewCurrent={reviewCurrentStudyItem}
          onCopyAnswer={copyConversationMarkdown}
          onExportAnswer={() => void exportConversationMarkdown()}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}

      {isCaptureUiVisible && isSettingsOpen && (
        <SettingsPanel
          settingsPanelRef={settingsPanelRef}
          settings={settings}
          settingsView={settingsView}
          apiDefaults={apiDefaults}
          apiProviders={apiProviders}
          modelOptions={modelOptions}
          modelListError={modelListError}
          isModelListLoading={isModelListLoading}
          isModelCustom={isModelCustom}
          proxyHealthStatus={proxyHealthStatus}
          proxyHealthMessage={proxyHealthMessage}
          appVersion={appVersion}
          updateStatus={updateStatus}
          diagnosticResult={diagnosticResult}
          diagnosticError={diagnosticError}
          isDiagnosticsRunning={isDiagnosticsRunning}
          studyItems={studyItems}
          settingsPanelPosition={settingsPanelPosition}
          onSettingsChange={setSettings}
          onSettingsViewChange={setSettingsView}
          onProxyHealthStatusChange={setProxyHealthStatus}
          onProxyHealthMessageChange={setProxyHealthMessage}
          onIsModelCustomChange={setIsModelCustom}
          onClose={handleCloseSettings}
          onSelectApiConnectionMode={selectApiConnectionMode}
          onSelectApiProvider={selectApiProvider}
          onRefreshApiProviders={() => void refreshApiProviders(settings)}
          onLoadModels={() => void loadModels(settings)}
          onValidateProxyConnection={() => void validateProxyConnection()}
          onRunDiagnostics={(deepCheck) => void runSettingsDiagnostics(deepCheck)}
          onCopyDiagnosticReport={copyTextToClipboard}
          onOpenSetupWizard={openSetupWizard}
          onRestoreStudyItem={restoreStudyItem}
          onUpdateStudyItem={updateStudyItem}
          onReviewStudyItem={reviewStudyItem}
          onDeleteStudyItem={deleteStudyItem}
          onClearStudyItems={clearStudyItems}
          onExportStudyItems={(format, items) => void exportStudyItems(format, items)}
          studyLibraryExportStatus={studyLibraryExportStatus}
          onOpenGuide={openGuide}
          onDragPointerDown={(event) => onFloatingPointerDown(event, 'settings')}
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        />
      )}
    </main>
  );
}
