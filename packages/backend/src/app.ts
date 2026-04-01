import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import patientRoutes from './routes/patients.js';
import consultationRoutes from './routes/consultations.js';
import kbeRoutes from './routes/kbe.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(compression());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/kbe', kbeRoutes);

// ---------------------------------------------------------------------------
// 404 & Error handlers
// ---------------------------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler as any);

export default app;
