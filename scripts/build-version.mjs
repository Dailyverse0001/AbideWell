/* Build a Bible version into public/data/versions/<code>/ from a JSON source.
 *
 *   node scripts/build-version.mjs nkjv path-or-url.json
 *
 * Handles both shapes seen in the wild:
 *   [{ name, chapters: [[verse, ...], ...] }, ...]
 *   { version, books: [{ name, chapters: [{ num, verses: [{ num, text }] }] }] }
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const code = String(process.argv[2] || '').toLowerCase();
const source = process.argv[3] || '';

if (!code || !source) {
  console.error('usage: node scripts/build-version.mjs <code> <file-or-url>');
  process.exit(1);
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function loadSource() {
  if (/^https?:/i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error('download failed: ' + res.status);
    return res.json();
  }
  return JSON.parse(await readFile(source, 'utf8'));
}

function normalise(data) {
  const books = data.books || data;

  return books.map((book) => ({
    name: book.name,
    chapters: book.chapters.map((chapter) => {
      if (Array.isArray(chapter)) return chapter.map((text) => String(text || ''));

      const list = [];
      for (const verse of chapter.verses || []) {
        list[Number(verse.num) - 1] = String(verse.text || '');
      }
      return list;
    })
  }));
}

const books = normalise(await loadSource());
const out = join(root, 'public', 'data', 'versions', code);

await mkdir(out, { recursive: true });

const index = [];
let total = 0;

for (const book of books) {
  const verses = {};

  book.chapters.forEach((chapter, ci) => {
    chapter.forEach((text, vi) => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (clean) verses[ci + 1 + ':' + (vi + 1)] = clean;
    });
  });

  const count = Object.keys(verses).length;
  total += count;

  await writeFile(
    join(out, slug(book.name) + '.json'),
    JSON.stringify({ book: book.name, verses }) + '\n',
    'utf8'
  );

  index.push({
    book: book.name,
    slug: slug(book.name),
    chapters: book.chapters.length,
    verses: count
  });
}

await writeFile(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log(code + ': ' + total + ' verses across ' + index.length + ' books');
