import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];
const passed = [];

function projectPath(path) {
  return resolve(root, path);
}

function readText(path) {
  return readFileSync(projectPath(path), 'utf8');
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function pass(message) {
  passed.push(message);
}

function fail(message) {
  failures.push(message);
}

function expectFile(path) {
  if (existsSync(projectPath(path))) {
    pass(`${path} exists`);
    return true;
  }

  fail(`${path} is missing`);
  return false;
}

function expectContains(path, expected, label = expected) {
  if (!expectFile(path)) {
    return;
  }

  if (readText(path).includes(expected)) {
    pass(`${path} contains ${label}`);
    return;
  }

  fail(`${path} does not contain ${label}`);
}

const packageJson = readJson('package.json');
const version = packageJson.version;
const releaseId = `release-v${version}`;

const lock = readJson('package-lock.json');
if (lock.version === version) {
  pass('package-lock root version matches package.json');
} else {
  fail(`package-lock root version is ${lock.version}, expected ${version}`);
}

if (lock.packages?.['']?.version === version) {
  pass('package-lock package entry version matches package.json');
} else {
  fail(`package-lock package entry version is ${lock.packages?.['']?.version ?? 'missing'}, expected ${version}`);
}

expectContains('CHANGELOG.md', `## v${version}`, `v${version}`);
expectContains('RELEASE_NOTES.md', `## v${version}`, `v${version}`);
expectContains('PROJECT_CONTEXT.md', `当前版本：\`${version}\``, `current version ${version}`);
expectContains('README.md', 'TUTOR_PROXY_TOKENS');
expectContains('README.md', 'AI_API_TYPE');
expectContains('README.md', 'output_config.effort');
expectContains('README.md', 'npm run docs:check');
expectContains('README.md', '.github/workflows/release-windows.yml');
expectContains('PROJECT_CONTEXT.md', '.github/workflows/release-windows.yml');

expectFile('.editorconfig');
expectFile('.gitattributes');
expectFile('docs/codex-handoff.md');
expectFile('docs/release-checklist.md');
expectFile('docs/architecture.md');
expectFile('docs/proxy-config.example.env');
expectContains('docs/codex-handoff.md', '.github/workflows/release-windows.yml');
expectContains('docs/codex-handoff.md', 'src/shared/reasoning.ts');
expectContains('docs/release-checklist.md', 'GitHub Actions');
expectContains('docs/architecture.md', '.github/workflows/release-windows.yml');
expectContains('docs/architecture.md', 'AI_PROVIDER_<ID>_API_TYPE');
expectContains('docs/architecture.md', 'thinkingBudget');
expectContains('.github/workflows/release-windows.yml', 'npm run docs:check');
expectContains('.github/workflows/release-windows.yml', 'npm run publish:win');
expectContains('.github/workflows/release-windows.yml', 'GITHUB_TOKEN');
expectFile('.github/workflows/sync-release-notes.yml');

const devLogDir = projectPath('docs/dev-log');
if (existsSync(devLogDir) && statSync(devLogDir).isDirectory()) {
  const devLogFiles = readdirSync(devLogDir).filter((file) => file.endsWith('.md'));
  if (devLogFiles.length > 0) {
    pass('docs/dev-log contains markdown logs');
  } else {
    fail('docs/dev-log does not contain any markdown logs');
  }
} else {
  fail('docs/dev-log is missing');
}

const releases = readJson('announcements/releases.json');
const releaseIds = new Set((releases.announcements ?? []).map((announcement) => announcement?.id));
if (releaseIds.has(releaseId)) {
  pass(`announcements/releases.json contains ${releaseId}`);
} else {
  fail(`announcements/releases.json is missing ${releaseId}`);
}

if (Array.isArray(releases.allAnnouncement) && releases.allAnnouncement.includes(releaseId)) {
  pass(`announcements/releases.json makes ${releaseId} visible`);
} else {
  fail(`announcements/releases.json allAnnouncement does not include ${releaseId}`);
}

if (failures.length > 0) {
  console.error('[docs:check] failed');
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exitCode = 1;
} else {
  console.log('[docs:check] ok');
  for (const item of passed) {
    console.log(`- ${item}`);
  }
}
