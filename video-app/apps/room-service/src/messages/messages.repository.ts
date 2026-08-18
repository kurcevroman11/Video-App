import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomMessage } from '../../node_modules/.prisma/room-client';

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(data: {
    roomId: string;
    userId: string;
    content: string;
  }): Promise<RoomMessage> {
    return this.prisma.roomMessage.create({ data });
  }

  async findById(id: string): Promise<RoomMessage | null> {
    return this.prisma.roomMessage.findUnique({ where: { id } });
  }

  async findLatest(roomId: string, limit: number): Promise<RoomMessage[]> {
    return this.prisma.roomMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findBefore(
    roomId: string,
    beforeCreatedAt: Date,
    limit: number,
  ): Promise<RoomMessage[]> {
    return this.prisma.roomMessage.findMany({
      where: { roomId, createdAt: { lt: beforeCreatedAt } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}