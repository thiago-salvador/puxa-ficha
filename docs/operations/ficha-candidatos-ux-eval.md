## Eval: polimento ponta a ponta da ficha de candidatos

Tipo: codigo

| # | Critério (pass/fail) | Grader | Dimensão |
|---|---|---|---|
| 1 | Em viewport mobile, três destinos prioritários ficam visíveis e os demais permanecem alcançáveis em um menu “Mais”, sem rolagem horizontal da barra e com nome, estado e foco acessíveis. | code: testes de componente em `tests/candidato-profile-ux.test.tsx`; browser: `tests/visual/candidato-ficha-ux.spec.ts` | outcome |
| 2 | Todo carregamento relevante da ficha mostra uma mensagem específica, expõe `aria-busy` ou `role=status` e nunca depende apenas de shimmer, cor ou spinner. | code: testes de componente e inspeção Axe em `tests/candidato-profile-ux.test.tsx` e `tests/visual/candidato-ficha-ux.spec.ts` | acessibilidade |
| 3 | O leitor do programa renderiza inicialmente um lote limitado de capítulos, pesquisa o documento completo, revela um resultado ainda não renderizado e permite carregar todos os capítulos sob demanda. | code: casos de lote inicial, busca e expansão em `tests/candidato-profile-ux.test.tsx` e regressão em `tests/programa-governo-ui.test.tsx` | outcome |
| 4 | O hero preserva vice e pesquisa eleitoral, reduz o peso do crédito da foto no mobile e mantém todas as ações com área interativa mínima de 44 por 44 pixels. | browser: medições e assertions em `tests/visual/candidato-ficha-ux.spec.ts` | outcome |
| 5 | Os indicadores e cards da visão geral têm altura consistente dentro de cada linha no desktop, sem overflow de conteúdo, enquanto o mobile mantém uma coluna natural. Carreira e Programa formam uma dupla de meia largura em todas as fichas que exibem ambos. | code: contrato em `tests/cards-dinheiro-layout.test.tsx`; browser: medição de caixas, overflow e colunas em `tests/visual/candidato-ficha-ux.spec.ts` | layout |
| 6 | A prévia de compartilhamento comunica “Gerando prévia” durante a carga e o botão de seguir comunica a verificação da sessão quando estiver indisponível temporariamente. | code: renderizações de estado em `tests/candidato-profile-ux.test.tsx` | acessibilidade |
| 7 | As mudanças não alteram dados políticos, não removem abas, não removem o texto integral pesquisável e não introduzem comparação ou ranking entre candidatos. | code: testes de contrato em `tests/candidato-profile-ux.test.tsx`; review: diff final | policy |
| 8 | Testes focados, typecheck, lint, build, Axe e validação visual passam no estado final em Node 24. | code: `GATES.md`, gates G1 a G5 | outcome |

Gate: Done só com 100% PASS nos oito critérios, evidência atual em todos os gates e inspeção visual em mobile e desktop.

Custo esperado: zero chamada externa no runtime, zero dependência nova e um lote inicial de até 12 capítulos no leitor. Golden set: `tests/candidato-profile-ux.test.tsx`, `tests/cards-dinheiro-layout.test.tsx` e `tests/visual/candidato-ficha-ux.spec.ts`, cobrindo navegação compacta, estados de carga, expansão do leitor, ritmo do grid, toque e Axe.
