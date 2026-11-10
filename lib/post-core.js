/**
 * Abidewell — shared write logic.
 *
 * One job: check the passphrase, then commit the verse list to GitHub.
 * The GitHub token and the passphrase live only in environment variables,
 * so they never reach a browser.
 */

import crypto from 'node:crypto';

const DEFAULT_PATH = 'public/data/verses.json';
const ALLOWED_VERSIONS = new Set([
  'NKJV', 'KJV', 'WEB', 'ESV', 'NIV', 'NLT', 'NASB', 'AMP', 'MSG', 'GNT', 'OTHER'
]);

const MAX_ATTEMPTS = 12;
const WINDOW_MS = 5 * 60 * 1000;
const attempts = new Map();

export function rateLimited(ip) {
  const key = String(ip || 'unknown');
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);

  recent.push(now);
  attempts.set(key, recent);

  if (attempts.size > 5000) attempts.clear();

  return recent.length > MAX_ATTEMPTS;
}

export function authorized(header) {
  const expected = process.env.ADMIN_PASSWORD || '';

  if (expected.length < 8) return false;

  const given = String(header || '').replace(/^Bearer\s+/i, '').trim();

  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validate(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'Missing verse.' };
  }

  const date = String(input.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Date must look like 2026-11-10.' };
  }

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { error: 'That date does not exist.' };
  }

  if (year < 2000 || year > 2100) {
    return { error: 'Date is out of range.' };
  }

  const reference = String(input.reference || '').trim().slice(0, 120);
  if (!reference) {
    return { error: 'Add a reference, like Psalm 23:1.' };
  }

  const text = String(input.text || '').replace(/\r\n/g, '\n').trim();
  if (!text) {
    return { error: 'Add the verse text.' };
  }
  if (text.length > 2000) {
    return { error: 'That verse is longer than 2000 characters.' };
  }

  let version = String(input.version || 'NKJV').toUpperCase().trim();
  if (!ALLOWED_VERSIONS.has(version)) version = 'OTHER';

  const note = String(input.note || '').trim().slice(0, 240);
  const simplify = String(input.simplify || '').trim().slice(0, 800);

  return { value: { date, reference, text, version, note, simplify } };
}

function config() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main',
    path: process.env.GITHUB_PATH || DEFAULT_PATH
  };
}

async function github(url, init) {
  const { token } = config();

  return fetch(url, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'abidewell',
      ...(init && init.headers ? init.headers : {})
    }
  });
}

async function readVerseFile() {
  const { owner, repo, branch, path, token } = config();

  if (!owner || !repo || !token) {
    throw new Error('Server is missing GitHub configuration.');
  }

  const url =
    'https://api.github.com/repos/' +
    owner + '/' + repo + '/contents/' + path +
    '?ref=' + encodeURIComponent(branch);

  const res = await github(url);

  if (!res.ok) {
    throw new Error('GitHub read failed (' + res.status + ').');
  }

  const data = await res.json();
  const raw = Buffer.from(data.content || '', 'base64').toString('utf8');

  let list = [];
  try { list = JSON.parse(raw || '[]'); } catch { list = []; }

  return {
    list: Array.isArray(list) ? list : [],
    sha: data.sha,
    owner,
    repo,
    branch,
    path
  };
}

async function readJsonFile(pathname) {
  const { owner, repo, branch, token } = config();

  if (!owner || !repo || !token) {
    throw new Error('Server is missing GitHub configuration.');
  }

  const url =
    'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + pathname +
    '?ref=' + encodeURIComponent(branch);

  const res = await github(url);

  if (res.status === 404) return { list: [], sha: null };
  if (!res.ok) throw new Error('GitHub read failed (' + res.status + ').');

  const data = await res.json();
  const raw = Buffer.from(data.content || '', 'base64').toString('utf8');

  let parsed = [];
  try { parsed = JSON.parse(raw || '[]'); } catch {}

  return { list: Array.isArray(parsed) ? parsed : [], sha: data.sha };
}

async function writeJsonFile(pathname, sha, value, message) {
  const { branch } = config();

  const body = {
    message,
    content: Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8').toString('base64'),
    branch
  };
  if (sha) body.sha = sha;

  const res = await github(
    'https://api.github.com/repos/' + config().owner + '/' + config().repo + '/contents/' + pathname,
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error('GitHub write failed (' + res.status + '): ' + detail.slice(0, 120));
  }
}

/* Every post and delete is appended here, so no version is ever lost. */
async function appendHistory(record) {
  const path = process.env.GITHUB_HISTORY_PATH || 'public/data/history.json';

  try {
    const file = await readJsonFile(path);
    const entries = file.list.concat([record]).slice(-5000);
    await writeJsonFile(path, file.sha, entries, 'history: ' + (record.date || record.verse.date));
  } catch {
    /* history is a nice-to-have; never block the actual post */
  }
}

async function writeVerseFile(ctx, list, message) {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(list, null, 2) + '\n', 'utf8').toString('base64'),
    branch: ctx.branch,
    sha: ctx.sha
  };

  const res = await github(
    'https://api.github.com/repos/' + ctx.owner + '/' + ctx.repo + '/contents/' + ctx.path,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error('GitHub write failed (' + res.status + '). ' + detail);
  }
}

function sortByDate(list) {
  return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function handleRequest(request) {
  const method = String(request.method || 'GET').toUpperCase();

  if (method !== 'POST') {
    return { status: 405, body: { error: 'Method not allowed.' } };
  }

  if (rateLimited(request.ip)) {
    return { status: 429, body: { error: 'Too many attempts. Wait a few minutes.' } };
  }

  const headers = request.headers || {};
  const auth = headers.authorization || headers.Authorization;

  if (!authorized(auth)) {
    return { status: 401, body: { error: 'Wrong passphrase.' } };
  }

  let payload = request.body;

  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch {
      return { status: 400, body: { error: 'Invalid JSON.' } };
    }
  }

  if (!payload || typeof payload !== 'object') {
    return { status: 400, body: { error: 'Invalid request.' } };
  }

  const action = payload.action === 'delete' ? 'delete' : 'save';

  try {
    const ctx = await readVerseFile();

    if (action === 'delete') {
      const date = String(payload.date || '').trim();

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { status: 400, body: { error: 'Invalid date.' } };
      }

      const removed = ctx.list.find((v) => v.date === date) || null;
      const list = sortByDate(ctx.list.filter((v) => v.date !== date));
      await writeVerseFile(ctx, list, 'verse: remove ' + date);

      if (removed) {
        await appendHistory({
          at: new Date().toISOString(),
          action: 'delete',
          date,
          verse: removed
        });
      }

      return { status: 200, body: { ok: true, verses: list } };
    }

    const checked = validate(payload.verse);

    if (checked.error) {
      return { status: 400, body: { error: checked.error } };
    }

    const verse = { ...checked.value, postedAt: new Date().toISOString() };
    const list = ctx.list.slice();
    const existing = list.findIndex((v) => v.date === verse.date);

    if (existing >= 0) list[existing] = verse;
    else list.push(verse);

    const sorted = sortByDate(list);
    await writeVerseFile(ctx, sorted, 'verse: ' + verse.date + ' ' + verse.reference);

    await appendHistory({ at: verse.postedAt, action: 'save', date: verse.date, verse });

    return { status: 200, body: { ok: true, verses: sorted } };
  } catch (error) {
    const message = String((error && error.message) || 'Something went wrong.')
      .replace(/gh[pousr]_[A-Za-z0-9]+/g, '***')
      .replace(/github_pat_[A-Za-z0-9_]+/g, '***');

    return { status: 500, body: { error: message } };
  }
}

export async function listVerses() {
  const { list } = await readVerseFile();
  return sortByDate(list);
}
