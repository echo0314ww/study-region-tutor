import { Clipboard, Loader2, Play, Square, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiProviderOption, ModelOption, PromptEvalRun, PromptTemplateId, TutorSettings } from '../../../shared/types';
import { useTranslation } from '../i18n';
import type { MessageKey } from '../i18n';
import { createRequestId } from '../uiUtils';

export interface EvalPanelProps {
  settings: TutorSettings;
  apiProviders: ApiProviderOption[];
  modelOptions: ModelOption[];
  onCopy: (text: string) => void;
}

const EVAL_HISTORY_KEY = 'study-region-tutor:prompt-eval:v1';
const MAX_EVAL_VARIANTS = 20;
const PROMPT_TEMPLATE_IDS: PromptTemplateId[] = ['standard', 'concise', 'socratic', 'exam-safe', 'custom'];

function loadEvalRuns(): PromptEvalRun[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVAL_HISTORY_KEY) || '[]') as unknown;

    return Array.isArray(parsed) ? (parsed.filter((item) => typeof item === 'object' && item !== null) as PromptEvalRun[]) : [];
  } catch {
    return [];
  }
}

function saveEvalRuns(runs: PromptEvalRun[]): void {
  try {
    localStorage.setItem(EVAL_HISTORY_KEY, JSON.stringify(runs.slice(0, 50)));
  } catch {
    // Eval history is optional; failed persistence should not block the panel.
  }
}

function formatEvalRun(run: PromptEvalRun, t: (key: MessageKey, params?: Record<string, string | number>) => string): string {
  return [
    t('eval.formatModel', { model: run.model || t('eval.noModel') }),
    t('eval.formatTemplate', { template: run.promptTemplateId }),
    t('eval.formatResult', { result: run.success ? t('eval.formatSuccess') : t('eval.formatFailed') }),
    t('eval.formatLatency', { ms: run.latencyMs }),
    run.error ? t('eval.formatError', { error: run.error }) : '',
    run.output
  ]
    .filter(Boolean)
    .join('\n');
}

export function EvalPanel({ settings, apiProviders, modelOptions, onCopy }: EvalPanelProps): JSX.Element {
  const { t } = useTranslation();
  const templateLabelMap: Record<PromptTemplateId, string> = {
    standard: t('eval.templateStandard'),
    concise: t('eval.templateConcise'),
    socratic: t('eval.templateSocratic'),
    'exam-safe': t('eval.templateExamSafe'),
    custom: t('eval.templateCustom')
  };
  const [inputText, setInputText] = useState('');
  const [modelText, setModelText] = useState(settings.model);
  const [selectedTemplates, setSelectedTemplates] = useState<PromptTemplateId[]>(['standard', 'socratic']);
  const [runs, setRuns] = useState<PromptEvalRun[]>(() => loadEvalRuns());
  const [status, setStatus] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const activeRequestIdRef = useRef('');
  const cancelRequestedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    setModelText(settings.model);
  }, [settings.model]);
  const providerName = useMemo(() => {
    const provider = apiProviders.find((item) => item.id === settings.providerId);

    return provider?.name || settings.providerId || '';
  }, [apiProviders, settings.providerId]);
  const modelHint = useMemo(() => modelOptions.slice(0, 6).map((item) => item.id).join(', '), [modelOptions]);
  const models = useMemo(
    () =>
      modelText
        .split(/[,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    [modelText]
  );
  const variantCount = models.length * selectedTemplates.length;
  const validationMessage = !inputText.trim()
    ? t('eval.validationInput')
    : models.length === 0
      ? t('eval.validationModel')
      : selectedTemplates.length === 0
        ? t('eval.validationTemplate')
        : variantCount > MAX_EVAL_VARIANTS
          ? t('eval.validationMax', { max: MAX_EVAL_VARIANTS })
          : '';
  const canRun = Boolean(!validationMessage && !isRunning);

  const updateRuns = (nextRuns: PromptEvalRun[]): void => {
    setRuns(nextRuns);
    saveEvalRuns(nextRuns);
  };

  const runEval = async (): Promise<void> => {
    if (!canRun || runningRef.current) {
      return;
    }

    runningRef.current = true;

    const requestId = createRequestId();
    const variants = models.flatMap((model) =>
      selectedTemplates.map((promptTemplateId) => ({
        id: createRequestId(),
        providerId: settings.providerId,
        model,
        promptTemplateId,
        customPromptInstruction: settings.customPromptInstruction
      }))
    );

    setIsRunning(true);
    activeRequestIdRef.current = requestId;
    cancelRequestedRef.current = false;
    setStatus(t('eval.preparing', { count: variants.length }));

    try {
      const response = await window.studyTutor.runPromptEval({
        requestId,
        inputText: inputText.trim(),
        settings,
        variants
      });
      const nextRuns = [...response.runs, ...runs].slice(0, 50);
      updateRuns(nextRuns);
      setStatus(
        cancelRequestedRef.current
          ? t('eval.stopped', { count: response.runs.length })
          : t('eval.completed', { count: response.runs.length })
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      activeRequestIdRef.current = '';
      cancelRequestedRef.current = false;
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  const cancelEval = (): void => {
    const requestId = activeRequestIdRef.current;

    if (!requestId) {
      return;
    }

    cancelRequestedRef.current = true;
    setStatus(t('eval.stopping'));
    void window.studyTutor.cancelRequest({ requestId });
  };

  return (
    <div className="eval-page">
      <div className="eval-header">
        <div>
          <strong>{t('eval.title')}</strong>
          <span>{t('eval.desc')}</span>
        </div>
        {isRunning ? (
          <button className="secondary-button" type="button" onClick={cancelEval}>
            <Square size={16} />
            {t('eval.stop')}
          </button>
        ) : (
          <button className="secondary-button" type="button" onClick={() => void runEval()} disabled={!canRun}>
            <Play size={16} />
            {t('eval.start')}
          </button>
        )}
      </div>
      <label>
        {t('eval.inputLabel')}
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder={t('eval.inputPlaceholder')}
          rows={5}
        />
      </label>
      <label>
        {t('eval.modelListLabel')}
        <input
          value={modelText}
          onChange={(event) => setModelText(event.target.value)}
          placeholder={t('eval.modelListPlaceholder')}
          spellCheck={false}
        />
        <span className="model-status">
          {t('eval.currentProvider', { name: providerName })}
          {modelHint ? t('eval.candidateHint', { hint: modelHint }) : ''}
        </span>
      </label>
      <div className="eval-template-grid">
        {PROMPT_TEMPLATE_IDS.map((templateId) => (
          <label className="toggle-row" key={templateId}>
            <input
              type="checkbox"
              checked={selectedTemplates.includes(templateId)}
              onChange={(event) =>
                setSelectedTemplates((current) =>
                  event.target.checked ? [...current, templateId] : current.filter((item) => item !== templateId)
                )
              }
            />
            {templateLabelMap[templateId]}
          </label>
        ))}
      </div>
      <span className="model-status">
        {isRunning && <Loader2 size={13} className="spin" />}
        {t('eval.variantCount', { count: variantCount })}{validationMessage ? `；${validationMessage}` : ''}
      </span>
      {status && <span className="model-status">{status}</span>}
      <div className="eval-history">
        {runs.length === 0 ? (
          <div className="empty-state">{t('eval.noRecords')}</div>
        ) : (
          runs.map((run) => (
            <article className={`eval-run ${run.success ? '' : 'failed'}`} key={run.id}>
              <div className="eval-run-header">
                <strong>{run.model || t('eval.noModel')}</strong>
                <span>
                  {run.promptTemplateId} · {run.success ? `${run.latencyMs}ms · ${t('eval.chars', { count: run.outputLength })}` : t('eval.failed')}
                </span>
              </div>
              <div className="eval-run-actions">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    className={`icon-button ghost ${run.rating && rating <= run.rating ? 'active' : ''}`}
                    type="button"
                    key={rating}
                    onClick={() =>
                      updateRuns(runs.map((item) => (item.id === run.id ? { ...item, rating: rating as 1 | 2 | 3 | 4 | 5 } : item)))
                    }
                    title={t('eval.ratingTitle', { rating })}
                  >
                    <Star size={14} />
                  </button>
                ))}
                <button className="icon-button ghost" type="button" onClick={() => onCopy(formatEvalRun(run, t))} title={t('eval.copyResult')}>
                  <Clipboard size={15} />
                </button>
              </div>
              <details>
                <summary>{run.success ? t('eval.viewOutput') : run.error || t('eval.viewError')}</summary>
                <pre>{run.success ? run.output : run.error}</pre>
              </details>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
