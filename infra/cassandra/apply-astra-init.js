#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Aplica o schema do init.cql num cluster Astra DB usando o Secure Connect
 * Bundle + Application Token. Substitui o cassandra-init container do
 * docker-compose quando rodando em modo cloud.
 *
 * Pré-requisitos no .env (ou env vars):
 *   ASTRA_BUNDLE_PATH=./infra/cassandra/astra/secure-connect-marketplace.zip
 *   ASTRA_APPLICATION_TOKEN=AstraCS:...
 *   CASSANDRA_KEYSPACE=marketplace   (default)
 *
 * Uso:
 *   node infra/cassandra/apply-astra-init.js
 *
 * Idempotente: usa CREATE ... IF NOT EXISTS em todas as instruções.
 */
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const { Client } = require('cassandra-driver');

// Força DNS Google para resolver hostnames do Astra DB.
// Necessário em redes domésticas com DNS resolver limitado.
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bundle = process.env.ASTRA_BUNDLE_PATH;
const token = process.env.ASTRA_APPLICATION_TOKEN;
const keyspace = process.env.CASSANDRA_KEYSPACE || 'marketplace';

if (!bundle || !token) {
  console.error(
    '✗ ASTRA_BUNDLE_PATH e ASTRA_APPLICATION_TOKEN são obrigatórios.\n' +
      '  Verifique o arquivo .env na raiz do projeto.',
  );
  process.exit(1);
}

const bundlePath = path.isAbsolute(bundle)
  ? bundle
  : path.resolve(__dirname, '../..', bundle);

if (!fs.existsSync(bundlePath)) {
  console.error(`✗ Secure Connect Bundle não encontrado em: ${bundlePath}`);
  process.exit(1);
}

// O init.cql contém CREATE KEYSPACE que o Astra rejeita (já criado pelo UI).
// Vamos pular esse comando e aplicar só os UDTs + tabelas.
const cqlPath = path.resolve(__dirname, 'init.cql');
const rawCql = fs.readFileSync(cqlPath, 'utf8');

// 1. Remove TODAS as linhas de comentário (`-- ...` linha inteira)
// 2. Particiona por `;`
// 3. Trim, filtra empty, e filtra CREATE KEYSPACE / USE (Astra gerencia)
const statements = rawCql
  .replace(/^\s*--.*$/gm, '')
  .split(/;\s*\r?\n?/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .filter((s) => !/^\s*CREATE\s+KEYSPACE/i.test(s))
  .filter((s) => !/^\s*USE\s+/i.test(s));

async function main() {
  const client = new Client({
    cloud: { secureConnectBundle: bundlePath },
    credentials: { username: 'token', password: token },
    keyspace,
  });

  console.log(`→ Conectando ao Astra DB (keyspace=${keyspace})...`);
  await client.connect();
  console.log('✔ Conectado');

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 90);
    console.log(`\n[${i + 1}/${statements.length}] ${preview}${stmt.length > 90 ? '...' : ''}`);
    try {
      await client.execute(stmt);
      console.log('   ✔ ok');
    } catch (err) {
      console.error(`   ✗ falhou: ${err.message}`);
      throw err;
    }
  }

  console.log('\n✔ Schema aplicado com sucesso ao keyspace', keyspace);
  console.log('  Tabelas: orders, orders_by_client, orders_by_idem_key');
  console.log('  UDTs:    client_snapshot, order_item');

  await client.shutdown();
}

main().catch((err) => {
  console.error('\n✗ Erro fatal:', err.message);
  process.exit(1);
});
