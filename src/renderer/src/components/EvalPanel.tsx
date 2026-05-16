import { Clipboard, Loader2, Play, Square, Star } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiProviderOption, ModelOption, PromptEvalRun, PromptTemplateId, TutorSettings } from '../../../shared/types';
import { createRequestId } from '../uiUtils';

export interface EvalPanelProps {
  settings: TutorSettings;
  apiProviders: ApiProviderOption[];
  modelOptions: ModelOption[];
  onCopy: (text: string) => void;
}

const EVAL_HISTORY_KEY = 'study-region-tutor:prompt-eval:v1';
const MAX_EVAL_VARIANTS = 20;
const PROMPT_TEMPLATES: Array<{ id: PromptTemplateId; label: string }> = [
  { id: 'standard', label: '标准' },
  { id: 'concise', label: '简洁' },
  { id: 'socratic', label: '启发式' },
  { id: 'exam-safe', label: '考试边界' },
  { id: 'custom', label: '自定义' }
];

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

function formatEvalRun(run: PromptEvalRun): string {
  return [
    `模型：${run.model || '未选择'}`,
    `模板：${run.promptTemplateId}`,
    `结果：${run.success ? '成功' : '失败'}`,
    `耗时：${run.latencyMs}ms`,
    run.error ? `错误：${run.error}` : '',
    run.output
  ]
    .filter(Boolean)
    .join('\n');
}

export function EvalPanel({ settings, apiProviders, modelOptions, onCopy }: EvalPanelProps): JSX.Element {
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

    return provider?.name || settings.providerId || '当前服务商';
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
    ? '请输入评测文本。'
    : models.length === 0
      ? '请输入至少一个模型。'
      : selectedTemplates.length === 0
        ? '请选择至少一个 Prompt 模板。'
        : variantCount > MAX_EVAL_VARIANTS
          ? `最多支持 ${MAX_EVAL_VARIANTS} 组评测，请减少模型或模板。`
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
    setStatus(`准备运行 ${variants.length} 组评测。`);

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
          ? `已停止，保留 ${response.runs.length} 组结果。`
          : `完成 ${response.runs.length} 组评测。`
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
    setStatus('正在停止评测...');
    void window.studyTutor.cancelRequest({ requestId });
  };

  return (
    <div className="eval-page">
      <div className="eval-header">
        <div>
          <strong>模型 / Prompt 对比评测</strong>
          <span>用同一道 OCR 文本比较不同模型和模板的耗时、稳定性与输出质量。</span>
        </div>
        {isRunning ? (
          <button className="secondary-button" type="button" onClick={cancelEval}>
            <Square size={16} />
            停止评测
          </button>
        ) : (
          <button className="secondary-button" type="button" onClick={() => void runEval()} disabled={!canRun}>
            <Play size={16} />
            开始评测
          </button>
        )}
      </div>
      <label>
        评测文本
        <textarea
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          placeholder="粘贴 OCR 文本、题目文字或当前想比较的题目..."
          rows={5}
        />
      </label>
      <label>
        模型列表
        <input
          value={modelText}
          onChange={(event) => setModelText(event.target.value)}
          placeholder="多个模型用逗号分隔"
          spellCheck={false}
        />
        <span className="model-status">
          当前服务商：{providerName}
          {modelHint ? `；候选示例：${modelHint}` : ''}
        </span>
      </label>
      <div className="eval-template-grid">
        {PROMPT_TEMPLATES.map((template) => (
          <label className="toggle-row" key={template.id}>
            <input
              type="checkbox"
              checked={selectedTemplates.includes(template.id)}
              onChange={(event) =>
                setSelectedTemplates((current) =>
                  event.target.checked ? [...current, template.id] : current.filter((item) => item !== template.id)
                )
              }
            />
            {template.label}
          </label>
        ))}
      </div>
      <span className="model-status">
        {isRunning && <Loader2 size={13} className="spin" />}
        共 {variantCount} 组评测{validationMessage ? `；${validationMessage}` : ''}
      </span>
      {status && <span className="model-status">{status}</span>}
      <div className="eval-history">
        {runs.length === 0 ? (
          <div className="empty-state">暂无评测记录。</div>
        ) : (
          runs.map((run) => (
            <article className={`eval-run ${run.success ? '' : 'failed'}`} key={run.id}>
              <div className="eval-run-header">
                <strong>{run.model || '未选择模型'}</strong>
                <span>
                  {run.promptTemplateId} · {run.success ? `${run.latencyMs}ms · ${run.outputLength} 字` : '失败'}
                </span>
              </div>
              <div className="eval-run-actions">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    className={`icon-button ghost ${run.rating === rating ? 'active' : ''}`}
                    type="button"
                    key={rating}
                    onClick={() =>
                      updateRuns(runs.map((item) => (item.id === run.id ? { ...item, rating: rating as 1 | 2 | 3 | 4 | 5 } : item)))
                    }
                    title={`${rating} 分`}
                  >
                    <Star size={14} />
                  </button>
                ))}
                <button className="icon-button ghost" type="button" onClick={() => onCopy(formatEvalRun(run))} title="复制结果">
                  <Clipboard size={15} />
                </button>
              </div>
              <details>
                <summary>{run.success ? '查看输出' : run.error || '查看错误'}</summary>
                <pre>{run.success ? run.output : run.error}</pre>
              </details>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
