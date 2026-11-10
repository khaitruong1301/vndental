import { createApp } from './app';
import { config } from './config';
import { pool } from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  const mode = config.isProduction ? 'production' : 'development';
  console.log(`API phòng khám chạy tại cổng ${config.port} [${mode}] (DB: ${config.dbName})`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
