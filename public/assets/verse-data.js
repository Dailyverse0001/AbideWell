export function mergeVerseLists(schedule, manual) {
  const byDate = new Map();

  for (const verse of Array.isArray(schedule) ? schedule : []) {
    if (verse && /^\d{4}-\d{2}-\d{2}$/.test(verse.date || '')) {
      byDate.set(verse.date, { ...verse, scheduled: true });
    }
  }

  for (const verse of Array.isArray(manual) ? manual : []) {
    if (verse && /^\d{4}-\d{2}-\d{2}$/.test(verse.date || '')) {
      const replacement = { ...verse };
      delete replacement.scheduled;
      byDate.set(verse.date, replacement);
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadSchedule() {
  for (const path of ['../data/schedule.json', 'data/schedule.json', '/data/schedule.json']) {
    try {
      const response = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data)) return data;
    } catch {}
  }
  return [];
}

export async function loadMergedVerses(manualSources) {
  const schedulePromise = loadSchedule();
  let manual = [];

  for (const source of manualSources.filter(Boolean)) {
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) continue;
      const data = await response.json();
      if (Array.isArray(data)) {
        if (data.some((verse) => verse && verse.scheduled === true)) {
          return data.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
        }
        manual = data;
        break;
      }
    } catch {}
  }

  return mergeVerseLists(await schedulePromise, manual);
}
