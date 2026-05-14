import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TutorSettings } from '../src/shared/types';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../src/renderer/src/constants';
import {
  loadPersistedSettings,
  savePersistedSettings,
  saveReadAnnouncementRevision,
  settingsWithPersistedUserSettings
} from '../src/renderer/src/uiUtils';

function installLocalStorage(storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  vi.restoreAllMocks();
});

describe('settings persistence', () => {
  it('persists only non-sensitive user settings', () => {
    const values = new Map<string, string>();
    installLocalStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      }
    });
    const settings: TutorSettings = {
      ...DEFAULT_SETTINGS,
      apiConnectionMode: 'proxy',
      model: 'custom-model',
      proxyUrl: 'https://proxy.example',
      proxyToken: 'secret-proxy-token',
      apiKey: 'secret-api-key'
    };

    savePersistedSettings(settings);

    const stored = values.get(SETTINGS_STORAGE_KEY) || '';
    expect(stored).toContain('custom-model');
    expect(stored).toContain('https://proxy.example');
    expect(stored).not.toContain('secret-proxy-token');
    expect(stored).not.toContain('secret-api-key');
  });

  it('merges persisted settings without replacing secrets from runtime settings', () => {
    installLocalStorage({
      getItem: () =>
        JSON.stringify({
          apiConnectionMode: 'proxy',
          model: 'persisted-model',
          apiKey: 'stored-api-key',
          proxyToken: 'stored-proxy-token'
        }),
      setItem: () => undefined
    });
    const merged = settingsWithPersistedUserSettings({
      ...DEFAULT_SETTINGS,
      apiKey: 'runtime-api-key',
      proxyToken: 'runtime-proxy-token'
    });

    expect(merged.apiConnectionMode).toBe('proxy');
    expect(merged.model).toBe('persisted-model');
    expect(merged.apiKey).toBe('runtime-api-key');
    expect(merged.proxyToken).toBe('runtime-proxy-token');
  });

  it('ignores unreadable persisted settings', () => {
    installLocalStorage({
      getItem: () => '{',
      setItem: () => undefined
    });

    expect(loadPersistedSettings()).toEqual({});
  });

  it('does not throw when localStorage writes fail', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installLocalStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      }
    });

    expect(() => saveReadAnnouncementRevision('revision-1')).not.toThrow();
    expect(() => savePersistedSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(warning).toHaveBeenCalled();
  });
});
