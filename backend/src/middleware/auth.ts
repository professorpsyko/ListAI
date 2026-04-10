import { Request, Response, NextFunction } from 'express';
import { clerkMiddleware, getAuth } from '@clerk/express';
import { prisma } from '../lib/prisma';

// Clerk middleware applied globally in index.ts
export const clerkAuth = clerkMiddleware();

// Require authentication and attach user record
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);

  if (!auth.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Upsert user record on first access
    let user = await prisma.user.findUnique({ where: { clerkId: auth.userId } });

    if (!user) {
      // We don't have email here without Clerk backend client call — use placeholder
      // The frontend should call /api/users/me after signup to sync email
      user = await prisma.user.create({
        data: {
          clerkId: auth.userId,
          email: `${auth.userId}@pending.listai`,
        },
      });
    }

    // Attach to request for downstream handlers
    (req as AuthenticatedRequest).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    clerkId: string;
    email: string;
    createdAt: Date;
  };
}
