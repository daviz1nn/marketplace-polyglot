// =========================================================================
// Init script — MongoDB (products-service)
// Executado automaticamente pelo Docker no primeiro boot do container.
// O Mongo executa todos os .js em /docker-entrypoint-initdb.d/ via mongosh.
// =========================================================================

db = db.getSiblingDB('marketplace');

// ----- Coleção e índices -----
if (!db.getCollectionNames().includes('products')) {
  db.createCollection('products');
}

db.products.createIndex({ id: 1 }, { unique: true });
db.products.createIndex({ category: 1, price: 1 });
db.products.createIndex({ name: 'text' });

// ----- Seed: 5 produtos em 2 categorias diferentes -----
// Mostra a heterogeneidade de attributes (justifica o uso de document store)
db.products.insertMany([
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    name: 'Camiseta Básica Algodão',
    description: 'Camiseta unissex 100% algodão, gola redonda.',
    category: 'vestuario',
    price: NumberDecimal('49.90'),
    stock: 120,
    attributes: { tamanho: 'M', cor: 'azul', material: 'algodão' },
    images: ['https://example.com/imgs/camiseta-azul.jpg'],
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    name: 'Camiseta Básica Algodão',
    description: 'Camiseta unissex 100% algodão, gola redonda.',
    category: 'vestuario',
    price: NumberDecimal('49.90'),
    stock: 80,
    attributes: { tamanho: 'G', cor: 'preto', material: 'algodão' },
    images: ['https://example.com/imgs/camiseta-preta.jpg'],
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    name: 'Tênis Esportivo Pro',
    description: 'Tênis para corrida com amortecimento em gel.',
    category: 'calcados',
    price: NumberDecimal('349.90'),
    stock: 40,
    attributes: { tamanho: 42, cor: 'cinza', tipo: 'corrida' },
    images: ['https://example.com/imgs/tenis-cinza.jpg'],
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
    name: 'Livro: Bancos de Dados',
    description: 'Introdução prática a SQL, NoSQL e modelagem.',
    category: 'livros',
    // attributes COMPLETAMENTE DIFERENTES — prova schema flexível
    price: NumberDecimal('89.90'),
    stock: 25,
    attributes: { autor: 'P. Sadalage', isbn: '9788521234567', paginas: 480, idioma: 'pt-BR' },
    images: ['https://example.com/imgs/livro-bd.jpg'],
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
    name: 'Fone Bluetooth XR',
    description: 'Fone over-ear com cancelamento ativo de ruído.',
    category: 'eletronicos',
    price: NumberDecimal('499.00'),
    stock: 15,
    attributes: {
      bateria_horas: 30,
      bluetooth: '5.3',
      cancelamento_ruido: true,
      garantia_meses: 12,
    },
    images: ['https://example.com/imgs/fone-xr.jpg'],
    created_at: new Date(),
    updated_at: new Date(),
  },
]);

print('✔ MongoDB seed concluído: ' + db.products.countDocuments() + ' produtos inseridos.');
