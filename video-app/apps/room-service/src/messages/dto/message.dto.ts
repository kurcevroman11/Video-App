import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class SaveMessageDto {
  @IsString()
  roomId: string;

  @IsString()
  userId: string;

  @IsString()
  content: string;
}

export class GetMessagesDto {
  @IsString()
  roomId: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}