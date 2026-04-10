import { Pinecone } from '@pinecone-database/pinecone';
import { VoyageAIClient } from 'voyageai';
import { config } from '../config';

const pinecone = new Pinecone({ apiKey: config.PINECONE_API_KEY });
const voyage = new VoyageAIClient({ apiKey: config.VOYAGE_API_KEY });

export interface ListingMemory {
  listingId: string;
  title: string;
  description: string;
  category: string;
  userId: string;
  createdAt: string;
}

async function embed(text: string): Promise<number[]> {
  const result = await voyage.embed({ input: [text], model: 'voyage-3-lite' });
  const vector = result.data?.[0]?.embedding;
  if (!vector) throw new Error('Voyage AI returned no embedding');
  return vector as number[];
}

function namespaceForUser(userId: string): string {
  return `user-${userId}`;
}

export async function upsertListingMemory(memory: ListingMemory): Promise<void> {
  const index = pinecone.index(config.PINECONE_INDEX_NAME);
  const text = `${memory.title} ${memory.description} ${memory.category}`;
  const vector = await embed(text);

  await index.namespace(namespaceForUser(memory.userId)).upsert([
    {
      id: memory.listingId,
      values: vector,
      metadata: {
        title: memory.title,
        description: memory.description,
        category: memory.category,
        userId: memory.userId,
        createdAt: memory.createdAt,
      },
    },
  ]);
}

export async function retrieveSimilarListings(
  userId: string,
  queryText: string,
  topK = 5,
): Promise<ListingMemory[]> {
  const index = pinecone.index(config.PINECONE_INDEX_NAME);
  const vector = await embed(queryText);

  const results = await index.namespace(namespaceForUser(userId)).query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (results.matches || []).map((match) => ({
    listingId: match.id,
    title: (match.metadata?.title as string) || '',
    description: (match.metadata?.description as string) || '',
    category: (match.metadata?.category as string) || '',
    userId: (match.metadata?.userId as string) || '',
    createdAt: (match.metadata?.createdAt as string) || '',
  }));
}

export async function clearUserStyleMemory(userId: string): Promise<void> {
  const index = pinecone.index(config.PINECONE_INDEX_NAME);
  await index.namespace(namespaceForUser(userId)).deleteAll();
}

export async function getUserMemoryCount(userId: string): Promise<number> {
  const index = pinecone.index(config.PINECONE_INDEX_NAME);
  const stats = await index.describeIndexStats();
  const nsKey = namespaceForUser(userId);
  return stats.namespaces?.[nsKey]?.recordCount ?? 0;
}

export async function importFromCsv(
  userId: string,
  rows: Array<{ title: string; description: string; category: string }>,
): Promise<number> {
  const index = pinecone.index(config.PINECONE_INDEX_NAME);
  let count = 0;

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const vectors = await Promise.all(
      batch.map(async (row, idx) => {
        const text = `${row.title} ${row.description} ${row.category}`;
        const vector = await embed(text);
        const id = `import-${userId}-${Date.now()}-${i + idx}`;
        return {
          id,
          values: vector,
          metadata: {
            title: row.title,
            description: row.description,
            category: row.category,
            userId,
            createdAt: new Date().toISOString(),
          },
        };
      }),
    );

    await index.namespace(namespaceForUser(userId)).upsert(vectors);
    count += batch.length;
  }

  return count;
}
