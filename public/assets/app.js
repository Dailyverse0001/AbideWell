/* Abidewell — today's reading */
const CFG = window.ABIDEWELL;
const $ = (sel) => document.querySelector(sel);

const els = {
  ticks: $('#ticks'),
  reading: $('#reading'),
  meta: $('#verseMeta'),
  text: $('#verseText'),
  ref: $('#verseRef'),
  version: $('#verseVersion'),
  note: $('#verseNote'),
  whisper: $('#whisper'),
  issue: $('#issueNo'),
  simplifyBlock: $('#simplifyBlock'),
  simplifyBtn: $('#simplifyBtn'),
  simplifyPanel: $('#simplifyPanel'),
  simplifyText: $('#simplifyText'),
  prev: $('#prevBtn'),
  next: $('#nextBtn'),
  amen: $('#amenBtn'),
  copy: $('#copyBtn'),
  share: $('#shareBtn'),
  streak: $('#streak'),
  streakCount: $('#streakCount'),
  streakMarks: $('#streakMarks'),
  issue: $('#issueNo'),
  colophon: $('#colophonDate'),
  toast: $('#toast')
};

const STREAK_KEY = 'abidewell.streak.v2';
const AMEN_KEY = 'abidewell.amen.v2';
const state = { verses: [], index: 0, today: '' };

const WHISPERS = [
  'An angel is reading this one with you.',
  'This verse was picked before you woke up.',
  'Read it once for the words. Twice for the meaning.',
  'No quiz at the end.',
  'Somebody prayed for you this morning.',
  'Heaven is not in a hurry. You do not have to be either.',
  'You opened this at exactly the right time.',
  'This one is better out loud.',
  'Coffee first is allowed.',
  'You are not behind.',
  'The angels are not tired of this verse.',
  'Pajamas are acceptable reading attire.',
  'If you only remember one line, make it the last one.',
  'Take a screenshot. It is yours now.',
  'This verse has been waiting for you.',
  'There is no wrong way to read it.',
  'Breathe. Then begin.',
  'Underline it if you like. Nobody is grading.',
  'Some days the verse reads you back.',
  'You are allowed to sit here a while.',
  'This one is short. Let it be enough.',
  'The door is open. You do not have to knock twice.',
  'Someone needed this today. Probably you.',
  'It is fine to read it twice and still not get it.',
  'God is not annoyed that you are here.',
  'A quiet minute counts.',
  'This verse does not expire.',
  'You can come back to it tonight.',
  'The words are older than your worries.',
  'No rush. The verse will wait.',
  'Read it like a letter, not a notice.',
  'There is a seat here with your name on it.',
  'You do not have to feel it to believe it.',
  'Small verse. Big door.',
  'Somebody is glad you opened this.',
  'This is a good place to put your phone down after.',
  'The first word is a door. Walk in.',
  'It is okay if today this is the only thing you do.',
  'Angels sing badly. You can still sing.',
  'Mercy does not check the time.',
  'You were not a mistake at 6 a.m. either.',
  'This one is a lamp, not a spotlight.',
  'Keep it in your pocket for later.',
  'Read it slowly. The good parts are small.',
  'He is not tired of starting over with you.',
  'You are allowed to begin again at any hour.',
  'This verse has no fine print.',
  'If it made you pause, that was the point.',
  'Somebody left the light on for you.',
  'Come as you are. Stay a minute.'
];

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

function dayOfYear(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const now = Date.UTC(y, m - 1, d);
  return Math.floor((now - start) / 86400000) + 1;
}

function prettyDate(iso, style) {
  const d = new Date(iso + 'T12:00:00');
  if (style === 'long') {
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  }
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

function labelForDate(iso) {
  if (iso === state.today) return 'Today';
  const diff = daysBetween(iso, state.today);
  if (diff === 1) return 'Yesterday';
  return prettyDate(iso);
}

/* ------------------------------------------------------------------- halo */

function buildTicks() {
  const count = 72;
  const active = dayOfYear(state.today) % count;
  const frag = document.createDocumentFragment();

  for (let i = 0; i < count; i += 1) {
    const tick = document.createElement('span');
    tick.className = 'tick' + (i === active ? ' is-today' : '');
    tick.style.transform = 'rotate(' + (i * (360 / count)) + 'deg)';
    tick.appendChild(document.createElement('i'));
    frag.appendChild(tick);
  }

  els.ticks.replaceChildren(frag);
  els.issue.textContent = String(dayOfYear(state.today)).padStart(3, '0');
  els.colophon.textContent = prettyDate(state.today, 'long');
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

/* -------------------------------------------------------------- rendering */

function current() {
  return state.verses[state.index] || CFG.fallbackVerse;
}

function render() {
  const verse = current();

  els.meta.textContent = verse.date === state.today ? 'Today' : labelForDate(verse.date);
  els.text.textContent = verse.text;
  els.ref.textContent = verse.reference;
  els.version.textContent = verse.version || '';

  if (verse.note && String(verse.note).trim()) {
    els.note.textContent = String(verse.note).trim();
    els.note.hidden = false;
  } else {
    els.note.textContent = '';
    els.note.hidden = true;
  }

  els.prev.disabled = state.index >= state.verses.length - 1;
  els.next.disabled = state.index <= 0;

  setSimplify(verse.simplify);
  setWhisper();
}

function setSimplify(value) {
  const text = value && String(value).trim();

  if (!text) {
    els.simplifyBlock.hidden = true;
    els.simplifyPanel.hidden = true;
    els.simplifyBtn.setAttribute('aria-expanded', 'false');
    els.simplifyText.textContent = '';
    return;
  }

  els.simplifyText.textContent = text;
  els.simplifyBlock.hidden = false;
  els.simplifyPanel.hidden = true;
  els.simplifyBtn.setAttribute('aria-expanded', 'false');
}

function setWhisper(forcedIndex) {
  const index =
    typeof forcedIndex === 'number'
      ? Math.abs(forcedIndex) % WHISPERS.length
      : dayOfYear(state.today) % WHISPERS.length;

  const line = WHISPERS[index];
  if (!line) return;

  if (!els.whisper.textContent) {
    els.whisper.textContent = line;
    return;
  }

  els.whisper.classList.add('is-swapping');
  window.setTimeout(() => {
    els.whisper.textContent = line;
    els.whisper.classList.remove('is-swapping');
  }, 180);
}

/* ------------------------------------------------------------- navigation */

function move(direction) {
  const next = state.index + direction;
  if (next < 0 || next >= state.verses.length) return;

  els.reading.style.opacity = '0';
  els.reading.style.transform = direction > 0 ? 'translateX(-14px)' : 'translateX(14px)';

  window.setTimeout(() => {
    state.index = next;
    render();
    els.reading.style.transform = direction > 0 ? 'translateX(14px)' : 'translateX(-14px)';
    requestAnimationFrame(() => {
      els.reading.style.opacity = '1';
      els.reading.style.transform = 'none';
    });
  }, 180);
}

/* ------------------------------------------------------------------ streak */

function updateStreak() {
  let streak = null;
  try { streak = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null'); } catch {}

  if (!streak || !streak.last || typeof streak.count !== 'number') {
    streak = { last: state.today, count: 1, badges: [] };
  } else {
    const diff = daysBetween(streak.last, state.today);
    if (diff === 1) {
      streak.count += 1;
      streak.last = state.today;
    } else if (diff !== 0) {
      streak.count = 1;
      streak.last = state.today;
    }
    streak.badges = Array.isArray(streak.badges) ? streak.badges : [];
  }

  const marks = [3, 7, 14, 30, 60, 100, 365];
  const hit = marks.find((m) => streak.count === m && !streak.badges.includes(m));

  if (hit) {
    streak.badges.push(hit);
    window.setTimeout(() => toast(hit + ' days kept'), 700);
  }

  try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch {}

  els.streak.hidden = false;
  els.streakCount.textContent = String(streak.count);
  document.getElementById('streakUnit').textContent = streak.count === 1 ? 'day' : 'days';

  const shown = Math.min(streak.count, 7);
  els.streakMarks.replaceChildren();
  for (let i = 0; i < 7; i += 1) {
    const mark = document.createElement('span');
    mark.className = 'mark' + (i < shown ? ' is-on' : '');
    els.streakMarks.appendChild(mark);
  }
}

/* -------------------------------------------------------------------- copy */

function copyPayload() {
  const verse = current();
  const lines = [
    '"' + verse.text.replace(/\s+/g, ' ').trim() + '"',
    '',
    verse.reference + (verse.version ? ' · ' + verse.version : ''),
    'Abidewell — ' + prettyDate(verse.date, 'long')
  ];
  return lines.join('\n');
}

async function copyVerse() {
  const text = copyPayload();

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      toast('Verse copied');
      return;
    }
  } catch {}

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    toast(ok ? 'Verse copied' : 'Could not copy');
  } catch {
    toast('Could not copy');
  }
}

/* ------------------------------------------------------------ share image */

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

function drawCornerTicks(ctx, W, H) {
  ctx.strokeStyle = 'rgba(25,20,16,.35)';
  ctx.lineWidth = 1;
  const pad = 66;
  const len = 18;

  const corners = [
    [pad, pad, 1, 1],
    [W - pad, pad, -1, 1],
    [pad, H - pad, 1, -1],
    [W - pad, H - pad, -1, -1]
  ];

  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * dx, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len * dy);
    ctx.stroke();
  }
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

  /* paper */
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#f4ecdc');
  bg.addColorStop(0.55, '#ede4d3');
  bg.addColorStop(1, '#e1d4bd');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* radial engraving */
  ctx.save();
  ctx.translate(W / 2, H * 0.46);
  ctx.strokeStyle = 'rgba(25,20,16,.06)';
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 150, Math.sin(a) * 150);
    ctx.lineTo(Math.cos(a) * 470, Math.sin(a) * 470);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 470, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  /* frame */
  ctx.strokeStyle = 'rgba(25,20,16,.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(52, 52, W - 104, H - 104);
  ctx.strokeStyle = 'rgba(25,20,16,.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(60, 60, W - 120, H - 120);
  drawCornerTicks(ctx, W, H);

  /* header */
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c13b27';
  ctx.beginPath();
  ctx.arc(W / 2, 146, 22, 0, Math.PI * 2);
  ctx.strokeStyle = '#c13b27';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = '400 20px "Literata", Georgia, serif';
  ctx.fillText('✦', W / 2, 153);

  ctx.fillStyle = '#191410';
  ctx.font = '600 22px "IBM Plex Sans", Arial, sans-serif';
  ctx.save();
  ctx.letterSpacing = '8px';
  ctx.fillText('ABIDEWELL', W / 2, 210);
  ctx.restore();

  ctx.fillStyle = 'rgba(25,20,16,.55)';
  ctx.font = '400 19px "IBM Plex Sans", Arial, sans-serif';
  ctx.fillText('NO. ' + String(dayOfYear(verse.date)).padStart(3, '0'), W / 2, 246);

  /* verse */
  const maxWidth = W - 240;
  let size = 60;
  ctx.font = '400 ' + size + 'px "Literata", Georgia, serif';
  let lines = wrapLines(ctx, verse.text, maxWidth);

  while (lines.length > 12 && size > 32) {
    size -= 3;
    ctx.font = '400 ' + size + 'px "Literata", Georgia, serif';
    lines = wrapLines(ctx, verse.text, maxWidth);
  }

  const lineHeight = size * 1.52;
  const blockHeight = lines.length * lineHeight;
  let y = H * 0.5 - blockHeight / 2 + lineHeight * 0.72;

  ctx.fillStyle = '#191410';
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lineHeight;
  }

  /* reference */
  const refY = y + 54;
  ctx.strokeStyle = 'rgba(25,20,16,.35)';
  ctx.beginPath();
  ctx.moveTo(W / 2 - 42, refY - 22);
  ctx.lineTo(W / 2 + 42, refY - 22);
  ctx.stroke();

  ctx.fillStyle = '#c13b27';
  ctx.font = '600 26px "IBM Plex Sans", Arial, sans-serif';
  ctx.save();
  ctx.letterSpacing = '3px';
  ctx.fillText((verse.reference + (verse.version ? '  ·  ' + verse.version : '')).toUpperCase(), W / 2, refY + 16);
  ctx.restore();

  /* footer */
  ctx.fillStyle = 'rgba(25,20,16,.6)';
  ctx.font = 'italic 400 22px "Literata", Georgia, serif';
  ctx.fillText('Soli Deo gloria', W / 2, H - 132);

  ctx.font = '400 18px "IBM Plex Sans", Arial, sans-serif';
  ctx.fillText(prettyDate(verse.date, 'long').toUpperCase(), W / 2, H - 100);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.96));
}

async function share() {
  const verse = current();
  els.share.disabled = true;

  try {
    const blob = await buildImage(verse);
    if (!blob) throw new Error('no image');

    const file = new File([blob], 'abidewell-' + verse.date + '.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: 'Abidewell',
          text: verse.reference + (verse.version ? ' · ' + verse.version : '')
        });
        return;
      } catch {}
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'abidewell-' + verse.date + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Broadside saved');
  } catch {
    toast('Could not make the image');
  } finally {
    els.share.disabled = false;
  }
}

/* ------------------------------------------------------------------ toast */

let toastTimer = null;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove('show'), 2200);
}

/* --------------------------------------------------------------- gestures */

function initGestures() {
  let x0 = 0;
  let y0 = 0;
  let tracking = false;

  els.reading.addEventListener('pointerdown', (e) => {
    tracking = true;
    x0 = e.clientX;
    y0 = e.clientY;
  });

  els.reading.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;

    const dx = e.clientX - x0;
    const dy = e.clientY - y0;

    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? 1 : -1);
    }
  });

  els.reading.addEventListener('pointercancel', () => { tracking = false; });

  /* Easter egg: tap the issue number for a different whisper. */
  const issueHost = els.issue && els.issue.parentElement;
  if (issueHost) {
    issueHost.addEventListener('click', () => {
      setWhisper(Math.floor(Math.random() * WHISPERS.length));
      toast('✦');
    });
  }

  els.prev.addEventListener('click', () => move(1));
  els.next.addEventListener('click', () => move(-1));

  els.amen.addEventListener('click', () => {
    let count = 0;
    try { count = Number(localStorage.getItem(AMEN_KEY) || 0) + 1; } catch {}
    try { localStorage.setItem(AMEN_KEY, String(count)); } catch {}

    els.amen.classList.add('is-pressed');
    window.setTimeout(() => els.amen.classList.remove('is-pressed'), 800);
    try { navigator.vibrate && navigator.vibrate([6, 36, 6]); } catch {}
    toast(count > 1 ? 'Amen · ' + count : 'Amen');
  });

  els.copy.addEventListener('click', copyVerse);
  els.share.addEventListener('click', share);

  els.simplifyBtn.addEventListener('click', () => {
    const open = els.simplifyBtn.getAttribute('aria-expanded') === 'true';
    els.simplifyBtn.setAttribute('aria-expanded', String(!open));
    els.simplifyPanel.hidden = open;
  });

  window.addEventListener('keydown', (e) => {
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') move(-1);
    if (e.key === 'ArrowLeft') move(1);
  });
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
  state.today = todayISO();
  buildTicks();

  const list = await loadVerses();
  state.verses = usable(list);
  state.index = 0;

  render();
  initGestures();
  updateStreak();
  initServiceWorker();

  window.setInterval(() => {
    const now = todayISO();
    if (now !== state.today) {
      state.today = now;
      buildTicks();
      loadVerses().then((fresh) => {
        state.verses = usable(fresh);
        state.index = 0;
        render();
      });
    }
  }, 60000);
}

init();
