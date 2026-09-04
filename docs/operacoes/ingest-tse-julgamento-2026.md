# Julgamento TSE 2026

O comando dedicado `scripts/ingest-tse-julgamento.ts` atualiza somente `candidatos.situacao_candidatura`. O ingest `tse-situacao` de CPF/demografia continua disponível com seu comportamento histórico, exceto pela recusa de inferir julgamento quando a fonte complementar está ausente.

## Reconciliação e dry-run

Use Node 24 e as credenciais Supabase no ambiente. Os comandos abaixo são somente leitura no banco. O diretório precisa ficar fora do checkout: contém identidade, CPF e os pacotes oficiais. Não anexar esses arquivos à PR.

```sh
PF_JULGAMENTO_DIR="$(mktemp -d /tmp/pf-julgamento-XXXXXX)"
node --import tsx scripts/audit/reconciliar-situacao-julgamento.ts --snapshot-dir="$PF_JULGAMENTO_DIR"
node --import tsx scripts/ingest-tse-julgamento.ts --dry-run --snapshot-dir="$PF_JULGAMENTO_DIR"
```

A primeira execução captura a coorte da view pública, identidades internas, seed, bloqueios editoriais e os dois pacotes oficiais. A segunda relê esse snapshot sem consultar outra versão da fonte. O checksum abrange a coorte e o conteúdo capturado; os ZIPs e CSVs também têm hashes verificados no replay. Os relatórios informam geração da fonte, antes/depois, âncora de identidade e motivo de cada bloqueio.

Aceitação: as listas `entries` de `reconciliacao.json` e `dry-run.json` são iguais, o hash é igual e `coorte = conferem + propostos + bloqueados`. Não existe contagem esperada fixa. Candidatos publicados ausentes do seed entram normalmente pelo SQ persistido, validado contra a identidade oficial do mesmo ano e eleição. Nome nunca se transforma em SQ. Ausência de fonte, conflito DB/seed/fonte, identidade bloqueada, SQ duplicado e código não suportado preservam a situação existente. RENUNCIA/CANCELADO não provocam decisão de publicação.

`PF_INGEST_SLUGS=slug1,slug2` permite um recorte, validado contra a coorte pública. Mantenha o mesmo recorte na captura, dry-run e aplicação. Um recorte incompatível com o snapshot aborta; o CLI nunca amplia silenciosamente para toda a coorte.

## Aplicação deliberada

Aplicação exige autorização separada e revisão do snapshot. O comando abaixo é a ação de escrita, não foi executado na validação da PR. Substitua `HASH_REVISADO` pelo `snapshot_sha256` exato que foi revisado:

```sh
node --import tsx scripts/ingest-tse-julgamento.ts \
  --snapshot-dir="$PF_JULGAMENTO_DIR" \
  --expect-snapshot=HASH_REVISADO \
  --apply
```

Antes de escrever, o script verifica projeto, seed, bloqueios, composição da coorte e identidade atual. Cada PATCH condiciona a atualização ao ID, SQ, identidade, publicação e situação anterior. Mudança concorrente aborta. A escrita passa por `escreverAuditado`, com o hash no `coleta_log`, e faz readback imediato. O recibo privado registra tentativas, escritas confirmadas, já aplicados, readbacks e falha. Se falhar no meio, o lote não é transacional: confira o recibo e o banco antes de retomar. Uma tentativa sem readback confirmado exige inspeção, mesmo que o processo tenha encerrado com erro. Reaplicar o mesmo snapshot pula situações já corretas, confirma-as por leitura e não repete PATCH nem recibo de escrita.

## Publicação e readback

Um recibo de banco não comprova atualização do site. Após aplicação autorizada e readback, a revalidação canônica de cache é outra ação externa:

```sh
gh workflow run revalidate-cache.yml --ref main -f tags=all
```

Confirme o resultado do run e reabra as fichas públicas afetadas, comparando situação e rótulo com `depois` do snapshot aprovado. Não use o resultado do dry-run como prova de produção. Nenhuma migration, merge, deploy ou alteração de profissão é necessária para este comando. Se a validação editorial de um bloqueio exigir corrigir identidade ou ampliar o vocabulário, trate essa decisão separadamente e capture um novo snapshot.
