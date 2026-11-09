/* Abidewell — shared settings. Edit this file to rename or re-theme the site. */
window.ABIDEWELL = {
  name: 'Abidewell',
  tagline: 'A verse to abide in, every day.',
  timeZone: 'Asia/Kolkata',

  // The admin screen tries these in order, so it works on Vercel and Netlify.
  api: ['/api/post', '/.netlify/functions/post'],

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
