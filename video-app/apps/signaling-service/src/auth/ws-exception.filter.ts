import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    this.logger.error(`WebSocket error: ${exception}`);

    const client = host.switchToWs().getClient();
    client.emit('error', {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
}
