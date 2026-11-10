import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'public', 'data');
const versionDir = join(dataDir, 'versions', 'nkjv');
const startDate = '2026-11-11';
const endDate = '2028-03-31';

const THEME_LABELS = {
  promise: 'God’s Promise',
  faith: 'Faith and Trust',
  blessing: 'Blessing',
  hope: 'Hope and Encouragement',
  love: 'Love of God',
  strength: 'Strength and Courage',
  peace: 'Peace of Mind',
  healing: 'Healing and Restoration',
  protection: 'Protection and Safety',
  wisdom: 'Wisdom and Guidance',
  forgiveness: 'Forgiveness and Mercy',
  joy: 'Joy and Happiness',
  patience: 'Patience and Perseverance',
  gratitude: 'Gratitude and Thanksgiving',
  comfort: 'Comfort in Difficult Times',
  fear: 'Overcoming Fear',
  prosperity: 'Success and Prosperity',
  prayer: 'Prayer and Answered Prayers',
  faithfulness: 'God’s Faithfulness',
  beginnings: 'New Beginnings',
  temptation: 'Victory Over Temptation',
  purpose: 'Purpose and Calling',
  family: 'Family and Relationships',
  miracles: 'Miracles and God’s Power',
  salvation: 'Eternal Life and Salvation'
};

const TOPIC_THEME = {
  promises: 'promise',
  gods_promises: 'promise',
  god_keeps_his_promises: 'promise',
  gods_promises_to_us: 'promise',
  faith_and_trust: 'faith',
  faith: 'faith',
  blessing: 'blessing',
  hope: 'hope',
  encouragement: 'hope',
  gods_love: 'love',
  finding_strength: 'strength',
  strength: 'strength',
  courage: 'strength',
  strength_and_courage: 'strength',
  peace: 'peace',
  healing_and_restoration: 'healing',
  protection: 'protection',
  god_protecting_us: 'protection',
  safety: 'protection',
  wisdom_and_guidance: 'wisdom',
  forgiveness_and_mercy: 'forgiveness',
  joy_and_happiness: 'joy',
  patience_and_perseverance: 'patience',
  gratitude_and_thanksgiving: 'gratitude',
  comfort_in_difficult_times: 'comfort',
  comfort: 'comfort',
  overcoming_fear: 'fear',
  success_and_prosperity: 'prosperity',
  prayer_and_answered_prayers: 'prayer',
  prayer: 'prayer',
  faithfulness: 'faithfulness',
  god_is_faithful: 'faithfulness',
  gods_faithfulness: 'faithfulness',
  new_beginnings: 'beginnings',
  victory_over_temptation: 'temptation',
  purpose_and_calling: 'purpose',
  purpose: 'purpose',
  calling: 'purpose',
  gods_plan: 'purpose',
  god_has_a_plan_for_you: 'purpose',
  spiritual_gifts: 'purpose',
  family_and_relationships: 'family',
  family: 'family',
  relationships: 'family',
  miracles_and_gods_power: 'miracles',
  eternal_life_and_salvation: 'salvation',
  /* Supplemental pages improve variety without changing the visible category. */
  perseverance: 'patience',
  endurance: 'patience',
  anxiety: 'peace',
  god_will_provide: 'prosperity',
  overcoming: 'fear',
  being_faithful: 'faithfulness',
  miracles: 'miracles',
  eternal_life: 'salvation',
  salvation: 'salvation',
  forgiveness: 'forgiveness',
  gratitude: 'gratitude',
  joy: 'joy',
  healing: 'healing',
  wisdom: 'wisdom',
  refuge: 'protection',
  god_as_our_shield: 'protection',
  god_is_our_strength: 'strength',
  being_strong: 'strength',
  strength_in_hard_times: 'strength',
  help: 'comfort'
};

const THEME_ORDER = Object.keys(THEME_LABELS);
const PRIMARY_TOPICS = {
  promise: ['promises', 'gods_promises', 'god_keeps_his_promises'],
  faith: ['faith_and_trust'],
  blessing: ['blessing'],
  hope: ['hope', 'encouragement'],
  love: ['gods_love'],
  strength: ['finding_strength', 'strength_and_courage'],
  peace: ['peace'],
  healing: ['healing_and_restoration'],
  protection: ['protection'],
  wisdom: ['wisdom_and_guidance'],
  forgiveness: ['forgiveness_and_mercy', 'forgiveness'],
  joy: ['joy_and_happiness'],
  patience: ['patience_and_perseverance'],
  gratitude: ['gratitude_and_thanksgiving', 'gratitude'],
  comfort: ['comfort_in_difficult_times', 'comfort'],
  fear: ['overcoming_fear'],
  prosperity: ['success_and_prosperity'],
  prayer: ['prayer_and_answered_prayers', 'prayer'],
  faithfulness: ['gods_faithfulness', 'god_is_faithful'],
  beginnings: ['new_beginnings'],
  temptation: ['victory_over_temptation'],
  purpose: ['purpose_and_calling', 'calling', 'gods_plan', 'god_has_a_plan_for_you', 'spiritual_gifts', 'purpose'],
  family: ['family_and_relationships', 'family', 'relationships'],
  miracles: ['miracles_and_gods_power'],
  salvation: ['eternal_life_and_salvation']
};
const EXCLUDED_REFERENCES = new Set([
  'Numbers 30:2', 'Romans 3:10-11', 'James 5:12',
  'Genesis 2:17', 'James 2:19',
  'Mark 11:2', 'John 5:2', 'Matthew 5:33', 'Psalm 141:3',
  'Matthew 10:34-36',
  'Proverbs 25:26', '1 Timothy 5:8', 'Deuteronomy 28:47-48',
  'Revelation 3:14-15', 'Matthew 7:21-23',
  'Psalm 69:22-23', 'Romans 12:19', 'Revelation 1:7', 'Matthew 18:15-17',
  'Revelation 12:14',
  '1 Peter 5:8', 'Hebrews 4:12', 'Luke 6:38', 'Acts 20:35-36',
  'Ecclesiastes 8:14', 'Ecclesiastes 9:2', 'Genesis 1:26', '1 John 5:19',
  'Hebrews 11:36-38', 'John 8:44', 'John 4:24', 'Judges 5:8',
  'Revelation 12:9', 'Genesis 7:7', 'Matthew 8:23',
  'Romans 13:4', 'Hebrews 12:29', 'Romans 1:18-19', 'Romans 13:1',
  'Romans 13:7', 'Philippians 2:10-11', 'Galatians 3:27',
  'Matthew 6:24', 'Isaiah 1:19-20', 'Genesis 9:3',
  '1 Timothy 2:8-10', 'Luke 18:1-2',
  '1 Timothy 6:10', '1 Corinthians 6:9-10',
  'Hebrews 6:4-6', 'Luke 16:13', 'Matthew 5:29-30', 'James 2:24',
  'Hebrews 12:14-16', 'Isaiah 30:15-16', 'Galatians 4:19-20',
  'Revelation 17:8', 'Hebrews 12:28-29', '2 John 1:9-11', 'Luke 12:40',
  'Leviticus 20:13', 'Leviticus 18:22', 'Hebrews 4:13', 'Proverbs 18:21',
  '2 Thessalonians 2:9-10', 'Matthew 4:1', 'Job 1:12',
  'Hebrews 5:9-11', '1 Corinthians 3:15',
  'Philippians 2:9-11', 'Ecclesiastes 12:14', 'Proverbs 22:7',
  'Ecclesiastes 9:11', 'Revelation 22:11', 'Revelation 21:27',
  'Acts 23:5-6'
]);

function dateRange(from, to) {
  const dates = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const last = new Date(to + 'T00:00:00Z');
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function normaliseBook(name) {
  return String(name).toLowerCase().replace(/^psalms$/, 'psalm');
}

function normaliseReference(value) {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/^Psalms\b/i, 'Psalm')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseReference(value) {
  const hit = normaliseReference(value).match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!hit) return null;
  return {
    book: hit[1].trim(),
    chapter: Number(hit[2]),
    from: Number(hit[3]),
    to: Number(hit[4] || hit[3])
  };
}

function formatReference(parts) {
  const range = parts.from === parts.to ? `${parts.from}` : `${parts.from}-${parts.to}`;
  return `${parts.book} ${parts.chapter}:${range}`;
}

function endsThought(text) {
  return /[.!?][”’"']?$/.test(String(text).trim());
}

function startsContinuation(text) {
  return /^[a-z]/.test(String(text).trim());
}

function buildExplanationIndex(entries) {
  const index = new Map();
  for (const [reference, line] of Object.entries(entries)) {
    const parsed = parseReference(reference);
    if (!parsed) continue;
    const key = `${normaliseBook(parsed.book)} ${parsed.chapter}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ from: parsed.from, to: parsed.to, line: String(line).trim() });
  }
  return index;
}

function explanationFor(parts, entries, index) {
  const exact = entries[formatReference(parts).toLowerCase()];
  if (exact) return String(exact).trim();

  const ranges = index.get(`${normaliseBook(parts.book)} ${parts.chapter}`) || [];
  const lines = [];
  for (let verse = parts.from; verse <= parts.to; verse += 1) {
    const hit = ranges.find((item) => verse >= item.from && verse <= item.to);
    if (!hit) throw new Error(`Missing explanation for ${parts.book} ${parts.chapter}:${verse}`);
    if (!lines.includes(hit.line)) lines.push(hit.line);
  }
  return lines.join(' ');
}

function resolvePassage(input, bible) {
  const parsed = parseReference(input);
  if (!parsed || parsed.to < parsed.from || parsed.to - parsed.from > 2) return null;

  const book = bible.get(normaliseBook(parsed.book));
  if (!book) return null;
  parsed.book = book.book;

  const verseAt = (verse) => book.verses[`${parsed.chapter}:${verse}`];
  if (!verseAt(parsed.from) || !verseAt(parsed.to)) return null;

  while (
    parsed.from > 1 &&
    parsed.to - parsed.from < 2 &&
    (startsContinuation(verseAt(parsed.from)) || !endsThought(verseAt(parsed.from - 1)))
  ) {
    parsed.from -= 1;
  }
  if (startsContinuation(verseAt(parsed.from)) || (parsed.from > 1 && !endsThought(verseAt(parsed.from - 1)))) return null;

  /* A topical source may cite only the first verse of a multi-verse sentence.
   * Extend through its punctuation boundary, but never exceed three verses. */
  while (!endsThought(verseAt(parsed.to)) && parsed.to - parsed.from < 2 && verseAt(parsed.to + 1)) {
    parsed.to += 1;
  }
  if (!endsThought(verseAt(parsed.to))) return null;

  return {
    ...parsed,
    reference: formatReference(parsed),
    text: Array.from({ length: parsed.to - parsed.from + 1 }, (_, index) =>
      String(verseAt(parsed.from + index)).replace(/\s+/g, ' ').trim()
    ).join(' ')
  };
}

function chooseCandidates(records, bible, explanations, explanationIndex, count) {
  const pools = Object.fromEntries(THEME_ORDER.map((theme) => [theme, []]));
  const poolSeen = Object.fromEntries(THEME_ORDER.map((theme) => [theme, new Set()]));

  for (const record of records) {
    const theme = TOPIC_THEME[record.topic];
    if (!theme) continue;
    if (EXCLUDED_REFERENCES.has(normaliseReference(record.reference))) continue;
    const passage = resolvePassage(record.reference, bible);
    if (!passage || EXCLUDED_REFERENCES.has(passage.reference) || poolSeen[theme].has(passage.reference)) continue;
    poolSeen[theme].add(passage.reference);
    pools[theme].push({
      reference: passage.reference,
      text: passage.text,
      version: 'NKJV',
      theme,
      themeLabel: THEME_LABELS[theme],
      note: '',
      simplify: explanationFor(passage, explanations, explanationIndex),
      scheduled: true,
      priority: (PRIMARY_TOPICS[theme] || []).indexOf(record.topic),
      rank: record.rank,
      source: record.source,
      verseIds: Array.from(
        { length: passage.to - passage.from + 1 },
        (_, index) => `${normaliseBook(passage.book)} ${passage.chapter}:${passage.from + index}`
      )
    });
  }

  for (const pool of Object.values(pools)) {
    pool.forEach((item) => { if (item.priority < 0) item.priority = 99; });
    pool.sort((a, b) => a.priority - b.priority || a.rank - b.rank || a.reference.localeCompare(b.reference));
  }

  const selected = [];
  const usedVerses = new Set();
  let turn = 0;
  while (selected.length < count) {
    const theme = THEME_ORDER[turn % THEME_ORDER.length];
    const pick = pools[theme].find((item) => item.verseIds.every((verse) => !usedVerses.has(verse)));
    if (!pick) throw new Error(`Not enough unique curated passages for ${theme} (${selected.length}/${count}).`);
    pick.verseIds.forEach((verse) => usedVerses.add(verse));
    selected.push(pick);
    turn += 1;
  }
  return { selected, pools };
}

const index = JSON.parse(await readFile(join(versionDir, 'index.json'), 'utf8'));
const topical = JSON.parse(await readFile(join(root, 'scripts', 'topical-references.json'), 'utf8'));
const explainData = JSON.parse(await readFile(join(dataDir, 'explain.json'), 'utf8'));
const explanations = explainData.entries || {};
const explanationIndex = buildExplanationIndex(explanations);
const dates = dateRange(startDate, endDate);
const bible = new Map();

for (const book of index) {
  const data = JSON.parse(await readFile(join(versionDir, `${book.slug}.json`), 'utf8'));
  bible.set(normaliseBook(data.book), data);
}

const { selected, pools } = chooseCandidates(topical.records || [], bible, explanations, explanationIndex, dates.length);
const schedule = dates.map((date, index) => {
  const { priority, rank, source, verseIds, ...passage } = selected[index];
  return { date, ...passage };
});

await writeFile(join(dataDir, 'schedule.json'), JSON.stringify(schedule, null, 2) + '\n');

const counts = Object.fromEntries(THEME_ORDER.map((theme) => [theme, schedule.filter((item) => item.theme === theme).length]));
const available = Object.fromEntries(THEME_ORDER.map((theme) => [theme, pools[theme].length]));
console.log(JSON.stringify({ dates: dates.length, selected: schedule.length, counts, available }, null, 2));
