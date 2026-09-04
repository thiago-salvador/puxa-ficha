# Coorte pública para sanções

`loadCandidatosPublicosMinimos()` lê somente `slug,nome_completo` de
`candidatos_publico`, em páginas ordenadas com prazo total de 30 segundos.
O seed não participa dessa seleção. CPF, identificadores TSE e metadados de
mandato não são retornados pelo loader.

Em sanções, `PF_INGEST_SLUGS=a,b` é validado contra a coorte pública inteira:
um slug público fora do seed funciona; qualquer slug não público ou item vazio
na lista aborta antes da coleta. Variável ausente ou vazia significa toda a
coorte. Falha de banco, página repetida ou linha inválida também aborta.

O runner `dry-run-coletas.ts --coleta=sancoes` usa a mesma seleção imutável no
universo declarado e na execução. O argumento interno do coletor só aceita uma
coorte emitida pelo loader. `--roster=<arquivo>` mantém seu comportamento de
diagnóstico de universo local, sem iniciar coleta.

Os guards existentes continuam sendo aplicados pelo coletor: reconsulta de
identidade no banco, CPF com checksum válido, documento compatível na resposta
e nome compatível quando o documento é mascarado. O loader não implementa
congelamento editorial nem dá um novo veredito sobre sanções. Sem chave CGU,
o coletor registra erro por selecionado e retorna zero resultados processados;
isso não significa universo vazio nem ausência confirmada de sanção.

## Comparação somente leitura

Execute no worktree, com Node 24 e o arquivo de ambiente já existente. O caminho
do arquivo é fornecido ao Node; as credenciais não são copiadas nem impressas.

```bash
node --env-file=/caminho/privado/.env.local \
  --import tsx scripts/audit/comparar-coorte-sancoes.ts
```

O auditor só lê a view pública e o seed local, imprime agregados e ignora
`PF_INGEST_SLUGS` para medir a coorte inteira. Não precisa de
`TRANSPARENCIA_API_KEY`, não consulta CGU, não lê CPF e não executa ingestão.

Medição em 2026-09-04T21:25:12.935Z: 209 públicos, 164 na interseção antiga
seed/públicos e 45 públicos fora do seed. Essa diferença amplia em 45 fichas o
escopo de uma futura coleta de sanções. Ela não atesta sanção, ausência de
sanção, coleta realizada ou permissão para executar a coleta.

Os demais consumidores de `helpers-db.ts`, o seed, os resolvers TSE, os
históricos e as migrations permanecem fora desta mudança.

## Verificação local

```bash
node --import tsx --test tests/candidatos-publicos-minimos.test.ts tests/ingest-transparencia-sanctions.test.ts tests/dry-run-fail-closed.test.ts tests/dry-run-coletas-args.test.ts
npm run check:scripts
npm run lint
npm test
git diff --check
```

Os testes usam servidores locais para provar paginação além de 1000 candidatos,
recorte fora do seed, recusa de slug não público, erros de banco, cancelamento,
reutilização da mesma coorte e os guards de identidade, sem coleta externa.
