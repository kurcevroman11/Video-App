import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { RouterRegistryService } from '../rooms/router-registry.service';
import { TransportService } from '../transports/transport.service';
import { ProducerService } from '../producers/producer.service';
import { ConsumerService } from '../consumers/consumer.service';
import { ParticipantStateService } from '../participants/participant-state.service';

@Controller()
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly routerRegistry: RouterRegistryService,
    private readonly transports: TransportService,
    private readonly producers: ProducerService,
    private readonly consumers: ConsumerService,
    private readonly participants: ParticipantStateService,
  ) {}

  @GrpcMethod('MediaService', 'GetRouterRtpCapabilities')
  async getRouterRtpCapabilities(data: { room_id: string }) {
    const router = await this.routerRegistry.getOrCreateRouter(data.room_id);
    return { rtp_capabilities: JSON.stringify(router.rtpCapabilities) };
  }

  @GrpcMethod('MediaService', 'CreateWebRtcTransport')
  async createWebRtcTransport(data: {
    room_id: string;
    user_id: string;
    direction: 'send' | 'recv';
  }) {
    const params = await this.transports.create(data.room_id, data.user_id, data.direction);
    return {
      id: params.id,
      ice_parameters: JSON.stringify(params.iceParameters),
      ice_candidates: JSON.stringify(params.iceCandidates),
      dtls_parameters: JSON.stringify(params.dtlsParameters),
    };
  }

  @GrpcMethod('MediaService', 'ConnectTransport')
  async connectTransport(data: {
    room_id: string;
    user_id: string;
    transport_id: string;
    dtls_parameters: string;
  }) {
    await this.transports.connect(
      data.room_id,
      data.user_id,
      data.transport_id,
      JSON.parse(data.dtls_parameters),
    );
    return {};
  }

  @GrpcMethod('MediaService', 'Produce')
  async produce(data: {
    room_id: string;
    user_id: string;
    transport_id: string;
    kind: 'audio' | 'video';
    rtp_parameters: string;
  }) {
    const result = await this.producers.produce(
      data.room_id,
      data.user_id,
      data.transport_id,
      data.kind,
      JSON.parse(data.rtp_parameters),
    );
    return { producer_id: result.producerId, kind: result.kind };
  }

  @GrpcMethod('MediaService', 'Consume')
  async consume(data: {
    room_id: string;
    user_id: string;
    transport_id: string;
    producer_id: string;
    rtp_capabilities: string;
  }) {
    const params = await this.consumers.consume(
      data.room_id,
      data.user_id,
      data.transport_id,
      data.producer_id,
      JSON.parse(data.rtp_capabilities),
    );
    return {
      consumer_id: params.consumerId,
      producer_id: params.producerId,
      kind: params.kind,
      paused: params.paused,
      rtp_parameters: JSON.stringify(params.rtpParameters),
    };
  }

  @GrpcMethod('MediaService', 'ResumeConsumer')
  async resumeConsumer(data: { room_id: string; user_id: string; consumer_id: string }) {
    await this.consumers.resume(data.room_id, data.user_id, data.consumer_id);
    return {};
  }

  @GrpcMethod('MediaService', 'CloseParticipant')
  async closeParticipant(data: { room_id: string; user_id: string }) {
    const { room_id: roomId, user_id: userId } = data;

    // Закрываем Producer'ы и получаем их id — их signaling разошлёт как producer-closed.
    const closedProducerIds = this.producers.closeParticipantProducers(roomId, userId);

    const participant = this.participants.get(roomId, userId);
    if (participant) {
      participant.sendTransport?.close();
      participant.recvTransport?.close();
    }
    this.participants.remove(roomId, userId);

    // Если в комнате никого не осталось — Router больше не нужен, закрываем его.
    if (!this.participants.hasRoom(roomId)) {
      await this.routerRegistry.closeRouter(roomId);
    }

    this.logger.log(
      `Closed participant ${userId} in room ${roomId}, closed producers: [${closedProducerIds.join(', ')}]`
    );

    return { producer_ids: closedProducerIds };
  }
}