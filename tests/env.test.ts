import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalEnv, userConfigEnvDir } from '../src/main/env';

const ENV_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'];

function withTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'study-region-tutor-env-'));
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('loadLocalEnv', () => {
  it('loads .env.local from the fixed user config directory', () => {
    const userConfigDir = withTempDir();

    try {
      writeFileSync(
        join(userConfigDir, '.env.local'),
        ['AI_BASE_URL=https://provider.example/v1', 'AI_API_KEY=user-config-key'].join('\n')
      );

      loadLocalEnv({ userConfigDir });

      expect(process.env.AI_BASE_URL).toBe('https://provider.example/v1');
      expect(process.env.AI_API_KEY).toBe('user-config-key');
    } finally {
      rmSync(userConfigDir, { recursive: true, force: true });
    }
  });

  it('keeps shell environment variables ahead of local files', () => {
    const userConfigDir = withTempDir();

    try {
      process.env.AI_BASE_URL = 'https://shell.example/v1';
      writeFileSync(join(userConfigDir, '.env.local'), 'AI_BASE_URL=https://file.example/v1');

      loadLocalEnv({ userConfigDir });

      expect(process.env.AI_BASE_URL).toBe('https://shell.example/v1');
    } finally {
      rmSync(userConfigDir, { recursive: true, force: true });
    }
  });

  it('uses the study-region-tutor folder under appData as the user config directory', () => {
    expect(userConfigEnvDir(join('C:', 'Users', 'test', 'AppData', 'Roaming'))).toBe(
      join('C:', 'Users', 'test', 'AppData', 'Roaming', 'study-region-tutor')
    );
  });
});
