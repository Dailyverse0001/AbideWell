/** Merge automatic readings with manual posts. A manual post always owns its date. */
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
