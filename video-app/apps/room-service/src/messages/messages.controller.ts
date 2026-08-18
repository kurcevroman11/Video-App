import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessagesService } from './messages.service';
import { mapRoomMessage } from '../common/proto.mappers';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @GrpcMethod('RoomService', 'SaveMessage')
  async saveMessage(data: any) {
    const message = await this.messagesService.saveMessage(
      data.room_id,
      data.user_id,
      data.content,
    );
    return mapRoomMessage(message);
  }

  @GrpcMethod('RoomService', 'GetMessages')
  async getMessages(data: any) {
    const { messages, nextCursor } = await this.messagesService.getMessages(
      data.room_id,
      data.cursor,
      data.limit,
    );
    return {
      messages: messages.map(mapRoomMessage),
      next_cursor: nextCursor,
    };
  }
}