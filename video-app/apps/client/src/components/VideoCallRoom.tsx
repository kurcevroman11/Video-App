import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionStatus, mediaConstraints, ClientError } from '../lib/webrtc-config';
import { useSignalingSocket, ChatMessage } from '../hooks/useSignalingSocket';
import { useMediasoup } from '../hooks/useMediasoup';
import { useIdleDetection } from '../hooks/useIdleDetection';
import { useIsMobile } from '../hooks/useMediaQuery';
import { fetchChatHistory } from '../lib/api';
import { CallStage } from './CallStage';
import { CallHeader } from './CallHeader';
import { CallControls } from './CallControls';
import { ParticipantGrid } from './ParticipantGrid';
import { ScreenShareView } from './ScreenShareView';
import { LocalVideoPiP } from './LocalVideoPiP';
import { ChatDrawer } from './ChatDrawer';
import { ChatBottomSheet } from './ChatBottomSheet';
import { ToastStack } from './ToastStack';
import { CriticalErrorOverlay } from './CriticalErrorOverlay';

const API_URL = import.meta.env.VITE_API_URL || '';

interface VideoCallRoomProps {
  signalingUrl: string;
  token: string;
  userId: string;
  roomId: string;
  roomName?: string;
  onExit?: () => void;
}

async function acquireLocalMedia(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(mediaConstraints);
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw { code: 'PERMISSION_DENIED', message: 'Доступ к камере/микрофону отклонён' } as ClientError;
    }
    if (err.name === 'NotFoundError') {
      throw { code: 'NO_DEVICE', message: 'Камера или микрофон не найдены' } as ClientError;
    }
    if (err.name === 'NotReadableError') {
      throw { code: 'DEVICE_BUSY', message: 'Устройство уже используется другим приложением' } as ClientError;
    }
    throw { code: 'UNKNOWN_MEDIA_ERROR', message: err.message } as ClientError;
  }
}

export function VideoCallRoom({
  signalingUrl,
  token,
  userId,
  roomId,
  roomName,
  onExit,
}: VideoCallRoomProps) {
  const [status, setStatus] = useState<ConnectionStatus>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<string[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatLoadedRef = useRef(false);
  const chatCursorRef = useRef('');
  const chatIdsRef = useRef<Set<string>>(new Set());

  const recordChatMessages = useCallback(
    (incoming: ChatMessage[], position: 'append' | 'prepend') => {
      setChatMessages((prev) => {
        const fresh = incoming.filter((m) => !chatIdsRef.current.has(m.id));
        fresh.forEach((m) => chatIdsRef.current.add(m.id));
        return position === 'prepend' ? [...fresh, ...prev] : [...prev, ...fresh];
      });
    },
    []
  );

  const joinedRef = useRef(false);

  const signaling = useSignalingSocket(signalingUrl, {
    onRoomJoined: ({ participants }) => {
      if (participants.length === 0) {
        setStatus('WAITING_FOR_PEER');
      } else {
        setStatus('NEGOTIATING');
      }
    },
    onUserJoined: () => {
      setStatus('NEGOTIATING');
    },
    onError: ({ code, message }) => {
      const fatal = ['ACCESS_DENIED', 'NOT_AUTHENTICATED', 'MEDIA_ERROR', 'NOT_IN_ROOM'].includes(code);
      const text = `${code}: ${message}`;
      if (fatal) {
        setError(text);
        setStatus('FAILED');
      } else {
        setToasts((prev) => [...prev, text]);
        setTimeout(() => {
          setToasts((prev) => prev.slice(1));
        }, 4000);
      }
    },
    onChatMessage: (message) => {
      recordChatMessages([message], 'append');
    },
    onDisconnect: () => {
      setStatus('CONNECTING_SIGNALING');
    },
    onReconnect: () => {
      signaling.joinRoom(roomId);
    },
  });

  const mediasoup = useMediasoup(signaling.socket, signaling, roomId, userId, localStream);

  useEffect(() => {
    if (mediasoup.connectionState === 'connected' && mediasoup.remoteParticipants.length > 0) {
      setStatus('CONNECTED');
    }
  }, [mediasoup.connectionState, mediasoup.remoteParticipants.length]);

  const joinRoom = useCallback(async () => {
    setError(null);
    setStatus('CONNECTING_SIGNALING');

    try {
      const stream = await acquireLocalMedia();
      setLocalStream(stream);
    } catch (err) {
      const clientError = err as ClientError;
      setError(clientError.message || 'Не удалось получить доступ к камере');
      setStatus(
        clientError.code && clientError.code in STATUS_MAP
          ? (clientError.code as ConnectionStatus)
          : 'FAILED'
      );
      return;
    }

    signaling.connect(token);
    signaling.joinRoom(roomId);
  }, [signaling, token, roomId]);

  useEffect(() => {
    signaling.updateToken(token);
  }, [token, signaling]);

  useEffect(() => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    joinRoom();
  }, [joinRoom]);

  const resetStates = useCallback(() => {
    mediasoup.close();
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setStatus('IDLE');
  }, [mediasoup, localStream]);

  useEffect(() => {
    return () => {
      resetStates();
      signaling.disconnect();
    };
  }, []);

  const handleLeave = () => {
    signaling.leaveRoom(roomId);
    resetStates();
    signaling.disconnect();
    onExit?.();
  };

  const loadChatHistory = useCallback(
    (cursor?: string) => {
      if (!token || chatBusy) return;
      setChatBusy(true);
      fetchChatHistory(API_URL, token, roomId, cursor)
        .then((page) => {
          const mapped: ChatMessage[] = (page.messages ?? [])
            .map((m) => ({
              id: m.id,
              userId: m.user_id,
              content: m.content,
              createdAt: m.created_at,
            }))
            .reverse();
          chatCursorRef.current = page.next_cursor ?? '';
          recordChatMessages(mapped, cursor ? 'prepend' : 'append');
        })
        .catch(() => {
          if (!cursor) {
            chatLoadedRef.current = false;
          }
        })
        .finally(() => setChatBusy(false));
    },
    [token, roomId, chatBusy, recordChatMessages]
  );

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => {
      const next = !prev;
      if (next && !chatLoadedRef.current) {
        chatLoadedRef.current = true;
        loadChatHistory();
      }
      return next;
    });
  }, [loadChatHistory]);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
  };

  const handleScreenShareToggle = async () => {
    if (mediasoup.screenSharing) {
      mediasoup.stopScreenShare();
      return;
    }
    await mediasoup.startScreenShare();
  };

  const isMobile = useIsMobile();
  const waiting = status === 'WAITING_FOR_PEER' || (status === 'CONNECTING_SIGNALING' && mediasoup.remoteParticipants.length === 0);
  const ended = status === 'DISCONNECTED' || status === 'FAILED';
  const cameraParticipants = mediasoup.remoteParticipants.filter((p) => p.source === 'camera');

  const showScreenShare = mediasoup.screenSharing && mediasoup.localScreenStream;
  const showUiShouldAutoHide = !ended && !chatOpen && !showScreenShare && toasts.length === 0;
  const uiActive = useIdleDetection(3000, !showUiShouldAutoHide);

  const hasActiveScreen = !!showScreenShare || mediasoup.remoteParticipants.some((p) => p.source === 'screen');

  return (
    <CallStage>
      {showScreenShare ? (
        <ScreenShareView
          stream={mediasoup.localScreenStream}
          label="Вы демонстрируете экран"
        />
      ) : (
        <ParticipantGrid
          participants={cameraParticipants}
          waiting={waiting}
        />
      )}

      <LocalVideoPiP
        stream={localStream}
        micOn={micOn}
        visible={uiActive || hasActiveScreen}
        initialCorner={isMobile ? 'bottom-right' : 'top-right'}
        size={hasActiveScreen ? 'sm' : 'md'}
      />

      <CallHeader
        roomName={roomName}
        roomId={roomId}
        status={status}
        visible={uiActive}
        onBack={isMobile ? onExit : undefined}
      />

      {!ended && (
        <CallControls
          visible={uiActive}
          micOn={micOn}
          camOn={camOn}
          screenSharing={mediasoup.screenSharing}
          chatOpen={chatOpen}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onToggleScreenShare={handleScreenShareToggle}
          onToggleChat={toggleChat}
          onLeave={handleLeave}
          onCloseChat={() => setChatOpen(false)}
        />
      )}

      {isMobile ? (
        <ChatBottomSheet
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          messages={chatMessages}
          currentUserId={userId}
          onSend={(text) => signaling.sendChatMessage(text)}
          onLoadMore={() => {
            if (chatCursorRef.current) loadChatHistory(chatCursorRef.current);
          }}
          busy={chatBusy}
        />
      ) : (
        <ChatDrawer
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          messages={chatMessages}
          currentUserId={userId}
          onSend={(text) => signaling.sendChatMessage(text)}
          onLoadMore={() => {
            if (chatCursorRef.current) loadChatHistory(chatCursorRef.current);
          }}
          busy={chatBusy}
        />
      )}

      <ToastStack messages={toasts} onDismiss={(idx) => setToasts((prev) => prev.filter((_, i) => i !== idx))} />

      {ended && (
        <CriticalErrorOverlay
          status={status}
          error={error}
          onReconnect={() => {
            joinedRef.current = false;
            joinRoom();
          }}
          onExit={() => onExit?.()}
        />
      )}
    </CallStage>
  );
}

const STATUS_MAP: Record<string, true> = {
  PERMISSION_DENIED: true,
  NO_DEVICE: true,
  DEVICE_BUSY: true,
};
