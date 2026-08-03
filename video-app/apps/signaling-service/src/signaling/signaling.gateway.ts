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
import { Logger, UseFilters } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SignalingStateService } from './signaling-state.service';
import { RoomServiceClient } from '../room-client/room-service.client';
import { JoinRoomDto, OfferDto, AnswerDto, IceCandidateDto } from './dto/signaling.dto';
import { WsExceptionFilter } from '../auth/ws-exception.filter';

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
      const participant = this.signalingState.removeUserFromRoom(roomId, userId);
      if (participant) {
        this.server.to(roomId).emit('user-left', { userId });
        this.logger.log(`User ${userId} left room ${roomId} (disconnect)`);
      }
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

    client.join(roomId);
    this.signalingState.addParticipant(roomId, userId, client.id);

    const existingParticipants = this.signalingState.getParticipants(roomId, client.id);
    client.emit('room-joined', {
      participants: existingParticipants.map(p => ({ userId: p.userId })),
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

    this.signalingState.removeUserFromRoom(roomId, userId);
    client.leave(roomId);

    client.emit('room-left', { roomId });
    client.to(roomId).emit('user-left', { userId });

    this.logger.log(`User ${userId} left room ${roomId} (explicit)`);
  }

  @SubscribeMessage('offer')
  async handleOffer(
    @MessageBody() payload: OfferDto,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    const { targetUserId, sdp } = payload;
    const senderRoomId = this.signalingState.getRoomIdBySocketId(client.id);

    if (!senderRoomId || !this.signalingState.isUserInRoom(senderRoomId, targetUserId)) {
      client.emit('error', { code: 'INVALID_TARGET', message: 'Target user not in room' });
      return;
    }

    const targetSocketId = this.signalingState.getSocketIdByUserId(senderRoomId, targetUserId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('offer', { userId: senderId, sdp });
    }
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @MessageBody() payload: AnswerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    const { targetUserId, sdp } = payload;
    const senderRoomId = this.signalingState.getRoomIdBySocketId(client.id);

    if (!senderRoomId || !this.signalingState.isUserInRoom(senderRoomId, targetUserId)) {
      client.emit('error', { code: 'INVALID_TARGET', message: 'Target user not in room' });
      return;
    }

    const targetSocketId = this.signalingState.getSocketIdByUserId(senderRoomId, targetUserId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('answer', { userId: senderId, sdp });
    }
  }

  @SubscribeMessage('ice-candidate')
  async handleIceCandidate(
    @MessageBody() payload: IceCandidateDto,
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data?.userId;
    if (!senderId) return;

    const { targetUserId, candidate } = payload;
    const senderRoomId = this.signalingState.getRoomIdBySocketId(client.id);

    if (!senderRoomId || !this.signalingState.isUserInRoom(senderRoomId, targetUserId)) {
      return;
    }

    const targetSocketId = this.signalingState.getSocketIdByUserId(senderRoomId, targetUserId);
    if (targetSocketId) {
      this.server.to(targetSocketId).emit('ice-candidate', { userId: senderId, candidate });
    }
  }
}
