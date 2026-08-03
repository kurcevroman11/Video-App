import { Injectable } from '@nestjs/common';
import { RoomsRepository } from './rooms.repository';
import { CreateRoomDto } from './dto/room.dto';
import { RoomNotFoundException, ForbiddenActionException } from '../common/exceptions';
import { MemberRole, RoomStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { Room } from '../../node_modules/.prisma/room-client';

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createRoom(dto: CreateRoomDto): Promise<Room> {
    console.log('RoomsService.createRoom called with:', JSON.stringify(dto));
    console.log('dto.ownerId:', dto.ownerId, 'type:', typeof dto.ownerId);
    return this.prisma.$transaction(async (tx) => {
      console.log('Inside transaction, creating room with ownerId:', dto.ownerId);
      const room = await tx.room.create({
        data: {
          name: dto.name,
          type: dto.type,
          ownerId: dto.ownerId,
          maxParticipants: dto.maxParticipants,
          status: RoomStatus.ACTIVE,
        },
      });

      await tx.roomMember.create({
        data: {
          roomId: room.id,
          userId: dto.ownerId,
          role: MemberRole.OWNER,
          status: 'JOINED',
        },
      });

      return room;
    });
  }

  async getRoom(id: string): Promise<Room> {
    const room = await this.roomsRepository.findById(id);
    if (!room) {
      throw new RoomNotFoundException(id);
    }
    return room;
  }

  async deleteRoom(id: string, requesterId: string): Promise<void> {
    const room = await this.getRoom(id);

    const membership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: id, userId: requesterId } },
    });

    if (!membership || membership.role !== MemberRole.OWNER) {
      throw new ForbiddenActionException('Only owner can delete the room');
    }

    await this.roomsRepository.delete(id);
  }
}
