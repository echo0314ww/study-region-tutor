import { AlertCircle, BookOpen, Check, Loader2, PanelRight, RefreshCw, Settings, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type {
  ApiModeSetting,
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

const MIN_REGION = 96;
const MIN_RESULT_PANEL_WIDTH = 320;
const MIN_RESULT_PANEL_HEIGHT = 220;
const HANDLE_NAMES: DragMode[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

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
  model: '',
  language: 'zh-CN',
  reasoningOnly: false,
  apiMode: 'env',
  apiBaseUrl: '',
  apiKey: '',
  inputMode: 'image',
  ocrLanguage: 'chi_sim',
  ocrMathMode: true,
  reasoningEffort: 'xhigh'
};

function settingsWithApiDefaults(defaults: ApiRuntimeDefaults): TutorSettings {
  return {
    ...DEFAULT_SETTINGS,
    apiBaseUrl: defaults.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
    apiMode: defaults.apiMode || DEFAULT_SETTINGS.apiMode
  };
}

const MODEL_PLACEHOLDER_VALUE = '__select_model__';
const CUSTOM_MODEL_VALUE = '__custom_model__';

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
  const [isResultOpen, setIsResultOpen] = useState(true);
  const [isCaptureUiVisible, setIsCaptureUiVisible] = useState(true);
  const [isSelectionVisible, setIsSelectionVisible] = useState(true);
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
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusEvent>({
    status: 'idle',
    message: '尚未检查更新。'
  });
  const dragRef = useRef<DragState | null>(null);
  const resultPanelDragRef = useRef<PanelDragState | null>(null);
  const lastRequestRef = useRef<RegionBounds | null>(null);
  const activeRequestIdRef = useRef('');
  const cancelingRequestIdRef = useRef('');
  const latestProgressTextRef = useRef('');
  const streamingAssistantTurnIdRef = useRef('');
  const streamingAnswerTextRef = useRef('');
  const modelRequestIdRef = useRef(0);
  const isModelCustomRef = useRef(false);

  useEffect(() => {
    isModelCustomRef.current = isModelCustom;
  }, [isModelCustom]);

  const loadModels = useCallback(async (sourceSettings: TutorSettings): Promise<void> => {
    const requestId = modelRequestIdRef.current + 1;
    modelRequestIdRef.current = requestId;
    setIsModelListLoading(true);
    setModelListError('');

    try {
      const response = await window.studyTutor.listModels(sourceSettings);

      if (modelRequestIdRef.current !== requestId) {
        return;
      }

      setModelOptions(response.models);

      if (response.models.length === 0) {
        setModelListError('第三方 API 没有返回可选择的模型。');
      } else if (!isModelCustomRef.current) {
        const firstModelId = response.models[0]?.id;

        setSettings((current) => (current.model.trim() || !firstModelId ? current : { ...current, model: firstModelId }));
      }
    } catch (caught) {
      if (modelRequestIdRef.current !== requestId) {
        return;
      }

      const message = caught instanceof Error ? caught.message : String(caught);
      setModelOptions([]);
      setModelListError(message || '模型列表获取失败，请检查第三方 API 配置。');
    } finally {
      if (modelRequestIdRef.current === requestId) {
        setIsModelListLoading(false);
      }
    }
  }, []);

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
  const isCheckingUpdate = updateStatus.status === 'checking' || updateStatus.status === 'downloading';
  const updateMessage = [
    appVersion ? `当前版本：${appVersion}` : '',
    updateStatus.version ? `最新版本：${updateStatus.version}` : '',
    updateStatus.message
  ]
    .filter(Boolean)
    .join(' · ');

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
  }, [appendAnswerDelta, loadModels]);

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
          settings
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
        const fallbackMessage = message || '识别失败，请稍后重试。';
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
    [absoluteRegion, activeSessionId, region, settings]
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
        settings
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
      const fallbackMessage = message || '追问失败，请稍后重试。';
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
  }, [activeSessionId, followUpText, isLoading, settings]);

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

  const onResultPanelPointerDown = (event: PointerEvent, mode: DragMode): void => {
    event.preventDefault();
    event.stopPropagation();
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

  return (
    <main className="app-shell" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
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
          <nav className="toolbar" aria-label="controls">
            {(isSelectionVisible || isLoading) && (
              <button className="primary-button" type="button" onClick={() => void runExplain()} disabled={isLoading}>
                {isLoading ? <Loader2 size={18} className="spin" /> : <BookOpen size={18} />}
                识别并讲解
              </button>
            )}
            {isLoading && (
              <button className="secondary-button" type="button" onClick={cancelCurrentRequest} disabled={isCancelling}>
                <X size={18} />
                {isCancelling ? '停止中' : '停止'}
              </button>
            )}
            <button className="icon-button" type="button" onClick={() => setIsResultOpen((open) => !open)} title="结果">
              <PanelRight size={18} />
            </button>
            <button className="icon-button" type="button" onClick={() => setIsSettingsOpen((open) => !open)} title="设置">
              <Settings size={18} />
            </button>
          </nav>
        </>
      )}

      {isCaptureUiVisible && isResultOpen && (
        <aside
          className="result-panel"
          aria-label="result"
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
        <aside className="settings-panel" aria-label="settings">
          <div className="panel-header">
            <strong>设置</strong>
            <button className="icon-button ghost" type="button" onClick={() => setIsSettingsOpen(false)} title="关闭">
              <X size={18} />
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
                disabled={isCheckingUpdate}
              >
                {isCheckingUpdate ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                检查更新
              </button>
              {updateStatus.status === 'downloaded' && (
                <button className="secondary-button" type="button" onClick={() => void window.studyTutor.installUpdate()}>
                  <Check size={16} />
                  重启安装
                </button>
              )}
            </div>
          </div>
          <label>
            API Base URL
            <input
              value={settings.apiBaseUrl}
              onChange={(event) => setSettings((current) => ({ ...current, apiBaseUrl: event.target.value }))}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
          </label>
          <label>
            API Key
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => setSettings((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder="可留空使用 AI_API_KEY"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="model-status">
              {apiDefaults?.hasApiKey ? '已从配置文件加载 API Key，不会显示明文。' : '未检测到 AI_API_KEY。'}
            </span>
          </label>
          <label>
            接口模式
            <select
              value={settings.apiMode}
              onChange={(event) =>
                setSettings((current) => ({ ...current, apiMode: event.target.value as ApiModeSetting }))
              }
            >
              <option value="env">使用环境变量</option>
              <option value="chat-completions">Chat Completions 兼容</option>
              <option value="responses">Responses 兼容</option>
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
        </aside>
      )}
    </main>
  );
}
