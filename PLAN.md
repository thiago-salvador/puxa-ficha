# Plan: cobertura de pesquisas para governos em 21 UFs

Depth: solo

## Objetivo

Classificar AC, AL, AM, AP, BA, CE, ES, GO, MA, MS, MT, PA, PB, PR, RN, RO, RR, RS, SC, SE e TO por evidencia atual e publicar somente as rodadas que passam todos os gates ja existentes.

## Contrato

- Autoridade: TSE PesqEle para registro, pagina publica do instituto quando disponivel e divulgacao jornalistica rastreavel para o resultado.
- Publicacao: fonte preferencial e aprovada, registro compativel, resultado verificavel, metodologia suficiente, recencia, cenario exato e alias literal para candidatura da mesma UF.
- Falha fechada: condicional, conflito, ausencia de metodologia, resultado inacessivel, alias sem candidatura ou geografia divergente mantem a UF vazia.
- Escopo tecnico: dados versionados, scorecard, inventario, auditor, testes, eval e ledger. Nenhum design, migration, banco, producao ou dependencia.
- Entrega: commit e PR na branch `codex/pesquisas-governadores-cobertura-21-ufs`, sem merge e sem deploy.

## Etapas

1. Confirmar baseline remoto, ler catalogos, scorecards, testes, auditor e loader.
2. Auditar o inventario inicial contra TSE, institutos e divulgacoes publicas, registrando evidencia e limitacao por UF.
3. Escrever testes de cobertura e falha fechada antes de adicionar novas publicacoes.
4. Atualizar somente catalogo, scorecard, inventario e auditor necessarios para as UFs aprovadas.
5. Rodar testes focados, auditor, `verify:pesquisas` e prova visual desktop/celular.
6. Recalcular UFs e perfis dos arquivos finais, revisar o diff, commitar, enviar e abrir o PR.

## Criterios de parada

- Todas as 21 UFs possuem classificacao objetiva no inventario.
- Toda UF publicada passa os gates, e toda UF sem prova suficiente fica vazia.
- Todos os gates G0 a G9 possuem evidencia atual ou o trabalho permanece nao concluido.
