import { Injectable, Logger } from '@nestjs/common';
import { types as mediasoupTypes } from 'mediasoup';
import { WorkerPoolService } from '../workers/worker-pool.service';

export const MEDIA_CODECS: mediasoupTypes.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    preferredPayloadType: 96,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

@Injectable()
export class RouterRegistryService {
  private readonly logger = new Logger(RouterRegistryService.name);
  // roomId → Router. Одна комната = один Router (маршрутизация внутри комнаты).
  private routers = new Map<string, mediasoupTypes.Router>();

  constructor(private readonly workerPool: WorkerPoolService) {}

  async getOrCreateRouter(roomId: string): Promise<mediasoupTypes.Router> {
    const existing = this.routers.get(roomId);
    if (existing) return existing;

    // Комнаты распределяются по Worker'ам round-robin, а не собираются на одном.
    const worker = this.workerPool.getNextWorker();
    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    this.routers.set(roomId, router);
    this.logger.log(`Created router for room ${roomId} on worker pid ${worker.pid}`);

    router.on('@close', () => {
      this.logger.log(`Router for room ${roomId} closed`);
    });

    return router;
  }

  getRouter(roomId: string): mediasoupTypes.Router | undefined {
    return this.routers.get(roomId);
  }

  async closeRouter(roomId: string): Promise<void> {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
      this.logger.log(`Router for room ${roomId} closed & removed`);
    }
  }
}