import pg from 'pg';
import { readFileSync } from 'node:fs';
import { database } from './config.js';
import { PostgresConnection } from './postgres.js';

// Preserve local datetime strings used by the existing calendar and composer.
pg.types.setTypeParser(1114, value => value);
pg.types.setTypeParser(1082, value => value);

export function postgresOptions(config = database) {
  if (!config.connectionString) throw new Error('Set DATABASE_URL in .env to your Supabase Session pooler or direct PostgreSQL connection string.');
  const url = new URL(config.connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection string.');
  if (url.port === '6543' || url.searchParams.get('pgbouncer') === 'true') throw new Error('Use the Supabase Session pooler on port 5432. The publishing worker requires session advisory locks.');
  // URL sslmode must not override certificate verification in node-postgres.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (process.env.DB_SSL === 'false' && !local) throw new Error('TLS cannot be disabled for a remote database.');
  return {
    connectionString: url.toString(), max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis, idleTimeoutMillis: config.idleTimeoutMillis,
    ssl: local && process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true, ...((process.env.DB_SSL_CA_FILE || process.env.VERCEL) ? { ca: readFileSync(process.env.DB_SSL_CA_FILE || new URL('../database/prod-ca-2021.crt', import.meta.url), 'utf8') } : {}) },
  };
}
export function createDatabase(config = database) {
  let nativePool;
  function getPool() {
    if (!nativePool) {
      nativePool = new pg.Pool(postgresOptions(config));
      nativePool.on('error', () => console.error('An idle PostgreSQL connection failed. Check your Supabase connection.'));
    }
    return nativePool;
  }
  const pool = {
    async getConnection() {
      const client = await getPool().connect();
      try {
        await client.query("SELECT set_config('search_path', 'zendx,pg_catalog', false), set_config('TimeZone', $1, false)", [config.timezone]);
        return new PostgresConnection(client);
      } catch (e) { client.release(true); throw e; }
    },
    async execute(sql, params = []) {
      const conn = await pool.getConnection();
      try { return await conn.execute(sql, params); } finally { conn.release(); }
    },
    query(sql, params = []) { return pool.execute(sql, params); },
    async end() { if (nativePool) await nativePool.end(); },
  };
  return { pool, query: async (sql, params = []) => (await pool.execute(sql, params))[0] };
}
export const { pool, query } = createDatabase();
