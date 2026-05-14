import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ENV_FILES = ['.env', '.env.local'];

export function parseEnvValue(raw) {
  const value = raw.trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

export function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const env = {};
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

    env[trimmed.slice(0, separator).trim()] = parseEnvValue(trimmed.slice(separator + 1));
  }

  return env;
}

export function readRuntimeEnv(options = {}) {
  const cwd = options.cwd || process.cwd();
  const processEnv = options.processEnv || process.env;
  const env = {};

  for (const file of ENV_FILES) {
    Object.assign(env, parseEnvFile(resolve(cwd, file)));
  }

  return {
    ...env,
    ...processEnv
  };
}
