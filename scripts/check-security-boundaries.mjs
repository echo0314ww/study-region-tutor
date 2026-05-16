import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function expectContains(path, text, label = text) {
  if (!read(path).includes(text)) {
    fail(`${path} should contain ${label}`);
  }
}

function expectNotInPersistedSettings(secretKey) {
  const source = read('src/renderer/src/uiUtils.ts');
  const match = source.match(/const PERSISTED_SETTING_KEYS = \[([\s\S]*?)\] as const;/);

  if (!match) {
    fail('Could not find PERSISTED_SETTING_KEYS in src/renderer/src/uiUtils.ts');
    return;
  }

  if (match[1].includes(`'${secretKey}'`) || match[1].includes(`"${secretKey}"`)) {
    fail(`${secretKey} must not be persisted in renderer localStorage settings`);
  }
}

expectNotInPersistedSettings('apiKey');
expectNotInPersistedSettings('proxyToken');
expectContains('src/main/index.ts', 'contextIsolation: true');
expectContains('src/main/index.ts', 'sandbox: true');
expectContains('src/main/index.ts', 'nodeIntegration: false');
expectContains('src/main/index.ts', 'webSecurity: true');
expectContains('src/main/index.ts', 'allowRunningInsecureContent: false');
expectContains(
  'src/shared/exportConversation.ts',
  '不包含截图、API Key、代理 Token 或代理服务地址',
  'export privacy notice'
);

const exportSource = read('src/shared/exportConversation.ts');
for (const forbidden of ['apiKey', 'proxyToken', 'ngrokToken']) {
  const allowedPrivacyNotice = forbidden === 'proxyToken' ? '代理 Token' : forbidden;
  const sanitized = exportSource.replaceAll(allowedPrivacyNotice, '');

  if (sanitized.includes(forbidden)) {
    fail(`src/shared/exportConversation.ts should not serialize ${forbidden}`);
  }
}

const backupType = read('src/shared/types.ts');
for (const forbidden of ['apiKey', 'proxyToken']) {
  const backupSection = backupType.match(/interface StudyLibraryBackup \{[\s\S]*?\}/);

  if (backupSection && backupSection[0].includes(forbidden)) {
    fail(`StudyLibraryBackup type must not include ${forbidden}`);
  }
}

const backupExportItem = backupType.match(/interface StudyLibraryExportItem \{[\s\S]*?\}/);
if (backupExportItem) {
  for (const forbidden of ['apiKey', 'proxyToken']) {
    if (backupExportItem[0].includes(forbidden)) {
      fail(`StudyLibraryExportItem type must not include ${forbidden}`);
    }
  }
}

if (failures.length > 0) {
  console.error('[security:check] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('[security:check] ok');
}
