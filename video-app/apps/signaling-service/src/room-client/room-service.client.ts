import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, ClientProxyFactory } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom, timeout, Observable } from 'rxjs';

export interface AccessResult {
  allowed: boolean;
  role?: string;
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
}
