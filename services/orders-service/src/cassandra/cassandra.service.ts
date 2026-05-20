import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'cassandra-driver';

@Injectable()
export class CassandraService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CassandraService.name);
  private _client!: Client;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const keyspace = this.config.get<string>('CASSANDRA_KEYSPACE') ?? 'marketplace';
    const astraBundle = this.config.get<string>('ASTRA_BUNDLE_PATH');
    const astraToken = this.config.get<string>('ASTRA_APPLICATION_TOKEN');

    let connectionLabel: string;

    // ----- Modo CLOUD (DataStax Astra DB) -----
    // Ativado quando ASTRA_BUNDLE_PATH e ASTRA_APPLICATION_TOKEN existem.
    if (astraBundle && astraToken) {
      connectionLabel = `Astra DB (bundle=${astraBundle}, keyspace=${keyspace})`;
      this._client = new Client({
        cloud: { secureConnectBundle: astraBundle },
        credentials: { username: 'token', password: astraToken },
        keyspace,
      });
    } else {
      // ----- Modo LOCAL (Cassandra container) -----
      const contactPoints = (this.config.get<string>('CASSANDRA_CONTACT_POINTS') ?? 'cassandra')
        .split(',')
        .map((s) => s.trim());
      const port = Number(this.config.get<string>('CASSANDRA_PORT') ?? 9042);
      const localDataCenter =
        this.config.get<string>('CASSANDRA_LOCAL_DATACENTER') ?? 'datacenter1';

      connectionLabel = `Cassandra local (${contactPoints.join(',')}:${port}, keyspace=${keyspace})`;
      this._client = new Client({
        contactPoints,
        protocolOptions: { port },
        localDataCenter,
        keyspace,
      });
    }

    this.logger.log(`→ Conectando a ${connectionLabel}...`);

    // Retry loop — Cassandra/Astra pode demorar para responder na primeira conexão
    const maxAttempts = 30;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this._client.connect();
        this.logger.log(`✔ Conectado: ${connectionLabel}`);
        return;
      } catch (err) {
        const remaining = maxAttempts - attempt;
        this.logger.warn(
          `Conexão tentativa ${attempt}/${maxAttempts} falhou: ${(err as Error).message}. ` +
            `${remaining} restantes.`,
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
