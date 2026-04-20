import axios from 'axios';

// In production, VITE_API_URL points to the Railway backend.
// In development, leave it empty so Vite's proxy handles /api/*
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
});

// Module-level token getter — set by ClerkTokenProvider in App.tsx
let _getToken: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

// Attach Clerk session token to every request
api.interceptors.request.use(async (config) => {
  try {
    if (_getToken) {
      const token = await _getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch {
    // ignore — request will proceed without token and get 401
  }
  return config;
});

// ─── Listings ─────────────────────────────────────────────────────────────────

export const createListing = () => api.post('/listings').then((r) => r.data);

export const getListing = (id: string) => api.get(`/listings/${id}`).then((r) => r.data);

export const updateListing = (id: string, data: Record<string, unknown>) =>
  api.patch(`/listings/${id}`, data).then((r) => r.data);

export const getJobStatus = (id: string) =>
  api.get(`/listings/${id}/job-status`).then((r) => r.data);

export const editPhoto = (id: string, dataUrl: string) =>
  api.post(`/listings/${id}/photos/edit`, { dataUrl }).then((r) => r.data as { url: string });

export const reprocessPhotos = (id: string) =>
  api.post(`/listings/${id}/photos/reprocess`).then((r) => r.data);

export const uploadPhotos = (id: string, files: File[]) => {
  const form = new FormData();
  files.forEach((f) => form.append('photos', f));
  return api.post(`/listings/${id}/photos`, form).then((r) => r.data);
};

export const identifyItem = (id: string) =>
  api.post(`/listings/${id}/identify`).then((r) => r.data);

export const retryIdentify = (id: string, userCorrection?: string) =>
  api.post(`/listings/${id}/retry-identify`, { userCorrection }).then((r) => r.data);

export const triggerPriceResearch = (id: string) =>
  api.post(`/listings/${id}/price-research`).then((r) => r.data);

export const triggerShippingSuggestion = (id: string) =>
  api.post(`/listings/${id}/shipping-suggestion`).then((r) => r.data);

export const generateTitle = (id: string) =>
  api.post(`/listings/${id}/generate-title`).then((r) => r.data);

export const generateDescription = (id: string) =>
  api.post(`/listings/${id}/generate-description`).then((r) => r.data);

export const publishListing = (id: string) =>
  api.post(`/listings/${id}/publish`).then((r) => r.data);

// ─── eBay Taxonomy ────────────────────────────────────────────────────────────

export const searchEbayCategories = (q: string) =>
  api.get(`/ebay/taxonomy/suggestions?q=${encodeURIComponent(q)}`).then((r) => r.data);

export const getEbayCategoryAspects = (categoryId: string) =>
  api.get(`/ebay/taxonomy/aspects/${categoryId}`).then((r) => r.data);

// ─── Users / Settings ─────────────────────────────────────────────────────────

export const getMe = () => api.get('/users/me').then((r) => r.data);

export const getEbayStatus = () => api.get('/users/me/ebay/status').then((r) => r.data);
export const getEbayAuthUrl = () => api.get('/users/me/ebay/auth-url').then((r) => r.data);
export const disconnectEbay = () => api.delete('/users/me/ebay/disconnect').then((r) => r.data);
export const updateEbayPolicies = (data: Record<string, string | null>) =>
  api.patch('/users/me/ebay/policies', data).then((r) => r.data);

export const syncEmail = (email: string) =>
  api.post('/users/me/sync', { email }).then((r) => r.data);

export const getSettings = () => api.get('/users/me/settings').then((r) => r.data);

export const updateSettings = (data: Record<string, unknown>) =>
  api.patch('/users/me/settings', data).then((r) => r.data);

export const importHistory = (file: File) => {
  const form = new FormData();
  form.append('csv', file);
  return api.post('/users/me/import-history', form).then((r) => r.data);
};

export const clearStyleMemory = () =>
  api.delete('/users/me/style-memory').then((r) => r.data);

export default api;
