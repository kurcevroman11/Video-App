import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RoomsGrpcClient } from './rooms.grpc-client';
import { CreateRoomDto, JoinRoomDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('rooms')
@Controller('rooms')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@ApiBearerAuth()
export class RoomsController {
  constructor(private readonly roomsGrpcClient: RoomsGrpcClient) {}

  @Post()
  @ApiOperation({ summary: 'Create a new room' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 503, description: 'Room service unavailable' })
  async createRoom(@CurrentUser() user: JwtPayload, @Body() dto: CreateRoomDto) {
    console.log('Creating room, user:', user);
    return this.roomsGrpcClient.createRoom({
      name: dto.name,
      ownerId: user?.sub || 'fallback-user-id',
      type: dto.type,
      maxParticipants: dto.maxParticipants,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room by ID' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'Room returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getRoom(@Param('id') id: string) {
    return this.roomsGrpcClient.getRoom({ id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete room (owner only)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 204, description: 'Room deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not owner' })
  async deleteRoom(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.roomsGrpcClient.deleteRoom({ id, requesterId: user.sub });
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join a room' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 201, description: 'Joined room successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires invite code' })
  @ApiResponse({ status: 409, description: 'Room full or closed' })
  async joinRoom(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: JoinRoomDto,
  ) {
    return this.roomsGrpcClient.joinRoom({
      roomId: id,
      userId: user.sub,
      inviteCode: dto.inviteCode,
    });
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave a room' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 204, description: 'Left room' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async leaveRoom(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.roomsGrpcClient.leaveRoom({ roomId: id, userId: user.sub });
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List room participants' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'Participants list returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listMembers(@Param('id') id: string) {
    return this.roomsGrpcClient.listParticipants({ roomId: id });
  }
}
