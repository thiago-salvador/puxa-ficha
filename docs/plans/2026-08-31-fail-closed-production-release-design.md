# Release de produção fail-closed

**Data:** 31 de agosto de 2026

**Status:** aprovado para planejamento e implementação

**Escopo:** GitHub Actions, Vercel, Supabase, smoke tests e auditoria dos deploys anteriores

## Objetivo

Transformar o release de produção em uma transação operacional serializada: nenhum SHA alcança o domínio público sem passar pelos testes completos em um deployment Vercel isolado, e nenhum release libera o próximo merge antes de provar o estado público final. Se a verificação pública falhar depois da promoção, o sistema restaura automaticamente o último deployment verificado, prova a restauração e mantém a fila bloqueada para investigação.

## Não objetivos

- Recriar deploys históricos e chamar essa reprodução de prova do estado que esteve público.
- Fazer rollback automático de banco sem rollback específico, testado e aprovado para a migration envolvida.
- Executar código não confiável de pull request com segredos de produção.
- Tratar sucesso de build, merge, deploy ou relatório como substituto de readback público do SHA exato.
- Ocultar falhas por cancelamento, supersessão de SHA ou promoção manual concorrente.

## Evidência histórica e reparação

As janelas de exposição de versões anteriores são fatos imutáveis. A reparação possível deve:

1. confirmar que todas as correções conhecidas continuam presentes no código atual;
2. verificar o estado público atual da interface, APIs e metadados de deployment;
3. auditar o ledger e os readbacks das migrations no Supabase, além das invariantes dos dados que poderiam ter sido alteradas por releases anteriores;
4. verificar logs da Vercel e sinais de erro da janela disponível;
5. verificar Sentry ou a superfície de observabilidade equivalente, quando acessível;
6. registrar cada resultado como `pass`, `fail` ou `prova indisponível`, sem converter ausência de evidência em sucesso.

Os defeitos históricos já identificados em semântica HTML e smoke tests eram de frontend e validação. Mesmo assim, a auditoria única deve procurar efeitos persistentes de toda a classe de deploys, não apenas repetir os exemplos conhecidos.

## Arquitetura escolhida

### Máquina de estados

Um único lock FIFO cobre o ciclo completo:

```text
queued
  -> premerge_verified
  -> merged
  -> staged_built
  -> staged_verified
  -> promoted
  -> public_verified
  -> closed
```

Estados de falha são explícitos:

```text
staged_failed -> incident_locked
promotion_failed -> incident_locked
public_failed -> rollback_started -> rollback_verified -> incident_locked
rollback_failed -> incident_locked_critical
```

O lock só é liberado em `closed`. Falhas preservam o lock e impedem a entrada do próximo SHA até resolução registrada.

### Gate no deployment isolado

Depois do merge, a Vercel cria um deployment de produção isolado, ainda sem mover o domínio público. O workflow captura a URL imutável e prova que `/api/deployment-info` expõe o SHA esperado.

Os testes completos rodam contra essa URL:

- lançamento e shell principal;
- busca e abertura de fichas;
- Axe nos viewports cobertos;
- pesquisas em desktop e mobile;
- APIs críticas e `/api/deployment-info`;
- invariantes públicas read-only aplicáveis ao release.

O job usa um nome único e estável, por exemplo `Vercel - puxa-ficha: staged-release`. O checkout e a execução que recebem segredos partem do `main` confiável já mergeado, nunca de código arbitrário de um fork.

### Bloqueio de promoção

A Vercel deve ter um Deployment Check obrigatório associado ao job de stage. Enquanto esse check não estiver verde, o deployment não pode receber o alias público. A promoção só acontece para a URL e o SHA que acabaram de ser verificados.

O deployment público verificado anterior é capturado antes do merge e armazenado como candidato de rollback. A fila não aceita outro merge enquanto o release atual estiver entre `premerge_verified` e `closed`.

### Fechamento público

Depois da promoção, o workflow:

1. aguarda o domínio público responder com o SHA exato em `/api/deployment-info`;
2. repete o smoke crítico no domínio canônico;
3. consulta os sinais de runtime e erros 5xx da Vercel durante a janela do release, quando a API permitir prova confiável;
4. publica `Production release closure` como sucesso apenas depois de todas as provas.

Falha ou timeout em qualquer etapa mantém o release aberto e aciona rollback. Não existe sucesso parcial.

### Rollback automático

Se o smoke pós-promoção falhar, o coordenador:

1. pausa a fila;
2. restaura o deployment público anterior, capturado antes do release e já verificado;
3. aguarda `/api/deployment-info` provar o SHA restaurado;
4. repete o smoke público crítico;
5. mantém o slot bloqueado;
6. cria ou atualiza uma issue deduplicada com SHAs, deployments, etapas, evidências e resultado do rollback.

Se a própria restauração falhar, o estado passa a `incident_locked_critical`. O workflow nunca segue para o próximo SHA.

Rollback automático de schema ou dados não faz parte do fluxo genérico. Pull requests com migrations só podem promover quando houver forward, readback e rollback específicos, testados no runner real. Sem evidência de reversibilidade, o release falha fechado antes da promoção.

## Timeouts, cancelamento e concorrência

- O workflow de um release ativo não usa `cancel-in-progress` para apagar evidência.
- Um SHA novo não substitui nem cancela um release aberto.
- Cada transição tem deadline explícito e termina em estado de falha fechado.
- Watchdog e coordenador tratam execução órfã, lock expirado e intervenção manual como incidente, não como liberação silenciosa.
- Promoções manuais ou alterações de alias durante um release causam falha de integridade.

## Segurança e segredos

- Tokens de GitHub e Vercel ficam em secrets do repositório, com o menor escopo possível.
- Logs, artefatos e issues nunca incluem valores de segredos ou URLs de banco com credenciais.
- Operações no Supabase usadas por smoke são read-only. Escritas de migration continuam em um fluxo separado, com readback e rollback próprios.
- A ativação remota exige confirmação nominal antes de criar secrets, configurar checks obrigatórios, alterar variáveis, promover ou executar teste controlado em produção.

## Estratégia de testes

A implementação segue TDD e cobre:

- todas as transições válidas e inválidas da máquina de estados;
- contrato dos workflows e nomes únicos dos checks;
- correspondência entre URL isolada e SHA esperado;
- falha no stage, provando que o alias público não se move;
- falha injetada depois da promoção, provando o rollback automático;
- readback do SHA anterior restaurado e smoke posterior;
- fila bloqueada durante release, rollback e incidente;
- deduplicação da issue de incidente;
- limites de migration e recusa de rollback genérico de banco;
- timeouts, cancelamentos e intervenção concorrente.

Além dos testes unitários e de contrato, a ativação termina com dois exercícios controlados: um no-op que percorre o caminho verde e uma falha deliberada que prova o bloqueio ou rollback real. Esses exercícios só serão executados após confirmação nominal.

## Alternativas consideradas

### Manter smoke somente depois da promoção

Rejeitada porque continua permitindo exposição pública de um SHA defeituoso, mesmo com rollback rápido.

### Usar somente o workflow atual de acessibilidade como Deployment Check

Rejeitada porque ele observa o alias público e exige o SHA já promovido. Torná-lo obrigatório antes da promoção criaria dependência circular.

### Liberar a fila após o merge e observar releases em paralelo

Rejeitada porque perde a relação unívoca entre merge, deployment, smoke, promoção e rollback. Também permite que um SHA posterior esconda ou substitua a evidência do anterior.

### Rollback automático de aplicação e banco em conjunto

Rejeitada como política genérica. Rollback de banco depende da migration, do estado posterior e de readback específico. Automatizar sem essa prova amplia o dano potencial.

## Critérios de aceitação

O desenho estará implementado quando:

1. nenhum release puder promover sem stage completo no SHA exato;
2. a fila permanecer serial até o fechamento público;
3. falha pública provocar restauração automática do deployment anterior e prova do SHA restaurado;
4. falha de rollback bloquear criticamente a fila;
5. migrations sem prova de reversibilidade forem barradas antes da promoção;
6. testes locais e de contrato passarem no Node 24;
7. um exercício remoto verde e um exercício remoto de falha provarem o comportamento real;
8. a auditoria única não encontrar efeito persistente sem correção ou classificação explícita.

## Sequência de ativação

1. implementar código, workflows, testes e documentação em pull request;
2. revisar e verificar localmente no Node 24;
3. criar `MERGE_QUEUE_GH_TOKEN` e `VERCEL_TOKEN` após confirmação nominal;
4. configurar o Deployment Check obrigatório na Vercel após confirmação nominal;
5. definir `SERIAL_MERGE_QUEUE_ENABLED=true` após confirmação nominal;
6. executar release controlado sem mudança funcional após confirmação nominal;
7. executar teste deliberado de falha após confirmação nominal;
8. verificar SHA público, smokes, rollback e estado final da fila antes de declarar o sistema ativo.
