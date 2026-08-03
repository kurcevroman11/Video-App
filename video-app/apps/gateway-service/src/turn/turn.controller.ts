import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { createHmac } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

const TURN_CREDENTIALS_TTL_SECONDS = 3600;

@ApiTags('turn')
@Controller()
export class TurnController {
  constructor(private readonly configService: ConfigService) {}

  @Get('turn-credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get temporary TURN credentials',
    description:
      'Generates short-lived TURN credentials (RFC draft-uberti-behave-turn-rest) ' +
      'signed with the shared secret. The client must fetch these right before creating ' +
      'an RTCPeerConnection.',
  })
  @ApiResponse({ status: 200, description: 'TURN credentials returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getTurnCredentials(@CurrentUser() user: JwtPayload) {
    const expiry = Math.floor(Date.now() / 1000) + TURN_CREDENTIALS_TTL_SECONDS;
    const username = `${expiry}:${user.sub}`;
    const sharedSecret = this.configService.get<string>('turn.sharedSecret')!;
    const turnUrl = this.configService.get<string>('turn.url')!;
    const turnTlsUrl = this.configService.get<string>('turn.tlsUrl')!;

    const credential = createHmac('sha1', sharedSecret).update(username).digest('base64');

    return {
      urls: [`turn:${turnUrl}`, `turns:${turnTlsUrl}`],
      username,
      credential,
      ttl: TURN_CREDENTIALS_TTL_SECONDS,
    };
  }
}