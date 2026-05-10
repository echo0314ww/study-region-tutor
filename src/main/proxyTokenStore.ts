import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface StoredProxyToken {
  version: 1;
  encrypted: boolean;
  value: string;
}

const STORE_FILE = 'proxy-token.json';

function storePath(): string {
  return join(app.getPath('userData'), STORE_FILE);
}

function readStoredToken(): StoredProxyToken | undefined {
  const path = storePath();

  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Partial<StoredProxyToken>;

    if (data.version !== 1 || typeof data.encrypted !== 'boolean' || typeof data.value !== 'string') {
      return undefined;
    }

    return {
      version: 1,
      encrypted: data.encrypted,
      value: data.value
    };
  } catch {
    return undefined;
  }
}

export function getSavedProxyToken(): string {
  const stored = readStoredToken();

  if (!stored?.value) {
    return '';
  }

  try {
    if (stored.encrypted) {
      if (!safeStorage.isEncryptionAvailable()) {
        return '';
      }

      return safeStorage.decryptString(Buffer.from(stored.value, 'base64')).trim();
    }

    return Buffer.from(stored.value, 'base64').toString('utf8').trim();
  } catch {
    return '';
  }
}

export function hasSavedProxyToken(): boolean {
  return Boolean(getSavedProxyToken());
}

export function saveProxyToken(token: string): void {
  const trimmed = token.trim();

  if (!trimmed) {
    clearSavedProxyToken();
    return;
  }

  const encrypted = safeStorage.isEncryptionAvailable();
  const value = encrypted
    ? safeStorage.encryptString(trimmed).toString('base64')
    : Buffer.from(trimmed, 'utf8').toString('base64');
  const path = storePath();

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        encrypted,
        value
      } satisfies StoredProxyToken,
      null,
      2
    )}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
}

export function clearSavedProxyToken(): void {
  rmSync(storePath(), { force: true });
}
