import { Room as PrismaRoom, RoomMember as PrismaRoomMember, Invite as PrismaInvite } from '../../node_modules/.prisma/room-client';

export interface RoomProto {
  id: string;
  name: string;
  owner_id: string;
  type: string;
  status: string;
  max_participants: number;
  created_at: string;
  updated_at: string;
}

export interface RoomMemberProto {
  id: string;
  room_id: string;
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  left_at: string;
}

export interface InviteProto {
  id: string;
  room_id: string;
  code: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  uses_count: number;
}

function toUnixMs(value: Date | null | undefined): string {
  if (!value) return '0';
  return String(Math.floor(value.getTime()));
}

export function mapRoom(room: PrismaRoom): RoomProto {
  return {
    id: room.id,
    name: room.name,
    owner_id: room.ownerId || '',
    type: room.type,
    status: room.status,
    max_participants: room.maxParticipants || 0,
    created_at: toUnixMs(room.createdAt),
    updated_at: toUnixMs(room.updatedAt),
  };
}

export function mapRoomMember(member: PrismaRoomMember | null): RoomMemberProto {
  if (!member) {
    return { id: '', room_id: '', user_id: '', role: '', status: '', joined_at: '0', left_at: '0' };
  }
  return {
    id: member.id,
    room_id: member.roomId,
    user_id: member.userId,
    role: member.role,
    status: member.status,
    joined_at: toUnixMs(member.joinedAt),
    left_at: toUnixMs(member.leftAt),
  };
}

export function mapInvite(invite: PrismaInvite): InviteProto {
  return {
    id: invite.id,
    room_id: invite.roomId,
    code: invite.code,
    created_by: invite.createdBy,
    expires_at: toUnixMs(invite.expiresAt),
    max_uses: invite.maxUses || 0,
    uses_count: invite.usesCount || 0,
  };
}