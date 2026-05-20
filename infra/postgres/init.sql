-- =========================================================================
-- Init script — PostgreSQL (clients-service)
-- Executado automaticamente pelo Docker no primeiro boot do container.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS clients (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(160) NOT NULL UNIQUE,
  cpf         CHAR(11)     NOT NULL UNIQUE,
  phone       VARCHAR(20),
  address     JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (address ? 'city' AND address ? 'state' AND address ? 'zip')
);

CREATE INDEX IF NOT EXISTS clients_name_idx ON clients (lower(name));

-- ----- Seed: 3 clientes demo (IDs fixos para facilitar testes manuais) -----
INSERT INTO clients (id, name, email, cpf, phone, address) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'Ana Souza',
   'ana@example.com',
   '12345678901',
   '+5511999990001',
   '{"street":"Rua A","number":"100","city":"São Paulo","state":"SP","zip":"01000-000"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222',
   'Bruno Lima',
   'bruno@example.com',
   '23456789012',
   '+5511999990002',
   '{"street":"Av. B","number":"250","city":"Rio de Janeiro","state":"RJ","zip":"20000-000"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333',
   'Carla Mendes',
   'carla@example.com',
   '34567890123',
   '+5511999990003',
   '{"street":"Rua C","number":"77","city":"Belo Horizonte","state":"MG","zip":"30000-000"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
