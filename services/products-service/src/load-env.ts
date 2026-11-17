// Carrega variáveis de ambiente ANTES de qualquer outro import.
//
// Em `npm run dev:local` o processo roda com cwd = pasta do serviço, então o
// ConfigModule do Nest (que procura `.env` no cwd) não enxergaria o `.env` da
// raiz do repositório. Aqui carregamos `.env` do serviço (se existir) e depois o
// da raiz. Variáveis já definidas no ambiente (ex.: docker-compose) não são
// sobrescritas.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const candidate of ['.env', '../../.env']) {
  const file = resolve(process.cwd(), candidate);
  if (existsSync(file)) process.loadEnvFile(file);
}
