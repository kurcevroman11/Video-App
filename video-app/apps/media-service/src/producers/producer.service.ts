import { Injectable, Logger } from '@nestjs/common';
import { types as mediasoupTypes } from 'mediasoup';
import { TransportService } from '../transports/transport.service';
import { ParticipantStateService } from '../participants/participant-state.service';

@Injectable()
export class ProducerService {
  private readonly logger = new Logger(ProducerService.name);

  constructor(
    private readonly transports: TransportService,
    private readonly participants: ParticipantStateService,
  ) {}

  async produce(
    roomId: string,
    userId: string,
    transportId: string,
    kind: mediasoupTypes.MediaKind,
    rtpParameters: mediasoupTypes.RtpParameters,
  ): Promise<{ producerId: string; kind: mediasoupTypes.MediaKind }> {
    const transport = this.transports.getById(roomId, userId, transportId);
    if (!transport) {
      throw new Error(
        `Cannot produce: send transport ${transportId} not found for user ${userId} in room ${roomId}`
      );
    }

    if (kind !== 'audio' && kind !== 'video') {
      throw new Error(`Invalid producer kind: ${kind}`);
    }

    let producer: mediasoupTypes.Producer;
    try {
      producer = await transport.produce({ kind, rtpParameters });
    } catch (error: any) {
      this.logger.warn(`Produce failed for ${userId}: ${error.message}`);
      throw new Error(`Produce failed: ${error.message}`);
    }

    const participant = this.participants.ensure(roomId, userId);
    participant.producers.set(producer.id, producer);

    this.logger.log(
      `Producer ${producer.id} (${kind}) created by user ${userId} in room ${roomId}`
    );

    producer.on('@close', () => {
      participant.producers.delete(producer.id);
      this.logger.log(
        `Producer ${producer.id} (${kind}) closed for user ${userId} in room ${roomId}`
      );
    });

    return { producerId: producer.id, kind };
  }

  /**
   * Закрывает все Producer'ы участника. Возвращает список закрытых producerId —
   * именно их signaling-service разошлёт остальным как producer-closed.
   */
  closeParticipantProducers(roomId: string, userId: string): string[] {
    const participant = this.participants.get(roomId, userId);
    if (!participant) return [];

    const closedIds: string[] = [];
    for (const producer of participant.producers.values()) {
      producer.close(); // закрывает и связанные Consumer'ы на стороне mediasoup
      closedIds.push(producer.id);
    }
    participant.producers.clear();
    return closedIds;
  }

  getProducers(roomId: string, userId: string): mediasoupTypes.Producer[] {
    return Array.from(this.participants.get(roomId, userId)?.producers.values() ?? []);
  }
}