import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkerPoolService } from './workers/worker-pool.service';
import { RouterRegistryService } from './rooms/router-registry.service';
import { ParticipantStateService } from './participants/participant-state.service';
import { TransportService } from './transports/transport.service';
import { ProducerService } from './producers/producer.service';
import { ConsumerService } from './consumers/consumer.service';
import { MediaController } from './grpc/media.controller';

@Module({
  imports: [ConfigModule],
  providers: [
    WorkerPoolService,
    RouterRegistryService,
    ParticipantStateService,
    TransportService,
    ProducerService,
    ConsumerService,
  ],
  controllers: [MediaController],
  exports: [WorkerPoolService],
})
export class MediaModule {}