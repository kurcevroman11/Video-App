import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SignalingStateService } from './signaling-state.service';
import { RoomServiceClient } from '../room-client/room-service.client';
import { MediaServiceClient } from '../media-client/media-service.client';
import {
  JoinRoomDto,
  CreateTransportDto,
  ConnectTransportDto,
  ProduceDto,
  ConsumeDto,
  ResumeConsumerDto,
} from './dto/signaling.dto';

@WebSocketGateway({
  namespace: 'signaling',
  cors: { origin: '*' },
})
export class SignalingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SignalingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly signalingState: SignalingStateService,
    private readonly roomServiceClient: RoomServiceClient,
    private readonly mediaServiceClient: MediaServiceClient,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;

    if (!token) {
      this.logger.warn(`Client ${client.id} connected without token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.verified = true;
      this.logger.log(`Client ${client.id} connected as user ${payload.sub}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} failed JWT verification: ${error.message}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId;

    if (!userId) {
      this.logger.log(`Client ${client.id} disconnected (no userId)`);
      return;
    }

    const rooms = this.signalingState.getUserRooms(userId);

    for (const roomId of rooms) {
      await this.closeParticipantAndNotify(roomId, userId, 'disconnect');
      this.signalingState.removeUserFromRoom(roomId, userId);
      this.server.to(roomId).emit('user-left', { userId });
      this.logger.log(`User ${userId} left room ${roomId} (disconnect)`);
    }

    this.logger.log(`Client ${client.id} (user ${userId}) disconnected`);
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @MessageBody() payload: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;

    if (!userId) {
      client.emit('error', { code: 'NOT_AUTHENTICATED', message: 'Not authenticated' });
      client.disconnect(true);
      return;
    }

    const { roomId } = payload;

    const access = await this.roomServiceClient.checkAccess(roomId, userId);

    if (!access.allowed) {
      client.emit('error', { code: 'ACCESS_DENIED', message: 'Not allowed in this room' });
      client.disconnect(true);
      return;
    }

    // Если у пользователя был залипший сокет в этой комнате — отсоединяем его
    // от socket.io-рума и уведомляем остальных, чтобы они не ждали призрака.
    const staleSocketId = this.signalingState.addParticipant(roomId, userId, client.id);
    if (staleSocketId && staleSocketId !== client.id) {
      this.server.to(roomId).emit('user-left', { userId });
    }

    client.join(roomId);

    const existingParticipants = this.signalingState.getParticipants(roomId, client.id);
    client.emit('room-joined', {
      participants: existingParticipants.map(p => ({ userId: p.userId })),
      // Новому участнику сразу перечисляем уже существующие Producer'ы в комнате —
      // он создаёт Consumer'ы на них в сценарии из п.6 спецификации.
      producers: this.signalingState.getProducers(roomId),
    });

    client.to(roomId).emit('user-joined', { userId });
    this.logger.log(`User ${userId} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  async handleLeaveRoom(
    @MessageBody() payload: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    if (!userId) return;

    const { roomId } = payload;

    await this.closeParticipantAndNotify(roomId, userId, 'leave');
    this.signalingState.removeUserFromRoom(roomId, userId);
    client.leave(roomId);

    client.emit('room-left', { roomId });
    client.to(roomId).emit('user-left', { userId });

    this.logger.log(`User ${userId} left room ${roomId} (explicit)`);
  }

  @SubscribeMessage('get-router-capabilities')
  async handleGetRouterCapabilities(
    @MessageBody() payload: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const socketId = client.id;
    try {
      const rtpCapabilities = await this.mediaServiceClient.getRouterRtpCapabilities(payload.roomId);
      client.emit('router-capabilities', { rtpCapabilities });
    } catch (error: any) {
      this.logger.error(`get-router-capabilities failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  @SubscribeMessage('create-transport')
  async handleCreateTransport(
    @MessageBody() payload: CreateTransportDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    const socketId = client.id;
    if (!userId) return;

    const roomId = this.signalingState.getRoomIdBySocketId(socketId);
    if (!roomId) {
      client.emit('error', { code: 'NOT_IN_ROOM', message: 'Not in a room' });
      return;
    }

    try {
      const transport = await this.mediaServiceClient.createWebRtcTransport(
        roomId,
        userId,
        payload.direction,
      );
      this.logger.log(`Created ${payload.direction} transport ${transport.id} for ${userId}`);
      client.emit('transport-created', transport);
    } catch (error: any) {
      this.logger.error(`create-transport failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  @SubscribeMessage('connect-transport')
  async handleConnectTransport(
    @MessageBody() payload: ConnectTransportDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    const socketId = client.id;
    if (!userId) return;

    const roomId = this.signalingState.getRoomIdBySocketId(socketId);
    if (!roomId) return;

    try {
      await this.mediaServiceClient.connectTransport(
        roomId,
        userId,
        payload.transportId,
        payload.dtlsParameters,
      );
      client.emit('transport-connected', { transportId: payload.transportId });
    } catch (error: any) {
      this.logger.error(`connect-transport failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  @SubscribeMessage('produce')
  async handleProduce(
    @MessageBody() payload: ProduceDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    const socketId = client.id;
    if (!userId) return;

    const roomId = this.signalingState.getRoomIdBySocketId(socketId);
    if (!roomId) return;

    try {
      const { producerId, kind } = await this.mediaServiceClient.produce(
        roomId,
        userId,
        payload.transportId,
        payload.kind,
        payload.rtpParameters,
      );

      this.signalingState.addProducer(roomId, producerId, userId, kind as 'audio' | 'video');

      // Рассылаем остальным участникам комнаты new-producer.
      client.to(roomId).emit('new-producer', { producerId, userId, kind });
      this.logger.log(`Producer ${producerId} (${kind}) for user ${userId} in room ${roomId}, notified room`);

      client.emit('produced', { producerId, kind });
    } catch (error: any) {
      this.logger.error(`produce failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  @SubscribeMessage('consume')
  async handleConsume(
    @MessageBody() payload: ConsumeDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    const socketId = client.id;
    if (!userId) return;

    const roomId = this.signalingState.getRoomIdBySocketId(socketId);
    if (!roomId) return;

    try {
      const consumerParams = await this.mediaServiceClient.consume(
        roomId,
        userId,
        payload.transportId,
        payload.producerId,
        payload.rtpCapabilities,
      );
      this.logger.log(
        `Consumer ${consumerParams.consumerId} for user ${userId} <- producer ${payload.producerId}`
      );
      client.emit('consumed', consumerParams);
    } catch (error: any) {
      this.logger.error(`consume failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  @SubscribeMessage('resume-consumer')
  async handleResumeConsumer(
    @MessageBody() payload: ResumeConsumerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data?.userId;
    const socketId = client.id;
    if (!userId) return;

    const roomId = this.signalingState.getRoomIdBySocketId(socketId);
    if (!roomId) return;

    try {
      await this.mediaServiceClient.resumeConsumer(roomId, userId, payload.consumerId);
      client.emit('consumer-resumed', { consumerId: payload.consumerId });
    } catch (error: any) {
      this.logger.error(`resume-consumer failed: ${error.message}`);
      client.emit('error', { code: 'MEDIA_ERROR', message: error.message });
    }
  }

  /**
   * Каскадно закрывает Producer'ы участника через media-service (CloseParticipant)
   * и рассылает producer-closed остальным. Возвращает закрытые producerId.
   */
  private async closeParticipantAndNotify(
    roomId: string,
    userId: string,
    reason: string,
  ): Promise<string[]> {
    let closedProducerIds: string[] = [];
    try {
      closedProducerIds = await this.mediaServiceClient.closeParticipant(roomId, userId);
    } catch (error: any) {
      // media-service может быть недоступен (например, при полном падении) —
      // тогда опираемся на локальный продюсер-реестр signaling.
      this.logger.warn(`CloseParticipant failed (${reason}): ${error.message}`);
      closedProducerIds = this.signalingState.removeAllProducersByUser(roomId, userId);
    }

    // Убираем из локального реестра и уведомляем комнату.
    for (const producerId of closedProducerIds) {
      this.signalingState.removeProducer(roomId, producerId);
      this.server.to(roomId).emit('producer-closed', { producerId });
    }

    return closedProducerIds;
  }
}