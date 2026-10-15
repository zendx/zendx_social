import { readFile } from 'node:fs/promises';
import { root } from './config.js';
export async function applySchema(connection) {
  const source = await readFile(`${root}/database/supabase.sql`, 'utf8');
  await connection.beginTransaction();
  try { await connection.raw(source); await connection.commit(); }
  catch (e) { await connection.rollback(); throw e; }
}
