import { ArrowLeft, ArrowRight, BookOpen, Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n';
import type { GuideDefinition, GuideKind } from '../uiTypes';
import { useFocusTrap } from '../useFocusTrap';

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
  const { t } = useTranslation();
  const trapRef = useFocusTrap<HTMLElement>();
  const [stepIndex, setStepIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyVersions = guide.historyVersions || [];
  const selectedHistory = historyVersions[Math.min(historyIndex, Math.max(historyVersions.length - 1, 0))];
  const visibleSteps = guide.kind === 'history' && selectedHistory ? selectedHistory.steps : guide.steps;
  const hasSteps = visibleSteps.length > 0;
  const currentStep = visibleSteps[Math.min(stepIndex, Math.max(visibleSteps.length - 1, 0))];
  const isLastStep = hasSteps && stepIndex >= visibleSteps.length - 1;

  useEffect(() => {
    setStepIndex(0);
    setHistoryIndex(0);
  }, [guide.kind, guide.version]);

  useEffect(() => {
    setStepIndex(0);
  }, [historyIndex]);

  return (
    <section
      ref={trapRef}
      className="guide-panel"
      data-interactive="true"
      role="dialog"
      aria-modal="true"
      aria-label="guide"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="guide-header">
        <div>
          <strong>{guide.title}</strong>
          <span>{guide.subtitle}</span>
        </div>
        <button className="icon-button ghost" type="button" onClick={onClose} title={t('app.close')}>
          <X size={18} />
        </button>
      </div>
      <div className="guide-tabs" role="tablist" aria-label="guide type">
        <button
          className={guide.kind === 'product' ? 'active' : ''}
          type="button"
          onClick={() => onSwitchGuide('product')}
        >
          {t('guide.productTitle')}
        </button>
        <button
          className={guide.kind === 'release' ? 'active' : ''}
          type="button"
          onClick={() => onSwitchGuide('release')}
        >
          {t('guide.releaseTitle')}
        </button>
        <button
          className={guide.kind === 'history' ? 'active' : ''}
          type="button"
          onClick={() => onSwitchGuide('history')}
        >
          {t('guide.historyTitle')}
        </button>
      </div>
      {guide.kind === 'history' && historyVersions.length > 0 && (
        <div className="guide-version-list" role="tablist" aria-label="history guide versions">
          {historyVersions.map((history, index) => (
            <button
              key={history.version}
              className={index === historyIndex ? 'active' : ''}
              type="button"
              onClick={() => setHistoryIndex(index)}
            >
              <strong>v{history.version}</strong>
              <span>{history.title.replace(/^v[\d.]+\s*/, '')}</span>
            </button>
          ))}
        </div>
      )}
      {hasSteps ? (
        <>
          <div className="guide-progress">
            <span>
              {selectedHistory ? `v${selectedHistory.version} · ` : ''}
              {stepIndex + 1} / {visibleSteps.length}
            </span>
            <div>
              {visibleSteps.map((step, index) => (
                <button
                  key={step.title}
                  className={index === stepIndex ? 'active' : ''}
                  type="button"
                  aria-label={t('guide.viewStep', { step: index + 1 })}
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
          <strong>{guide.kind === 'history' ? t('guide.noHistory') : t('guide.noRelease')}</strong>
          <span>
            {guide.kind === 'history'
              ? t('guide.noHistoryDesc')
              : t('guide.noReleaseDesc')}
          </span>
        </div>
      )}
      <div className="guide-actions">
        <button className="secondary-button" type="button" onClick={() => onDismiss(guide.kind)}>
          {guide.kind === 'history' ? t('guide.dismissHistory') : t('guide.skip')}
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
              {t('guide.prev')}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onDismiss(guide.kind);
                  return;
                }

                setStepIndex((current) => Math.min(visibleSteps.length - 1, current + 1));
              }}
            >
              {isLastStep ? <Check size={16} /> : <ArrowRight size={16} />}
              {isLastStep ? t('guide.done') : t('guide.next')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
