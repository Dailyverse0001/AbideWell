/* Abidewell — "Explore this verse".
 *
 * Shared by the Today page, the Explore verse page and the posting desk, so all
 * three show the same four things for any verse:
 *
 *   1. the verse itself
 *   2. a plain-words explanation
 *   3. devotion, reflection, action and prayer
 *
 * Everything is static JSON, so no key, no waiting on a model, and it works
 * offline once a book has been opened.
 */

const INDEX_PATH = 'data/devotional/index.json';
const READING_DIR = 'data/devotional/';
const SIMPLE_DIR = 'data/explore/';
const VERSION_DIR = 'data/versions/nkjv/';

const indexPromise = { value: null };
const readingCache = new Map();
const simpleCache = new Map();
const verseCache = new Map();

const REF = /^(.+?)\s+(\d+):(\d+)(?:\s*-\s*(\d+))?$/;

export function parseReference(reference) {
  const hit = REF.exec(String(reference || '').trim());
  if (!hit) return null;
  return {
    book: hit[1].trim(),
    chapter: Number(hit[2]),
    from: Number(hit[3]),
    to: Number(hit[4] || hit[3])
  };
}

const ALIASES = {
  psalm: ['psalms'],
  psalms: ['psalm'],
  'song of songs': ['song of solomon'],
  'song of solomon': ['song of songs'],
  'revelation of john': ['revelation']
};

function normaliseBook(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bookKeys(name) {
  const base = normaliseBook(name);
  return [base].concat(ALIASES[base] || []);
}

async function getIndex() {
  if (!indexPromise.value) {
    indexPromise.value = fetch(INDEX_PATH, { cache: 'force-cache' })
      .then((res) => {
        if (!res.ok) throw new Error('Could not load the verse index (' + res.status + ')');
        return res.json();
      })
      .catch((error) => {
        indexPromise.value = null;
        throw error;
      });
  }
  return indexPromise.value;
}

function findBook(index, name) {
  const wanted = bookKeys(name);
  return index.books.find((book) => wanted.includes(normaliseBook(book.book))) || null;
}

async function getBookFile(dir, slug, cache) {
  if (!cache.has(slug)) {
    cache.set(
      slug,
      fetch(dir + slug + '.json', { cache: 'force-cache' })
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
    );
  }
  return cache.get(slug);
}

/**
 * Everything the Explore panel needs for one reference.
 * Returns null when the reference cannot be read.
 */
export async function loadExplore(reference) {
  const parts = parseReference(reference);
  if (!parts) return null;

  const index = await getIndex();
  const book = findBook(index, parts.book);
  if (!book) return null;

  const key = parts.chapter + ':' + parts.from;
  const [reading, simpleFile, verseFile] = await Promise.all([
    getBookFile(READING_DIR, book.slug, readingCache),
    getBookFile(SIMPLE_DIR, book.slug, simpleCache),
    getBookFile(VERSION_DIR, book.slug, verseCache)
  ]);

  const readingEntry = reading && reading.entries ? reading.entries[key] : null;
  const simple = (simpleFile && simpleFile.entries && simpleFile.entries[key]) || '';
  const verseText = verseFile && verseFile.verses ? verseFile.verses[key] || '' : '';

  if (!readingEntry && !simple && !verseText) return null;

  return {
    book: book.book,
    chapter: parts.chapter,
    from: parts.from,
    to: parts.to,
    reference: parts.to > parts.from
      ? book.book + ' ' + parts.chapter + ':' + parts.from + '-' + parts.to
      : book.book + ' ' + parts.chapter + ':' + parts.from,
    verse: verseText,
    simple,
    devotion: (readingEntry && readingEntry.devotion) || '',
    reflection: (readingEntry && readingEntry.reflection) || '',
    action: (readingEntry && readingEntry.action) || '',
    prayer: (readingEntry && readingEntry.prayer) || ''
  };
}

/**
 * Just the verse text and the plain-words line — cheaper than loadExplore()
 * when the caller already has the devotion text.
 */
export async function loadExtras(reference) {
  const parts = parseReference(reference);
  if (!parts) return { verse: '', simple: '' };

  const index = await getIndex();
  const book = findBook(index, parts.book);
  if (!book) return { verse: '', simple: '' };

  const key = parts.chapter + ':' + parts.from;
  const [simpleFile, verseFile] = await Promise.all([
    getBookFile(SIMPLE_DIR, book.slug, simpleCache),
    getBookFile(VERSION_DIR, book.slug, verseCache)
  ]);

  return {
    verse: (verseFile && verseFile.verses && verseFile.verses[key]) || '',
    simple: (simpleFile && simpleFile.entries && simpleFile.entries[key]) || ''
  };
}

/** Fill a host element with the Explore content. Returns the data or null. */
export async function renderExplore(host, reference) {
  if (!host) return null;

  host.replaceChildren();
  const status = document.createElement('p');
  status.className = 'explore-status';
  status.textContent = 'Opening the verse…';
  host.append(status);

  let data = null;
  try {
    data = await loadExplore(reference);
  } catch {
    data = null;
  }

  host.replaceChildren();

  if (!data) {
    status.textContent = 'No reading for this verse yet.';
    host.append(status);
    return null;
  }

  const blocks = [
    ['The verse', data.verse, 'explore-verse'],
    ['In simple words', data.simple, 'explore-simple'],
    ['Devotion', data.devotion, 'explore-text'],
    ['Reflect', data.reflection, 'explore-text explore-quote'],
    ['Today', data.action, 'explore-text'],
    ['Prayer', data.prayer, 'explore-text explore-prayer']
  ];

  let shown = 0;
  for (const [label, text, className] of blocks) {
    if (!text) continue;
    const kicker = document.createElement('p');
    kicker.className = 'simplify-label';
    kicker.textContent = label;

    const body = document.createElement('p');
    body.className = className;
    body.textContent = text;

    host.append(kicker, body);
    shown += 1;
  }

  if (!shown) {
    status.textContent = 'No reading for this verse yet.';
    host.append(status);
  }

  return data;
}
