import { handleRequest } from '../../lib/post-core.js';

export async function handler(event) {
  const headers = event.headers || {};

  const result = await handleRequest({
    method: event.httpMethod,
    headers,
    body: event.body,
    ip:
      headers['x-nf-client-connection-ip'] ||
      headers['client-ip'] ||
      (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      'unknown'
  });

  return {
    statusCode: result.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(result.body)
  };
}
