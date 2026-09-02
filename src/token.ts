import { config } from './config';

interface TokenResponse {
  access_token: string;
  expires_in: string;
}

let currentToken = '';
let expiresAt = 0;

export async function getAccessToken(): Promise<string> {
  if (currentToken && Date.now() < expiresAt - 60_000) {
    return currentToken;
  }

  const res = await fetch(`${config.apiBase}/app/getAppAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: config.appId,
      clientSecret: config.appSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get access token: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as TokenResponse;
  currentToken = data.access_token;
  expiresAt = Date.now() + Number(data.expires_in) * 1000;

  console.log(`[Token] Access token obtained, expires in ${data.expires_in}s`);
  return currentToken;
}
