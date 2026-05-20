# Changelog

Todas as mudanças notáveis deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — Proposta (Fase 1)

### Added
- README com fundamentação teórica (Sadalage & Fowler, CAP/PACELC), tabela comparativa e justificativa de cada banco.
- Documentação detalhada de modelagem em `docs/data-model.md` (UDT, TIMEUUID, TWCS, LOGGED BATCH justificados).
- Diagramas em Mermaid embed: arquitetura geral e fluxo de pedido (sequence).
- Stack rationale em `docs/stack-rationale.md`.
- Scaffolds dos 3 microserviços NestJS 11 (`clients-service`, `products-service`, `orders-service`) com endpoint `/health` conectado ao respectivo banco.
- Scaffold do frontend Vite + React 19 + TypeScript + Tailwind + TanStack Query.
- `docker-compose.yml` com Postgres 17 + MongoDB 8 + Cassandra 5.0 + 3 BEs + FE, com healthchecks e `cassandra-init` one-shot.
- Init scripts para os 3 bancos com seeds de demo.
- Workspace npm na raiz com scripts utilitários.
- LICENSE MIT, .editorconfig, .prettierrc, .gitignore.

[Unreleased]: ../../compare/v0.1-proposta...HEAD
[0.1.0]: ../../releases/tag/v0.1-proposta
