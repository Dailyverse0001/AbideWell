/* Fill public/data/explain.json with a plain-language explanation for EVERY
 * verse, using any OpenAI-compatible endpoint.
 *
 *   OPENAI_BASE_URL=https://api.openai.com/v1
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_MODEL=gpt-4o-mini
 *
 *   node scripts/gen-explain.mjs            # everything that is missing
 *   node scripts/gen-explain.mjs --limit 5  # try five chapters first
 *
 * It writes as it goes, so stopping and restarting is safe.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolveRoot();
const file = join(root, 'public', 'data', 'explain.json');

const BASE = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const LIMIT = Number(
  (process.argv[process.argv.indexOf('--limit') + 1] || '0').replace(/[^0-9]/g, '')
) || 0;

const BOOKS = [
  ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
  ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
  ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
  ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
  ['Ecclesiastes', 12], ['Song of Solomon', 8], ['Isaiah', 66], ['Jeremiah', 52],
  ['Lamentations', 5], ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3],
  ['Amos', 9], ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
  ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4], ['Matthew', 28],
  ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28], ['Romans', 16],
  ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
  ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3],
  ['1 Timothy', 6], ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13],
  ['James', 5], ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1],
  ['3 John', 1], ['Jude', 1], ['Revelation', 22]
];

function resolveRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..');
}

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
  'For each verse write 1 to 2 short sentences in plain, everyday English: what it means and what it means for the reader. ' +
  'No jargon, no lists, no verse quotations. ' +
  'Reply with JSON only: {"explanations": {"<reference>": "<text>"}}';

async function chapterText(book, chapter) {
  const url =
    'https://bible-api.com/' +
    encodeURIComponent(book + ' ' + chapter) +
    '?translation=web';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('bible-api ' + res.status);
      const data = await res.json();
      return Array.isArray(data.verses) ? data.verses : [];
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }

  return [];
}

async function explainChapter(book, chapter, verses) {
  const list = verses.map((v) => {
    const ref = v.reference || book + ' ' + chapter + ':' + v.verse;
    return ref + ' — ' + String(v.text || '').replace(/\s+/g, ' ').trim();
  });

  const body = {
    model: MODEL,
    temperature: 0.4,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: list.join('\n') }
    ]
  };

  const res = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + KEY
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error('model ' + res.status + ' ' + (await res.text()).slice(0, 120));

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? String(data.choices[0].message.content || '')
    : '';

  const json = content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);

  try {
    const parsed = JSON.parse(json);
    return parsed.explanations || {};
  } catch {
    return {};
  }
}

async function main() {
  if (!KEY) {
    console.error('Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL / OPENAI_MODEL).');
    process.exit(1);
  }

  const store = JSON.parse(await readFile(file, 'utf8'));
  store.entries = store.entries || {};

  let chapters = 0;
  let added = 0;

  for (const [book, count] of BOOKS) {
    for (let chapter = 1; chapter <= count; chapter += 1) {
      if (LIMIT && chapters >= LIMIT) {
        await save(store);
        console.log('stopped at the limit. added ' + added + ' verses.');
        return;
      }

      chapters += 1;

      let verses = [];
      try {
        verses = await chapterText(book, chapter);
      } catch (error) {
        console.error(book + ' ' + chapter + ': ' + error.message);
        continue;
      }

      const missing = verses.filter((v) => {
        const ref = v.reference || book + ' ' + chapter + ':' + v.verse;
        return !store.entries[normalise(ref)];
      });

      if (!missing.length) continue;

      try {
        const made = await explainChapter(book, chapter, missing);

        for (const [ref, text] of Object.entries(made)) {
          const key = normalise(ref);
          if (!key || store.entries[key]) continue;
          store.entries[key] = String(text).replace(/\s+/g, ' ').trim().slice(0, 800);
          added += 1;
        }
      } catch (error) {
        console.error(book + ' ' + chapter + ': ' + error.message);
        await new Promise((r) => setTimeout(r, 3000));
      }

      if (chapters % 10 === 0) {
        await save(store);
        console.log(book + ' ' + chapter + ': ' + Object.keys(store.entries).length + ' entries so far');
      }
    }
  }

  await save(store);
  console.log('done. ' + Object.keys(store.entries).length + ' entries, ' + added + ' added.');
}

async function save(store) {
  store.updated = new Date().toISOString().slice(0, 10);
  await writeFile(file, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

main();
