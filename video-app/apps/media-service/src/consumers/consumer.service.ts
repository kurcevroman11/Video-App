import { Injectable, Logger } from '@nestjs/common';
import { types as mediasoupTypes } from 'mediasoup';
import { RouterRegistryService } from '../rooms/router-registry.service';
import { TransportService } from '../transports/transport.service';
import { ParticipantStateService } from '../participants/participant-state.service';

export interface ConsumerParams {
  consumerId: string;
  producerId: string;
  kind: mediasoupTypes.MediaKind;
  paused: boolean;
  rtpParameters: mediasoupTypes.RtpParameters;
}

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name);

  constructor(
    private readonly routerRegistry: RouterRegistryService,
    private readonly transports: TransportService,
    private readonly participants: ParticipantStateService,
  ) {}

  async consume(
    roomId: string,
    userId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities,
  ): Promise<ConsumerParams> {
    const router = this.routerRegistry.getRouter(roomId);
    if (!router) {
      throw new Error(`No router for room ${roomId}`);
    }

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(
        `Cannot consume producer ${producerId} in room ${roomId}: not compatible or missing`
      );
    }

    const transport = this.transports.getById(roomId, userId, transportId);
    if (!transport) {
      throw new Error(
        `Cannot consume: recv transport ${transportId} not found for user ${userId}`
      );
    }

    // Consumer создаётся на паузе намеренно (п.7 спецификации): клиент настраивает
    // локальный MediaStreamTrack и только потом шлёт resume-consumer.
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
      appData: { roomId, userId },
    });

    const participant = this.participants.ensure(roomId, userId);
    participant.consumers.set(consumer.id, consumer);

    this.logger.log(
      `Consumer ${consumer.id} (${consumer.kind}) created for user ${userId} <- producer ${producerId} (room ${roomId})`
    );

    consumer.on('@close', () => {
      participant.consumers.delete(consumer.id);
      this.logger.log(
        `Consumer ${consumer.id} closed for user ${userId} (producer ${producerId})`
      );
    });

    return {
      consumerId: consumer.id,
      producerId,
      kind: consumer.kind,
      paused: consumer.paused,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resume(roomId: string, userId: string, consumerId: string): Promise<void> {
    const participant = this.participants.get(roomId, userId);
    const consumer = participant?.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer ${consumerId} not found for user ${userId} in room ${roomId}`);
    }
    await consumer.resume();
    this.logger.log(`Consumer ${consumerId} resumed for user ${userId}`);
  }
}