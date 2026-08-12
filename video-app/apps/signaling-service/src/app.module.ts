import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SignalingModule } from './signaling/signaling.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env',
      ],
    }),
    HealthModule,
    SignalingModule,
  ],
})
export class AppModule {}
