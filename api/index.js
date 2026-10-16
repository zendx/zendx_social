import crypto from 'node:crypto';
import { createApp } from '../server/app.js';
import { SQLSessionStore } from '../server/session-store.js';
import { pool, query } from '../server/db.js';

let ready;
async function initialize() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-')) {
    throw new Error('Set a strong SESSION_SECRET in Vercel environment variables.');
  }
  const store = new SQLSessionStore(pool);
  await store.initialize();
  return createApp({ db: query, pool, sessionStore: store, sessionSecret: secret });
}

// Reuse the application and database pool across warm function invocations.
export default async function handler(req, res) {
  try {
    ready ||= initialize().catch(error => { ready = undefined; throw error; });
    const app = await ready;
    return app(req, res);
  } catch (error) {
    const reference = crypto.randomUUID();
    console.error('API initialization failed', { reference, code: error.code || 'configuration' });
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: `The API could not start. Check the Vercel environment variables and database connection. Reference: ${reference}` }));
  }
}
