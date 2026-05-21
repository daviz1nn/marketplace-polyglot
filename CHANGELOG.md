# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-20 (Fase 2 / entrega final)

### Added — material de defesa
- `docs/diagrams.md` com 7 diagramas Mermaid (arquitetura cloud, ER Postgres,
  modelo Mongo, query-first Cassandra, sequence de pedido idempotente,
  quadrant CAP, stack tecnológica completa).
- `docs/slides.md` com slide deck Marp em 14 slides para apresentação.
- `scripts/e2e-test.js` + `npm run e2e` com 12 asserções validando o fluxo
  cross-banco completo contra a stack cloud real.
- Badges atualizadas no README (E2E 12/12, sem mais "CI pending").

### Added — modo cloud (modo de execução real validado)
- `services/orders-service/src/cassandra/cassandra.service.ts`: suporta
  Astra DB via Secure Connect Bundle + Application Token; detecta modo cloud
  automaticamente via env vars.
- `infra/cassandra/apply-astra-init.js` + `npm run astra:init`: aplica UDTs +
  3 tabelas Cassandra no Astra. Pula `CREATE KEYSPACE` (gerenciado pelo Astra
  UI). Parser CQL corrigido para ignorar comentários `--`.
- `infra/cassandra/list-keyspaces.js`: diagnóstico — lista keyspaces no Astra.
- `infra/mongo/apply-atlas-init.js` + `npm run atlas:init`: aplica seed de
  5 produtos no MongoDB Atlas via Node driver (upsert por `id` UUID).
- `npm run dev:local`: roda os 4 serviços (3 BEs + FE) com `concurrently`,
  saídas coloridas, kill-on-fail.
- `docs/cloud-setup.md`: passo a passo para criar contas Supabase, Atlas e
  Astra free tier.
- DNS Google forçado (`dns.setServers(['8.8.8.8','1.1.1.1'])`) nos `main.ts`
  do products-service e orders-service e nos scripts de seed — necessário
  em redes que não resolvem SRV records do MongoDB Atlas.
- `.env.example` com seções LOCAL (Docker) e CLOUD (free tier) documentadas.

### Fixed
- DTO `create-order.dto.ts`: trocado `@IsUUID()` por `@Matches(UUID_SHAPED)`.
  Os seeds usam IDs mnemônicos (`11111111-1111-...`) que são formato UUID-
  shaped mas não passam pela validação estrita de versão v1-5.
- Controllers `clients.controller.ts` e `orders.controller.ts`: removido
  `ParseUUIDPipe()` dos params de path pelo mesmo motivo.
- `services/orders-service/src/orders/orders.service.ts`: interfaces
  `ClientSnapshot`, `ProductDoc`, `OrderItemSnapshot` agora exportadas para
  satisfazer TS4053 no build.

## [0.1.0] — Proposta (Fase 1)

### Added — fundamentação
- README com fundamentação teórica (Sadalage & Fowler, CAP/PACELC), tabela
  comparativa dos 3 bancos, mapeamento positivo entidade → banco, decisões
  negativas ("por que NÃO outras combinações") e queries que provam cada
  escolha. Bibliografia formal em ABNT.
- `docs/data-model.md` com modelagem completa: schemas Postgres, Mongo e
  Cassandra (UDT + TIMEUUID + TWCS + LOGGED BATCH justificados).
- `docs/stack-rationale.md` com defesa de cada lib escolhida (Prisma vs
  TypeORM, Mongoose, cassandra-driver, TanStack Query, etc.).

### Added — infra
- `docker-compose.yml` com 7 containers: Postgres 17 + MongoDB 8 +
  Cassandra 5.0 + cassandra-init one-shot + 3 BEs NestJS + frontend.
  Healthchecks com `start_period: 120s` para Cassandra. Volumes nomeados.
  Networks customizadas. `service_completed_successfully` (Compose ≥ 2.20).
- `infra/postgres/init.sql`: schema `clients` + 3 seeds (Ana, Bruno, Carla).
- `infra/mongo/init.js`: coleção `products` + índices + 5 produtos em 4
  categorias (mostra schema flexível via `attributes`).
- `infra/cassandra/init.cql`: keyspace + 2 UDTs + 3 tabelas (`orders`,
  `orders_by_client`, `orders_by_idem_key`) com TWCS.

### Added — 3 microserviços (NestJS 11 + Node 22 + TS 5.6)
- `clients-service` (Postgres via Prisma 5): CRUD completo de clientes,
  validação class-validator com `AddressDto` aninhado, `/health` via Terminus.
- `products-service` (MongoDB via Mongoose 8): CRUD completo + `PATCH
  /products/:id/stock` com `findOneAndUpdate` atômico (resolve race
  condition em uma única operação Mongo).
- `orders-service` (Cassandra via DataStax cassandra-driver 4.7):
  - `POST /orders` com header `Idempotency-Key` obrigatório
  - Validação cross-service via HTTP (clients + products)
  - Snapshot de cliente e produtos no momento do pedido
  - **LOGGED BATCH** atomicamente em `orders` + `orders_by_client` +
    `orders_by_idem_key`
  - `GET /orders/by-client/:id` (a query estrela do Cassandra)
  - `PATCH /orders/:id/status` com BATCH coordenado nas 2 tabelas
  - `/health/deep` com cascata (cassandra + clients-service + products-service)
- Todos com Swagger em `/docs`, `helmet`, `@nestjs/throttler` (100 req/min),
  `nestjs-pino` com `x-correlation-id` propagado em chamadas cross-service,
  `AllExceptionsFilter` global.

### Added — frontend (Vite + React 19 + TS + Tailwind)
- 4 telas funcionais: `/clients`, `/products`, `/checkout`, `/clients/:id/orders`
- Stack moderna: TanStack Query v5 (cache + invalidation), react-hook-form
  com zod (validação client-side), axios com correlation-id automático,
  Idempotency-Key UUID gerado no submit.
- Cliente HTTP centralizado em `src/api/{clients,products,orders,http}.ts`.

### Added — testes
- 12 testes unitários passando (Jest):
  - clients-service: 3 testes (create, P2002→ConflictException, NotFound)
  - products-service: 3 testes (`findOneAndUpdate` atômico em 3 cenários)
  - orders-service: 6 testes (idempotency, validação cross-service, snapshot,
    LOGGED BATCH, replay)

### Added — DX e tooling
- Monorepo via npm workspaces (4 packages).
- `package.json` raiz com scripts: `npm run up`, `dev:local`, `e2e`,
  `astra:init`, `atlas:init`, `psql`, `mongosh`, `cqlsh`.
- `.github/workflows/ci.yml`: matriz lint + build + test nos 4 packages,
  validação `docker compose config`.
- `docs/marketplace.postman_collection.json`: coleção com 4 grupos (health,
  clients, products, orders) e variáveis prontas.
- LICENSE MIT, `.editorconfig`, `.prettierrc`, `.gitignore` (bloqueia `.env`
  e Secure Connect Bundle).

[1.0.0]: ../../releases/tag/v1.0-final
[0.1.0]: ../../releases/tag/v0.1-proposta
