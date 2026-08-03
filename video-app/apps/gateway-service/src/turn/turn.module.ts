import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TurnController } from './turn.controller';

@Module({
  imports: [AuthModule],
  controllers: [TurnController],
})
export class TurnModule {}