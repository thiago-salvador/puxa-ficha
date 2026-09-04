#!/usr/bin/env bash
# Somente PostgreSQL 17 descartável. Drivers reais com transporte local e schema medido.
set -euo pipefail
cd "$(dirname "$0")/../.."
PF_PROVAR_PROFISSAO_PG17=1 node --import tsx --test tests/profissao-alvaro-dias-rn-pg17.test.ts
