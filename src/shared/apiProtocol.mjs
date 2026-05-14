function encodePathSegment(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function geminiModelPath(model) {
  return encodePathSegment(String(model || '').trim().replace(/^models\//, ''));
}

export function endpointForProvider(provider, model = '', stream = false) {
  if (provider.apiProviderType === 'gemini') {
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    const suffix = stream ? '?alt=sse' : '';
    return `${provider.baseUrl}/models/${geminiModelPath(model)}:${action}${suffix}`;
  }

  if (provider.apiProviderType === 'anthropic') {
    return provider.baseUrl.endsWith('/messages') ? provider.baseUrl : `${provider.baseUrl}/messages`;
  }

  if (provider.apiMode === 'responses') {
    return provider.baseUrl.endsWith('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
  }

  return provider.baseUrl.endsWith('/chat/completions')
    ? provider.baseUrl
    : `${provider.baseUrl}/chat/completions`;
}

export function modelsEndpointForBaseUrl(baseUrl, apiProviderType) {
  if (baseUrl.endsWith('/models')) {
    return baseUrl;
  }

  if (apiProviderType === 'anthropic' && baseUrl.endsWith('/messages')) {
    return `${baseUrl.slice(0, -'/messages'.length)}/models`;
  }

  if (apiProviderType === 'gemini' || apiProviderType === 'anthropic') {
    return `${baseUrl}/models`;
  }

  if (baseUrl.endsWith('/responses')) {
    return `${baseUrl.slice(0, -'/responses'.length)}/models`;
  }

  if (baseUrl.endsWith('/chat/completions')) {
    return `${baseUrl.slice(0, -'/chat/completions'.length)}/models`;
  }

  return `${baseUrl}/models`;
}

export function modelsEndpointCandidatesForBaseUrl(baseUrl, apiProviderType) {
  const candidates = [modelsEndpointForBaseUrl(baseUrl, apiProviderType)];

  try {
    const url = new URL(baseUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';

    if (apiProviderType === 'gemini' && normalizedPath === '/') {
      candidates.push(`${url.origin}/v1beta/models`);
    }

    if (apiProviderType === 'anthropic' && normalizedPath === '/') {
      candidates.push(`${url.origin}/v1/models`);
    }

    if (
      apiProviderType === 'openai-compatible' &&
      (normalizedPath === '/' || normalizedPath === '/responses' || normalizedPath === '/chat/completions')
    ) {
      candidates.push(`${url.origin}/v1/models`);
    }
  } catch {
    return candidates;
  }

  return [...new Set(candidates)];
}

export function extractApiErrorMessage(data) {
  if (typeof data === 'object' && data !== null) {
    const error = data.error;

    if (typeof error === 'object' && error !== null && typeof error.message === 'string') {
      return error.message;
    }

    if (typeof data.message === 'string' && data.type === 'error') {
      return data.message;
    }
  }

  return undefined;
}
