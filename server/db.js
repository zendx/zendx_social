import mysql from 'mysql2/promise';
import { database } from './config.js';
export const pool = mysql.createPool(database);
pool.on('connection', connection => {
  connection.query('SET time_zone = ?', [database.timezone]);
});
export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
