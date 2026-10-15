import { pool, query } from './db.js';

// Read-only connection/schema check. Never print the connection URL or password.
try {
  const [state] = await query("SELECT current_setting('TimeZone') AS timezone, to_regclass('zendx.users') IS NOT NULL AS schema_ready");
  if (!state.schema_ready) {
    console.error('PostgreSQL connection succeeded. Run npm run db:setup to create the ZendX schema.');
    process.exitCode = 1;
  } else console.log(`Supabase/PostgreSQL is connected; ZendX schema is present; timezone: ${state.timezone}.`);
} catch (e) {
  console.error(process.env.DATABASE_URL ? `Connection check failed (${e.code || 'configuration'}). Verify DATABASE_URL, the Session pooler endpoint, and TLS certificate configuration.` : 'DATABASE_URL is empty. Add the Supabase Session pooler connection string to .env.');
  process.exitCode = 1;
} finally { await pool.end(); }
