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

const SECTIONS = [
  ['verse', '📖 The verse', 'explore-verse'],
  ['simple', '💡 In simple words', 'explore-simple'],
  ['devotion', '🕊️ Devotion', 'explore-text'],
  ['reflection', '🪞 Reflect', 'explore-text explore-quote'],
  ['action', '🌱 Today', 'explore-text'],
  ['prayer', '🙏 Prayer', 'explore-text explore-prayer']
];

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  } catch {
    return false;
  }
}

function flashCopy(button, message) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  window.clearTimeout(Number(button.dataset.timer || 0));
  button.textContent = message;
  button.classList.add('is-done');
  const timer = window.setTimeout(() => {
    button.textContent = button.dataset.label;
    button.classList.remove('is-done');
  }, 1600);
  button.dataset.timer = String(timer);
}

/** Fill a host element with the Explore content. Returns the data or null. */
export async function renderExplore(host, reference, options = {}) {
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

  const rows = SECTIONS.map(([key, label, className]) => ({
    label,
    className,
    text: String(data[key] || '').trim()
  })).filter((row) => row.text);

  if (!rows.length) {
    status.textContent = 'No reading for this verse yet.';
    host.append(status);
    return data;
  }

  /* Reference first, so the reader always knows the book, chapter and verse. */
  const head = document.createElement('div');
  head.className = 'explore-head';

  const ref = document.createElement('p');
  ref.className = 'explore-ref';
  ref.textContent = data.reference;

  head.append(ref);
  if (options.copyButtons) {
    const copyAll = document.createElement('button');
    copyAll.type = 'button';
    copyAll.className = 'explore-copy explore-copy--all';
    copyAll.textContent = 'Copy all';
    copyAll.addEventListener('click', async () => {
      const text = [data.reference, '']
        .concat(rows.map((row) => row.label + '\n' + row.text + '\n'))
        .join('\n')
        .trim();
      flashCopy(copyAll, (await copyText(text)) ? 'Copied ✓' : 'Copy failed');
    });
    head.append(copyAll);
  }
  host.append(head);

  for (const row of rows) {
    const line = document.createElement('div');
    line.className = 'explore-row';

    const kicker = document.createElement('p');
    kicker.className = 'simplify-label';
    kicker.textContent = row.label;

    line.append(kicker);
    if (options.copyButtons) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'explore-copy';
      copy.textContent = 'Copy';
      copy.setAttribute('aria-label', 'Copy ' + row.label.replace(/^\S+\s/, ''));
      copy.addEventListener('click', async () => {
        flashCopy(copy, (await copyText(row.label + '\n' + row.text)) ? 'Copied ✓' : 'Copy failed');
      });
      line.append(copy);
    }

    const body = document.createElement('p');
    body.className = row.className;
    body.textContent = row.text;

    host.append(line, body);
  }

  return data;
}
