import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { RoomsService } from './rooms.service';

@Controller()
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @GrpcMethod('RoomService', 'CreateRoom')
  async createRoom(data: any) {
    console.log('Room-service received CreateRoom:', JSON.stringify(data));
    const room = await this.roomsService.createRoom({
      name: data.name,
      ownerId: data.owner_id,
      type: data.type,
      maxParticipants: data.max_participants,
    });
    return room;
  }

  @GrpcMethod('RoomService', 'GetRoom')
  async getRoom(data: any) {
    const room = await this.roomsService.getRoom(data.id);
    return room;
  }

  @GrpcMethod('RoomService', 'DeleteRoom')
  async deleteRoom(data: any) {
    await this.roomsService.deleteRoom(data.id, data.requester_id);
    return {};
  }
}
