import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Invite } from '../../node_modules/.prisma/room-client';

@Injectable()
export class InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    roomId: string;
    code: string;
    createdBy: string;
    maxUses?: number;
    expiresAt?: Date;
  }): Promise<Invite> {
    return this.prisma.invite.create({ data });
  }

  async findByCode(code: string): Promise<Invite | null> {
    return this.prisma.invite.findUnique({ where: { code } });
  }

  async findByRoomId(roomId: string): Promise<Invite[]> {
    return this.prisma.invite.findMany({ where: { roomId } });
  }

  async incrementUses(id: string): Promise<Invite> {
    return this.prisma.invite.update({
      where: { id },
      data: { usesCount: { increment: 1 } },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.invite.delete({ where: { id } });
  }
}
