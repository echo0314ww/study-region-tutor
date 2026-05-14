import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { readRuntimeEnv } from './runtime-env.mjs';

const DEFAULT_PORT = 8787;
const LOCAL_ENV_FILE = '.env.local';
const RESTART_DEBOUNCE_MS = 350;
const TUNNEL_POLL_INTERVAL_MS = 700;
const TUNNEL_POLL_ATTEMPTS = 35;
const PROXY_HEALTH_POLL_INTERVAL_MS = 600;
const PROXY_HEALTH_POLL_ATTEMPTS = 12;

let ngrokProcess;
let restartTimer;
let currentSignature = '';
let lastPublicUrl = '';
let restartQueue = Promise.resolve();
let isShuttingDown = false;

function proxyPort(env) {
  const port = Number.parseInt(String(env.TUTOR_PROXY_PORT || DEFAULT_PORT), 10);

  return Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT;
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function runCommand(command, args) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolveCommand();
        return;
      }

      reject(new Error(`${commandLabel(command, args.slice(0, 2))} failed with exit code ${code}. ${stderr.trim()}`));
    });
  });
}

async function ensureNgrokAvailable() {
  try {
    await runCommand('ngrok', ['version']);
  } catch (error) {
    throw new Error(`ngrok is not available. Install ngrok and make sure it is in PATH. ${errorMessage(error)}`);
  }
}

async function configureAuthtoken(token) {
  if (!token) {
    console.warn('[ngrok] NGROK_AUTHTOKEN is missing. Using existing ngrok config if available.');
    return;
  }

  await runCommand('ngrok', ['config', 'add-authtoken', token]);
  console.log('[ngrok] authtoken configured.');
}

async function fetchProxyHealth(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    const data = await response.json().catch(() => undefined);

    return {
      reachable: true,
      ok: response.ok,
      status: response.status,
      message: data?.error || data?.message || data?.data?.status || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForProxyHealth(port) {
  let lastMessage = '';

  for (let attempt = 0; attempt < PROXY_HEALTH_POLL_ATTEMPTS; attempt += 1) {
    try {
      const health = await fetchProxyHealth(port);

      if (health.reachable) {
        if (!health.ok) {
          console.warn(
            `[ngrok] proxy port ${port} is reachable but /health returned ${health.status}: ${health.message || 'no details'}`
          );
        }

        return;
      }
    } catch (error) {
      lastMessage = errorMessage(error);
    }

    await delay(PROXY_HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `proxy server is not reachable on http://127.0.0.1:${port}/health. Start or restart npm run proxy:dev first. ${lastMessage}`
  );
}

function envLineValue(value) {
  return value.includes(' ') || value.includes('#') ? JSON.stringify(value) : value;
}

function updateLocalEnvValue(key, value) {
  const path = resolve(process.cwd(), LOCAL_ENV_FILE);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const newline = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing ? existing.split(/\r?\n/) : [];
  const nextLine = `${key}=${envLineValue(value)}`;
  let changed = false;
  let replaced = false;

  const nextLines = lines.map((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) {
      return line;
    }

    const separator = trimmed.indexOf('=');

    if (separator <= 0 || trimmed.slice(0, separator).trim() !== key) {
      return line;
    }

    replaced = true;

    if (line === nextLine) {
      return line;
    }

    changed = true;
    return nextLine;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== '') {
      nextLines.push('');
    }

    nextLines.push(nextLine);
    changed = true;
  }

  if (!changed) {
    return;
  }

  writeFileSync(path, nextLines.join(newline), 'utf8');
  console.log(`[ngrok] wrote ${key} to ${LOCAL_ENV_FILE}.`);
}

function extractPublicUrl(text) {
  const match = text.match(/https:\/\/[^\s"',<>]+/i);

  return match?.[0]?.replace(/[).,;]+$/, '') || '';
}

function handleNgrokOutput(text) {
  const publicUrl = extractPublicUrl(text);

  if (publicUrl) {
    setPublicUrl(publicUrl);
  }
}

function setPublicUrl(publicUrl) {
  if (!publicUrl || publicUrl === lastPublicUrl) {
    return;
  }

  lastPublicUrl = publicUrl;
  console.log(`[ngrok] public URL: ${publicUrl}`);
  updateLocalEnvValue('TUTOR_PUBLIC_PROXY_URL', publicUrl);
}

async function pollNgrokPublicUrl(signal) {
  for (let attempt = 0; attempt < TUNNEL_POLL_ATTEMPTS; attempt += 1) {
    if (signal.aborted) {
      return;
    }

    try {
      const response = await fetch('http://127.0.0.1:4040/api/tunnels', { signal });
      const data = await response.json();
      const tunnels = Array.isArray(data.tunnels) ? data.tunnels : [];
      const publicUrl =
        tunnels.find((tunnel) => typeof tunnel.public_url === 'string' && tunnel.public_url.startsWith('https://'))
          ?.public_url || tunnels.find((tunnel) => typeof tunnel.public_url === 'string')?.public_url;

      if (publicUrl) {
        setPublicUrl(publicUrl);
        return;
      }
    } catch {
      // ngrok's local API may need a moment to come up.
    }

    await delay(TUNNEL_POLL_INTERVAL_MS);
  }

  console.warn('[ngrok] could not detect a public URL from ngrok yet. Check the ngrok terminal output.');
}

function startNgrok(port) {
  const controller = new AbortController();

  console.log(`[ngrok] starting tunnel: http ${port}`);
  const child = spawn('ngrok', ['http', String(port), '--log=stdout'], {
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  ngrokProcess = child;

  child.stdout?.on('data', (chunk) => {
    handleNgrokOutput(String(chunk));
  });

  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim();

    if (text) {
      console.warn(`[ngrok] ${text}`);
    }

    handleNgrokOutput(text);
  });

  child.on('error', (error) => {
    console.error(`[ngrok] failed to start: ${errorMessage(error)}`);
  });

  child.on('close', (code) => {
    controller.abort();

    if (ngrokProcess === child) {
      ngrokProcess = undefined;
    }

    if (!isShuttingDown) {
      console.warn(`[ngrok] process exited with code ${code}.`);
    }
  });

  void pollNgrokPublicUrl(controller.signal);
}

function stopNgrok() {
  return new Promise((resolveStop) => {
    const child = ngrokProcess;

    if (!child || child.killed) {
      ngrokProcess = undefined;
      resolveStop();
      return;
    }

    const fallback = setTimeout(() => {
      resolveStop();
    }, 2500);

    child.once('close', () => {
      clearTimeout(fallback);
      resolveStop();
    });

    child.kill();
    ngrokProcess = undefined;
  });
}

async function restartNgrok(reason) {
  if (isShuttingDown) {
    return;
  }

  const env = readRuntimeEnv();
  const token = String(env.NGROK_AUTHTOKEN || '').trim();
  const port = proxyPort(env);
  const signature = JSON.stringify({ token, port });

  if (signature === currentSignature && ngrokProcess && !ngrokProcess.killed) {
    return;
  }

  console.log(`[ngrok] ${reason}`);
  await waitForProxyHealth(port);
  await stopNgrok();
  await configureAuthtoken(token);
  startNgrok(port);
  currentSignature = signature;
}

function queueRestart(reason) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartQueue = restartQueue
      .then(() => restartNgrok(reason))
      .catch((error) => console.error(`[ngrok] ${errorMessage(error)}`));
  }, RESTART_DEBOUNCE_MS);
}

function watchEnvFiles() {
  watch(process.cwd(), { persistent: true }, (_eventType, filename) => {
    if (filename === '.env' || filename === '.env.local') {
      queueRestart(`${filename} changed; reloading ngrok config.`);
    }
  });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function shutdown() {
  isShuttingDown = true;
  clearTimeout(restartTimer);
  await stopNgrok();
}

process.on('SIGINT', () => {
  void shutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown().finally(() => process.exit(0));
});

await ensureNgrokAvailable();
watchEnvFiles();
await restartNgrok('initializing ngrok dev tunnel.');
