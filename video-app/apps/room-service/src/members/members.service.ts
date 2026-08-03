import { Injectable } from '@nestjs/common';
import { MembersRepository } from './members.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  RoomNotFoundException,
  ForbiddenActionException,
  ConflictException,
} from '../common/exceptions';
import { MemberStatus, RoomStatus, RoomType } from '../common/enums';

type MemberRole = 'OWNER' | 'MODERATOR' | 'PARTICIPANT';

@Injectable()
export class MembersService {
  constructor(
    private readonly membersRepository: MembersRepository,
    private readonly prisma: PrismaService,
  ) {}

  private hasPermission(
    role: MemberRole,
    targetRole: MemberRole,
    action: 'kick' | 'changeRole',
  ): boolean {
    if (action === 'kick') {
      if (role === 'OWNER') return true;
      if (role === 'MODERATOR' && targetRole === 'PARTICIPANT') return true;
      return false;
    }
    if (action === 'changeRole') {
      return role === 'OWNER';
    }
    return false;
  }

  async joinRoom(
    roomId: string,
    userId: string,
    inviteCode?: string,
  ): Promise<void> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new RoomNotFoundException(roomId);
    if (room.status === RoomStatus.CLOSED) {
      throw new ConflictException('Room is closed');
    }

    const existingMembership = await this.membersRepository.findMembership(roomId, userId);
    if (existingMembership?.status === MemberStatus.JOINED) {
      return;
    }
    if (existingMembership?.status === MemberStatus.KICKED && !inviteCode) {
      throw new ForbiddenActionException('You were kicked from this room');
    }

    if (room.type === RoomType.PRIVATE && !inviteCode) {
      throw new ForbiddenActionException('Private room requires invite code');
    }

    if (inviteCode) {
      const invite = await this.prisma.invite.findUnique({ where: { code: inviteCode } });
      if (!invite || invite.roomId !== roomId) {
        throw new ForbiddenActionException('Invalid invite code');
      }
      if (invite.expiresAt && invite.expiresAt < new Date()) {
        throw new ForbiddenActionException('Invite code has expired');
      }
      if (invite.maxUses && invite.usesCount >= invite.maxUses) {
        throw new ForbiddenActionException('Invite code has reached max uses');
      }
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { usesCount: { increment: 1 } },
      });
    }

    if (room.maxParticipants) {
      const count = await this.membersRepository.countJoinedMembers(roomId);
      if (count >= room.maxParticipants) {
        throw new ConflictException('Room is full');
      }
    }

    await this.membersRepository.createOrUpdateMembership(roomId, userId);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const membership = await this.membersRepository.findMembership(roomId, userId);
    if (!membership) {
      throw new RoomNotFoundException(roomId);
    }

    if (membership.role === 'OWNER') {
      throw new ForbiddenActionException('Owner cannot leave without transferring ownership');
    }

    await this.membersRepository.updateStatus(roomId, userId, MemberStatus.LEFT);
  }

  async kickParticipant(roomId: string, targetUserId: string, requesterId: string): Promise<void> {
    const requesterMembership = await this.membersRepository.findMembership(roomId, requesterId);
    if (!requesterMembership || requesterMembership.status !== MemberStatus.JOINED) {
      throw new ForbiddenActionException('You are not a member of this room');
    }

    const targetMembership = await this.membersRepository.findMembership(roomId, targetUserId);
    if (!targetMembership) {
      throw new RoomNotFoundException(roomId);
    }

    if (!this.hasPermission(requesterMembership.role, targetMembership.role, 'kick')) {
      throw new ForbiddenActionException('You do not have permission to kick this participant');
    }

    await this.membersRepository.updateStatus(roomId, targetUserId, MemberStatus.KICKED);
  }

  async changeRole(
    roomId: string,
    targetUserId: string,
    newRole: MemberRole,
    requesterId: string,
  ): Promise<void> {
    const requesterMembership = await this.membersRepository.findMembership(roomId, requesterId);
    if (!requesterMembership || requesterMembership.status !== MemberStatus.JOINED) {
      throw new ForbiddenActionException('You are not a member of this room');
    }

    const targetMembership = await this.membersRepository.findMembership(roomId, targetUserId);
    if (!targetMembership) {
      throw new RoomNotFoundException(roomId);
    }

    if (!this.hasPermission(requesterMembership.role, targetMembership.role, 'changeRole')) {
      throw new ForbiddenActionException('Only owner can change roles');
    }

    await this.membersRepository.updateRole(roomId, targetUserId, newRole);
  }

  async transferOwnership(roomId: string, newOwnerId: string, currentOwnerId: string): Promise<void> {
    const currentOwnerMembership = await this.membersRepository.findMembership(roomId, currentOwnerId);
    if (!currentOwnerMembership || currentOwnerMembership.role !== 'OWNER') {
      throw new ForbiddenActionException('Only current owner can transfer ownership');
    }

    const newOwnerMembership = await this.membersRepository.findMembership(roomId, newOwnerId);
    if (!newOwnerMembership || newOwnerMembership.status !== MemberStatus.JOINED) {
      throw new ForbiddenActionException('New owner must be a joined member');
    }

    await this.membersRepository.updateRole(roomId, currentOwnerId, 'MODERATOR');
    await this.membersRepository.updateRole(roomId, newOwnerId, 'OWNER');
  }

  async listParticipants(roomId: string): Promise<any[]> {
    return this.membersRepository.findJoinedMembers(roomId);
  }

  async checkAccess(roomId: string, userId: string): Promise<{ allowed: boolean; role?: string }> {
    const membership = await this.membersRepository.findMembership(roomId, userId);
    if (!membership || membership.status !== MemberStatus.JOINED) {
      return { allowed: false };
    }
    return { allowed: true, role: membership.role };
  }

  async getMembership(roomId: string, userId: string) {
    return this.membersRepository.findMembership(roomId, userId);
  }
}
