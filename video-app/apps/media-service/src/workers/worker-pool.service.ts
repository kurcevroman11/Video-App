import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import * as mediasoup from 'mediasoup';
import { types as mediasoupTypes } from 'mediasoup';

export interface MediaConfig {
  workerCount: number;
  rtcMinPort: number;
  rtcMaxPort: number;
  announcedIp: string;
}

@Injectable()
export class WorkerPoolService implements OnModuleInit {
  private workers: mediasoupTypes.Worker[] = [];
  private nextWorkerIndex = 0;
  private readonly logger = new Logger(WorkerPoolService.name);
  private config: MediaConfig;

  constructor(configService: ConfigService) {
    this.config = {
      workerCount: this.resolveWorkerCount(configService.get<number>('MEDIASOUP_WORKERS')),
      rtcMinPort: this.toPort(configService.get<string>('MEDIASOUP_RTC_MIN_PORT'), 40000),
      rtcMaxPort: this.toPort(configService.get<string>('MEDIASOUP_RTC_MAX_PORT'), 49999),
      announcedIp: this.resolveAnnouncedIp(configService.get<string>('MEDIASOUP_ANNOUNCED_IP')),
    };
  }

  async onModuleInit() {
    const { workerCount, rtcMinPort, rtcMaxPort } = this.config;
    // Разбиваем общий диапазон RTP-портов на непересекающиеся поддиапазоны по числу
    // Worker'ов — иначе разные Worker'ы попытаются забиндить одни и те же порты.
    const span = Math.floor((rtcMaxPort - rtcMinPort + 1) / workerCount);

    for (let i = 0; i < workerCount; i++) {
      const worker = await mediasoup.createWorker({
        rtcMinPort: rtcMinPort + i * span,
        rtcMaxPort: i === workerCount - 1 ? rtcMaxPort : rtcMinPort + (i + 1) * span - 1,
        logLevel: 'warn',
      });
      worker.on('died', () => {
        this.logger.error(`mediasoup worker died, pid ${worker.pid}`);
      });
      this.workers.push(worker);
      this.logger.log(
        `Worker ${i + 1}/${workerCount} pid=${worker.pid} ports=${rtcMinPort + i * span}-${i === workerCount - 1 ? rtcMaxPort : rtcMinPort + (i + 1) * span - 1}`
      );
    }
  }

  getNextWorker(): mediasoupTypes.Worker {
    const worker = this.workers[this.nextWorkerIndex];
    this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length;
    return worker; // round-robin — комнаты равномерно распределяются по Worker'ам
  }

  getWorkerCount(): number {
    return this.workers.length;
  }

  getConfig(): MediaConfig {
    return this.config;
  }

  private resolveWorkerCount(value?: number): number {
    if (value && value > 0 && value <= 32) return value;
    return Math.min(os.cpus().length, 4); // один Worker на ядро, но не более 4 (порт-диапазон)
  }

  private toPort(value?: string, fallback?: number): number {
    const parsed = parseInt(value || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback!;
  }

  private resolveAnnouncedIp(value?: string): string {
    if (value && value.trim()) return value.trim();
    // Автодетект: первый внешний (не-loopback) IPv4 интерфейса машины.
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          this.logger.warn(
            `MEDIASOUP_ANNOUNCED_IP не задан — использую ${net.address} (${name}). ` +
              'Для клиентов за NAT задайте публичный IP в MEDIASOUP_ANNOUNCED_IP.'
          );
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
}