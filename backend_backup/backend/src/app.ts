import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/** Builds the Express app (no listen) so Supertest can import it directly. */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Render's proxy
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (curl, Postman, server-to-server) with no Origin header.
        if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'KaarigarLink API. See /api/health', data: null });
  });
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
