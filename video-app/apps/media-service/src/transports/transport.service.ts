import { Injectable, Logger } from '@nestjs/common';
import { types as mediasoupTypes } from 'mediasoup';
import { RouterRegistryService } from '../rooms/router-registry.service';
import { ParticipantStateService, Participant } from '../participants/participant-state.service';
import { WorkerPoolService } from '../workers/worker-pool.service';

export interface TransportParams {
  id: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
}

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    private readonly routerRegistry: RouterRegistryService,
    private readonly participants: ParticipantStateService,
    private readonly workerPool: WorkerPoolService,
  ) {}

  async create(
    roomId: string,
    userId: string,
    direction: 'send' | 'recv',
  ): Promise<TransportParams> {
    const router = await this.routerRegistry.getOrCreateRouter(roomId);
    const announcedIp = this.workerPool.getConfig().announcedIp;

    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: '0.0.0.0', announcedIp }],
      enableUdp: true,
      enableTcp: true, // fallback, если UDP заблокирован на сети клиента
      preferUdp: true,
      appData: { roomId, userId, direction },
    });

    transport.on('dtlsstatechange', (state) => {
      if (state === 'failed' || state === 'closed') {
        this.logger.warn(
          `Transport ${transport.id} (${direction}) dtls=${state} for user ${userId} in room ${roomId}`
        );
      }
    });

    this.logger.log(
      `Created ${direction} WebRtcTransport ${transport.id} for user ${userId} in room ${roomId}`
    );

    const participant: Participant = this.participants.ensure(roomId, userId);
    if (direction === 'send') {
      if (participant.sendTransport) {
        participant.sendTransport.close();
        this.logger.warn(`Replacing existing send transport for ${userId}`);
      }
      participant.sendTransport = transport;
    } else {
      if (participant.recvTransport) {
        participant.recvTransport.close();
        this.logger.warn(`Replacing existing recv transport for ${userId}`);
      }
      participant.recvTransport = transport;
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connect(
    roomId: string,
    userId: string,
    transportId: string,
    dtlsParameters: mediasoupTypes.DtlsParameters,
  ): Promise<void> {
    const participant = this.participants.get(roomId, userId);
    const transport = this.findTransport(participant, transportId);
    if (!transport) {
      throw new Error(`Transport ${transportId} not found for user ${userId} in room ${roomId}`);
    }
    await transport.connect({ dtlsParameters });
    this.logger.log(`Transport ${transportId} connected (user ${userId})`);
  }

  getSendTransport(roomId: string, userId: string): mediasoupTypes.WebRtcTransport | null {
    return this.participants.get(roomId, userId)?.sendTransport ?? null;
  }

  getRecvTransport(roomId: string, userId: string): mediasoupTypes.WebRtcTransport | null {
    return this.participants.get(roomId, userId)?.recvTransport ?? null;
  }

  getById(
    roomId: string,
    userId: string,
    transportId: string,
  ): mediasoupTypes.WebRtcTransport | null {
    const participant = this.participants.get(roomId, userId);
    return this.findTransport(participant, transportId);
  }

  private findTransport(
    participant: Participant | undefined,
    transportId: string,
  ): mediasoupTypes.WebRtcTransport | null {
    if (!participant) return null;
    if (participant.sendTransport?.id === transportId) return participant.sendTransport;
    if (participant.recvTransport?.id === transportId) return participant.recvTransport;
    return null;
  }
}