# =========================================================================
# clients-service — multi-stage build
# Imagem final: node:22-alpine + dist + node_modules prod-only (~250MB)
# =========================================================================

# ----- Stage 1: builder -----
FROM node:22-alpine AS builder

WORKDIR /app

# Copia manifests primeiro para aproveitar cache
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Instala TODAS as dependências (incluindo dev) e gera Prisma Client
RUN npm install --legacy-peer-deps && npx prisma generate

# Copia o resto e compila
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Remove devDependencies para shrink
RUN npm prune --omit=dev

# ----- Stage 2: runner -----
FROM node:22-alpine AS runner

WORKDIR /app

# Cria usuário não-root
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copia artefatos do builder
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json

USER nestjs

ENV NODE_ENV=production
EXPOSE 3001

# Schema já aplicado pelo init.sql do Docker; Prisma Client já foi gerado
# no builder stage. Basta executar.
CMD ["node", "dist/main.js"]
