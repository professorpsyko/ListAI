import IORedis from 'ioredis';
import { config } from '../config';

// Shared Redis connection used by BullMQ
export const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => {
  console.error('Redis connection error:', err);
});

redisConnection.on('connect', () => {
  console.log('Redis connected');
});
