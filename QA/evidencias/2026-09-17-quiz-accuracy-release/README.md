# Correção da acuracidade do quiz

O quiz compara evidências documentais e mantém a lista alfabética. A versão 4 remove inferências de afinidade por partido, quantidade de projetos ou setor de doadores. A importância dobra o peso da pergunta comparável; ausência, abstenção e “sem opinião” não viram posição de centro. Voto nominal tem precedência sobre declaração para evitar contar a mesma pergunta duas vezes. Evidências conflitantes não recebem um valor médio fictício.

As perguntas agora delimitam pessoa, política, esfera e período. Links anteriores pedem novas respostas. Perguntas sem evidência correspondente informam essa limitação. A metodologia não afirma validação científica nem recomenda candidatos.

## Dados aplicados

- 28 posições perderam `verificado=true`, preservando fonte, texto e posição original. CAS inclui o hash da descrição auditada. `quarantine-applied.json` contém o antes/depois.
- O guard privado `quiz_position_quarantine` bloqueia reativação automática das mesmas 28 tuplas. RLS ativo, sem acesso dos papéis públicos. Uma tentativa de reativação foi rejeitada pelo trigger em transação revertida; readback confirmou 28 posições protegidas.
- 64 votos da Câmara foram acrescentados: 16 trabalhista, 15 teto, 13 previdência, 12 Eletrobras e 8 autonomia do BC. IDs oficiais de parlamentar e evento são usados no vínculo; não há casamento aproximado por nome.
- Foram criadas quatro referências nominais e corrigida a proposição da referência existente da Eletrobras. A primeira aplicação parou após 56 votos por colisão do título BC com a referência do Senado; a repetição idempotente inseriu apenas os oito restantes com título que identifica a Câmara.
- `votes-applied.json` confirma os pares de votos e as cinco referências após a aplicação. Seu `missing_to_insert=8` corresponde à segunda passagem; os 56 anteriores já constam como existentes. Há recibos de todas as escritas em `coleta_log`.
- O loader conecta as cinco referências da Câmara e três do Senado por fonte, evento e proposição; cada voto abre a fonte da casa correta. RP9 permanece explicitamente sem evento nominal validado.

## Julgamento TypeSafe e revisão

`jev-nominal-events-payload.json` registra oito decisões novas sobre a natureza de eventos. `jev-nominal-events-result.json` registra modelo, probabilidades, consumo e revisão principal. É execução em sombra; o Jev não autorizou escritas.

Três referências antigas foram rejeitadas porque tratavam de destaque ou redação final. Em duas referências aceitas, a última abertura da API não descrevia o resultado do evento. As divergências foram resolvidas com notícias da Agência Câmara, com matéria e placar correspondentes:

- [Previdência: segundo turno, 370 a 124](https://www.camara.leg.br/noticias/567845-camara-conclui-2o-turno-da-reforma-da-previdencia-texto-vai-ao-senado).
- [Autonomia do BC: texto-base, 339 a 114](https://www.camara.leg.br/noticias/727297-deputados-aprovam-texto-base-do-projeto-de-autonomia-do-banco-central).

Os julgamentos anteriores da auditoria foram reutilizados. Esta rodada não mede uma nova acurácia eleitoral nem certifica automaticamente toda fonte disponível.

## Verificação e reprodução

Os executores de dados usam dry-run por padrão. `--apply` passa pelo helper de escrita auditada, bloqueia conflitos e confere os registros retornados. O reconciliador também verifica colisões de título antes de escrever e salva checkpoints por evento.

Validação local: build de produção, typecheck, lint, checagem de scripts, texto da interface e código sem consumidores passaram. O fluxo real do quiz passou em 20 testes desktop/mobile, com mais 10 testes de resultados após integrar o loader. A revisão visual confirmou legibilidade e ausência de transbordamento. A suíte completa e o replay PostgreSQL 17 precisam passar nos checks finais antes do merge; o ambiente local não disponibilizava o daemon Docker.

O build exigiu extrair duas fábricas de handlers de arquivos de rota para módulos da aplicação. A mudança preserva cache e limitação de requisições e foi conferida por 17 testes; remove apenas exports não aceitos pelo App Router.

A confirmação de Git, deployment Vercel e site público é separada desta evidência local. Consulte o PR e o recibo final de publicação para o SHA efetivamente publicado.

[confidence: alta para as alterações e readbacks descritos; source: testes, APIs oficiais, Supabase e revisão principal desta execução] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
