import { IsString, IsNotEmpty } from 'class-validator';

export class TurnValidator {
  @IsString()
  @IsNotEmpty()
  public TURN_SHARED_SECRET: string;

  @IsString()
  public TURN_URL: string;

  @IsString()
  public TURN_TLS_URL: string;
}