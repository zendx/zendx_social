import crypto from 'node:crypto';
import { production } from './config.js';
import { SQLSessionStore } from './session-store.js';
import { pool, query } from './db.js';
import { createApp } from './app.js';

if (production && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET.startsWith('replace-'))) throw new Error('Set a strong SESSION_SECRET before starting in production.');
const secret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is unset. Sessions will reset when the server restarts.');
const store = new SQLSessionStore(pool);
try { await store.initialize(); }
catch (e) { console.error('Database is unavailable. Start MySQL and run npm run db:setup.'); await pool.end(); process.exit(1); }
const app = createApp({ db: query, pool, sessionStore: store, sessionSecret: secret });
const server = app.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(`ZendX Social API listening on http://localhost:${process.env.PORT || 3001}`));
async function shutdown() { server.close(); await pool.end(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
