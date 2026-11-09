/* Build the GitHub Pages copy of the site.
 *
 * Pages serves a flat folder from the gh-pages branch at
 * https://<user>.github.io/AbideWell/ , so every path must be relative
 * and the verse data has to come from the main branch (Pages never rebuilds
 * when a verse is posted).
 *
 * Usage: node scripts/make-pages.mjs <output-dir>
 */
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = process.env.GH_OWNER || 'Dailyverse0001';
const REPO = process.env.GH_REPO || 'AbideWell';
const BRANCH = process.env.GH_BRANCH || 'main';
const RAW =
  'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/public/data/verses.json';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public');
const out = resolve(process.argv[2] || join(root, '.pages'));

async function walk(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? base + '/' + entry.name : entry.name;
    if (entry.isDirectory()) files.push(...(await walk(join(dir, entry.name), rel)));
    else files.push(rel);
  }
  return files;
}

function rewrite(rel, text) {
  if (rel.endsWith('.html')) {
    return text
      .replace(/href="\/"/g, 'href="./"')
      .replace(/(href|src)="\//g, '$1="');
  }

  if (rel.endsWith('.js')) {
    return text
      .replace(/register\('\/sw\.js'\)/g, "register('sw.js')")
      .replace(
        /'(?:\.\.\/)?data\/verses\.json\?t='/g,
        "'" + RAW + "?t='"
      );
  }

  return text;
}

/* Never wipe a git worktree: deleting it removes the .git link. */
let outExists = false;
try {
  await access(out, constants.F_OK);
  outExists = true;
} catch {}
if (outExists) {
  try {
    await access(join(out, '.git'), constants.F_OK);
    throw new Error(
      'Refusing to build into ' + out + ' because it is a git worktree. ' +
      'Build into a scratch folder, then copy the files across.'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(source, out, { recursive: true });

const files = await walk(out);
for (const rel of files) {
  if (!/\.(html|js|css)$/.test(rel)) continue;
  const path = join(out, rel);
  const before = await readFile(path, 'utf8');
  const after = rewrite(rel, before);
  if (after !== before) await writeFile(path, after, 'utf8');
}

console.log('GitHub Pages copy written to ' + out + ' (' + files.length + ' files)');
console.log('Verse data source: ' + RAW);
