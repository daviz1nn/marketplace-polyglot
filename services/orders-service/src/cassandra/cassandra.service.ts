import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'cassandra-driver';

@Injectable()
export class CassandraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CassandraService.name);
  private _client!: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const contactPoints = (this.config.get<string>('CASSANDRA_CONTACT_POINTS') ?? 'cassandra')
      .split(',')
      .map((s) => s.trim());
    const port = Number(this.config.get<string>('CASSANDRA_PORT') ?? 9042);
    const localDataCenter = this.config.get<string>('CASSANDRA_LOCAL_DATACENTER') ?? 'datacenter1';
    const keyspace = this.config.get<string>('CASSANDRA_KEYSPACE') ?? 'marketplace';

    this._client = new Client({
      contactPoints,
      protocolOptions: { port },
      localDataCenter,
      keyspace,
    });

    // Retry loop — Cassandra pode demorar mesmo após o healthcheck passar
    const maxAttempts = 30;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this._client.connect();
        this.logger.log(
          `✔ Connected to Cassandra (${contactPoints.join(',')}:${port}, keyspace=${keyspace})`,
        );
        return;
      } catch (err) {
        const remaining = maxAttempts - attempt;
        this.logger.warn(
          `Cassandra connect attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message}. ` +
            `${remaining} retries remaining.`,
        );
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }

  async onModuleDestroy() {
    if (this._client) await this._client.shutdown();
  }

  get client(): Client {
    if (!this._client) throw new Error('Cassandra client not initialized');
    return this._client;
  }
}
