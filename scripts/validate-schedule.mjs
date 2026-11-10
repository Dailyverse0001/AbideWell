import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeVerseLists } from '../lib/verse-merge.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'data');
const versionDir = join(dataDir, 'versions', 'nkjv');
const schedule = JSON.parse(await readFile(join(dataDir, 'schedule.json'), 'utf8'));
const index = JSON.parse(await readFile(join(versionDir, 'index.json'), 'utf8'));
const bible = new Map();
const expectedLabels = new Set([
  'God’s Promise', 'Faith and Trust', 'Blessing', 'Hope and Encouragement',
  'Love of God', 'Strength and Courage', 'Peace of Mind', 'Healing and Restoration',
  'Protection and Safety', 'Wisdom and Guidance', 'Forgiveness and Mercy',
  'Joy and Happiness', 'Patience and Perseverance', 'Gratitude and Thanksgiving',
  'Comfort in Difficult Times', 'Overcoming Fear', 'Success and Prosperity',
  'Prayer and Answered Prayers', 'God’s Faithfulness', 'New Beginnings',
  'Victory Over Temptation', 'Purpose and Calling', 'Family and Relationships',
  'Miracles and God’s Power', 'Eternal Life and Salvation'
]);

for (const item of index) {
  const data = JSON.parse(await readFile(join(versionDir, `${item.slug}.json`), 'utf8'));
  bible.set(data.book.toLowerCase(), data);
}

function parseReference(reference) {
  const hit = String(reference).match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  assert.ok(hit, `Invalid reference: ${reference}`);
  return { book: hit[1], chapter: Number(hit[2]), from: Number(hit[3]), to: Number(hit[4] || hit[3]) };
}

function addDay(iso) {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

assert.equal(schedule.length, 507, 'Schedule must contain 507 readings.');
assert.equal(schedule[0].date, '2026-11-11');
assert.equal(schedule.at(-1).date, '2028-03-31');

const dates = new Set();
const verses = new Set();
const categories = new Map();

for (let index = 0; index < schedule.length; index += 1) {
  const entry = schedule[index];
  assert.equal(entry.date, index ? addDay(schedule[index - 1].date) : '2026-11-11', `Date gap at ${entry.date}`);
  assert.ok(!dates.has(entry.date), `Duplicate date: ${entry.date}`);
  dates.add(entry.date);

  assert.equal(entry.version, 'NKJV', `${entry.reference} is not NKJV.`);
  assert.equal(entry.scheduled, true, `${entry.reference} is not marked scheduled.`);
  assert.ok(entry.theme && entry.themeLabel, `${entry.reference} is missing its category.`);
  assert.ok(String(entry.simplify).trim().length >= 20, `${entry.reference} needs an explanation.`);
  assert.ok(entry.simplify.length <= 800, `${entry.reference} explanation exceeds the post limit.`);
  assert.ok(!/^[a-z]/.test(entry.text), `${entry.reference} starts mid-sentence.`);
  assert.match(entry.text, /[.!?][”’"']?$/, `${entry.reference} ends mid-sentence.`);

  const parsed = parseReference(entry.reference);
  assert.ok(parsed.to >= parsed.from && parsed.to - parsed.from <= 2, `${entry.reference} must contain one to three verses.`);
  const book = bible.get(parsed.book.toLowerCase());
  assert.ok(book, `Unknown book: ${parsed.book}`);

  const sourceParts = [];
  for (let verse = parsed.from; verse <= parsed.to; verse += 1) {
    const key = `${parsed.chapter}:${verse}`;
    assert.ok(book.verses[key], `Missing NKJV source verse: ${entry.reference}`);
    const id = `${parsed.book} ${key}`;
    assert.ok(!verses.has(id), `Verse reused in schedule: ${id}`);
    verses.add(id);
    sourceParts.push(String(book.verses[key]).replace(/\s+/g, ' ').trim());
  }
  assert.equal(entry.text, sourceParts.join(' '), `NKJV text mismatch: ${entry.reference}`);
  categories.set(entry.theme, (categories.get(entry.theme) || 0) + 1);
}

assert.equal(categories.size, 25, 'Every requested Random category must be represented.');
for (const [theme, count] of categories) assert.ok(count >= 20, `${theme} has too few passages.`);
assert.deepEqual(new Set(schedule.map((entry) => entry.themeLabel)), expectedLabels, 'Random category labels changed.');

const scheduled = schedule.find((entry) => entry.date === '2026-11-11');
const manual = { date: scheduled.date, reference: 'Test 1:1', text: 'Manual', version: 'NKJV' };
const merged = mergeVerseLists(schedule, [manual]);
assert.equal(merged.length, schedule.length, 'An override must replace, not add, a date.');
assert.equal(merged.find((entry) => entry.date === manual.date).text, 'Manual', 'Manual post must override schedule.');
assert.equal(merged.find((entry) => entry.date === manual.date).scheduled, undefined, 'Manual override cannot be marked scheduled.');

console.log(`Validated ${schedule.length} days, ${verses.size} unique NKJV verses, and ${categories.size} Random categories.`);
