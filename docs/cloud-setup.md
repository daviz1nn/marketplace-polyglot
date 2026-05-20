# Modo Cloud — Setup passo a passo

Esta opção **substitui os 3 bancos containerizados** por instâncias gratuitas
em provedores cloud, deixando só os 4 serviços Node rodando no seu PC. Ideal
para máquinas com pouca RAM ou sem virtualização habilitada.

| Banco       | Provedor cloud         | Free tier                          | URL/credenciais que você precisa |
|-------------|------------------------|------------------------------------|----------------------------------|
| PostgreSQL  | Supabase ou Neon       | 500 MB DB, sempre ativo            | `DATABASE_URL`                   |
| MongoDB     | MongoDB Atlas          | 512 MB cluster M0, sempre ativo    | `MONGO_URL`                      |
| Cassandra   | DataStax Astra DB      | 5 GB armazenamento, serverless     | Bundle .zip + Application Token  |

---

## 1. PostgreSQL via Supabase (~5 min)

1. Acesse https://supabase.com → **Sign in** (login com GitHub é mais rápido).
2. **New project** → defina:
   - Nome do projeto: `marketplace`
   - Senha do banco: **anote** (será parte da URL)
   - Região: South America (sa-east-1) ou US East
3. Aguarde ~2 min o projeto provisionar.
4. **Settings → Database → Connection string → URI** — copie a string
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`
5. Substitua `[YOUR-PASSWORD]` pela senha que você anotou.
6. **SQL Editor** → cole o conteúdo de `infra/postgres/init.sql` → **Run**.
   Isso cria a tabela `clients` e insere os 3 clientes demo.
7. No `.env` do projeto:
   ```
   DATABASE_URL=postgresql://postgres:SUA_SENHA@db.xxx.supabase.co:5432/postgres?sslmode=require
   ```

---

## 2. MongoDB Atlas (~10 min)

1. Acesse https://www.mongodb.com/cloud/atlas/register → crie conta.
2. **Build a Database** → **M0 Free** → AWS, região `sa-east-1` (São Paulo).
3. Nome do cluster: `Cluster0` (default OK).
4. **Database Access** → **Add new user**:
   - Username: `marketplace`
   - Password: gere automático e **anote**
   - Privileges: `Atlas admin` (modo simples; em produção real seria mais restrito)
5. **Network Access** → **Add IP Address**:
   - Para a defesa, use **`0.0.0.0/0`** (Allow access from anywhere). Em
     produção seria restrito ao IP da app.
6. **Database → Connect → Drivers → Node.js → copy** a connection string:
   ```
   mongodb+srv://marketplace:<password>@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Substitua `<password>` pela senha anotada e adicione `/marketplace` antes do `?`:
   ```
   mongodb+srv://marketplace:SUA_SENHA@cluster0.xxx.mongodb.net/marketplace?retryWrites=true&w=majority
   ```
8. **Carregar o seed:** abra um terminal local com `mongosh` apontando para
   essa URL e cole o conteúdo de `infra/mongo/init.js`. **Alternativa GUI:**
   use MongoDB Compass para conectar e criar a coleção + documentos manualmente.
9. No `.env`:
   ```
   MONGO_URL=mongodb+srv://marketplace:SUA_SENHA@cluster0.xxx.mongodb.net/marketplace?retryWrites=true&w=majority
   ```

---

## 3. DataStax Astra DB — Cassandra (~10 min)

1. Acesse https://astra.datastax.com → **Sign up**.
2. **Create Database** → **Serverless (Vector)** ou **Serverless (Non-Vector)**.
   - Nome: `marketplace`
   - Keyspace: `marketplace`
   - Provider/Region: AWS → US East 1 (mais estável free) ou São Paulo
3. Aguarde ~3 min o status ficar `Active`.
4. **Database details → Connect → Drivers → Node.js**:
   - **Download Bundle** → salve como
     `infra/cassandra/astra/secure-connect-marketplace.zip`
5. **Database → Token Management → Create Application Token**:
   - Role: `Database Administrator`
   - **Copie e anote** o `Application Token` (começa com `AstraCS:...`).
     Você **não vai vê-lo de novo**.
6. **CQL Console** (no Astra UI):
   - Selecione o keyspace `marketplace`
   - Cole o conteúdo de `infra/cassandra/init.cql` **a partir de**
     `CREATE TYPE` (pule o `CREATE KEYSPACE` — o Astra já criou)
   - Execute uma instrução por vez (CQL Console não aceita batch via paste).
7. No `.env`:
   ```
   ASTRA_BUNDLE_PATH=./infra/cassandra/astra/secure-connect-marketplace.zip
   ASTRA_APPLICATION_TOKEN=AstraCS:xxxxxxxxxxxxxxxxxxxx:xxxxxxxxxxxxxxxxxxxx
   CASSANDRA_KEYSPACE=marketplace
   ```
   E remova/comente as variáveis `CASSANDRA_CONTACT_POINTS`, `CASSANDRA_PORT`,
   `CASSANDRA_LOCAL_DATACENTER` (não usadas no modo cloud).

---

## 4. Rodar tudo

Com o `.env` configurado:

```bash
cd C:\claude\PROJETO-TUNNING-DE-DADOS
npm run dev:local
```

Esse comando sobe os 4 serviços em **um único terminal** com saídas coloridas:

- `clients-service` em http://localhost:3001 → Swagger em `/docs`
- `products-service` em http://localhost:3002 → Swagger em `/docs`
- `orders-service`   em http://localhost:3003 → Swagger em `/docs`
- `frontend` em        http://localhost:5173

Verifique cada um:
```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

---

## 5. Diferenças vs modo Docker (transparência acadêmica)

No README principal seção 12 (Decisões e trade-offs), declarar:

> Para fins de execução em máquinas com pouca RAM ou sem virtualização
> habilitada, o projeto suporta um **modo cloud** alternativo: Postgres no
> Supabase, MongoDB no Atlas e Cassandra no DataStax Astra (todos free tier).
> O código de aplicação é **idêntico** — só muda a string de conexão. O modo
> docker-compose continua sendo o caminho canônico documentado.

Isso é **transparente e defensável** academicamente. A nota não cai porque:

1. A persistência poliglota é demonstrada do mesmo jeito — 3 modelos
   diferentes (relacional, document, wide-column) sendo usados pela mesma app.
2. O `init.sql`, `init.js` e `init.cql` continuam sendo os artefatos de
   modelagem que vão para a defesa.
3. A discussão de CAP/PACELC e justificativa de banco não muda.

Único ponto que **não** dá pra demonstrar em modo cloud: o setup do
container Cassandra com heap controlado e healthcheck. Compense mostrando
o **Astra UI** com o CQL Console executando as queries-chave ao vivo.
