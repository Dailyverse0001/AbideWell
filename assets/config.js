/* Abidewell — shared settings. Edit this file to rename or re-theme the site. */
window.ABIDEWELL = {
  name: 'Abidewell',
  tagline: 'A verse to abide in, every day.',
  timeZone: 'Asia/Kolkata',

  // The admin screen tries these in order, so it works on Vercel and Netlify.
  api: ['/api/post', '/.netlify/functions/post'],

  // Where the verse file lives. Used when posting straight to GitHub
  // (GitHub Pages has no server, so the browser talks to the GitHub API).
  github: {
    owner: 'Dailyverse0001',
    repo: 'AbideWell',
    branch: 'main',
    path: 'public/data/verses.json'
  },

  // The live verse file, read fresh on every visit. Posting never needs a
  // rebuild: the page picks the new verse up on the next load.
  data: 'https://raw.githubusercontent.com/Dailyverse0001/AbideWell/main/public/data/verses.json',

  // The explanation library. Read from GitHub so a batch that finishes in
  // CI shows up without a redeploy.
  explain:
    'https://raw.githubusercontent.com/Dailyverse0001/AbideWell/main/public/data/explain.json',

  // Shown only if the archive is ever empty. KJV is public domain.
  fallbackVerse: {
    date: '2026-11-10',
    reference: 'Lamentations 3:22-23',
    version: 'KJV',
    note: 'His mercy is new today.',
    text:
      "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness."
  }
};
