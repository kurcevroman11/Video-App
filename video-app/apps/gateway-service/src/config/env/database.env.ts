import { registerAs } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DatabaseValidator } from '../validators/database.validator';

function validateEnv(env: Record<string, unknown>) {
  const validator = plainToInstance(DatabaseValidator, env, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validator, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.toString()}`);
  }
  return env;
}

export const databaseEnv = registerAs('database', () => {
  validateEnv(process.env);

  return {
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    host: process.env.DATABASE_HOST!,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME!,
  };
});
