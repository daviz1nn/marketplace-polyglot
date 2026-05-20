# Stack Rationale — Por que cada biblioteca foi escolhida

Este documento registra as escolhas de stack que **não são óbvias** a partir
do README — particularmente nos pontos em que havia mais de uma opção razoável.

---

## Backend

### NestJS (em vez de Express puro ou Fastify)

- **A favor:** estrutura opinativa (modules + DI + decorators) reduz divergência
  entre os 3 serviços, força padrão consistente. Tem suporte first-class a
  Swagger, validação (`class-validator`), terminus (health), logging (pino).
- **Contra:** boilerplate inicial mais alto.
- **Decisão final:** NestJS — 3 microserviços precisam parecer "a mesma coisa".
  Disciplina do framework paga o custo de boilerplate.

### Prisma (em vez de TypeORM ou raw `pg`) — clients-service

- **TypeORM:** mais "tradicional" no ecossistema Nest, mas modelagem com
  decorators e migrations imperativas têm armadilhas (auto-sync em produção,
  ambiguidade em relacionamentos).
- **Raw `pg`:** controle máximo, zero abstração, mas migrations e tipagem
  ficam manuais.
- **Prisma:** schema declarativo em `schema.prisma`, migrations versionadas
  (`prisma migrate`), client tipado autogerado. **Decisão pedagógica:** o
  `schema.prisma` é um artefato auto-suficiente que o avaliador lê em 30
  segundos e entende a modelagem inteira.
- **Decisão final:** Prisma.

### Mongoose (em vez de driver MongoDB raw) — products-service

- **Driver raw:** controle máximo, sem overhead.
- **Mongoose:** schema documentado (mesmo sendo document store!) + validação
  + middleware + tipagem.
- **Decisão pedagógica:** mostrar **schema explícito num document store** é
  uma boa prática que vai contra o estereótipo de "Mongo é sem schema". Reforça
  que polyglot persistence não significa abrir mão de disciplina.
- **Decisão final:** Mongoose 8 + `@nestjs/mongoose`.

### `cassandra-driver` raw (sem ORM) — orders-service

- **Não há ORM Cassandra maduro em Node** (Express-Cassandra está em manutenção
  passiva). Drive oficial DataStax é a referência.
- **A favor de driver raw:** Cassandra é "diferente" e merece exposição direta —
  CQL e modelagem query-first ficam visíveis no código, não escondidos sob
  abstração que mente.
- **Decisão final:** `cassandra-driver` ^4.7 oficial DataStax.

### `nestjs-pino` (logging)

- Estruturado em JSON, fast.
- Plugin Nest oficial.
- Suporte a `request-id` / `correlation-id` via middleware.

### `@nestjs/terminus` (health checks)

- Health checks profundos com cascata de dependências.
- `/health` (raso) + `/health/deep` (com cross-service).

### `class-validator` + `class-transformer`

- Validação declarativa de DTOs.
- Integração nativa com `ValidationPipe` global.

### `helmet` + `@nestjs/throttler`

- Segurança básica HTTP + rate limiting.
- Não é o foco do projeto, mas evita ataque óbvio na defesa: "e segurança?".

### `@nestjs/swagger`

- Documentação OpenAPI gerada a partir de decorators.
- Avaliador pode ver e testar a API sem ler código.

---

## Frontend

### Vite (em vez de Create-React-App ou Next.js)

- **CRA:** deprecated.
- **Next.js:** features de SSR/SSG são irrelevantes para uma SPA acadêmica;
  adiciona complexidade.
- **Vite:** dev server rápido, build moderno, zero config para React + TS.
- **Decisão final:** Vite.

### React 19 (em vez de 18)

- React 19 é stable desde dez/2024.
- Bibliotecas-chave (TanStack Query v5, react-hook-form, zod) suportam.
- **Decisão final:** React 19.

### TanStack Query v5 (em vez de useEffect+useState)

- Cache automático + loading/error states + invalidation em mutations.
- Reduz drasticamente código de plumbing HTTP.
- **Decisão final:** TanStack Query.

### react-hook-form + zod

- **react-hook-form:** performante (refs, não state), API clean.
- **zod:** schema + tipagem TypeScript inferida automaticamente.
- Combo idiomático em React moderno.

### Tailwind CSS (em vez de styled-components, CSS Modules ou Material-UI)

- **MUI:** pesado, opinativo demais.
- **CSS Modules:** ótimo mas verboso para uma demo.
- **styled-components:** runtime overhead.
- **Tailwind:** atomic CSS, pequeno bundle, velocidade de prototipagem alta.
- **Decisão final:** Tailwind 3.

### `axios` (em vez de `fetch`)

- Interceptors para `x-correlation-id`.
- Tratamento de erros mais ergonômico.
- Diferença mínima em performance, ganho de DX significativo.

---

## Infra

### Docker Compose (em vez de Kubernetes ou bare-metal)

- Kubernetes seria over-engineering acadêmico extremo.
- Bare-metal foge do requisito "executar do zero sem instalação prévia".
- Docker Compose v2.20+ tem o necessário (healthchecks, `service_completed_successfully`).

### Imagens base

| Componente | Imagem | Por que |
|------------|--------|---------|
| Node services | `node:22-alpine` (runner stage) | LTS, pequena |
| Frontend build | `node:22-alpine` + `nginx:alpine` | multi-stage |
| Postgres | `postgres:17-alpine` | Alpine, oficial |
| MongoDB | `mongo:8` | Sem variante Alpine oficial, mas oficial |
| Cassandra | `cassandra:5.0` | Oficial Apache, evita imagens não-mantidas |

### Multi-stage Dockerfiles

- Reduz imagem final de Node de ~1.5GB para ~250MB.
- Build stage tem devDependencies; runner só prod.
- Demonstra conhecimento Docker que pesa na avaliação.

---

## Tooling

### npm workspaces (em vez de pnpm, yarn ou lerna)

- pnpm/yarn seriam superiores em monorepos grandes, mas npm workspaces basta
  para 4 packages (3 serviços + FE).
- Zero instalação extra para o avaliador.
- **Decisão final:** npm workspaces.

### Prettier + EditorConfig (sem ESLint complexo)

- ESLint default do Nest é suficiente.
- Prettier elimina debates de formatação.

### GitHub Actions CI

- Roda lint + test + `docker compose config` em push.
- Badge verde no README é gratuito e impactante.

---

## O que foi explicitamente NÃO usado e por quê

| Tecnologia | Por que rejeitada |
|------------|-------------------|
| Redis | Adicionaria 4º banco fora do escopo. Cache não é demanda do enunciado. |
| Kafka/RabbitMQ | Messaging adicionaria infra sem ganho pedagógico para o escopo. REST síncrono é mais simples de demonstrar. |
| Kubernetes | Over-engineering acadêmico extremo. |
| GraphQL | Não há ganho sobre REST para 4 telas. Adiciona complexidade de schema federado. |
| ORM Cassandra (Express-Cassandra) | Manutenção passiva, esconde decisões de modelagem. |
| Monorepo com Nx/Turborepo | npm workspaces basta para 4 packages. |
| Microsserviços com tRPC | Acopla cliente e servidor; conflita com a regra de serviços independentes. |
