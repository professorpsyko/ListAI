# ListSamurai — eBay AI Listing Assistant

Upload photos → AI identifies the item → researches pricing → writes title & description → publishes to eBay.

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL
- Redis

### 1. Environment variables

```bash
cp .env.example backend/.env
# Also copy VITE_CLERK_PUBLISHABLE_KEY into frontend/.env
```

Fill in all values in `backend/.env`. The server will exit with a clear error listing every missing variable if any are not set.

### 2. Backend

```bash
cd backend
npm install
npm run db:push        # Push Prisma schema to your database
npm run db:generate    # Generate Prisma client
npm run dev            # Start dev server on port 3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # Start Vite dev server on port 5173
```

The Vite dev server proxies `/api/*` to `localhost:3001` automatically.

---

## Architecture

### Frontend (React + Vite)
- **React Router v6** — wizard step routing at `/listing/:id/step/:n`
- **Zustand** — global listing state, persisted to localStorage
- **TanStack Query** — background job polling, settings fetching
- **TailwindCSS** — utility-first styling

### Backend (Node.js + Express)
- **Prisma + PostgreSQL** — listings, users, settings
- **BullMQ + Redis** — two background queues:
  - `image-processing` — Cloudinary upload + transformation
  - `pricing-research` — Serper + eBay + Claude pricing analysis
- **Clerk** — multi-user authentication, per-request scoping

### External services
| Service | Purpose |
|---------|---------|
| Anthropic Claude (claude-opus-4-5) | Vision (identification), pricing, title/description, shipping |
| Cloudinary | Image upload, processing, CDN |
| Pinecone | Vector DB for RAG style memory |
| Voyage AI (voyage-3-lite) | 1024-dim embeddings for RAG |
| Serper | Google Search for pricing research |
| eBay Trading API | Publish listings |
| Clerk | Authentication + user management |

---

## Wizard steps

| Step | Route | What happens |
|------|-------|-------------|
| 1 | `/step/1` | Upload label photo + item photos → fires Cloudinary job |
| 2 | `/step/2` | Claude vision identifies item → fires pricing job |
| 3 | `/step/3` | User sets condition, color, notes |
| 4 | `/step/4` | Pricing research results displayed, user sets price |
| 5 | `/step/5` | Claude generates title using RAG style memory |
| 6 | `/step/6` | Claude generates description using RAG style memory |
| 7 | `/step/7` | Shipping service, cost, handling, returns |
| 8 | `/step/8` | Full preview, listing score, inline editing, publish |

---

## Deployment

### Frontend → Vercel
1. Import the `frontend/` directory into Vercel
2. Set build command: `npm run build`, output: `dist`
3. Update `vercel.json` rewrites with your Railway backend URL
4. Add `VITE_CLERK_PUBLISHABLE_KEY` to Vercel environment variables

### Backend → Railway
1. Create a new Railway project pointing at the `backend/` directory
2. Add PostgreSQL and Redis services in Railway
3. Set all environment variables from `.env.example`
4. Railway detects `railway.toml` and deploys automatically

---

## RAG style memory

After each published listing, the title + description is embedded with Voyage AI (`voyage-3-lite`, 1024 dims) and stored in Pinecone under a per-user namespace (`user-{userId}`). When generating future titles and descriptions, the 5 most similar past listings are retrieved and included in the Claude prompt as style examples.

Import past listings via **Settings → Import past listing titles and descriptions** (CSV: `title,description,category`).

---

## eBay sandbox vs production

Set `EBAY_SANDBOX_MODE=true` for testing (uses `api.sandbox.ebay.com`). Flip to `false` for live production. Listings published in sandbox appear at `sandbox.ebay.com/itm/{itemId}`.
