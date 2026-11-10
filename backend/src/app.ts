import express from 'express';
import cookieParser from 'cookie-parser';
import { requireAuth, requirePasswordChanged } from './auth.js';
import { errorHandler } from './errors.js';
import adminRouter from './routes/admin.js';
import appointmentsRouter from './routes/appointments.js';
import authRouter from './routes/auth.js';
import billingRouter from './routes/billing.js';
import dashboardRouter from './routes/dashboard.js';
import lookupsRouter from './routes/lookups.js';
import notificationsRouter from './routes/notifications.js';
import patientsRouter from './routes/patients.js';
import plansRouter from './routes/plans.js';
import reportsRouter from './routes/reports.js';
import treatmentsRouter from './routes/treatments.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Chạy sau reverse proxy của host (HTTPS kết thúc ở proxy)
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRouter);

  // Mọi API bên dưới yêu cầu đăng nhập
  app.use('/api', requireAuth, requirePasswordChanged);
  app.use('/api/lookups', lookupsRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/treatments', treatmentsRouter);
  app.use('/api/plans', plansRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/reports', reportsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API không tồn tại' });
  });
  app.use(errorHandler);
  return app;
}

// Vercel nhận src/app.ts làm entrypoint → default export là Express app (local: src/index.ts dùng lại)
const app = createApp();
export default app;
