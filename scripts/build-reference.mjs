/* Build public/data/reference.json — the book / chapter / verse map the Post
 * screen uses for its dropdowns, taken from the same BBE text.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bible = JSON.parse(await readFile(join(root, '.bbe-source.json'), 'utf8'));

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const books = bible.map((book) => ({
  name: book.name,
  slug: slug(book.name),
  chapters: book.chapters.map((chapter) => chapter.length)
}));

await writeFile(
  join(root, 'public', 'data', 'reference.json'),
  JSON.stringify({ books }, null, 0) + '\n',
  'utf8'
);

console.log(
  'books ' + books.length +
    ', chapters ' + books.reduce((n, b) => n + b.chapters.length, 0) +
    ', verses ' + books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c, 0), 0)
);
