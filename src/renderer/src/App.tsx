import { AlertCircle, Bell, BookOpen, Check, ChevronDown, ChevronRight, Loader2, MessageSquareText, Power, RefreshCw, ScanLine, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type {
  Announcement,
  AnnouncementEvent,
  ApiConnectionMode,
  ApiModeSetting,
  ApiProviderOption,
  ApiRuntimeDefaults,
  InputMode,
  ModelOption,
  OcrLanguage,
  QuestionSessionTurn,
  ReasoningEffortSetting,
  RegionBounds,
  TutorLanguage,
  TutorSettings,
  UpdateStatusEvent
} from '../../shared/types';
import { AnswerRenderer } from './AnswerRenderer';

type DragMode = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface DragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startRegion: RegionBounds;
}

interface PanelDragState {
  mode: DragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startPanel: RegionBounds;
}

type UiConversationTurn = QuestionSessionTurn & {
  id: string;
};

type ProxyHealthStatus = 'idle' | 'checking' | 'success' | 'error';
type SettingsView = 'normal' | 'proxyAdvanced';

const MIN_REGION = 96;
const MIN_RESULT_PANEL_WIDTH = 320;
const MIN_RESULT_PANEL_HEIGHT = 220;
const HANDLE_NAMES: DragMode[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const BUILT_IN_PROXY_URL = 'https://mariyah-trailless-graig.ngrok-free.dev';
const ANNOUNCEMENT_HEALTH_RETRY_MS = 15000;

const DEFAULT_REGION: RegionBounds = {
  x: 220,
  y: 150,
  width: 620,
  height: 360
};

function defaultResultPanel(): RegionBounds {
  const width = Math.min(560, Math.max(MIN_RESULT_PANEL_WIDTH, window.innerWidth - 44));
  const height = Math.min(560, Math.max(MIN_RESULT_PANEL_HEIGHT, window.innerHeight - 112));

  return {
    x: window.innerWidth - width - 22,
    y: 84,
    width,
    height
  };
}

const DEFAULT_SETTINGS: TutorSettings = {
  apiConnectionMode: 'direct',
  providerId: '',
  model: '',
  language: 'zh-CN',
  reasoningOnly: false,
  apiMode: 'env',
  apiBaseUrl: '',
  apiKey: '',
  proxyUrl: '',
  proxyToken: '',
  inputMode: 'image',
  ocrLanguage: 'chi_sim',
  ocrMathMode: true,
  reasoningEffort: 'low'
};

function settingsWithApiDefaults(defaults: ApiRuntimeDefaults): TutorSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiConnectionMode: defaults.apiConnectionMode || DEFAULT_SETTINGS.apiConnectionMode,
    providerId: defaults.providerId || DEFAULT_SETTINGS.providerId,
    apiBaseUrl: defaults.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
    apiMode: defaults.providerId ? 'env' : defaults.apiMode || DEFAULT_SETTINGS.apiMode,
    proxyUrl: DEFAULT_SETTINGS.proxyUrl
  };
}

const MODEL_PLACEHOLDER_VALUE = '__select_model__';
const CUSTOM_MODEL_VALUE = '__custom_model__';
const READ_ANNOUNCEMENT_REVISION_KEY = 'study-region-tutor-read-announcement-revision';
const PROXY_TOKEN_INVALID_MESSAGE = '代理访问 Token 已失效，请重新填写最新的 TUTOR_PROXY_TOKEN。';

function effectiveProxyUrl(settings: TutorSettings): string {
  return settings.proxyUrl.trim() || BUILT_IN_PROXY_URL;
}

function settingsWithEffectiveProxyUrl(settings: TutorSettings): TutorSettings {
  if (settings.apiConnectionMode !== 'proxy') {
    return settings;
  }

  const proxyUrl = effectiveProxyUrl(settings);

  return proxyUrl ? { ...settings, proxyUrl } : settings;
}

function loadReadAnnouncementRevision(): string {
  try {
    return localStorage.getItem(READ_ANNOUNCEMENT_REVISION_KEY) || '';
  } catch {
    return '';
  }
}

function saveReadAnnouncementRevision(revision: string): void {
  localStorage.setItem(READ_ANNOUNCEMENT_REVISION_KEY, revision);
}

function isReleaseAnnouncement(announcement: Announcement): boolean {
  return announcement.id.startsWith('release-');
}

function announcementMetaText(announcement: Announcement): string {
  return announcement.level ? `${announcement.level} · ${announcement.publishedAt}` : announcement.publishedAt;
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isCanceledError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || error.message.includes('已停止当前识别/回答');
}

function isProxyTokenInvalidMessage(message: string): boolean {
  return message.includes(PROXY_TOKEN_INVALID_MESSAGE);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isInteractiveElement(element: Element | null): boolean {
  return Boolean(element?.closest('[data-interactive="true"]'));
}

function clampRegion(region: RegionBounds): RegionBounds {
  const maxWidth = Math.max(MIN_REGION, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_REGION, window.innerHeight - 24);
  const width = clamp(region.width, MIN_REGION, maxWidth);
  const height = clamp(region.height, MIN_REGION, maxHeight);

  return {
    x: clamp(region.x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clamp(region.y, 12, Math.max(12, window.innerHeight - height - 12)),
    width,
    height
  };
}

function clampResultPanel(panel: RegionBounds): RegionBounds {
  const maxWidth = Math.max(MIN_RESULT_PANEL_WIDTH, window.innerWidth - 24);
  const maxHeight = Math.max(MIN_RESULT_PANEL_HEIGHT, window.innerHeight - 24);
  const width = clamp(panel.width, MIN_RESULT_PANEL_WIDTH, maxWidth);
  const height = clamp(panel.height, MIN_RESULT_PANEL_HEIGHT, maxHeight);

  return {
    x: clamp(panel.x, 12, Math.max(12, window.innerWidth - width - 12)),
    y: clamp(panel.y, 12, Math.max(12, window.innerHeight - height - 12)),
    width,
    height
  };
}

function resizeRegion(drag: DragState, currentX: number, currentY: number): RegionBounds {
  const dx = currentX - drag.startX;
  const dy = currentY - drag.startY;
  const next = { ...drag.startRegion };

  if (drag.mode === 'move') {
    next.x += dx;
    next.y += dy;
    return clampRegion(next);
  }

  if (drag.mode.includes('e')) {
    next.width += dx;
  }

  if (drag.mode.includes('s')) {
    next.height += dy;
  }

  if (drag.mode.includes('w')) {
    next.x += dx;
    next.width -= dx;
  }

  if (drag.mode.includes('n')) {
    next.y += dy;
    next.height -= dy;
  }

  if (next.width < MIN_REGION) {
    next.x = drag.startRegion.x + drag.startRegion.width - MIN_REGION;
    next.width = MIN_REGION;
  }

  if (next.height < MIN_REGION) {
    next.y = drag.startRegion.y + drag.startRegion.height - MIN_REGION;
    next.height = MIN_REGION;
  }

  return clampRegion(next);
}

function resizeResultPanel(drag: PanelDragState, currentX: number, currentY: number): RegionBounds {
  const dx = currentX - drag.startX;
  const dy = currentY - drag.startY;
  const next = { ...drag.startPanel };

  if (drag.mode === 'move') {
    next.x += dx;
    next.y += dy;
    return clampResultPanel(next);
  }

  if (drag.mode.includes('e')) {
    next.width += dx;
  }

  if (drag.mode.includes('s')) {
    next.height += dy;
  }

  if (drag.mode.includes('w')) {
    next.x += dx;
    next.width -= dx;
  }

  if (drag.mode.includes('n')) {
    next.y += dy;
    next.height -= dy;
  }

  if (next.width < MIN_RESULT_PANEL_WIDTH) {
    if (drag.mode.includes('w')) {
      next.x = drag.startPanel.x + drag.startPanel.width - MIN_RESULT_PANEL_WIDTH;
    }

    next.width = MIN_RESULT_PANEL_WIDTH;
  }

  if (next.height < MIN_RESULT_PANEL_HEIGHT) {
    if (drag.mode.includes('n')) {
      next.y = drag.startPanel.y + drag.startPanel.height - MIN_RESULT_PANEL_HEIGHT;
    }

    next.height = MIN_RESULT_PANEL_HEIGHT;
  }

  return clampResultPanel(next);
}

export function App(): JSX.Element {
  const [region, setRegion] = useState(() => clampRegion(DEFAULT_REGION));
  const [resultPanel, setResultPanel] = useState(() => clampResultPanel(defaultResultPanel()));
  const [overlayBounds, setOverlayBounds] = useState<RegionBounds>({ x: 0, y: 0, width: 0, height: 0 });
  const [settings, setSettings] = useState<TutorSettings>(DEFAULT_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [isCaptureUiVisible, setIsCaptureUiVisible] = useState(true);
  const [isSelectionVisible, setIsSelectionVisible] = useState(false);
  const [result, setResult] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [conversationTurns, setConversationTurns] = useState<UiConversationTurn[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [progressText, setProgressText] = useState('');
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
  const [proxyHealthStatus, setProxyHealthStatus] = useState<ProxyHealthStatus>('idle');
  const [proxyHealthMessage, setProxyHealthMessage] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent>({
    status: 'idle',
    message: '尚未检查更新。'
  });
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementRevision, setAnnouncementRevision] = useState('');
  const [announcementError, setAnnouncementError] = useState('');
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<Set<string>>(() => new Set());
  const [readAnnouncementRevision, setReadAnnouncementRevision] = useState(() => loadReadAnnouncementRevision());
  const dragRef = useRef<DragState | null>(null);
  const resultPanelDragRef = useRef<PanelDragState | null>(null);
  const lastRequestRef = useRef<RegionBounds | null>(null);
  const activeRequestIdRef = useRef('');
  const cancelingRequestIdRef = useRef('');
  const latestProgressTextRef = useRef('');
  const streamingAssistantTurnIdRef = useRef('');
  const streamingAnswerTextRef = useRef('');
  const modelRequestIdRef = useRef(0);
  const proxyHealthRequestIdRef = useRef(0);
  const isModelCustomRef = useRef(false);
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isMousePassthroughRef = useRef(false);
  useEffect(() => {
    isModelCustomRef.current = isModelCustom;
  }, [isModelCustom]);

  const floatingPassthroughMode = isCaptureUiVisible && !isSelectionVisible;

  const setMousePassthrough = useCallback((ignored: boolean): void => {
    if (isMousePassthroughRef.current === ignored) {
      return;
    }

    isMousePassthroughRef.current = ignored;
    void window.studyTutor.setMousePassthrough(ignored).catch(() => undefined);
  }, []);

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

  const updateMousePassthrough = useCallback(
    (clientX: number, clientY: number, target?: EventTarget | null): void => {
      lastPointerPositionRef.current = { x: clientX, y: clientY };

      if (!floatingPassthroughMode || dragRef.current || resultPanelDragRef.current) {
        setMousePassthrough(false);
        return;
      }

      const element = target instanceof Element ? target : document.elementFromPoint(clientX, clientY);
      setMousePassthrough(!isInteractiveElement(element));
    },
    [floatingPassthroughMode, setMousePassthrough]
  );

  const enterInteractiveSurface = useCallback((): void => {
    setMousePassthrough(false);
  }, [setMousePassthrough]);

  const leaveInteractiveSurface = useCallback((): void => {
    if (!floatingPassthroughMode || dragRef.current || resultPanelDragRef.current) {
      return;
    }

    setMousePassthrough(true);
  }, [floatingPassthroughMode, setMousePassthrough]);

  useEffect(() => {
    if (!floatingPassthroughMode) {
      setMousePassthrough(false);
      return;
    }

    const lastPosition = lastPointerPositionRef.current;

    if (!lastPosition) {
      setMousePassthrough(true);
      return;
    }

    updateMousePassthrough(lastPosition.x, lastPosition.y);
  }, [
    floatingPassthroughMode,
    isAnnouncementOpen,
    isResultOpen,
    isSettingsOpen,
    resultPanel.height,
    resultPanel.width,
    resultPanel.x,
    resultPanel.y,
    setMousePassthrough,
    updateMousePassthrough
  ]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent): void => {
      updateMousePassthrough(event.clientX, event.clientY, event.target);
    };

    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [updateMousePassthrough]);

  useEffect(() => {
    return () => {
      void window.studyTutor.setMousePassthrough(false).catch(() => undefined);
    };
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
  const isProxyConnection = settings.apiConnectionMode === 'proxy';
  const manualProxyUrl = settings.proxyUrl.trim();
  const currentProxyUrl = manualProxyUrl || BUILT_IN_PROXY_URL || apiDefaults?.proxyUrl || '';
  const isBuiltInProxyUrlActive = Boolean(!manualProxyUrl && BUILT_IN_PROXY_URL && currentProxyUrl === BUILT_IN_PROXY_URL);
  const hasProxyToken = Boolean(settings.proxyToken.trim()) || Boolean(apiDefaults?.hasProxyToken);
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
  const announcementSourceUrl = useMemo(
    () => currentProxyUrl,
    [currentProxyUrl]
  );
  const hasUnreadAnnouncement = Boolean(
    announcements.length > 0 && announcementRevision && announcementRevision !== readAnnouncementRevision
  );
  const announcementPanelLevel = announcements.some((item) => item.level === 'critical')
    ? 'critical'
    : announcements.some((item) => item.level === 'warning')
      ? 'warning'
      : '';
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
      const nextOpen = !current;

      if (nextOpen) {
        markAnnouncementRevisionRead(announcementRevision);
      } else {
        setExpandedAnnouncementIds(new Set());
      }

      return nextOpen;
    });
  }, [announcementRevision, markAnnouncementRevisionRead]);

  useEffect(() => {
    if (!isAnnouncementOpen || !announcementRevision || announcementRevision === readAnnouncementRevision) {
      return;
    }

    markAnnouncementRevisionRead(announcementRevision);
  }, [announcementRevision, isAnnouncementOpen, markAnnouncementRevisionRead, readAnnouncementRevision]);

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
        sourceSettings = settingsWithApiDefaults(defaults);
        setSettings(sourceSettings);

        if (sourceSettings.apiConnectionMode === 'proxy') {
          await refreshApiProviders(sourceSettings);
          return;
        }

        setApiProviders(defaults.providers);
      } catch (caught) {
        if (!isMounted) {
          return;
        }

        const message = caught instanceof Error ? caught.message : String(caught);
        setModelListError(message || '第三方 API 配置文件读取失败。');
      }

      void loadModels(sourceSettings);
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
      setProgressText(progress.text);
      setIsResultOpen(true);
    });
    const unsubscribeAnswerDelta = window.studyTutor.onAnswerDelta((delta) => {
      if (delta.requestId !== activeRequestIdRef.current) {
        return;
      }

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
  }, [appendAnswerDelta, loadModels, refreshApiProviders]);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribeAnnouncement = window.studyTutor.onAnnouncement((event) => {
      if (isMounted) {
        handleAnnouncementEvent(event);
      }
    });

    function scheduleRetry(): void {
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

  const canRetry = Boolean(lastRequestRef.current) && !isLoading;

  const runExplain = useCallback(
    async (targetRegion = region): Promise<void> => {
      const requestId = createRequestId();
      activeRequestIdRef.current = requestId;
      latestProgressTextRef.current = '';
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setIsLoading(true);
      setIsCancelling(false);
      setIsSelectionVisible(false);
      setStoppedMessage('');
      setError('');
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

        const response = await window.studyTutor.explainRegion({
          requestId,
          region: absoluteRegion(targetRegion),
          settings: settingsWithEffectiveProxyUrl(settings)
        });
        const streamedTurnId = streamingAssistantTurnIdRef.current;
        const streamedText = streamingAnswerTextRef.current;
        const finalText = streamedText || response.text;
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
          setIsSelectionVisible(true);
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
        setIsSelectionVisible(true);
      } finally {
        setIsLoading(false);
        setIsCancelling(false);
      }
    },
    [absoluteRegion, activeSessionId, addProviderSwitchHint, clearSavedProxyTokenState, region, settings]
  );

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
    setResult('');
    setProgressText('');
    setError('');
    setStoppedMessage('');
    setFollowUpText('');
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setIsSelectionVisible(true);
  }, [activeSessionId]);

  const startNextQuestion = useCallback(async (): Promise<void> => {
    if (activeSessionId) {
      await window.studyTutor.endQuestionSession({ sessionId: activeSessionId }).catch(() => undefined);
      setActiveSessionId('');
    }

    setConversationTurns([]);
    setResult('');
    setProgressText('');
    setError('');
    setStoppedMessage('');
    setFollowUpText('');
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setIsSelectionVisible(true);
    setIsResultOpen(true);
  }, [activeSessionId]);

  const sendFollowUp = useCallback(async (): Promise<void> => {
    const question = followUpText.trim();

    if (!activeSessionId || !question || isLoading) {
      return;
    }

    const requestId = createRequestId();
    activeRequestIdRef.current = requestId;
    latestProgressTextRef.current = '';
    streamingAssistantTurnIdRef.current = '';
    streamingAnswerTextRef.current = '';
    setIsLoading(true);
    setIsCancelling(false);
    setStoppedMessage('');
    setError('');
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
        setIsSelectionVisible(false);
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
  }, [activeSessionId, addProviderSwitchHint, clearSavedProxyTokenState, followUpText, isLoading, settings]);

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

  const onPointerDownCapture = (event: PointerEvent): void => {
    lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };

    if (event.target instanceof Element && isInteractiveElement(event.target)) {
      setMousePassthrough(false);
    }
  };

  const onResultPanelPointerDown = (event: PointerEvent, mode: DragMode): void => {
    event.preventDefault();
    event.stopPropagation();
    setMousePassthrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    resultPanelDragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanel: resultPanel
    };
  };

  const onPointerDown = (event: PointerEvent, mode: DragMode): void => {
    event.preventDefault();
    setMousePassthrough(false);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRegion: region
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    updateMousePassthrough(event.clientX, event.clientY, event.target);

    const resultPanelDrag = resultPanelDragRef.current;

    if (resultPanelDrag?.pointerId === event.pointerId) {
      setResultPanel(resizeResultPanel(resultPanelDrag, event.clientX, event.clientY));
      return;
    }

    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setRegion(resizeRegion(drag, event.clientX, event.clientY));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (resultPanelDragRef.current?.pointerId === event.pointerId) {
      resultPanelDragRef.current = null;
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }

    updateMousePassthrough(event.clientX, event.clientY, event.target);
  };

  const status = useMemo(() => {
    if (isLoading) {
      return { icon: <Loader2 size={16} className="spin" />, text: isCancelling ? '停止中' : '识别中' };
    }

    if (error) {
      return { icon: <AlertCircle size={16} />, text: '出错' };
    }

    if (stoppedMessage) {
      return { icon: <X size={16} />, text: '已停止' };
    }

    if (result || conversationTurns.length > 0) {
      return { icon: <Check size={16} />, text: '完成' };
    }

    return { icon: <BookOpen size={16} />, text: '待识别' };
  }, [conversationTurns.length, error, isCancelling, isLoading, result, stoppedMessage]);

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
      void loadModels(directSettings);
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

      if (nextSettings.providerId || nextSettings.apiConnectionMode === 'direct') {
        void loadModels(nextSettings);
      }
    },
    [apiProviders, loadModels, settings]
  );

  const quitApp = useCallback((): void => {
    if (!window.confirm('确定要退出应用吗？')) {
      return;
    }

    void window.studyTutor.quitApp();
  }, []);

  return (
    <main
      className="app-shell"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {isCaptureUiVisible && isSelectionVisible && (
        <>
          <div className="shade top" style={{ height: region.y }} />
          <div className="shade left" style={{ top: region.y, width: region.x, height: region.height }} />
          <div
            className="shade right"
            style={{ top: region.y, left: region.x + region.width, height: region.height }}
          />
          <div className="shade bottom" style={{ top: region.y + region.height }} />

          <section
            data-interactive="true"
            className="selection"
            style={{ transform: `translate(${region.x}px, ${region.y}px)`, width: region.width, height: region.height }}
            onPointerDown={(event) => onPointerDown(event, 'move')}
          >
            <div className="selection-label">
              {Math.round(region.width)} x {Math.round(region.height)}
            </div>
            {HANDLE_NAMES.map((handle) => (
              <button
                key={handle}
                className={`resize-handle ${handle}`}
                type="button"
                aria-label={`resize-${handle}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onPointerDown(event, handle);
                }}
              />
            ))}
          </section>
        </>
      )}

      {isCaptureUiVisible && (
        <>
          <nav
            className="toolbar"
            aria-label="controls"
            data-interactive="true"
            onPointerEnter={enterInteractiveSurface}
            onPointerLeave={leaveInteractiveSurface}
          >
            <button
              className="secondary-button"
              type="button"
              onClick={() => setIsSelectionVisible((visible) => !visible)}
              disabled={isLoading}
            >
              <ScanLine size={18} />
              {isSelectionVisible ? '隐藏截图' : '截图'}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void runExplain()}
              disabled={isLoading || !isSelectionVisible}
            >
              {isLoading ? <Loader2 size={18} className="spin" /> : <BookOpen size={18} />}
              {isLoading ? '识别中' : '识别并讲解'}
            </button>
            {isLoading && (
              <button className="secondary-button" type="button" onClick={cancelCurrentRequest} disabled={isCancelling}>
                <X size={18} />
                {isCancelling ? '停止中' : '停止'}
              </button>
            )}
            <button className="icon-button" type="button" onClick={() => setIsResultOpen((open) => !open)} title="对话">
              <MessageSquareText size={18} />
            </button>
            <button
              className={`icon-button ${hasUnreadAnnouncement ? 'has-dot' : ''}`}
              type="button"
              onClick={toggleAnnouncementPanel}
              title="公告"
            >
              <Bell size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                if (isSettingsOpen) {
                  setSettingsView('normal');
                }

                setIsSettingsOpen((open) => !open);
              }}
              title="设置"
            >
              <Settings size={18} />
            </button>
            <button className="icon-button" type="button" onClick={quitApp} title="退出应用">
              <Power size={18} />
            </button>
          </nav>
        </>
      )}

      {isCaptureUiVisible && isAnnouncementOpen && (
        <aside
          className="announcement-panel"
          aria-label="announcement"
          data-interactive="true"
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        >
          <div className="panel-header">
            <div className={`status announcement-status ${announcementPanelLevel}`}>
              <Bell size={16} />
              <span>公告(如有红点提醒，不妨看看公告内容有什么变化)</span>
            </div>
            <button
              className="icon-button ghost"
              type="button"
              onClick={() => {
                setIsAnnouncementOpen(false);
                setExpandedAnnouncementIds(new Set());
              }}
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
          {announcements.length > 0 ? (
            <div className="announcement-list">
              {announcements.map((item) => {
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
                          onClick={() => toggleAnnouncementDetails(item.id)}
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
            </div>
          ) : (
            <div className="empty-state">
              {announcementError || (announcementSourceUrl ? '暂无公告' : '未配置远程服务地址')}
            </div>
          )}
        </aside>
      )}

      {isCaptureUiVisible && isResultOpen && (
        <aside
          data-interactive="true"
          className="result-panel"
          aria-label="result"
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
          style={{
            left: resultPanel.x,
            top: resultPanel.y,
            width: resultPanel.width,
            height: resultPanel.height
          }}
        >
          <div
            className="panel-header result-panel-header"
            onPointerDown={(event) => onResultPanelPointerDown(event, 'move')}
          >
            <div className={`status ${error ? 'danger' : ''}`}>
              {status.icon}
              <span>{status.text}</span>
            </div>
            <button
              className="icon-button ghost"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setIsResultOpen(false)}
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>
          {!error && (conversationTurns.length > 0 || progressText) && (
            <div className="conversation-list">
              {conversationTurns.map((turn) => (
                <section className={`conversation-turn ${turn.role}`} key={turn.id}>
                  <div className="conversation-role">{turn.role === 'user' ? '我的追问' : '讲解'}</div>
                  {turn.role === 'assistant' ? (
                    <AnswerRenderer text={turn.content} />
                  ) : (
                    <p className="user-message">{turn.content}</p>
                  )}
                </section>
              ))}
              {isLoading && progressText && (
                <section className="conversation-turn assistant">
                  <div className="conversation-role">处理过程</div>
                  <AnswerRenderer text={progressText} />
                </section>
              )}
            </div>
          )}
          {isLoading && !progressText && conversationTurns.length === 0 && <div className="empty-state">正在分析截图...</div>}
          {!isLoading && !error && stoppedMessage && <div className="empty-state">{stoppedMessage}</div>}
          {!isLoading && error && (
            <div className="error-state">
              <AnswerRenderer text={error} />
              <button className="secondary-button" type="button" onClick={retry} disabled={!canRetry}>
                <RefreshCw size={16} />
                重试
              </button>
            </div>
          )}
          {!isLoading && !error && !stoppedMessage && conversationTurns.length === 0 && !result && (
            <div className="empty-state">等待识别</div>
          )}
          {!error && activeSessionId && (
            <form
              className="follow-up-bar"
              onSubmit={(event) => {
                event.preventDefault();
                void sendFollowUp();
              }}
            >
              <textarea
                value={followUpText}
                onChange={(event) => setFollowUpText(event.target.value)}
                onPointerDown={(event) => event.stopPropagation()}
                placeholder="继续追问这道题..."
                disabled={isLoading}
                rows={2}
              />
              <div className="follow-up-actions">
                <button className="secondary-button" type="submit" disabled={isLoading || !followUpText.trim()}>
                  发送追问
                </button>
                <button className="secondary-button" type="button" onClick={() => void startNextQuestion()} disabled={isLoading}>
                  截图下一题
                </button>
                <button className="icon-button ghost" type="button" onClick={() => void endCurrentQuestion()} disabled={isLoading} title="结束本题">
                  <X size={18} />
                </button>
              </div>
            </form>
          )}
          {HANDLE_NAMES.map((handle) => (
            <button
              key={handle}
              className={`result-resize-handle ${handle}`}
              type="button"
              aria-label={`resize-result-${handle}`}
              onPointerDown={(event) => onResultPanelPointerDown(event, handle)}
            />
          ))}
        </aside>
      )}

      {isCaptureUiVisible && isSettingsOpen && (
        <aside
          className="settings-panel"
          aria-label="settings"
          data-interactive="true"
          onPointerEnter={enterInteractiveSurface}
          onPointerLeave={leaveInteractiveSurface}
        >
          <div className="panel-header">
            <div className="settings-title-row">
              <strong>{settingsView === 'proxyAdvanced' ? '高级设置' : '设置'}</strong>
              {settingsView === 'normal' && isProxyConnection && (
                <button
                  className="secondary-button settings-advanced-button"
                  type="button"
                  onClick={() => {
                    setProxyHealthStatus('idle');
                    setProxyHealthMessage('');
                    setSettingsView('proxyAdvanced');
                  }}
                >
                  高级设置
                </button>
              )}
              {settingsView === 'proxyAdvanced' && (
                <button
                  className="secondary-button settings-advanced-button"
                  type="button"
                  onClick={() => setSettingsView('normal')}
                >
                  返回普通设置
                </button>
              )}
            </div>
            <button
              className="icon-button ghost"
              type="button"
              onClick={() => {
                setSettingsView('normal');
                setIsSettingsOpen(false);
              }}
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
                    setSettings((current) => ({ ...current, proxyUrl: event.target.value }));
                    setProxyHealthStatus('idle');
                    setProxyHealthMessage('');
                  }}
                  placeholder="留空使用默认代理服务地址"
                  spellCheck={false}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void validateProxyConnection()}
                disabled={proxyHealthStatus === 'checking'}
              >
                {proxyHealthStatus === 'checking' ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                {proxyHealthStatus === 'checking' ? '验证中...' : '验证是否连接成功'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSettings((current) => ({ ...current, proxyUrl: '' }));
                  setProxyHealthStatus('idle');
                  setProxyHealthMessage('已恢复默认地址，请点击验证是否连接成功。');
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
          <label>
            API 连接模式
            <select
              value={settings.apiConnectionMode}
              onChange={(event) => selectApiConnectionMode(event.target.value as ApiConnectionMode)}
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
                  onChange={(event) => setSettings((current) => ({ ...current, proxyToken: event.target.value }))}
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
                onClick={() => void refreshApiProviders(settings)}
                disabled={isModelListLoading}
              >
                {isModelListLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                刷新代理服务商
              </button>
            </>
          )}
          <label>
            API 服务商
            <select value={settings.providerId} onChange={(event) => selectApiProvider(event.target.value)}>
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
                  setSettings((current) => ({ ...current, apiMode: event.target.value as ApiModeSetting }))
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
                    setIsModelCustom(true);
                    setSettings((current) => ({ ...current, model: current.model || '' }));
                    return;
                  }

                  if (value === MODEL_PLACEHOLDER_VALUE) {
                    setIsModelCustom(false);
                    setSettings((current) => ({ ...current, model: '' }));
                    return;
                  }

                  setIsModelCustom(false);
                  setSettings((current) => ({ ...current, model: value }));
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
                onClick={() => void loadModels(settings)}
                disabled={isModelListLoading}
                title="刷新模型列表"
              >
                {isModelListLoading ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              </button>
            </div>
            {modelSelectValue === CUSTOM_MODEL_VALUE && (
              <input
                value={settings.model}
                onChange={(event) => setSettings((current) => ({ ...current, model: event.target.value }))}
                placeholder="输入服务商支持的模型名"
                spellCheck={false}
              />
            )}
            <span className={`model-status ${modelListError ? 'danger' : ''}`}>{modelStatusText}</span>
          </label>
          <label>
            思考程度
            <select
              value={settings.reasoningEffort}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  reasoningEffort: event.target.value as ReasoningEffortSetting
                }))
              }
            >
              <option value="off">关闭</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="xhigh">xhigh</option>
            </select>
          </label>
          <label>
            输入方式
            <select
              value={settings.inputMode}
              onChange={(event) =>
                setSettings((current) => ({ ...current, inputMode: event.target.value as InputMode }))
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
                setSettings((current) => ({ ...current, ocrLanguage: event.target.value as OcrLanguage }))
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
              onChange={(event) => setSettings((current) => ({ ...current, ocrMathMode: event.target.checked }))}
            />
            数学公式增强
          </label>
          <label>
            语言
            <select
              value={settings.language}
              onChange={(event) =>
                setSettings((current) => ({ ...current, language: event.target.value as TutorLanguage }))
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
              onChange={(event) => setSettings((current) => ({ ...current, reasoningOnly: event.target.checked }))}
            />
            只讲思路
          </label>
            </>
          )}
        </aside>
      )}
    </main>
  );
}
