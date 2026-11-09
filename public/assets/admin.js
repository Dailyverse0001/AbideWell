/* Abidewell — posting screen */
const CFG = window.ABIDEWELL;
const $ = (sel) => document.querySelector(sel);

const TOKEN_KEY = 'abidewell.admin.v1';

const els = {
  loginView: $('#loginView'),
  editorView: $('#editorView'),
  loginForm: $('#loginForm'),
  password: $('#password'),
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

let token = '';
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
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 3000);
}

function setStatus(text, kind) {
  els.statusChip.textContent = text;
  els.statusChip.className = 'chip' + (kind ? ' ' + kind : '');
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

function forgetToken() {
  token = '';
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  showLogin();
  setStatus('Locked');
}

els.loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const entered = els.password.value.trim();
  if (!entered) return;

  token = entered;
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  els.password.value = '';
  showEditor();
  toast('Unlocked');
});

els.logoutBtn.addEventListener('click', () => {
  forgetToken();
  toast('Logged out');
});

/* ------------------------------------------------------------- api helper */

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
          Authorization: 'Bearer ' + token
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
      forgetToken();
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

/* ------------------------------------------------------------- auto fill */

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
    const url = 'https://bible-api.com/' + encodeURIComponent(reference) + '?translation=kjv';
    const res = await fetch(url);

    if (!res.ok) throw new Error('not found');

    const data = await res.json();
    const text = String(data.text || '').replace(/\s+/g, ' ').trim();

    if (!text) throw new Error('empty');

    els.text.value = text;
    els.reference.value = data.reference || reference;
    els.version.value = 'KJV';
    updatePreview();
    toast('Filled in KJV. Edit it to match your version.');
  } catch {
    toast('Could not find that. Type the verse by hand.');
  } finally {
    els.autoFillBtn.disabled = false;
    els.autoFillBtn.textContent = 'Auto-fill';
  }
});

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
    const result = await callApi({ action: 'save', verse });

    latestVerses = Array.isArray(result.verses) ? result.verses : [];
    renderList(latestVerses);

    setStatus('Live soon', 'live');
    els.postHint.textContent = 'Posted. The live site updates in about 30 seconds.';
    toast('Posted. Live in ~30s.');
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
        const result = await callApi({ action: 'delete', date });
        latestVerses = Array.isArray(result.verses) ? result.verses : [];
        renderList(latestVerses);
        toast('Deleted. Live in ~30s.');
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
    const res = await fetch('../data/verses.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      latestVerses = Array.isArray(data) ? data : [];
      renderList(latestVerses);
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

  try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch {}

  if (token) {
    showEditor();
  } else {
    showLogin();
    setStatus('Locked');
    els.password.focus();
  }
}

init();
