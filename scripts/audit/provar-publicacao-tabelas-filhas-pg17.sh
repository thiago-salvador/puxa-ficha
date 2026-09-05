#!/usr/bin/env bash
# Prova local descartável; nunca usa conexão de produção.
set -euo pipefail
cd "$(dirname "$0")/../.."
PF_PROVAR_PUBLICATION_PG17=1 node --import tsx --test tests/publication-boundary-pg17.test.ts
