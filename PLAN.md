# Plan: monitoramento automatizado de pesquisas eleitorais

Depth: solo

## Contrato

- Baseline: `origin/main` no merge `b73b3ad8213211081026d63ab235f2d2ed3da877` do PR #102.
- Autoridade: scorecards, catalogos e regras de UF versionados; TSE para registro; somente divulgacoes publicas de fontes com status `aprovado`.
- Saida: proposta JSON, diff estruturado JSON e resumo Markdown para revisao humana.
- Falha fechada: dry-run obrigatorio; fonte condicional, conflito, alias ambiguo, timeout, HTML inesperado ou registro insuficiente nunca ficam promoviveis.
- Proibicoes: nenhuma escrita no catalogo publicado, Supabase, producao, GitHub, mensagem, commit ou PR pelo coletor.
- Entrega: branch `codex/pesquisas-monitoramento-automatizado`, commit e PR por Thiago Salvador, sem cron, merge ou deploy.

## Inventario de resultados obrigatorios

| ID | Resultado observavel | Gate |
|---|---|---|
| C1 | Adaptadores aceitam somente IDs aprovados e origens publicas allowlisted | G2 |
| C2 | Evidencia registra URL, instituto, TSE, campo, cenario, amostra, margem, resultados, observacao e SHA-256 | G1, G7 |
| C3 | Normalizacao segue o contrato existente sem escrever no catalogo | G3 |
| C4 | Proposta, diff e resumo sao reproduziveis e revisaveis | G3 |
| C5 | Sete classificacoes exigidas sao fail-closed | G4 |
| C6 | Timeout, retry limitado, rate limit, robots e redacao de logs sao testados | G5 |
| C7 | Workflow manual filtra fonte ou UF, publica artefato e nao possui schedule | G6 |
| C8 | Golden set cobre nova valida, condicional, conflito, alias ambiguo, mudanca retroativa, zero, timeout, HTML inesperado, inalterada e vencida | G1 |
| C9 | Coletor nao altera catalogos, banco, GitHub ou producao | G2, G3 |
| C10 | Runbook explica revisao e promocao em PR separado | G6, G10 |
| C11 | Prova manual usa fonte publica aprovada sem burlar controles | G7 |
| C12 | Gates canonicos, lint, typecheck e seguranca passam | G8, G9 |
| C13 | PR permanece estreito, sem agendamento, merge ou producao | G10, G11 |

## Etapas

1. Formalizar e lintar eval e ledger.
2. Escrever golden set, fixtures hermeticas e testes que inicialmente falham.
3. Implementar contratos, adaptador aprovado, cliente de rede seguro, classificacao e relatorios.
4. Integrar CLI dry-run e workflow_dispatch sem cron.
5. Provar isolamento, politica, rede, workflow e fonte publica controlada.
6. Rodar gates canonicos e seguranca, revisar o diff, commitar, enviar e abrir o PR.

## Alternativas descartadas

- Scraper generico para qualquer dominio: viola o scorecard e amplia a superficie de erro.
- Escrita direta no catalogo ou banco: elimina revisao humana e conflita com o contrato.
- Cron nesta entrega: o modo manual ainda precisa ser provado no GitHub Actions.
- Dependencia nova de scraping: Node e parsers deterministas bastam para o primeiro adaptador aprovado.

## Criterio de parada

Done exige G0 a G11 com evidencia atual. Falha ou impossibilidade permanece visivel no ledger e impede o PR de ser apresentado como concluido.
