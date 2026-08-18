import { IsString } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  roomId: string;
}

export class CreateTransportDto {
  @IsString()
  direction: 'send' | 'recv';
}

export class ConnectTransportDto {
  @IsString()
  transportId: string;

  dtlsParameters: any;
}

export class ProduceDto {
  @IsString()
  transportId: string;

  @IsString()
  kind: 'audio' | 'video';

  rtpParameters: any;
}

export class ConsumeDto {
  @IsString()
  transportId: string;

  @IsString()
  producerId: string;

  rtpCapabilities: any;
}

export class ResumeConsumerDto {
  @IsString()
  consumerId: string;
}