import { createApp } from './app';
import { config } from './config';
import { pool } from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`API phòng khám chạy tại http://localhost:${config.port} (DB: ${config.db.database})`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
