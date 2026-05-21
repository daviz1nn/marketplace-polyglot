# Diagramas — Marketplace Polyglot

Todos os diagramas em Mermaid (renderizam nativamente no GitHub e no Marp).

---

## 1. Arquitetura — modo cloud (atual em produção)

```mermaid
flowchart LR
    subgraph User["👤 Usuário"]
        FE["React 19 FE<br/>Vite :5173"]
    end

    subgraph Local["💻 Node.js local"]
        CS["clients-service<br/>NestJS :3001"]
        PS["products-service<br/>NestJS :3002"]
        OS["orders-service<br/>NestJS :3003"]
    end

    subgraph Cloud["☁️ Bancos free tier"]
        PG[("Supabase<br/>Postgres 17")]
        MO[("MongoDB Atlas<br/>M0 cluster")]
        CA[("DataStax Astra<br/>Cassandra 5")]
    end

    FE -->|HTTP REST<br/>CORS direto| CS
    FE -->|HTTP REST| PS
    FE -->|HTTP REST<br/>+ Idempotency-Key| OS
    CS -->|Prisma + SSL| PG
    PS -->|Mongoose<br/>mongodb+srv| MO
    OS -->|cassandra-driver<br/>+ Secure Connect Bundle| CA
    OS -.->|valida + snapshot| CS
    OS -.->|reserva estoque atômico| PS

    classDef cloud fill:#dbeafe,stroke:#1e40af,stroke-width:2px
    classDef local fill:#fef3c7,stroke:#92400e,stroke-width:2px
    classDef user fill:#fce7f3,stroke:#9d174d,stroke-width:2px
    class PG,MO,CA cloud
    class CS,PS,OS local
    class FE user
```

---

## 2. ER do Postgres — `clients`

```mermaid
erDiagram
    CLIENTS {
        uuid id PK "default gen_random_uuid()"
        varchar(120) name "NOT NULL"
        varchar(160) email UK "NOT NULL"
        char(11) cpf UK "NOT NULL"
        varchar(20) phone "NULL"
        jsonb address "CHECK city, state, zip"
        timestamptz created_at "default now()"
        timestamptz updated_at "default now()"
    }
```

**Constraints declaradas no banco** (não no app):
- `UNIQUE(email)` e `UNIQUE(cpf)` — atomicidade garantida pelo Postgres
- `CHECK (address ? 'city' AND address ? 'state' AND address ? 'zip')` — disciplina mínima mesmo em JSONB
- Índice secundário: `clients_name_idx ON (lower(name))` — suporta busca case-insensitive

---

## 3. Modelo lógico — MongoDB `products`

```mermaid
classDiagram
    class Product {
        +string id   UUID externo cross-banco
        +string name
        +string description
        +string category   indexed
        +Decimal128 price
        +number stock   min 0
        +Map~string,any~ attributes   schema-aberto
        +string[] images
        +Date created_at
        +Date updated_at
    }
    note for Product "attributes varia por categoria:\n- camiseta: {tamanho, cor, material}\n- livro: {autor, isbn, paginas, idioma}\n- fone: {bateria_horas, bluetooth, ...}"
```

**Índices:**
- `{ id: 1 }` unique — identificador cross-banco
- `{ category: 1, price: 1 }` composto — filtro de catálogo
- `{ name: 'text' }` — busca por palavra-chave

---

## 4. Cassandra — query-first design

```mermaid
flowchart TB
    subgraph KS["keyspace: default_keyspace"]
        direction LR

        UDT1["TYPE client_snapshot<br/>(client_id UUID, name TEXT, email TEXT)"]
        UDT2["TYPE order_item<br/>(product_id UUID, name TEXT,<br/>unit_price DECIMAL, quantity INT)"]

        T1["TABLE orders<br/>━━━━━━━━━━━━━━━━━━<br/>PK: order_id TIMEUUID<br/>+ client_id, status, total<br/>+ client_snapshot FROZEN<br/>+ items LIST&lt;FROZEN&lt;order_item&gt;&gt;<br/>━━━━━━━━━━━━━━━━━━<br/>compaction: TWCS 30d<br/>━━━━━━━━━━━━━━━━━━<br/>Q1: detalhe por order_id"]

        T2["TABLE orders_by_client<br/>━━━━━━━━━━━━━━━━━━<br/>PK: ((client_id), order_id)<br/>+ status, total, items_summary<br/>━━━━━━━━━━━━━━━━━━<br/>CLUSTERING ORDER<br/>BY order_id DESC<br/>━━━━━━━━━━━━━━━━━━<br/>Q2: histórico do cliente"]

        T3["TABLE orders_by_idem_key<br/>━━━━━━━━━━━━━━━━━━<br/>PK: idem_key TEXT<br/>+ order_id TIMEUUID<br/>+ created_at TIMESTAMP<br/>━━━━━━━━━━━━━━━━━━<br/>Q3: idempotência"]

        UDT1 --> T1
        UDT2 --> T1
    end

    BATCH["LOGGED BATCH<br/>INSERT em T1+T2+T3"] -.-> T1
    BATCH -.-> T2
    BATCH -.-> T3

    classDef udt fill:#fef3c7,stroke:#92400e
    classDef table fill:#dbeafe,stroke:#1e40af
    classDef batch fill:#dcfce7,stroke:#166534
    class UDT1,UDT2 udt
    class T1,T2,T3 table
    class BATCH batch
```

**Decisões idiomáticas:**
1. **TIMEUUID** > UUID v4 — carrega timestamp, ordenação cronológica nativa
2. **UDTs** > MAP<TEXT,TEXT> — preserva tipos (`DECIMAL` para preço)
3. **TWCS** (TimeWindowCompactionStrategy) — padrão para append-only time-series
4. **3 tabelas para 1 entidade** — denormalização query-driven (Chebotko et al. 2015)
5. **LOGGED BATCH** > UNLOGGED — atomicidade entre partições via batchlog

---

## 5. Fluxo de criação de pedido (sequence)

```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant FE as React FE
    participant OS as orders-service
    participant CS as clients-service
    participant PS as products-service
    participant CA as Cassandra<br/>(Astra DB)

    Cliente->>FE: clica "Finalizar pedido"
    FE->>FE: gera Idempotency-Key (UUID)
    FE->>OS: POST /orders<br/>Idempotency-Key: <uuid>

    OS->>CA: SELECT order_id FROM<br/>orders_by_idem_key WHERE idem_key=?

    alt idempotente — chave já existe
        CA-->>OS: order_id existente
        OS->>CA: SELECT FROM orders WHERE order_id=?
        OS-->>FE: 201 (replay do pedido original)
    else nova requisição
        OS->>CS: GET /clients/:id
        CS-->>OS: cliente OK
        loop para cada item
            OS->>PS: PATCH /products/:id/stock<br/>{delta: -qty}
            PS->>PS: findOneAndUpdate<br/>{id, stock>=qty}, {$inc: -qty}
            PS-->>OS: produto + estoque OK
        end
        OS->>OS: monta snapshot<br/>+ calcula total
        Note over OS,CA: BEGIN BATCH
        OS->>CA: INSERT orders
        OS->>CA: INSERT orders_by_client
        OS->>CA: INSERT orders_by_idem_key
        Note over OS,CA: APPLY BATCH
        CA-->>OS: OK (atômico)
        OS-->>FE: 201 {order_id, total}
    end

    FE->>Cliente: "Pedido criado: <order_id>"
```

**Garantias do fluxo:**
- **Idempotência** — `Idempotency-Key` evita pedido duplicado
- **Atomicidade BATCH** — `orders` e `orders_by_client` ficam consistentes
- **Sem race no estoque** — `findOneAndUpdate` é atômico no Mongo
- **Snapshot** — `client_name` e `unit_price` são copiados (correto contabilmente)

---

## 6. Posicionamento CAP/PACELC dos 3 bancos

```mermaid
quadrantChart
    title CAP — Posicionamento dos 3 bancos
    x-axis "Privilegia Availability" --> "Privilegia Consistency"
    y-axis "Single-node" --> "Distribuído nativo"
    quadrant-1 "CP distribuído"
    quadrant-2 "AP distribuído"
    quadrant-3 "AP single"
    quadrant-4 "CP single"
    "PostgreSQL 17": [0.85, 0.25]
    "MongoDB 8": [0.7, 0.7]
    "Cassandra 5": [0.15, 0.9]
```

| Banco        | CAP padrão  | PACELC | Trade-off escolhido                  |
|--------------|-------------|--------|--------------------------------------|
| Postgres     | CA (single) | PC+EC  | Consistência forte, latência baixa   |
| MongoDB      | CP (RS)     | PC+EC  | Consistência por documento + escalabilidade |
| Cassandra    | AP          | PA+EL  | Disponibilidade + escala horizontal  |

---

## 7. Stack tecnológica completa

```mermaid
graph LR
    subgraph FE["Frontend"]
        REACT[React 19] --> VITE[Vite 5]
        REACT --> TS[TypeScript 5.6]
        REACT --> TW[Tailwind 3]
        REACT --> RQ[TanStack Query 5]
        REACT --> RHF[react-hook-form 7]
        REACT --> ZOD[zod 3]
    end

    subgraph BE["Backend (3 serviços)"]
        NEST[NestJS 11] --> NODE[Node.js 22 LTS]
        NEST --> SWG[Swagger]
        NEST --> PINO[nestjs-pino]
        NEST --> TERM[Terminus]
        NEST --> HEL[Helmet + Throttler]
    end

    subgraph DB["Persistência"]
        PRISMA[Prisma 5] --> PG[Postgres 17]
        MONGOOSE[Mongoose 8] --> MO[MongoDB 8]
        CDRV[cassandra-driver 4.7] --> CA[Cassandra 5]
    end

    NEST -.usa.-> PRISMA
    NEST -.usa.-> MONGOOSE
    NEST -.usa.-> CDRV
    REACT -.HTTP.-> NEST
```
