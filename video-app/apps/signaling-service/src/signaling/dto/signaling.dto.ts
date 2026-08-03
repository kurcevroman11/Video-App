import { IsString } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  roomId: string;
}

export class OfferDto {
  @IsString()
  targetUserId: string;

  @IsString()
  sdp: string;
}

export class AnswerDto {
  @IsString()
  targetUserId: string;

  @IsString()
  sdp: string;
}

export class IceCandidateDto {
  @IsString()
  targetUserId: string;

  candidate: any;
}
