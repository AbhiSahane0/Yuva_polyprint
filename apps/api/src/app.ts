import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.route.js';
import { env } from './config/env.js';
import { createOriginMatcher } from './config/cors.js';

/**
 * Builds the Express application. Kept separate from server.ts so tests can
 * import the app without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Behind a load balancer / reverse proxy in every deployed environment.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  /*
   * A function rather than a list, so CORS_ORIGINS can carry wildcards and one
   * setting covers every Vercel preview URL. See config/cors.ts.
   *
   * Requests with no Origin header are allowed: that is curl, server-to-server
   * calls, and — the case that matters here — the Vercel rewrite, which proxies
   * /api from the edge and so never presents a browser origin at all.
   */
  const isAllowedOrigin = createOriginMatcher(env.corsOrigins);
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, origin === undefined || isAllowedOrigin(origin));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(requestLogger);

  // Probes live outside /api so they are never rate-limited.
  app.use('/health', healthRoutes);

  app.use('/api', apiRateLimiter, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
