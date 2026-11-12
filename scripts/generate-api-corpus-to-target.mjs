import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(import.meta.dirname, '..');
const apiKey = process.env.STARIMG_API_KEY;
if (!apiKey) throw new Error('STARIMG_API_KEY is not set.');
const baseUrl = (process.env.STARIMG_API_BASE || 'https://ai.starimg.ru/v1').replace(/\/$/, '');
const model = process.env.STARIMG_MODEL || 'glm-5.3-flash';
const concurrency = Math.max(1, Math.min(32, Number(process.env.STARIMG_CONCURRENCY || 12)));
const versesPerRequest = Math.max(1, Math.min(12, Number(process.env.STARIMG_VERSES_PER_REQUEST || 8)));
const requestTimeoutMs = Math.max(10000, Number(process.env.STARIMG_REQUEST_TIMEOUT_MS || 90000));
const target = Math.max(1, Number(process.env.DEVOTIONAL_TARGET || 15000));
const checkpointPath = join(root, 'public/data/devotional-checkpoint.json');
const bibleIndex = JSON.parse(await readFile(join(root, 'public/data/versions/nkjv/index.json'), 'utf8'));
const allEntries = [];
for (const book of bibleIndex) {
  const data = JSON.parse(await readFile(join(root, `public/data/versions/nkjv/${book.slug}.json`), 'utf8'));
  for (const [key, verse] of Object.entries(data.verses || {})) {
    const [chapter, number] = key.split(':');
    allEntries.push({ reference: `${data.book} ${chapter}:${number}`, verse: String(verse) });
  }
}
const referenceOrder = new Map(allEntries.map(({ reference }, index) => [reference, index]));
const validReferences = new Set(referenceOrder.keys());

const reasoningEffort = process.env.STARIMG_REASONING_EFFORT || 'low';

const system = [
  'You are a devotional writer for a broad Christian audience. Output the JSON answer immediately and do not deliberate or verify word counts.',
  'Write biblically grounded content in warm, plain English using only each supplied NKJV verse as its specific passage.',
  'Return {"readings":[...]} with exactly one object per supplied verse, in the same order. Each object has exactly the string fields reference, devotion, reflection, action, prayer. Copy each supplied reference exactly and never quote verse text.',
  'devotion: 45-70 words explaining that specific passage in context. reflection: one concise personal question ending in ?. action: one concrete feasible action for today in 15-30 words. prayer: 25-45 words.',
  'Do not invent historical facts or promise outcomes the verse does not promise. Treat violence, illness, trauma, and oppression carefully: do not blame victims, endorse violence, or stigmatize illness. Distinguish ancient narrative from ethical guidance today.'
].join(' ');

async function generateBatch(items) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(requestTimeoutMs),
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 500 * items.length + 1000,
          reasoning_effort: reasoningEffort,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify({ translation: 'NKJV', verses: items.map(({ reference, verse }) => ({ reference, verse })) }) }
          ]
        })
      });
      const payload = await response.json();
      if (response.status === 429) {
        lastError = new Error(`HTTP 429: ${payload.error?.message || 'rate limited'}`);
        const retryAfter = Number(response.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(120000, retryAfter * 1000)
          : Math.min(30000, 2000 * (attempt + 1));
        await delay(waitMs);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${payload.error?.message || 'request failed'}`);
      const raw = payload.choices?.[0]?.message?.content;
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error(`empty content (finish=${payload.choices?.[0]?.finish_reason}, reasoning=${payload.usage?.completion_tokens_details?.reasoning_tokens ?? 'n/a'})`);
      }
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const value = typeof cleaned === 'string' ? JSON.parse(cleaned) : cleaned;
      if (!Array.isArray(value?.readings) || value.readings.length !== items.length) throw new Error(`expected ${items.length} readings`);
      const byReference = new Map(value.readings.map((reading) => [reading.reference, reading]));
      return items.map(({ reference }) => {
        const reading = byReference.get(reference);
        if (!reading) throw new Error(`missing ${reference}`);
        for (const field of ['devotion', 'reflection', 'action', 'prayer']) {
          if (typeof reading[field] !== 'string' || !reading[field].trim()) throw new Error(`${reference}: missing ${field}`);
        }
        const result = Object.fromEntries(['devotion', 'reflection', 'action', 'prayer'].map((field) => [field, reading[field].trim()]));
        if (!result.reflection.endsWith('?')) throw new Error(`${reference}: reflection does not end with ?`);
        if (result.devotion.length > 2000 || result.reflection.length > 500 || result.action.length > 800 || result.prayer.length > 2000) throw new Error(`${reference}: field exceeds length limit`);
        return [reference, { ...result, _generatedBy: model }];
      });
    } catch (error) {
      lastError = error;
      if (attempt < 9) await delay(Math.min(15000, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`${items.map((item) => item.reference).join(', ')}: ${lastError?.message || 'generation failed'}`);
}

async function generateWithFallback(items) {
  try {
    return await generateBatch(items);
  } catch (error) {
    if (items.length === 1) throw error;
    const mid = Math.ceil(items.length / 2);
    const out = [];
    out.push(...await generateWithFallback(items.slice(0, mid)));
    out.push(...await generateWithFallback(items.slice(mid)));
    return out;
  }
}

let totalAdded = 0;
const started = Date.now();
let consecutiveFailures = 0;
const maxMinutes = Number(process.env.DEVOTIONAL_MAX_MINUTES || 0);

while (true) {
  if (maxMinutes > 0 && Date.now() - started >= maxMinutes * 60000) {
    console.log(JSON.stringify({ status: 'time-budget-reached', totalAdded, maxMinutes, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
    break;
  }
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const completedCount = Object.keys(checkpoint).filter((reference) => validReferences.has(reference)).length;
  if (completedCount >= target) {
    console.log(JSON.stringify({ status: 'target-reached', completedCount, target, totalAdded, model, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
    break;
  }
  const pending = allEntries.filter(({ reference }) => !checkpoint[reference]).slice(0, Math.min(48, target - completedCount));
  if (!pending.length) throw new Error('No pending canonical entries found before reaching target.');
  let nextIndex = 0;
  let batchAdded = 0;
  const failures = [];
  let saveQueue = Promise.resolve();

  async function saveProgress() {
    saveQueue = saveQueue.then(async () => {
      const current = JSON.parse(await readFile(checkpointPath, 'utf8'));
      for (const item of pending) if (checkpoint[item.reference]) current[item.reference] = checkpoint[item.reference];
      const ordered = Object.fromEntries(Object.keys(current).sort((a, b) => (referenceOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (referenceOrder.get(b) ?? Number.MAX_SAFE_INTEGER)).map((reference) => [reference, current[reference]]));
      const temp = `${checkpointPath}.api-progress.tmp`;
      await writeFile(temp, JSON.stringify(ordered));
      await rename(temp, checkpointPath);
    });
    await saveQueue;
  }

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= pending.length) return;
      const items = pending.slice(index, index + versesPerRequest);
      nextIndex = index + items.length;
      try {
        console.log(JSON.stringify({ requestStarted: items[0].reference, through: items.at(-1).reference, model }));
        const content = await generateWithFallback(items);
        for (const [reference, reading] of content) checkpoint[reference] = reading;
        batchAdded += content.length;
        totalAdded += content.length;
        consecutiveFailures = 0;
        await saveProgress();
        if (batchAdded % 12 === 0 || batchAdded === pending.length) {
          console.log(JSON.stringify({ completed: completedCount + batchAdded, target, batchAdded, pending: pending.length, model, concurrency, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
        }
      } catch (error) {
        failures.push(error.message);
      }
    }
  }

  const requestCount = Math.ceil(pending.length / versesPerRequest);
  await Promise.all(Array.from({ length: Math.min(concurrency, requestCount) }, worker));
  const current = JSON.parse(await readFile(checkpointPath, 'utf8'));
  const nowCompleted = Object.keys(current).filter((reference) => validReferences.has(reference)).length;
  console.log(JSON.stringify({ batchFinished: true, savedThisBatch: nowCompleted - completedCount, failures: failures.length, completedCount: nowCompleted, target, model, concurrency, versesPerRequest, elapsedSeconds: Math.round((Date.now() - started) / 1000) }));
  if (failures.length) {
    console.error(failures.slice(0, 5).join('\n'));
    consecutiveFailures++;
    if (consecutiveFailures >= 3) throw new Error('Three batches had generation failures; stopping to avoid a retry loop.');
    await delay(5000);
  }
}
