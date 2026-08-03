import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomMember, Prisma } from '../../node_modules/.prisma/room-client';

@Injectable()
export class MembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMembership(roomId: string, userId: string): Promise<RoomMember | null> {
    return this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
  }

  async createOrUpdateMembership(
    roomId: string,
    userId: string,
    role: 'OWNER' | 'MODERATOR' | 'PARTICIPANT' = 'PARTICIPANT',
  ): Promise<RoomMember> {
    return this.prisma.roomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      update: { status: 'JOINED', leftAt: null },
      create: { roomId, userId, role, status: 'JOINED' },
    });
  }

  async updateStatus(
    roomId: string,
    userId: string,
    status: 'JOINED' | 'LEFT' | 'KICKED',
  ): Promise<RoomMember> {
    const updateData: Prisma.RoomMemberUpdateInput = { status };
    if (status === 'LEFT') {
      updateData.leftAt = new Date();
    }
    return this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: updateData,
    });
  }

  async updateRole(
    roomId: string,
    userId: string,
    role: 'OWNER' | 'MODERATOR' | 'PARTICIPANT',
  ): Promise<RoomMember> {
    return this.prisma.roomMember.update({
      where: { roomId_userId: { roomId, userId } },
      data: { role },
    });
  }

  async findJoinedMembers(roomId: string): Promise<RoomMember[]> {
    return this.prisma.roomMember.findMany({
      where: { roomId, status: 'JOINED' },
    });
  }

  async countJoinedMembers(roomId: string): Promise<number> {
    return this.prisma.roomMember.count({
      where: { roomId, status: 'JOINED' },
    });
  }
}
