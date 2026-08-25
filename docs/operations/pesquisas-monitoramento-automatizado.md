# Monitoramento automatizado de pesquisas eleitorais

## Limite de seguranca

O monitor descobre e coleta evidencia candidata, mas nunca publica. O modo unico e dry-run. Ele nao abre cliente Supabase, nao recebe secrets, nao executa Git ou GitHub e so grava `proposal.json`, `diff.json` e `summary.md` no diretorio de relatorios.

Conteudo externo e sempre dado nao confiavel. O adaptador remove scripts, estilos, templates, comentarios e outros blocos executaveis antes de extrair texto. Nenhuma instrucao encontrada em pagina, CSV, robots ou resposta de erro altera o fluxo.

## Contratos e adaptadores

- Os dois scorecards versionados continuam sendo a autoridade para status e URLs.
- O primeiro adaptador de divulgacao aceita somente `poderdata-aya-nacional-2026`, que esta `aprovado` e possui pagina publica HTTPS.
- O adaptador de registro descobre o ZIP diario no portal oficial do TSE, extrai o CSV sem dependencia nova e cruza registro, cargo, geografia, campo e amostra. Quando o CSV trouxer margem, ela tambem precisa coincidir.
- Uma fonte nova exige status `aprovado`, origem publica allowlisted, fixture, golden case e PR proprio para adicionar adaptador.
- O cliente HTTP consulta `robots.txt`, bloqueia origens fora da allowlist, usa timeout de 12 segundos, no maximo tres tentativas, intervalo minimo de um segundo e limite de 2 MB.

O TSE publica o [conjunto diario de pesquisas eleitorais de 2026](https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026). Se o recurso oficial ou o PesqEle estiver indisponivel, a rodada fica `fonte indisponivel` ou `conflitante`. O monitor nao completa metadados pela divulgacao e nao transforma o registro em endosso do resultado.

## Saidas

- `proposal.json`: evidencia observada, decisao e objeto normalizado ainda `indeterminado`.
- `diff.json`: operacoes novas ou alteradas para leitura, com `applies_automatically: false`.
- `summary.md`: contagens por classificacao e quantidade elegivel para revisao.

As classificacoes sao `novo`, `alterado`, `inalterado`, `vencido`, `conflitante`, `fonte indisponivel` e `identidade nao resolvida`. So `novo` e `alterado` que passam fonte, registro, identidade e recencia ficam elegiveis para revisao humana. Elegivel nao significa publicavel.

## Execucao manual

No GitHub Actions, use `Monitoramento de pesquisas eleitorais` e informe uma `source_id` aprovada. `uf` e opcional; `BR` diagnostica a fonte presidencial. O workflow tem somente `workflow_dispatch`, permissao `contents: read`, nenhum secret e retencao de 14 dias.

Localmente, o comando equivalente e:

```bash
npm run monitor:pesquisas -- --source=poderdata-aya-nacional-2026 --uf=BR --out=.artifacts/pesquisas-monitoramento
```

## Revisao e promocao

1. Baixe o artefato e leia primeiro `summary.md`.
2. Para cada item novo ou alterado, reabra a URL publica e o registro TSE. Compare instituto, codigo, cargo, geografia, campo, amostra, margem, cenario e cada percentual.
3. Confirme que o SHA-256 corresponde a evidencia observada e que aliases continuam literais no mesmo escopo.
4. Rejeite fonte condicional, conflito, dado vencido, identidade nao resolvida ou qualquer metadado ausente.
5. Crie outra branch a partir do `origin/main` atual. Copie manualmente apenas itens aprovados para o catalogo e ajuste o estado de publicacao nesse PR separado.
6. Rode `npm run verify:pesquisas`, revise o diff e abra o PR de dados. O artefato deste workflow nunca e aplicado diretamente.

## Agendamento

Nao ha agendamento nesta entrega. Depois de ao menos um run manual completo no GitHub Actions, com artefato baixado e revisado, um PR separado pode propor cron. Esse PR precisa preservar dry-run, artefato, revisao humana e ausencia de secrets ou escrita remota.
