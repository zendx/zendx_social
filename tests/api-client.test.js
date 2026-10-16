import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/api.js';

test('API client explains non-JSON proxy responses without exposing their contents', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('The page cannot be displayed', { status: 502 });
    await assert.rejects(api('/auth/login'), error => error.status === 502 && /Node API/.test(error.message) && !/Unexpected token/.test(error.message));
    globalThis.fetch = async () => new Response('<html>Proxy error</html>', { status: 200 });
    await assert.rejects(api('/session'), /Node API/);
    globalThis.fetch = async () => Response.json({ error: 'Email or password is incorrect.' }, { status: 401 });
    await assert.rejects(api('/auth/login'), error => error.status === 401 && error.message === 'Email or password is incorrect.');
    globalThis.fetch = async () => Response.json({ user: null, csrf: 'session-token' });
    assert.equal((await api('/session')).csrf, 'session-token');
  } finally { globalThis.fetch = original; }
});
