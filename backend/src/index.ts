import app from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

// Vercel (serverless): nền tảng tự nhận app qua default export, không tự listen
if (!process.env.VERCEL) {
  const server = app.listen(config.port, () => {
    const mode = config.isProduction ? 'production' : 'development';
    console.log(`API phòng khám chạy tại cổng ${config.port} [${mode}] (DB: ${config.dbName})`);
  });

  const shutdown = () => {
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default app;
