import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  private redis: Redis;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });
  }

  async check() {
    const timestamp = new Date().toISOString();

    let databaseStatus = 'healthy';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      databaseStatus = 'unhealthy';
    }

    let redisStatus = 'healthy';
    try {
      await this.redis.ping();
    } catch (error) {
      redisStatus = 'unhealthy';
    }

    return {
      status: databaseStatus === 'healthy' && redisStatus === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp,
      services: {
        database: databaseStatus,
        redis: redisStatus,
      },
    };
  }
}
