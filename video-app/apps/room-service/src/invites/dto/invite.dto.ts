import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreateInviteDto {
  @IsString()
  roomId: string;

  @IsString()
  createdBy: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUses?: number;

  @IsOptional()
  expiresAt?: Date;
}
