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

export interface ApiChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface ChatHistoryPage {
  messages: ApiChatMessage[];
  next_cursor: string;
}

export async function fetchChatHistory(
  apiUrl: string,
  token: string,
  roomId: string,
  cursor?: string,
  limit = 50
): Promise<ChatHistoryPage> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${apiUrl}/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load chat history (HTTP ${res.status})`);
  }
  return (await res.json()) as ChatHistoryPage;
}
