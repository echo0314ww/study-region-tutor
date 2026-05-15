import { AlertTriangle, Clipboard, Download, Star, ThumbsUp, X } from 'lucide-react';
import type { StudyReviewGrade } from '../uiTypes';

export interface FollowUpBarProps {
  followUpText: string;
  isLoading: boolean;
  canExport: boolean;
  exportStatus: string;
  isCurrentFavorite: boolean;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onNextQuestion: () => void;
  onEndQuestion: () => void;
  onToggleFavorite: () => void;
  onReviewCurrent: (grade: StudyReviewGrade) => void;
  onCopyAnswer: () => void;
  onExportAnswer: () => void;
}

export function FollowUpBar({
  followUpText,
  isLoading,
  canExport,
  exportStatus,
  isCurrentFavorite,
  onTextChange,
  onSend,
  onNextQuestion,
  onEndQuestion,
  onToggleFavorite,
  onReviewCurrent,
  onCopyAnswer,
  onExportAnswer
}: FollowUpBarProps): JSX.Element {
  return (
    <form
      className="follow-up-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        value={followUpText}
        onChange={(event) => onTextChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="继续追问这道题..."
        disabled={isLoading}
        rows={2}
      />
      <div className="follow-up-actions">
        <button className="secondary-button" type="submit" disabled={isLoading || !followUpText.trim()}>
          发送追问
        </button>
        <button className="secondary-button" type="button" onClick={onNextQuestion} disabled={isLoading}>
          截图下一题
        </button>
        <button
          className={`secondary-button ${isCurrentFavorite ? 'active' : ''}`}
          type="button"
          onClick={onToggleFavorite}
          disabled={isLoading || !canExport}
        >
          <Star size={16} />
          {isCurrentFavorite ? '已收藏' : '收藏'}
        </button>
        <button className="secondary-button" type="button" onClick={() => onReviewCurrent('again')} disabled={isLoading || !canExport}>
          <AlertTriangle size={16} />
          答错了
        </button>
        <button className="secondary-button" type="button" onClick={() => onReviewCurrent('hard')} disabled={isLoading || !canExport}>
          有点忘
        </button>
        <button className="secondary-button" type="button" onClick={() => onReviewCurrent('good')} disabled={isLoading || !canExport}>
          <ThumbsUp size={16} />
          答对了
        </button>
        <button className="secondary-button" type="button" onClick={onCopyAnswer} disabled={isLoading || !canExport}>
          <Clipboard size={16} />
          复制答案
        </button>
        <button className="secondary-button" type="button" onClick={onExportAnswer} disabled={isLoading || !canExport}>
          <Download size={16} />
          导出答案
        </button>
        <button className="icon-button ghost" type="button" onClick={onEndQuestion} disabled={isLoading} title="结束本题">
          <X size={18} />
        </button>
        {exportStatus && <span className="follow-up-status">{exportStatus}</span>}
      </div>
    </form>
  );
}
