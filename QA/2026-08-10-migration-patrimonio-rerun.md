# Migration do re-run de patrimônio 2026, delta oficial

Item 1 e item 17-dados da matriz PF Ajustes. A migration, o rollback, a
allowlist e os readbacks foram atualizados contra o pacote oficial corrente do
TSE. A prova em Postgres 17 efêmero passou nos nove ramos. **Nada foi escrito em
produção.** Aplicação, deploy, ativação de cron e readback público continuam
atos externos separados.

Branch residual: `codex/pf-ajustes-patrimonio-delta-20260810`, nascida de
`rc-lancamento` em `d17163fb58ad1c8d780d82be71e428671821306d`.

## Fonte e identidade

Os dois pacotes foram baixados de `https://cdn.tse.jus.br/estatistica/sead/odsele/`
e validados antes de gerar o delta:

| Pacote | SHA-256 |
|---|---|
| `consulta_cand_2026.zip` | `cd034c6b994025f018827e317476e5d37c2672809d5a0b69294d461d90cdcb04` |
| `bem_candidato_2026.zip` | `b4e098f1d9e2a616f7bf1d4dfe9fc103e1adfe4eb9acd87be3bc79b63f187c49` |

O manifesto nominal, com UF, cargo, SQ, hashes dos CSVs internos e bens, está
em
[`manifesto-delta-patrimonio-2026.json`](evidencias/2026-08-10-migration-patrimonio-rerun/manifesto-delta-patrimonio-2026.json).
O casamento é fail-closed por `SQ_CANDIDATO + ano + UF + nome exato + cargo`.

## Universo remedido

O universo canônico agora tem **32 células de patrimônio de 2026**. O dry-run
integral, sem escrita, terminou assim:

| Estado | Células |
|---|---:|
| `tse_publicou` | 10 |
| `valores_mudaram` | 1 |
| `sem_mudanca` | 19 |
| `ausencia_sem_evidencia` | 2 |

Relatório íntegro:
[`rerun-patrimonio-2026-20260810.json`](evidencias/2026-08-10-migration-patrimonio-rerun/rerun-patrimonio-2026-20260810.json).

O delta acrescenta os dois SQs oficiais que a coorte anterior omitia:

| Ficha | SQ_CANDIDATO | Bens | Total |
|---|---:|---:|---:|
| `jose-estevao` | 50002536579 | 1 | R$ 600.000,00 |
| `samara-mineiro` | 70002537111 | 2 | R$ 69.196,63 |

Também corrige duas afirmações sem evidência:

| Ficha | SQ_CANDIDATO | Evidência oficial | Estado correto |
|---|---:|---|---|
| `dr-luisinho` | 10002533539 | identidade exata; zero bens; `ST_DECLARAR_BENS` indisponível/NULL | `nao_coletado` |
| `preta-lu` | 100002534191 | identidade exata; zero bens; `ST_DECLARAR_BENS` indisponível/NULL | `nao_coletado` |

Zero linhas em `bem_candidato` não prova ausência oficial. Por isso a forward
remove as duas linhas de `patrimonio_ausencia_oficial`, e o rollback não recria
essa falsidade.

## Escritas preparadas

A migration tem **21 operações**, todas cobertas uma a uma pela allowlist:

- 10 `INSERT` em `patrimonio`, os oito alvos anteriores mais José Estevão e
  Samara Mineiro;
- 1 `UPDATE` em `patrimonio`, retificação do tipo do bem de `priscila-voigt`;
- 10 `DELETE` em `patrimonio_ausencia_oficial`, os oito alvos que passaram a
  ter bens mais `dr-luisinho` e `preta-lu`.

A coorte protegida tem 13 fichas. Qualquer coorte parcial, SQ divergente,
patrimônio posterior ou composição divergente de Priscila aborta a transação.
O único no-op permitido é o replay linear em banco sem nenhuma das 13 fichas.

Arquivos operacionais:

| Arquivo | Contrato |
|---|---|
| `supabase/migrations/20260810093000_rerun_patrimonio_2026_tse_publicou.sql` | forward, 21 `@write` |
| `supabase/rollback/20260810093000_rerun_patrimonio_2026_tse_publicou.rollback.sql` | rollback com guards; não recria ausências falsas |
| `scripts/audit/allowlist-patrimonio-rerun-20260810.json` | 21 operações exatas |
| `scripts/audit/provar-migration-patrimonio-rerun.sh` | nove cenários em Postgres efêmero |
| `scripts/audit/readback-patrimonio-rerun.ts` | readback estrito e somente leitura das 13 fichas alteradas, com composição, fonte e SQ congelados |

## Prova local

`bash scripts/audit/provar-migration-patrimonio-rerun.sh` terminou com exit 0:

| Ramo | Resultado |
|---|---|
| F0, base vazia | no-op explícito, zero escrita |
| F1, coorte parcial | aborta, zero escrita |
| F2, SQ divergente | aborta, estado preservado |
| F3, patrimônio posterior | aborta, estado preservado |
| F4, Priscila divergente | aborta, estado preservado |
| F5, composição esperada | aplica as 21 operações e passa os readbacks nominais |
| F6, reaplicação | aborta, estado preservado |
| R1, rollback | remove 10 patrimônios, restaura só as oito ausências comprováveis e preserva os dois `nao_coletado` |
| R2, curadoria posterior | aborta, estado posterior preservado |

Recibo versionado:
[`prova-postgres-efemero-20260810.txt`](evidencias/2026-08-10-migration-patrimonio-rerun/prova-postgres-efemero-20260810.txt).

## Readback pós-apply, ainda não executado

Depois de uma aplicação autorizada, o primeiro readback exato é:

```bash
npm run audit:patrimonio-rerun:readback
```

Ele exige, simultaneamente:

- José Estevão publicado com 1 bem e R$ 600.000,00;
- Samara Mineiro publicada com 2 bens e R$ 69.196,63;
- Dr. Luisinho e Preta Lu sem patrimônio, sem ausência oficial e com estado
  público `nao_coletado`;
- zero divergência nas 13 fichas alteradas.

O readback público de DTO e DOM permanece separado:

```bash
node --import tsx scripts/audit/readback-patrimonio-eleicoes.ts \
  --slugs=jose-estevao,samara-mineiro,dr-luisinho,preta-lu
```

## Próximo ato externo

Aplicar **somente** a migration `20260810093000` após autorização que nomeie o
ato. Contagem esperada: 10 inserts, 1 update, 10 deletes e uma linha no ledger.
Depois, rodar os dois readbacks acima no mesmo SHA implantado. O cron continua
desligado e não faz parte dessa autorização.
