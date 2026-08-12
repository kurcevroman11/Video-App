import { Injectable } from '@nestjs/common';

interface RoomParticipant {
  userId: string;
  socketId: string;
}

@Injectable()
export class SignalingStateService {
  private rooms = new Map<string, Map<string, RoomParticipant>>();

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
        if (room.size === 0) {
          this.rooms.delete(roomId);
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
}
