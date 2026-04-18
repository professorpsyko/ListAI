import axios from 'axios';
import { config } from '../config';

const isSandbox = config.EBAY_SANDBOX_MODE === 'true';

const AUTH_URL = isSandbox
  ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
  : 'https://auth.ebay.com/oauth2/authorize';

const TOKEN_URL = isSandbox
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';

// Scopes needed for the Trading API AddItem call
const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.item',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
].join(' ');

function basicCredentials(): string {
  return Buffer.from(`${config.EBAY_APP_ID}:${config.EBAY_CERT_ID}`).toString('base64');
}

/** Build the URL to redirect the user to for eBay authorization */
export function getEbayAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: config.EBAY_APP_ID,
    redirect_uri: config.EBAY_RUNAME,
    response_type: 'code',
    scope: SCOPES,
    state: userId,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface EbayTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/** Exchange an authorization code for access + refresh tokens */
export async function exchangeCodeForTokens(code: string): Promise<EbayTokenSet> {
  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.EBAY_RUNAME,
    }),
    {
      headers: {
        Authorization: `Basic ${basicCredentials()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const { access_token, refresh_token, expires_in } = response.data;
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + expires_in * 1000),
  };
}

/** Use a refresh token to get a new access token */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const response = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
    {
      headers: {
        Authorization: `Basic ${basicCredentials()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const { access_token, expires_in } = response.data;
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + expires_in * 1000),
  };
}
