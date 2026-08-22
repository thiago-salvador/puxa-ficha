#!/usr/bin/env bash
# Gate comportamental local/CI das migrations do PF Ajustes e da remediacao ACL.
# Cada prova cria e remove o próprio Postgres 17 efêmero; nenhuma usa segredo
# ou conexão remota. A ordem é serial para limitar consumo de Docker no runner.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

provas=(
  scripts/audit/provar-migration-b2.sh
  scripts/audit/provar-migration-trilha-a.sh
  scripts/audit/provar-despublicacao-votacoes.sh
  scripts/audit/provar-migration-patrimonio-rerun.sh
  scripts/audit/provar-migration-daciolo.sh
  scripts/audit/provar-migration-financiamento-acl-exato.sh
  scripts/audit/provar-migration-financiamento-funcoes-acl-exato.sh
  scripts/audit/provar-migration-financiamento-publico-acl-despublicado.sh
  scripts/audit/provar-financiamento-universo.sh
  scripts/audit/provar-migration-processos-curadoria-69.sh
  scripts/audit/provar-migration-processos-curadoria-66.sh
  scripts/audit/provar-migration-destaques-trajetoria-tse-8.sh
  scripts/audit/provar-votacoes-senado-exatas.sh
  scripts/audit/provar-migration-destaques-estados-residuais-194.sh
  scripts/audit/provar-migration-historico-fontes-oficiais-cadu-cappelli.sh
  scripts/audit/provar-migration-processos-legados-fontes-oficiais.sh
  scripts/audit/provar-migration-orleans-destaques-proveniencia.sh
  scripts/audit/provar-migration-orleans-chaves-canonicas.sh
  scripts/audit/provar-quota-rpc-pg17.sh
)

for prova in "${provas[@]}"; do
  echo "== PG17: $prova"
  bash "$ROOT/$prova"
done

echo "PASS: gate PG17 do release PF Ajustes (${#provas[@]} provas)"
