/* Fill public/data/explain.json with a plain-language explanation for EVERY
 * verse, using any OpenAI-compatible endpoint.
 *
 *   OPENAI_BASE_URL=https://api.aicredits.in/v1
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=deepseek/deepseek-v4.1-flash-1017
 *
 *   node scripts/gen-explain.mjs              # everything still missing
 *   node scripts/gen-explain.mjs --limit 3     # try three chapters first
 *
 * Reads the whole Bible from .bbe-source.json (run scripts/build-simple.mjs
 * once to create it), writes after every few chapters, and skips anything
 * already explained — so stopping and restarting is safe.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'data', 'explain.json');
const source = join(root, '.bbe-source.json');

const BASE = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || '';

const limitIndex = process.argv.indexOf('--limit');
const LIMIT = limitIndex > -1 ? Number(process.argv[limitIndex + 1]) || 0 : 0;

const CHUNK = 40;
const PAUSE = 400;

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
    const parsed = JSON.parse(content.slice(start, end + 1));
    return parsed.explanations || {};
  } catch {
    return {};
  }
}

async function save(store) {
  store.updated = new Date().toISOString().slice(0, 10);
  await writeFile(target, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

async function main() {
  if (!BASE || !KEY || !MODEL) {
    console.error('Set OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL.');
    process.exit(1);
  }

  const store = JSON.parse(await readFile(target, 'utf8'));
  store.entries = store.entries || {};

  const bible = JSON.parse(await readFile(source, 'utf8'));

  let chapters = 0;
  let added = 0;
  let failed = 0;

  for (const book of bible) {
    for (let c = 0; c < book.chapters.length; c += 1) {
      if (LIMIT && chapters >= LIMIT) {
        await save(store);
        console.log('stopped at limit. entries: ' + Object.keys(store.entries).length + ', added: ' + added);
        return;
      }

      chapters += 1;

      const wanted = book.chapters[c]
        .map((text, i) => ({
          ref: book.name + ' ' + (c + 1) + ':' + (i + 1),
          text: String(text || '').replace(/\s+/g, ' ').trim()
        }))
        .filter((v) => v.text && !store.entries[normalise(v.ref)]);

      if (!wanted.length) continue;

      for (let i = 0; i < wanted.length; i += CHUNK) {
        const slice = wanted.slice(i, i + CHUNK);
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
          console.error(book.name + ' ' + (c + 1) + ': ' + error.message);
        }

        await sleep(PAUSE);
      }

      if (chapters % 5 === 0) {
        await save(store);
        console.log(
          book.name + ' ' + (c + 1) + ' — entries ' + Object.keys(store.entries).length +
            ', added ' + added + ', failed ' + failed
        );
      }
    }
  }

  await save(store);
  console.log('done. entries ' + Object.keys(store.entries).length + ', added ' + added + ', failed ' + failed);
}

main();
