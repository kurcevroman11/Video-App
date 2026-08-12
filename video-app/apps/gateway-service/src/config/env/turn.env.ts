import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TurnValidator } from '../validators/turn.validator';

function validateEnv(env: Record<string, unknown>) {
  const validator = plainToInstance(TurnValidator, env, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validator, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return env;
}

export const turnEnv = registerAs('turn', () => {
  validateEnv(process.env);

  // url/tlsUrl пустые, если не заданы — тогда TURN не рекламируется (controller вернёт
  // пустой список, клиент работает на STUN). Не подставляем фиктивные localhost:*, чтобы
  // не раздавать битые TURN-URL.
  return {
    sharedSecret: process.env.TURN_SHARED_SECRET || '',
    url: process.env.TURN_URL || '',
    tlsUrl: process.env.TURN_TLS_URL || '',
  };
});