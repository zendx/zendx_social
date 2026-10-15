// Preserve the API repository's result contract using native PostgreSQL queries.
// No SQL rewriting or MySQL driver is used.
export function normalizeResult(result) {
  return ['INSERT', 'UPDATE', 'DELETE'].includes(result.command)
    ? { insertId: result.rows[0]?.id, affectedRows: result.rowCount }
    : result.rows;
}
export class PostgresConnection {
  constructor(client) { this.client = client; }
  async execute(sql, values = []) { return [normalizeResult(await this.client.query(sql, values))]; }
  query(sql, values = []) { return this.execute(sql, values); }
  async raw(sql, values = []) { return this.client.query(sql, values); }
  async beginTransaction() { await this.client.query('BEGIN'); }
  async commit() { await this.client.query('COMMIT'); }
  async rollback() { await this.client.query('ROLLBACK'); }
  release(destroy = false) { this.client.release(destroy); }
}
