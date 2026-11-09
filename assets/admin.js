/* Abidewell — posting screen
 *
 * Two ways to post:
 *  1. Direct to GitHub  — used on GitHub Pages. The GitHub token is encrypted
 *     with the passphrase and kept only in this phone's storage.
 *  2. Through a server  — used on Vercel/Netlify, where ADMIN_PASSWORD is
 *     checked server-side and the token never touches the browser.
 */
const CFG = window.ABIDEWELL;
const $ = (sel) => document.querySelector(sel);

const VAULT_KEY = 'abidewell.vault.v1';

const GH = CFG.github || {
  owner: 'Dailyverse0001',
  repo: 'AbideWell',
  branch: 'main',
  path: 'public/data/verses.json'
};

const DIRECT =
  CFG.direct === true ||
  /\.github\.io$/i.test(location.hostname) ||
  new URLSearchParams(location.search).has('direct');

const API =
  'https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.path;

const els = {
  loginView: $('#loginView'),
  editorView: $('#editorView'),
  loginForm: $('#loginForm'),
  password: $('#password'),
  loginLede: $('#loginLede'),
  loginHint: $('#loginHint'),
  setupBox: $('#setupBox'),
  setupToken: $('#setupToken'),
  connectBtn: $('#connectBtn'),
  logoutBtn: $('#logoutBtn'),
  date: $('#date'),
  reference: $('#reference'),
  version: $('#version'),
  text: $('#text'),
  note: $('#note'),
  simplify: $('#simplify'),
  autoFillBtn: $('#autoFillBtn'),
  postBtn: $('#postBtn'),
  clearBtn: $('#clearBtn'),
  refreshBtn: $('#refreshBtn'),
  statusChip: $('#statusChip'),
  postHint: $('#postHint'),
  verseList: $('#verseList'),
  pvMeta: $('#pvMeta'),
  pvText: $('#pvText'),
  pvRef: $('#pvRef'),
  toast: $('#toast')
};

let secret = ''; // the token, held in memory only while unlocked
let latestVerses = [];

/* ------------------------------------------------------------------ dates */

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CFG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function prettyDate(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso + 'T12:00:00'));
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 3200);
}

function setStatus(text, kind) {
  els.statusChip.textContent = text;
  els.statusChip.className = 'chip' + (kind ? ' ' + kind : '');
}

/* ------------------------------------------------------ encryption helpers */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* Turns the token into a blob only this passphrase can open. */
async function lockSecret(token, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const box = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));

  return { v: 1, salt: toBase64(salt), iv: toBase64(iv), box: toBase64(box) };
}

/* Throws if the passphrase is wrong. */
async function unlockSecret(vault, password) {
  const key = await deriveKey(password, fromBase64(vault.salt));
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(vault.iv) },
    key,
    fromBase64(vault.box)
  );
  return decoder.decode(plain);
}

function readVault() {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeVault(vault) {
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch {}
}

/* ------------------------------------------------------------ github calls */

function ghHeaders() {
  return {
    Authorization: 'Bearer ' + secret,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

function githubError(status) {
  if (status === 401) return 'That passphrase is not right.';
  if (status === 403) return 'GitHub refused the key. Check Contents permission.';
  if (status === 404) return 'Repository or file not found.';
  if (status === 409) return 'Another change landed at the same time. Try again.';
  if (status === 422) return 'GitHub rejected the change. Try again.';
  return 'GitHub said ' + status + '.';
}

async function readFile() {
  const res = await fetch(
    API + '?ref=' + encodeURIComponent(GH.branch) + '&t=' + Date.now(),
    { headers: ghHeaders(), cache: 'no-store' }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(githubError(res.status));

  const data = await res.json();
  const text = decoder.decode(fromBase64(String(data.content || '').replace(/\s/g, '')));

  return { sha: data.sha, text };
}

function parseList(text) {
  try {
    const data = JSON.parse(text || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function sortNewestFirst(list) {
  return list
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function toBase64Utf8(text) {
  return toBase64(encoder.encode(text));
}

async function writeFile(text, sha, message) {
  const body = {
    message,
    content: toBase64Utf8(text),
    branch: GH.branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(API, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(githubError(res.status));
  return res.json();
}

async function directSave(verse) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const file = await readFile();
    const list = parseList(file && file.text);
    const kept = list.filter((v) => v && v.date !== verse.date);
    const next = sortNewestFirst([{ ...verse, postedAt: new Date().toISOString() }, ...kept]);

    try {
      await writeFile(JSON.stringify(next, null, 2) + '\n', file && file.sha, 'verse: ' + verse.reference);
      return { verses: next };
    } catch (error) {
      if (error.message.startsWith('Another change') && attempt === 0) continue;
      throw error;
    }
  }

  throw new Error('Could not save. Try again.');
}

async function directDelete(date) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const file = await readFile();
    const list = parseList(file && file.text);
    const next = sortNewestFirst(list.filter((v) => v && v.date !== date));

    try {
      await writeFile(JSON.stringify(next, null, 2) + '\n', file && file.sha, 'verse: remove ' + date);
      return { verses: next };
    } catch (error) {
      if (error.message.startsWith('Another change') && attempt === 0) continue;
      throw error;
    }
  }

  throw new Error('Could not delete. Try again.');
}

/* ------------------------------------------------------------- server path */

async function callApi(payload) {
  let sawResponse = false;
  let lastJson = null;

  for (const path of CFG.api) {
    let res;

    try {
      res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + secret
        },
        body: JSON.stringify(payload)
      });
    } catch {
      continue;
    }

    sawResponse = true;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) continue;

    let data = null;
    try { data = await res.json(); } catch {}
    lastJson = data;

    if (res.status === 401) {
      forgetPhone();
      throw new Error('That passphrase is not right.');
    }

    if (!res.ok) {
      throw new Error((data && data.error) || 'The server could not save that.');
    }

    return data || { ok: true };
  }

  if (!sawResponse) {
    throw new Error('Could not reach the server. Check your connection.');
  }

  throw new Error(
    (lastJson && lastJson.error) ||
    'No write endpoint found. Make sure the function is deployed on this host.'
  );
}

/* ------------------------------------------------------------------- auth */

function showEditor() {
  els.loginView.hidden = true;
  els.editorView.hidden = false;
  els.logoutBtn.hidden = false;
  setStatus('Ready');
  loadList();
}

function showLogin() {
  els.loginView.hidden = false;
  els.editorView.hidden = true;
  els.logoutBtn.hidden = true;
}

function forgetPhone() {
  secret = '';
  try { localStorage.removeItem(VAULT_KEY); } catch {}
  showLogin();
  setStatus('Locked');
}

async function testToken(value) {
  const res = await fetch(API + '?ref=' + encodeURIComponent(GH.branch), {
    headers: {
      Authorization: 'Bearer ' + value,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    cache: 'no-store'
  });

  if (res.status === 401) throw new Error('GitHub rejected that token.');
  if (res.status === 403) throw new Error('That token cannot reach this repository.');
  if (res.status === 404) throw new Error('That token cannot see this repository.');
  if (!res.ok) throw new Error(githubError(res.status));
}

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const passphrase = els.password.value;
  if (!passphrase) return;

  if (!DIRECT) {
    secret = passphrase;
    els.password.value = '';
    showEditor();
    toast('Unlocked');
    return;
  }

  const vault = readVault();
  if (!vault) {
    toast('Connect this phone first, below.');
    els.setupBox.open = true;
    return;
  }

  els.password.disabled = true;

  try {
    const token = await unlockSecret(vault, passphrase);
    await testToken(token);
    secret = token;
    els.password.value = '';
    showEditor();
    toast('Unlocked');
  } catch {
    toast('That passphrase is not right.');
    els.password.select();
  } finally {
    els.password.disabled = false;
  }
});

els.connectBtn.addEventListener('click', async () => {
  const passphrase = els.password.value;
  const token = els.setupToken.value.trim();

  if (!passphrase) {
    toast('Type the passphrase first.');
    els.password.focus();
    return;
  }
  if (!token) {
    toast('Paste the token.');
    els.setupToken.focus();
    return;
  }
  if (!(window.crypto && window.crypto.subtle)) {
    toast('This browser cannot store the key. Use Chrome.');
    return;
  }

  els.connectBtn.disabled = true;
  els.connectBtn.textContent = 'Checking…';

  try {
    await testToken(token);
    writeVault(await lockSecret(token, passphrase));
    els.setupToken.value = '';
    els.setupBox.open = false;
    toast('This phone is connected. Now tap Unlock.');
  } catch (error) {
    toast(error.message || 'Could not connect.');
  } finally {
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = 'Connect this phone';
  }
});

els.logoutBtn.addEventListener('click', () => {
  if (!window.confirm('Forget the saved key on this phone? You will need the token again.')) return;
  forgetPhone();
  toast('This phone was forgotten');
});

/* ------------------------------------------------------------------ form */

function currentVerse() {
  return {
    date: els.date.value,
    reference: els.reference.value.trim(),
    version: els.version.value,
    text: els.text.value.trim(),
    note: els.note.value.trim(),
    simplify: els.simplify.value.trim()
  };
}

function updatePreview() {
  const verse = currentVerse();
  const today = todayISO();

  let label = 'Draft';
  if (/^\d{4}-\d{2}-\d{2}$/.test(verse.date)) {
    label = verse.date === today ? 'Today' : prettyDate(verse.date);
  }

  els.pvMeta.textContent = label;
  els.pvText.textContent = verse.text || 'Your verse will appear here.';
  els.pvRef.textContent = verse.reference
    ? verse.reference + (verse.version ? '  ·  ' + verse.version : '')
    : '';
}

['input', 'change'].forEach((eventName) => {
  [els.date, els.reference, els.version, els.text, els.note, els.simplify].forEach((field) => {
    field.addEventListener(eventName, updatePreview);
  });
});

function resetForm() {
  els.date.value = todayISO();
  els.reference.value = '';
  els.text.value = '';
  els.note.value = '';
  els.simplify.value = '';
  els.version.value = 'NKJV';
  updatePreview();
  setStatus('Draft');
}

els.clearBtn.addEventListener('click', () => {
  resetForm();
  els.reference.focus();
});

/* --------------------------------------------------------------- auto fill */

async function lookup(reference) {
  const tried = [];

  for (const translation of ['kjv', 'web']) {
    const res = await fetch(
      'https://bible-api.com/' + encodeURIComponent(reference) + '?translation=' + translation
    ).catch(() => null);

    if (res && res.ok) {
      const data = await res.json();
      if (data && String(data.text || '').trim()) {
        return { ...data, translation };
      }
    }
    tried.push(translation);
  }

  throw new Error('not found');
}

els.autoFillBtn.addEventListener('click', async () => {
  const reference = els.reference.value.trim();

  if (!reference) {
    toast('Type a reference first, like John 3:16');
    els.reference.focus();
    return;
  }

  els.autoFillBtn.disabled = true;
  els.autoFillBtn.textContent = 'Looking…';

  try {
    const data = await lookup(reference);
    const text = String(data.text || '').replace(/\s+/g, ' ').trim();

    if (!text) throw new Error('empty');

    els.text.value = text;
    els.reference.value = data.reference || reference;
    els.version.value = data.translation === 'web' ? 'WEB' : 'KJV';
    updatePreview();
    toast('Filled in ' + (data.translation === 'web' ? 'WEB' : 'KJV') + '. Writing the explanation…');

    await fillExplanation();
  } catch {
    toast('Could not find that. Type the verse by hand.');
  } finally {
    els.autoFillBtn.disabled = false;
    els.autoFillBtn.textContent = 'Auto-fill';
  }
});

/* ------------------------------------------------------- explanation library */

let EXPLAIN = null;

function normaliseRef(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\./g, ':')
    .replace(/\s+/g, ' ')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*-\s*/g, '-')
    .replace(/^psalms\b/, 'psalm')
    .trim();
}

function parseRef(value) {
  const hit = normaliseRef(value).match(/^(.+?)\s*(\d+):(\d+)(?:-(\d+))?$/);
  if (!hit) return null;
  return {
    book: hit[1].trim(),
    chapter: Number(hit[2]),
    from: Number(hit[3]),
    to: Number(hit[4] || hit[3])
  };
}

async function loadExplain() {
  if (EXPLAIN) return EXPLAIN;

  for (const path of ['../data/explain.json', 'data/explain.json']) {
    try {
      const res = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      EXPLAIN = data && data.entries ? data.entries : {};
      return EXPLAIN;
    } catch {}
  }

  EXPLAIN = {};
  return EXPLAIN;
}

function findExplanation(entries, reference) {
  if (!entries) return '';

  const key = normaliseRef(reference);
  if (entries[key]) return entries[key];

  const want = parseRef(reference);
  if (!want) return '';

  for (const [stored, line] of Object.entries(entries)) {
    const range = parseRef(stored);
    if (!range) continue;
    if (range.book !== want.book) continue;
    if (range.chapter !== want.chapter) continue;
    if (want.from >= range.from && want.from <= range.to) return line;
  }

  return '';
}

const SIMPLE_CACHE = new Map();

function bookSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitReference(reference) {
  const hit = normaliseRef(reference).match(/^(.+?)\s*(\d+):(\d+)/);
  if (!hit) return null;
  return { book: hit[1].trim(), chapter: Number(hit[2]), verse: Number(hit[3]) };
}

async function simpleFromLibrary(reference) {
  const parts = splitReference(reference);
  if (!parts) return '';

  const book = parts.book
    .replace(/^psalm$/, 'psalms')
    .replace(/^song of songs$/, 'song of solomon');

  const slug = bookSlug(book);
  let data = SIMPLE_CACHE.get(slug);

  if (data === undefined) {
    data = null;

    for (const path of ['../data/simple/', 'data/simple/']) {
      try {
        const res = await fetch(path + slug + '.json', { cache: 'no-store' });
        if (!res.ok) continue;
        data = await res.json();
        break;
      } catch {}
    }

    SIMPLE_CACHE.set(slug, data);
  }

  if (!data || !data.verses) return '';
  return data.verses[parts.chapter + ':' + parts.verse] || '';
}

async function simpleWording(reference) {
  const res = await fetch(
    'https://bible-api.com/' + encodeURIComponent(reference) + '?translation=bbe'
  ).catch(() => null);

  if (!res || !res.ok) return '';

  const data = await res.json().catch(() => null);
  return String((data && data.text) || '').replace(/\s+/g, ' ').trim();
}

async function fillExplanation() {
  const reference = els.reference.value.trim();
  const text = els.text.value.trim();
  const version = els.version.value;

  if (!reference || !text) return false;

  const known = findExplanation(await loadExplain(), reference);

  if (known) {
    els.simplify.value = known;
    updatePreview();
    toast('Verse and explanation filled in.');
    return true;
  }

  const placeholder = els.simplify.placeholder;
  els.simplify.value = '';
  els.simplify.placeholder = 'Writing a simple explanation…';

  let filled = false;

  try {
    const res = await fetch('/api/simplify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, version, text })
    });

    const data = await res.json().catch(() => null);

    if (res.ok && data && data.simplify) {
      els.simplify.value = data.simplify;
      filled = true;
    }
  } catch {}

  if (!filled) {
    let simple = await simpleFromLibrary(reference);
    if (!simple) simple = await simpleWording(reference);

    if (simple) {
      els.simplify.value = simple;
      filled = true;
      toast('Filled in with simple-English wording.');
    }
  }

  els.simplify.placeholder = placeholder;

  if (!filled) {
    toast('Verse filled in. Add an explanation if you want one.');
    return false;
  }

  updatePreview();
  return true;
}

/* ------------------------------------------------------------------- post */

els.postBtn.addEventListener('click', async () => {
  const verse = currentVerse();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(verse.date)) {
    toast('Pick a date.');
    return;
  }
  if (!verse.reference) {
    toast('Add a reference.');
    els.reference.focus();
    return;
  }
  if (!verse.text) {
    toast('Add the verse text.');
    els.text.focus();
    return;
  }

  els.postBtn.disabled = true;
  els.postBtn.textContent = 'Posting…';
  setStatus('Posting');

  try {
    const result = DIRECT
      ? await directSave(verse)
      : await callApi({ action: 'save', verse });

    latestVerses = Array.isArray(result.verses) ? result.verses : [];
    renderList(latestVerses);

    setStatus('Live soon', 'live');
    els.postHint.textContent = DIRECT
      ? 'Saved to GitHub. The site picks it up within a minute.'
      : 'Posted. The live site updates in about 30 seconds.';
    toast('Posted.');
    els.postBtn.textContent = 'Posted';
    window.setTimeout(() => {
      els.postBtn.textContent = 'Post verse';
    }, 2200);
  } catch (error) {
    setStatus('Error', 'error');
    toast(error.message || 'Could not post.');
  } finally {
    els.postBtn.disabled = false;
  }
});

/* ------------------------------------------------------------------- list */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderList(verses) {
  const sorted = verses
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 40);

  if (!sorted.length) {
    els.verseList.innerHTML = '<p class="empty">No verses yet.</p>';
    return;
  }

  els.verseList.innerHTML = sorted
    .map(
      (v) =>
        '<div class="list-row">' +
          '<div class="list-main">' +
            '<div class="list-date">' + escapeHtml(prettyDate(v.date)) + '</div>' +
            '<div class="list-ref">' + escapeHtml(v.reference) + '</div>' +
          '</div>' +
          '<button class="icon-btn" data-edit="' + escapeHtml(v.date) + '" type="button">Edit</button>' +
          '<button class="icon-btn danger" data-delete="' + escapeHtml(v.date) + '" type="button">Delete</button>' +
        '</div>'
    )
    .join('');

  els.verseList.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const date = btn.getAttribute('data-edit');
      const verse = latestVerses.find((v) => v.date === date);
      if (!verse) return;

      els.date.value = verse.date;
      els.reference.value = verse.reference || '';
      els.version.value = verse.version || 'NKJV';
      els.text.value = verse.text || '';
      els.note.value = verse.note || '';
      els.simplify.value = verse.simplify || '';
      updatePreview();
      setStatus('Editing');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  els.verseList.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const date = btn.getAttribute('data-delete');
      const verse = latestVerses.find((v) => v.date === date);
      const label = verse ? verse.reference : date;

      if (!window.confirm('Delete "' + label + '" for ' + date + '?')) return;

      btn.disabled = true;
      btn.textContent = '…';

      try {
        const result = DIRECT
          ? await directDelete(date)
          : await callApi({ action: 'delete', date });

        latestVerses = Array.isArray(result.verses) ? result.verses : [];
        renderList(latestVerses);
        toast('Deleted.');
      } catch (error) {
        toast(error.message || 'Could not delete.');
        btn.disabled = false;
        btn.textContent = 'Delete';
      }
    });
  });
}

async function loadList() {
  try {
    if (DIRECT && secret) {
      const file = await readFile();
      latestVerses = sortNewestFirst(parseList(file && file.text));
      renderList(latestVerses);
      return;
    }

    const sources = [
      CFG.data ? CFG.data + '?t=' + Date.now() : null,
      'https://raw.githubusercontent.com/Dailyverse0001/AbideWell/main/public/data/verses.json?t=' + Date.now()
    ].filter(Boolean);

    for (const source of sources) {
      const res = await fetch(source, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) {
        latestVerses = data;
        renderList(latestVerses);
        return;
      }
    }
  } catch {
    els.verseList.innerHTML = '<p class="empty">Could not load the list.</p>';
  }
}

els.refreshBtn.addEventListener('click', () => {
  loadList();
  toast('Refreshed');
});

/* ------------------------------------------------------------------- init */

function init() {
  els.date.value = todayISO();
  updatePreview();

  if (DIRECT) {
    els.setupBox.hidden = false;
    els.loginLede.textContent = 'The passphrase unlocks the GitHub key saved on this phone.';
    els.loginHint.textContent =
      'The key is scrambled with your passphrase and never leaves this phone.';

    if (!readVault()) {
      els.setupBox.open = true;
      els.loginHint.textContent = 'This phone is not connected yet. Open “First time on this phone”.';
    }
  } else {
    els.loginLede.textContent = 'Enter your passphrase once. This phone will remember it.';
    els.loginHint.textContent = 'This is the passphrase you set as ADMIN_PASSWORD when you deployed.';
  }

  showLogin();
  setStatus('Locked');
  els.password.focus();
}

init();
