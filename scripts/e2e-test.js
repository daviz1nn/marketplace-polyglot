#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Teste end-to-end contra os 4 serviços rodando (modo dev:local).
 *
 * Valida o fluxo completo da defesa:
 *   1. /health dos 3 serviços (3 bancos)
 *   2. GET /clients (Postgres)
 *   3. GET /products?category=vestuario (Mongo schema-flexível)
 *   4. POST /orders (cross-service + LOGGED BATCH no Cassandra)
 *   5. POST /orders REPLAY com mesma Idempotency-Key (deve retornar mesmo id)
 *   6. GET /orders/by-client (query estrela do Cassandra)
 *   7. PATCH /orders/:id/status (BATCH coordenado nas 2 tabelas)
 *   8. CRUD completo de clientes (Postgres) e produtos (Mongo)
 *   9. Saga: estoque é devolvido quando um item do pedido falha
 *  10. Cancelamento e DELETE de pedido devolvem estoque
 *
 * Funciona nos dois modos (Docker Compose ou dev:local + cloud): só precisa
 * dos serviços respondendo em localhost:3001/3002/3003.
 *
 * Uso: node scripts/e2e-test.js
 *      ou:  npm run e2e
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const CLIENTS = process.env.CLIENTS_URL || 'http://localhost:3001';
const PRODUCTS = process.env.PRODUCTS_URL || 'http://localhost:3002';
const ORDERS = process.env.ORDERS_URL || 'http://localhost:3003';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111'; // Ana Souza
const PRODUCT_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'; // Camiseta M azul
const PRODUCT_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'; // Tênis Pro

let okCount = 0;
let failCount = 0;
const failures = [];

const uuid = () => crypto.randomUUID();

async function step(name, fn) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log('✔');
    okCount++;
  } catch (err) {
    console.log('✗');
    console.log(`     ${err.message}`);
    failures.push({ name, error: err.message });
    failCount++;
  }
}

const json = (method, body, headers = {}) => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

async function fetchJSON(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

(async () => {
  console.log('\n🧪 E2E — Marketplace Polyglot\n');

  console.log('📡 Health checks');
  await step('clients-service /health', async () => {
    const { status, body } = await fetchJSON(`${CLIENTS}/health`);
    assert.equal(status, 200);
    assert.equal(body.info?.postgres?.status, 'up');
  });
  await step('products-service /health', async () => {
    const { status, body } = await fetchJSON(`${PRODUCTS}/health`);
    assert.equal(status, 200);
    assert.equal(body.info?.mongodb?.status, 'up');
  });
  await step('orders-service /health/deep (cascata)', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/health/deep`);
    assert.equal(status, 200);
    assert.equal(body.info?.cassandra?.status, 'up');
    assert.equal(body.info?.['clients-service']?.status, 'up');
    assert.equal(body.info?.['products-service']?.status, 'up');
  });

  console.log('\n👥 Postgres (clients)');
  await step('GET /clients retorna seeds', async () => {
    const { status, body } = await fetchJSON(`${CLIENTS}/clients?limit=10`);
    assert.equal(status, 200);
    assert.ok(body.total >= 3, `esperava >=3 clientes, got ${body.total}`);
    assert.ok(body.items.some((c) => c.email === 'ana@example.com'));
  });

  console.log('\n📦 MongoDB (products) — schema-flexível');
  await step('GET /products?category=vestuario', async () => {
    const { status, body } = await fetchJSON(`${PRODUCTS}/products?category=vestuario`);
    assert.equal(status, 200);
    assert.ok(body.items.length >= 2);
    assert.ok(body.items.every((p) => p.category === 'vestuario'));
  });
  await step('GET /products?category=livros (attributes diferentes)', async () => {
    const { status, body } = await fetchJSON(`${PRODUCTS}/products?category=livros`);
    assert.equal(status, 200);
    const livro = body.items[0];
    assert.ok(livro.attributes?.isbn, 'livro deveria ter attributes.isbn');
    assert.ok(livro.attributes?.autor, 'livro deveria ter attributes.autor');
  });

  // Dados únicos por execução — o teste pode rodar várias vezes no mesmo banco.
  const run = Date.now().toString().slice(-8);
  let newClientId;
  let newProductId;

  console.log('\n👥 Postgres (clients) — CRUD');
  await step('POST /clients cria cliente', async () => {
    const { status, body } = await fetchJSON(
      `${CLIENTS}/clients`,
      json('POST', {
        name: `E2E ${run}`,
        email: `e2e-${run}@example.com`,
        cpf: `900${run}`,
        address: { street: 'Rua E2E', number: '1', city: 'São Paulo', state: 'SP', zip: '01000-000' },
      }),
    );
    assert.equal(status, 201, JSON.stringify(body));
    newClientId = body.id;
  });
  await step('POST /clients com email repetido → 409 (UNIQUE do Postgres)', async () => {
    const { status } = await fetchJSON(
      `${CLIENTS}/clients`,
      json('POST', {
        name: 'Duplicado',
        email: `e2e-${run}@example.com`,
        cpf: `901${run}`,
        address: { street: 'Rua E2E', number: '2', city: 'São Paulo', state: 'SP', zip: '01000-000' },
      }),
    );
    assert.equal(status, 409);
  });
  await step('PUT /clients/:id atualiza nome', async () => {
    const { status, body } = await fetchJSON(
      `${CLIENTS}/clients/${newClientId}`,
      json('PUT', { name: `E2E ${run} (editado)` }),
    );
    assert.equal(status, 200);
    assert.equal(body.name, `E2E ${run} (editado)`);
  });

  console.log('\n📦 MongoDB (products) — CRUD');
  await step('POST /products cria produto com attributes livres', async () => {
    const { status, body } = await fetchJSON(
      `${PRODUCTS}/products`,
      json('POST', {
        name: `Caneca E2E ${run}`,
        category: 'utilidades',
        price: 25.5,
        stock: 10,
        attributes: { capacidade_ml: 350, material: 'cerâmica' },
      }),
    );
    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.attributes.capacidade_ml, 350);
    newProductId = body.id;
  });
  await step('PUT /products/:id atualiza preço', async () => {
    const { status, body } = await fetchJSON(
      `${PRODUCTS}/products/${newProductId}`,
      json('PUT', { price: 30 }),
    );
    assert.equal(status, 200);
    assert.equal(body.price, 30);
  });

  const stockOf = async (id) => (await fetchJSON(`${PRODUCTS}/products/${id}`)).body.stock;

  console.log('\n🛒 Cassandra (orders) — fluxo idempotente + LOGGED BATCH');
  const idemKey = uuid();
  let orderId;
  await step('POST /orders cria pedido com snapshot e LOGGED BATCH', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        items: [
          { product_id: PRODUCT_1, quantity: 2 },
          { product_id: PRODUCT_2, quantity: 1 },
        ],
      }),
    });
    assert.equal(status, 201);
    assert.ok(body.order_id, 'order_id ausente');
    assert.equal(body.client_id, CLIENT_ID);
    assert.equal(body.status, 'pending');
    // Total esperado: 2 × 49.90 + 1 × 349.90 = 449.70
    assert.ok(Math.abs(body.total - 449.7) < 0.01, `total errado: ${body.total}`);
    orderId = body.order_id;
  });

  await step('POST /orders REPLAY (mesma Idem-Key) → mesmo order_id', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey },
      // payload deliberadamente DIFERENTE — replay deve ignorar
      body: JSON.stringify({
        client_id: CLIENT_ID,
        items: [{ product_id: PRODUCT_1, quantity: 99 }],
      }),
    });
    assert.equal(status, 201);
    assert.equal(body.order_id, orderId, 'replay deveria retornar o mesmo order_id');
  });

  await step('GET /orders/:id retorna detalhes com snapshot', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/orders/${orderId}`);
    assert.equal(status, 200);
    assert.equal(body.order_id, orderId);
    assert.ok(body.client_snapshot?.name, 'client_snapshot ausente');
    assert.equal(body.items.length, 2);
  });

  await step('GET /orders/by-client/:id (query estrela Cassandra)', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/orders/by-client/${CLIENT_ID}?limit=20`);
    assert.equal(status, 200);
    assert.ok(body.some((o) => o.order_id === orderId), 'pedido não veio do orders_by_client');
    const o = body.find((o) => o.order_id === orderId);
    assert.ok(o.items_summary, 'items_summary ausente em orders_by_client');
  });

  await step('PATCH /orders/:id/status muda status nas DUAS tabelas', async () => {
    const { status, body } = await fetchJSON(`${ORDERS}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    });
    assert.equal(status, 200);
    assert.equal(body.status, 'paid');
  });

  await step('Verifica que GET por client reflete novo status', async () => {
    const { body } = await fetchJSON(`${ORDERS}/orders/by-client/${CLIENT_ID}`);
    const o = body.find((o) => o.order_id === orderId);
    assert.equal(o?.status, 'paid', 'status do orders_by_client não foi atualizado');
  });

  console.log('\n🔁 Saga, cancelamento e DELETE (estoque Mongo ↔ pedidos Cassandra)');
  await step('Pedido com 2º item sem estoque → 409 e estoque do 1º item devolvido', async () => {
    const { status } = await fetchJSON(
      `${ORDERS}/orders`,
      json(
        'POST',
        {
          client_id: newClientId,
          items: [
            { product_id: newProductId, quantity: 3 },
            { product_id: PRODUCT_2, quantity: 999999 },
          ],
        },
        { 'Idempotency-Key': uuid() },
      ),
    );
    assert.equal(status, 409);
    assert.equal(await stockOf(newProductId), 10, 'estoque deveria ter voltado para 10');
  });

  let orderA;
  await step('Pedido de 4 unidades baixa o estoque para 6', async () => {
    const { status, body } = await fetchJSON(
      `${ORDERS}/orders`,
      json(
        'POST',
        { client_id: newClientId, items: [{ product_id: newProductId, quantity: 4 }] },
        { 'Idempotency-Key': uuid() },
      ),
    );
    assert.equal(status, 201);
    assert.equal(body.total, 120);
    orderA = body.order_id;
    assert.equal(await stockOf(newProductId), 6);
  });
  await step('PATCH status inválido → 400', async () => {
    const { status } = await fetchJSON(
      `${ORDERS}/orders/${orderA}/status`,
      json('PATCH', { status: 'qualquer-coisa' }),
    );
    assert.equal(status, 400);
  });
  await step('PATCH status=canceled devolve o estoque (volta para 10)', async () => {
    const { status } = await fetchJSON(
      `${ORDERS}/orders/${orderA}/status`,
      json('PATCH', { status: 'canceled' }),
    );
    assert.equal(status, 200);
    assert.equal(await stockOf(newProductId), 10);
  });

  let orderB;
  await step('DELETE /orders/:id remove o pedido e devolve o estoque', async () => {
    const created = await fetchJSON(
      `${ORDERS}/orders`,
      json(
        'POST',
        { client_id: newClientId, items: [{ product_id: newProductId, quantity: 2 }] },
        { 'Idempotency-Key': uuid() },
      ),
    );
    assert.equal(created.status, 201);
    orderB = created.body.order_id;
    assert.equal(await stockOf(newProductId), 8);

    const del = await fetchJSON(`${ORDERS}/orders/${orderB}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    assert.equal(await stockOf(newProductId), 10);
  });
  await step('Pedido excluído some das DUAS tabelas', async () => {
    const one = await fetchJSON(`${ORDERS}/orders/${orderB}`);
    assert.equal(one.status, 404);
    const list = await fetchJSON(`${ORDERS}/orders/by-client/${newClientId}`);
    assert.ok(!list.body.some((o) => o.order_id === orderB), 'ainda está em orders_by_client');
  });

  console.log('\n🧹 Limpeza (DELETE dos dados criados)');
  await step('DELETE /products/:id → 204 e depois 404', async () => {
    const del = await fetchJSON(`${PRODUCTS}/products/${newProductId}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    assert.equal((await fetchJSON(`${PRODUCTS}/products/${newProductId}`)).status, 404);
  });
  await step('DELETE /clients/:id → 204 e depois 404', async () => {
    const del = await fetchJSON(`${CLIENTS}/clients/${newClientId}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
    assert.equal((await fetchJSON(`${CLIENTS}/clients/${newClientId}`)).status, 404);
  });

  console.log('\n📊 Resultado');
  console.log(`   ✔ ${okCount} passes`);
  console.log(`   ✗ ${failCount} fails`);
  if (failures.length) {
    console.log('\nFalhas:');
    failures.forEach((f) => console.log(`   - ${f.name}: ${f.error}`));
    process.exit(1);
  }
  console.log('\n✅ Tudo passou — os 3 bancos estão consistentes.');
})().catch((err) => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
