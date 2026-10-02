import app from './app.js';
import env from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { cleanupStaleUploads } from './services/cleanupService.js';

async function main() {
  await connectDb();

  const server = app.listen(env.port, () => {
    logger.info(`EmailClean AI API listening on http://localhost:${env.port}`);
    logger.info(`Validator service: ${env.validatorUrl}`);
  });

  // Periodically remove abandoned upload files so the disk never fills up.
  const cleanupTimer = setInterval(
    () => cleanupStaleUploads().catch((err) => logger.warn('Cleanup failed:', err.message)),
    Math.max(60000, Math.floor(env.uploadTtlMs / 4))
  );
  cleanupTimer.unref();
  cleanupStaleUploads().catch(() => {});

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down...`);
    clearInterval(cleanupTimer);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
  process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
