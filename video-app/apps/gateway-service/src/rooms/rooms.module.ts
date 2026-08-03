import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsGrpcClient } from './rooms.grpc-client';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController],
  providers: [RoomsGrpcClient],
  exports: [RoomsGrpcClient],
})
export class RoomsModule {}
