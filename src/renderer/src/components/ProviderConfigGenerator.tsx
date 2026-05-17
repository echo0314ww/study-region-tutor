import { Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ApiMode, ApiProviderType } from '../../../shared/types';
import { useTranslation } from '../i18n';

export interface ProviderConfigGeneratorProps {
  onCopy: (text: string) => void;
}

function providerEnvKey(id: string): string {
  return id
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function ProviderConfigGenerator({ onCopy }: ProviderConfigGeneratorProps): JSX.Element {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState('my-provider');
  const [providerName, setProviderName] = useState('My Provider');
  const [baseUrl, setBaseUrl] = useState('https://example.com/v1');
  const [apiKey, setApiKey] = useState('replace-with-your-api-key');
  const [apiMode, setApiMode] = useState<ApiMode>('chat-completions');
  const [apiProviderType, setApiProviderType] = useState<ApiProviderType>('openai-compatible');
  const [makeDefault, setMakeDefault] = useState(true);

  const snippet = useMemo(() => {
    const id = providerId.trim().toLowerCase() || 'my-provider';
    const envKey = providerEnvKey(id);

    return [
      `AI_PROVIDERS=${id}`,
      makeDefault ? `AI_DEFAULT_PROVIDER=${id}` : '',
      `AI_PROVIDER_${envKey}_NAME=${providerName.trim() || id}`,
      `AI_PROVIDER_${envKey}_BASE_URL=${baseUrl.trim() || 'https://example.com/v1'}`,
      `AI_PROVIDER_${envKey}_API_KEY=${apiKey.trim() || 'replace-with-your-api-key'}`,
      `AI_PROVIDER_${envKey}_API_MODE=${apiMode}`,
      `AI_PROVIDER_${envKey}_API_TYPE=${apiProviderType}`
    ]
      .filter(Boolean)
      .join('\n');
  }, [apiKey, apiMode, apiProviderType, baseUrl, makeDefault, providerId, providerName]);

  return (
    <div className="provider-generator-page">
      <div className="provider-generator-header">
        <strong>{t('settings.providerGenerator')}</strong>
        <span>{t('providerGen.desc')}</span>
      </div>
      <div className="provider-generator-grid">
        <label>
          Provider ID
          <input value={providerId} onChange={(event) => setProviderId(event.target.value)} spellCheck={false} />
        </label>
        <label>
          {t('providerGen.displayName')}
          <input value={providerName} onChange={(event) => setProviderName(event.target.value)} spellCheck={false} />
        </label>
        <label>
          Base URL
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} />
        </label>
        <label>
          API Key
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} spellCheck={false} />
        </label>
        <label>
          {t('providerGen.apiMode')}
          <select value={apiMode} onChange={(event) => setApiMode(event.target.value as ApiMode)}>
            <option value="chat-completions">Chat Completions</option>
            <option value="responses">Responses</option>
          </select>
        </label>
        <label>
          {t('providerGen.providerType')}
          <select value={apiProviderType} onChange={(event) => setApiProviderType(event.target.value as ApiProviderType)}>
            <option value="openai-compatible">{t('providerGen.openaiCompatible')}</option>
            <option value="gemini">Gemini</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />
        {t('providerGen.makeDefault')}
      </label>
      <pre className="provider-snippet">{snippet}</pre>
      <div className="settings-action-row">
        <button className="secondary-button" type="button" onClick={() => onCopy(snippet)}>
          <Copy size={16} />
          {t('providerGen.copySnippet')}
        </button>
      </div>
    </div>
  );
}
