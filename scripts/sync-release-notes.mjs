import { readFileSync } from 'node:fs';

const CHANGELOG_FILE = 'RELEASE_NOTES.md';
const GITHUB_API = 'https://api.github.com';

function parseArgs(argv) {
  const args = {
    tag: process.env.RELEASE_TAG || 'all',
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (arg === '--tag') {
      args.tag = argv[index + 1] || 'all';
      index += 1;
      continue;
    }

    if (arg.startsWith('--tag=')) {
      args.tag = arg.slice('--tag='.length) || 'all';
    }
  }

  return args;
}

function releaseSections(markdown) {
  const headingPattern = /^##\s+(v\d+\.\d+\.\d+)\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  const sections = new Map();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const tag = match[1];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end).trim();

    if (body) {
      sections.set(tag, body);
    }
  }

  return sections;
}

function selectedSections(sections, tag) {
  if (tag === 'all') {
    return sections;
  }

  const normalizedTag = tag.startsWith('v') ? tag : `v${tag}`;
  const body = sections.get(normalizedTag);

  if (!body) {
    throw new Error(`No release notes found for ${normalizedTag}.`);
  }

  return new Map([[normalizedTag, body]]);
}

function githubContext() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is required.');
  }

  if (!token) {
    throw new Error('GITHUB_TOKEN is required.');
  }

  return { repository, token };
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const error = new Error(data?.message || `GitHub request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function updateReleaseNotes(sections, dryRun) {
  if (dryRun) {
    for (const [tag, body] of sections) {
      console.log(`[dry-run] ${tag}: ${body.split(/\r?\n/).length} lines`);
    }

    return;
  }

  const { repository, token } = githubContext();

  for (const [tag, body] of sections) {
    try {
      const release = await githubRequest(`/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`, token);

      await githubRequest(`/repos/${repository}/releases/${release.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ body })
      });

      console.log(`[release-notes] updated ${tag}`);
    } catch (error) {
      if (error?.status === 404) {
        console.log(`[release-notes] skipped ${tag}: release not found`);
        continue;
      }

      throw error;
    }
  }
}

const args = parseArgs(process.argv.slice(2));
const markdown = readFileSync(CHANGELOG_FILE, 'utf8');
const sections = selectedSections(releaseSections(markdown), args.tag);

if (sections.size === 0) {
  throw new Error('No release notes found.');
}

await updateReleaseNotes(sections, args.dryRun);
