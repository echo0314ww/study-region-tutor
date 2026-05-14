import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

async function loadRuntimeEnvModule(): Promise<{
  readRuntimeEnv: (options?: { cwd?: string; processEnv?: Record<string, string> }) => Record<string, string>;
}> {
  // @ts-expect-error The proxy runtime helper is plain ESM used directly by Node scripts.
  return import('../server/runtime-env.mjs');
}

function withTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'study-region-tutor-proxy-env-'));
}

describe('proxy runtime env', () => {
  it('keeps process env ahead of .env.local and .env', async () => {
    const directory = withTempDir();
    const { readRuntimeEnv } = await loadRuntimeEnvModule();

    try {
      writeFileSync(join(directory, '.env'), 'AI_BASE_URL=https://env.example/v1\nSHARED_VALUE=from-env');
      writeFileSync(join(directory, '.env.local'), 'AI_BASE_URL=https://local.example/v1\nLOCAL_ONLY=yes');

      const env = readRuntimeEnv({
        cwd: directory,
        processEnv: {
          AI_BASE_URL: 'https://shell.example/v1'
        }
      });

      expect(env.AI_BASE_URL).toBe('https://shell.example/v1');
      expect(env.SHARED_VALUE).toBe('from-env');
      expect(env.LOCAL_ONLY).toBe('yes');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps .env.local ahead of .env when no process env is set', async () => {
    const directory = withTempDir();
    const { readRuntimeEnv } = await loadRuntimeEnvModule();

    try {
      writeFileSync(join(directory, '.env'), 'TUTOR_PROXY_PORT=8787');
      writeFileSync(join(directory, '.env.local'), 'TUTOR_PROXY_PORT=8788');

      const env = readRuntimeEnv({
        cwd: directory,
        processEnv: {}
      });

      expect(env.TUTOR_PROXY_PORT).toBe('8788');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
