import { ArrowLeft, ArrowRight, BookOpen, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { GuideDefinition, GuideKind } from '../uiTypes';

export interface GuidePanelProps {
  guide: GuideDefinition;
  onSwitchGuide: (kind: GuideKind) => void;
  onDismiss: (kind: GuideKind) => void;
  onClose: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function GuidePanel({
  guide,
  onSwitchGuide,
  onDismiss,
  onClose,
  onPointerEnter,
  onPointerLeave
}: GuidePanelProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const hasSteps = guide.steps.length > 0;
  const currentStep = guide.steps[Math.min(stepIndex, Math.max(guide.steps.length - 1, 0))];
  const isLastStep = hasSteps && stepIndex >= guide.steps.length - 1;

  useEffect(() => {
    setStepIndex(0);
  }, [guide.kind, guide.version]);

  return (
    <section
      className="guide-panel"
      data-interactive="true"
      aria-label="guide"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="guide-header">
        <div>
          <strong>{guide.title}</strong>
          <span>{guide.subtitle}</span>
        </div>
        <button className="icon-button ghost" type="button" onClick={onClose} title="关闭">
          <X size={18} />
        </button>
      </div>
      <div className="guide-tabs" role="tablist" aria-label="guide type">
        <button
          className={guide.kind === 'product' ? 'active' : ''}
          type="button"
          onClick={() => onSwitchGuide('product')}
        >
          整体功能向导
        </button>
        <button
          className={guide.kind === 'release' ? 'active' : ''}
          type="button"
          onClick={() => onSwitchGuide('release')}
        >
          本版本新增向导
        </button>
      </div>
      {hasSteps ? (
        <>
          <div className="guide-progress">
            <span>
              {stepIndex + 1} / {guide.steps.length}
            </span>
            <div>
              {guide.steps.map((step, index) => (
                <button
                  key={step.title}
                  className={index === stepIndex ? 'active' : ''}
                  type="button"
                  aria-label={`查看第 ${index + 1} 步`}
                  onClick={() => setStepIndex(index)}
                />
              ))}
            </div>
          </div>
          <article className="guide-step">
            <BookOpen size={22} />
            <div>
              <h2>{currentStep.title}</h2>
              <p>{currentStep.body}</p>
              {currentStep.action && <span>{currentStep.action}</span>}
            </div>
          </article>
        </>
      ) : (
        <div className="guide-empty">
          <BookOpen size={24} />
          <strong>暂无本版本新增向导</strong>
          <span>接口已预留，后续版本可以在这里展示新增功能和迁移说明。</span>
        </div>
      )}
      <div className="guide-actions">
        <button className="secondary-button" type="button" onClick={() => onDismiss(guide.kind)}>
          跳过本次
        </button>
        {hasSteps && (
          <>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0}
            >
              <ArrowLeft size={16} />
              上一步
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onDismiss(guide.kind);
                  return;
                }

                setStepIndex((current) => Math.min(guide.steps.length - 1, current + 1));
              }}
            >
              {isLastStep ? <Check size={16} /> : <ArrowRight size={16} />}
              {isLastStep ? '完成' : '下一步'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
