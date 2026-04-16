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

// Attach Clerk session token to every request
api.interceptors.request.use(async (config) => {
  try {
    // window.__clerk is set by ClerkProvider
    const token = await (window as Window & { Clerk?: { session?: { getToken: () => Promise<string | null> } } }).Clerk?.session?.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // ignore
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

export const generateTitle = (id: string) =>
  api.post(`/listings/${id}/generate-title`).then((r) => r.data);

export const generateDescription = (id: string) =>
  api.post(`/listings/${id}/generate-description`).then((r) => r.data);

export const publishListing = (id: string) =>
  api.post(`/listings/${id}/publish`).then((r) => r.data);

// ─── Users / Settings ─────────────────────────────────────────────────────────

export const getMe = () => api.get('/users/me').then((r) => r.data);

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
