import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, ClientProxyFactory } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom, timeout, Observable } from 'rxjs';

interface RoomServiceClient {
  CreateRoom(data: any): Observable<any>;
  GetRoom(data: any): Observable<any>;
  DeleteRoom(data: any): Observable<any>;
  JoinRoom(data: any): Observable<any>;
  LeaveRoom(data: any): Observable<any>;
  ListParticipants(data: any): Observable<any>;
  GetMessages(data: any): Observable<any>;
}

@Injectable()
export class RoomsGrpcClient implements OnModuleInit {
  private client: RoomServiceClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const client = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'room',
        protoPath: join(__dirname, '../../../../libs/contracts/proto/room.proto'),
        url: `${process.env.ROOM_SERVICE_HOST || 'localhost'}:${process.env.ROOM_SERVICE_PORT || '50051'}`,
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    });

    this.client = client.getService<RoomServiceClient>('RoomService');
  }

  async createRoom(data: { name: string; ownerId: string; type: string; maxParticipants?: number }) {
    try {
      const grpcData = {
        name: data.name,
        owner_id: data.ownerId || 'fallback-owner-id',
        type: data.type,
        max_participants: data.maxParticipants,
      };
      console.log('gRPC sending CreateRoom:', JSON.stringify(grpcData));
      return await firstValueFrom(this.client.CreateRoom(grpcData).pipe(timeout(5000)));
    } catch (error) {
      console.error('gRPC CreateRoom error:', error);
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async getRoom(data: { id: string }) {
    try {
      return await firstValueFrom(this.client.GetRoom({ id: data.id }).pipe(timeout(5000)));
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async deleteRoom(data: { id: string; requesterId: string }) {
    try {
      return await firstValueFrom(this.client.DeleteRoom({ id: data.id, requester_id: data.requesterId }).pipe(timeout(5000)));
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async joinRoom(data: { roomId: string; userId: string; inviteCode?: string }) {
    try {
      return await firstValueFrom(this.client.JoinRoom({ room_id: data.roomId, user_id: data.userId, invite_code: data.inviteCode }).pipe(timeout(5000)));
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async leaveRoom(data: { roomId: string; userId: string }) {
    try {
      return await firstValueFrom(this.client.LeaveRoom({ room_id: data.roomId, user_id: data.userId }).pipe(timeout(5000)));
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async listParticipants(data: { roomId: string }) {
    try {
      return await firstValueFrom(this.client.ListParticipants({ room_id: data.roomId }).pipe(timeout(5000)));
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }

  async getMessages(data: { roomId: string; cursor?: string; limit?: number }) {
    try {
      return await firstValueFrom(
        this.client.GetMessages({ room_id: data.roomId, cursor: data.cursor, limit: data.limit }).pipe(timeout(5000))
      );
    } catch (error) {
      throw new ServiceUnavailableException('Room service unavailable');
    }
  }
}
