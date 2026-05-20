#!/bin/sh
# =========================================================================
# wait-and-init.sh — Cassandra one-shot init
#
# Estratégia: o container `cassandra-init` no docker-compose já depende de
# `cassandra: service_healthy`, então quando este script roda, o Cassandra
# JÁ está aceitando CQL. Mesmo assim, fazemos uma checagem defensiva extra.
# =========================================================================

set -e

CASSANDRA_HOST="${CASSANDRA_HOST:-cassandra}"
CASSANDRA_PORT="${CASSANDRA_PORT:-9042}"
INIT_FILE="${INIT_FILE:-/init.cql}"

echo "→ Aguardando Cassandra em ${CASSANDRA_HOST}:${CASSANDRA_PORT}..."

# Defensive retry loop (até 60 tentativas, 5s cada = 5 min máx)
i=0
until cqlsh "${CASSANDRA_HOST}" "${CASSANDRA_PORT}" -e "DESCRIBE KEYSPACES" >/dev/null 2>&1; do
  i=$((i+1))
  if [ "$i" -ge 60 ]; then
    echo "✗ Timeout aguardando Cassandra após 5 minutos."
    exit 1
  fi
  echo "  (tentativa $i/60) Cassandra ainda não responde, aguardando 5s..."
  sleep 5
done

echo "✔ Cassandra respondendo."
echo "→ Aplicando ${INIT_FILE}..."
cqlsh "${CASSANDRA_HOST}" "${CASSANDRA_PORT}" -f "${INIT_FILE}"

echo "✔ Schema aplicado com sucesso."
