/* Abidewell — archive */
const CFG = window.ABIDEWELL;
const listEl = document.getElementById('archiveList');

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CFG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function applyTheme() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: CFG.timeZone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(new Date())
  );

  let theme = 'night';
  if (hour >= 5 && hour < 8) theme = 'dawn';
  else if (hour >= 8 && hour < 17) theme = 'day';
  else if (hour >= 17 && hour < 20) theme = 'dusk';

  document.body.classList.remove('theme-dawn', 'theme-day', 'theme-dusk', 'theme-night');
  document.body.classList.add('theme-' + theme);
}

function longDate(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso + 'T12:00:00'));
}

function monthKey(iso) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric'
  }).format(new Date(iso + 'T12:00:00'));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function load() {
  const today = todayISO();
  let verses = [];

  try {
    const res = await fetch('../data/verses.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) verses = data;
    }
  } catch {
    /* ignore */
  }

  verses = verses
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.text === 'string')
    .filter((v) => v.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (!verses.length) {
    listEl.innerHTML = '<p class="empty">No verses yet. The first one is on its way.</p>';
    return;
  }

  const parts = [];
  let currentMonth = '';

  for (const verse of verses) {
    const month = monthKey(verse.date);
    if (month !== currentMonth) {
      currentMonth = month;
      parts.push('<p class="month-label">' + escapeHtml(month) + '</p>');
    }

    parts.push(
      '<article class="archive-item" tabindex="0">' +
        '<div class="archive-top">' +
          '<span class="archive-ref">' + escapeHtml(verse.reference) + '</span>' +
          '<span class="archive-date">' + escapeHtml(longDate(verse.date)) + '</span>' +
        '</div>' +
        '<p class="archive-snippet">' + escapeHtml(verse.text) + '</p>' +
        '<p class="archive-full">' + escapeHtml(verse.text) + '</p>' +
      '</article>'
    );
  }

  listEl.innerHTML = parts.join('');

  listEl.querySelectorAll('.archive-item').forEach((item) => {
    const toggle = () => item.classList.toggle('open');
    item.addEventListener('click', toggle);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

applyTheme();
load();
initServiceWorker();
