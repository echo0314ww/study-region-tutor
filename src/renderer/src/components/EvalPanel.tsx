import { Clipboard, Loader2, Play, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiProviderOption, ModelOption, PromptEvalRun, PromptTemplateId, TutorSettings } from '../../../shared/types';
import { createRequestId } from '../uiUtils';

export interface EvalPanelProps {
  settings: TutorSettings;
  apiProviders: ApiProviderOption[];
  modelOptions: ModelOption[];
  onCopy: (text: string) => void;
}

const EVAL_HISTORY_KEY = 'study-region-tutor:prompt-eval:v1';
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
  const providerName = useMemo(() => {
    const provider = apiProviders.find((item) => item.id === settings.providerId);

    return provider?.name || settings.providerId || '当前服务商';
  }, [apiProviders, settings.providerId]);
  const modelHint = useMemo(() => modelOptions.slice(0, 6).map((item) => item.id).join(', '), [modelOptions]);
  const canRun = Boolean(inputText.trim() && modelText.trim() && selectedTemplates.length > 0 && !isRunning);

  const updateRuns = (nextRuns: PromptEvalRun[]): void => {
    setRuns(nextRuns);
    saveEvalRuns(nextRuns);
  };

  const runEval = async (): Promise<void> => {
    if (!canRun) {
      return;
    }

    const models = modelText
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
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
    setStatus('');

    try {
      const response = await window.studyTutor.runPromptEval({
        inputText: inputText.trim(),
        settings,
        variants
      });
      const nextRuns = [...response.runs, ...runs].slice(0, 50);
      updateRuns(nextRuns);
      setStatus(`完成 ${response.runs.length} 组评测。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="eval-page">
      <div className="eval-header">
        <div>
          <strong>模型 / Prompt 对比评测</strong>
          <span>用同一道 OCR 文本比较不同模型和模板的耗时、稳定性与输出质量。</span>
        </div>
        <button className="secondary-button" type="button" onClick={() => void runEval()} disabled={!canRun}>
          {isRunning ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
          {isRunning ? '评测中' : '开始评测'}
        </button>
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
