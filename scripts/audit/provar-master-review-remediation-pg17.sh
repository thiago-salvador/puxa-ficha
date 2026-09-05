#!/usr/bin/env bash
# Três fixtures PostgreSQL 17 efêmeras, sem secrets ou conexão remota.
set -euo pipefail
cd "$(dirname "$0")/../.."
PF_PROVAR_PUBLICATION_PG17=1 PF_PROVAR_QUOTA_PG17=1 PF_PROVAR_CRON_RECEIPTS_PG17=1 \
  node --import tsx --test --test-concurrency=1 \
  tests/publication-boundary-pg17.test.ts \
  tests/request-ip-quota-pg17.test.ts \
  tests/cron-receipts-pg17.test.ts \
  tests/master-review-transaction-pg17.test.ts
