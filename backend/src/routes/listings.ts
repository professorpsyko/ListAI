import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { imageQueue } from '../queues';
import { researchPricing } from '../services/pricing';
import { suggestShipping } from '../services/shipping';
import { uploadToCloudinary, uploadEditedPhoto } from '../services/image';
import { identifyItem } from '../services/vision';
import { generateTitle, generateDescription } from '../services/listing-ai';
import { upsertListingMemory } from '../services/rag';
import { publishListing } from '../services/ebay';
import { refreshAccessToken } from '../services/ebay-oauth';
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Create listing
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.create({
    data: { userId: auth.user.id },
  });
  res.json(listing);
});

// Get listing
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }
  res.json(listing);
});

// Update listing
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const schema = z.object({
    itemTitle: z.string().optional(),
    itemDescription: z.string().optional(),
    itemCategory: z.string().optional(),
    itemCondition: z.string().optional(),
    itemColor: z.string().optional(),
    specialNotes: z.string().optional(),
    finalPrice: z.number().optional(),
    suggestedPrice: z.number().optional(),
    shippingService: z.string().optional(),
    shippingCost: z.number().optional(),
    handlingTime: z.string().optional(),
    acceptReturns: z.boolean().optional(),
    returnWindow: z.number().optional(),
    listingType: z.string().optional(),
    auctionDuration: z.number().optional(),
    startingBid: z.number().optional(),
    imageUrls: z.array(z.string()).optional(),
    processedImageUrls: z.array(z.string()).optional(),
    itemAspects: z.record(z.union([z.string(), z.array(z.string())])).optional(),
    ebayCategoryId: z.string().optional(),
    ebayCategoryName: z.string().optional(),
  });

  const parsed = schema.parse(req.body);
  // ebayCategoryName is a convenience alias for itemCategory — map it before writing to DB
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ebayCategoryName, ...rest } = parsed;
  const data = {
    ...rest,
    ...(ebayCategoryName !== undefined ? { itemCategory: ebayCategoryName } : {}),
  };
  const listing = await prisma.listing.updateMany({
    where: { id: req.params.id, userId: auth.user.id },
    data,
  });

  if (listing.count === 0) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const updated = await prisma.listing.findUnique({ where: { id: req.params.id } });
  res.json(updated);
});

// Upload photos
router.post(
  '/:id/photos',
  requireAuth,
  upload.array('photos', 16),
  async (req: Request, res: Response) => {
    const auth = req as AuthenticatedRequest;
    const listing = await prisma.listing.findFirst({
      where: { id: req.params.id, userId: auth.user.id },
    });
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    const files = req.files as Express.Multer.File[];
    if (!files?.length) {
      console.log('[upload] No files found in request');
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    console.log(`[upload] Received ${files.length} file(s) for listing ${req.params.id}`);

    // Upload all files to Cloudinary
    console.log('[upload] Starting Cloudinary upload...');
    let uploadResults: { url: string; publicId: string }[];
    try {
      uploadResults = await Promise.all(
        files.map((file) => uploadToCloudinary(file.buffer)),
      );
    } catch (cloudErr) {
      console.error('[upload] Cloudinary upload failed:', cloudErr);
      res.status(500).json({ error: 'Image upload to Cloudinary failed', detail: (cloudErr as Error).message });
      return;
    }
    console.log(`[upload] Cloudinary upload done — ${uploadResults.length} URL(s)`);

    const newUrls = uploadResults.map((r) => r.url);
    const newPublicIds = uploadResults.map((r) => r.publicId);

    // Append new URLs to the DB so downstream steps (identify, AI) can read them.
    // The frontend manages its own display list and will PATCH imageUrls to the
    // correct set whenever photos are added or removed.
    await prisma.listing.update({
      where: { id: req.params.id },
      data: { imageUrls: [...listing.imageUrls, ...newUrls], imageJobStatus: 'QUEUED' },
    });

    // Fire-and-forget: queue image processing without blocking the response
    imageQueue.add('process-images', {
      listingId: req.params.id,
      publicIds: newPublicIds,
    }).then((job) => {
      console.log(`[upload] Image job queued: ${job.id}`);
      prisma.listing.update({
        where: { id: req.params.id },
        data: { imageJobId: job.id ?? null },
      }).catch((e) => console.error('[upload] Failed to save jobId:', e));
    }).catch((e) => {
      console.error('[upload] Failed to queue image job (Redis may be down):', e);
    });

    console.log('[upload] Responding with URLs');
    // Return only the new URLs — the frontend appends these to its own list
    res.json({ urls: newUrls });
  },
);

// Save an edited photo (canvas data URL → Cloudinary → return new URL)
router.post('/:id/photos/edit', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }

  const { dataUrl } = req.body as { dataUrl: string };
  if (!dataUrl?.startsWith('data:')) {
    res.status(400).json({ error: 'dataUrl is required' });
    return;
  }

  try {
    const { url } = await uploadEditedPhoto(dataUrl);
    res.json({ url });
  } catch (err) {
    console.error('[photo-edit] Upload failed:', (err as Error).message);
    res.status(500).json({ error: 'Failed to upload edited photo' });
  }
});

// Get job status
router.get('/:id/job-status', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
    select: {
      imageJobStatus: true,
      imageJobId: true,
      pricingJobStatus: true,
      pricingJobId: true,
      processedImageUrls: true,
      pricingResearch: true,
      suggestedPrice: true,
      shippingSuggestion: true,
      itemAspects: true,
      ebayCategoryId: true,
      updatedAt: true,
    },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  // Auto-resolve stale image jobs: if QUEUED/PROCESSING for >5 min, mark FAILED
  const staleThresholdMs = 5 * 60 * 1000;
  const isStaleImageJob =
    ['QUEUED', 'PROCESSING'].includes(listing.imageJobStatus ?? '') &&
    listing.updatedAt &&
    Date.now() - listing.updatedAt.getTime() > staleThresholdMs;

  if (isStaleImageJob) {
    console.warn(`[job-status] Stale image job for listing ${req.params.id} — marking FAILED`);
    await prisma.listing.update({
      where: { id: req.params.id },
      data: { imageJobStatus: 'FAILED' },
    }).catch(console.error);
    res.json({ ...listing, imageJobStatus: 'FAILED' });
    return;
  }

  res.json(listing);
});

// Identify item
router.post('/:id/identify', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const imageUrls = listing.processedImageUrls.length ? listing.processedImageUrls : listing.imageUrls;
  if (!imageUrls.length) {
    res.status(400).json({ error: 'No photos uploaded yet' });
    return;
  }

  console.log(`[identify] Running on listing ${req.params.id} with ${imageUrls.length} image(s)`);
  try {
    const result = await identifyItem({ imageUrls });
    console.log(`[identify] Success: ${result.identification} (confidence ${result.confidence})`);
    await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        rawIdentification: JSON.parse(JSON.stringify(result)),
        itemCategory: result.ebayCategory,
      },
    });
    res.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[identify] Failed:', errMsg);
    // Include the real error message so the UI can display it for debugging
    res.json({
      identification: '',
      brand: '',
      model: '',
      serialNumber: null,
      ebayCategory: '',
      ebayCategoryId: null,
      confidence: 0,
      alternativeIdentifications: [],
      error: errMsg,
    });
  }
});

// Retry identification with user correction
router.post('/:id/retry-identify', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const schema = z.object({ userCorrection: z.string().optional() });
  const { userCorrection } = schema.parse(req.body);

  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const imageUrls = listing.processedImageUrls.length ? listing.processedImageUrls : listing.imageUrls;

  try {
    const result = await identifyItem({ imageUrls, userCorrection });
    await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        rawIdentification: JSON.parse(JSON.stringify(result)),
        itemCategory: result.ebayCategory,
      },
    });
    res.json(result);
  } catch {
    res.json({
      identification: '',
      brand: '',
      model: '',
      serialNumber: null,
      ebayCategory: '',
      ebayCategoryId: null,
      confidence: 0,
      alternativeIdentifications: [],
      error: 'Could not identify item — please enter manually',
    });
  }
});

// Trigger pricing research
router.post('/:id/price-research', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const identification = listing.rawIdentification as Record<string, string> | null;
  const itemName = identification?.identification || listing.itemTitle || '';
  if (!itemName) {
    res.status(400).json({ error: 'Item must be identified before pricing research' });
    return;
  }

  const listingId = req.params.id;
  const condition = listing.itemCondition || 'Used — good';
  const category = listing.itemCategory || '';

  // Mark as queued and respond immediately — research runs in the background
  await prisma.listing.update({
    where: { id: listingId },
    data: { pricingJobStatus: 'QUEUED' },
  });
  res.json({ status: 'QUEUED' });

  // Fire-and-forget: no BullMQ/Redis dependency
  setImmediate(async () => {
    try {
      await prisma.listing.update({
        where: { id: listingId },
        data: { pricingJobStatus: 'PROCESSING' },
      });

      const result = await researchPricing({ itemName, condition, category });

      await prisma.listing.update({
        where: { id: listingId },
        data: {
          pricingResearch: JSON.parse(JSON.stringify(result)),
          suggestedPrice: result.suggestedPrice,
          pricingJobStatus: 'COMPLETE',
        },
      });
      console.log(`[Pricing] Done for listing ${listingId}. Suggested: $${result.suggestedPrice}`);
    } catch (err) {
      console.error(`[Pricing] Failed for listing ${listingId}:`, (err as Error).message);
      await prisma.listing.update({
        where: { id: listingId },
        data: { pricingJobStatus: 'FAILED' },
      }).catch(console.error);
    }
  });
});

// Suggest shipping costs
router.post('/:id/shipping-suggestion', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const identification = listing.rawIdentification as Record<string, string> | null;
  const itemName = identification?.identification || listing.itemTitle || '';
  if (!itemName) {
    res.status(400).json({ error: 'Item must be identified before shipping suggestion' });
    return;
  }

  const listingId = req.params.id;
  res.json({ status: 'QUEUED' });

  setImmediate(async () => {
    try {
      const result = await suggestShipping({
        itemName,
        category: listing.itemCategory || '',
        condition: listing.itemCondition || 'Used',
      });
      await prisma.listing.update({
        where: { id: listingId },
        data: { shippingSuggestion: JSON.parse(JSON.stringify(result)) },
      });
      console.log(`[Shipping] Done for listing ${listingId}. Recommended: ${result.recommendedService} $${result.estimatedCost}`);
    } catch (err) {
      console.error(`[Shipping] Failed for listing ${listingId}:`, (err as Error).message);
    }
  });
});

// Generate title
router.post('/:id/generate-title', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const identification = listing.rawIdentification as Record<string, string> | null;
  try {
    const title = await generateTitle(auth.user.id, {
      identification: identification?.identification || listing.itemTitle || '',
      brand: identification?.brand || '',
      model: identification?.model || '',
      condition: listing.itemCondition || '',
      color: listing.itemColor || '',
      serialNumber: identification?.serialNumber || null,
      specialNotes: listing.specialNotes || '',
      category: listing.itemCategory || '',
    });
    res.json({ title });
  } catch (err) {
    console.error('[generate-title] Failed:', (err as Error).message);
    res.status(500).json({ error: 'Title generation failed', detail: (err as Error).message });
  }
});

// Generate description
router.post('/:id/generate-description', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const identification = listing.rawIdentification as Record<string, string> | null;
  try {
    const description = await generateDescription(auth.user.id, {
      identification: identification?.identification || listing.itemTitle || '',
      brand: identification?.brand || '',
      model: identification?.model || '',
      condition: listing.itemCondition || '',
      color: listing.itemColor || '',
      serialNumber: identification?.serialNumber || null,
      specialNotes: listing.specialNotes || '',
      category: listing.itemCategory || '',
    });
    res.json({ description });
  } catch (err) {
    console.error('[generate-description] Failed:', (err as Error).message);
    res.status(500).json({ error: 'Description generation failed', detail: (err as Error).message });
  }
});

// Publish to eBay
router.post('/:id/publish', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const listing = await prisma.listing.findFirst({
    where: { id: req.params.id, userId: auth.user.id },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const identification = listing.rawIdentification as Record<string, string | null> | null;

  // Resolve the eBay token: prefer user's stored OAuth token (auto-refresh if expiring),
  // fall back to the EBAY_AUTH_TOKEN env var for legacy setups.
  let ebayToken: string | undefined;
  const userRecord = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: {
      ebayAccessToken: true,
      ebayRefreshToken: true,
      ebayTokenExpiry: true,
      ebayFulfillmentPolicyId: true,
      ebayReturnPolicyId: true,
      ebayPaymentPolicyId: true,
    },
  });

  if (userRecord?.ebayAccessToken && userRecord?.ebayRefreshToken) {
    const fiveMinutes = 5 * 60 * 1000;
    const needsRefresh = !userRecord.ebayTokenExpiry ||
      userRecord.ebayTokenExpiry.getTime() < Date.now() + fiveMinutes;

    if (needsRefresh) {
      try {
        const refreshed = await refreshAccessToken(userRecord.ebayRefreshToken);
        await prisma.user.update({
          where: { id: auth.user.id },
          data: { ebayAccessToken: refreshed.accessToken, ebayTokenExpiry: refreshed.expiresAt },
        });
        ebayToken = refreshed.accessToken;
        console.log('[eBay] Token auto-refreshed');
      } catch (refreshErr) {
        console.error('[eBay] Token refresh failed:', (refreshErr as Error).message);
        ebayToken = userRecord.ebayAccessToken; // try the old one, may still work
      }
    } else {
      ebayToken = userRecord.ebayAccessToken;
    }
  }

  try {
    const result = await publishListing({
      title: listing.itemTitle || '',
      description: listing.itemDescription || '',
      category: listing.itemCategory || '',
      categoryId: identification?.ebayCategoryId || null,
      confirmedCategoryId: listing.ebayCategoryId || null,
      condition: listing.itemCondition || 'Used — good',
      price: listing.finalPrice || listing.suggestedPrice || 0,
      listingType: listing.listingType,
      auctionDuration: listing.auctionDuration || undefined,
      startingBid: listing.startingBid || undefined,
      shippingService: listing.shippingService || 'USPS Priority Mail',
      shippingCost: listing.shippingCost || 0,
      handlingTime: listing.handlingTime || '2 business days',
      acceptReturns: listing.acceptReturns,
      returnWindow: listing.returnWindow || undefined,
      imageUrls: listing.processedImageUrls.length ? listing.processedImageUrls : listing.imageUrls,
      itemAspects: listing.itemAspects as Record<string, string | string[]> | undefined,
    }, ebayToken, {
      fulfillmentPolicyId: userRecord?.ebayFulfillmentPolicyId ?? null,
      returnPolicyId: userRecord?.ebayReturnPolicyId ?? null,
      paymentPolicyId: userRecord?.ebayPaymentPolicyId ?? null,
    });

    await prisma.listing.update({
      where: { id: req.params.id },
      data: { status: 'PUBLISHED', ebayListingId: result.ebayItemId },
    });

    // Save to RAG memory after successful publish
    if (listing.itemTitle && listing.itemDescription) {
      await upsertListingMemory({
        listingId: listing.id,
        title: listing.itemTitle,
        description: listing.itemDescription,
        category: listing.itemCategory || '',
        userId: auth.user.id,
        createdAt: new Date().toISOString(),
      }).catch((err) => console.warn('[RAG] Failed to save listing memory:', err.message));
    }

    res.json({ ...result, status: 'PUBLISHED' });
  } catch (err) {
    await prisma.listing.update({
      where: { id: req.params.id },
      data: { status: 'FAILED' },
    });
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
