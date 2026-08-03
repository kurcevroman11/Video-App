import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../node_modules/.prisma/gateway-client';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
{
    private readonly logger = new Logger(PrismaService.name);

    public constructor(private readonly configService: ConfigService) {
        super({
            datasourceUrl: `postgresql://${configService.get('DATABASE_USER')}:${configService.get('DATABASE_PASSWORD')}@${configService.get('DATABASE_HOST')}:${configService.get('DATABASE_PORT')}/${configService.get('DATABASE_NAME')}`,
        });
    }

    public async onModuleInit() {
        const start = Date.now();

        this.logger.log('Connecting to database...');

        try {
            await this.$connect();

            const ms = Date.now() - start;
            this.logger.log(`Database connection established (time=${ms}ms)`);
        } catch (error) {
            this.logger.error('Failed to connect to database: ', error);

            throw error;
        }
    }

    public async onModuleDestroy() {
        this.logger.log('Disconnecting from database...');

        try {
            await this.$disconnect();
            this.logger.log('Database connection closed');
        } catch (error) {
            this.logger.error('Failed to disconnect from database: ', error);

            throw error;
        }
    }
}
