/* Split the NKJV devotional corpus into per-book JSON files for the reader page.
 *
 *   DEVOTIONAL_SOURCE=/path/to/devotional-checkpoint.json \
 *   node scripts/build-devotional-reader-data.mjs
 *
 * Writes public/data/devotional/index.json and one file per book.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'data', 'devotional');
const source =
  process.env.DEVOTIONAL_SOURCE || join(root, 'public', 'data', 'devotional-checkpoint.json');
const index = JSON.parse(await readFile(join(root, 'public/data/versions/nkjv/index.json'), 'utf8'));
const corpus = JSON.parse(await readFile(resolve(source), 'utf8'));

const FIELDS = ['devotion', 'reflection', 'action', 'prayer'];
await mkdir(outDir, { recursive: true });

const books = [];
let written = 0;

for (const book of index) {
  const data = JSON.parse(
    await readFile(join(root, `public/data/versions/nkjv/${book.slug}.json`), 'utf8')
  );
  const entries = {};
  const chapters = new Map();

  for (const key of Object.keys(data.verses || {})) {
    const [chapter, verse] = key.split(':');
    const reference = `${data.book} ${chapter}:${verse}`;
    const reading = corpus[reference];
    if (!reading) continue;
    if (!FIELDS.every((field) => typeof reading[field] === 'string' && reading[field].trim())) continue;
    entries[`${chapter}:${verse}`] = {
      devotion: reading.devotion.trim(),
      reflection: reading.reflection.trim(),
      action: reading.action.trim(),
      prayer: reading.prayer.trim()
    };
    const n = Number(chapter);
    chapters.set(n, Math.max(chapters.get(n) || 0, Number(verse)));
    written += 1;
  }

  if (!Object.keys(entries).length) continue;

  await writeFile(
    join(outDir, `${book.slug}.json`),
    JSON.stringify({ book: data.book, slug: book.slug, entries })
  );

  books.push({
    slug: book.slug,
    book: data.book,
    chapters: [...chapters.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chapter, verses]) => ({ chapter, verses }))
  });
}

await writeFile(
  join(outDir, 'index.json'),
  JSON.stringify({
    note: 'NKJV devotional readings. One object per verse with devotion, reflection, action and prayer.',
    count: written,
    books
  })
);

console.log(JSON.stringify({ books: books.length, readings: written, outDir }, null, 2));
