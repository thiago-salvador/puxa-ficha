# Plano: monitoramento das fontes eleitorais aprovadas

Depth: solo

## Contrato

- Baseline: `origin/main` no merge `55399644c40f9eca65527dfbdc0e3e3781730375` do PR #106.
- Branch: `codex/pesquisas-monitoramento-fontes-estaduais`.
- Autoridade: scorecards e catálogos versionados para status, uso, URLs e aliases; dataset oficial do TSE para validar registros e metadados.
- Saída: apenas `proposal.json`, `diff.json` e `summary.md`, consolidados e destinados à revisão humana.
- Falha fechada: fonte não aprovada, domínio não allowlisted, conflito, alias ambíguo, timeout, HTML inesperado, layout alterado ou registro TSE insuficiente nunca ficam elegíveis.
- Proibições: nenhuma escrita nos catálogos, Supabase ou produção; nenhum cron; nenhum secret; nenhum commit, push, issue, PR ou publicação executados pelo coletor.
- Entrega Git: um commit e um PR exclusivo, com Thiago Salvador como autor, sem merge.

## Inventário programático anterior à edição

| Fonte aprovada e usada | Escopo efetivo | Adaptador em `origin/main` | Ação |
|---|---|---:|---|
| `poderdata-aya-nacional-2026` | BR | sim | preservar e integrar ao registro fechado |
| `datafolha-folha-globo-nacional-2026` | BR | não | criar adaptador explícito |
| `datafolha-folha-globo-estaduais-2026` | CE, DF, MG, PE, PI, RJ, SP | não | criar adaptador explícito |
| `real-time-big-data-estaduais-2026` | AM, BA, MS, MT, PB, PR, RO, RS, SE | não | criar adaptador explícito com formatos internos por veículo |

Total medido: 4 fontes aprovadas e usadas, 18 combinações fonte e geografia, 3 lacunas de adaptador. Quaest, AtlasIntel, Paraná Pesquisas e Ipsos/Ipec permanecem condicionais ou excluídas e não entram no registro.

## Inventário de resultados obrigatórios

| ID | Resultado observável | Gate |
|---|---|---|
| C1 | Registro fechado contém exatamente as 4 fontes aprovadas e usadas | G1 |
| C2 | Cada fonte aprovada possui adaptador explícito; Datafolha nacional e estadual não são um alias implícito | G1, G2 |
| C3 | Domínios permitidos vêm dos URLs públicos efetivamente usados nos catálogos e são validados por adaptador | G1, G3 |
| C4 | Evidência extrai instituto, TSE, cargo, UF, turno, cenário, campo, amostra, margem e resultados | G2, G4 |
| C5 | Toda proposta cruza registro e metadados no dataset oficial do TSE | G4 |
| C6 | Evidência inclui URL pública, horário de observação e SHA-256 do corpo observado | G4 |
| C7 | HTML inesperado, layout alterado, conflito e alias ambíguo falham fechados | G2, G4 |
| C8 | O run escreve somente os três artefatos de revisão e preserva catálogos byte a byte | G5 |
| C9 | CLI e workflow aceitam uma fonte, uma UF ou todas as 18 combinações atuais | G6 |
| C10 | Workflow consolida artefato e GitHub Step Summary, com `contents: read`, sem secrets e sem cron | G6 |
| C11 | Golden set sem rede cobre sucesso por adaptador, zero publicado, conflito, fonte condicional, timeout, layout alterado e alias ambíguo | G2 |
| C12 | Um dry-run real por adaptador registra prova ou bloqueio objetivo sem afrouxar controles | G7 |
| C13 | Gates específicos, `verify:pesquisas`, escopo e autoria passam no estado final | G8, G9, G10 |

## Etapas

1. Formalizar e lintar eval e ledger.
2. Extrair o registro de adaptadores da interseção `aprovado ∩ usado`, com teste que rejeita condicionais e excluídas.
3. Adicionar fixtures sanitizadas e golden cases por adaptador e por modo de falha.
4. Implementar os adaptadores explícitos, compartilhando apenas utilitários determinísticos de parsing.
5. Integrar seleção por fonte ou UF, execução de todas as combinações, TSE único por run e relatórios consolidados.
6. Atualizar workflow manual, documentação e prova real local.
7. Rodar todos os graders, revisar o diff, commitar, enviar e abrir o PR.

## Alternativas descartadas

- Scraper genérico baseado apenas em padrões de texto: não prova cobertura por fonte e abre espaço para aceitar layouts desconhecidos.
- Adaptador único `datafolha` para dois `source_id`: ocultaria uma lacuna do inventário e enfraqueceria a auditoria de cobertura.
- Adaptador por domínio de veículo: Real Time Big Data usa vários veículos, mas a unidade aprovada do scorecard é a fonte; os formatos ficam internos e allowlisted.
- Descoberta por busca aberta: ampliaria a superfície para domínios não aprovados. Esta entrega monitora somente URLs públicas versionadas nos catálogos.
- Escrita direta no catálogo ou banco: viola o contrato de revisão humana.
- Cron nesta entrega: o modo manual precisa permanecer isolado neste PR.

## Critério de parada

Done exige G0 a G10 com evidência atual. Bloqueio real permanece registrado, mas não autoriza remover controles nem declarar o adaptador comprovado.
