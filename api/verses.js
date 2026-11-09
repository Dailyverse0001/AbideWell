import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { listVerses } from '../lib/post-core.js';

/* Fresh verse list. GitHub's raw CDN caches for five minutes, so the browser
 * asks this endpoint instead and always gets what was just posted. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    return res.status(200).json(await listVerses());
  } catch {}

  try {
    const raw = await readFile(join(process.cwd(), 'public', 'data', 'verses.json'), 'utf8');
    return res.status(200).json(JSON.parse(raw));
  } catch {}

  return res.status(200).json([]);
}
