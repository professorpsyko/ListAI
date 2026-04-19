import { Router, Request, Response } from 'express';
import axios from 'axios';
import { getAppToken } from '../services/ebay-app-token';

const router = Router();

const TAXONOMY_BASE = 'https://api.ebay.com/commerce/taxonomy/v1';
// eBay US category tree ID is always 0
const CATEGORY_TREE_ID = '0';

/**
 * GET /api/ebay/taxonomy/suggestions?q=<query>
 * Returns top 10 category suggestions for a search query.
 */
router.get('/suggestions', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'Missing query parameter q' });
    return;
  }

  try {
    const token = await getAppToken();
    const response = await axios.get(`${TAXONOMY_BASE}/category_suggestions`, {
      params: {
        q,
        category_tree_id: CATEGORY_TREE_ID,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    // Shape: { categorySuggestions: Array<{ category: { categoryId, categoryName }, categoryTreeNodeAncestors: [...] }> }
    const suggestions = (response.data.categorySuggestions ?? []).slice(0, 10).map(
      (s: {
        category: { categoryId: string; categoryName: string };
        categoryTreeNodeLevel?: number;
        categoryTreeNodeAncestors?: Array<{ categoryName: string }>;
      }) => ({
        categoryId: s.category.categoryId,
        categoryName: s.category.categoryName,
        categoryTreeNodeLevel: s.categoryTreeNodeLevel ?? 0,
        breadcrumbs: (s.categoryTreeNodeAncestors ?? [])
          .slice()
          .reverse()
          .map((a) => a.categoryName),
      }),
    );

    res.json(suggestions);
  } catch (err) {
    const message = (err as Error).message;
    console.error('[eBay taxonomy] suggestions error:', message);
    res.status(502).json({ error: 'Failed to fetch category suggestions', detail: message });
  }
});

/**
 * GET /api/ebay/taxonomy/aspects/:categoryId
 * Returns item aspects (required, recommended, optional) for a category.
 */
router.get('/aspects/:categoryId', async (req: Request, res: Response) => {
  const { categoryId } = req.params;
  if (!categoryId) {
    res.status(400).json({ error: 'Missing categoryId' });
    return;
  }

  try {
    const token = await getAppToken();
    const response = await axios.get(
      `${TAXONOMY_BASE}/category_tree/${CATEGORY_TREE_ID}/get_item_aspects_for_category`,
      {
        params: { category_id: categoryId },
        headers: {
          Authorization: `Bearer ${token}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          Accept: 'application/json',
        },
        timeout: 15000,
      },
    );

    // Shape: { aspects: Array<{ localizedAspectName, aspectConstraint, aspectValues, aspectDataType }> }
    const aspects = (response.data.aspects ?? []).map(
      (a: {
        localizedAspectName: string;
        aspectConstraint?: {
          aspectRequired?: boolean;
          aspectUsage?: string;
          itemToAspectCardinality?: string;
        };
        aspectValues?: Array<{ localizedValue: string }>;
        aspectDataType?: { dataType?: string };
      }) => ({
        aspectName: a.localizedAspectName,
        aspectConstraint: {
          aspectRequired: a.aspectConstraint?.aspectRequired ?? false,
          aspectRecommended: a.aspectConstraint?.aspectUsage === 'RECOMMENDED',
          aspectUsage: a.aspectConstraint?.aspectUsage ?? 'OPTIONAL',
          itemToAspectCardinality: a.aspectConstraint?.itemToAspectCardinality ?? 'SINGLE',
        },
        aspectValues: (a.aspectValues ?? []).map((v) => v.localizedValue),
        aspectDataType: a.aspectDataType?.dataType ?? 'STRING',
      }),
    );

    res.json(aspects);
  } catch (err) {
    const message = (err as Error).message;
    console.error('[eBay taxonomy] aspects error:', message);
    res.status(502).json({ error: 'Failed to fetch category aspects', detail: message });
  }
});

export default router;
