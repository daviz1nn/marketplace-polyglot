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
 *
 * Uso: node scripts/e2e-test.js
 *      ou:  npm run e2e
 */
const assert = require('node:assert/strict');

const CLIENTS = process.env.CLIENTS_URL || 'http://localhost:3001';
const PRODUCTS = process.env.PRODUCTS_URL || 'http://localhost:3002';
const ORDERS = process.env.ORDERS_URL || 'http://localhost:3003';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111'; // Ana Souza
const PRODUCT_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'; // Camiseta M azul
const PRODUCT_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'; // Tênis Pro

let okCount = 0;
let failCount = 0;
const failures = [];

function uuid() {
  return [
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 6),
    Math.random().toString(16).slice(2, 6),
    Math.random().toString(16).slice(2, 6),
    Math.random().toString(16).slice(2, 14),
  ]
    .map((s) => s.padEnd(s.length, '0'))
    .join('-');
}

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

  console.log('\n📊 Resultado');
  console.log(`   ✔ ${okCount} passes`);
  console.log(`   ✗ ${failCount} fails`);
  if (failures.length) {
    console.log('\nFalhas:');
    failures.forEach((f) => console.log(`   - ${f.name}: ${f.error}`));
    process.exit(1);
  }
  console.log('\n✅ Tudo passou — os 3 bancos cloud estão consistentes.');
})().catch((err) => {
  console.error('\n✗ Erro fatal:', err);
  process.exit(1);
});
