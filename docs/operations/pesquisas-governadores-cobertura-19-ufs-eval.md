## Eval: cobertura de pesquisas para governos em 19 UFs

Tipo: codigo e research

| # | Criterio pass/fail | Grader | Dimensao |
|---|---|---|---|
| 1 | O inventario final preserva as 21 UFs originais e classifica exatamente as 19 UFs desta rodada, com razao objetiva para toda UF nao publicada. | code: `node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts` | outcome |
| 2 | Cada rodada publicada referencia fonte preferencial aprovada, registro TSE compativel, URL publica do resultado, metodologia completa, periodo de campo, amostra, margem, cenario e captura SHA-256 valida. | code: `npm run audit:pesquisas:gate` e revisao binaria das URLs finais | outcome |
| 3 | Cada alias publicado corresponde literalmente a perfil de candidato a Governador da mesma UF. | code: `npm run test:pesquisas:identidade && npm run test:pesquisas:selecao` | outcome |
| 4 | Nenhum resultado cruza eleicao, cargo, UF, turno ou cenario, e a selecao exige a `comparability_key` completa. | code: `npm run test:pesquisas:selecao` | policy |
| 5 | Fonte condicional so muda para aprovada se o motivo concreto da condicao estiver resolvido e documentado; caso contrario, nao aparece no catalogo publico. | code: `npm run test:pesquisas:dados` e revisao binaria do scorecard | policy |
| 6 | Registro no TSE sem resultado publico verificavel permanece ausente, e o relatorio de deep research nunca e usado como fonte final. | code: `npm run audit:pesquisas:gate` e revisao binaria da proveniencia | policy |
| 7 | Rodada antiga nao e publicada quando uma rodada mais nova ou o registro definitivo revela candidato omitido. | code: `node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts` | policy |
| 8 | Ausencia permanece vazia, nunca vira 0, enquanto percentual 0 realmente publicado continua preservado. | code: `npm run test:pesquisas:selecao` | policy |
| 9 | Uma nova UF preenchida e duas vazias passam em desktop e celular, sem overflow e sem percentual inventado. | browser: `npm run test:visual:pesquisas`, com screenshots reais | outcome |
| 10 | O gate canonico completo passa e o diff nao altera design, migration, banco, servico externo, producao, lockfile ou dependencia. | code: `npm run verify:pesquisas && node scripts/audit/verify-pesquisas-governadores-scope.mjs` | outcome |
| 11 | A pesquisa das 19 UFs consulta TSE PesqEle, dados abertos do TSE, paginas de institutos e divulgacoes jornalisticas rastreaveis. | revisao binaria das URLs e da documentacao de coleta | routing |
| 12 | As quantidades finais de UFs e perfis adicionais sao derivadas dos arquivos finais, e o trabalho termina em PR exclusivo sem merge, deploy ou escrita em producao. | code: testes de cobertura, `git diff --name-only origin/main...HEAD` e `gh pr view` | outcome |

Gate: Done somente com 100% PASS, 12 de 12 criterios, e evidencia atual por criterio.

Custo esperado: 3 a 6 horas, concentradas em pesquisa publica, verificacao de identidade e prova visual. Golden set: as 19 UFs nomeadas no pedido, com os cinco modos de falha obrigatorios de isolamento, fonte condicional, alias, zero real e ausencia explicita.
