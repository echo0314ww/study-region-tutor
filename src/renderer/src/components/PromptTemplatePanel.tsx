import type { PromptTemplateId, TutorSettings } from '../../../shared/types';

export interface PromptTemplatePanelProps {
  settings: TutorSettings;
  onSettingsChange: (updater: (current: TutorSettings) => TutorSettings) => void;
}

const TEMPLATE_OPTIONS: Array<{ id: PromptTemplateId; label: string; description: string }> = [
  {
    id: 'standard',
    label: '标准讲解',
    description: '保留题目识别、题型判断、思路、步骤、关键概念和结果。'
  },
  {
    id: 'concise',
    label: '简洁讲解',
    description: '减少铺垫，优先给出关键方法、步骤和结论。'
  },
  {
    id: 'socratic',
    label: '启发式讲解',
    description: '多用引导问题和检查点，适合自学复盘。'
  },
  {
    id: 'exam-safe',
    label: '考试边界',
    description: '更严格避免直接代答，偏概念解释和学习建议。'
  },
  {
    id: 'custom',
    label: '自定义补充',
    description: '在标准安全约束后追加你自己的输出偏好。'
  }
];

export function PromptTemplatePanel({ settings, onSettingsChange }: PromptTemplatePanelProps): JSX.Element {
  const selectedTemplate = settings.promptTemplateId || 'standard';

  return (
    <div className="prompt-template-page">
      <div className="prompt-template-header">
        <strong>Prompt 模板</strong>
        <span>模板只改变讲解风格，不会放宽学习辅导和考试边界。</span>
      </div>
      <div className="prompt-template-list">
        {TEMPLATE_OPTIONS.map((option) => (
          <button
            className={selectedTemplate === option.id ? 'active' : ''}
            key={option.id}
            type="button"
            onClick={() => onSettingsChange((current) => ({ ...current, promptTemplateId: option.id }))}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
      <label>
        自定义补充指令
        <textarea
          value={settings.customPromptInstruction || ''}
          onChange={(event) =>
            onSettingsChange((current) => ({ ...current, customPromptInstruction: event.target.value }))
          }
          placeholder="例如：回答中优先列出易错点；几何题先画关系，再推公式。"
          spellCheck={false}
        />
        <span className="model-status">选择“自定义补充”时会重点采用；其他模板也会作为附加偏好发送。</span>
      </label>
    </div>
  );
}
