import type { IdentificationResult, PricingResult } from '../store/listingStore';

export interface DevPinData {
  1?: {
    listingId: string;
    labelPhotoUrl: string;
    labelPhotoMeta: { name: string; size: number; lastModified?: number } | null;
    itemPhotoUrls: string[];
    itemPhotoMetas: Array<{ name: string; size: number; lastModified?: number }>;
  };
  2?: { identification: IdentificationResult };
  3?: { ebayCategoryId: string; ebayCategoryName: string | null; itemAspects: Record<string, string> };
  4?: { condition: string; color: string; specialNotes: string };
  5?: { pricingResearch: PricingResult; suggestedPrice: string };
  6?: { itemTitle: string };
  7?: { itemDescription: string };
  8?: { shippingService: string; shippingCost: string; handlingTime: string; acceptReturns: boolean; returnWindow: number };
  9?: Record<string, never>; // Preview step — nothing to pin
}

const PIN_KEY = 'listsamurai-dev-pins';

export function getDevPins(): DevPinData {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function getDevPin<K extends keyof DevPinData>(step: K): DevPinData[K] | undefined {
  return getDevPins()[step];
}

export function setDevPin<K extends keyof DevPinData>(step: K, data: DevPinData[K]): void {
  const pins = getDevPins();
  pins[step] = data;
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

export function clearDevPin(step: keyof DevPinData): void {
  const pins = getDevPins();
  delete pins[step];
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

export function isPinned(step: keyof DevPinData): boolean {
  return step in getDevPins();
}
