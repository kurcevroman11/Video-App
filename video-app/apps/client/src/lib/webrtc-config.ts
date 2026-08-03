export const stunServer: RTCIceServer = {
  urls: 'stun:stun.l.google.com:19302',
};

export const iceServers: RTCIceServer[] = [stunServer];

export async function getIceServers(
  apiUrl: string,
  accessToken: string
): Promise<RTCIceServer[]> {
  const res = await fetch(`${apiUrl}/turn-credentials`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch TURN credentials: ${res.status}`);
  }

  const { urls, username, credential } = await res.json();

  return [
    stunServer,
    { urls, username, credential },
  ];
}

export const mediaConstraints: MediaStreamConstraints = {
  video: { width: 640, height: 480 },
  audio: true,
};

export type ConnectionStatus =
  | 'IDLE'
  | 'CONNECTING_SIGNALING'
  | 'WAITING_FOR_PEER'
  | 'NEGOTIATING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED'
  | 'PERMISSION_DENIED'
  | 'NO_DEVICE'
  | 'DEVICE_BUSY';

export interface ClientError {
  code: 'PERMISSION_DENIED' | 'NO_DEVICE' | 'DEVICE_BUSY' | 'UNKNOWN_MEDIA_ERROR';
  message: string;
}
