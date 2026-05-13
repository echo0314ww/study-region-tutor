import type { ApiProviderType, ReasoningEffort, ReasoningEffortSetting } from './types';

export interface ReasoningEffortOption {
  value: ReasoningEffortSetting;
  label: string;
  description: string;
}

const OPENAI_OPTIONS: ReasoningEffortOption[] = [
  { value: 'off', label: '使用模型默认', description: '不额外发送思考强度参数。' },
  { value: 'minimal', label: 'minimal', description: '最低额外推理预算，适合简单题。' },
  { value: 'low', label: 'low', description: '较低推理预算。' },
  { value: 'medium', label: 'medium', description: '均衡推理预算。' },
  { value: 'high', label: 'high', description: '更充分的推理预算。' },
  { value: 'xhigh', label: 'xhigh', description: '最高兼容档位，具体效果取决于服务商。' }
];

const ANTHROPIC_BASE_OPTIONS: ReasoningEffortOption[] = [
  { value: 'off', label: '使用模型默认', description: '不额外发送 Claude thinking 参数。' },
  { value: 'low', label: 'low', description: '较低思考强度。' },
  { value: 'medium', label: 'medium', description: '中等思考强度。' },
  { value: 'high', label: 'high', description: '较高思考强度。' }
];

const GEMINI_BASE_OPTIONS: ReasoningEffortOption[] = [
  { value: 'off', label: '使用模型默认', description: '不额外发送 Gemini thinking 参数。' },
  { value: 'low', label: 'low', description: '较低思考强度。' },
  { value: 'medium', label: 'medium', description: '中等思考强度。' },
  { value: 'high', label: 'high', description: '较高思考强度。' }
];

const GEMINI_FLASH_3_OPTIONS: ReasoningEffortOption[] = [
  { value: 'off', label: '使用模型默认', description: '不额外发送 Gemini thinking 参数。' },
  { value: 'minimal', label: 'minimal', description: '最少思考。' },
  { value: 'low', label: 'low', description: '较低思考强度。' },
  { value: 'medium', label: 'medium', description: '中等思考强度。' },
  { value: 'high', label: 'high', description: '较高思考强度。' }
];

const GEMINI_DEFAULT_OPTIONS: ReasoningEffortOption[] = [
  { value: 'off', label: '使用模型默认', description: '当前 Gemini 模型未声明可用 thinking 参数。' }
];

function modelKey(model: string): string {
  return model.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function option(value: ReasoningEffort): ReasoningEffortOption {
  return {
    value,
    label: value,
    description: `${value} 思考强度。`
  };
}

function hasOption(options: ReasoningEffortOption[], value: ReasoningEffortSetting): boolean {
  return options.some((item) => item.value === value);
}

function normalizeToOptions(
  value: ReasoningEffortSetting,
  options: ReasoningEffortOption[],
  fallback: ReasoningEffortSetting
): ReasoningEffortSetting {
  if (hasOption(options, value)) {
    return value;
  }

  if (value === 'xhigh' && hasOption(options, 'max')) {
    return 'max';
  }

  if (value === 'max' && hasOption(options, 'xhigh')) {
    return 'xhigh';
  }

  if (value === 'minimal' && hasOption(options, 'low')) {
    return 'low';
  }

  return hasOption(options, fallback) ? fallback : 'off';
}

export function isAnthropicAdaptiveEffortModel(model: string): boolean {
  const key = modelKey(model);

  return (
    key.includes('opus-4-6') ||
    key.includes('opus-4-7') ||
    key.includes('sonnet-4-6') ||
    key.includes('mythos')
  );
}

export function reasoningOptionsFor(
  apiProviderType: ApiProviderType,
  model: string
): ReasoningEffortOption[] {
  const key = modelKey(model);

  if (apiProviderType === 'anthropic') {
    if (key.includes('opus-4-7')) {
      return [...ANTHROPIC_BASE_OPTIONS, option('xhigh'), option('max')];
    }

    if (key.includes('opus-4-6') || key.includes('sonnet-4-6') || key.includes('mythos')) {
      return [...ANTHROPIC_BASE_OPTIONS, option('max')];
    }

    return ANTHROPIC_BASE_OPTIONS;
  }

  if (apiProviderType === 'gemini') {
    if (key.includes('gemini-3')) {
      return key.includes('flash')
        ? GEMINI_FLASH_3_OPTIONS
        : GEMINI_BASE_OPTIONS.filter((item) => ['off', 'low', 'high'].includes(item.value));
    }

    if (key.includes('gemini-2-5') || key.includes('gemini-2.5')) {
      return [...GEMINI_BASE_OPTIONS, option('max')];
    }

    return GEMINI_DEFAULT_OPTIONS;
  }

  return OPENAI_OPTIONS;
}

export function normalizeReasoningEffort(
  value: ReasoningEffortSetting,
  apiProviderType: ApiProviderType,
  model: string
): ReasoningEffortSetting {
  const options = reasoningOptionsFor(apiProviderType, model);

  if (apiProviderType === 'anthropic' && value === 'xhigh' && !hasOption(options, 'xhigh') && hasOption(options, 'max')) {
    return 'max';
  }

  return normalizeToOptions(value, options, apiProviderType === 'openai-compatible' ? 'low' : 'high');
}

export function reasoningHelpText(apiProviderType: ApiProviderType, model: string): string {
  if (apiProviderType === 'anthropic') {
    return isAnthropicAdaptiveEffortModel(model)
      ? 'Claude 4.6/4.7/Mythos 使用 adaptive thinking 与 output_config.effort；可用档位随模型变化。'
      : 'Claude 旧模型使用 thinking budget 映射；若服务商不支持，请改用模型默认。';
  }

  if (apiProviderType === 'gemini') {
    if (modelKey(model).includes('gemini-3')) {
      return 'Gemini 3 使用 thinkingLevel；Gemini 3 Pro 仅显示 low/high。';
    }

    if (modelKey(model).includes('gemini-2-5') || modelKey(model).includes('gemini-2.5')) {
      return 'Gemini 2.5 使用 thinkingBudget。';
    }

    return '未识别为 Gemini 3 或 Gemini 2.5 时，使用模型默认思考配置。';
  }

  return 'OpenAI-compatible 服务使用 reasoning_effort/reasoning.effort；具体可用档位取决于服务商。';
}
