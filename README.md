# Abidewell

A daily Bible verse site — colorful, calm, and built to be posted from a phone.

- Your sister opens `/admin`, unlocks once, types a verse, taps **Post**.
- The public page updates roughly 30 seconds later.
- If she skips a day, yesterday's verse stays up. Nothing ever goes blank.
- The date on screen always matches the verse she posted, not "today".

---

## What is in this folder

```
abidewell/
├─ public/                     ← the website (this is what gets served)
│  ├─ index.html               today's verse
│  ├─ archive.html             every past verse
│  ├─ admin.html               her posting screen
│  ├─ manifest.webmanifest     makes it installable on Android
│  ├─ sw.js                    offline support
│  ├─ assets/
│  │  ├─ styles.css            the whole design
│  │  ├─ config.js             site name, timezone, API paths
│  │  ├─ app.js                today page logic
│  │  ├─ archive.js
│  │  ├─ admin.js
│  │  ├─ icon.svg
│  │  ├─ icon-192.png
│  │  └─ icon-512.png
│  └─ data/
│     └─ verses.json           ← the "database" (every verse lives here)
├─ api/post.js                 write endpoint for Vercel
├─ netlify/functions/post.js   write endpoint for Netlify
├─ lib/post-core.js            the shared, secure write logic
├─ .github/workflows/
│  └─ daily-verse.yml          one-tap posting from the GitHub app (no AI)
├─ scripts/
│  ├─ make-icons.mjs           regenerates the app icons
│  └─ add-verse.mjs            fetches a verse by reference and saves it
├─ vercel.json
├─ netlify.toml
├─ .env.example
└─ README.md
```

Both hosts are supported. Use whichever you prefer — the same repo works on Vercel **and** Netlify.

---

## The 6 setup steps

You do this once. After that, she never touches GitHub or the host.

### 1. Create the GitHub repo

1. GitHub → **New repository**.
2. Name it `abidewell`. Choose **Private**. Create it.
3. Upload the **contents** of this folder (not the folder itself) so `package.json` sits at the repo root.
   - Easiest: `git init`, `git add .`, `git commit -m "abidewell"`, then push.
   - Or use GitHub's "uploading an existing file" screen and drag everything in.
4. Confirm the branch is `main`. If it is `master`, either rename it or set `GITHUB_BRANCH=master` later.

### 2. Create a GitHub token

The site needs permission to save verses into your repo. Give it the smallest possible permission.

1. GitHub → your avatar → **Settings**.
2. **Developer settings** → **Personal access tokens** → **Fine-grained tokens**.
3. **Generate new token**.
4. Name: `abidewell-writer`. Expiration: 1 year (put a reminder to renew).
5. **Repository access** → *Only select repositories* → pick `abidewell`.
6. **Permissions** → *Repository permissions* → **Contents** → **Read and write**.
7. Generate, then copy the token. It starts with `github_pat_`. You will not see it again.

### 3. Deploy

#### Option A — Vercel

1. Vercel → **Add New… → Project** → import the `abidewell` repo.
2. Framework preset: **Other**.
3. Root directory: `./`
4. Build command: `npm run build` (it only regenerates icons).
5. Output directory: `public`.
6. Deploy.
7. Open **Settings → Environment Variables** and add all six values from step 4 below.
8. **Redeploy** once so the function sees the new variables.

#### Option B — Netlify

1. Netlify → **Add new site → Import an existing project** → GitHub → pick `abidewell`.
2. `netlify.toml` already sets everything: build `node scripts/make-icons.mjs`, publish `public`, functions `netlify/functions`.
3. After the first deploy: **Site configuration → Environment variables** → add the six values.
4. **Deploys → Trigger deploy → Deploy site** so the function picks them up.

### 4. Add the six environment variables

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | A long passphrase she can type, e.g. `three-warm-words-and-a-42` |
| `GITHUB_TOKEN` | The `github_pat_…` token from step 2 |
| `GITHUB_OWNER` | Your GitHub username |
| `GITHUB_REPO` | `abidewell` |
| `GITHUB_BRANCH` | `main` (or `master`) |
| `GITHUB_PATH` | `public/data/verses.json` |

Do not put these in the repo. They belong only in the host's dashboard.

### 5. Test it once

1. Open `https://your-site/admin`.
2. Enter the passphrase.
3. Leave the date as today.
4. Reference: `John 3:16` → tap **Auto-fill** → the verse appears.
5. Tap **Post verse**.
6. Wait ~30 seconds, open the home page, and refresh. The verse should be live.
7. Check GitHub: there will be a new commit called `verse: 2026-11-10 John 3:16`.

### 6. Put it on her phone

1. On her Android, open the site in **Chrome**.
2. Menu (⋮) → **Add to Home screen** → **Install**.
3. It now opens full-screen like an app, and keeps the last verse offline.
4. Save `https://your-site/admin` as a second home-screen shortcut for her.
5. She types the passphrase once; the phone remembers it.

---

## How the daily logic works

Every verse is one row in `public/data/verses.json`:

```json
{
  "date": "2026-11-10",
  "reference": "Psalm 23:1",
  "text": "The LORD is my shepherd; I shall not want.",
  "version": "KJV",
  "note": "Optional one-line reflection",
  "postedAt": "2026-11-10T06:00:00.000Z"
}
```

The site shows:

> **the newest verse whose `date` is today or earlier**

That single rule gives you all of this for free:

- She skips a day → yesterday's verse stays.
- She posts → the visible date becomes that verse's date.
- She posts yesterday's verse today (backdating) → it slots into the archive correctly.
- Two verses on the same date → the newer one replaces the old one.

Dates are plain `YYYY-MM-DD` strings and the site uses **Asia/Kolkata**, so a late-night post still lands on the right day. Change the timezone in `public/assets/config.js`.

---

## What happens when she taps "Post" (the backend, explained)

This is the part that sounds scary but is only four moves.

```
Her phone                     Your host                   GitHub
──────────                    ─────────                   ──────
POST /api/post   ──────────▶  checks passphrase
{ action:"save",              reads verses.json   ──────▶ GET contents
  verse:{...} }               adds the verse
                              writes verses.json  ──────▶ PUT contents
                              ◀──────────────────────────  new commit
             ◀──────────────  { ok:true, verses:[...] }
```

1. **Her phone** sends the verse plus the passphrase to your site.
2. **The function** compares the passphrase to `ADMIN_PASSWORD` in constant time. Wrong? It stops with `401`.
3. It reads `public/data/verses.json` from GitHub using your token.
4. It inserts the verse, sorts by date, and commits the file back. The host rebuilds the page.

Things worth knowing:

- The **passphrase never leaves her phone** in the repo — it is only stored in that phone's browser after the first unlock.
- The **GitHub token never reaches the browser** at all. It exists only as an environment variable on the host.
- The token is scoped to **one repo** with **contents-only** permission. If it ever leaked, the damage is limited to that repo.
- Validation caps the verse at 2000 characters, rejects impossible dates, and renders everything as plain text — no HTML or script can be injected.
- Simple rate limiting blocks password guessing.
- Every post is a Git commit. If she makes a mistake, you can revert it in one click on GitHub.

### If you ever want to post by hand

Edit `public/data/verses.json` directly on GitHub, add a row in the same shape, and commit. Same result, no admin screen involved.

---

## Posting without the admin page (GitHub app, no AI, no password)

If you would rather post straight from GitHub, there is a second free path:

1. Repo → **Actions** tab → **Add a verse** → **Run workflow**.
2. Type the reference, e.g. `John 3:16`. Optionally pick a date and translation.
3. Run. It fetches the exact text and commits it.

That is it — the site updates about 30 seconds later. This works from the GitHub app on any phone and costs nothing.

**Limits of this path:**

- Only **WEB, KJV, ASV, YLT, BBE, DARBY** are available (public domain). **NKJV is copyrighted and is not in any free API** — use `/admin` and paste NKJV text yourself.
- The text is fetched, never generated, so it cannot be paraphrased or truncated.

Locally the same script works:

```bash
node scripts/add-verse.mjs --reference "John 3:16" --version WEB
node scripts/add-verse.mjs --reference "Psalm 23:1-3" --version KJV --date 2026-11-12
node scripts/add-verse.mjs --reference "Romans 8:28" --version WEB --note "For the hard days"
```

---

## About "let a free AI post it"

ChatGPT Free and Claude Free **cannot** connect to GitHub — the connector is a paid feature on both. Even on a paid plan, an AI that *retypes* scripture will occasionally paraphrase, skip a clause, or modernise the wording. For a verse site that is the one mistake worth avoiding.

The reliable free pattern is:

1. Ask any AI for the verse text (or read it from the Bible API).
2. Paste it into `/admin`, or use the **Add a verse** action above.

AI is fine as a lookup helper. Let it be the writer and you will eventually ship a wrong verse.

---

## Account order

Do these in this order so everything sits under one identity:

1. Create the **Gmail** account.
2. Create the **GitHub** account with that email (verify it).
3. Create the repo and push this folder.
4. Create the **Vercel** or **Netlify** account with the *same* email.
5. Create the GitHub token, add the environment variables, deploy.

Pick a clean GitHub username now — it appears in the repo URL, but **not** in your website URL. If you rename the account later, Vercel and Netlify follow the repo ID, so nothing breaks.

---

## Customising

- **Name / tagline** → `public/assets/config.js` (and the `<title>` tags in the three HTML files).
- **Colours** → the four `body.theme-*` blocks at the top of `public/assets/styles.css`.
- **Time of day** → `applyTheme()` in `public/assets/app.js`.
- **App icon** → edit `scripts/make-icons.mjs`, then run `npm run build`.
- **Bible version** → the dropdown in `admin.html`; add or remove options freely.

The site is intentionally version-agnostic: she chooses the label and supplies the text. That keeps you clear of translation licensing. **KJV** and **WEB** are public domain and always safe.

---

## Local preview

```bash
npx serve public -l 4173
```

Then open `http://localhost:4173`. The admin page's write endpoint only exists on the real host, so posting must be tested after deploy.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Wrong passphrase" | Re-check `ADMIN_PASSWORD`. No trailing spaces. Redeploy after changing it. |
| "No write endpoint found" | The function did not deploy. Check `https://your-site/api/post` (Vercel) or `/.netlify/functions/post` (Netlify). |
| "GitHub read failed (404)" | `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` or `GITHUB_PATH` is wrong, or the token cannot read. |
| "GitHub write failed (403)" | The token is missing **Contents: Read and write**. |
| Posted but the site is unchanged | Wait 30 seconds and hard-refresh. Check GitHub for the commit. |
| Auto-fill does nothing | The free Bible API may be down or the reference is odd. Type the verse by hand. |
| Icons missing | Run `npm run build`. |
| Streak reset to 1 | Browser data was cleared, or a day was missed. Expected. |
| Vercel asks about commercial use | The free Hobby plan is for personal projects; this qualifies. Netlify has no such clause. |

---

## Privacy

- Visitors need no account. The streak and Amen count live in their own browser only.
- Only the passphrase holder can write.
- No analytics, no trackers, no cookies beyond local storage.

Built for one person to post, and for everyone else to rest in.
