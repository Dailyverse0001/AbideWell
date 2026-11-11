/* Abidewell — archive (Folio v2, the living sky).
   Scrolling the ledger retints the scene to each day's colour, so the
   months drift past in their own weather. */
import { loadMergedVerses } from './verse-data.js';

const CFG = window.ABIDEWELL;
const listEl = document.getElementById('archiveList');
const countEl = document.getElementById('archiveCount');
const sceneEl = document.getElementById('scene');

/* the same 7-colour day cycle the home screen uses */
const DAY_COLORS = [
  ['#3f6cf0', '#2a4fd0'],
  ['#f0566e', '#c73a52'],
  ['#f59f1e', '#d97d0a'],
  ['#1fa08e', '#127a6b'],
  ['#8a4fd0', '#6a33ac'],
  ['#3aa6d8', '#2384b4'],
  ['#4f9e3f', '#3a7d2e']
];
let scene = null;

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
    'data/verses.json?t=' + Date.now()
  ].filter(Boolean);

  let verses = (await loadMergedVerses(sources))
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date || '') && typeof v.text === 'string' && v.text.trim())
    .filter((v) => v.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  countEl.textContent = verses.length
    ? verses.length + (verses.length === 1 ? ' reading' : ' readings')
    : 'No readings yet';

  const sub = document.getElementById('archiveSub');
  if (sub) {
    sub.textContent = verses.length
      ? 'Newest reading · ' + longDate(verses[0].date)
      : 'The first reading is on its way.';
  }

  /* retint the sky to the newest day's colour */
  if (verses.length) queueRetint(verses[0]);

  if (!verses.length) {
    listEl.innerHTML = '<p class="empty">No verses yet. The first one is on its way.</p>';
    return;
  }

  /* build cards and month dividers in one pass */
  const parts = [];
  let currentMonth = '';
  let cardNo = 0;

  for (const verse of verses) {
    const month = monthKey(verse.date);
    if (month !== currentMonth) {
      currentMonth = month;
      parts.push('<p class="month-label" id="' + 'm' + currentMonth + '">' + escapeHtml(month) + '</p>');
    }

    cardNo += 1;
    const searchable = (verse.reference + ' ' + verse.text + ' ' + (verse.themeLabel || '')).toLowerCase();
    parts.push(
      '<article class="archive-item" tabindex="0" data-date="' + escapeHtml(verse.date) + '" ' +
        'data-search="' + escapeHtml(searchable) + '" style="--n:' + Math.min(cardNo, 14) + '">' +
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

  /* staggered reveal: cards fade/rise into view */
  const items = listEl.querySelectorAll('.archive-item');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -6% 0px' });
    items.forEach((item) => io.observe(item));
  } else {
    items.forEach((item) => item.classList.add('is-in'));
  }

  /* search: filter cards live */
  const search = document.getElementById('archiveSearch');
  const clear = document.getElementById('archiveClear');
  if (search) {
    if (clear) {
      clear.addEventListener('click', () => {
        search.value = '';
        clear.hidden = true;
        doFilter();
      });
    }

    search.addEventListener('input', () => {
      if (clear) clear.hidden = !search.value;
      doFilter();
    });
  }

  function doFilter() {
    const q = search ? search.value.trim().toLowerCase() : '';
    items.forEach((item) => {
      const hit = !q || (item.getAttribute('data-search') || '').includes(q);
      item.style.display = hit ? '' : 'none';
    });
    listEl.querySelectorAll('.month-label').forEach((label) => {
      let anyVisible = false;
      let sibling = label.nextElementSibling;
      while (sibling && !sibling.classList.contains('month-label')) {
        if (sibling.classList.contains('archive-item') && sibling.style.display !== 'none') {
          anyVisible = true;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      label.style.display = anyVisible ? '' : 'none';
    });
  }

  listEl.querySelectorAll('.archive-item').forEach((item) => {
    const toggle = () => item.classList.toggle('open');
    item.addEventListener('click', (e) => {
      if (e.target.closest('.archive-history')) return;
      toggle();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  attachHistory();
  watchScrollRetint();
}

async function loadHistoryList() {
  for (const path of ['/api/history', 'data/history.json']) {
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

function initScene() {
  if (!window.AbidewellScene || !sceneEl) return;
  scene = window.AbidewellScene.init(sceneEl, { dense: false, interactive: true });
  window.AbidewellScene.initChrome();
}

function retintSkyFor(verse) {
  if (!scene) return;
  const [hero, deep] = DAY_COLORS[dayOfYear(verse.date) % DAY_COLORS.length];
  scene.setColors(hero, deep, '#f5f3ee');
}

/* scroll-linked retinting: each reading drags the sky to its own day's colour.
   Throttled so fast scrolling doesn't queue dozens of sprite recolours. */
let retintQueued = null;

function queueRetint(verse) {
  if (retintQueued === verse.date) return;
  retintQueued = verse.date;
  requestAnimationFrame(() => {
    retintSkyFor(verse);
    retintQueued = null;
  });
}

/* scroll-linked retinting: each reading drags the sky to its own day's colour */
function watchScrollRetint() {
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        const date = item.getAttribute('data-date');
        if (!date) return;
        const fake = { date };
        queueRetint(fake);
        item.classList.add('is-lit');
        io.unobserve(item);
      });
    },
    { threshold: 0.4, rootMargin: '-20% 0px -35% 0px' }
  );

  listEl.querySelectorAll('.archive-item').forEach((item) => io.observe(item));
}

load();
initServiceWorker();
initScene();
