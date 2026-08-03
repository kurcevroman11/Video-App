import { Injectable } from '@nestjs/common';
import { InvitesRepository } from './invites.repository';
import { CreateInviteDto } from './dto/invite.dto';
import { ForbiddenActionException, InviteInvalidException } from '../common/exceptions';
import { MemberRole, MemberStatus } from '../common/enums';
import { PrismaService } from '../prisma/prisma.service';
import { Invite } from '../../node_modules/.prisma/room-client';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitesService {
  constructor(
    private readonly invitesRepository: InvitesRepository,
    private readonly prisma: PrismaService,
  ) {}

  private generateCode(): string {
    return randomBytes(6).toString('base64url');
  }

  async createInvite(dto: CreateInviteDto): Promise<Invite> {
    const requesterMembership = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: dto.roomId, userId: dto.createdBy } },
    });

    if (!requesterMembership || requesterMembership.status !== MemberStatus.JOINED) {
      throw new ForbiddenActionException('You are not a member of this room');
    }

    if (
      requesterMembership.role !== MemberRole.OWNER &&
      requesterMembership.role !== MemberRole.MODERATOR
    ) {
      throw new ForbiddenActionException('Only owner and moderator can create invites');
    }

    const code = this.generateCode();

    return this.invitesRepository.create({
      roomId: dto.roomId,
      code,
      createdBy: dto.createdBy,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresAt,
    });
  }

  async validateInvite(code: string, roomId: string): Promise<Invite> {
    const invite = await this.invitesRepository.findByCode(code);

    if (!invite || invite.roomId !== roomId) {
      throw new InviteInvalidException('Invalid invite code');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new InviteInvalidException('Invite code has expired');
    }

    if (invite.maxUses && invite.usesCount >= invite.maxUses) {
      throw new InviteInvalidException('Invite code has reached max uses');
    }

    return invite;
  }

  async listInvites(roomId: string): Promise<Invite[]> {
    return this.invitesRepository.findByRoomId(roomId);
  }
}
