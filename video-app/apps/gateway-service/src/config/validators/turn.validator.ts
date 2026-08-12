import { IsString, IsOptional } from 'class-validator';

// Все поля необязательны: локально TURN может быть отключён (пустые URL).
// Secret нужен только когда TURN включён.
export class TurnValidator {
  @IsOptional()
  @IsString()
  public TURN_SHARED_SECRET?: string;

  @IsOptional()
  @IsString()
  public TURN_URL?: string;

  @IsOptional()
  @IsString()
  public TURN_TLS_URL?: string;
}