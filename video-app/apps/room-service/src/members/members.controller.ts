import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MembersService } from './members.service';
import {
  JoinRoomDto,
  LeaveRoomDto,
  KickParticipantDto,
  ChangeRoleDto,
  TransferOwnershipDto,
  ListParticipantsDto,
} from './dto/member.dto';

@Controller()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @GrpcMethod('RoomService', 'JoinRoom')
  async joinRoom(data: any) {
    await this.membersService.joinRoom(data.room_id, data.user_id, data.invite_code);
    const membership = await this.membersService.getMembership(data.room_id, data.user_id);
    return membership;
  }

  @GrpcMethod('RoomService', 'LeaveRoom')
  async leaveRoom(data: any) {
    await this.membersService.leaveRoom(data.room_id, data.user_id);
    return {};
  }

  @GrpcMethod('RoomService', 'KickParticipant')
  async kickParticipant(data: any) {
    await this.membersService.kickParticipant(data.room_id, data.target_user_id, data.requester_id);
    return {};
  }

  @GrpcMethod('RoomService', 'ChangeRole')
  async changeRole(data: any) {
    await this.membersService.changeRole(data.room_id, data.target_user_id, data.new_role, data.requester_id);
    const membership = await this.membersService.getMembership(data.room_id, data.target_user_id);
    return membership;
  }

  @GrpcMethod('RoomService', 'TransferOwnership')
  async transferOwnership(data: any) {
    await this.membersService.transferOwnership(data.room_id, data.new_owner_id, data.current_owner_id);
    return {};
  }

  @GrpcMethod('RoomService', 'ListParticipants')
  async listParticipants(data: any) {
    const participants = await this.membersService.listParticipants(data.room_id);
    return { participants };
  }

  @GrpcMethod('RoomService', 'CheckAccess')
  async checkAccess(data: any) {
    console.log('Room-service CheckAccess received:', JSON.stringify(data));
    console.log('room_id:', data.room_id, 'user_id:', data.user_id);
    return this.membersService.checkAccess(data.room_id, data.user_id);
  }
}
