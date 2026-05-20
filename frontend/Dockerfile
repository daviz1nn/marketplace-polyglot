# Frontend dev: roda Vite dev server (apropriado para defesa acadêmica).
# Em produção real, faríamos build + nginx; mas dev server simplifica a demo
# (hot reload, sem rebuild). Imagem ainda usa node:22-alpine.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]
