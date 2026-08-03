import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { JwtValidator } from '../validators/database.validator';

function validateEnv(env: Record<string, unknown>) {
  const validator = plainToInstance(JwtValidator, env, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validator, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return env;
}

export const jwtEnv = registerAs('jwt', () => {
  validateEnv(process.env);

  return {
    secret: process.env.JWT_SECRET!,
    accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
});
