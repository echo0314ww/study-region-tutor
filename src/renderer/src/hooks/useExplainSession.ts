import { useCallback, useEffect, useRef, useState } from 'react';
import type { OcrPreviewResult, RegionBounds, TutorSettings } from '../../../shared/types';
import type { UiConversationTurn } from '../uiTypes';
import {
  createRequestId,
  isCanceledError,
  isOcrPreviewResult,
  isProxyTokenInvalidMessage,
  settingsWithEffectiveProxyUrl
} from '../uiUtils';

export interface UseExplainSessionReturn {
  result: string;
  activeSessionId: string;
  conversationTurns: UiConversationTurn[];
  followUpText: string;
  setFollowUpText: React.Dispatch<React.SetStateAction<string>>;
  progressText: string;
  ocrPreview: OcrPreviewResult | null;
  error: string;
  stoppedMessage: string;
  isLoading: boolean;
  isCancelling: boolean;
  exportStatus: string;
  setExportStatus: React.Dispatch<React.SetStateAction<string>>;
  activeStudyItemId: string;
  canRetry: boolean;
  runExplain: (targetRegion: RegionBounds) => Promise<void>;
  sendOcrPreview: () => Promise<void>;
  sendFollowUp: () => Promise<void>;
  cancelCurrentRequest: () => void;
  endCurrentQuestion: () => Promise<void>;
  startNextQuestion: () => Promise<void>;
  retry: () => void;
  handleOcrPreviewCancel: () => void;
  handleOcrPreviewTextChange: (text: string) => void;
  handleOcrPreviewCandidateApply: (candidateId: string) => void;
}

interface UseExplainSessionDeps {
  settings: TutorSettings;
  overlayBounds: RegionBounds;
  addProviderSwitchHint: (message: string) => string;
  clearSavedProxyTokenState: (message?: string) => void;
  onCaptureReset: () => void;
  onResultOpen: () => void;
  onResultClose: () => void;
}

export function useExplainSession(deps: UseExplainSessionDeps): UseExplainSessionReturn {
  const { settings, overlayBounds, addProviderSwitchHint, clearSavedProxyTokenState } = deps;

  const onCaptureResetRef = useRef(deps.onCaptureReset);
  const onResultOpenRef = useRef(deps.onResultOpen);
  const onResultCloseRef = useRef(deps.onResultClose);
  onCaptureResetRef.current = deps.onCaptureReset;
  onResultOpenRef.current = deps.onResultOpen;
  onResultCloseRef.current = deps.onResultClose;

  const [result, setResult] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [activeStudyItemId, setActiveStudyItemId] = useState('');
  const [conversationTurns, setConversationTurns] = useState<UiConversationTurn[]>([]);
  const [followUpText, setFollowUpText] = useState('');
  const [progressText, setProgressText] = useState('');
  const [ocrPreview, setOcrPreview] = useState<OcrPreviewResult | null>(null);
  const [error, setError] = useState('');
  const [stoppedMessage, setStoppedMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  const lastRequestRef = useRef<RegionBounds | null>(null);
  const activeRequestIdRef = useRef('');
  const cancelingRequestIdRef = useRef('');
  const latestProgressTextRef = useRef('');
  const hasAnswerStartedRef = useRef(false);
  const streamingAssistantTurnIdRef = useRef('');
  const streamingAnswerTextRef = useRef('');

  const canRetry = Boolean(lastRequestRef.current) && !isLoading;

  useEffect(() => {
    if (!exportStatus) {
      return undefined;
    }

    const timer = window.setTimeout(() => setExportStatus(''), 6000);
    return () => window.clearTimeout(timer);
  }, [exportStatus]);

  const absoluteRegion = useCallback(
    (localRegion: RegionBounds): RegionBounds => ({
      x: Math.round(overlayBounds.x + localRegion.x),
      y: Math.round(overlayBounds.y + localRegion.y),
      width: Math.round(localRegion.width),
      height: Math.round(localRegion.height)
    }),
    [overlayBounds]
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
        return [...current, { id: turnId, role: 'assistant' as const, content: nextText, timestamp: new Date().toISOString() }];
      }

      const nextTurns = [...current];
      nextTurns[existingIndex] = { ...nextTurns[existingIndex], content: nextText };
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

  useEffect(
    () =>
      window.studyTutor.onExplainProgress((progress) => {
        if (progress.requestId !== activeRequestIdRef.current) {
          return;
        }

        latestProgressTextRef.current = progress.text;
        if (!hasAnswerStartedRef.current) {
          setProgressText(progress.text);
        }
        onResultOpenRef.current();
      }),
    []
  );

  useEffect(
    () =>
      window.studyTutor.onAnswerDelta((delta) => {
        if (delta.requestId !== activeRequestIdRef.current) {
          return;
        }

        if (delta.reset) {
          hasAnswerStartedRef.current = false;
        }
        hideProgressWhenAnswerStarts(delta.text);
        appendAnswerDelta(delta.text, delta.reset);
        onResultOpenRef.current();
      }),
    [appendAnswerDelta, hideProgressWhenAnswerStarts]
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
    onResultOpenRef.current();
  }, []);

  const handleStreamingSuccess = useCallback(
    (responseText: string, responseSessionId: string): void => {
      const streamedTurnId = streamingAssistantTurnIdRef.current;
      const streamedText = streamingAnswerTextRef.current;
      const finalText = streamedText || responseText;
      hideProgressWhenAnswerStarts(finalText);
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';
      setResult(finalText);
      setActiveSessionId(responseSessionId);
      if (streamedTurnId) {
        setConversationTurns((current) =>
          current.map((turn) => (turn.id === streamedTurnId ? { ...turn, content: finalText } : turn))
        );
      } else {
        setConversationTurns((current) => [
          ...current,
          { id: createRequestId(), role: 'assistant' as const, content: finalText, timestamp: new Date().toISOString() }
        ]);
      }
      latestProgressTextRef.current = '';
      setProgressText('');
    },
    [hideProgressWhenAnswerStarts]
  );

  const handleStreamingError = useCallback(
    (caught: unknown, requestId: string, extraTurnIdsToRemove: string[] = []): 'canceled' | 'error' => {
      const streamedTurnId = streamingAssistantTurnIdRef.current;
      streamingAssistantTurnIdRef.current = '';
      streamingAnswerTextRef.current = '';

      if (cancelingRequestIdRef.current === requestId || isCanceledError(caught)) {
        cancelingRequestIdRef.current = '';
        const idsToRemove = new Set([...extraTurnIdsToRemove, ...(streamedTurnId ? [streamedTurnId] : [])]);
        if (idsToRemove.size > 0) {
          setConversationTurns((current) => current.filter((turn) => !idsToRemove.has(turn.id)));
        }
        setResult('');
        setStoppedMessage('已停止当前识别/回答。');
        setProgressText('');
        return 'canceled';
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
      return 'error';
    },
    [addProviderSwitchHint, clearSavedProxyTokenState]
  );

  const runExplain = useCallback(
    async (targetRegion: RegionBounds): Promise<void> => {
      const requestId = createRequestId();
      activeRequestIdRef.current = requestId;
      setActiveStudyItemId(createRequestId());
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
      onResultOpenRef.current();
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

        handleStreamingSuccess(response.text, response.sessionId);
      } catch (caught) {
        handleStreamingError(caught, requestId);
      } finally {
        setIsLoading(false);
        setIsCancelling(false);
      }
    },
    [absoluteRegion, activeSessionId, handleStreamingError, handleStreamingSuccess, settings, showOcrPreview]
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
    onResultOpenRef.current();

    try {
      const response = await window.studyTutor.explainRecognizedText({
        requestId,
        recognizedText: previewSnapshot.recognizedText,
        settings: settingsWithEffectiveProxyUrl(settings),
        sourceMode: previewSnapshot.sourceMode,
        reason: previewSnapshot.reason,
        fallbackReason: previewSnapshot.fallbackReason
      });

      handleStreamingSuccess(response.text, response.sessionId);
    } catch (caught) {
      handleStreamingError(caught, requestId);
      setOcrPreview(previewSnapshot);
    } finally {
      setIsLoading(false);
      setIsCancelling(false);
    }
  }, [handleStreamingError, handleStreamingSuccess, isLoading, ocrPreview, settings]);

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
    onResultOpenRef.current();
    const pendingUserTurnId = createRequestId();
    setConversationTurns((current) => [
      ...current,
      { id: pendingUserTurnId, role: 'user' as const, content: question, timestamp: new Date().toISOString() }
    ]);

    try {
      const response = await window.studyTutor.askFollowUp({
        requestId,
        sessionId: activeSessionId,
        question,
        settings: settingsWithEffectiveProxyUrl(settings)
      });

      handleStreamingSuccess(response.text, response.sessionId);
    } catch (caught) {
      const outcome = handleStreamingError(caught, requestId, [pendingUserTurnId]);

      if (outcome === 'error') {
        const message = caught instanceof Error ? caught.message : String(caught);
        const fallbackMessage = addProviderSwitchHint(message || '追问失败，请稍后重试。');
        const visibleMessage =
          latestProgressTextRef.current && !fallbackMessage.includes('## 处理过程')
            ? [latestProgressTextRef.current, '', '## 失败原因', '', fallbackMessage].join('\n')
            : fallbackMessage;
        setConversationTurns((current) => [
          ...current,
          { id: createRequestId(), role: 'assistant' as const, content: visibleMessage, timestamp: new Date().toISOString() }
        ]);
        setError('');
        setResult('');
        setProgressText('');
      }
    } finally {
      setIsLoading(false);
      setIsCancelling(false);
    }
  }, [activeSessionId, addProviderSwitchHint, followUpText, handleStreamingError, handleStreamingSuccess, isLoading, settings]);

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
    onCaptureResetRef.current();
    onResultCloseRef.current();
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
    onCaptureResetRef.current();
    onResultCloseRef.current();
  }, [activeSessionId]);

  const retry = useCallback(() => {
    if (lastRequestRef.current) {
      void runExplain(lastRequestRef.current);
    }
  }, [runExplain]);

  const handleOcrPreviewCancel = useCallback((): void => {
    setOcrPreview(null);
    setActiveStudyItemId('');
    setProgressText('');
    setError('');
    setStoppedMessage('');
    setResult('');
    setConversationTurns([]);
    onResultCloseRef.current();
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

  return {
    result,
    activeSessionId,
    conversationTurns,
    followUpText,
    setFollowUpText,
    progressText,
    ocrPreview,
    error,
    stoppedMessage,
    isLoading,
    isCancelling,
    exportStatus,
    setExportStatus,
    activeStudyItemId,
    canRetry,
    runExplain,
    sendOcrPreview,
    sendFollowUp,
    cancelCurrentRequest,
    endCurrentQuestion,
    startNextQuestion,
    retry,
    handleOcrPreviewCancel,
    handleOcrPreviewTextChange,
    handleOcrPreviewCandidateApply
  };
}
