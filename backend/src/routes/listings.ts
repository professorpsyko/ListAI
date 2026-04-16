import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { imageQueue, pricingQueue } from '../queues';
import { uploadToCloudinary } from '../services/image';
import { identifyItem } from '../services/vision';
import { generateTitle, generateDescription } from '../services/listing-ai';
import { upsertListingMemory } from '../services/rag';
import { publishListing } from '../services/ebay';
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
  });

  const data = schema.parse(req.body);
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
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Upload all files to Cloudinary
    const uploadResults = await Promise.all(
      files.map((file) => uploadToCloudinary(file.buffer)),
    );

    const newUrls = uploadResults.map((r) => r.url);
    const newPublicIds = uploadResults.map((r) => r.publicId);

    const allUrls = [...listing.imageUrls, ...newUrls];
    const allPublicIds = [
      // Reconstruct existing public IDs from stored URLs if needed
      ...newPublicIds,
    ];

    await prisma.listing.update({
      where: { id: req.params.id },
      data: { imageUrls: allUrls, imageJobStatus: 'PENDING' },
    });

    // Fire image processing background job
    const job = await imageQueue.add('process-images', {
      listingId: req.params.id,
      publicIds: allPublicIds,
    });

    await prisma.listing.update({
      where: { id: req.params.id },
      data: { imageJobId: job.id ?? null, imageJobStatus: 'QUEUED' },
    });

    res.json({ urls: allUrls, jobId: job.id });
  },
);

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
    },
  });
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
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

  try {
    const result = await identifyItem({ imageUrls });
    await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        rawIdentification: JSON.parse(JSON.stringify(result)),
        itemCategory: result.ebayCategory,
      },
    });
    res.json(result);
  } catch {
    // Graceful fallback
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

  const job = await pricingQueue.add('research-price', {
    listingId: req.params.id,
    itemName,
    condition: listing.itemCondition || 'Used — good',
    category: listing.itemCategory || '',
  });

  await prisma.listing.update({
    where: { id: req.params.id },
    data: { pricingJobId: job.id ?? null, pricingJobStatus: 'QUEUED' },
  });

  res.json({ jobId: job.id });
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

  try {
    const result = await publishListing({
      title: listing.itemTitle || '',
      description: listing.itemDescription || '',
      category: listing.itemCategory || '',
      categoryId: identification?.ebayCategoryId || null,
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
