import type { OcrPreviewResult } from '../../../shared/types';

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
  const ocrPreviewText = ocrPreview.recognizedText || '';
  const isOcrPreviewEmpty = !ocrPreviewText.trim();
  const selectedCandidate = ocrPreview.candidates?.find((candidate) => candidate.id === ocrPreview.selectedCandidateId);
  const hasUnsavedCandidateEdits = Boolean(selectedCandidate && selectedCandidate.text !== ocrPreviewText);
  const ocrPreviewIntro =
    ocrPreview.reason === 'image-fallback'
      ? '图片接口请求失败，已转为本地 OCR。请检查识别文本后发送讲解。'
      : '请检查 OCR 识别结果，确认后发送讲解。';

  return (
    <form
      className="ocr-preview"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <div className="ocr-preview-header">
        <strong>OCR 结果确认</strong>
        <span>{ocrPreviewIntro}</span>
      </div>
      {ocrPreview.fallbackReason && (
        <div className="ocr-preview-note">图片接口失败原因：{ocrPreview.fallbackReason}</div>
      )}
      {ocrPreview.candidates && ocrPreview.candidates.length > 1 && (
        <div className="ocr-candidate-list" aria-label="OCR 候选结果">
          {ocrPreview.candidates.map((candidate, index) => (
            <button
              className={ocrPreview.selectedCandidateId === candidate.id ? 'active' : ''}
              key={candidate.id}
              type="button"
              onClick={() => onApplyCandidate(candidate.id)}
              title={candidate.text}
            >
              <strong>候选 {index + 1}</strong>
              <span>{candidate.label} · {candidate.language} · {formatConfidence(candidate.confidence)}</span>
            </button>
          ))}
        </div>
      )}
      {hasUnsavedCandidateEdits && <div className="ocr-preview-note">切换候选会替换当前已编辑文本。</div>}
      {error && <div className="ocr-preview-note danger">{error}</div>}
      {stoppedMessage && <div className="ocr-preview-note">{stoppedMessage}</div>}
      <label className="ocr-preview-editor">
        识别文本
        <textarea
          value={ocrPreviewText}
          onChange={(event) => onTextChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          spellCheck={false}
        />
      </label>
      <div className={`ocr-preview-meta ${isOcrPreviewEmpty ? 'danger' : ''}`}>
        {isOcrPreviewEmpty
          ? '识别结果为空，建议重新框选或放大截图。'
          : `当前 ${ocrPreviewText.trim().length} 个字符；确认前不会发送给第三方 API。`}
      </div>
      <div className="ocr-preview-actions">
        <button className="primary-button" type="submit" disabled={isOcrPreviewEmpty}>
          发送讲解
        </button>
        <button className="secondary-button" type="button" onClick={onReselect}>
          重新框选
        </button>
        <button className="secondary-button" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

function formatConfidence(confidence: number): string {
  if (!Number.isFinite(confidence)) {
    return '置信度未知';
  }

  const normalized = confidence > 1 ? confidence / 100 : confidence;
  const percent = Math.max(0, Math.min(100, Math.round(normalized * 100)));
  const level = percent >= 85 ? '高' : percent >= 60 ? '中' : '低';

  return `${percent}% · ${level}`;
}
