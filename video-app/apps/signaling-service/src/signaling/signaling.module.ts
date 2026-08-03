import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SignalingGateway } from './signaling.gateway';
import { SignalingStateService } from './signaling-state.service';
import { RoomServiceClient } from '../room-client/room-service.client';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
    ConfigModule,
  ],
  providers: [SignalingGateway, SignalingStateService, RoomServiceClient],
  exports: [SignalingGateway, SignalingStateService],
})
export class SignalingModule {}
