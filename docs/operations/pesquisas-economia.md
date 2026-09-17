# Rotina de pesquisas com execução por diferenças

O código faz descoberta, inventário de arquivos, cálculo de hashes e comparação
com recibos. Os modelos recebem apenas as evidências novas ou as etapas que
continuam pendentes. Nenhum dos comandos abaixo chama modelo, publica catálogo
ou altera o banco.

## Descoberta periódica

Com Node 24, execute na raiz do checkout:

```sh
npm run pesquisas:economia:descoberta -- \
  --state .artifacts/pesquisas-economia/google-state.json \
  --out .artifacts/pesquisas-economia/discovery
```

O script consulta o RSS do Google Notícias para presidente e as 27 UFs. Leia
primeiro `discovery/summary.json`. `discovery-queue.json` separa links novos,
alterados e pendências antigas; os XMLs ficam em `discovery/raw`. Uma manchete é
apenas uma pista: não comprova percentual, registro, identidade ou cobertura
completa. Links podem repetir a mesma pesquisa ou tratar de outro cargo.

O cursor é por geografia, com dois dias de sobreposição. Na primeira execução,
a consulta cobre 14 dias; a revisão prioriza os últimos três, depois sete e
quatorze dias. Falha de coleta não avança o cursor da geografia afetada. Um feed
válido sem resultados não comprova que nenhuma pesquisa foi divulgada. A busca
nominal e as alternativas de `pesquisas-busca-semanal.md` continuam obrigatórias
quando houver lacunas acionáveis. O RSS não detecta toda correção silenciosa de
uma matéria: fontes com revisão pendente e os adaptadores do monitor diário
continuam exigindo consulta à publicação original.

O workflow `pesquisas-descoberta-economica.yml` agenda essa descoberta às
segundas e quintas, 08h de São Paulo, antes da revisão das 09h no Codex. Ele usa
somente scripts, cache e artefatos. A perda do cache provoca nova descoberta,
sem inventar recibos de conclusão. A programação do arquivo só passa a valer
quando estiver integrada à branch padrão do GitHub.

## Aproveitar o trabalho desta tarefa

```sh
npm run pesquisas:economia:preflight -- \
  --evidence QA/evidencias/2026-09-17-pesquisas \
  --out .artifacts/pesquisas-economia
```

O preflight liga os catálogos às capturas já existentes, verifica seus hashes e
gera `manifest.json`, `state.json` e `queue.json`. Usa o arquivo original quando
ele existe; não baixa nem transcreve novamente. Se o catálogo aponta para uma
captura ausente ou divergente, registra a falha. `structured_summary` permanece
resumo, mesmo quando o arquivo possui hash correto. Os campos de resultados e
o contexto do catálogo têm hashes próprios: corrigir a extração invalida a
revisão anterior, mesmo que a fonte continue igual.

Os recibos distinguem `capture`, `extract` e `review`. Uma captura disponível
não prova que a extração está correta. O script não importa automaticamente
aprovações descritas em relatórios antigos. Depois de executar e comprovar uma
etapa, registre o recibo pela interface `acknowledge` de `incremental.ts`, usando
o manifesto e a identidade/fingerprint atuais; a ferramenta recusa recibo
obsoleto. O recibo de revisão exige autoria do julgamento e evidência literal.
As decisões devem permanecer vinculadas à versão da fonte, extração e política.

## Roteamento e encerramento

1. Scripts verificam os estados e executam os parsers existentes. Material já
   aprovado e sem mudança não volta aos modelos.
2. Jev em sombra avalia as ambiguidades tipadas de identidade, relevância ou
   correspondência da extração. Use o CLI e as perguntas versionadas existentes;
   guarde estado, critérios e resposta. Cache só vale para a mesma pergunta,
   política, identidade e evidência. Jev não autoriza publicação.
3. Luna recebe um lote delimitado de fontes novas que o parser não resolveu,
   ou uma correção com diagnóstico fechado. Retorna os campos e as referências,
   sem despejar documentos completos no contexto principal.
4. O modelo principal confere os resultados candidatos à publicação contra a
   fonte e decide as exceções. Não confunde resumo com captura nem comparação
   entre duas transcrições com verificação independente.
5. Execute os testes afetados. Publique cada pesquisa validada pelo fluxo já
   autorizado, sem esperar a resolução das demais. Confirme SHA e números
   públicos antes de registrar publicação.

Ausência de novidades encerra a coleta sem chamada a modelos no script. Uma
tarefa agendada do Codex ainda inicia um modelo; esse custo não desaparece por
reescrever o prompt. A tarefa deve consumir primeiro o resumo do artefato do
GitHub e reaproveitar os recibos locais. Se o artefato não existe, está antigo
ou tem falha, execute a descoberta local. Não refaça uma busca saudável já
realizada na mesma rodada. Pendências sem mudança continuam registradas; nova
tentativa precisa de uma pista nova, de tentativa de reparo ainda não feita ou
de vencimento documentado da espera.

Os prompts das outras tarefas preservam seus comandos, escopos e autorizações,
aplicando a mesma ordem: script, diferença, julgamento, extração e revisão.
Isso não converte automaticamente tarefas de outros projetos em processos sem
modelo. Não há contratação de API nem serviço novo neste fluxo.

## Verificação

```sh
npm run test:pesquisas:economia
npm run check:scripts
```

Os testes cobrem repetição, revisão pendente, invalidação por conteúdo e versão,
recibo obsoleto, resumo, arquivo ausente e falha parcial de descoberta. Capturas
integrais de artigos e PDFs ficam locais; não incluir esses arquivos em uma PR
pública. Publique apenas código, catálogos autorizados e recibos factuais mínimos.
