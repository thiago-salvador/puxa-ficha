# Ativação do release fail-closed

## Objetivo e estado atual

Este runbook ativa a fila e o release staged somente depois de o PR de
implementação estar revisado e mergeado. O estado seguro é `enabled: false` na
config e `SERIAL_MERGE_QUEUE_ENABLED` ausente ou `false` no GitHub.

Cada mutação abaixo é uma autorização separada. Não execute em lote com um
"faça tudo" genérico.

## Pré-condições locais

- suíte `tests/merge-queue/*.test.mjs` verde;
- lint, typecheck, `check:scripts`, suíte completa e build verdes em Node 24;
- `actionlint` verde para os workflows;
- auditoria de integridade sem `fail`;
- zero secret no diff;
- branch protegida e PR de implementação revisado.

## Ações remotas ainda não autorizadas

Exigem confirmação explícita que nomeie cada ato:

1. mergear o PR de implementação e iniciar o deploy associado;
2. criar ou atualizar `MERGE_QUEUE_GH_TOKEN`, `VERCEL_TOKEN`,
   `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID`;
3. desligar a atribuição automática dos domínios do ambiente Production do
   projeto `puxa-ficha`;
4. alterar `.github/serial-merge-queue.json` para `enabled: true` e definir
   `SERIAL_MERGE_QUEUE_ENABLED=true`;
5. executar um release controlado sem mudança funcional;
6. executar uma falha deliberada depois da promoção para provar Instant
   Rollback e recuperação.

## Fase 1, publicar sem ativar

1. Mergeie somente o PR da implementação.
2. Confirme que os workflows existem na default branch.
3. Confirme que `enabled` continua `false` e a variável remota não é `true`.
4. Prove que eventos de PR não fazem checkout, setup ou leitura de secrets com
   a fila desligada.

Critério de saída: código publicado e automação inerte.

## Fase 2, credenciais mínimas

1. Configure os quatro secrets obrigatórios.
2. Restrinja o token GitHub ao repositório e às permissões de Actions,
   contents, deployments, issues, pull requests e commit statuses necessárias.
3. Restrinja o token Vercel ao team e projeto exatos.
4. Não adicione URL ou senha do Supabase ao workflow staged.
5. Valide somente presença e escopo, sem imprimir valores.

Critério de saída: preflight consegue consultar as superfícies necessárias e
nenhum segredo aparece em logs.

## Fase 3, stage sem atribuição automática

No projeto Vercel `puxa-ficha`, ambiente Production:

1. mantenha `main` como Production Branch;
2. desligue `Auto-assign Custom Production Domains`;
3. confirme que um push cria deployment Production em estado Staged e não
   altera `puxaficha.com.br`;
4. mantenha o status `Vercel - puxa-ficha: staged-release` somente como
   evidência da fila, nunca como seletor implícito de deployment;
5. confirme que o token Vercel pode inspecionar e promover somente o projeto
   esperado.

Critério de saída: um deployment Production pode ficar `READY` em URL
`.vercel.app` enquanto `puxaficha.com.br` continua no SHA anterior.

Essa configuração segue o fluxo oficial de staged production build da Vercel:
<https://vercel.com/docs/cli/deploying-from-cli#deploying-a-staged-production-build>.

## Fase 4, ativar os dois locks

1. Abra um PR isolado alterando somente `enabled` para `true`.
2. Revise e mergeie esse PR com a autorização nominal correspondente.
3. Defina `SERIAL_MERGE_QUEUE_ENABLED=true`.
4. Observe a primeira reconciliação sem owner e confirme ausência de erro.

Critério de saída: fila apta a selecionar um PR, ainda sem declarar o release
validado.

## Fase 5, release controlado verde

Use um PR sem mudança funcional e acompanhe o mesmo SHA em todas as superfícies:

1. o owner recebe `active` e passa pelo pre-merge;
2. o merge produz o dispatch completo;
3. o candidato fica `READY` sem alias público;
4. produção continua no predecessor durante o smoke staged;
5. `Vercel - puxa-ficha: staged-release` fica verde no SHA candidato;
6. o workflow promove explicitamente o deployment ID testado;
7. `Production release closure` fica verde no mesmo SHA;
8. o owner é liberado somente depois dessa leitura.

Registre URLs dos runs, deployment IDs, SHA anterior e SHA candidato. Não
registre tokens ou payloads de ambiente.

## Fase 6, teste deliberado de falha

Faça somente com autorização nominal para provocar falha em produção e janela
de observação ativa.

1. Introduza uma falha controlada que passe o stage e falhe no fechamento
   público, sem tocar banco ou dados de usuário.
2. Confirme `Production release closure=failure`.
3. Confirme Instant Rollback para o deployment predecessor capturado.
4. Prove `/api/deployment-info` no SHA anterior.
5. Confirme `Production rollback recovery=success` no SHA anterior.
6. Confirme issue deduplicada e owner ainda bloqueado.
7. Conclua o revert auditável.
8. Promova explicitamente o deployment de recuperação. Esse passo é obrigatório
   porque Instant Rollback desliga a atribuição automática de domínios.
9. Repita o fechamento público e só então libere a fila.

Critério de saída: falha detectada, rollback exato, SHA anterior restaurado,
smokes verdes, incidente rastreável e segundo PR nunca liberado durante o ciclo.

## Matriz de parada

| Observação | Ação |
|---|---|
| candidato recebeu domínio antes do stage verde | pausar variável remota, manter lock e abrir incidente |
| SHA público diverge do candidato e predecessor | pausar, não inferir alvo, investigar deployments |
| stage falha e domínio permanece no predecessor | manter lock, corrigir ou reverter código, sem Instant Rollback |
| fechamento público falha | Instant Rollback exato e prova do predecessor |
| rollback ou prova falha | incidente crítico, nenhuma liberação |
| qualquer migration sem artifacts específicos | bloquear antes do merge |

## Prova final de ativação

O sistema só está ativo e validado quando existem evidências atuais de:

- candidato staged no SHA exato e sem alias prematuro;
- smoke completo staged verde;
- promoção e fechamento público no mesmo SHA;
- teste deliberado acionando rollback exato;
- predecessor restaurado e provado;
- promoção explícita de recovery depois do Instant Rollback;
- fila bloqueada durante toda a falha;
- issue deduplicada;
- zero escrita no Supabase pelo workflow de release.

Até essa prova existir, o status correto é "implementado, não ativado".
