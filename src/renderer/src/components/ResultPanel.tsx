import { AlertCircle, BookOpen, Check, Loader2, RefreshCw, X } from 'lucide-react';
import type { PointerEvent } from 'react';
import { useMemo } from 'react';
import type { OcrPreviewResult, RegionBounds } from '../../../shared/types';
import type { DragMode, UiConversationTurn } from '../uiTypes';
import { HANDLE_NAMES } from '../constants';
import { AnswerRenderer } from '../AnswerRenderer';
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
  onCopyAnswer,
  onExportAnswer,
  onPointerEnter,
  onPointerLeave
}: ResultPanelProps): JSX.Element {
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

    if (ocrPreview) {
      return { icon: <BookOpen size={16} />, text: 'OCR 待确认' };
    }

    if (result || conversationTurns.length > 0) {
      return { icon: <Check size={16} />, text: '完成' };
    }

    return { icon: <BookOpen size={16} />, text: '待识别' };
  }, [conversationTurns.length, error, isCancelling, isLoading, ocrPreview, result, stoppedMessage]);

  return (
    <aside
      data-interactive="true"
      className="result-panel"
      aria-label="result"
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
        <div className={`status ${error ? 'danger' : ''}`}>
          {status.icon}
          <span>{status.text}</span>
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
      {!ocrPreview && isLoading && !progressText && conversationTurns.length === 0 && <div className="empty-state">正在分析截图...</div>}
      {!ocrPreview && !isLoading && !error && stoppedMessage && <div className="empty-state">{stoppedMessage}</div>}
      {!ocrPreview && !isLoading && error && (
        <div className="error-state">
          <AnswerRenderer text={error} />
          <button className="secondary-button" type="button" onClick={onRetry} disabled={!canRetry}>
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      )}
      {!ocrPreview && !isLoading && !error && !stoppedMessage && conversationTurns.length === 0 && !result && (
        <div className="empty-state">等待识别</div>
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
