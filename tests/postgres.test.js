import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresOptions } from '../server/db.js';
import { PostgresConnection, normalizeResult } from '../server/postgres.js';
import { processQueue } from '../server/worker.js';

test('Supabase TLS verifies certificates and connection strings never disable verification', () => {
  const saved = process.env.DB_SSL;
  process.env.DB_SSL = 'true';
  try {
    const config = postgresOptions({ connectionString: 'postgresql://postgres.project:secret@pooler.supabase.com:5432/postgres?sslmode=no-verify', max: 5 });
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
    assert.equal(config.max, 5);
    assert.throws(() => postgresOptions({ connectionString: '' }), /DATABASE_URL/);
    assert.throws(() => postgresOptions({ connectionString: 'mysql://localhost/db' }), /PostgreSQL/);
    assert.throws(() => postgresOptions({ connectionString: 'postgresql://postgres:secret@pooler.supabase.com:6543/postgres' }), /Session pooler/);
    process.env.DB_SSL = 'false';
    assert.throws(() => postgresOptions({ connectionString: 'postgresql://postgres:secret@pooler.supabase.com:5432/postgres' }), /TLS cannot be disabled/);
    assert.equal(postgresOptions({ connectionString: 'postgresql://postgres@localhost:5432/test' }).ssl, false);
  } finally { if (saved === undefined) delete process.env.DB_SSL; else process.env.DB_SSL = saved; }
});
test('native PostgreSQL results retain row counts and returning IDs', () => {
  assert.deepEqual(normalizeResult({ command: 'INSERT', rows: [{ id: 42 }], rowCount: 1 }), { insertId: 42, affectedRows: 1 });
  assert.deepEqual(normalizeResult({ command: 'UPDATE', rows: [], rowCount: 0 }), { insertId: undefined, affectedRows: 0 });
  assert.deepEqual(normalizeResult({ command: 'SELECT', rows: [{ name: 'Example' }], rowCount: 1 }), [{ name: 'Example' }]);
});
test('transactions stay on one PostgreSQL client and parameter values are never interpolated', async () => {
  const calls = [];
  const connection = new PostgresConnection({
    query: async (sql, values) => { calls.push({ sql, values }); return { command: 'SELECT', rows: [], rowCount: 0 }; },
    release: destroy => calls.push({ destroy }),
  });
  await connection.beginTransaction();
  await connection.execute('SELECT * FROM posts WHERE title=$1', ["'); DROP TABLE posts; --"]);
  await connection.rollback();
  connection.release(true);
  assert.deepEqual(calls.map(c => c.sql).slice(0, 3), ['BEGIN', 'SELECT * FROM posts WHERE title=$1', 'ROLLBACK']);
  assert.equal(calls[1].values[0], "'); DROP TABLE posts; --");
  assert.equal(calls[3].destroy, true);
});
test('worker destroys a connection when advisory lock cleanup fails', async () => {
  let destroyed = false;
  const connection = {
    async query(sql) {
      if (sql.includes('pg_try_advisory_lock')) return [[{ acquired: true }]];
      if (sql.includes('pg_advisory_unlock')) throw new Error('Disconnected');
      return [[]];
    },
    release(destroy) { destroyed = destroy; },
  };
  const result = await processQueue({ getConnection: async () => connection });
  assert.deepEqual(result, { published: 0, failed: 0 });
  assert.equal(destroyed, true);
});
