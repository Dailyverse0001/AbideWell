/* Abidewell — today's verse */
const CFG = window.ABIDEWELL;
const $ = (sel) => document.querySelector(sel);

const els = {
  body: document.body,
  card: $('#verseCard'),
  seal: $('#seal'),
  meta: $('#verseMeta'),
  text: $('#verseText'),
  ref: $('#verseRef'),
  version: $('#verseVersion'),
  note: $('#verseNote'),
  streak: $('#streak'),
  streakCount: $('#streakCount'),
  swipeHint: $('#swipeHint'),
  amenBtn: $('#amenBtn'),
  shareBtn: $('#shareBtn'),
  toast: $('#toast')
};

const STREAK_KEY = 'abidewell.streak.v1';
const AMEN_KEY = 'abidewell.amen.v1';
const state = { verses: [], index: 0, today: '', revealed: false };

/* ------------------------------------------------------------------ dates */

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CFG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function daysBetween(fromISO, toISO) {
  const [ay, am, ad] = fromISO.split('-').map(Number);
  const [by, bm, bd] = toISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function labelForDate(iso) {
  if (iso === state.today) return 'Today';
  const diff = daysBetween(iso, state.today);
  if (diff === 1) return 'Yesterday';
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(d);
}

/* ------------------------------------------------------------------ theme */

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

  els.body.classList.remove('theme-dawn', 'theme-day', 'theme-dusk', 'theme-night');
  els.body.classList.add('theme-' + theme);

  const colors = { dawn: '#f9e7d4', day: '#eaf6ff', dusk: '#54325f', night: '#12132b' };
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors[theme]);
}

/* ------------------------------------------------------------------- data */

async function loadVerses() {
  try {
    const res = await fetch('data/verses.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function usable(verses) {
  return verses
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.text === 'string')
    .filter((v) => v.date <= state.today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------------------------------------------------------------- rendering */

function render() {
  const verse = state.verses[state.index];

  if (!verse) {
    els.meta.textContent = 'Welcome';
    els.text.textContent = CFG.fallbackVerse.text;
    els.ref.textContent = CFG.fallbackVerse.reference;
    els.version.textContent = CFG.fallbackVerse.version;
    setNote(CFG.fallbackVerse.note);
    reveal(true);
    return;
  }

  els.meta.textContent = labelForDate(verse.date);
  els.text.textContent = verse.text;
  els.ref.textContent = verse.reference;
  els.version.textContent = verse.version || '';
  setNote(verse.note);

  els.swipeHint.hidden = state.verses.length < 2;
}

function setNote(note) {
  if (note && String(note).trim()) {
    els.note.textContent = String(note).trim();
    els.note.hidden = false;
  } else {
    els.note.textContent = '';
    els.note.hidden = true;
  }
}

function reveal(silent) {
  if (state.revealed) return;
  state.revealed = true;
  els.card.classList.remove('is-sealed');
  if (!silent) {
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
  }
}

/* ------------------------------------------------------------- navigation */

function move(direction) {
  const next = state.index + direction;
  if (next < 0 || next >= state.verses.length) {
    toast(direction > 0 ? 'That is the earliest verse' : 'You are on today\'s verse');
    return;
  }

  const outClass = direction > 0 ? 'swipe-out-left' : 'swipe-out-right';
  const inClass = direction > 0 ? 'swipe-in-left' : 'swipe-in-right';

  els.card.classList.add(outClass);
  window.setTimeout(() => {
    state.index = next;
    render();
    els.card.classList.remove(outClass);
    els.card.classList.add(inClass);
    window.setTimeout(() => els.card.classList.remove(inClass), 460);
  }, 200);
}

/* ------------------------------------------------------------------ streak */

function updateStreak() {
  let streak = null;
  try { streak = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null'); } catch {}

  if (!streak || !streak.last || typeof streak.count !== 'number') {
    streak = { last: state.today, count: 1, badges: [] };
  } else {
    const diff = daysBetween(streak.last, state.today);
    if (diff === 0) {
      /* already counted today */
    } else if (diff === 1) {
      streak.count += 1;
      streak.last = state.today;
    } else {
      streak.count = 1;
      streak.last = state.today;
    }
    streak.badges = Array.isArray(streak.badges) ? streak.badges : [];
  }

  const milestones = [3, 7, 14, 30, 60, 100, 365];
  const hit = milestones.find((m) => streak.count === m && !streak.badges.includes(m));

  if (hit) {
    streak.badges.push(hit);
    window.setTimeout(() => {
      confetti();
      toast('🔥 ' + hit + ' days abiding. Keep going.');
    }, 900);
  }

  try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch {}

  els.streak.hidden = false;
  els.streakCount.textContent = String(streak.count);
}

/* -------------------------------------------------------------------- amen */

function initAmen() {
  els.amenBtn.addEventListener('click', () => {
    let count = 0;
    try { count = Number(localStorage.getItem(AMEN_KEY) || 0) + 1; } catch {}
    try { localStorage.setItem(AMEN_KEY, String(count)); } catch {}

    els.amenBtn.classList.add('is-amen');
    window.setTimeout(() => els.amenBtn.classList.remove('is-amen'), 900);

    try { navigator.vibrate && navigator.vibrate([8, 40, 8]); } catch {}
    toast(count > 1 ? 'Amen · ' + count + ' times' : 'Amen');
  });
}

/* ------------------------------------------------------------------- share */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildImage(verse) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#151634');
  bg.addColorStop(0.52, '#282052');
  bg.addColorStop(1, '#3b2552');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, 760);
  glow.addColorStop(0, 'rgba(238,194,126,.34)');
  glow.addColorStop(1, 'rgba(238,194,126,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.92, 0, W * 0.1, H * 0.92, 620);
  glow2.addColorStop(0, 'rgba(161,144,247,.28)');
  glow2.addColorStop(1, 'rgba(161,144,247,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 2;
  roundRect(ctx, 42, 42, W - 84, H - 84, 54);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#eec27e';
  ctx.font = '600 30px Inter, Arial, sans-serif';
  ctx.fillText('A B I D E W E L L', W / 2, 136);

  const maxWidth = W - 200;
  let size = 66;
  ctx.font = '500 ' + size + 'px Fraunces, Georgia, serif';
  let lines = wrapLines(ctx, verse.text, maxWidth);

  while (lines.length > 11 && size > 34) {
    size -= 4;
    ctx.font = '500 ' + size + 'px Fraunces, Georgia, serif';
    lines = wrapLines(ctx, verse.text, maxWidth);
  }

  const lineHeight = size * 1.42;
  const startY = H / 2 - ((lines.length - 1) * lineHeight) / 2 - 30;
  ctx.fillStyle = '#f7f2e6';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, startY + i * lineHeight));

  ctx.fillStyle = '#eec27e';
  ctx.font = '600 38px Inter, Arial, sans-serif';
  const refLine = verse.reference + (verse.version ? '  ·  ' + verse.version : '');
  ctx.fillText(refLine, W / 2, startY + lines.length * lineHeight + 86);

  ctx.fillStyle = 'rgba(255,255,255,.42)';
  ctx.font = '400 27px Inter, Arial, sans-serif';
  ctx.fillText(labelForShare(verse.date), W / 2, H - 116);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
}

function labelForShare(iso) {
  const d = new Date(iso + 'T12:00:00');
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
}

async function share() {
  const verse = state.verses[state.index] || CFG.fallbackVerse;
  els.shareBtn.disabled = true;

  try {
    const blob = await buildImage(verse);
    if (!blob) throw new Error('no image');

    const file = new File([blob], 'abidewell-' + verse.date + '.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Abidewell',
          text: verse.reference + (verse.version ? ' (' + verse.version + ')' : '')
        });
        els.shareBtn.disabled = false;
        return;
      } catch {
        /* fall through to download */
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'abidewell-' + verse.date + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Verse image saved');
  } catch {
    toast('Could not make the image');
  } finally {
    els.shareBtn.disabled = false;
  }
}

/* --------------------------------------------------------------- gestures */

function initGestures() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  els.card.addEventListener('pointerdown', (e) => {
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  els.card.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!state.revealed) {
      reveal();
      return;
    }

    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) reveal();
      return;
    }

    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? 1 : -1);
    }
  });

  els.card.addEventListener('pointercancel', () => { tracking = false; });

  els.seal.addEventListener('click', (e) => {
    e.stopPropagation();
    reveal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') move(1);
    if (e.key === 'ArrowLeft') move(-1);
    if (e.key === 'Enter' || e.key === ' ') {
      if (!state.revealed) { e.preventDefault(); reveal(); }
    }
  });
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function confetti() {
  const colors = ['#eec27e', '#ffa9c9', '#a190f7', '#7ee0c3', '#ffd39b', '#ffffff'];
  for (let i = 0; i < 46; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = Math.random() * 0.35 + 's';
    piece.style.animationDuration = 1.3 + Math.random() * 0.9 + 's';
    piece.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    document.body.appendChild(piece);
    window.setTimeout(() => piece.remove(), 2600);
  }
}

/* ------------------------------------------------------------------- init */

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

async function init() {
  applyTheme();
  state.today = todayISO();

  const verses = await loadVerses();
  state.verses = usable(verses);

  render();
  initGestures();
  initAmen();
  els.shareBtn.addEventListener('click', share);
  updateStreak();
  initServiceWorker();

  /* Re-check the date if the tab stays open past midnight. */
  window.setInterval(() => {
    const now = todayISO();
    if (now !== state.today) {
      state.today = now;
      applyTheme();
      loadVerses().then((list) => {
        state.verses = usable(list);
        state.index = 0;
        render();
      });
    }
  }, 60 * 1000);
}

init();
