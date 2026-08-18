import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Transport, ClientProxyFactory } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom, timeout } from 'rxjs';

export interface ConsumerInfoParams {
  consumerId: string;
  producerId: string;
  kind: string;
  paused: boolean;
  rtpParameters: any;
}

@Injectable()
export class MediaServiceClient implements OnModuleInit {
  private readonly logger = new Logger(MediaServiceClient.name);
  private client: any;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('MEDIA_SERVICE_HOST') || 'localhost';
    const port = this.configService.get<string>('MEDIA_SERVICE_PORT') || '50052';

    this.logger.log(`Connecting to media-service at ${host}:${port}`);

    const client = ClientProxyFactory.create({
      transport: Transport.GRPC,
      options: {
        package: 'media',
        protoPath: join(__dirname, '../../../../libs/contracts/proto/media.proto'),
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

    this.client = client.getService('MediaService');
  }

  async getRouterRtpCapabilities(roomId: string): Promise<string> {
    const result: any = await this.call('GetRouterRtpCapabilities', { room_id: roomId });
    return result.rtp_capabilities as string;
  }

  async createWebRtcTransport(roomId: string, userId: string, direction: string) {
    const result: any = await this.call('CreateWebRtcTransport', {
      room_id: roomId,
      user_id: userId,
      direction,
    });
    return {
      id: result.id,
      iceParameters: JSON.parse(result.ice_parameters),
      iceCandidates: JSON.parse(result.ice_candidates),
      dtlsParameters: JSON.parse(result.dtls_parameters),
    };
  }

  async connectTransport(
    roomId: string,
    userId: string,
    transportId: string,
    dtlsParameters: any,
  ): Promise<void> {
    await this.call('ConnectTransport', {
      room_id: roomId,
      user_id: userId,
      transport_id: transportId,
      dtls_parameters: JSON.stringify(dtlsParameters),
    });
  }

  async produce(
    roomId: string,
    userId: string,
    transportId: string,
    kind: string,
    rtpParameters: any,
  ): Promise<{ producerId: string; kind: string }> {
    const result: any = await this.call('Produce', {
      room_id: roomId,
      user_id: userId,
      transport_id: transportId,
      kind,
      rtp_parameters: JSON.stringify(rtpParameters),
    });
    return { producerId: result.producer_id, kind: result.kind };
  }

  async consume(
    roomId: string,
    userId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: any,
  ): Promise<ConsumerInfoParams> {
    const result: any = await this.call('Consume', {
      room_id: roomId,
      user_id: userId,
      transport_id: transportId,
      producer_id: producerId,
      rtp_capabilities: JSON.stringify(rtpCapabilities),
    });
    return {
      consumerId: result.consumer_id,
      producerId: result.producer_id,
      kind: result.kind,
      paused: result.paused,
      rtpParameters: JSON.parse(result.rtp_parameters),
    };
  }

  async resumeConsumer(roomId: string, userId: string, consumerId: string): Promise<void> {
    await this.call('ResumeConsumer', { room_id: roomId, user_id: userId, consumer_id: consumerId });
  }

  async closeParticipant(roomId: string, userId: string): Promise<string[]> {
    const result: any = await this.call('CloseParticipant', { room_id: roomId, user_id: userId });
    return result.producer_ids as string[];
  }

  private async call(method: string, request: any): Promise<any> {
    try {
      return await firstValueFrom(this.client[method](request).pipe(timeout(5000)));
    } catch (error: any) {
      this.logger.error(`gRPC ${method} failed: ${error.message}`);
      throw error;
    }
  }
}