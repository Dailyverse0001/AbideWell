import { handleRequest } from '../lib/post-core.js';

export default async function handler(req, res) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  const result = await handleRequest({
    method: req.method,
    headers: req.headers,
    body: req.body,
    ip
  });

  res.status(result.status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(result.body));
}
