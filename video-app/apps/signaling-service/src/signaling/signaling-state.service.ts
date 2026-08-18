import { Injectable } from '@nestjs/common';

interface RoomParticipant {
  userId: string;
  socketId: string;
}

export interface RoomProducer {
  producerId: string;
  userId: string;
  kind: 'audio' | 'video';
  source?: 'camera' | 'screen';
}

export interface ScreenShareState {
  userId: string;
  producerId: string;
}

@Injectable()
export class SignalingStateService {
  private rooms = new Map<string, Map<string, RoomParticipant>>();
  // roomId → producerId → { userId, kind } (для уведомления новых joiners о существующих producer'ах)
  private roomProducers = new Map<string, Map<string, RoomProducer>>();
  // roomId → активная демонстрация экрана (одна на комнату)
  private activeScreenShare = new Map<string, ScreenShareState>();
  // userId → [timestamps] — скользящее окно для rate limit чата
  private chatMessageHistory = new Map<string, number[]>();

  addParticipant(roomId: string, userId: string, socketId: string): string | undefined {
    const room = this.rooms.get(roomId) ?? new Map<string, RoomParticipant>();
    this.rooms.set(roomId, room);

    // Не более одного сокета на пользователя в комнате: старый (залипший после
    // reconnect/перезагрузки) сокет удаляем, чтобы он не отравлял ICE чужими кандидатами.
    let removedSocketId: string | undefined;
    for (const [existingSocketId, participant] of room.entries()) {
      if (participant.userId === userId && existingSocketId !== socketId) {
        room.delete(existingSocketId);
        removedSocketId = existingSocketId;
      }
    }

    room.set(socketId, { userId, socketId });
    return removedSocketId;
  }

  removeParticipant(roomId: string, socketId: string): RoomParticipant | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const participant = room.get(socketId);
    room.delete(socketId);

    if (room.size === 0) {
      this.rooms.delete(roomId);
    }

    return participant;
  }

  removeUserFromRoom(roomId: string, userId: string): string | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    for (const [socketId, participant] of room.entries()) {
      if (participant.userId === userId) {
        room.delete(socketId);
        this.clearScreenShareIfOwner(roomId, { userId });
        if (room.size === 0) {
          this.rooms.delete(roomId);
          this.activeScreenShare.delete(roomId);
        }
        return socketId;
      }
    }
    return undefined;
  }

  getParticipants(roomId: string, excludeSocketId?: string): { userId: string; socketId: string }[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const participants: { userId: string; socketId: string }[] = [];
    for (const [socketId, participant] of room.entries()) {
      if (excludeSocketId && socketId === excludeSocketId) continue;
      participants.push({ userId: participant.userId, socketId });
    }
    return participants;
  }

  getSocketIdByUserId(roomId: string, userId: string): string | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    for (const participant of room.values()) {
      if (participant.userId === userId) {
        return participant.socketId;
      }
    }
    return undefined;
  }

  getRoomIdBySocketId(socketId: string): string | undefined {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.has(socketId)) {
        return roomId;
      }
    }
    return undefined;
  }

  isUserInRoom(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    for (const participant of room.values()) {
      if (participant.userId === userId) {
        return true;
      }
    }
    return false;
  }

  addProducer(
    roomId: string,
    producerId: string,
    userId: string,
    kind: 'audio' | 'video',
    source?: 'camera' | 'screen',
  ): void {
    if (!this.roomProducers.has(roomId)) {
      this.roomProducers.set(roomId, new Map());
    }
    this.roomProducers.get(roomId)!.set(producerId, { producerId, userId, kind, source });
  }

  removeProducer(roomId: string, producerId: string): RoomProducer | undefined {
    const room = this.roomProducers.get(roomId);
    if (!room) return undefined;
    const removed = room.get(producerId);
    room.delete(producerId);
    if (room.size === 0) {
      this.roomProducers.delete(roomId);
    }
    return removed;
  }

  getProducers(roomId: string): RoomProducer[] {
    return Array.from(this.roomProducers.get(roomId)?.values() ?? []);
  }

  getProducer(roomId: string, producerId: string): RoomProducer | undefined {
    return this.roomProducers.get(roomId)?.get(producerId);
  }

  getProducerIdsByUser(roomId: string, userId: string): string[] {
    const room = this.roomProducers.get(roomId);
    if (!room) return [];
    return Array.from(room.values())
      .filter(p => p.userId === userId)
      .map(p => p.producerId);
  }

  removeAllProducersByUser(roomId: string, userId: string): string[] {
    const room = this.roomProducers.get(roomId);
    if (!room) return [];
    const removed: string[] = [];
    for (const [producerId, producer] of [...room.entries()]) {
      if (producer.userId === userId) {
        room.delete(producerId);
        removed.push(producerId);
      }
    }
    if (room.size === 0) {
      this.roomProducers.delete(roomId);
    }
    return removed;
  }

  getUserRooms(userId: string): string[] {
    const userRooms: string[] = [];
    for (const [roomId, room] of this.rooms.entries()) {
      for (const participant of room.values()) {
        if (participant.userId === userId) {
          userRooms.push(roomId);
          break;
        }
      }
    }
    return userRooms;
  }

  /**
   * Регистрирует факт отправки сообщения в рамках скользящего окна.
   * Возвращает false, если лимит уже превышен (запись не регестрируется).
   */
  checkAndRecordMessage(userId: string, maxMessages: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (this.chatMessageHistory.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= maxMessages) {
      this.chatMessageHistory.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.chatMessageHistory.set(userId, recent);
    return true;
  }

  clearChatHistory(userId: string): void {
    this.chatMessageHistory.delete(userId);
  }

  getActiveScreenShare(roomId: string): ScreenShareState | undefined {
    return this.activeScreenShare.get(roomId);
  }

  setActiveScreenShare(roomId: string, userId: string, producerId: string): void {
    this.activeScreenShare.set(roomId, { userId, producerId });
  }

  clearActiveScreenShare(roomId: string): void {
    this.activeScreenShare.delete(roomId);
  }

  /**
   * Сбрасывает активную демонстрацию, если закрывается её producer
   * или её владелец (например, при disconnect).
   */
  clearScreenShareIfOwner(roomId: string, match: { userId?: string; producerId?: string }): void {
    const current = this.activeScreenShare.get(roomId);
    if (!current) return;
    const matches =
      (match.userId && current.userId === match.userId) ||
      (match.producerId && current.producerId === match.producerId);
    if (matches) {
      this.activeScreenShare.delete(roomId);
    }
  }
}
