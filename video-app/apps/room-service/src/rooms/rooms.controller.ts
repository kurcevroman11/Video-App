import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { RoomsService } from './rooms.service';
import { mapRoom } from '../common/proto.mappers';

@Controller()
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @GrpcMethod('RoomService', 'CreateRoom')
  async createRoom(data: any) {
    const room = await this.roomsService.createRoom({
      name: data.name,
      ownerId: data.owner_id,
      type: data.type,
      maxParticipants: data.max_participants,
    });
    return mapRoom(room);
  }

  @GrpcMethod('RoomService', 'GetRoom')
  async getRoom(data: any) {
    const room = await this.roomsService.getRoom(data.id);
    return mapRoom(room);
  }

  @GrpcMethod('RoomService', 'DeleteRoom')
  async deleteRoom(data: any) {
    await this.roomsService.deleteRoom(data.id, data.requester_id);
    return {};
  }
}
