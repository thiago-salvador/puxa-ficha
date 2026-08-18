# Prompts das sessões de trabalho do lançamento (10/08)

> **SUPERADO.** Esta v1 foi bloqueada pela auditoria do Codex
> (`QA/2026-08-09-avaliacao-auditoria-codex.md`). Usar a v2:
> `QA/2026-08-09-prompts-sessoes-lancamento-v2.md`. Não abrir sessões com os
> prompts abaixo.

Um prompt por chat novo. Ordem de abertura: Sessões 1 e 2 agora, em paralelo.
Sessão 4 a qualquer momento (worktree se houver sessão concorrente no mesmo
working tree). Sessão 3 depois que a 2 aplicar as coletas. Sessão 5 por último.

## Sessão 1 — Trilha A: classificação eleitoral (abrir agora)

```text
Leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e Settings/README.md antes de começar. Esta sessão executa a Trilha A da triagem: itens 12, 5, 10, 13 e 15, nesta ordem. É a trilha crítica do lançamento de amanhã. Use plan mode antes de implementar (mexe em migration e contrato).

Escopo, em sequência (mesmo módulo da timeline, não paralelizar entre si):
1. Item 12 (Lula): candidatura 2018 indeferida exibida como "2018 - Não Eleito". Criar estado próprio para candidatura indeferida/cancelada (ou excluir da timeline, decidir pelo contrato existente) e auditar a base inteira por outros indeferidos exibidos como candidatura real (o print do Rui mostra PCO 2006 "Indeferido" com o mesmo defeito).
2. Item 5 (Daciolo): raw "ELEITO POR QP (TSE 2014)" exibido como "Não Eleito". Corrigir o mapeamento de totalização: eleito por QP/média é eleito.
3. Item 10 (Flávio): raw "ELEITO (TSE 2018)" exibido como "Não Eleito", e mandatos sobrepostos (Dep. Estadual 2016-2019 vs Senador 2019-atual). Definir regra de precedência entre fontes para datas; a nota aponta mistura de fontes na lista.
4. Item 13 (Renan): "Presidente Nacional do Partido Missão" na timeline eleitoral. Cargo interno de partido não é eleição: filtrar + limpar os existentes.
5. Item 15 (Zema): "eleição 2023" gerada em "Eleições sem dado publicado". Não existe eleição em ano ímpar: validar calendário eleitoral (ano par e tipo de eleição certo por ano) + limpar os registros gerados.

Regras do projeto que valem aqui:
- Correção de dado é migration com `-- @write` em cada INSERT/UPDATE/DELETE, allowlist dos pares (tabela, slug, campos), entrada em scripts/audit/recortes.json e rollback em supabase/rollback/. Sem qualquer um dos quatro, o gate reprova.
- Nunca regenerar baseline-escritas-sem-anotacao.json em massa.
- NÃO aplicar nada em produção: preparar, provar em Postgres efêmero e parar. Aplicação exige minha autorização nomeada.

Testes e DoD (sem "Done" antes de 100% PASS com evidência registrada):
- Teste unitário novo para cada regra: eleito por QP, ELEITO no raw, indeferido, cargo partidário, ano ímpar. Rodar com `node --import tsx --test tests/<arquivo>.test.ts`.
- `npm run audit:cobertura:allowlist` (sem flags) passa.
- `npm run check:dead-code` passa (é knip com --max-issues 0).
- Build e suite completa passam.
- Dry-run da migration forward e do rollback em Postgres efêmero, com readback provando: Lula sem candidatura 2018 ativa, Daciolo 2014 eleito, Flávio 2018 eleito e datas sem sobreposição, Renan sem cargo partidário, Zema sem 2023.
- Reproduzir os 5 cenários originais DEPOIS do fix, na mesma sessão, com screenshot ou readback por item.
```

## Sessão 2 — Trilha B: re-coletas e backfill (abrir agora, em paralelo)

```text
Leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e Settings/README.md antes de começar. Esta sessão executa a Trilha B da triagem: itens 3, 2, 6, 9, 16, 17 (dados) e 1. São re-coletas de wall-clock longo: dispare cedo, rode em background e declare timeout explícito (até 600000ms) na primeira chamada.

Escopo, por ordem de disparo:
1. Item 3: rodar a coleta de sanções (CEIS, CNEP, CEAF) para todas as fichas com "Cadastros de sanções ainda não verificados".
2. Item 2: re-executar a busca judicial das fichas com "Busca judicial inconclusiva", com retry e fontes adicionais. O que continuar inconclusivo após tentativa real vira lista de curadoria manual para mim, com o motivo por ficha, não card genérico.
3. Itens 6/9/16/17: backfill ÚNICO de bens e dinheiro varrendo todas as candidaturas de todas as fichas (não caso a caso). Base: scripts gerar-backfill-patrimonio-tse*.ts. Casos de verificação: Daciolo 2018/2008/2006, Flávio (eleições disputadas sem detalhamento), Rui (candidaturas fora da aba dinheiro), Samara (dados faltando).
4. Item 1: agendar re-run da busca de patrimônio para 16/08, seguindo a convenção de automação do projeto.

Regras:
- Escrita em produção exige minha autorização nomeada (R-59): preparar, provar em dry-run, me apresentar o resumo do que vai escrever (quantas fichas, quais tabelas, quantas linhas) e esperar meu sim nomeando o ato.
- Se a escrita for por migration, gate completo: `-- @write`, allowlist, recortes.json, rollback.
- Armadilha do unstable_cache em src/lib/api.ts (TTL 3600s): nunca retornar degradado ou vazio de dentro do cache numa falha; lançar, porque rejeição não entra no cache.

Testes e DoD:
- Dry-run de cada coleta com contagem esperada de escritas ANTES de pedir autorização.
- Após aplicar: readback provando zero fichas publicadas com sanções não verificadas; lista final de fichas ainda inconclusivas no judicial com motivo real; zero eleições disputadas sem dado de bens/dinheiro nos 4 casos de verificação, e contagem antes/depois na base inteira.
- `npm run audit:cobertura:allowlist` e suite passam se houver mudança de código.
- Agendamento do dia 16 provado: job registrado e listável, não só "criei".
```

## Sessão 3 — Trilha C: destaques, votações, autoria (abrir depois que a Sessão 2 aplicar as coletas)

```text
Leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e Settings/README.md antes de começar. Esta sessão executa a Trilha C da triagem: itens 8, 4, 14 e 7. Pré-requisito: re-coletas da Trilha B aplicadas (destaques dependem de judicial, sanções e notícias coletados). O item 8 não depende de nada e vem primeiro.

Escopo:
1. Item 8: autoria legislativa: dedupe de proposições de ementa idêntica (caso Daciolo: 4 REQs iguais da PEC 446/09 listados) e promover a proposição mais relevante (o PL) ao box de layout destacado.
2. Itens 4+14: expandir a busca e a heurística de destaques ("O que você precisa saber"). Nenhuma ficha publicada pode ficar com "Destaques (0)": a regra de estado mínimo apresenta algo verdadeiro e rastreável (trajetória, patrimônio, votação), nunca inventado. Casos de teste: a ficha do print com 0 destaques e o Renan com 1.
3. Item 7: ampliar votações-chave (caso Daciolo: 2 votações num mandato de 4 anos). Expandir o dataset editorial de votações importantes e o matching por candidato.

Regras:
- Nada de conteúdo inventado: destaque e votação só com fonte rastreável no código ou no dado.
- Se precisar escrever dados, gate completo de migration (@write, allowlist, recortes.json, rollback) e minha autorização nomeada antes de aplicar em produção.

Testes e DoD:
- Teste unitário do dedupe de autoria e da regra de estado mínimo de destaques.
- Readback: zero fichas publicadas com destaques vazios; distribuição de votações por ficha antes/depois.
- Reproduzir os prints originais (autoria do Daciolo, votações do Daciolo, ficha com Destaques 0, Renan com 1) DEPOIS do fix, com screenshot.
- Suite, `npm run check:dead-code` e build passam.
```

## Sessão 4 — Trilha D: layout (abrir a qualquer momento, em paralelo)

```text
Leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e Settings/README.md antes de começar. Esta sessão executa a Trilha D da triagem: itens 11, 17 (layout) e 18. Frontend puro, sem dependência das outras trilhas. Se houver outra sessão editando o mesmo working tree, use worktree.

Escopo:
1. Itens 11+17: card "Patrimônio declarado" (casos Hertz e Samara) fora do padrão dos demais cards de dinheiro: tipografia própria e área vazia enorme. Alinhar ao padrão visual do site.
2. Item 18: layout do email de digest de alertas ("Seu digest de alertas do Puxa Ficha"): hoje é texto empilhado sem hierarquia. Template HTML de email consistente com a marca do site, legível em dark mode (o print de referência é Gmail dark).

Regras:
- Não enviar email de teste para ninguém sem minha autorização; se precisar de envio real, só para mim.

Testes e DoD:
- Verificação visual real (gate duro): screenshot do card corrigido nas fichas do Hertz e da Samara em preview local, comparado ao padrão dos outros cards. Build passar não prova tela certa.
- Email: renderizar o template com dados reais de exemplo e screenshot em light e dark.
- Responsivo verificado (mobile) nas duas superfícies.
- Suite, `npm run check:dead-code` e build passam.
```

## Sessão 5 — Fechamento e verificação (abrir por último, depois de A e B aplicadas)

```text
Leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e Settings/README.md antes de começar. Esta é a sessão de fechamento do lançamento: re-materialização das fichas e verificação adversarial contra os 18 itens da nota "PF Ajustes" (Apple Notes; se precisar dos prints, extraia as imagens da nota). Pré-requisito: Trilhas A e B aplicadas em produção; C e D entram no veredito conforme o que tiver sido concluído.

Use a skill /workflow para desenhar o fluxo antes de executar, com este formato: verificação em paralelo por ficha (Daciolo, Flávio, Hertz, Lula, Renan, Zema, Rui, Samara), cada agente conferindo a ficha renderizada contra os itens da triagem que a citam, mais um passe transversal dos itens "Todos" (1, 2, 3, 4, 6) numa amostra de fichas além dessas 8. A verificação é adversarial: cada agente tenta provar que o item NÃO foi resolvido.

Sequência:
1. Re-materializar as fichas. Só depois da Trilha A aplicada: re-materializar antes re-publica o dado errado.
2. Rodar o workflow de verificação.
3. Gates finais: suite completa, `npm run check:dead-code`, `npm run audit:cobertura:allowlist`, build de produção.
4. Relatório final verde/amarelo/vermelho por item (1 a 18), com evidência (screenshot ou readback) por linha.

DoD do lançamento:
- 18 linhas com veredito e evidência; nenhum item de nível 1 ou 2 em vermelho.
- Nenhuma ficha pública com dado factual contradito pelo raw da própria linha.
- Deploy de produção só com minha autorização nomeada (R-59): preparar e parar.
```
