import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { apiRateLimiter } from './middleware/rate-limit.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.route.js';
import docsRoutes from './openapi/docs.routes.js';
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

  /*
   * Helmet everywhere, with one exception carved out below.
   *
   * Its default Content-Security-Policy forbids the inline styles and scripts
   * Swagger UI ships with, so the docs page renders as unstyled markup with a
   * console full of CSP violations. The exception is scoped to /docs and only
   * relaxes what that page needs — every route that touches data keeps the
   * strict policy.
   */
  app.use(
    '/docs',
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
        },
      },
      // The page is meant to be linkable and readable from anywhere.
      crossOriginEmbedderPolicy: false,
    }),
  );
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

  /*
   * The API's own documentation, and the spec behind it.
   *
   * Deliberately unauthenticated: reading it changes nothing, and every
   * endpoint it describes answers 401 without a session. Outside /api so the
   * rate limiter meant for real traffic does not count somebody reading.
   */
  app.use('/docs', docsRoutes);

  app.use('/api', apiRateLimiter, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
