import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { applySchema } from './schema.js';

let connection;
try {
  connection = await pool.getConnection();
  await applySchema(connection);
  const [[{ count }]] = await connection.execute('SELECT COUNT(*) AS count FROM users');
  if (Number(count) === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12) throw Object.assign(new Error('ADMIN_PASSWORD must have at least 12 characters.'), { code: 'INVALID_ADMIN_PASSWORD' });
    await connection.execute('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4)', [process.env.ADMIN_NAME || 'Administrator', process.env.ADMIN_EMAIL, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), 'admin']);
    console.log('Administrator created from environment settings.');
  }
  console.log('Supabase/PostgreSQL schema zendx is ready. Existing records preserved.');
} catch (e) {
  console.error(e.code === 'INVALID_ADMIN_PASSWORD'
    ? 'Administrator creation failed: ADMIN_PASSWORD must have at least 12 characters. Update it in .env and run npm run db:setup again. The database schema is ready; existing records were preserved.'
    : process.env.DATABASE_URL ? `Database setup failed (${e.code || 'configuration'}). Check the Session pooler URL, certificate settings, and schema-owner permissions.` : 'Set DATABASE_URL in .env to your Supabase Session pooler connection string before running setup.');
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
