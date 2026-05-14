import type { ApiMode, ApiProviderType } from './types';

export interface ApiProtocolProvider {
  baseUrl: string;
  apiMode?: ApiMode;
  apiProviderType: ApiProviderType;
}

export function endpointForProvider(provider: ApiProtocolProvider, model?: string, stream?: boolean): string;

export function modelsEndpointForBaseUrl(baseUrl: string, apiProviderType: ApiProviderType): string;

export function modelsEndpointCandidatesForBaseUrl(baseUrl: string, apiProviderType: ApiProviderType): string[];

export function extractApiErrorMessage(data: unknown): string | undefined;
