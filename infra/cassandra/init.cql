-- =========================================================================
-- Init script — Cassandra (orders-service)
-- Aplicado pelo container `cassandra-init` (one-shot) após o Cassandra
-- estar healthy. Container `orders-service` depende deste com
-- `service_completed_successfully`.
-- =========================================================================

-- ----- Keyspace -----
CREATE KEYSPACE IF NOT EXISTS marketplace
  WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1
  };
-- ⚠️  single-node dev only.
-- Em produção: NetworkTopologyStrategy com RF=3 distribuído entre DCs.

USE marketplace;

-- ----- User-Defined Types -----
CREATE TYPE IF NOT EXISTS client_snapshot (
  client_id UUID,
  name      TEXT,
  email     TEXT
);

CREATE TYPE IF NOT EXISTS order_item (
  product_id  UUID,
  name        TEXT,
  unit_price  DECIMAL,
  quantity    INT
);

-- ----- Q1: detalhe por order_id -----
-- TIMEUUID carrega o instante de criação no próprio identificador,
-- eliminando coluna `order_date` separada e tie-break em concorrência.
CREATE TABLE IF NOT EXISTS orders (
  order_id        TIMEUUID PRIMARY KEY,
  client_id       UUID,
  status          TEXT,
  total           DECIMAL,
  client_snapshot FROZEN<client_snapshot>,
  items           LIST<FROZEN<order_item>>
) WITH compaction = {
  'class'                 : 'TimeWindowCompactionStrategy',
  'compaction_window_unit': 'DAYS',
  'compaction_window_size': 30
};

-- ----- Q2: histórico do cliente, ordenado cronologicamente DESC -----
-- partition key = client_id, clustering key = order_id (TIMEUUID DESC)
-- → leitura do histórico bate em UMA partição, ordenação física no SSTable.
CREATE TABLE IF NOT EXISTS orders_by_client (
  client_id     UUID,
  order_id      TIMEUUID,
  status        TEXT,
  total         DECIMAL,
  items_summary TEXT,
  PRIMARY KEY ((client_id), order_id)
) WITH CLUSTERING ORDER BY (order_id DESC)
  AND compaction = {
    'class'                 : 'TimeWindowCompactionStrategy',
    'compaction_window_unit': 'DAYS',
    'compaction_window_size': 30
  };

-- ----- Q3: idempotência -----
-- Consultada antes do BATCH para detectar double-submit.
CREATE TABLE IF NOT EXISTS orders_by_idem_key (
  idem_key   TEXT PRIMARY KEY,
  order_id   TIMEUUID,
  created_at TIMESTAMP
);

-- ----- NOTA: nenhum seed de pedidos -----
-- Pedidos são criados pelo fluxo de checkout no FE durante a apresentação,
-- demonstrando o LOGGED BATCH ao vivo. Isso é deliberado.
