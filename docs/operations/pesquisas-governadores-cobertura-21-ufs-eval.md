## Eval: cobertura de pesquisas para governos em 21 UFs

Tipo: codigo e research

| # | Criterio pass/fail | Grader | Dimensao |
|---|---|---|---|
| 1 | O inventario final contem exatamente as 21 UFs em escopo, com um dos quatro estados permitidos e razao objetiva para toda UF nao publicada. | code: `node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts` | outcome |
| 2 | Cada rodada publicada referencia fonte preferencial aprovada, registro TSE compativel, URL publica do resultado, metodologia completa, data recente e captura SHA-256 valida. | code: `npm run audit:pesquisas:gate` e revisao manual das URLs finais | outcome |
| 3 | Cada alias publicado corresponde literalmente a candidato existente com `cargo_disputado=Governador` e a mesma UF. | code: `npm run test:pesquisas:identidade && npm run test:pesquisas:selecao` | outcome |
| 4 | Nenhum resultado cruza UF, cargo, eleicao, turno ou cenario, e a selecao continua exigindo a `comparability_key` completa. | code: `npm run test:pesquisas:selecao` | policy |
| 5 | Fonte condicional, conflitante, sem resultado publico ou sem trilha verificavel nunca aparece no catalogo publico nem na UI. | code: `npm run test:pesquisas:dados && npm run test:pesquisas:ui` | policy |
| 6 | Ausencia permanece vazia, nunca vira 0, enquanto percentual 0 realmente publicado continua preservado. | code: `npm run test:pesquisas:selecao` | policy |
| 7 | Uma nova UF preenchida e duas UFs vazias passam em desktop e celular, sem overflow e sem percentual inventado. | browser: `npm run test:visual:pesquisas`, com screenshots reais | outcome |
| 8 | O gate canonico completo passa sem regressao. | code: `npm run verify:pesquisas` | outcome |
| 9 | O diff nao altera design, migration, banco, producao, lockfile ou dependencias. | code: `node scripts/audit/verify-pesquisas-governadores-scope.mjs` | policy |
| 10 | As quantidades finais de UFs e perfis cobertos sao derivadas dos arquivos finais e coincidem com o inventario. | code: `node --conditions react-server --import tsx --test tests/pesquisas-governadores-cobertura.test.ts` | outcome |
| 11 | A pesquisa usa TSE, paginas de institutos e divulgacoes jornalisticas rastreaveis, tratando o deep research somente como inventario inicial. | revisao binaria humana das URLs e da proveniencia registrada | routing |
| 12 | O trabalho termina em uma branch isolada e um PR estreito, sem merge, deploy ou escrita em producao. | code: `git diff --name-only origin/main...HEAD` e `gh pr view` | policy |

Gate: Done somente com 100% PASS registrado e evidencia atual por criterio.

Custo esperado: 2 a 4 horas, concentradas em verificacao de 21 UFs e prova visual. Golden set: n/a, tarefa one-off.
