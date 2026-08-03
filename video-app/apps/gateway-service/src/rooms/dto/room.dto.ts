import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: 'My Room', description: 'Room name' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['PUBLIC', 'PRIVATE'], example: 'PUBLIC', description: 'Room type' })
  @IsEnum(['PUBLIC', 'PRIVATE'])
  type: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({ example: 10, description: 'Maximum participants (optional)' })
  @IsOptional()
  maxParticipants?: number;
}

export class JoinRoomDto {
  @ApiPropertyOptional({ example: 'ABC123', description: 'Invite code for private rooms' })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
