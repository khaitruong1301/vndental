import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Biến môi trường đã có trong shell được ưu tiên hơn file .env (vd. CLINIC_DB_NAME=..._test)
loadEnv({ path: path.join(rootDir, '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name} trong .env`);
  return value;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  jwtSecret: required('JWT_SECRET'),
  clinicTz: 'Asia/Ho_Chi_Minh',
  uploadDir: path.join(rootDir, 'backend', 'uploads'),
  db: {
    host: process.env.CLINIC_DB_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: required('CLINIC_DB_NAME'),
    user: required('CLINIC_DB_USER'),
    password: required('CLINIC_DB_PASSWORD'),
  },
};
