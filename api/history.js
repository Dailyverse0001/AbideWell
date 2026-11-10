import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/* Full history of every verse ever posted or deleted. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const { token, owner, repo, branch } = {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || '',
    repo: process.env.GITHUB_REPO || '',
    branch: process.env.GITHUB_BRANCH || 'main'
  };

  try {
    const url =
      'https://api.github.com/repos/' + owner + '/' + repo +
      '/contents/public/data/history.json?ref=' + encodeURIComponent(branch);

    const upstream = await fetch(url, {
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github.raw',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'abidewell'
      }
    });

    if (upstream.status === 404) return res.status(200).json([]);
    if (!upstream.ok) throw new Error('upstream ' + upstream.status);

    const text = await upstream.text();
    const parsed = JSON.parse(text || '[]');
    return res.status(200).json(Array.isArray(parsed) ? parsed : []);
  } catch {}

  try {
    const raw = await readFile(join(process.cwd(), 'public', 'data', 'history.json'), 'utf8');
    return res.status(200).json(JSON.parse(raw));
  } catch {}

  return res.status(200).json([]);
}
