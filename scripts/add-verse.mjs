/**
 * Abidewell — add a verse from a reference.
 *
 * Used by the GitHub Action, but works locally too:
 *   node scripts/add-verse.mjs --reference "John 3:16"
 *   node scripts/add-verse.mjs --reference "Psalm 23:1-3" --version KJV --date 2026-11-12
 *
 * Only public-domain translations are available from the free API:
 * WEB, KJV, ASV, YLT, BBE, DARBY. NKJV is copyrighted and not offered.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../public/data/verses.json', import.meta.url));

const API_CODES = {
  WEB: 'web',
  KJV: 'kjv',
  ASV: 'asv',
  YLT: 'ylt',
  BBE: 'bbe',
  DARBY: 'darby'
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith('--')) {
      out[key] = value;
      i += 1;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function fail(message) {
  console.error('✖ ' + message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const reference = String(args.reference || process.env.REFERENCE || '').trim();
const date = String(args.date || process.env.DATE || '').trim() || todayISO();
const version = String(args.version || process.env.VERSION || 'WEB').toUpperCase().trim();
const note = String(args.note || process.env.NOTE || '').trim();

if (!reference) {
  fail('A reference is required. Example: --reference "John 3:16"');
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  fail('Date must look like 2026-11-12. Got: ' + date);
}

const apiCode = API_CODES[version];

if (!apiCode) {
  fail(
    version +
      ' is not available from the free Bible API. Use one of: ' +
      Object.keys(API_CODES).join(', ') +
      '. For NKJV, post from /admin and paste the text yourself.'
  );
}

const url = 'https://bible-api.com/' + encodeURIComponent(reference) + '?translation=' + apiCode;

console.log('→ Fetching ' + reference + ' (' + version + ')…');

let data;
try {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'abidewell' }
  });

  if (!res.ok) {
    fail('The Bible API returned ' + res.status + '. Check the reference ("John 3:16").');
  }

  data = await res.json();
} catch (error) {
  fail('Could not reach the Bible API: ' + (error && error.message));
}

const text = String(data.text || '').replace(/\s+/g, ' ').trim();

if (!text) {
  fail('The API returned no text for "' + reference + '".');
}

const resolvedReference = String(data.reference || reference).trim();

let list = [];
try {
  const raw = readFileSync(FILE, 'utf8');
  const parsed = JSON.parse(raw || '[]');
  if (Array.isArray(parsed)) list = parsed;
} catch {
  list = [];
}

const verse = {
  date,
  reference: resolvedReference,
  text,
  version,
  note,
  postedAt: new Date().toISOString()
};

const existing = list.findIndex((item) => item.date === date);
if (existing >= 0) list[existing] = verse;
else list.push(verse);

list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');

console.log('✔ ' + date + ' — ' + resolvedReference + ' (' + version + ')');
console.log('  ' + text.slice(0, 90) + (text.length > 90 ? '…' : ''));
console.log('  ' + list.length + ' verses in the archive.');
