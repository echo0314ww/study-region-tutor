import type { ApiMode, ApiProviderOption, ApiProviderType } from '../shared/types';

export interface ApiProviderConfig extends ApiProviderOption {
  apiKey: string;
}

function envValue(key: string): string {
  return process.env[key]?.trim() || '';
}

export function parseApiMode(value: string | undefined): ApiMode {
  return value === 'responses' ? 'responses' : 'chat-completions';
}

export function parseApiProviderType(value: string | undefined): ApiProviderType {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'gemini' || normalized === 'anthropic') {
    return normalized;
  }

  return 'openai-compatible';
}

function normalizeProviderId(id: string): string {
  return id.trim().toLowerCase();
}

function providerEnvKey(id: string): string {
  return id
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function explicitProviderIds(): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const rawId of envValue('AI_PROVIDERS').split(',')) {
    const id = normalizeProviderId(rawId);

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function providerFromEnv(id: string): Omit<ApiProviderConfig, 'isDefault'> | undefined {
  const envKey = providerEnvKey(id);
  const baseUrl = envValue(`AI_PROVIDER_${envKey}_BASE_URL`);

  if (!baseUrl) {
    return undefined;
  }

  const name = envValue(`AI_PROVIDER_${envKey}_NAME`) || id;
  const apiKey = envValue(`AI_PROVIDER_${envKey}_API_KEY`);
  const apiMode = parseApiMode(envValue(`AI_PROVIDER_${envKey}_API_MODE`) || envValue('AI_API_MODE') || undefined);
  const apiProviderType = parseApiProviderType(
    envValue(`AI_PROVIDER_${envKey}_API_TYPE`) || envValue('AI_API_TYPE') || undefined
  );

  return {
    id,
    name,
    baseUrl: normalizeBaseUrl(baseUrl),
    apiMode,
    apiProviderType,
    apiKey,
    hasApiKey: Boolean(apiKey)
  };
}

function legacyProvider(): Omit<ApiProviderConfig, 'isDefault'> | undefined {
  const baseUrl = envValue('AI_BASE_URL');

  if (!baseUrl) {
    return undefined;
  }

  const apiKey = envValue('AI_API_KEY');

  return {
    id: 'default',
    name: 'Default API',
    baseUrl: normalizeBaseUrl(baseUrl),
    apiMode: parseApiMode(envValue('AI_API_MODE') || undefined),
    apiProviderType: parseApiProviderType(envValue('AI_API_TYPE') || undefined),
    apiKey,
    hasApiKey: Boolean(apiKey)
  };
}

export function getConfiguredApiProviders(): ApiProviderConfig[] {
  const explicitIds = explicitProviderIds();
  const providers =
    explicitIds.length > 0 ? explicitIds.map(providerFromEnv).filter((provider) => provider !== undefined) : [];

  if (providers.length === 0) {
    const legacy = legacyProvider();
    return legacy ? [{ ...legacy, isDefault: true }] : [];
  }

  const requestedDefaultId = normalizeProviderId(envValue('AI_DEFAULT_PROVIDER'));
  const defaultId = providers.some((provider) => provider.id === requestedDefaultId)
    ? requestedDefaultId
    : providers[0]?.id;

  return providers.map((provider) => ({
    ...provider,
    isDefault: provider.id === defaultId
  }));
}

export function getApiProviderById(id: string): ApiProviderConfig | undefined {
  const providers = getConfiguredApiProviders();
  const normalizedId = normalizeProviderId(id);

  if (!normalizedId) {
    return providers.find((provider) => provider.isDefault) || providers[0];
  }

  return providers.find((provider) => provider.id === normalizedId);
}

export function getApiProviderSummaries(): ApiProviderOption[] {
  return getConfiguredApiProviders().map(({ apiKey: _apiKey, ...provider }) => provider);
}
