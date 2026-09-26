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

/**
 * **How long an interactive transaction may take.**
 *
 * Prisma allows five seconds. That is ample against a database on the same
 * machine and not ample at all against one across a network: a quotation writes
 * its lines, layers and colours row by row, a job sheet writes twenty-one, a
 * job card fits a bill of materials onto real rolls and claims each one. Every
 * round trip inside the transaction costs the latency to the host.
 *
 * Seeding against the hosted database is what found this, but the deployed app
 * talks to that same database — so it was a bug waiting for a busy afternoon
 * rather than a seeding inconvenience.
 *
 * A longer limit makes nothing slower. It only stops correct work being thrown
 * away for taking six seconds instead of four.
 */
export const TX = { timeout: 30_000, maxWait: 10_000 } as const;
