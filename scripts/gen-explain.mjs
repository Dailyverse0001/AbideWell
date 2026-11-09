/* Fill public/data/explain.json with a plain-language explanation for EVERY
 * verse, using any OpenAI-compatible endpoint.
 *
 *   OPENAI_BASE_URL=https://api.aicredits.in/v1
 *   OPENAI_API_KEY=...            (or AICREDITS_API_KEY)
 *   OPENAI_MODEL=deepseek/deepseek-v4.1-flash-1017
 *
 *   node scripts/gen-explain.mjs              # everything still missing
 *   node scripts/gen-explain.mjs --limit 3     # try three chapters first
 *
 * Survives interruptions: it skips anything already explained, saves every few
 * chapters, and with GEN_COMMIT_EVERY=40 it also commits and pushes as it goes
 * (used by the GitHub Action so a cancelled job keeps its work).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'data', 'explain.json');
const source = join(root, '.bbe-source.json');
const SOURCE_URL =
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json';

const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || process.env.AICREDITS_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || '';

const limitIndex = process.argv.indexOf('--limit');
const LIMIT = limitIndex > -1 ? Number(process.argv[limitIndex + 1]) || 0 : 0;

const CONCURRENCY = Number(process.env.GEN_CONCURRENCY || 4);
const COMMIT_EVERY = Number(process.env.GEN_COMMIT_EVERY || 0);
const CHUNK = 40;
const PAUSE = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalise(reference) {
  return String(reference)
    .toLowerCase()
    .replace(/\./g, ':')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

const SYSTEM =
  'You explain Bible verses to someone with no theological training. ' +
  'For each verse write 1 to 2 short sentences in plain, everyday English: what it means, and what it means for the reader. ' +
  'Be accurate to the text. No jargon, no lists, no verse quotations, no greeting. ' +
  'Reply with JSON only: {"explanations":{"<reference>":"<text>"}}';

async function ask(lines) {
  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: lines.join('\n') }
      ]
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error('model ' + res.status + ' ' + detail.replace(/\s+/g, ' ').slice(0, 140));
  }

  const data = await res.json();
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '')
      : '';

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return {};

  try {
    return JSON.parse(content.slice(start, end + 1)).explanations || {};
  } catch {
    return {};
  }
}

async function save(store) {
  store.updated = new Date().toISOString().slice(0, 10);
  await writeFile(target, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function gitCommit(count) {
  try {
    execSync('git add public/data/explain.json', { cwd: root, stdio: 'ignore' });
    execSync('git -c user.name=abidewell -c user.email=actions@users.noreply.github.com commit -q -m "Explanations: ' + count + ' verses"', {
      cwd: root,
      stdio: 'ignore'
    });
    execSync('git push --quiet', { cwd: root, stdio: 'ignore' });
    console.log('committed ' + count + ' entries');
  } catch {
    /* nothing changed, or no push rights — keep going */
  }
}

async function loadBible() {
  try {
    return JSON.parse(await readFile(source, 'utf8'));
  } catch {}

  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error('Could not download the BBE text (' + res.status + ').');
  const text = await res.text();
  await writeFile(source, text, 'utf8');
  return JSON.parse(text);
}

async function main() {
  if (!BASE || !KEY || !MODEL) {
    console.error('Set OPENAI_BASE_URL, OPENAI_API_KEY (or AICREDITS_API_KEY) and OPENAI_MODEL.');
    process.exit(1);
  }

  const store = JSON.parse(await readFile(target, 'utf8'));
  store.entries = store.entries || {};

  const bible = await loadBible();

  const tasks = [];
  for (const book of bible) {
    for (let c = 0; c < book.chapters.length; c += 1) {
      const wanted = book.chapters[c]
        .map((text, i) => ({
          ref: book.name + ' ' + (c + 1) + ':' + (i + 1),
          text: String(text || '').replace(/\s+/g, ' ').trim()
        }))
        .filter((v) => v.text && !store.entries[normalise(v.ref)]);

      if (wanted.length) tasks.push({ book: book.name, chapter: c + 1, wanted });
      if (LIMIT && tasks.length >= LIMIT) break;
    }
    if (LIMIT && tasks.length >= LIMIT) break;
  }

  console.log('chapters to process: ' + tasks.length);

  let done = 0;
  let added = 0;
  let failed = 0;
  let sinceCommit = 0;

  async function worker() {
    while (tasks.length) {
      const task = tasks.shift();

      for (let i = 0; i < task.wanted.length; i += CHUNK) {
        const slice = task.wanted.slice(i, i + CHUNK);
        const lines = slice.map((v) => v.ref + ' — ' + v.text);

        try {
          const made = await ask(lines);

          for (const [ref, text] of Object.entries(made)) {
            const key = normalise(ref);
            const cleaned = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 800);
            if (!key || !cleaned || store.entries[key]) continue;
            store.entries[key] = cleaned;
            added += 1;
          }
        } catch (error) {
          failed += 1;
          console.error(task.book + ' ' + task.chapter + ': ' + error.message);
        }

        await sleep(PAUSE);
      }

      done += 1;
      sinceCommit += 1;

      if (done % 5 === 0) {
        await save(store);
        console.log(
          task.book + ' ' + task.chapter + ' — entries ' + Object.keys(store.entries).length +
            ', added ' + added + ', failed ' + failed + ', chapters left ' + tasks.length
        );
      }

      if (COMMIT_EVERY && sinceCommit >= COMMIT_EVERY) {
        sinceCommit = 0;
        await save(store);
        gitCommit(Object.keys(store.entries).length);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  await save(store);
  console.log('done. entries ' + Object.keys(store.entries).length + ', added ' + added + ', failed ' + failed);

  if (COMMIT_EVERY) gitCommit(Object.keys(store.entries).length);
}

main();
