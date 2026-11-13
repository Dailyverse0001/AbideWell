/* Build "In simple words" data for the Explore panel.
 *
 *   node scripts/build-explore-data.mjs
 *
 * Reads the plain-language explanation library (public/data/explain.json) and
 * the BBE paraphrase fallback (public/data/simple/<slug>.json), then writes one
 * small file per book: public/data/explore/<slug>.json
 *
 *   { book, slug, entries: { "1:1": "In simple words …" } }
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const explain = (await readJson(join(root, 'public/data/explain.json'))).entries || {};
const index = await readJson(join(root, 'public/data/devotional/index.json'));
const outDir = join(root, 'public/data/explore');
await mkdir(outDir, { recursive: true });

const REF = /^(.+?)\s+(\d+):(\d+)(?:\s*-\s*(\d+))?$/;

/* Group the library by book so a verse can be found inside a range. */
const byBook = new Map();
for (const [key, text] of Object.entries(explain)) {
  const hit = REF.exec(key.trim());
  if (!hit) continue;
  const book = hit[1].trim().toLowerCase();
  if (!byBook.has(book)) byBook.set(book, []);
  byBook.get(book).push({
    chapter: Number(hit[2]),
    from: Number(hit[3]),
    to: Number(hit[4] || hit[3]),
    text: String(text || '').trim()
  });
}

const aliases = (name) => {
  const base = String(name).toLowerCase().trim();
  const list = [base];
  if (base === 'psalm') list.push('psalms');
  if (base === 'psalms') list.push('psalm');
  if (base === 'song of solomon') list.push('song of songs');
  if (base === 'song of songs') list.push('song of solomon');
  if (base === 'revelation') list.push('revelation of john');
  return list;
};

function findSimple(bookName, chapter, verse) {
  for (const name of aliases(bookName)) {
    const rows = byBook.get(name);
    if (!rows) continue;
    const exact = rows.find((r) => r.chapter === chapter && r.from === verse && r.to === verse);
    if (exact && exact.text) return exact.text;
    const ranged = rows.find((r) => r.chapter === chapter && verse >= r.from && verse <= r.to);
    if (ranged && ranged.text) return ranged.text;
  }
  return '';
}

const summary = [];
let missing = 0;

for (const book of index.books) {
  const devotional = await readJson(join(root, `public/data/devotional/${book.slug}.json`));
  const bbePath = join(root, `public/data/simple/${book.slug}.json`);
  const bbe = existsSync(bbePath) ? (await readJson(bbePath)).verses || {} : {};

  const entries = {};
  for (const key of Object.keys(devotional.entries || {})) {
    const [chapter, verse] = key.split(':').map(Number);
    const simple = findSimple(book.book, chapter, verse) || String(bbe[key] || '').trim();
    if (!simple) {
      missing += 1;
      continue;
    }
    entries[key] = simple;
  }

  await writeFile(
    join(outDir, `${book.slug}.json`),
    JSON.stringify({ book: book.book, slug: book.slug, entries })
  );
  summary.push({ slug: book.slug, verses: Object.keys(entries).length });
}

const total = summary.reduce((sum, row) => sum + row.verses, 0);

console.log(
  JSON.stringify(
    { books: summary.length, verses: total, missing, outDir },
    null,
    2
  )
);
