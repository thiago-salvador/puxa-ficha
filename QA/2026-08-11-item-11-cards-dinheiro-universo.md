# Item 11, cards de dinheiro e patrimônio

Data da medição: 11/08/2026.

Escopo: as 194 fichas públicas em desktop e mobile. O item 18, layout de email,
permaneceu fora desta frente.

## Resultado

- Universo recontado: 194 fichas únicas.
- Execuções DOM: 194 em 1440 x 900 e 194 em iPhone 14, total de 388.
- Cards medidos por viewport: 659 de patrimônio, 730 de financiamento e 65 de
  gastos parlamentares.
- Cards de visão geral medidos por viewport: 329, incluindo os 18 resumos de
  gastos parlamentares que antes não tinham marcador auditável.
- DTO e DOM: 194/194 em cada viewport, com igualdade integral do texto visível.
- Conteúdo validado por viewport: 28.837 tokens esperados, 10.148 valores,
  9.164 linhas de bens, gastos e doadores, 126 fontes, 440 segmentos de
  composição e 3.036 doadores.
- Conteúdo visível e ordem cronológica: 194/194 em cada viewport.
- Overflow, card fora da viewport, sobreposição e altura ou espaço anômalo:
  zero em cada viewport.
- Maior espaço inferior nos cards-resumo: 17 px. O defeito anterior deixava
  aproximadamente 300 px vazios no card curto.

Os casos adversariais congelados são `hertz-dias`, `samara-martins`,
`omar-aziz` e `roberio-paulino`. `rui-costa-pimenta` é a amostra adicional fora
dos exemplos originais, com anos publicados e ausência oficial confirmada no
mesmo conjunto.

## Como a prova funciona

`scripts/audit/gerar-fixture-cards-dinheiro.ts` lê somente as tabelas públicas
já disponíveis, compõe o DTO público e renderiza os componentes reais. Isso
evita depender de `financiamento_verificacoes_publico`, que ainda não existe no
ambiente enquanto a migration correspondente não for aplicada.

`tests/visual/cards-dinheiro-universo.spec.ts` carrega o CSS compilado do app e
mede o HTML dos componentes no Chromium. Para cada ficha, confere o contrato
DTO/DOM e reconstrói do DTO o texto visível integral esperado. A comparação é
exata depois de normalizar espaços e ignorar apenas a caixa produzida por
`text-transform` no CSS. Totais, bens, linhas de gastos, composição, legendas,
avisos, doadores e resumos precisam coincidir em valor e ordem. Fontes, títulos
dos segmentos e linhas de doadores também são comparados como estruturas DOM
separadas. O auditor ainda mede ordem por ano, overflow interno e da viewport,
interseção entre cards e espaço inferior anômalo. O gerador exige
`PF_DRY_RUN=1` e só executa consultas `select`.

O controle negativo altera somente o total patrimonial visível do Hertz, de
`R$ 100.000` para `R$ 999.999.999`, mantendo o DTO original. O mesmo auditor
falha na igualdade integral e mostra os dois valores no diff. O recibo está em
`QA/evidencias/2026-08-11-item11-cards-dinheiro/mutacao-conteudo-c3.json`.

Reprodução, com o app local iniciado por `npx next dev --webpack -H 127.0.0.1 -p 3121`:

```bash
PF_DRY_RUN=1 PF_BASE_URL=http://127.0.0.1:3121 \
  npx playwright test tests/visual/cards-dinheiro-universo.spec.ts \
  --project=desktop --workers=1 --retries=0

PF_DRY_RUN=1 PF_BASE_URL=http://127.0.0.1:3121 \
  npx playwright test tests/visual/cards-dinheiro-universo.spec.ts \
  --project=mobile --workers=1 --retries=0
```

Os readbacks completos e as dez capturas adversariais estão em
`QA/evidencias/2026-08-11-item11-cards-dinheiro/`.

## Correção global e gates

Os cards agora expõem tipo, ano e estado em atributos DOM estáveis. Os gastos
parlamentares também são ordenados explicitamente por ano decrescente, sem
depender da ordem recebida da fonte.

Passaram:

- 24 testes focais dos cards, patrimônio eleitoral, composição e payload público.
- Auditor Playwright desktop, 194/194.
- Auditor Playwright mobile, 194/194.
- Controle negativo por mutação real, falha detectada no valor de Hertz.
- `npm run typecheck`.
- `npm run check:scripts`.
- ESLint dos arquivos alterados e `npm run lint`.

O build webpack compilou o aplicativo, mas o typecheck interno do Next parou em
um erro preexistente e fora deste escopo: a rota
`src/app/api/alerts/delete-data/route.ts` exporta `createDeleteDataHandler`, que
o Next não aceita como campo de Route. O build Turbopack, antes disso, não roda
neste worktree porque `node_modules` é um symlink compartilhado que aponta para
fora da raiz aceita pelo Turbopack. Nenhum desses dois bloqueios foi causado
pelos arquivos do item 11.

Não houve migration, escrita remota, merge, deploy, coleta, cron ou alteração
do item 18.
