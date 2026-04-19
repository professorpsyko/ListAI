import axios from 'axios';
import { config } from '../config';

interface AppTokenCache {
  token: string;
  expiresAt: number; // epoch ms
}

let _cache: AppTokenCache | null = null;

/**
 * Fetches or returns a cached eBay application-level OAuth token
 * (client credentials grant — no user context).
 * Tokens are valid for 2 hours; we refresh if within 5 minutes of expiry.
 */
export async function getAppToken(): Promise<string> {
  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;

  if (_cache && _cache.expiresAt - now > fiveMin) {
    return _cache.token;
  }

  const credentials = Buffer.from(`${config.EBAY_APP_ID}:${config.EBAY_CERT_ID}`).toString('base64');

  const response = await axios.post(
    'https://api.ebay.com/identity/v1/oauth2/token',
    'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    },
  );

  const { access_token, expires_in } = response.data as { access_token: string; expires_in: number };

  _cache = {
    token: access_token,
    expiresAt: now + expires_in * 1000,
  };

  console.log('[eBay app-token] Token refreshed, expires in', expires_in, 's');
  return access_token;
}
