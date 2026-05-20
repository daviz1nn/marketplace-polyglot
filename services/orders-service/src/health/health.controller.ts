import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { CassandraService } from '../cassandra/cassandra.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly httpIndicator: HttpHealthIndicator,
    private readonly cassandra: CassandraService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health raso (apenas Cassandra)' })
  check() {
    return this.health.check([() => this.cassandraIndicator()]);
  }

  @Get('deep')
  @HealthCheck()
  @ApiOperation({
    summary: 'Health profundo (Cassandra + clients-service + products-service)',
  })
  deep() {
    const clientsUrl = this.config.get<string>('CLIENTS_SERVICE_URL');
    const productsUrl = this.config.get<string>('PRODUCTS_SERVICE_URL');
    return this.health.check([
      () => this.cassandraIndicator(),
      () => this.httpIndicator.pingCheck('clients-service', `${clientsUrl}/health`),
      () => this.httpIndicator.pingCheck('products-service', `${productsUrl}/health`),
    ]);
  }

  private async cassandraIndicator(): Promise<HealthIndicatorResult> {
    try {
      await this.cassandra.client.execute('SELECT release_version FROM system.local');
      return { cassandra: { status: 'up' } };
    } catch (err) {
      this.logger.warn(`Cassandra health failed: ${(err as Error).message}`);
      return { cassandra: { status: 'down', message: (err as Error).message } };
    }
  }
}
