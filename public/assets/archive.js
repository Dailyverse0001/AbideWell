/* Abidewell — archive */
import { loadMergedVerses } from './verse-data.js';

const CFG = window.ABIDEWELL;
const listEl = document.getElementById('archiveList');
const countEl = document.getElementById('archiveCount');

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CFG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function dayOfYear(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1;
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
  const sources = [
    CFG.data ? CFG.data + '?t=' + Date.now() : null,
    '../data/verses.json?t=' + Date.now()
  ].filter(Boolean);

  let verses = (await loadMergedVerses(sources))
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.text === 'string')
    .filter((v) => v.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  countEl.textContent = verses.length
    ? verses.length + (verses.length === 1 ? ' reading' : ' readings')
    : 'No readings yet';

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
      '<article class="archive-item" tabindex="0" data-date="' + escapeHtml(verse.date) + '">' +
        '<div class="archive-top">' +
          '<span class="archive-no">' + String(dayOfYear(verse.date)).padStart(3, '0') + '</span>' +
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

  attachHistory();
}

async function loadHistoryList() {
  for (const path of ['/api/history', '../data/history.json', 'data/history.json']) {
    try {
      const res = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {}
  }

  return [];
}

function attachHistory() {
  loadHistoryList().then((records) => {
    if (!records.length) return;

    const byDate = new Map();

    for (const record of records) {
      if (!record || !record.date) continue;
      if (!byDate.has(record.date)) byDate.set(record.date, []);
      byDate.get(record.date).push(record);
    }

    listEl.querySelectorAll('.archive-item').forEach((item) => {
      const date = item.getAttribute('data-date');
      const list = byDate.get(date);
      if (!list || !list.length) return;

      const details = document.createElement('details');
      details.className = 'archive-history';

      const rows = list
        .slice()
        .reverse()
        .map((record) => {
          const verse = record.verse || {};
          const when = new Date(record.at).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          });
          const label = (verse.reference || '') + (record.action === 'delete' ? ' — deleted' : '');
          return (
            '<div class="history-row">' +
              '<span class="history-when">' + escapeHtml(when) + '</span>' +
              '<span class="history-ref">' + escapeHtml(label) + '</span>' +
            '</div>'
          );
        })
        .join('');

      details.innerHTML =
        '<summary>' + list.length + (list.length === 1 ? ' saved version' : ' saved versions') + '</summary>' +
        rows;

      details.addEventListener('click', (event) => event.stopPropagation());
      item.appendChild(details);
    });
  });
}

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

load();
initServiceWorker();
