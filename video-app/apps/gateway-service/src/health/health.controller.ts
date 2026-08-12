import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('healthz')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness/readiness probe' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw new HttpException({ status: 'error', db: 'down' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
