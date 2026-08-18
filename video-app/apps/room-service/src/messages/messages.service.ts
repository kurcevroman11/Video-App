import { Injectable } from '@nestjs/common';
import { MessagesRepository } from './messages.repository';
import { PrismaService } from '../prisma/prisma.service';
import { RoomMessage } from '../../node_modules/.prisma/room-client';
import { RoomNotFoundException, ConflictException } from '../common/exceptions';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export interface RoomMessagesPage {
  messages: RoomMessage[];
  nextCursor: string;
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepository: MessagesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async saveMessage(roomId: string, userId: string, content: string): Promise<RoomMessage> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new RoomNotFoundException(roomId);
    }
    if (!content || !content.trim()) {
      throw new ConflictException('Message content is empty');
    }
    return this.messagesRepository.save({ roomId, userId, content });
  }

  /**
   * Курсорная пагинация истории чата. Без cursor — последние `limit` сообщений
   * (новые сверху). С cursor (id последнего полученного сообщения) — страница
   * сообщений, более старых, чем сообщение cursor'а.
   */
  async getMessages(
    roomId: string,
    cursor?: string,
    limit?: number,
  ): Promise<RoomMessagesPage> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new RoomNotFoundException(roomId);
    }

    const take = Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT);

    let messages: RoomMessage[];
    if (cursor) {
      const cursorMessage = await this.messagesRepository.findById(cursor);
      if (!cursorMessage) {
        throw new ConflictException('Invalid cursor');
      }
      messages = await this.messagesRepository.findBefore(roomId, cursorMessage.createdAt, take);
    } else {
      messages = await this.messagesRepository.findLatest(roomId, take);
    }

    const rows = Array.isArray(messages) ? messages : [];
    const nextCursor = rows.length === take ? (rows[rows.length - 1]?.id ?? '') : '';

    return { messages: rows, nextCursor };
  }
}