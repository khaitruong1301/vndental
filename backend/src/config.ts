import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import type { PoolConfig } from 'pg';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const isProduction = process.env.NODE_ENV === 'production';

// Thứ tự ưu tiên: biến đã có trong shell / nền tảng host > .env.production (khi production) > .env
// (dotenv không ghi đè biến đã tồn tại). Trên host online chỉ cần khai báo biến môi trường, không cần file.
if (isProduction) loadEnv({ path: path.join(rootDir, '.env.production'), quiet: true });
loadEnv({ path: path.join(rootDir, '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

/**
 * Kết nối DB:
 * - Production / DB online (Neon...): DATABASE_URL = postgresql://user:pass@host/db?sslmode=verify-full
 * - Local (Docker): CLINIC_DB_NAME / CLINIC_DB_USER / CLINIC_DB_PASSWORD (+ CLINIC_DB_HOST, POSTGRES_PORT)
 */
function dbConfig(): { pool: PoolConfig; name: string } {
  const url = process.env.DATABASE_URL;
  if (url) {
    return { pool: { connectionString: url }, name: decodeURIComponent(new URL(url).pathname.slice(1)) };
  }
  if (isProduction) throw new Error('Thiếu biến môi trường DATABASE_URL (production)');
  const database = required('CLINIC_DB_NAME');
  return {
    pool: {
      host: process.env.CLINIC_DB_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      database,
      user: required('CLINIC_DB_USER'),
      password: required('CLINIC_DB_PASSWORD'),
    },
    name: database,
  };
}

function jwtSecret(): string {
  const secret = required('JWT_SECRET');
  if (isProduction && secret.length < 32) throw new Error('JWT_SECRET production phải dài tối thiểu 32 ký tự');
  return secret;
}

const db = dbConfig();

export const config = {
  isProduction,
  // Nền tảng host (Render, Railway...) cấp cổng qua PORT
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  jwtSecret: jwtSecret(),
  clinicTz: 'Asia/Ho_Chi_Minh',
  uploadDir: process.env.UPLOAD_DIR ?? path.join(rootDir, 'backend', 'uploads'),
  db: { ...db.pool, max: Number(process.env.DB_POOL_MAX ?? 10) } satisfies PoolConfig,
  dbName: db.name,
};
