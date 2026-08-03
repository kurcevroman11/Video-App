import { IsString, IsOptional, IsEnum } from 'class-validator';
import { MemberRole } from '../../common/enums';

export class JoinRoomDto {
  @IsString()
  roomId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;
}

export class LeaveRoomDto {
  @IsString()
  roomId: string;

  @IsString()
  userId: string;
}

export class KickParticipantDto {
  @IsString()
  roomId: string;

  @IsString()
  targetUserId: string;

  @IsString()
  requesterId: string;
}

export class ChangeRoleDto {
  @IsString()
  roomId: string;

  @IsString()
  targetUserId: string;

  @IsEnum(MemberRole)
  newRole: MemberRole;

  @IsString()
  requesterId: string;
}

export class TransferOwnershipDto {
  @IsString()
  roomId: string;

  @IsString()
  newOwnerId: string;

  @IsString()
  currentOwnerId: string;
}

export class ListParticipantsDto {
  @IsString()
  roomId: string;
}
