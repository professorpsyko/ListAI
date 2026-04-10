import { Worker, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { redisConnection } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { researchPricing } from '../services/pricing';

interface PricingJobData {
  listingId: string;
  itemName: string;
  condition: string;
  category: string;
}

export function startPricingWorker() {
  const worker = new Worker<PricingJobData>(
    'pricing-research',
    async (job: Job<PricingJobData>) => {
      const { listingId, itemName, condition, category } = job.data;
      console.log(`[PricingWorker] Researching price for listing ${listingId}: ${itemName}`);

      await prisma.listing.update({
        where: { id: listingId },
        data: { pricingJobStatus: 'PROCESSING' },
      });

      const result = await researchPricing({ itemName, condition, category });

      await prisma.listing.update({
        where: { id: listingId },
        data: {
          pricingResearch: result as unknown as Prisma.InputJsonValue,
          suggestedPrice: result.suggestedPrice,
          pricingJobStatus: 'COMPLETE',
          pricingJobId: job.id ?? null,
        },
      });

      console.log(`[PricingWorker] Done for listing ${listingId}. Suggested: $${result.suggestedPrice}`);
      return result;
    },
    {
      connection: redisConnection,
      concurrency: 3,
    },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      console.error(`[PricingWorker] Job ${job.id} failed:`, err.message);
      await prisma.listing.update({
        where: { id: job.data.listingId },
        data: { pricingJobStatus: 'FAILED' },
      }).catch(console.error);
    }
  });

  console.log('[PricingWorker] Started');
  return worker;
}
