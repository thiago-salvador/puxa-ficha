## Eval: programas de governo presidenciais de 2026

Tipo: codigo

| # | Critério pass/fail | Grader | Dimensão |
|---|---|---|---|
| 1 | O registro cobre exatamente as candidaturas presidenciais oficiais de 2026 presentes no snapshot TSE pós-registro, sem `SQ_CANDIDATO` duplicado e sem casamento somente por nome. | code: `npm run test:programas-governo:schema` compara o registro com `supabase/migrations/20260816011000_chapas_2026_tse_pos_registro.sql` | outcome |
| 2 | Toda fonte aceita usa domínio oficial do TSE, URL direta do documento e URL do conjunto de dados, e carrega SHA-256 válido do PDF e do texto extraído. | code: `npm run audit:programas-governo` | policy |
| 3 | Para todo PDF classificado como extraído, o total de páginas confere com `pdfinfo`, as páginas permanecem na ordem original e nenhuma página aplicável fica sem representação no registro. | code: `npm run test:programas-governo:extracao` e `npm run audit:programas-governo` | outcome |
| 4 | PDF ausente, URL inválida, download falho, página sem texto confiável e hash alterado resultam em estados específicos e nunca em conteúdo aprovado. | code: controles positivos e negativos em `tests/programa-governo-extracao.test.ts` e `tests/programa-governo-data.test.ts` | policy |
| 5 | Cada resumo publicável tem entre 120 e 180 palavras, quatro a seis temas sem duplicação e evidência de página ou seção para cada tema e afirmação material. | code: `npm run audit:programas-governo` | outcome |
| 6 | Cada afirmação do resumo e cada tema é sustentado pela evidência indicada, sem conhecimento externo, julgamento de viabilidade ou reescrita promocional. | judge binário (Claude Sonnet via `claude --model sonnet`, família diferente do gerador Codex GPT), saída somente `yes`, `no` ou `unknown`; qualquer `no` ou `unknown` falha | outcome |
| 7 | Nenhum registro muda para `aprovado` sem revisão humana explícita do artefato que mostra resumo, temas, evidências, páginas e PDF oficial; o estado real no arquivo registra `reviewed_at`. | manual: decisão humana sobre o artefato local; code: `npm run audit:programas-governo` rejeita aprovação sem metadados completos | policy |
| 8 | A Visão geral recebe somente manifesto pequeno, e o HTML inicial, o DTO do perfil e o JavaScript inicial não contêm o texto integral do programa. | code: `npm run test:programas-governo:ui` e inspeção de payload em `tests/visual/programa-governo.spec.ts` | outcome |
| 9 | A rota da aba retorna conteúdo apenas para registros aprovados, expõe estado sem conteúdo para os demais casos, aplica rate limit antes da leitura e não publica campos editoriais internos. | code: `npm run test:programas-governo:route`, `npm run audit:route-guards` e `npm run audit:public-security-surface:gate` | policy |
| 10 | O box aprovado mostra resumo, quatro a seis temas, selo de IA revisada e ações para a aba e o PDF TSE; estados não aprovados exibem ausência específica sem texto de rascunho. | code: `npm run test:programas-governo:ui` | outcome |
| 11 | A aba abre por clique e `?tab=programa`, preserva navegação por teclado e histórico, busca sem diferenciar caixa ou acento, anuncia resultados e mantém títulos, parágrafos, listas e sumário semântico. | code: `npm run test:programas-governo:ui` e `npm run test:visual:programas-governo` | outcome |
| 12 | Uma ficha aprovada e uma ficha não aprovada não têm overflow em 390 por 844 nem violações Axe moderadas, sérias ou críticas, e produzem screenshots reais em desktop e mobile. | code: `npm run test:visual:programas-governo` | outcome |
| 13 | O diff não inclui programas de governadores ou eleições anteriores, migrations, escrita no banco, dependência de IA no runtime, deploy, push ou merge. | code: `npm run audit:programas-governo:scope` | policy |
| 14 | A geração usa no máximo duas tentativas do gerador e duas do judge por documento extraível, registra contagens e não faz chamada de IA durante build, rota ou visita à ficha. | code: `npm run audit:programas-governo` e teste de ausência de SDK ou chamada de modelo em `src/` | custo |
| 15 | Testes focados, lint, typecheck, build, auditorias de segurança aplicáveis e o ledger Unlazy passam no diff final. | code: `npm run verify:programas-governo` e `gate-check.mjs --reverify GATES.md` | outcome |
| 16 | Descoberta e conteúdo usam somente superfícies oficiais do TSE; PDF é processado offline por adaptador local e nenhum resumo de terceiro é usado como fonte. | code: allowlist e proveniência em `npm run audit:programas-governo`; manual: inspeção do registro de fontes | routing |

Gate: Done somente com 100% PASS registrado, evidência atual por critério, zero gate abandonado e revisão humana dos registros publicados.

Custo esperado: no máximo duas tentativas de geração e duas de julgamento por documento extraível, zero chamada de IA no runtime público, zero dependência nova no aplicativo, uma coleta do pacote presidencial por execução e processamento sequencial por padrão. Golden set: n/a (feature e lote editorial one-off; fixtures negativas e positivas vivem nos testes focados).
