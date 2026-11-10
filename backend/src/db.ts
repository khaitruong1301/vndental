import pg from 'pg';
import { config } from './config';

// date → 'YYYY-MM-DD' (tránh lệch múi giờ), numeric/bigint → number
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(20, (v) => parseInt(v, 10));

export const pool = new pg.Pool({
  ...config.db,
  // Dùng connection string trực tiếp (không qua pooler) để tham số khởi động timezone có hiệu lực
  options: `-c timezone=${config.clinicTz}`,
});

export type Queryable = pg.Pool | pg.PoolClient;

export async function query<T = Record<string, any>>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, any>>(
  sql: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(sql, params, db);
  return rows[0] ?? null;
}

/**
 * Chạy fn trong một transaction, gắn app.staff_id (và app.change_reason) để trigger
 * audit_logs / stock_movements ghi đúng người thao tác.
 */
export async function withTx<T>(
  staffId: number,
  fn: (client: pg.PoolClient) => Promise<T>,
  changeReason?: string,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.staff_id', $1, true), set_config('app.change_reason', $2, true)",
      [String(staffId), changeReason ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
