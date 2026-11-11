/* Abidewell — today's reading (Folio v2, the living sky).
   The verse sits on a subtly tilting card above a particle scene that
   tints to the day's colour. Every control is magnetic; Amen bursts the
   scene. Words rise word-by-word. Swipe to travel through days. */
import { loadMergedVerses } from './verse-data.js';

const CFG = window.ABIDEWELL;
const $ = (sel) => document.querySelector(sel);

const els = {
  meta: $('#verseMeta'),
  reading: $('#reading'),
  card: $('#verseCard'),
  text: $('#verseText'),
  ref: $('#verseRef'),
  version: $('#verseVersion'),
  note: $('#verseNote'),
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
  streakUnit: $('#streakUnit'),
  issue: $('#issueNo'),
  skyNo: $('#skyNo'),
  colophon: $('#colophonDate'),
  toast: $('#toast'),
  scene: $('#scene'),
  cursor: $('.cursor')
};

const STREAK_KEY = 'abidewell.streak.v2';
const AMEN_KEY = 'abidewell.amen.v2';
const state = { verses: [], index: 0, today: '', scene: null };

/* The day's single saturated colour: a calm, saturated stop every seven
   days, so different days genuinely look different but nothing is garish. */
const DAY_COLORS = [
  ['#3f6cf0', '#2a4fd0'], /* cobalt   */
  ['#f0566e', '#c73a52'], /* coral    */
  ['#f59f1e', '#d97d0a'], /* marigold */
  ['#1fa08e', '#127a6b'], /* viridian */
  ['#8a4fd0', '#6a33ac'], /* plum     */
  ['#3aa6d8', '#2384b4'], /* cyan     */
  ['#4f9e3f', '#3a7d2e']  /* moss     */
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

/* paint the day's colour + issue number into the sky, and retint the scene */
function paintSky(verse) {
  const [hero, heroDeep] = DAY_COLORS[dayOfYear(verse.date) % DAY_COLORS.length];
  const root = document.documentElement;
  root.style.setProperty('--hero', hero);
  root.style.setProperty('--hero-2', heroDeep);
  root.style.setProperty('--hero-glow', hero + '80');
  if (document.querySelector('meta[name=theme-color]')) {
    document.querySelector('meta[name=theme-color]').setAttribute('content', hero);
  }
  const num = String(dayOfYear(verse.date)).padStart(3, '0');
  if (els.skyNo) els.skyNo.textContent = num;
  if (els.issue) els.issue.textContent = num;
  document.title = 'Abidewell — ' + verse.reference;

  if (state.scene) state.scene.setColors(hero, heroDeep, '#f5f3ee');
}

/* -------------------------------------------------------------- rendering */

function current() {
  return state.verses[state.index] || CFG.fallbackVerse;
}

function paintVerse(paragraph, text, animate) {
  paragraph.replaceChildren();
  if (!text) return;

  const words = String(text).trim().split(/\s+/);
  const frag = document.createDocumentFragment();

  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'w';
    span.textContent = word;
    span.style.setProperty('--i', i);
    frag.appendChild(span);
    if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
  });

  paragraph.appendChild(frag);

  if (animate && window.gsap) {
    // let the CSS keyframe play; GSAP just orchestrates the card settle
    window.gsap.fromTo(
      els.card,
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: .6, ease: 'power3.out' }
    );
  }
}

function render(animate = true) {
  const verse = current();

  paintSky(verse);

  els.meta.textContent = verse.date === state.today ? 'Today' : labelForDate(verse.date);
  els.ref.textContent = verse.reference;
  els.version.textContent = verse.version || '';

  paintVerse(els.text, verse.text, animate);

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

/* ------------------------------------------------------------------- data */

async function loadVerses() {
  const sources = [
    CFG.data ? CFG.data + '?t=' + Date.now() : null,
    'data/verses.json?t=' + Date.now()
  ].filter(Boolean);
  return loadMergedVerses(sources);
}

function usable(verses) {
  return verses
    .filter((v) => v && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && typeof v.text === 'string')
    .filter((v) => v.date <= state.today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ------------------------------------------------------------- navigation */

function move(direction) {
  const next = state.index + direction;
  if (next < 0 || next >= state.verses.length) return;

  const leaving = 'is-leaving-' + (direction > 0 ? 'next' : 'prev');

  if (window.gsap) {
    window.gsap.to(els.reading, {
      x: direction > 0 ? -28 : 28,
      autoAlpha: 0,
      duration: .26,
      ease: 'power2.in',
      onComplete: () => {
        state.index = next;
        render(true);
        window.gsap.fromTo(els.reading,
          { x: direction > 0 ? 28 : -28, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, duration: .5, ease: 'power3.out' });
      }
    });
  } else {
    els.reading.classList.add(leaving);
    window.setTimeout(() => {
      state.index = next;
      render(true);
      els.reading.classList.remove('is-leaving-next', 'is-leaving-prev');
      requestAnimationFrame(() => {
        els.reading.classList.add('is-entering');
        window.setTimeout(() => els.reading.classList.remove('is-entering'), 80);
      });
    }, 240);
  }
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
    window.setTimeout(() => toast(hit + ' days kept'), 800);
  }

  try { localStorage.setItem(STREAK_KEY, JSON.stringify(streak)); } catch {}

  els.streak.hidden = false;
  els.streakCount.textContent = String(streak.count);
  els.streakUnit.textContent = streak.count === 1 ? 'day kept' : 'days kept';
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

async function buildImage(verse) {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch {}
  }

  const cs = getComputedStyle(document.documentElement);
  const hero = cs.getPropertyValue('--hero').trim() || '#3f6cf0';
  const heroDeep = cs.getPropertyValue('--hero-2').trim() || '#2a4fd0';
  const paper = '#f5f3ee';
  const ink = '#121319';

  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // paper base
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // the same signature move: the issue number, huge, in the day's colour
  ctx.fillStyle = hero;
  ctx.globalAlpha = 0.14;
  ctx.font = '900 480px "Fraunces", Georgia, serif';
  ctx.textAlign = 'right';
  ctx.fillText(String(dayOfYear(verse.date)).padStart(3, '0'), W - 20, 470);
  ctx.globalAlpha = 1;

  // wordmark, top left
  ctx.textAlign = 'left';
  ctx.fillStyle = ink;
  ctx.font = '900 36px "Fraunces", Georgia, serif';
  ctx.fillText('Abidewell', 54, 88);

  ctx.fillStyle = heroDeep;
  ctx.fillRect(54, 104, 64, 4);

  // the verse, big, left-aligned — matching the site
  ctx.textAlign = 'left';
  const left = 54;
  const maxWidth = W - 120;
  let size = 54;
  ctx.font = '400 ' + size + 'px "Fraunces", Georgia, serif';
  let lines = wrapLines(ctx, verse.text, maxWidth);

  while (lines.length > 11 && size > 30) {
    size -= 3;
    ctx.font = '400 ' + size + 'px "Fraunces", Georgia, serif';
    lines = wrapLines(ctx, verse.text, maxWidth);
  }

  const lineHeight = size * 1.28;
  let y = H * 0.44;
  ctx.fillStyle = ink;
  for (const line of lines) {
    ctx.fillText(line, left, y);
    y += lineHeight;
  }

  // the citation
  y += 30;
  ctx.fillStyle = heroDeep;
  ctx.font = '900 30px "Fraunces", Georgia, serif';
  ctx.fillText(verse.reference, left, y);
  ctx.fillStyle = ink;
  ctx.globalAlpha = .55;
  ctx.font = '500 22px "Space Grotesk", Arial, sans-serif';
  ctx.fillText((verse.version || '').toUpperCase(), left + ctx.measureText(verse.reference).width + 22, y);
  ctx.globalAlpha = 1;

  // colophon, bottom left
  ctx.fillStyle = ink;
  ctx.globalAlpha = .45;
  ctx.font = 'italic 400 24px "Fraunces", Georgia, serif';
  ctx.fillText('Soli Deo gloria · ' + prettyDate(verse.date, 'long'), left, H - 60);
  ctx.globalAlpha = 1;

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
    toast('Card saved');
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
    if (e.target.closest('.w') || e.target.closest('button')) return;
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

  els.prev.addEventListener('click', () => move(1));
  els.next.addEventListener('click', () => move(-1));

  els.amen.addEventListener('click', (e) => {
    let count = 0;
    try { count = Number(localStorage.getItem(AMEN_KEY) || 0) + 1; } catch {}
    try { localStorage.setItem(AMEN_KEY, String(count)); } catch {}

    els.amen.classList.add('is-pressed');
    window.setTimeout(() => els.amen.classList.remove('is-pressed'), 650);
    try { navigator.vibrate && navigator.vibrate([6, 36, 6]); } catch {}
    toast(count > 1 ? 'Amen · ' + count : 'Amen');

    // a burst of the day's colour where the tap fell
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    if (state.scene) state.scene.burst(x, y, 46);
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

  /* word hover: the colour of the day glows under the cursor */
  els.text.addEventListener('mouseover', (e) => {
    const word = e.target.closest('.w');
    if (word) word.classList.add('is-glow');
  });
  els.text.addEventListener('mouseout', (e) => {
    const word = e.target.closest('.w');
    if (word) word.classList.remove('is-glow');
  });
}

/* ---------------------------------------------------------- magnetic + tilt */

function initMotion() {
  const fine = window.matchMedia &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* magnetic pull: buttons and dots lean toward the pointer while hovered */
  if (fine && !reduce) {
    document.querySelectorAll('.magnet, .amen').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = 'translate(' + x * 0.12 + 'px,' + y * 0.22 + 'px)';
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
      });
    });

    /* custom cursor */
    if (els.cursor) {
      const ring = els.cursor;
      let cx = 0, cy = 0, rx = 0, ry = 0;
      window.addEventListener('pointermove', (e) => {
        cx = e.clientX; cy = e.clientY;
      }, { passive: true });

      function raf() {
        rx += (cx - rx) * 0.18;
        ry += (cy - ry) * 0.18;
        ring.style.left = rx + 'px';
        ring.style.top = ry + 'px';
        requestAnimationFrame(raf);
      }
      raf();

      document.querySelectorAll('a, button, .archive-item, [tabindex]').forEach((el) => {
        el.addEventListener('pointerenter', () => ring.classList.add('is-hover'));
        el.addEventListener('pointerleave', () => ring.classList.remove('is-hover'));
      });
    }
  }

  /* the verse card tilts in 3D with the pointer */
  if (fine && !reduce && els.card) {
    let tx = 0, ty = 0, px = 0, py = 0;
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX / window.innerWidth;
      ty = e.clientY / window.innerHeight;
    }, { passive: true });

    function tilt() {
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      const ry = (px - 0.5) * 7;
      const rx = (0.5 - py) * 7;
      els.card.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      els.card.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      els.card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      els.card.style.setProperty('--my', ((1 - py) * 100).toFixed(1) + '%');
      requestAnimationFrame(tilt);
    }
    tilt();
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

function initScene() {
  if (!window.AbidewellScene || !els.scene) return;
  state.scene = window.AbidewellScene.init(els.scene, {
    dense: window.innerWidth > 900,
    interactive: true
  });
  window.AbidewellScene.initChrome();
  const verse = current();
  if (verse) {
    const [hero, heroDeep] = DAY_COLORS[dayOfYear(verse.date) % DAY_COLORS.length];
    state.scene.setColors(hero, heroDeep, '#f5f3ee');
  }
}

async function init() {
  state.today = todayISO();

  const list = await loadVerses();
  state.verses = usable(list);
  state.index = 0;

  render(true);
  initGestures();
  initMotion();
  initScene();
  updateStreak();
  els.colophon.textContent = prettyDate(state.today, 'long');
  initServiceWorker();

  window.setInterval(() => {
    const now = todayISO();
    if (now !== state.today) {
      state.today = now;
      loadVerses().then((fresh) => {
        state.verses = usable(fresh);
        state.index = 0;
        render(true);
      });
    }
  }, 60000);
}

init();
