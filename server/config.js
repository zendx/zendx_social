import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const production = process.env.NODE_ENV === 'production';
export const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
export const database = {
  connectionString: process.env.DATABASE_URL || '',
  timezone: process.env.APP_TIMEZONE || 'Africa/Lagos',
  max: Number(process.env.DB_POOL_SIZE || 5),
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
};
