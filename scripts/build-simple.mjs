/* Build the whole Bible in Basic English — every verse in simple words.
 *
 *   node scripts/build-simple.mjs
 *
 * Downloads the public-domain BBE text once (cached in .bbe-source.json), then
 * writes public/data/simple/<book>.json — one file per book, so a phone only
 * downloads the book it needs. No key, no cost, no rate limits.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'data', 'simple');
const source = join(root, '.bbe-source.json');

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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

const bible = await loadBible();

await mkdir(out, { recursive: true });

const index = [];
let total = 0;

for (const book of bible) {
  const verses = {};

  book.chapters.forEach((chapter, chapterIndex) => {
    chapter.forEach((text, verseIndex) => {
      verses[chapterIndex + 1 + ':' + (verseIndex + 1)] = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
      total += 1;
    });
  });

  const bookSlug = slug(book.name);

  await writeFile(
    join(out, bookSlug + '.json'),
    JSON.stringify({ book: book.name, verses }) + '\n',
    'utf8'
  );

  index.push({
    book: book.name,
    slug: bookSlug,
    chapters: book.chapters.length,
    verses: Object.keys(verses).length
  });

  console.log(book.name + ': ' + Object.keys(verses).length + ' verses  (total ' + total + ')');
}

await writeFile(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

console.log('done. ' + total + ' verses across ' + index.length + ' books.');
