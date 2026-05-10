import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILES = ['.env.local', '.env'];
const USER_CONFIG_DIR_NAME = 'study-region-tutor';

function parseEnvValue(raw: string): string {
  const value = raw.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = parseEnvValue(trimmed.slice(separator + 1));

    // Shell environment wins over local files, which keeps CI and launch scripts explicit.
    process.env[key] ??= value;
  }
}

function loadEnvDirectory(directory: string): void {
  for (const file of ENV_FILES) {
    loadEnvFile(join(directory, file));
  }
}

export function userConfigEnvDir(appDataPath: string): string {
  return join(appDataPath, USER_CONFIG_DIR_NAME);
}

export function loadLocalEnv(options: { userConfigDir: string; includeWorkingDirectory?: boolean }): void {
  if (options.includeWorkingDirectory) {
    loadEnvDirectory(process.cwd());
  }

  loadEnvDirectory(options.userConfigDir);
}
