
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env as workerEnv } from 'cloudflare:workers';

export function getDatabaseConnectionString() {
  const hyperdrive = workerEnv.HYPERDRIVE?.connectionString?.trim();
  if (hyperdrive) return hyperdrive;

  // Never bypass Hyperdrive in a deployed production build.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('HYPERDRIVE binding is not configured.');
  }
  const connectionString = workerEnv.DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('Database connection is not configured.');
  }

  return connectionString;
}

export function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getDatabaseConnectionString() });

  return new PrismaClient({ adapter });
}
