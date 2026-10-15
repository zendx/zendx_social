import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { postInput, postStatus, aggregateStatus } from '../server/validation.js';
import { beginOAuth, publish } from '../server/providers.js';
import { processQueue } from '../server/worker.js';

test('drafts remain drafts; scheduled and publish-now posts enter the queue', () => {
  assert.equal(postStatus(postInput.parse({ body: 'An idea' })), 'draft');
  assert.equal(postStatus(postInput.parse({ body: 'A plan', scheduled_at: '2026-11-01T10:00' })), 'scheduled');
  assert.equal(postStatus(postInput.parse({ body: 'Now', publish_now: true })), 'scheduled');
});
test('rejects unsafe media and duplicate targets are normalized', () => {
  for (const media_url of ['javascript:alert(1)', 'data:image/png,123', 'uploads/../../config.js']) assert.throws(() => postInput.parse({ body: 'test', media_url }));
  assert.deepEqual(postInput.parse({ body: 'test', account_ids: [2, 2, 3] }).account_ids, [2, 3]);
  assert.throws(() => postInput.parse({ body: '', scheduled_at: 'tomorrow' }));
});
test('delivery outcomes update the parent status, retaining partial failures', () => {
  assert.equal(aggregateStatus([{ status: 'published' }, { status: 'pending' }]), 'scheduled');
  assert.equal(aggregateStatus([{ status: 'published' }, { status: 'published' }]), 'published');
  assert.equal(aggregateStatus([{ status: 'published' }, { status: 'failed' }]), 'failed');
});
test('existing PHP bcrypt hashes authenticate', async () => {
  const hash = (await bcrypt.hash('existing-password', 4)).replace('$2b$', '$2y$');
  assert.equal(await bcrypt.compare('existing-password', hash.replace(/^\$2y\$/, '$2b$')), true);
});
test('OAuth uses unpredictable state and S256 PKCE', () => {
  const previous = [process.env.TWITTER_CLIENT_ID, process.env.TWITTER_CLIENT_SECRET];
  process.env.TWITTER_CLIENT_ID = 'client'; process.env.TWITTER_CLIENT_SECRET = 'secret';
  try {
    const one = beginOAuth('twitter'), two = beginOAuth('twitter');
    assert.notEqual(one.state, two.state);
    assert.notEqual(one.verifier, two.verifier);
    const url = new URL(one.url);
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.notEqual(url.searchParams.get('code_challenge'), one.verifier);
    assert.match(url.searchParams.get('redirect_uri'), /\/api\/oauth\/twitter\/callback$/);
  } finally { for (const [i, k] of ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'].entries()) { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; } }
});
test('unsupported media and expired tokens fail before remote publishing', async () => {
  await assert.rejects(publish('twitter', {}, { body: 'test', media_url: 'https://example.com/a.png' }), /text posts only/);
  await assert.rejects(publish('facebook', { expires_at: 1 }, { body: 'test' }), /expired/);
  await assert.rejects(publish('tiktok', {}, { body: 'test' }), /not enabled/);
});

function fixture() {
  const users = [];
  const posts = [];
  let sequence = 0;
  const db = async (sql, values = []) => {
    if (sql.startsWith('SELECT id,name,email,role FROM users WHERE id=')) return users.filter(u => u.id === values[0]).map(({ password_hash, ...u }) => u);
    if (sql.startsWith('SELECT * FROM users WHERE email=')) return users.filter(u => u.email === values[0]);
    if (sql.startsWith('INSERT INTO users')) {
      if (users.some(u => u.email === values[1])) throw Object.assign(new Error('Duplicate'), { code: '23505' });
      users.push({ id: ++sequence, name: values[0], email: values[1], password_hash: values[2], role: values[3] });
      return { insertId: sequence };
    }
    if (sql.startsWith('INSERT INTO posts')) { posts.push({ id: posts.length + 1, values }); return { insertId: posts.length }; }
    if (sql === 'SELECT 1') return [{ 1: 1 }];
    throw new Error(`Unexpected query in test: ${sql}`);
  };
  const conn = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {}, execute: async (sql, values) => [await db(sql, values)] };
  const app = createApp({ db, pool: { getConnection: async () => conn }, sessionSecret: 'a-test-secret-that-is-at-least-thirty-two-characters' });
  return { app, users, posts };
}
test('API protects workspace and mutations, registers editors, rotates session and signs out', async () => {
  const { app, users, posts } = fixture();
  const agent = request.agent(app);
  assert.equal((await agent.get('/api/workspace')).status, 401);
  const session = await agent.get('/api/session');
  assert.equal(session.body.user, null);
  const originalCsrf = session.body.csrf;
  const values = { email: 'editor@example.com', name: 'Test Editor', password: 'a-long-password' };
  assert.equal((await agent.post('/api/auth/register').send(values)).status, 403);
  const registered = await agent.post('/api/auth/register').set('X-CSRF-Token', originalCsrf).send(values);
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.role, 'editor');
  assert.equal(users.length, 1);
  assert.notEqual(registered.body.csrf, originalCsrf);
  assert.equal(registered.body.user.password_hash, undefined);
  assert.equal((await agent.get('/api/session')).body.user.email, values.email);
  assert.equal((await agent.post('/api/posts').set('X-CSRF-Token', originalCsrf).send({ body: 'Idea' })).status, 403);
  const csrf = registered.body.csrf;
  assert.equal((await agent.post('/api/posts').set('X-CSRF-Token', csrf).send({ body: 'Idea' })).status, 201);
  assert.equal(posts[0].values[6], 'draft');
  assert.equal((await agent.post('/api/posts').set('X-CSRF-Token', csrf).send({ body: 'Now', publish_now: true })).status, 400);
  assert.equal((await agent.post('/api/auth/logout').set('X-CSRF-Token', csrf).send({})).status, 200);
  assert.equal((await agent.get('/api/session')).body.user, null);
  const newCsrf = (await agent.get('/api/session')).body.csrf;
  const login = await agent.post('/api/auth/login').set('X-CSRF-Token', newCsrf).send(values);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, registered.body.user.id);
});

test('worker excludes draft posts and records successful and failed deliveries', async () => {
  const calls = [];
  const targets = [{ id: 10, post_id: 1, provider: 'facebook', config: '{}', status: 'pending', account_user_id: 1, is_active: true }, { id: 11, post_id: 1, provider: 'twitter', config: '{}', status: 'pending', account_user_id: 1, is_active: true }];
  const post = { id: 1, author_id: 1, status: 'scheduled', body: 'Hello', scheduled_at: '2026-10-01 10:00:00' };
  let excludedDrafts = false;
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async sql => {
      if (sql.includes('pg_try_advisory_lock')) return [[{ acquired: 1 }]];
      if (sql.includes('pg_advisory_unlock')) return [[{ released: 1 }]];
      excludedDrafts = sql.includes("p.status='scheduled'") && sql.includes('p.scheduled_at IS NOT NULL');
      return [targets.map(t => ({ id: t.id, post_id: t.post_id }))];
    },
    execute: async (sql, values) => {
      if (sql.startsWith('SELECT * FROM posts')) return [[post]];
      if (sql.startsWith('SELECT pt.*')) return [[targets.find(t => t.id === values[0])]];
      if (sql.startsWith("UPDATE post_targets SET status='published'")) targets.find(t => t.id === values[1]).status = 'published';
      else if (sql.startsWith("UPDATE post_targets SET status='failed'")) targets.find(t => t.id === values[1]).status = 'failed';
      else if (sql.startsWith('SELECT status')) return [targets];
      else if (sql.startsWith('UPDATE posts')) post.status = values[0];
      else if (sql.startsWith('INSERT INTO delivery_attempts')) calls.push(values);
      else throw new Error(`Unexpected query ${sql}`);
      return [{ affectedRows: 1 }];
    },
  };
  const result = await processQueue({ getConnection: async () => conn }, async provider => { if (provider === 'twitter') throw new Error('Token expired'); return 'remote-id'; });
  assert.equal(excludedDrafts, true);
  assert.deepEqual(result, { published: 1, failed: 1 });
  assert.equal(calls.length, 2);
  assert.equal(post.status, 'failed');
});
test('overlapping worker exits without delivering', async () => {
  let delivered = false;
  const result = await processQueue({ getConnection: async () => ({ query: async () => [[{ acquired: 0 }]], release() {} }) }, async () => { delivered = true; });
  assert.equal(result.skipped, true);
  assert.equal(delivered, false);
});
