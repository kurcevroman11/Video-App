export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function decodeJwtExp(accessToken: string): number {
  try {
    const payload = accessToken.split('.')[1];
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof data.exp === 'number' ? data.exp : 0;
  } catch {
    return 0;
  }
}

export function refreshAccessToken(apiUrl: string, refreshToken: string): Promise<TokenPair> {
  return fetch(`${apiUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Refresh failed (HTTP ${res.status})`);
    }
    return (await res.json()) as TokenPair;
  });
}
