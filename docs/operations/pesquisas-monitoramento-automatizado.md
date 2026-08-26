# Monitoramento automatizado de pesquisas eleitorais

## Limite de segurança

O monitor coleta evidência candidata, mas nunca publica. O modo único é dry-run. Ele não abre cliente Supabase, não recebe secrets, não executa Git ou GitHub e só grava `proposal.json`, `diff.json` e `summary.md` no diretório de relatórios.

Conteúdo externo é sempre dado não confiável. O adaptador remove scripts, estilos, templates, comentários e outros blocos executáveis antes de extrair texto. Nenhuma instrução encontrada em página, CSV, robots ou resposta de erro altera o fluxo.

## Contratos e adaptadores

- Os dois scorecards versionados continuam sendo a autoridade para status e URLs.
- O registro de adaptadores é calculado pela interseção entre fonte `aprovado` e fonte efetivamente usada em um catálogo.
- Existem quatro adaptadores explícitos: PoderData nacional, Datafolha nacional, Datafolha estadual e Real Time Big Data estadual. Fontes condicionais ou excluídas não possuem adaptador.
- Cada adaptador mantém sua própria allowlist. Real Time Big Data aceita somente os seis veículos públicos já usados no catálogo estadual.
- O adaptador de registro descobre o ZIP diário no portal oficial do TSE, extrai o CSV sem dependência nova e cruza registro, cargo, geografia, campo, amostra, margem e instituto.
- O cliente HTTP consulta `robots.txt`, bloqueia origens fora da allowlist, usa timeout de 12 segundos, no máximo três tentativas, intervalo mínimo de um segundo e limite de 2 MB para páginas. O ZIP oficial do TSE tem teto separado de 20 MB.

O TSE publica o [conjunto diário de pesquisas eleitorais de 2026](https://dadosabertos.tse.jus.br/dataset/pesquisas-eleitorais-2026). Se o recurso oficial ou o PesqEle estiver indisponível, a rodada fica `fonte indisponivel` ou `conflitante`. Evidência já observada permanece no `proposal.json`, mas nunca fica elegível sem o cruzamento oficial.

## Saídas

- `proposal.json`: evidência observada, decisão e objeto normalizado ainda `indeterminado`.
- `diff.json`: operações novas ou alteradas para leitura, com `applies_automatically: false`.
- `summary.md`: contagens por classificação e quantidade elegível para revisão.

As classificações são `novo`, `alterado`, `inalterado`, `vencido`, `conflitante`, `fonte indisponivel` e `identidade nao resolvida`. Só `novo` e `alterado` que passam fonte, registro, identidade e recência ficam elegíveis para revisão humana. Elegível não significa publicável.

## Execução manual

No GitHub Actions, use `Monitoramento de pesquisas eleitorais`. `source_id` aceita uma das quatro fontes ou `all`; `uf` aceita uma UF, `BR` ou `all`. A combinação dos filtros gera um único artefato consolidado. O workflow tem somente `workflow_dispatch`, permissão `contents: read`, nenhum secret e retenção de 14 dias.

Para uma fonte e uma geografia:

```bash
npm run monitor:pesquisas -- --source=poderdata-aya-nacional-2026 --uf=BR --out=.artifacts/pesquisas-monitoramento
```

Para todas as 18 combinações atuais:

```bash
npm run monitor:pesquisas -- --source=all --uf=all --out=.artifacts/pesquisas-monitoramento
```

## Prova real local

Em 26 de agosto de 2026, os quatro adaptadores foram executados isoladamente com `--live-check`. PoderData e Real Time Big Data extraíram evidência pública completa, mas o portal de dados abertos do TSE respondeu HTTP 403 ao `robots.txt`; o cruzamento oficial permaneceu bloqueado. As duas páginas Datafolha falharam fechadas antes disso: a nacional não expôs campo e confiança de forma suficiente, e a estadual não identificou explicitamente o turno do cenário principal.

O registro estruturado está em `docs/operations/pesquisas-monitoramento-live-proof.json`. Nenhum adaptador está comprovado end-to-end enquanto esses bloqueios persistirem.

## Revisão e promoção

1. Baixe o artefato e leia primeiro `summary.md`.
2. Para cada item novo ou alterado, reabra a URL pública e o registro TSE. Compare instituto, código, cargo, geografia, campo, amostra, margem, cenário e cada percentual.
3. Confirme que o SHA-256 corresponde à evidência observada e que aliases continuam literais no mesmo escopo.
4. Rejeite fonte condicional, conflito, dado vencido, identidade não resolvida ou qualquer metadado ausente.
5. Crie outra branch a partir do `origin/main` atual. Copie manualmente apenas itens aprovados para o catálogo e ajuste o estado de publicação nesse PR separado.
6. Rode `npm run verify:pesquisas`, revise o diff e abra o PR de dados. O artefato deste workflow nunca é aplicado diretamente.

## Agendamento

Não há agendamento nesta entrega. Um PR separado só pode propor cron depois de um run manual completo e revisado, preservando dry-run, artefato, revisão humana e ausência de secrets ou escrita remota.
