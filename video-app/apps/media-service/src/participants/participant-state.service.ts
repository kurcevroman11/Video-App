import { Injectable } from '@nestjs/common';
import { types as mediasoupTypes } from 'mediasoup';

export interface Participant {
  roomId: string;
  userId: string;
  sendTransport?: mediasoupTypes.WebRtcTransport | null;
  recvTransport?: mediasoupTypes.WebRtcTransport | null;
  producers: Map<string, mediasoupTypes.Producer>; // producerId → Producer
  consumers: Map<string, mediasoupTypes.Consumer>; // consumerId → Consumer
}

@Injectable()
export class ParticipantStateService {
  // roomId → (userId → Participant)
  private participants = new Map<string, Map<string, Participant>>();

  private key(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  private ensureRoom(roomId: string): Map<string, Participant> {
    let room = this.participants.get(roomId);
    if (!room) {
      room = new Map();
      this.participants.set(roomId, room);
    }
    return room;
  }

  get(roomId: string, userId: string): Participant | undefined {
    return this.participants.get(roomId)?.get(userId);
  }

  ensure(roomId: string, userId: string): Participant {
    const room = this.ensureRoom(roomId);
    let participant = room.get(userId);
    if (!participant) {
      participant = {
        roomId,
        userId,
        sendTransport: null,
        recvTransport: null,
        producers: new Map(),
        consumers: new Map(),
      };
      room.set(userId, participant);
    }
    return participant;
  }

  remove(roomId: string, userId: string): Participant | undefined {
    const room = this.participants.get(roomId);
    if (!room) return undefined;
    const participant = room.get(userId);
    room.delete(userId);
    if (room.size === 0) {
      this.participants.delete(roomId);
    }
    return participant;
  }

  getRoomParticipantCount(roomId: string): number {
    return this.participants.get(roomId)?.size ?? 0;
  }

  hasRoom(roomId: string): boolean {
    return this.participants.has(roomId);
  }

  getParticipantIds(roomId: string): string[] {
    const room = this.participants.get(roomId);
    return room ? Array.from(room.values()).map(p => p.userId) : [];
  }
}