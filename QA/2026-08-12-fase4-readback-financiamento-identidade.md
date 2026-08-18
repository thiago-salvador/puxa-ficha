# Fase 4: readback financeiro após divisão de identidade

Data: 12/08/2026

## Resultado operacional

A PR #178 foi mergeada em `main` e publicada no SHA
`eca104f4910a4a1398716ea10f4ac8d3e82d0e1c`. O workflow manual da Fase 4,
run `31609453915`, executou nesse mesmo SHA e parou na primeira divergência,
como exigido.

O primeiro erro foi o readback da migration `20260810121000`:

```text
readback financiamento: alvo=235 estado_mismatch=3 payload_mismatch=3 nao_coletado=3 financiamento=141 verificacoes=94 logs=235
```

Artefato do run: `readback-fase4-31609453915`, id `9146578741`, digest
`sha256:841df1ee3a6d9279a1d4fd6e530e9e4713bf44a728a3464f3889b614b77dadf3`.

## Causa

Não houve corrupção nem perda de dados. A migration posterior
`20260811102100` dividiu corretamente duas identidades que antes compartilhavam
o slug `orleans-brandao`:

- o governador homônimo, id `47a1de10-1cf7-47f8-837b-dbbf94480421`, passou a
  `carlos-brandao-ma-historico`, `removido` e não publicável;
- o pré-candidato Orleans Brandão, id
  `b6e8c205-a2b7-4a26-9b65-e7a3b3b2f601`, passou a ocupar
  `orleans-brandao` e permanece publicável.

O manifesto financeiro de 235 alvos contém três pleitos do governador antigo
sob o slug que existia no momento da carga: financiamento publicado de 2006 e
ausências oficiais de 2014 e 2018. O readback ainda resolvia todos os alvos pelo
slug atual, encontrou o novo pré-candidato e produziu exatamente três
divergências em cada contador.

## Correção fail-closed

O readback agora congela nome completo, nome de urna e candidato id no conjunto
esperado. A resolução normal continua exigindo identidade nominal e slug. O
único fallback temporal permitido exige simultaneamente:

1. manifesto com slug `orleans-brandao` e identidade do governador antigo;
2. UUID exato `47a1de10-1cf7-47f8-837b-dbbf94480421`;
3. nome completo e nome de urna exatos;
4. presença da migration de divisão `20260811102100` no ledger.

Depois da resolução, todas as verificações de estado, payload, fonte, logs e
cardinalidade usam `candidato_id`. Alterar o nome do homônimo arquivado faz o
readback abortar.

## Provas

- teste vermelho reproduziu `3/3/3` depois da divisão de identidade;
- harness PostgreSQL 17 passou o cenário temporal e recusou nome adulterado;
- os adversariais e rollbacks financeiros anteriores continuam verdes;
- testes focados: 20/20;
- leitura de produção pelo cliente de serviço confirmou 2/2 identidades, 3/3
  alvos históricos com payload integral e coortes 141/94/235;
- o gerador reproduz byte a byte o readback versionado.
- suíte integral: 3.032/3.032;
- agregador PostgreSQL 17: 16/16 provas de release;
- typecheck, check de scripts, lint, Settings, diff-check e build Turbopack em
  Node 24 passaram.

Nenhuma migration, coleta, correção de dados ou cron foi executado nesta
remediação. O próximo ato externo é integrar e publicar a correção no mesmo SHA
e somente então repetir uma vez o workflow manual da Fase 4.

## Readbacks posteriores afetados pelo mesmo split

A varredura preventiva dos 21 readbacks encontrou mais dois contratos que
dependiam do slug mutável de Orleans e reprovariam depois do financeiro:

- `20260810122000`: dois processos judiciais do governador permanecem no UUID
  histórico correto, mas o readback ainda os procurava no slug transferido ao
  pré-candidato;
- `20260811101000`: a assinatura das 292 verificações inclui o slug atual do
  candidato e, depois da divisão, mudou de
  `456ba86bfc5de2cc7a51714f4cef0f8c` para
  `95cc5a76055102f6b8684ad33818d731`.

O gerador judicial agora resolve os dois CNJs pelo UUID, nome completo e nome
de urna do governador, condicionado ao ledger `20260811102100`. O readback de
destaques aceita exatamente uma das duas assinaturas conforme a ausência ou a
presença desse ledger. Estado pós-split sem ledger, identidade adulterada,
payload alterado e CNJ duplicado continuam abortando.

Provas adicionais: 31/31 testes focais, harness judicial com oito cenários,
harness de destaques com 12 cenários e 22 asserções em duas collations, e gate
agregado PostgreSQL 17 com 16/16 provas. Nenhum dado ou ambiente remoto foi
alterado.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
