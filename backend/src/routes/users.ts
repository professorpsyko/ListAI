import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { parse as csvParse } from 'csv-parse/sync';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { clearUserStyleMemory, getUserMemoryCount, importFromCsv } from '../services/rag';

const router = Router();
const upload = multer({ dest: '/tmp/listai-csv/' });

// Get current user + settings
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    include: { settings: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const memoryCount = await getUserMemoryCount(auth.user.id).catch(() => 0);
  res.json({ ...user, memoryCount });
});

// Sync email from Clerk (called after signup)
router.post('/me/sync', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const schema = z.object({ email: z.string().email() });
  const { email } = schema.parse(req.body);

  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { email },
  });
  res.json(user);
});

// Get settings
router.get('/me/settings', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  let settings = await prisma.settings.findUnique({ where: { userId: auth.user.id } });

  if (!settings) {
    settings = await prisma.settings.create({ data: { userId: auth.user.id } });
  }

  res.json(settings);
});

// Update settings
router.patch('/me/settings', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  const schema = z.object({
    autoFillSuggestedPrice: z.boolean().optional(),
    autoFillShipping: z.boolean().optional(),
    defaultListingType: z.string().optional(),
    defaultAuctionDuration: z.number().int().optional(),
  });

  const data = schema.parse(req.body);

  const settings = await prisma.settings.upsert({
    where: { userId: auth.user.id },
    update: data,
    create: { userId: auth.user.id, ...data },
  });

  res.json(settings);
});

// Import past listing history from CSV
router.post(
  '/me/import-history',
  requireAuth,
  upload.single('csv'),
  async (req: Request, res: Response) => {
    const auth = req as AuthenticatedRequest;

    if (!req.file) {
      res.status(400).json({ error: 'No CSV file uploaded' });
      return;
    }

    const fs = await import('fs');
    const content = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path);

    let rows: Array<{ title: string; description: string; category: string }>;
    try {
      const parsed = csvParse(content, { columns: true, skip_empty_lines: true });
      rows = (parsed as Array<Record<string, string>>)
        .filter((r) => r.title)
        .slice(0, 500)
        .map((r) => ({
          title: r.title || '',
          description: r.description || '',
          category: r.category || '',
        }));
    } catch {
      res.status(400).json({ error: 'Invalid CSV format. Expected columns: title, description, category' });
      return;
    }

    const count = await importFromCsv(auth.user.id, rows);
    res.json({ imported: count });
  },
);

// Clear style memory
router.delete('/me/style-memory', requireAuth, async (req: Request, res: Response) => {
  const auth = req as AuthenticatedRequest;
  await clearUserStyleMemory(auth.user.id);
  res.json({ success: true });
});

export default router;
