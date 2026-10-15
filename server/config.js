import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const production = process.env.NODE_ENV === 'production';
export const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
export const database = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'zendx',
  timezone: process.env.DB_TIMEZONE || '+01:00',
  dateStrings: true,
  connectionLimit: 10,
  connectTimeout: 5000,
};
