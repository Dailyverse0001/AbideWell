/* One-time research importer. It turns saved OpenBible topical pages into a
 * compact, reviewable reference list. It never imports copyrighted verse text. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass the directory containing saved OpenBible Markdown pages.');

const records = [];
for (const filename of (await readdir(sourceDir)).filter((name) => name.endsWith('.md')).sort()) {
  const topic = basename(filename, '.md');
  const markdown = await readFile(join(sourceDir, filename), 'utf8');
  const source = `https://www.openbible.info/topics/${topic}`;
  const pattern = /^### \[([^\]]+)\]\([^\)]+\) ESV \/ (\d[\d,]*) helpful votes/gm;
  let match;
  let rank = 0;
  while ((match = pattern.exec(markdown))) {
    rank += 1;
    records.push({ topic, reference: match[1].trim(), rank, source });
  }
}

await writeFile(
  join(root, 'scripts', 'topical-references.json'),
  JSON.stringify({ generatedFrom: 'OpenBible.info topical reference lists', records }, null, 2) + '\n'
);
console.log(`Imported ${records.length} topical reference records.`);
