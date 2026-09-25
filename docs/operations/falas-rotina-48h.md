# Falas: busca completa a cada dois dias e publicação contínua

## Contrato vigente

Thiago determinou em 21/09/2026: citações aprovadas devem chegar ao site, todos os
presidenciáveis e candidatos a governador devem ser pesquisados, e a rotina deve
rodar a cada dois dias. Não é necessário encontrar fala de todos. É obrigatório
registrar a busca de cada integrante do cadastro público atual, mesmo que já tenha
aspa histórica ou recente. Senado não integra esta rotina.

A autorização inclui publicar as citações verificadas pelo fluxo normal de PR,
CI, merge e deploy, com autoria de Thiago. Não inclui publicar atribuição ou data
incerta, mudar políticas de segurança, escrever no banco ou contratar serviços.
Pendência de um candidato não impede a publicação das citações aprovadas de outros.

O heartbeat `falas-de-presidenci-veis-e-governadores` é o agendador único, a cada
dois dias às 08h17 de São Paulo. O workflow GitHub `falas-monitoramento.yml` fica
disponível como complemento manual, sem agenda ou fila separada de PRs em rascunho.
Não usar cron de dia do mês `*/2`, pois a virada do mês quebra o intervalo.

## Execução econômica

1. Usar Node 24 e o checkout canônico. Verificar branch, alterações alheias e PRs
   abertos da rotina antes de começar. Reutilizar a rodada interrompida e sua fila
   de publicação, sem descartar evidências nem sobrescrever trabalho concorrente.
2. Registrar o início da rodada e atualizar o cadastro com
   `npm run monitor:falas:cadastro`. Esse modo lê a visão pública sem executar a
   coleta de editorias. Depois rodar `npm run plan:falas` e executar primeiro
   `reports/falas-monitoramento/plano-economico.json`; o plano recorrente completo
   guarda as variantes para fallback. A janela de falas é
   hoje e os 13 dias anteriores em São Paulo. Não usar a data de coleta como data
   do evento nem aceitar falas anteriores à campanha de 16/08/2026.
3. Luna executa busca e extração. Consultar Perplexity por lotes pequenos de uma
   mesma UF ou Presidência, exigindo resposta individual por ID e slug. Começar
   com uma consulta ampla por candidato que cubra entrevistas, debates, sabatinas
   e declarações em campanha. A lista de variantes do plano é fallback, não uma
   ordem para executar todas as combinações. Sem resposta individual, aquele
   candidato permanece pendente. Para retorno insuficiente, consultar Google e
   fontes regionais; registrar provedor real, query enviada, horário e URLs.
4. Candidato com resposta explícita sem resultados conta como pesquisado, mas não
   como prova de inexistência de fala. Bloqueio/captcha, consulta planejada,
   resposta genérica do lote e recibo de rodada antiga não contam como busca
   concluída. Retomar só os nomes pendentes; nunca pular nomes por já terem aspa.
5. Reutilizar HTML/transcrição pelo hash de conteúdo, identidade, URL e versão de
   parser/política. Nova busca atual é obrigatória; um cache antigo não prova
   atualidade. Não baixar nem transcrever de novo uma fonte inalterada. Comparações
   exatas e contagens ficam em código. Só evidências novas exigem nova análise.
6. Jev opera em sombra para identidade, literalidade, contexto e data ainda não
   resolvidos, com state completo e perguntas tipadas em lote. Reutilizar perguntas
   e resultados anteriores válidos. Astra revisa as diferenças e ambiguidades no
   original. Probabilidade do Jev não aprova publicação. Fala com prova insuficiente
   fica pendente com motivo, sem bloquear as demais.
7. Importar aprovadas com `review:falas`, guardar fonte original e executar replay
   offline. Não aceitar um comando com exit zero como prova de importação: conferir
   recibos por aspa, IDs novos e motivos de rejeição. Backfill só para preencher
   ausência de aspa, dentro da campanha; não é justificativa para ignorar a busca
   recorrente de todos os nomes.

## Dois resultados independentes

**Busca:** auditar o cadastro atualizado contra os recibos da rodada:

```bash
npm run audit:falas:rodada -- \
  --roster reports/falas-monitoramento/roster.json \
  --receipts reports/falas-monitoramento/rodada-atual/recibos.json \
  --round-start "$INICIO_DA_RODADA_ISO" \
  --catalog scripts/data/falas-candidatos.json \
  --export-site scripts/data/falas-recibos.json
```

O início identifica a rodada real, não uma data escolhida para aceitar recibos
antigos. Consulte `--help` para os argumentos. Arquivar o resumo com
total, pesquisados, sem resultado, bloqueados e faltantes.

`--export-site` atualiza o recibo público versionado que o site lê para dizer
"busca feita em <data>, nenhuma fala com aspas conferida" nas fichas sem aspa.
Só entra busca válida; bloqueio ou busca planejada não viram recibo. O arquivo
vai no mesmo PR do catálogo de falas.

O resumo também traz `found` e `found_without_quote`: recibo `found` promete
aspa explícita na fonte, então cada `found` sem aspa publicada na janela precisa
de destino (aspa importada ou recusa registrada nas pendências). Com
`--require-found-quote` a auditoria sai 1 enquanto houver algum. Se faltar um nome,
continuar apenas essa busca. Um bloqueio real deve ser reportado como rodada
parcial, nunca como ausência de novidades. Revalidar o cadastro ao concluir e
pesquisar inclusões ou identidades alteradas antes de declarar cobertura completa.

**Publicação:** fechar o lote aprovado na mesma execução, preservando citações
anteriores e a identidade exata `candidate_id + candidate_slug`. Reutilizar PR da
mesma rodada; não deixar rascunho como entrega final. Rodar os testes de falas,
checagem de tipos dos scripts e app, lint e build conforme as mudanças; conferir
os checks obrigatórios do SHA corrente, fazer merge pelo fluxo normal e aguardar
o deploy. Não contornar proteção de branch ou checks. Se houver falha, manter uma
fila explícita com PR/SHA, causa e etapa de retomada, e notificar o bloqueio.

Confirmar o SHA em `/api/deployment-info` e abrir as fichas afetadas para verificar
as novas aspas por ID, texto literal, data e link. A rotação da ficha pode esconder
a nova aspa inicialmente: percorrer as citações. PR aberto, CI verde, merge ou
Vercel READY isolados não provam entrega no site. Não escrever no Supabase para
publicar este catálogo versionado.

A prova reproduzível do lote é `tests/visual/falas-publicacao.spec.ts`. Executar
com `PF_BASE_URL=https://puxaficha.com.br`, `PF_EXPECTED_DEPLOY_SHA` igual ao merge
publicado e `PF_FALAS_QUOTE_IDS` contendo os IDs novos separados por vírgula:
`npx playwright test tests/visual/falas-publicacao.spec.ts --project=desktop`.
Ela confere o SHA, percorre a rotação, valida texto/data/fonte e captura cada card.

## Recibo e custo

Guardar no diretório da rodada: cadastro, início/fim, recibos individuais,
evidências novas, auditoria, IDs aprovados/rejeitados, PR, SHA e prova pública.
Medir consultas por provedor, fontes novas versus reutilizadas, chamadas Jev,
lotes Luna, exceções revisadas e testes executados. Não estimar economia em reais
ou tokens sem medição. Silêncio quando nada mudou e a busca foi completa; avisar
novas publicações, mudança material de cobertura, falha ou decisão necessária.
Ausência de publicação com aspas aprovadas é falha de entrega, não sucesso local.
