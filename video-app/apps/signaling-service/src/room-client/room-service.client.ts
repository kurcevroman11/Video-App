import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, ClientProxyFactory } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom, timeout, Observable } from 'rxjs';

export interface AccessResult {
  allowed: boolean;
  role?: string;
}

export interface SavedMessage {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
}

@Injectable()
export class RoomServiceClient implements OnModuleInit {
  private readonly logger = new Logger(RoomServiceClient.name);
  private client: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('ROOM_SERVICE_HOST') || 'localhost';
    const port = this.configService.get<string>('ROOM_SERVICE_PORT') || '50051';

    this.logger.log(`Connecting to room-service at ${host}:${port}`);

    const client = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'room',
        protoPath: join(__dirname, '../../../../libs/contracts/proto/room.proto'),
        url: `${host}:${port}`,
        loader: {
          keepCase: true,
          longs: String,
          enums: String,
          defaults: true,
          oneofs: true,
        },
      },
    });

    this.client = client.getService('RoomService');
  }

  async checkAccess(roomId: string, userId: string): Promise<AccessResult> {
    try {
      this.logger.log(`Checking access for room ${roomId}, user ${userId}`);
      const result: any = await firstValueFrom(
        this.client.CheckAccess({ room_id: roomId, user_id: userId }).pipe(timeout(5000))
      );
      this.logger.log(`CheckAccess result: ${JSON.stringify(result)}`);
      return {
        allowed: result.allowed,
        role: result.role,
      };
    } catch (error) {
      this.logger.error(`Failed to check access: ${error.message}`, error.stack);
      return { allowed: false };
    }
  }

  async saveMessage(roomId: string, userId: string, content: string): Promise<SavedMessage> {
    try {
      this.logger.log(`Saving message for user ${userId} in room ${roomId}`);
      const result: any = await firstValueFrom(
        this.client.SaveMessage({ room_id: roomId, user_id: userId, content }).pipe(timeout(5000))
      );
      return {
        id: result.id,
        userId: result.user_id,
        content: result.content,
        createdAt: result.created_at,
      };
    } catch (error) {
      this.logger.error(`Failed to save message: ${error.message}`, error.stack);
      throw error;
    }
  }
}
