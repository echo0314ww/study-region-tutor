import { AlertCircle, BookOpen, Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { PointerEvent } from 'react';
import { useMemo } from 'react';
import type { OcrPreviewResult, RegionBounds } from '../../../shared/types';
import type { DragMode, StudyReviewGrade, UiConversationTurn } from '../uiTypes';
import { HANDLE_NAMES } from '../constants';
import { AnswerRenderer } from '../AnswerRenderer';
import { useTranslation } from '../i18n';
import { OcrPreviewForm } from './OcrPreviewForm';
import { ConversationView } from './ConversationView';
import { FollowUpBar } from './FollowUpBar';

export interface ResultPanelProps {
  resultPanel: RegionBounds;
  isLoading: boolean;
  isCancelling: boolean;
  error: string;
  stoppedMessage: string;
  result: string;
  ocrPreview: OcrPreviewResult | null;
  conversationTurns: UiConversationTurn[];
  progressText: string;
  followUpText: string;
  activeSessionId: string;
  canRetry: boolean;
  canExport: boolean;
  exportStatus: string;
  isCurrentFavorite: boolean;
  onClose: () => void;
  onPanelPointerDown: (event: PointerEvent, mode: DragMode) => void;
  onFollowUpTextChange: (text: string) => void;
  onSendFollowUp: () => void;
  onSendOcrPreview: () => void;
  onOcrPreviewTextChange: (text: string) => void;
  onOcrPreviewCandidateApply: (candidateId: string) => void;
  onOcrPreviewCancel: () => void;
  onStartNextQuestion: () => void;
  onEndCurrentQuestion: () => void;
  onRetry: () => void;
  onToggleFavorite: () => void;
  onReviewCurrent: (grade: StudyReviewGrade) => void;
  onCopyAnswer: () => void;
  onExportAnswer: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function ResultPanel({
  resultPanel,
  isLoading,
  isCancelling,
  error,
  stoppedMessage,
  result,
  ocrPreview,
  conversationTurns,
  progressText,
  followUpText,
  activeSessionId,
  canRetry,
  canExport,
  exportStatus,
  isCurrentFavorite,
  onClose,
  onPanelPointerDown,
  onFollowUpTextChange,
  onSendFollowUp,
  onSendOcrPreview,
  onOcrPreviewTextChange,
  onOcrPreviewCandidateApply,
  onOcrPreviewCancel,
  onStartNextQuestion,
  onEndCurrentQuestion,
  onRetry,
  onToggleFavorite,
  onReviewCurrent,
  onCopyAnswer,
  onExportAnswer,
  onPointerEnter,
  onPointerLeave
}: ResultPanelProps): JSX.Element {
  const { t } = useTranslation();
  const status = useMemo(() => {
    if (isLoading) {
      return { icon: <Loader2 size={16} className="spin" />, text: isCancelling ? t('toolbar.stopping') : t('toolbar.recognizing') };
    }

    if (error) {
      return { icon: <AlertCircle size={16} />, text: t('result.error') };
    }

    if (stoppedMessage) {
      return { icon: <X size={16} />, text: t('result.stopped') };
    }

    if (ocrPreview) {
      return { icon: <BookOpen size={16} />, text: t('result.ocrPending') };
    }

    if (result || conversationTurns.length > 0) {
      return { icon: <Check size={16} />, text: t('result.done') };
    }

    return { icon: <BookOpen size={16} />, text: t('result.pending') };
  }, [conversationTurns.length, error, isCancelling, isLoading, ocrPreview, result, stoppedMessage, t]);

  return (
    <aside
      data-interactive="true"
      className="result-panel"
      role="region"
      aria-label="result"
      aria-busy={isLoading}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        left: resultPanel.x,
        top: resultPanel.y,
        width: resultPanel.width,
        height: resultPanel.height
      }}
    >
      <div
        className="panel-header result-panel-header"
        onPointerDown={(event) => onPanelPointerDown(event, 'move')}
      >
        <div className={`status ${error ? 'danger' : ''}`} aria-live="polite">
          {status.icon}
          <span>{status.text}</span>
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
      {!isLoading && ocrPreview && (
        <OcrPreviewForm
          ocrPreview={ocrPreview}
          error={error}
          stoppedMessage={stoppedMessage}
          onTextChange={onOcrPreviewTextChange}
          onApplyCandidate={onOcrPreviewCandidateApply}
          onSend={onSendOcrPreview}
          onReselect={onStartNextQuestion}
          onCancel={onOcrPreviewCancel}
        />
      )}
      {!ocrPreview && !error && (conversationTurns.length > 0 || progressText) && (
        <ConversationView
          conversationTurns={conversationTurns}
          progressText={progressText}
          isLoading={isLoading}
        />
      )}
      {!ocrPreview && isLoading && !progressText && conversationTurns.length === 0 && (
        <div className="empty-state" style={{ display: 'grid', gap: 10 }}>
          <div className="skeleton skeleton-lg" />
          <div className="skeleton" />
          <div className="skeleton skeleton-sm" />
        </div>
      )}
      {!ocrPreview && !isLoading && !error && stoppedMessage && <div className="empty-state">{stoppedMessage}</div>}
      {!ocrPreview && !isLoading && error && (
        <div className="error-state">
          <AnswerRenderer text={error} />
          <button className="secondary-button" type="button" onClick={onRetry} disabled={!canRetry}>
            <RefreshCw size={16} />
            {t('app.retry')}
          </button>
        </div>
      )}
      {!ocrPreview && !isLoading && !error && !stoppedMessage && conversationTurns.length === 0 && !result && (
        <div className="empty-state">{t('result.waiting')}</div>
      )}
      {!ocrPreview && !error && activeSessionId && (
        <FollowUpBar
          followUpText={followUpText}
          isLoading={isLoading}
          onTextChange={onFollowUpTextChange}
          onSend={onSendFollowUp}
          onNextQuestion={onStartNextQuestion}
          onEndQuestion={onEndCurrentQuestion}
          canExport={canExport}
          exportStatus={exportStatus}
          isCurrentFavorite={isCurrentFavorite}
          onToggleFavorite={onToggleFavorite}
          onReviewCurrent={onReviewCurrent}
          onCopyAnswer={onCopyAnswer}
          onExportAnswer={onExportAnswer}
        />
      )}
      {HANDLE_NAMES.map((handle) => (
        <button
          key={handle}
          className={`result-resize-handle ${handle}`}
          type="button"
          aria-label={`resize-result-${handle}`}
          onPointerDown={(event) => onPanelPointerDown(event, handle)}
        />
      ))}
    </aside>
  );
}
