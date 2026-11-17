#!/usr/bin/env bash
# Executor de `nest start --watch --exec` (somente desenvolvimento).
#
# O Nest CLI encerra o processo anterior com SIGTERM e sobe o novo assim que o
# `sh` pai sai, sem esperar o `node` filho liberar a porta. Como o bootstrap do
# OTel (src/tracing.ts) faz `sdk.shutdown()` no SIGTERM, o node antigo pode
# continuar vivo por alguns segundos sob carga (ex.: apos `npm run build`) e o
# novo morre com EADDRINUSE. Aqui esperamos a porta liberar (limite de 30s)
# antes de iniciar o node. Nao e usado em producao (`npm start` roda dist/main.js).
set -u

port="${PDV_PORT:-${PORT:-8010}}"

for _ in $(seq 1 150); do
  if ! (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
    break
  fi
  sleep 0.2
done

exec node "$@"
