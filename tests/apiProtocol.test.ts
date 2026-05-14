import { describe, expect, it } from 'vitest';
import {
  endpointForProvider,
  extractApiErrorMessage,
  modelsEndpointCandidatesForBaseUrl,
  modelsEndpointForBaseUrl
} from '../src/shared/apiProtocol.mjs';

describe('api protocol helpers', () => {
  it('builds provider request endpoints consistently', () => {
    expect(
      endpointForProvider(
        {
          baseUrl: 'https://api.example/v1',
          apiMode: 'chat-completions',
          apiProviderType: 'openai-compatible'
        },
        'gpt-compatible'
      )
    ).toBe('https://api.example/v1/chat/completions');
    expect(
      endpointForProvider(
        {
          baseUrl: 'https://api.example/v1/responses',
          apiMode: 'responses',
          apiProviderType: 'openai-compatible'
        },
        'gpt-compatible'
      )
    ).toBe('https://api.example/v1/responses');
    expect(
      endpointForProvider(
        {
          baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          apiMode: 'chat-completions',
          apiProviderType: 'gemini'
        },
        'models/gemini-3-pro',
        true
      )
    ).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse');
    expect(
      endpointForProvider(
        {
          baseUrl: 'https://api.anthropic.com/v1',
          apiMode: 'chat-completions',
          apiProviderType: 'anthropic'
        },
        'claude-opus-4-6'
      )
    ).toBe('https://api.anthropic.com/v1/messages');
  });

  it('builds model endpoint candidates from base urls', () => {
    expect(modelsEndpointForBaseUrl('https://api.example/v1/chat/completions', 'openai-compatible')).toBe(
      'https://api.example/v1/models'
    );
    expect(modelsEndpointCandidatesForBaseUrl('https://api.example', 'openai-compatible')).toEqual([
      'https://api.example/models',
      'https://api.example/v1/models'
    ]);
    expect(modelsEndpointCandidatesForBaseUrl('https://generativelanguage.googleapis.com', 'gemini')).toEqual([
      'https://generativelanguage.googleapis.com/models',
      'https://generativelanguage.googleapis.com/v1beta/models'
    ]);
  });

  it('extracts standard API error messages', () => {
    expect(extractApiErrorMessage({ error: { message: 'bad request' } })).toBe('bad request');
    expect(extractApiErrorMessage({ type: 'error', message: 'stream failed' })).toBe('stream failed');
    expect(extractApiErrorMessage({ message: 'not an error payload' })).toBeUndefined();
  });
});
