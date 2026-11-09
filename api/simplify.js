/* Plain-language explanation of a verse.
 *
 * Uses whichever free model key is configured on the host:
 *   GEMINI_API_KEY      — Google AI Studio (free tier)
 *   GROQ_API_KEY        — Groq (free tier)
 *   OPENROUTER_API_KEY  — OpenRouter (free models)
 *
 * The key stays on the server. Nothing is exposed to the browser.
 */
const hits = new Map();
const LIMIT = 30;
const WINDOW = 60 * 60 * 1000;

function tooMany(ip) {
  const now = Date.now();
  const record = hits.get(ip) || { count: 0, start: now };

  if (now - record.start > WINDOW) {
    record.count = 0;
    record.start = now;
  }

  record.count += 1;
  hits.set(ip, record);
  return record.count > LIMIT;
}

function prompt(reference, version, text) {
  return (
    'You explain Bible verses to someone with no theological training.\n' +
    'Write 2 to 3 short sentences in plain, everyday English.\n' +
    'Say what the verse means and what it means for the reader today.\n' +
    'No jargon, no lists, no headings, no quotation marks, no repeating the verse word for word.\n\n' +
    'Verse: ' + reference + (version ? ' (' + version + ')' : '') + '\n' +
    'Text: ' + text + '\n\n' +
    'Explanation:'
  );
}

async function askGemini(key, text) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
      encodeURIComponent(key),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 300 }
      })
    }
  );

  if (!res.ok) throw new Error('gemini ' + res.status);

  const data = await res.json();
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content;
  return parts && parts.parts ? parts.parts.map((p) => p.text || '').join(' ').trim() : '';
}

async function askOpenAiStyle(url, key, model, text) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: text }],
      temperature: 0.5,
      max_tokens: 300
    })
  });

  if (!res.ok) throw new Error('model ' + res.status);

  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  return choice && choice.message ? String(choice.message.content || '').trim() : '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  if (tooMany(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const reference = String(body.reference || '').slice(0, 80).trim();
  const version = String(body.version || '').slice(0, 12).trim();
  const text = String(body.text || '').slice(0, 2000).trim();

  if (!reference || !text) {
    return res.status(400).json({ error: 'Need a reference and the verse text.' });
  }

  const gemini = process.env.GEMINI_API_KEY || '';
  const groq = process.env.GROQ_API_KEY || '';
  const openrouter = process.env.OPENROUTER_API_KEY || '';
  const customBase = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  const customKey = process.env.OPENAI_API_KEY || '';
  const customModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!gemini && !groq && !openrouter && !(customBase && customKey)) {
    return res.status(501).json({
      error: 'Automatic explanations are not switched on. Add GEMINI_API_KEY on the host.'
    });
  }

  const instruction = prompt(reference, version, text);

  try {
    let simplify = '';

    if (gemini) simplify = await askGemini(gemini, instruction);
    if (!simplify && groq) {
      simplify = await askOpenAiStyle(
        'https://api.groq.com/openai/v1/chat/completions',
        groq,
        'llama-3.3-70b-versatile',
        instruction
      );
    }
    if (!simplify && openrouter) {
      simplify = await askOpenAiStyle(
        'https://openrouter.ai/api/v1/chat/completions',
        openrouter,
        'meta-llama/llama-3.3-70b-instruct:free',
        instruction
      );
    }

    simplify = simplify.replace(/\s+/g, ' ').trim().slice(0, 800);

    if (!simplify) {
      return res.status(502).json({ error: 'The model returned nothing. Try again.' });
    }

    return res.status(200).json({ simplify });
  } catch (error) {
    const message = String((error && error.message) || 'Could not simplify.');
    return res.status(502).json({ error: 'Explanation failed (' + message + ').' });
  }
}
