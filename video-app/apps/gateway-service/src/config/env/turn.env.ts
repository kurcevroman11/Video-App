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

  return {
    sharedSecret: process.env.TURN_SHARED_SECRET!,
    url: process.env.TURN_URL || 'localhost:3478',
    tlsUrl: process.env.TURN_TLS_URL || 'localhost:5349',
  };
});