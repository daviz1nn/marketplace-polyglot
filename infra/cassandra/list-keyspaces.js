#!/usr/bin/env node
/* eslint-disable no-console */
// Diagnóstico — lista keyspaces existentes no Astra DB.
const path = require('node:path');
const dns = require('node:dns');
const { Client } = require('cassandra-driver');
dns.setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

(async () => {
  const c = new Client({
    cloud: { secureConnectBundle: path.resolve(__dirname, 'astra/secure-connect-marketplace.zip') },
    credentials: { username: 'token', password: process.env.ASTRA_APPLICATION_TOKEN },
  });
  await c.connect();
  const rs = await c.execute('SELECT keyspace_name FROM system_schema.keyspaces');
  console.log('Keyspaces no Astra DB:');
  rs.rows.forEach((r) => {
    const isSystem = r.keyspace_name.startsWith('system');
    console.log(`  ${isSystem ? ' ' : '★'} ${r.keyspace_name}`);
  });
  await c.shutdown();
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
