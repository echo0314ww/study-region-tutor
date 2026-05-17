import type { OcrPreviewResult } from '../../../shared/types';
import { useTranslation } from '../i18n';

export interface OcrPreviewFormProps {
  ocrPreview: OcrPreviewResult;
  error: string;
  stoppedMessage: string;
  onTextChange: (text: string) => void;
  onApplyCandidate: (candidateId: string) => void;
  onSend: () => void;
  onReselect: () => void;
  onCancel: () => void;
}

export function OcrPreviewForm({
  ocrPreview,
  error,
  stoppedMessage,
  onTextChange,
  onApplyCandidate,
  onSend,
  onReselect,
  onCancel
}: OcrPreviewFormProps): JSX.Element {
  const { t } = useTranslation();
  const ocrPreviewText = ocrPreview.recognizedText || '';
  const isOcrPreviewEmpty = !ocrPreviewText.trim();
  const selectedCandidate = ocrPreview.candidates?.find((candidate) => candidate.id === ocrPreview.selectedCandidateId);
  const hasUnsavedCandidateEdits = Boolean(selectedCandidate && selectedCandidate.text !== ocrPreviewText);
  const ocrPreviewIntro =
    ocrPreview.reason === 'image-fallback'
      ? t('ocrPreview.introFallback')
      : t('ocrPreview.introNormal');

  const formatConfidence = (confidence: number): string => {
    if (!Number.isFinite(confidence)) {
      return t('ocrPreview.confidenceUnknown');
    }

    const normalized = confidence > 1 ? confidence / 100 : confidence;
    const percent = Math.max(0, Math.min(100, Math.round(normalized * 100)));
    const level = percent >= 85 ? t('ocrPreview.confidenceHigh') : percent >= 60 ? t('ocrPreview.confidenceMedium') : t('ocrPreview.confidenceLow');

    return `${percent}% · ${level}`;
  };

  return (
    <form
      className="ocr-preview"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="ocr-preview-header">
        <strong>{t('ocrPreview.headerTitle')}</strong>
        <span>{ocrPreviewIntro}</span>
      </div>
      {ocrPreview.fallbackReason && (
        <div className="ocr-preview-note">{t('ocrPreview.fallbackReason', { reason: ocrPreview.fallbackReason })}</div>
      )}
      {ocrPreview.previewImageDataUrl && (
        <figure className="ocr-preview-image">
          <img src={ocrPreview.previewImageDataUrl} alt={t('ocrPreview.imagePreview')} />
          <figcaption>{t('ocrPreview.imagePreview')}</figcaption>
        </figure>
      )}
      {ocrPreview.candidates && ocrPreview.candidates.length > 1 && (
        <div className="ocr-candidate-list" aria-label={t('ocrPreview.candidateLabel', { index: '' }).trim()}>
          {ocrPreview.candidates.map((candidate, index) => (
            <button
              className={ocrPreview.selectedCandidateId === candidate.id ? 'active' : ''}
              key={candidate.id}
              type="button"
              onClick={() => onApplyCandidate(candidate.id)}
              title={candidate.text}
            >
              <strong>{t('ocrPreview.candidateLabel', { index: index + 1 })}</strong>
              <span>{candidate.label} · {candidate.language} · {formatConfidence(candidate.confidence)}</span>
            </button>
          ))}
        </div>
      )}
      {hasUnsavedCandidateEdits && <div className="ocr-preview-note">{t('ocrPreview.candidateSwitch')}</div>}
      {error && <div className="ocr-preview-note danger">{error}</div>}
      {stoppedMessage && <div className="ocr-preview-note">{stoppedMessage}</div>}
      <label className="ocr-preview-editor">
        {t('ocrPreview.recognizedText')}
        <textarea
          value={ocrPreviewText}
          onChange={(event) => onTextChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          spellCheck={false}
        />
      </label>
      <div className={`ocr-preview-meta ${isOcrPreviewEmpty ? 'danger' : ''}`}>
        {isOcrPreviewEmpty
          ? t('ocrPreview.emptyWarning')
          : t('ocrPreview.charCount', { count: ocrPreviewText.trim().length })}
      </div>
      <div className="ocr-preview-actions">
        <button className="primary-button" type="submit" disabled={isOcrPreviewEmpty}>
          {t('ocrPreview.sendExplain')}
        </button>
        <button className="secondary-button" type="button" onClick={onReselect}>
          {t('ocrPreview.reselect')}
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          {t('ocrPreview.cancel')}
        </button>
      </div>
    </form>
  );
}
