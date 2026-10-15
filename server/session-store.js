import session from 'express-session';

// Sessions stay server-side in the protected PostgreSQL application schema.
export class SQLSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS app_sessions (
      sid VARCHAR(128) PRIMARY KEY,
      expires BIGINT NOT NULL,
      data TEXT NOT NULL
    )`);
    await this.pool.query('CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions(expires)');
    await this.pool.query('ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY');
  }
  get(sid, callback) {
    this.pool.execute('SELECT data FROM app_sessions WHERE sid=$1 AND expires>$2', [sid, Date.now()])
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null)).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 604800000;
    this.pool.execute('INSERT INTO app_sessions (sid,expires,data) VALUES ($1,$2,$3) ON CONFLICT (sid) DO UPDATE SET expires=EXCLUDED.expires,data=EXCLUDED.data', [sid, expires, JSON.stringify(value)])
      .then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    this.pool.execute('DELETE FROM app_sessions WHERE sid=$1', [sid]).then(() => callback(null)).catch(callback);
  }
  touch(sid, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 604800000;
    this.pool.execute('UPDATE app_sessions SET expires=$1 WHERE sid=$2', [expires, sid]).then(() => callback(null)).catch(callback);
  }
}
