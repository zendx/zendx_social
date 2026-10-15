import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PostgresConnection } from '../server/postgres.js';
import { applySchema } from '../server/schema.js';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { SQLSessionStore } from '../server/session-store.js';
import { processQueue } from '../server/worker.js';

// An in-memory PostgreSQL engine: no network access and no cloud credentials.
// PGlite executes the real schema, PL/pgSQL triggers, constraints, and SQL.
const engine = new PGlite({ parsers: { 1114: value => value, 1082: value => value } });
const client = {
  async query(sql, values = []) {
    if (sql.includes('CREATE SCHEMA IF NOT EXISTS')) { await engine.exec(sql); return { rows: [], command: 'CREATE', rowCount: 0 }; }
    const r = await engine.query(sql, values);
    return { ...r, command: r.command || sql.trim().split(/\s/)[0].toUpperCase(), rowCount: r.affectedRows ?? r.rows.length };
  },
  release() {},
};
const connection = new PostgresConnection(client);
const testPool = {
  async getConnection() { return connection; },
  execute: (sql, values = []) => connection.execute(sql, values),
  query: (sql, values = []) => connection.query(sql, values),
};
try {
  await engine.exec("CREATE ROLE anon; CREATE ROLE authenticated; SET TIME ZONE 'Africa/Lagos'; SET search_path TO zendx,pg_catalog;");
  await applySchema(connection);
  const db = async (sql, values = []) => (await testPool.execute(sql, values))[0];
  const store = new SQLSessionStore(testPool);
  await store.initialize();
  const legacyHash = (await bcrypt.hash('legacy-password', 4)).replace('$2b$', '$2y$');
  await db('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)', ['Legacy Admin', 'legacy@example.com', legacyHash, 'admin']);
  await applySchema(connection);
  assert.equal(Number((await db('SELECT COUNT(*) AS n FROM users'))[0].n), 1);
  let exchangeCount = 0;
  const fakeOAuth = {
    begin(provider) {
      const state = randomBytes(24).toString('hex');
      return { state, verifier: 'test-verifier', createdAt: Date.now(), url: `https://www.facebook.com/dialog/oauth?state=${state}` };
    },
    async complete(provider, code, verifier) {
      exchangeCount++;
      assert.equal(verifier, 'test-verifier');
      return [{ name: 'Authorized social account', config: { page_id: 'same-remote-page', access_token: `private-${code}`, page_access_token: `page-${code}`, expires_at: Date.now() + 3600000 } }];
    },
  };
  let resetUrl;
  const app = createApp({ db, pool: testPool, sessionStore: store, sessionSecret: randomBytes(32).toString('hex'), sendMail: async (email, url) => { resetUrl = url; }, oauth: fakeOAuth });
  const agent = request.agent(app);
  let csrf = (await agent.get('/api/session')).body.csrf;
  let response = await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({ email: 'legacy@example.com', password: 'legacy-password' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  csrf = response.body.csrf;
  const ownerId = response.body.user.id;
  const account = await db('INSERT INTO social_accounts (user_id,provider,account_name,config) VALUES ($1,$2,$3,$4) RETURNING id', [ownerId, 'facebook', 'Isolated test page', '{}']);
  const account2 = await db('INSERT INTO social_accounts (user_id,provider,account_name,config) VALUES ($1,$2,$3,$4) RETURNING id', [ownerId, 'twitter', 'Isolated test X', '{}']);
  const send = (route, body, method = 'post') => agent[method](route).set('X-CSRF-Token', csrf).send(body);
  response = await send('/api/posts', { title: 'Never publish this draft', body: 'Draft', account_ids: [account.insertId] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const draftId = response.body.id;
  response = await send('/api/posts', { title: 'Future', body: 'Later', scheduled_at: '2099-01-01T09:00', account_ids: [account.insertId] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  response = await send('/api/posts', { title: 'Ready', body: 'Now', publish_now: true, account_ids: [account.insertId, account2.insertId] });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const scheduledId = response.body.id;
  const sent = [];
  const fakePublish = async (provider, config, post) => { sent.push(post.id); if (provider === 'twitter') throw new Error('Test provider failure'); return 'test-external-id'; };
  const results = await processQueue(testPool, fakePublish);
  assert.deepEqual(results, { published: 1, failed: 1 });
  assert.deepEqual(sent, [scheduledId, scheduledId]);
  assert.equal((await db('SELECT status FROM posts WHERE id=$1', [draftId]))[0].status, 'draft');
  assert.equal((await db('SELECT status FROM posts WHERE id=$1', [scheduledId]))[0].status, 'failed');
  const targets = await db('SELECT * FROM post_targets WHERE post_id=$1', [scheduledId]);
  const failed = targets.find(t => t.status === 'failed');
  response = await send(`/posts/${scheduledId}`, { body: 'Changed', account_ids: [] }, 'put');
  // Correct API route below: an unknown route must not fall through to the SPA.
  assert.equal(response.status, 404);
  response = await send(`/api/posts/${scheduledId}`, { body: 'Changed', account_ids: [] }, 'put');
  assert.equal(response.status, 409);
  response = await send(`/api/targets/${failed.id}/retry`, {});
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(await processQueue(testPool, async () => 'retry-id'), { published: 1, failed: 0 });
  assert.equal((await db('SELECT status FROM posts WHERE id=$1', [scheduledId]))[0].status, 'published');
  response = await send('/api/comments', { target_id: targets[0].id, comment: 'Internal note only' });
  assert.equal(response.status, 201);
  response = await agent.get('/api/workspace');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.comments.length, 1);
  assert.equal(response.body.accounts.some(a => 'config' in a || 'access_token' in a), false);
  response = await agent.post('/api/uploads').set('X-CSRF-Token', csrf).attach('media', Buffer.from('not-an-image'), { filename: 'fake.png', contentType: 'image/png' });
  assert.equal(response.status, 400);
  response = await send('/api/auth/forgot-password', { email: 'legacy@example.com' });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const token = new URL(resetUrl).searchParams.get('reset');
  assert.ok(token);
  assert.notEqual((await db('SELECT token FROM password_resets'))[0].token, token);
  response = await send('/api/auth/reset-password', { token, password: 'a-new-long-password' });
  assert.equal(response.status, 200);
  assert.equal((await send('/api/auth/reset-password', { token, password: 'another-password' })).status, 400);
  await send('/api/auth/logout', {});
  csrf = (await agent.get('/api/session')).body.csrf;
  response = await send('/api/auth/login', { email: 'legacy@example.com', password: 'a-new-long-password' });
  assert.equal(response.status, 200);
  // Supabase API roles must have neither schema access nor direct token access.
  const security = await db("SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='zendx'::regnamespace AND relkind='r'");
  assert.ok(security.length >= 13);
  assert.ok(security.every(t => t.relrowsecurity));
  for (const role of ['anon','authenticated']) {
    const [access] = await db('SELECT has_schema_privilege($1, \'zendx\', \'USAGE\') AS schema_access, has_table_privilege($1, \'zendx.social_accounts\', \'SELECT\') AS token_access', [role]);
    assert.equal(access.schema_access, false);
    assert.equal(access.token_access, false);
  }
  // Constraint, rollback, and updated-at behavior must be PostgreSQL-native.
  await assert.rejects(db("INSERT INTO posts (status) VALUES ('invalid')"), /check constraint/);
  await connection.beginTransaction();
  await db("UPDATE posts SET title='rollback-me' WHERE id=$1", [draftId]);
  await connection.rollback();
  assert.equal((await db('SELECT title FROM posts WHERE id=$1', [draftId]))[0].title, 'Never publish this draft');
  assert.equal(typeof response.body.user.id, 'number');
  const tracked = await db("INSERT INTO posts (body,updated_at) VALUES ('Before',TIMESTAMP '2000-01-01') RETURNING id");
  await db("UPDATE posts SET body='After' WHERE id=$1", [tracked.insertId]);
  assert.equal((await db("SELECT updated_at > TIMESTAMP '2000-01-01' AS advanced FROM posts WHERE id=$1", [tracked.insertId]))[0].advanced, true);
  // Unique email conflicts must map to the API's conflict response in Postgres.
  csrf = response.body.csrf;
  response = await send('/api/auth/register', { name: 'Duplicate', email: 'legacy@example.com', password: 'new-long-password' });
  assert.equal(response.status, 409);
  const dedupe = 'INSERT INTO post_comments (post_target_id,commenter_name,comment,external_id) VALUES ($1,$2,$3,$4) ON CONFLICT (post_target_id,external_id) WHERE external_id IS NOT NULL DO NOTHING';
  assert.equal((await db(dedupe, [targets[0].id, 'Reader', 'Hello', 'external-123'])).affectedRows, 1);
  assert.equal((await db(dedupe, [targets[0].id, 'Reader', 'Hello', 'external-123'])).affectedRows, 0);
  // OAuth redirects out, consumes a one-time state, and stores credentials for
  // the signed-in user, never globally. No actual provider requests are sent.
  async function connect(agent, code) {
    const start = await agent.get('/api/oauth/facebook/start');
    assert.equal(start.status, 302);
    const state = new URL(start.headers.location).searchParams.get('state');
    const done = await agent.get(`/api/oauth/facebook/callback?state=${state}&code=${code}`);
    assert.equal(done.status, 302);
    assert.match(new URL(done.headers.location).searchParams.get('notice'), /connected/);
    return state;
  }
  const state = await connect(agent, 'first-token');
  const beforeReplay = exchangeCount;
  await agent.get(`/api/oauth/facebook/callback?state=${state}&code=stolen`);
  assert.equal(exchangeCount, beforeReplay);
  let ownAccounts = (await agent.get('/api/workspace')).body.accounts;
  const connected = ownAccounts.find(a => a.account_name === 'Authorized social account');
  assert.ok(connected);
  assert.equal(connected.connection_status, 'connected');
  assert.equal(connected.is_active, true);
  assert.equal(connected.access_token, undefined);
  await connect(agent, 'refreshed-token');
  ownAccounts = (await agent.get('/api/workspace')).body.accounts;
  assert.equal(ownAccounts.filter(a => a.account_name === 'Authorized social account').length, 1);
  assert.equal(ownAccounts.find(a => a.account_name === 'Authorized social account').id, connected.id);
  // Another user sees no accounts, posts, notes, deliveries, or analytics.
  const second = request.agent(app);
  let secondCsrf = (await second.get('/api/session')).body.csrf;
  const registered = await second.post('/api/auth/register').set('X-CSRF-Token', secondCsrf).send({ name: 'Other User', email: 'other@example.com', password: 'other-user-password' });
  assert.equal(registered.status, 201);
  secondCsrf = registered.body.csrf;
  const otherId = registered.body.user.id;
  const otherSend = (route, body, method = 'post') => second[method](route).set('X-CSRF-Token', secondCsrf).send(body);
  const privateWorkspace = (await second.get('/api/workspace')).body;
  for (const field of ['accounts','posts','targets','comments']) assert.equal(privateWorkspace[field].length, 0, `Other user's ${field} leaked`);
  assert.equal((await otherSend('/api/posts', { body: 'Unauthorized', publish_now: true, account_ids: [account.insertId] })).status, 400);
  assert.equal((await otherSend(`/api/posts/${draftId}`, { body: 'Unauthorized edit' }, 'put')).status, 404);
  assert.equal((await otherSend(`/api/targets/${targets[0].id}/retry`, {})).status, 404);
  assert.equal((await otherSend('/api/comments', { target_id: targets[0].id, comment: 'Unauthorized note' })).status, 404);
  assert.equal((await otherSend(`/api/accounts/${connected.id}`, { is_active: false }, 'patch')).status, 404);
  assert.equal((await otherSend('/api/comments/sync', {})).body.message, 'Synced 0 new comments.');
  // Authorizing the same remote page under another app login keeps both users'
  // tokens separate and never overwrites the first user's connection.
  await connect(second, 'other-user-token');
  const secondAccounts = (await second.get('/api/workspace')).body.accounts;
  assert.equal(secondAccounts.length, 1);
  assert.notEqual(secondAccounts[0].id, connected.id);
  const tokens = await db('SELECT user_id,access_token FROM social_accounts WHERE remote_account_id=$1 ORDER BY user_id', ['same-remote-page']);
  assert.deepEqual(tokens.map(a => [a.user_id,a.access_token]), [[ownerId,'private-refreshed-token'],[otherId,'private-other-user-token']]);
  // Paused accounts disappear from posting eligibility, including queued work.
  assert.equal((await send(`/api/accounts/${connected.id}`, { is_active: false }, 'patch')).status, 200);
  assert.equal((await send('/api/posts', { body: 'Paused', publish_now: true, account_ids: [connected.id] })).status, 400);
  assert.equal((await send(`/api/accounts/${connected.id}`, { is_active: true }, 'patch')).status, 200);
  const queued = await send('/api/posts', { body: 'Pause before worker', publish_now: true, account_ids: [connected.id] });
  assert.equal(queued.status, 201);
  await send(`/api/accounts/${connected.id}`, { is_active: false }, 'patch');
  let deliveredPaused = false;
  assert.deepEqual(await processQueue(testPool, async () => { deliveredPaused = true; return 'should-not-send'; }), { published: 0, failed: 1 });
  assert.equal(deliveredPaused, false);
  await db("UPDATE social_accounts SET expires_at=LOCALTIMESTAMP-INTERVAL '1 hour',is_active=TRUE WHERE id=$1", [connected.id]);
  assert.equal((await agent.get('/api/workspace')).body.accounts.find(a => a.id === connected.id).connection_status, 'reconnect_required');
  assert.equal((await send('/api/posts', { body: 'Expired', publish_now: true, account_ids: [connected.id] })).status, 400);
  // Reject malformed legacy/cross-owner targets even if they exist in the DB.
  const badPost = await db("INSERT INTO posts (author_id,body,status,scheduled_at) VALUES ($1,'invalid ownership','scheduled',LOCALTIMESTAMP) RETURNING id", [ownerId]);
  await db('INSERT INTO post_targets (post_id,social_account_id) VALUES ($1,$2)', [badPost.insertId, secondAccounts[0].id]);
  let crossDelivered = false;
  assert.deepEqual(await processQueue(testPool, async () => { crossDelivered = true; return 'must-not-send'; }), { published: 0, failed: 1 });
  assert.equal(crossDelivered, false);
  console.log('Per-user OAuth and isolation passed: authorization redirects, callback/replay protection, reconnect identity, private dashboards, ownership checks, activation, expiry, and worker enforcement.');
  console.log('Isolated PostgreSQL integration passed: additive setup, PHP password compatibility, sessions, draft/future exclusion, delivery results, retry, notes, upload validation, password resets, RLS, constraints, rollback, triggers, duplicate registration, and comment deduplication.');
} finally {
  await engine.close();
}
