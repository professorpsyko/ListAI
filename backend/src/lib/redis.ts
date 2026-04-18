import IORedis from 'ioredis';
import { config } from '../config';

/**
 * BullMQ requires each Queue, Worker, and QueueEvents instance to have its
 * own dedicated IORedis connection. Workers in particular use a blocking
 * BLMOVE command that monopolises a connection — sharing one connection
 * between a Queue and a Worker causes the worker to silently stop receiving
 * jobs.
 *
 * Call createRedisConnection() once per Queue/Worker instance.
 */
export function createRedisConnection(label = 'redis'): IORedis {
  const conn = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });
  conn.on('error', (err) => console.error(`[${label}] Redis error:`, err.message));
  conn.on('connect', () => console.log(`[${label}] Redis connected`));
  return conn;
}

// Backwards-compat alias used by existing queue definitions
export const redisConnection = createRedisConnection('redis:queue-default');
