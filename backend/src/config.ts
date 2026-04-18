import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Clerk
  CLERK_SECRET_KEY: z.string().min(1),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // Pinecone
  PINECONE_API_KEY: z.string().min(1),
  PINECONE_INDEX_NAME: z.string().min(1),

  // Voyage AI
  VOYAGE_API_KEY: z.string().min(1),

  // Serper
  SERPER_API_KEY: z.string().min(1),

  // eBay
  EBAY_APP_ID: z.string().min(1),
  EBAY_DEV_ID: z.string().min(1),
  EBAY_CERT_ID: z.string().min(1),
  EBAY_AUTH_TOKEN: z.string().default(''),      // Legacy fallback; prefer OAuth flow
  EBAY_SANDBOX_MODE: z.string().default('false'),
  EBAY_RUNAME: z.string().default(''),          // RuName registered in eBay developer portal
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  // Optional
  PORT: z.string().default('3001'),
  NODE_ENV: z.string().default('development'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join('.')).join('\n  - ');
    console.error(`\n❌ Missing or invalid environment variables:\n  - ${missing}\n`);
    console.error('Please check your .env file against .env.example\n');
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
