# Workflow final da PF Ajustes, itens 1 a 17

Data: 11/08/2026
Escopo: fechar os itens 1 a 17. O item 18, layout de email, permanece adiado.

## Objetivo verificável

Entregar uma única integração local em que cada linha da matriz canônica tenha
causa, correção global, universo medido, prova local, ato externo separado e
readback público definido. Nenhum estado local é chamado de verde antes de
aplicação autorizada, deploy do mesmo SHA e readback do site publicado.

## Restrições

- checkout principal e `rc-lancamento` são somente leitura;
- mudanças ocorrem em worktrees e branches isolados;
- não aplicar migration, executar coleta com escrita, fazer merge, deploy ou
  ativar cron sem autorização que nomeie o ato;
- falha de fonte, rede ou identidade termina em erro ou indeterminação, nunca
  em ausência confirmada;
- nomes da nota são regressões obrigatórias, não o limite do universo;
- nenhuma frente toca o item 18.

## Frentes e propriedade

| Frente | Propriedade | Critério de parada |
|---|---|---|
| Votações, item 7 | ingest, auditoria, migration, rollback e readback do Senado | 13 linhas reconciliadas por identidade exata; nenhuma linha sem desfecho |
| Cards de dinheiro, item 11 | componentes e auditoria DTO/DOM/visual | 194 fichas em desktop e mobile, conteúdo exato e zero defeito geométrico |
| Destaques, itens 4 e 14 | matriz 194x5, estados persistidos e proveniência | 970 células com payload e fonte; zero estado silencioso e zero ausência fabricada |
| Integração | recortes, baselines, matriz, log, gates e PR | um SHA limpo, CI e eval independentes 100% PASS |

As três frentes de implementação podem executar em paralelo porque seus
arquivos de propriedade não se sobrepõem. A integração é serial e só começa
depois que cada frente entrega sua medição e seus testes.

## Ciclo de execução

1. Congelar o eval antes da implementação.
2. Remedir o universo na fonte e no estado atual.
3. Implementar a correção global fail-closed.
4. Rodar testes focais e adversariais de cada frente.
5. Integrar serialmente, ajustar apenas arquivos compartilhados e rodar todos os
   gates no mesmo SHA.
6. Executar eval independente. Qualquer `FAIL`, `no` ou `unknown` reabre somente
   a frente sustentada por evidência nova.
7. Parar com bloqueio se o mesmo erro reaparecer sem evidência nova ou se a
   solução exigir ampliar o escopo.

## Eval congelado

O contrato de avaliação está em `/private/tmp/pf-ajustes-17-final-eval.md`. São
11 critérios binários. O critério 5 usa juiz independente e aceita somente
`yes`; `no` e `unknown` falham. Done exige 11/11 PASS no SHA exato da PR de
integração.

## Provas obrigatórias

- suíte completa, typecheck, lint sem warnings, Settings e build;
- allowlists e recortes de todas as migrations com escrita;
- replay linear e replay de schema congelados;
- harnesses PostgreSQL 17 de forward, rollback, ledger e mutação adversarial;
- auditoria pública local de banco, API, DTO e DOM nos universos medidos;
- snapshots Git, ledger e contagens remotas antes e depois;
- casos Daciolo, Flávio, Hertz, Lula, Renan, Rui, Samara e Zema mais amostras
  adversariais fora dos exemplos;
- matriz canônica e log da sessão atualizados no SHA final.

## Limite da entrega local

O workflow prepara, testa, versiona e abre a PR. Merge, backup, aplicações em
produção, coletas com escrita, deploy e cron são atos posteriores, separados e
nomeados no documento de autorizações.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
