import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Room, Prisma } from '../../node_modules/.prisma/room-client';
import { CreateRoomDto } from './dto/room.dto';

@Injectable()
export class RoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRoomDto): Promise<Room> {
    return this.prisma.room.create({ data });
  }

  async findById(id: string): Promise<Room | null> {
    return this.prisma.room.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.room.delete({ where: { id } });
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'CLOSED'): Promise<Room> {
    return this.prisma.room.update({
      where: { id },
      data: { status },
    });
  }
}
