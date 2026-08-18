# Fase 4: readback 120000 depois da carga 121000

Data: 12/08/2026.

## Estado remoto medido

- PR #177 mergeada em `main` no SHA
  `f0f5b391dc42a37675179b344f6d7fbce59e5a31`.
- `/api/deployment-info` confirmou o mesmo SHA, branch `main` e ambiente
  `production`.
- A linha `20260812123000` do ledger foi corrigida pelo único `UPDATE`
  autorizado. Preimage: `name=NULL`, zero statements e MD5
  `d41d8cd98f00b204e9800998ecf8427e`. Postimage: nome
  `financiamento_publico_acl_despublicado`, um statement, 7.237 bytes e MD5
  `ed32564d8f0398e3ba12c6da1fcc0819`, exatamente igual ao arquivo.
- Ledger após a correção: 393 versões, topo `20260812123000`.

## Primeira divergência da Fase 4

O workflow manual `Readback público Fase 4`, run `31606691534`, executou no
SHA publicado e parou no primeiro erro:

```text
FAIL: readback final da migration 20260810120000 divergiu
tabela_rows=94
```

O catálogo, as assinaturas, RLS, constraints, triggers, funções, view, ACL,
owners e extras estruturais coincidiram. A falha era o contrato temporal do
readback: `120000` exigia tabela vazia mesmo quando o ledger já continha a
`121000`. A própria `121000` persiste e prova exatamente 94 verificações, 57
ausências oficiais e 37 erros, ao lado de 141 financiamentos publicados.

## Correção local fail-closed

O readback de `120000` agora exige:

- zero linhas quando `20260810121000` não está no ledger;
- exatamente 94 linhas quando `20260810121000` está no ledger;
- em ambos os estados, zero verificações inválidas e zero sobreposição com
  financiamento publicado.

O harness PostgreSQL 17 foi ampliado para repetir o readback de schema depois
da carga. O teste vermelho reproduziu `tabela_rows=94` e exit 3 antes da
correção. Depois da correção, o harness completo passou, incluindo forward,
readbacks adversariais e rollbacks. O readback corrigido também passou contra
produção read-only, retornando 57 ausências oficiais e 37 erros.

Nenhuma migration nova, coleta ou cron foi executado. A Fase 4 não foi
reiniciada.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
