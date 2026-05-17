import { AlertTriangle, Clipboard, Download, ScanLine, Star, ThumbsUp, X } from 'lucide-react';
import type { StudyReviewGrade } from '../uiTypes';
import { useTranslation } from '../i18n';

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
  const { t } = useTranslation();
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
        placeholder={t('followUp.placeholder')}
        disabled={isLoading}
        rows={2}
      />
      <div className="follow-up-actions">
        {/* Send group */}
        <div className="follow-up-group">
          <button className="primary-button" type="submit" disabled={isLoading || !followUpText.trim()}>
            {t('followUp.sendFollowUp')}
          </button>
        </div>

        {/* Session control group */}
        <div className="follow-up-group">
          <button className="secondary-button" type="button" onClick={onNextQuestion} disabled={isLoading}>
            <ScanLine size={16} />
            {t('followUp.nextCapture')}
          </button>
          <button className="icon-button ghost" type="button" onClick={onEndQuestion} disabled={isLoading} title={t('result.endQuestion')}>
            <X size={18} />
          </button>
        </div>

        {/* Review group — segmented control */}
        <div className="follow-up-group">
          <div className="review-segment">
            <button type="button" onClick={() => onReviewCurrent('again')} disabled={isLoading || !canExport} title={t('studyItem.reviewWrong')}>
              <AlertTriangle size={14} />
            </button>
            <button type="button" onClick={() => onReviewCurrent('hard')} disabled={isLoading || !canExport} title={t('studyItem.reviewHard')}>
              {t('studyItem.reviewHard')}
            </button>
            <button type="button" onClick={() => onReviewCurrent('good')} disabled={isLoading || !canExport} title={t('studyItem.reviewGood')}>
              <ThumbsUp size={14} />
            </button>
          </div>
        </div>

        {/* Tools group — right-aligned icon buttons */}
        <div className="follow-up-group tools-group">
          <button
            className={`icon-button${isCurrentFavorite ? ' active' : ''}`}
            type="button"
            onClick={onToggleFavorite}
            disabled={isLoading || !canExport}
            title={isCurrentFavorite ? t('studyItem.unfavorite') : t('studyItem.favorite')}
          >
            <Star size={16} />
          </button>
          <button className="icon-button" type="button" onClick={onCopyAnswer} disabled={isLoading || !canExport} title={t('result.copyAnswer')}>
            <Clipboard size={16} />
          </button>
          <button className="icon-button" type="button" onClick={onExportAnswer} disabled={isLoading || !canExport} title={t('result.exportAnswer')}>
            <Download size={16} />
          </button>
        </div>
        {exportStatus && <span className="follow-up-status">{exportStatus}</span>}
      </div>
    </form>
  );
}
