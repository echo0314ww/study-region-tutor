import type { PromptTemplateId, TutorSettings } from '../../../shared/types';
import type { MessageKey } from '../i18n';
import { useTranslation } from '../i18n';

export interface PromptTemplatePanelProps {
  settings: TutorSettings;
  onSettingsChange: (updater: (current: TutorSettings) => TutorSettings) => void;
}

const TEMPLATE_OPTIONS: Array<{ id: PromptTemplateId; labelKey: MessageKey; descKey: MessageKey }> = [
  {
    id: 'standard',
    labelKey: 'promptTemplate.standard',
    descKey: 'promptTemplate.standardDesc'
  },
  {
    id: 'concise',
    labelKey: 'promptTemplate.concise',
    descKey: 'promptTemplate.conciseDesc'
  },
  {
    id: 'socratic',
    labelKey: 'promptTemplate.socratic',
    descKey: 'promptTemplate.socraticDesc'
  },
  {
    id: 'exam-safe',
    labelKey: 'promptTemplate.examSafe',
    descKey: 'promptTemplate.examSafeDesc'
  },
  {
    id: 'custom',
    labelKey: 'promptTemplate.custom',
    descKey: 'promptTemplate.customDesc'
  }
];

export function PromptTemplatePanel({ settings, onSettingsChange }: PromptTemplatePanelProps): JSX.Element {
  const { t } = useTranslation();
  const selectedTemplate = settings.promptTemplateId || 'standard';

  return (
    <div className="prompt-template-page">
      <div className="prompt-template-header">
        <strong>{t('settings.promptTemplates')}</strong>
        <span>{t('promptTemplate.desc')}</span>
      </div>
      <div className="prompt-template-list">
        {TEMPLATE_OPTIONS.map((option) => (
          <button
            className={selectedTemplate === option.id ? 'active' : ''}
            key={option.id}
            type="button"
            onClick={() => onSettingsChange((current) => ({ ...current, promptTemplateId: option.id }))}
          >
            <strong>{t(option.labelKey)}</strong>
            <span>{t(option.descKey)}</span>
          </button>
        ))}
      </div>
      <label>
        {t('promptTemplate.customLabel')}
        <textarea
          value={settings.customPromptInstruction || ''}
          onChange={(event) =>
            onSettingsChange((current) => ({ ...current, customPromptInstruction: event.target.value }))
          }
          placeholder={t('promptTemplate.customPlaceholder')}
          spellCheck={false}
        />
        <span className="model-status">{t('promptTemplate.customHint')}</span>
      </label>
    </div>
  );
}
