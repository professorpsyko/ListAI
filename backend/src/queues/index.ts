import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis';

export const imageQueue = new Queue('image-processing', {
  connection: createRedisConnection('redis:image-queue'),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

export const pricingQueue = new Queue('pricing-research', {
  connection: createRedisConnection('redis:pricing-queue'),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
