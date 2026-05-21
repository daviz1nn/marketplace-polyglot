#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Aplica o seed do MongoDB (5 produtos + índices) contra um cluster
 * MongoDB Atlas usando MONGO_URL. Substitui o /docker-entrypoint-initdb.d
 * do container Mongo quando rodando em modo cloud.
 *
 * Pré-requisitos no .env:
 *   MONGO_URL=mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/marketplace?...
 *
 * Uso:
 *   node infra/mongo/apply-atlas-init.js
 *
 * Idempotente: usa upsert por `id` (UUID estável dos seeds).
 */
const path = require('node:path');
const dns = require('node:dns');
const { MongoClient, Decimal128 } = require('mongodb');

// Força DNS do Google para resolver SRV records do MongoDB Atlas.
// Necessário em redes domésticas cujo DNS local não resolve SRV.
dns.setServers(['8.8.8.8', '1.1.1.1']);

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.MONGO_URL;
if (!url) {
  console.error('✗ MONGO_URL é obrigatório. Verifique o .env na raiz.');
  process.exit(1);
}

const products = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    name: 'Camiseta Básica Algodão',
    description: 'Camiseta unissex 100% algodão, gola redonda.',
    category: 'vestuario',
    price: Decimal128.fromString('49.90'),
    stock: 120,
    attributes: { tamanho: 'M', cor: 'azul', material: 'algodão' },
    images: ['https://example.com/imgs/camiseta-azul.jpg'],
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    name: 'Camiseta Básica Algodão',
    description: 'Camiseta unissex 100% algodão, gola redonda.',
    category: 'vestuario',
    price: Decimal128.fromString('49.90'),
    stock: 80,
    attributes: { tamanho: 'G', cor: 'preto', material: 'algodão' },
    images: ['https://example.com/imgs/camiseta-preta.jpg'],
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    name: 'Tênis Esportivo Pro',
    description: 'Tênis para corrida com amortecimento em gel.',
    category: 'calcados',
    price: Decimal128.fromString('349.90'),
    stock: 40,
    attributes: { tamanho: 42, cor: 'cinza', tipo: 'corrida' },
    images: ['https://example.com/imgs/tenis-cinza.jpg'],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    name: 'Livro: Bancos de Dados',
    description: 'Introdução prática a SQL, NoSQL e modelagem.',
    category: 'livros',
    // attributes COMPLETAMENTE DIFERENTES — prova schema flexível
    price: Decimal128.fromString('89.90'),
    stock: 25,
    attributes: { autor: 'P. Sadalage', isbn: '9788521234567', paginas: 480, idioma: 'pt-BR' },
    images: ['https://example.com/imgs/livro-bd.jpg'],
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    name: 'Fone Bluetooth XR',
    description: 'Fone over-ear com cancelamento ativo de ruído.',
    category: 'eletronicos',
    price: Decimal128.fromString('499.00'),
    stock: 15,
    attributes: {
      bateria_horas: 30,
      bluetooth: '5.3',
      cancelamento_ruido: true,
      garantia_meses: 12,
    },
    images: ['https://example.com/imgs/fone-xr.jpg'],
  },
];

async function main() {
  const client = new MongoClient(url);
  console.log('→ Conectando ao MongoDB Atlas...');
  await client.connect();
  console.log('✔ Conectado');

  const db = client.db('marketplace');
  const collection = db.collection('products');

  console.log('→ Criando índices...');
  await collection.createIndex({ id: 1 }, { unique: true });
  await collection.createIndex({ category: 1, price: 1 });
  await collection.createIndex({ name: 'text' });
  console.log('✔ Índices criados');

  console.log(`→ Inserindo/atualizando ${products.length} produtos (upsert)...`);
  const now = new Date();
  let upserted = 0;
  let modified = 0;
  for (const p of products) {
    const result = await collection.updateOne(
      { id: p.id },
      {
        $set: { ...p, updated_at: now },
        $setOnInsert: { created_at: now },
      },
      { upsert: true },
    );
    if (result.upsertedId) upserted++;
    else if (result.modifiedCount > 0) modified++;
  }
  console.log(`✔ Upsert concluído: ${upserted} novos, ${modified} atualizados`);

  const total = await collection.countDocuments();
  console.log(`\n📊 Total de produtos na coleção: ${total}`);

  await client.close();
}

main().catch((err) => {
  console.error('\n✗ Erro fatal:', err.message);
  if (err.cause) console.error('  Causa:', err.cause.message);
  process.exit(1);
});
