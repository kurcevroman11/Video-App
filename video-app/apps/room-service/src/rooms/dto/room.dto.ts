import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { RoomType } from '../../common/enums';

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsString()
  ownerId: string;

  @IsEnum(RoomType)
  type: RoomType;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;
}

export class GetRoomDto {
  @IsString()
  id: string;
}

export class DeleteRoomDto {
  @IsString()
  id: string;
}
