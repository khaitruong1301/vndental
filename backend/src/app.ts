import express from 'express';
import cookieParser from 'cookie-parser';
import { requireAuth, requirePasswordChanged } from './auth';
import { errorHandler } from './errors';
import adminRouter from './routes/admin';
import appointmentsRouter from './routes/appointments';
import authRouter from './routes/auth';
import billingRouter from './routes/billing';
import dashboardRouter from './routes/dashboard';
import lookupsRouter from './routes/lookups';
import notificationsRouter from './routes/notifications';
import patientsRouter from './routes/patients';
import plansRouter from './routes/plans';
import reportsRouter from './routes/reports';
import treatmentsRouter from './routes/treatments';

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
