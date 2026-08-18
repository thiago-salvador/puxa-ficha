# P-INFRA-POS-MEDIUMS, relatório de execução

Data da prova: 2026-08-15. Base: `origin/main` em
`64c211e18726c7f721a81ec20d43ee56abfd29dd`. Execução local, sem escrita em
banco remoto, push, deploy, criação de issue ou ativação de cron.

## Resultado

- Task 1 concluída: crédito estrutural de foto no schema, view, DTO e duas
  superfícies da ficha, com backfill auditado.
- Task 2 interrompida no gate aprovado: nenhuma limpeza de ISR foi feita.
- Task 3 concluída: watchdog diário, idempotente por workflow e com carência de
  oito dias.
- Task 4 concluída: [runbook de reconstrução](../docs/RUNBOOK-DR.md) com links
  internos validados e sem valores de segredo.
- Task 5 concluída no código e nos testes. A carga scoped e a gravação dos dois
  recibos continuam reservadas à integração.

## Task 1, créditos de foto

O levantamento read-only encontrou 134 fichas com URL Wikimedia ou Wikipedia.
A API oficial do Commons devolveu metadados completos para 133 e não encontrou
o arquivo de uma ficha. O inventário com autor, licença, URL da licença e página
de cada arquivo está em
[`2026-08-15-creditos-fotos-commons.json`](evidencias/2026-08-15-creditos-fotos-commons.json).
A coleta usou `https://commons.wikimedia.org/w/api.php` como fonte oficial.

Pendência, sem crédito genérico:

- `paulo-martins-gov-pr`, `File:Paulo Martins.jpeg`: arquivo ausente na resposta
  da API, sem autor, licença ou página recuperáveis. `foto_credito` permanece
  nulo.

O backfill também cobre 28 URLs diretas de
`https://divulgacandcontas.tse.jus.br` como `{origem: "tse"}`. O gate do projeto
proíbe migration nova que misture DDL e DML, por isso o lote ficou em duas
migrations consecutivas: `20260815130000_foto_credito_schema_publico.sql` e
`20260815130100_foto_credito_backfill.sql`. O backfill continua integralmente em
migration e tem allowlist nominal para os 161 alvos.

DOM provado no preview local com metadado oficial de Lula:

- Caption dentro do `figure`, com `data-pf-photo-credit="wikimedia_commons"`.
- Segunda linha no `ProfileSourceFooter` com o mesmo marcador.
- Nos dois pontos: `Foto: Ricardo Stuckert/PR`, link para a página do arquivo no
  Commons e link `CC BY 2.0` para a licença.
- O fixture foi usado somente para a prova local porque a migration ainda não
  foi aplicada. Ele foi removido antes dos gates. O caso nulo continua sem DOM.

## Task 2, ISR e CSP

A limpeza ficou suspensa porque dois p95 passaram do limite de 800 ms. Nenhum
export de ISR ou comentário de página foi alterado.

| Rota | p50 | p95 |
|---|---:|---:|
| `/` | 98,3 ms | 166,3 ms |
| `/candidato/lula` | 114,2 ms | 158,7 ms |
| `/candidato/eduardo-paes` | 123,3 ms | 1.379,3 ms |
| `/candidato/acm-neto` | 132,2 ms | 1.320,0 ms |
| `/quiz` | 101,2 ms | 150,7 ms |
| `/rankings` | 117,3 ms | 189,4 ms |

Hoje não há ISR de página ativo: o nonce por request e `headers()` mantêm essas
rotas dinâmicas, deixando os exports inertes. O diff entre as tabelas de rotas
dos builds inicial e final foi vazio. A amostra warm independente informada pelo
Thiago ficou entre 0,13 s e 0,42 s, então o p95 alto observado é cauda fria. A
decisão maior, cache de página versus CSP com nonce, sai deste lote e fica na
fila do Thiago.

## Task 3, watchdog de cron

O dry-run read-only encontrou exatamente duas anomalias e não criou label,
issue ou comentário:

- `Ingestão de dados`, `cancelled`, run
  [31574857413](https://github.com/thiago-salvador/puxa-ficha-oss/actions/runs/31574857413).
- `Link-check das fontes`, `failure`, run
  [31378229443](https://github.com/thiago-salvador/puxa-ficha-oss/actions/runs/31378229443).

Cada issue usa marcador oculto por arquivo de workflow, portanto uma nova
detecção comenta na issue aberta em vez de duplicar. Workflow sem run só vira
anomalia depois de oito dias da criação. Uma última execução concluída com oito
dias ou mais também vira anomalia, mesmo quando terminou com sucesso. `Re-run de
patrimônio` estava em 3 de 8 dias e foi ignorado. O próprio watchdog não se
fiscaliza. A limitação de inatividade de 60 dias dos scheduled workflows e a
mitigação por monitoramento do repositório ficaram documentadas no YAML.

## Task 5, acervo encerrado e revalidate

O recibo exigido em `verificacao_campos.acervo_legislativo_congelado` é por Casa
e só congela quando contém `estado: "congelado"`, `verificado_em` em data ISO e
`contagens` não vazio com inteiros não negativos. Marca booleana, incompleta ou
da outra Casa não pula o candidato. Falha ao ler `verificacao_campos` interrompe
o ingest antes da fonte externa.

O override `--force-frozen` e os timeouts locais só são aceitos junto de
`--slugs`. Comandos preparados para a integração, não executados neste lote:

```bash
PF_CAMARA_CANDIDATE_TIMEOUT_MS=1200000 \
  npx tsx scripts/ingest-all.ts camara \
  --slugs=patrus-ananias --force-frozen

PF_SENADO_CANDIDATE_TIMEOUT_MS=600000 \
  npx tsx scripts/ingest-all.ts senado \
  --slugs=wellington-fagundes --force-frozen
```

Depois de cada resultado sem erro, a integração deve medir as contagens reais e
gravar, por operação auditada, somente o ramo correspondente:

```json
{
  "acervo_legislativo_congelado": {
    "camara": {
      "estado": "congelado",
      "verificado_em": "<data-do-readback>",
      "contagens": { "<tabela>": "<inteiro medido>" },
      "run_url": "<url-da-execucao>"
    }
  }
}
```

Para Wellington, usar `senado` no lugar de `camara`. Os placeholders existem
porque este lote não executou a carga e não pode inventar contagens. O job
`Revalidar cache público` agora roda com `if: ${{ !cancelled() }}`. O REST
continua vermelho quando falha; a revalidação apenas publica as escritas que já
chegaram ao banco.

## Provas finais

- `npm run lint`: passou.
- `npx tsc --noEmit`: passou.
- `npx tsc --project tsconfig.scripts.json --noEmit`: passou.
- `npm run check:dead-code`: passou.
- `npm test`: 3.158 testes, 3.158 passaram.
- `npm run build`: passou; tabela de rotas idêntica ao baseline.
- `actionlint` nos dois workflows alterados: passou.
- Replay de schema: 78 aplicadas, 330 puladas, zero falha, hash
  `dd87ee144716341de7b77d9dac41b0ee3067591f9e9d32b1a7305f839bb7632f`.
- Replay linear: 305 aplicadas mais 103 falhas históricas conhecidas, total 408,
  conjunto idêntico ao manifesto.
- Gate de allowlist: 162 anotações do recorte de fotos cobertas.

## Conexões não-pedidas

O ajuste de revalidate e o watchdog formam o mesmo circuito operacional: o
primeiro não perde as 13 mil linhas já gravadas quando o REST termina parcial; o
segundo impede que o exit vermelho honesto volte a ficar invisível por dias.
