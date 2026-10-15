import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { database, root } from './config.js';

let connection;
try { connection = await mysql.createConnection({ ...database, database: undefined, multipleStatements: true }); }
catch (e) { console.error(`Cannot connect to MySQL at ${database.host}:${database.port} (${e.code}). Check that MySQL is ready and the .env credentials are correct.`); process.exit(1); }
try {
  // Never execute the legacy import's DROP TABLE statements against existing data.
  await connection.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database.database]);
  await connection.query('USE ??', [database.database]);
  const source = await readFile(`${root}/database/schema.sql`, 'utf8');
  const tables = source.match(/CREATE TABLE [\s\S]*?ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;/g) || [];
  for (const table of tables) await connection.query(table);
  await connection.query(`CREATE TABLE IF NOT EXISTS delivery_attempts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    target_id INT UNSIGNED NOT NULL,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    INDEX(target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [[{ count }]] = await connection.query('SELECT COUNT(*) AS count FROM users');
  if (count === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
    await connection.execute('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)', [process.env.ADMIN_NAME || 'Administrator', process.env.ADMIN_EMAIL, await bcrypt.hash(process.env.ADMIN_PASSWORD, 12), 'admin']);
    console.log('Administrator created from environment settings.');
  }
  console.log(`Database ${database.database} ready. Existing records preserved.`);
} finally { await connection.end(); }
