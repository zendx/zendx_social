import session from 'express-session';

// Use the maintained mysql2 connection pool rather than a second, outdated driver.
export class SQLSessionStore extends session.Store {
  constructor(pool) { super(); this.pool = pool; }
  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS app_sessions (
      sid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      expires BIGINT UNSIGNED NOT NULL,
      data MEDIUMTEXT NOT NULL,
      INDEX(expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }
  get(sid, callback) {
    this.pool.execute('SELECT data FROM app_sessions WHERE sid=? AND expires>?', [sid, Date.now()])
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null)).catch(callback);
  }
  set(sid, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 604800000;
    this.pool.execute('INSERT INTO app_sessions (sid,expires,data) VALUES (?,?,?) ON DUPLICATE KEY UPDATE expires=VALUES(expires),data=VALUES(data)', [sid, expires, JSON.stringify(value)])
      .then(() => callback(null)).catch(callback);
  }
  destroy(sid, callback = () => {}) {
    this.pool.execute('DELETE FROM app_sessions WHERE sid=?', [sid]).then(() => callback(null)).catch(callback);
  }
  touch(sid, value, callback = () => {}) {
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 604800000;
    this.pool.execute('UPDATE app_sessions SET expires=? WHERE sid=?', [expires, sid]).then(() => callback(null)).catch(callback);
  }
}
