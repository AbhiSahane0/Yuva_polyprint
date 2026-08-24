import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { closePdfBrowser } from './modules/quotations/quotation-pdf.js';

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  /** Drain in-flight requests before exiting so deploys don't drop traffic. */
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (closeError) => {
      if (closeError) {
        logger.error({ err: closeError }, 'Error while closing HTTP server');
      }
      await closePdfBrowser();
      await disconnectDatabase();
      clearTimeout(forceExit);
      process.exit(closeError ? 1 : 0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start API');
  process.exit(1);
});
