import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const failures = [];
const passed = [];
const docsToScanForSecrets = [
  'README.md',
  'PROJECT_CONTEXT.md',
  'CHANGELOG.md',
  'RELEASE_NOTES.md',
  'docs',
  'announcements'
];

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

function expectNotContains(path, pattern, label) {
  if (!expectFile(path)) {
    return;
  }

  if (pattern.test(readText(path))) {
    fail(`${path} contains ${label}`);
    return;
  }

  pass(`${path} does not contain ${label}`);
}

function markdownSectionByPattern(markdown, pattern) {
  const match = markdown.match(pattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index + match[0].length;
  const next = markdown.slice(start).match(/^##\s+/m);
  const end = next?.index === undefined ? markdown.length : start + next.index;

  return markdown.slice(start, end).trim();
}

function expectNonEmptyVersionSection(path, version, label, allowDate = false) {
  if (!expectFile(path)) {
    return;
  }

  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = allowDate ? '(?:\\s+-\\s+\\d{4}-\\d{2}-\\d{2})?' : '';
  const section = markdownSectionByPattern(readText(path), new RegExp(`^##\\s+v${escaped}${suffix}\\s*$`, 'm'));

  if (!section) {
    fail(`${path} is missing v${version} section`);
    return;
  }

  if (section === '暂无。' || section.length === 0) {
    fail(`${path} v${version} section is empty`);
    return;
  }

  pass(`${path} ${label} section has content`);
}

function listFiles(path) {
  const absolute = projectPath(path);

  if (!existsSync(absolute)) {
    return [];
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    return [path];
  }

  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }

  return files;
}

function scanForSensitiveValues() {
  const secretPatterns = [
    { label: 'OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
    { label: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/ },
    { label: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
    {
      label: 'literal secret env value',
      pattern:
        /(?:API_KEY|TOKEN|AUTHTOKEN)\s*=\s*(?!你的|换成|给|一段|示例|replace-with|your-|<|$)[A-Za-z0-9._~+/=-]{16,}/i
    },
    { label: 'literal bearer token', pattern: /\bBearer\s+(?!<)[A-Za-z0-9._~+/=-]{20,}\b/i }
  ];

  const files = docsToScanForSecrets
    .flatMap((path) => listFiles(path))
    .filter((path) => /\.(?:md|json|env|txt)$/i.test(path));

  for (const file of files) {
    const text = readText(file);
    for (const { label, pattern } of secretPatterns) {
      if (pattern.test(text)) {
        fail(`${file} appears to contain ${label}`);
      }
    }
  }

  pass('documentation sensitive-value scan completed');
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
expectNonEmptyVersionSection('CHANGELOG.md', version, `v${version}`, true);
expectNonEmptyVersionSection('RELEASE_NOTES.md', version, `v${version}`);
expectContains('PROJECT_CONTEXT.md', `当前版本：\`${version}\``, `current version ${version}`);
expectContains('README.md', 'docs/START_HERE.md');
expectContains('README.md', 'npm run docs:check');
expectContains('README.md', '.github/workflows/release-windows.yml');
expectContains('PROJECT_CONTEXT.md', '.github/workflows/release-windows.yml');
expectContains('PROJECT_CONTEXT.md', '当前 Unreleased 改动');

expectFile('.editorconfig');
expectFile('.gitattributes');
expectFile('docs/START_HERE.md');
expectFile('docs/codex-handoff.md');
expectFile('docs/documentation-policy.md');
expectFile('docs/release.md');
expectFile('docs/proxy.md');
expectFile('docs/provider-config.md');
expectFile('docs/announcements.md');
expectFile('docs/release-checklist.md');
expectFile('docs/architecture.md');
expectFile('docs/proxy-config.example.env');
expectFile('docs/decisions/0001-release-through-github-actions.md');
expectFile('docs/decisions/0002-sensitive-config-boundary.md');
expectFile('docs/decisions/0003-guide-update-policy.md');
expectFile('docs/decisions/0004-proxy-security-boundary.md');
expectFile('docs/templates/dev-log-template.md');
expectFile('docs/templates/release-check-template.md');
expectFile('docs/templates/decision-template.md');
expectFile('docs/templates/user-facing-change-template.md');
expectContains('docs/START_HERE.md', '任务到文档映射');
expectContains('docs/START_HERE.md', '发布统一走 GitHub Actions');
expectContains('docs/codex-handoff.md', '.github/workflows/release-windows.yml');
expectContains('docs/codex-handoff.md', 'src/shared/reasoning.ts');
expectContains('docs/codex-handoff.md', 'docs/START_HERE.md');
expectContains('docs/release-checklist.md', 'GitHub Actions');
expectContains('docs/architecture.md', '.github/workflows/release-windows.yml');
expectContains('docs/architecture.md', 'AI_PROVIDER_<ID>_API_TYPE');
expectContains('docs/architecture.md', 'thinkingBudget');
expectContains('docs/documentation-policy.md', '文档更新矩阵');
expectContains('docs/release.md', 'git tag -a vX.Y.Z');
expectContains('docs/proxy.md', 'TUTOR_PROXY_TOKENS');
expectContains('docs/provider-config.md', 'output_config.effort');
expectContains('docs/announcements.md', 'release-vX.Y.Z');
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

if (Array.isArray(releases.allAnnouncement) && releases.allAnnouncement[0] === releaseId) {
  pass(`announcements/releases.json puts ${releaseId} first`);
} else {
  fail(`announcements/releases.json first allAnnouncement item is ${releases.allAnnouncement?.[0] ?? 'missing'}, expected ${releaseId}`);
}

const releaseAnnouncement = (releases.announcements ?? []).find((announcement) => announcement?.id === releaseId);
if (releaseAnnouncement?.content && releaseAnnouncement.content.trim().length > 0) {
  pass(`announcements/releases.json ${releaseId} has content`);
} else {
  fail(`announcements/releases.json ${releaseId} content is empty`);
}

expectContains('src/renderer/src/guides.ts', `'${version}'`, `release guide ${version}`);
expectContains('tests/guides.test.ts', version, `guide tests ${version}`);
expectNotContains('README.md', /已包含\s+v0\.1\.0\s+到\s+v\d+\.\d+\.\d+/, 'hard-coded release range');
scanForSensitiveValues();

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
