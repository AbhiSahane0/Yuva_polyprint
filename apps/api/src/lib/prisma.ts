import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Prisma 7 runs on a driver adapter — the connection pool is owned by `pg`,
 * configured here rather than through the connection string.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.isProduction ? 20 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * A single PrismaClient per process. In development the module is re-evaluated
 * on hot reload, so the instance is cached on globalThis to avoid exhausting
 * the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.isDevelopment ? ['warn', 'error'] : ['error'],
  });

if (!env.isProduction) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    // $connect() is lazy with a driver adapter — issue a real query so a bad
    // DATABASE_URL or an unreachable database fails at boot, not on first request.
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connected');
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to connect to the database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
