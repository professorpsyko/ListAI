import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { processMultipleImages } from '../services/image';

interface ImageJobData {
  listingId: string;
  publicIds: string[];
}

export function startImageWorker() {
  const worker = new Worker<ImageJobData>(
    'image-processing',
    async (job: Job<ImageJobData>) => {
      const { listingId, publicIds } = job.data;
      console.log(`[ImageWorker] Processing ${publicIds.length} images for listing ${listingId}`);

      await prisma.listing.update({
        where: { id: listingId },
        data: { imageJobStatus: 'PROCESSING' },
      });

      const results = await processMultipleImages(publicIds);

      const processedUrls = results.map((r) => r.processedUrl);
      const failedCount = results.filter((r) => r.failed).length;

      await prisma.listing.update({
        where: { id: listingId },
        data: {
          processedImageUrls: processedUrls,
          imageJobStatus: failedCount === results.length ? 'FAILED' : 'COMPLETE',
          imageJobId: job.id ?? null,
        },
      });

      console.log(
        `[ImageWorker] Done for listing ${listingId}. ${failedCount} failed, ${results.length - failedCount} succeeded.`,
      );

      return { processedUrls, failedCount };
    },
    {
      connection: createRedisConnection('redis:image-worker'),
      concurrency: 5,
    },
  );

  worker.on('error', (err) => {
    console.error('[ImageWorker] Worker error:', err.message);
  });

  worker.on('failed', async (job, err) => {
    if (job) {
      console.error(`[ImageWorker] Job ${job.id} failed:`, err.message);
      await prisma.listing.update({
        where: { id: job.data.listingId },
        data: { imageJobStatus: 'FAILED' },
      }).catch(console.error);
    }
  });

  console.log('[ImageWorker] Started');
  return worker;
}
