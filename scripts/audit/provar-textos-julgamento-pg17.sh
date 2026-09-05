#!/usr/bin/env bash
# Prova local descartável; nunca usa conexão de produção.
set -euo pipefail
cd "$(dirname "$0")/../.."
PF_PROVAR_TEXTOS_JULGAMENTO_PG17=1 node --import tsx --test tests/textos-julgamento-pg17.test.ts
