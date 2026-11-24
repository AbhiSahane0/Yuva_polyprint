import { createApp } from './app.js';
import { env } from './config/env.js';
import { pointsAtNobody } from './modules/quotations/quotation-link.js';
import { logger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { closePdfBrowser } from './lib/pdf.js';

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);

    /*
     * Said at boot, not at the first send.
     *
     * A quotation's accept link is built from PUBLIC_APP_URL. Unset on a
     * deployed server it falls back to the dev default, and the send then
     * fails — correctly, but hours later and in front of a customer. One line
     * here puts it in the deploy log instead.
     */
    if (pointsAtNobody(env.PUBLIC_APP_URL.replace(/\/+$/, ''), env.isProduction)) {
      logger.error(
        'PUBLIC_APP_URL is not set, so quotation accept links cannot be made. ' +
          'Set it to the public address of the web app.',
      );
    }
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
