import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IdentificationResult {
  identification: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  serialDecoding: string | null;
  ebayCategory: string;
  ebayCategoryId: string | null;
  confidence: number;
  alternativeIdentifications: Array<{ identification: string; confidence: number }>;
  researchDescription?: string;
  researchLinks?: Array<{ title: string; url: string; snippet: string }>;
  researchImages?: Array<{ imageUrl: string; title: string; sourceUrl: string }>;
  error?: string;
}

export interface PricingResult {
  suggestedPrice: number;
  reasoning: string[];
  sourceUrls: string[];
  priceRange: { low: number; high: number };
}

export interface ListingState {
  // Listing ID (from backend)
  listingId: string | null;

  // Step 1 — Photos
  labelPhotoUrl: string | null;
  /** Name + size + lastModified of the label file, used to detect duplicates when uploading item photos */
  labelPhotoMeta: { name: string; size: number; lastModified?: number } | null;
  itemPhotoUrls: string[];
  /** Metadata for each item photo, parallel to itemPhotoUrls, used for reverse-duplicate detection */
  itemPhotoMetas: Array<{ name: string; size: number; lastModified?: number }>;
  processedPhotoUrls: string[];
  imageJobStatus: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

  // Step 2 — Identification
  identification: IdentificationResult | null;
  identificationStatus: 'idle' | 'loading' | 'done' | 'error';

  // Step 3 — Details
  condition: string;
  color: string;
  specialNotes: string;

  // Step 4 — Pricing
  pricingResearch: PricingResult | null;
  pricingJobStatus: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  finalPrice: string;

  // Step 5 — Title
  itemTitle: string;
  titleSuggestion: string;

  // Step 6 — Description
  itemDescription: string;
  descriptionSuggestion: string;

  // Step 7 — Shipping
  shippingService: string;
  shippingCost: string;
  handlingTime: string;
  acceptReturns: boolean;
  returnWindow: number;
  shippingSuggestion: {
    recommendedService: string;
    estimatedCost: number;
    handlingTime: string;
    reasoning: string;
    costEstimates: Record<string, number>;
  } | null;
  shippingSuggestionStatus: 'PENDING' | 'LOADING' | 'COMPLETE' | 'FAILED';

  // Step 8 — Listing type
  listingType: 'BUY_IT_NOW' | 'AUCTION';
  auctionDuration: number;
  startingBid: string;

  // Current wizard step
  currentStep: number;

  // Actions
  setListingId: (id: string) => void;
  setLabelPhoto: (url: string, meta?: { name: string; size: number; lastModified?: number } | null) => void;
  setItemPhotos: (urls: string[], metas?: Array<{ name: string; size: number; lastModified?: number }>) => void;
  setProcessedPhotos: (urls: string[]) => void;
  setImageJobStatus: (s: ListingState['imageJobStatus']) => void;
  setIdentification: (r: IdentificationResult | null) => void;
  setIdentificationStatus: (s: ListingState['identificationStatus']) => void;
  setCondition: (v: string) => void;
  setColor: (v: string) => void;
  setSpecialNotes: (v: string) => void;
  setPricingResearch: (r: PricingResult | null) => void;
  setPricingJobStatus: (s: ListingState['pricingJobStatus']) => void;
  setFinalPrice: (v: string) => void;
  setItemTitle: (v: string) => void;
  setTitleSuggestion: (v: string) => void;
  setItemDescription: (v: string) => void;
  setDescriptionSuggestion: (v: string) => void;
  setShippingService: (v: string) => void;
  setShippingCost: (v: string) => void;
  setHandlingTime: (v: string) => void;
  setAcceptReturns: (v: boolean) => void;
  setReturnWindow: (v: number) => void;
  setShippingSuggestion: (v: ListingState['shippingSuggestion']) => void;
  setShippingSuggestionStatus: (v: ListingState['shippingSuggestionStatus']) => void;
  setListingType: (v: 'BUY_IT_NOW' | 'AUCTION') => void;
  setAuctionDuration: (v: number) => void;
  setStartingBid: (v: string) => void;
  setCurrentStep: (n: number) => void;
  reset: () => void;
}

const initialState = {
  listingId: null,
  labelPhotoUrl: null,
  labelPhotoMeta: null,
  itemPhotoUrls: [],
  itemPhotoMetas: [],
  processedPhotoUrls: [],
  imageJobStatus: 'PENDING' as const,
  identification: null,
  identificationStatus: 'idle' as const,
  condition: '',
  color: '',
  specialNotes: '',
  pricingResearch: null,
  pricingJobStatus: 'PENDING' as const,
  finalPrice: '',
  itemTitle: '',
  titleSuggestion: '',
  itemDescription: '',
  descriptionSuggestion: '',
  shippingService: '',
  shippingCost: '',
  handlingTime: '',
  acceptReturns: false,
  returnWindow: 30,
  shippingSuggestion: null,
  shippingSuggestionStatus: 'PENDING' as const,
  listingType: 'BUY_IT_NOW' as const,
  auctionDuration: 7,
  startingBid: '',
  currentStep: 1,
};

export const useListingStore = create<ListingState>()(
  persist(
    (set) => ({
      ...initialState,
      setListingId: (id) => set({ listingId: id }),
      setLabelPhoto: (url, meta) => set({ labelPhotoUrl: url, labelPhotoMeta: meta ?? null }),
      setItemPhotos: (urls, metas) => set((s) => ({
        itemPhotoUrls: urls,
        itemPhotoMetas: metas ?? (urls.length < s.itemPhotoMetas.length ? s.itemPhotoMetas.slice(0, urls.length) : s.itemPhotoMetas),
      })),
      setProcessedPhotos: (urls) => set({ processedPhotoUrls: urls }),
      setImageJobStatus: (s) => set({ imageJobStatus: s }),
      setIdentification: (r) => set({ identification: r }),
      setIdentificationStatus: (s) => set({ identificationStatus: s }),
      setCondition: (v) => set({ condition: v }),
      setColor: (v) => set({ color: v }),
      setSpecialNotes: (v) => set({ specialNotes: v }),
      setPricingResearch: (r) => set({ pricingResearch: r }),
      setPricingJobStatus: (s) => set({ pricingJobStatus: s }),
      setFinalPrice: (v) => set({ finalPrice: v }),
      setItemTitle: (v) => set({ itemTitle: v }),
      setTitleSuggestion: (v) => set({ titleSuggestion: v }),
      setItemDescription: (v) => set({ itemDescription: v }),
      setDescriptionSuggestion: (v) => set({ descriptionSuggestion: v }),
      setShippingService: (v) => set({ shippingService: v }),
      setShippingCost: (v) => set({ shippingCost: v }),
      setHandlingTime: (v) => set({ handlingTime: v }),
      setAcceptReturns: (v) => set({ acceptReturns: v }),
      setReturnWindow: (v) => set({ returnWindow: v }),
      setShippingSuggestion: (v) => set({ shippingSuggestion: v }),
      setShippingSuggestionStatus: (v) => set({ shippingSuggestionStatus: v }),
      setListingType: (v) => set({ listingType: v }),
      setAuctionDuration: (v) => set({ auctionDuration: v }),
      setStartingBid: (v) => set({ startingBid: v }),
      setCurrentStep: (n) => set({ currentStep: n }),
      reset: () => set(initialState),
    }),
    { name: 'listai-listing' },
  ),
);
