# QA: migração pública de Alertas para Destaques

Data: 2026-08-07  
Branch: `codex/profiles-complete-2026`

## Objetivo

Substituir a nomenclatura pública `Alertas` por `Destaques`, porque a coleção
também pode conter `Pontos positivos`. A mudança foi aplicada à camada pública
do produto sem renomear `alertas_graves`, que continua sendo uma métrica interna
de severidade negativa.

## Alterações

- `src/components/CandidatoProfile.tsx`
  - Cartão principal e aba passaram a usar `Destaques`.
  - A contagem usa todos os pontos de atenção públicos.
  - O ícone e a cor do rótulo deixaram de comunicar que todo item é negativo.
  - A seção interna separa `Alertas` de `Pontos positivos`.
- `src/components/EmbedWidget.tsx`
  - O resumo incorporável passou a exibir `Destaques` e a contagem total.
- `src/components/ComparadorPanel.tsx`, `src/lib/types.ts` e `src/lib/api.ts`
  - O comparador passou a mostrar `Destaques`.
  - Foi adicionado o contador público `total_pontos_atencao` aos comparáveis.
  - O atributo de inspeção passou a ser `data-pf-comparador-destaques`.
- `src/lib/social-card.tsx`
  - Social cards passaram a usar `Destaques`, contar todos os pontos e incluir
    pontos positivos nos destaques renderizados.
- `src/lib/ui-labels.ts` e páginas públicas
  - Copy alinhada em metodologia, privacidade, quiz e texto introdutório do
    comparador.
- `scripts/audit/completude.sql` e `scripts/audit/lib/coverage-model.ts`
  - Labels de auditoria atualizados para `Destaques`, mantendo a chave técnica
    `alertas` para compatibilidade dos contratos existentes.
- Testes
  - Casos de social card, comparador e badges editoriais foram atualizados para
    a nova nomenclatura e para a contagem total.

## Compatibilidade

O identificador técnico da aba continua sendo `alertas`, portanto URLs antigas
como `?tab=alertas` continuam navegáveis. A classificação interna mantém
`alertasGraves`/`alertas_graves` para distinguir gravidade crítica ou alta de
outros pontos públicos.

## Verificação

- `npm test`: 2.125 testes aprovados, 0 falhas.
- `npm run typecheck`: aprovado.
- `npm run lint` nos arquivos alterados: aprovado.
- `npm run build`: compilação e geração das páginas concluídas.
- `git diff --check`: aprovado.
- O build registrou o aviso já conhecido de schema remoto ausente
  (`verificacao_campos`); não houve migration, escrita no banco, deploy ou
  publicação.

## Estado do Git

As alterações ficaram no working tree da branch `codex/profiles-complete-2026`.
O checkout já continha mudanças anteriores em outros arquivos; elas foram
preservadas. Não foi criado commit nem realizado push.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
