/* Build the whole Bible in Basic English — every verse in simple words.
 *
 *   node scripts/build-simple.mjs
 *
 * Each chapter is cached in .simple-cache first, so stopping and restarting
 * never loses work and gaps can be refilled by simply running it again.
 * Writes public/data/simple/<book>.json, one file per book.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'data', 'simple');
const cache = join(root, '.simple-cache');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function readCache(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchChapter(book, number) {
  const url =
    'https://bible-api.com/' + encodeURIComponent(book + ' ' + number) + '?translation=bbe';

  let wait = 6000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const res = await fetch(url);

      if (res.status === 429) {
        await sleep(wait);
        wait *= 2;
        continue;
      }

      if (!res.ok) throw new Error('status ' + res.status);

      const data = await res.json();
      if (!Array.isArray(data.verses)) throw new Error('no verses');

      return data.verses.map((v) => ({
        chapter: v.chapter,
        verse: v.verse,
        text: String(v.text || '').replace(/\s+/g, ' ').trim()
      }));
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(2500 * (attempt + 1));
    }
  }

  return null;
}

await mkdir(out, { recursive: true });
await mkdir(cache, { recursive: true });

const index = [];
let total = 0;
let fetched = 0;
const gaps = [];

for (const [book, chapters] of BOOKS) {
  const bookSlug = slug(book);
  const bookCache = join(cache, bookSlug);
  await mkdir(bookCache, { recursive: true });

  const verses = {};

  for (let number = 1; number <= chapters; number += 1) {
    const file = join(bookCache, number + '.json');
    let list = await readCache(file);

    if (!list) {
      list = await fetchChapter(book, number);
      fetched += 1;

      if (list) {
        await writeFile(file, JSON.stringify(list) + '\n', 'utf8');
      } else {
        gaps.push(book + ' ' + number);
        continue;
      }

      await sleep(1100);
    }

    for (const verse of list) {
      verses[verse.chapter + ':' + verse.verse] = verse.text;
      total += 1;
    }
  }

  await writeFile(
    join(out, bookSlug + '.json'),
    JSON.stringify({ book, verses }) + '\n',
    'utf8'
  );

  index.push({ book, slug: bookSlug, chapters, verses: Object.keys(verses).length });
  await writeFile(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');

  console.log(book + ': ' + Object.keys(verses).length + ' verses  (total ' + total + ', fetched ' + fetched + ')');
}

console.log('done. ' + total + ' verses across ' + index.length + ' books.');
if (gaps.length) console.log('missing chapters (run again to fill): ' + gaps.join(', '));
