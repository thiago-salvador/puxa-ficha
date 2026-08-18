# Prompts das sessões de lançamento, v2.1 (pós-auditoria Codex + 4 correções)

Substitui `QA/2026-08-09-prompts-sessoes-lancamento.md` (v1, bloqueada pela
auditoria em `QA/2026-08-09-avaliacao-auditoria-codex.md`). Revisão v2.1 aplica
as 4 correções do Thiago: base montada sem tocar o checkout compartilhado,
receipt sem SHA autorreferente, Trilha C sem ciclo com a aplicação da B, e
tabela individual de esforço dos 18 itens.

Estrutura: a Sessão Raiz monta a base em worktree isolado e é a ÚNICA que aplica
qualquer coisa (banco, merge, deploy), no release serial do workflow canônico.
As trilhas A a D trabalham em worktree próprio, com propriedade exclusiva de
arquivos, e param em artefato local verificado. Nenhum DoD aceita transformar
falha de fonte em conclusão: o gate é zero afirmações falsas, não zero estados
de erro.

## Ordem final de abertura

1. **Sessão Raiz** (Fase 1): inventário read-only, manifesto para aprovação do
   Thiago, base em worktree isolado, receipt, publicação do branch
   `base-lancamento`.
2. Com o branch publicado, **A, B, C e D abrem em paralelo**. C começa pelo
   item 8; os itens 4, 14 e 7 da C destravam quando a B **entregar artefatos**
   (relatórios de dry-run + contrato de dados), não quando algo for aplicado.
3. **Sessão Raiz retoma** (Fases 2 a 4): integração do release candidate
   (incluindo a C), release serial com autorização nomeada por ato, readback
   final contra dados reais e gate de 20 linhas.

## Esforço por item (18 linhas, sem agrupamento)

Esforço de ENGENHARIA em P/M/G; wall-clock qualitativo (motivo entre
parênteses); sem horas por decisão explícita: confiança `média` ou `baixa`
significa que o número só fecha depois do diagnóstico de camada da própria
trilha. Onde itens compartilham mecanismo (backfill), a linha estima o escopo
próprio do item e a dependência aponta o mecanismo comum.

| # | Item | Trilha | Esforço eng. | Wall-clock | Confiança | Dependência |
|---:|---|---|---|---|---|---|
| 1 | Re-run de patrimônio + agendar 16/08 | B | P | re-run longo (fonte externa); agendamento curto | média | dry-run B-E1; ativação do job e disparo são atos da Raiz |
| 2 | Judicial sem aceitar "inconclusivo" | B | M | longo (retries em fontes externas) | baixa | B-E1; a fonte pode não permitir conclusão: termina em estado honesto, não em conteúdo |
| 3 | Sanções CEIS/CNEP/CEAF nunca verificadas | B | M | médio | média | B-E1: o dry-run fail-closed inexistente é a maior parte deste esforço |
| 4 | Destaques (0) na ficha do print | C | M | curto | média | contrato de dados + artefatos verificados da B |
| 5 | Daciolo: eleito por QP como "Não Eleito" | A | P | curto | alta | diagnóstico de camada (fonte→banco→API→DOM) |
| 6 | Daciolo: bens 2018/2008/2006 não coletados | B | M | longo (varredura TSE) | média | B-E1; mecanismo de backfill comum aos itens 9, 16 e 17 |
| 7 | Votações-chave: ampliar cobertura | C | G | médio | baixa | dataset editorial de escopo aberto; decisão editorial do Thiago define o corte |
| 8 | Autoria: dedupe + box destacado | C | P | curto | alta | nenhuma |
| 9 | Flávio: dinheiro de eleições disputadas | B | M | longo | média | B-E1; mecanismo comum ao item 6 |
| 10 | Flávio: datas contraditórias entre fontes | A | M | curto | média | prova de qual fonte está certa antes de escrever a regra de precedência |
| 11 | Hertz: card de dinheiro fora do padrão | D | P | curto | alta | nenhuma |
| 12 | Lula: candidatura 2018 indeferida exibida | A | M | curto | média | decisão de contrato (estado novo vs exclusão) + auditoria da base inteira |
| 13 | Renan: cargo partidário na timeline | A | P | curto | alta | diagnóstico persistido vs derivado |
| 14 | Renan: ampliar destaques | C | M | curto | média | contrato de dados + artefatos verificados da B |
| 15 | Zema: "eleição 2023" | A | P | curto | alta | prova persistido vs derivado |
| 16 | Rui: dinheiro incompleto entre candidaturas | B | M | longo | média | B-E1; mecanismo comum ao item 6 |
| 17 | Samara: patrimônio com dados faltando e layout | B (dados) + D (layout) | dados M; layout P | dados longo; layout curto | média | dados: B-E1 e mecanismo do item 6; layout: nenhuma |
| 18 | Email digest: layout | D | M | curto | alta | nenhuma |

## Sessão Raiz — montar base, integrar, lançar (abrir PRIMEIRO e voltar nela no FIM)

```text
Leia Settings/README.md primeiro. Depois leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md, QA/2026-08-09-avaliacao-auditoria-codex.md, QA/2026-08-09-prompts-sessoes-lancamento-v2.md e Settings/CANDIDATE_DATA_COMPLETENESS_WORKFLOW.md (etapa 6). Você é a SESSÃO RAIZ do lançamento: a única que aplica mudanças em banco, faz merge e conduz deploy. As trilhas A a D só preparam.

PROIBIÇÕES PERMANENTES: `git add -A`, `git stash`, e qualquer alteração, remoção ou commit NO checkout compartilhado (/Users/thiagosalvador/Documents/Apps/Pessoal/puxa-ficha), que está sujo e contém trabalho concorrente de outras sessões. Toda montagem acontece em worktree isolado.

FASE 1 (montar a base sem tocar o checkout):
1. Inventário read-only: `git status --porcelain` e classificação de CADA path modificado ou não rastreado em INCLUIR (contrato do lançamento: triagem, avaliação da auditoria, prompts v2, recortes.json, baseline, migration + rollback + allowlist da B2, testes e docs de QA associados) ou EXCLUIR (trabalho concorrente ou fora de escopo), com uma linha de justificativa por path.
2. Worktree isolado da base: `git worktree add <dir-isolado> HEAD -b base-lancamento`. O checkout compartilhado permanece intocado.
3. Gravar o manifesto de inclusão/exclusão em QA/2026-08-10-manifesto-base.md DENTRO do worktree isolado e me apresentar. A montagem só segue depois do meu OK sobre o manifesto. Importar para ele SOMENTE os paths aprovados no manifesto.
4. Prova antes do commit: `git -C <dir> add` path a path do manifesto (nunca -A); `git -C <dir> diff --staged --stat` e o diff completo conferidos contra o manifesto (nenhum path a mais, nenhum a menos); `git -C <dir> config user.name` e `user.email` conferindo Thiago Salvador / contato.thiagosalvador@gmail.com antes de commitar.
5. Commit da base no worktree isolado -> anote SHA_BASE. Sem push.
6. Receipt sem autorreferência: escrever QA/2026-08-10-base-lancamento.md DENTRO do worktree da base, contendo SHA_BASE, a tabela de propriedade de arquivos (abaixo) e o comando de worktree das trilhas; commitar como SEGUNDO commit do mesmo branch -> SHA_RECEIPT. O receipt referencia o PAI (SHA_BASE); o ponto de partida publicado para as trilhas é o TIP do branch `base-lancamento` (SHA_RECEIPT), que contém os contratos E o receipt. Consistência verificável: o SHA_BASE escrito no receipt é o pai do tip (`git log --oneline -2 base-lancamento`).
7. Publicar para mim: SHA_BASE, SHA_RECEIPT e o comando exato por trilha: `git worktree add ../puxa-ficha-trilha-<x> base-lancamento -b trilha-<x>`.

Propriedade de arquivos (vai no receipt; cada trilha só toca o que é dela):
- Trilha A: módulo de classificação/timeline em src/, testes correspondentes, migrations NOVAS da trilha, allowlist própria (scripts/audit/allowlist-trilha-a-*.json), proposta de recorte em scripts/audit/recortes-trilha-a.proposta.json.
- Trilha B: scripts/lib/ (coletores e modo dry-run), scripts de backfill, config de agendamento, relatórios de dry-run em QA/.
- Trilha C: módulos de destaques, autoria e votações em src/, dataset editorial, testes. Não toca o módulo de timeline (é da A).
- Trilha D: componentes de UI dos cards de dinheiro/patrimônio.
- EXCLUSIVO DA RAIZ: scripts/audit/recortes.json, baseline-escritas-sem-anotacao.json, aplicação de migrations, merge, deploy.

FASE 2 (integrar release candidate, quando as trilhas entregarem):
1. Integrar os branches das QUATRO trilhas, incluindo a C: a C entra no release candidate antes do release, desenvolvida contra os artefatos e o contrato de dados da B; a validação dela contra dados reais fica no readback final. Só você edita recortes.json: incorpore as propostas de recorte das trilhas.
2. Rodar o conjunto: suite completa, npm run check:dead-code, npm run audit:cobertura:allowlist (sem flags), build de produção.
3. Montar o mapa do release: migrations a aplicar (allowlist, recorte e rollback conferidos), coletas a disparar (dry-run aprovado), ordem de aplicação. A ordem importa: classificação (A) aplicada e re-materialização feita ANTES de qualquer superfície pública nova; re-materializar antes re-publica o dado errado.

FASE 3 (release serial, workflow canônico etapa 6):
CI verde -> aprovação -> ledger -> dry-run com allowlist -> aplicação no banco -> readback direto -> PR revisada -> merge -> deploy Ready no mesmo SHA -> revalidação de cache -> APIs -> páginas -> auditoria de cobertura. Cada ato irreversível (aplicar migration, disparar coleta que escreve, merge, deploy) exige MINHA autorização nomeando o ato, um por vez. Nenhuma etapa aceita o sucesso da anterior como prova da seguinte. Migration inesperada, CI vermelho ou deploy divergente interrompem o lançamento.

FASE 4 (verificação final):
Use a skill /workflow para a verificação adversarial: agentes em paralelo por ficha (Daciolo, Flávio, Hertz, Lula, Renan, Zema, Rui, Samara) conferindo a ficha renderizada em produção contra os itens da triagem que a citam, mais um passe transversal dos itens "Todos" (1, 2, 3, 4, 6) numa amostra além das 8, incluindo o readback da Trilha C contra dados reais. Cada agente tenta provar que o item NÃO foi resolvido.

DoD do lançamento (gate de 20 linhas):
- 18 itens da nota + 2 regressões de hoje: (R1) selo de frescor exibindo o dia anterior por conversão de fuso, corrigido em código; (R2) verificacao_campos da B2 para cleber-rabelo e gilberto-vasconcelos, migration 20260809070000. Cada linha com veredito verde/amarelo/vermelho e evidência (screenshot ou readback).
- Nenhum item de nível 1 ou 2 em vermelho. Estados honestos (indeterminado/erro com fonte e motivo) são amarelo aceitável se não houver afirmação falsa na superfície pública.
- Nenhuma ficha pública com dado factual contradito pelo raw da própria linha.
```

## Sessão A — classificação eleitoral (abrir depois que a Raiz publicar o branch)

```text
Leia Settings/README.md primeiro. Depois leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e o receipt QA/2026-08-10-base-lancamento.md (no branch base-lancamento). Crie seu worktree do tip do branch base-lancamento: `git worktree add ../puxa-ficha-trilha-a base-lancamento -b trilha-a`. Você prepara; quem aplica é a Sessão Raiz. Use plan mode antes de implementar.

Escopo: itens 12, 5, 10, 13 e 15 da triagem, nesta ordem (mesmo módulo, não paralelizar entre si).

MÉTODO OBRIGATÓRIO, por item: antes de decidir a camada do fix, rastrear fonte -> banco -> API -> DOM e registrar onde o dado diverge. Migration só se o readback provar dado persistido errado; se o banco está certo e a exibição erra, o fix é código (o caso do selo de frescor de hoje é o precedente: parecia banco, era conversão de exibição).

1. Item 12 (Lula): "2018 - Não Eleito, Candidatura: Presidente" para candidatura INDEFERIDA. Indeferido não é "concorreu e perdeu": criar estado próprio (indeferida/cancelada) ou excluir, decidindo pelo contrato existente. Auditar a base inteira por outros indeferidos exibidos como candidatura real (o print do Rui mostra PCO 2006 "Indeferido" com o mesmo defeito).
2. Item 5 (Daciolo): raw "ELEITO POR QP (TSE 2014)" exibido como "Não Eleito". Eleito por QP/média é eleito.
3. Item 10 (Flávio): raw "ELEITO (TSE 2018)" exibido como "Não Eleito" + mandatos sobrepostos (Dep. Estadual 2016-2019 vs Senador 2019-atual). Provar qual fonte está certa antes de definir a regra de precedência.
4. Item 13 (Renan): "Presidente Nacional do Partido Missão" na timeline eleitoral. Filtrar cargo interno de partido; auditar a base inteira, não só Renan.
5. Item 15 (Zema): "eleição 2023" em "Eleições sem dado publicado". Provar se o ano errado está persistido ou é derivado na geração; validar calendário eleitoral (ano par, tipo certo por ano).

Propriedade de arquivos (não sair dela): módulo de classificação/timeline, testes, migrations novas SUAS, allowlist própria (scripts/audit/allowlist-trilha-a-*.json), proposta de recorte em scripts/audit/recortes-trilha-a.proposta.json. NÃO editar scripts/audit/recortes.json nem o baseline: são da Raiz.

Se houver migration: cada INSERT/UPDATE/DELETE com `-- @write` na linha acima, rollback em supabase/rollback/, e conferência do recorte com `npm run audit:cobertura:allowlist -- --allowlist=<sua> --desde=<inicio> --ate=<fim>` (as três flags juntas; janela é prefixo de nome de arquivo).

Testes e DoD (parar em artefato local verificado; nada aplicado):
- Teste unitário novo por regra: eleito por QP, ELEITO no raw, indeferido, cargo partidário, ano ímpar. `node --import tsx --test tests/<arquivo>.test.ts`.
- Suite completa, `npm run check:dead-code` e build passam no worktree.
- Dry-run de migration forward e rollback em Postgres efêmero, com readback provando: Lula sem candidatura 2018 ativa, Daciolo 2014 eleito, Flávio 2018 eleito sem sobreposição de datas, Renan sem cargo partidário, Zema sem 2023.
- Reproduzir os 5 cenários originais DEPOIS do fix (screenshot ou readback local) e registrar por item: camada da causa (fonte/banco/API/DOM), fix, prova.
- Entrega final: branch trilha-a + resumo para a Raiz com o que aplicar e em que ordem.
```

## Sessão B — dry-runs e backfill de coletas (abrir em paralelo com a A)

```text
Leia Settings/README.md primeiro. Depois leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e o receipt QA/2026-08-10-base-lancamento.md (no branch base-lancamento). Crie seu worktree do tip do branch base-lancamento: `git worktree add ../puxa-ficha-trilha-b base-lancamento -b trilha-b`. Você prepara e diagnostica; quem aplica é a Sessão Raiz. PROIBIDO invocar qualquer coletor contra Supabase real nesta sessão.

Escopo: itens 3, 2, 6, 9, 16, 17 (dados) e 1 da triagem.

ENTREGA 1 (B-E1), pré-requisito de tudo: modo dry-run fail-closed nos coletores que esta trilha usa. Hoje scripts/lib/ingest-transparencia-sanctions.ts faz update/insert/delete sem flag de dry-run. O modo deve: (a) ser fail-closed, sem caminho de escrita quando ativo; (b) listar universo de fichas, identidades, tabelas e linhas planejadas por operação; (c) registrar resultado por fonte (encontrado, vazio_confirmado, indeterminado, erro) sem mutação. Testar o modo com teste automatizado que prova zero escrita.

ENTREGA 2 (B-E2), assim que o B-E1 estiver testado: publicar o CONTRATO DE DADOS para a Trilha C: formas das tabelas/campos que as coletas vão gravar, estados terminais possíveis e fixtures representativas derivadas dos relatórios de dry-run. A Trilha C desenvolve contra isso, sem esperar aplicação.

Depois, com o dry-run pronto:
1. Item 3 (sanções CEIS/CNEP/CEAF): dry-run para todas as fichas com "ainda não verificados". Relatório de contagem para a Raiz.
2. Item 2 (judicial inconclusivo): dry-run/diagnóstico com retry e fontes adicionais. Estado que continuar indeterminado ou erro após tentativa real PERMANECE indeterminado/erro, com motivo e fonte: não vira ausência nem ficha limpa. Duas falhas iguais sem evidência nova encerram a frente com bloqueio documentado. Saída: lista de curadoria manual para mim.
3. Itens 6/9/16/17: backfill ÚNICO de bens e dinheiro varrendo todas as candidaturas de todas as fichas (base: gerar-backfill-patrimonio-tse*.ts), em modo dry-run: contagens antes/depois planejadas. Casos de verificação: Daciolo 2018/2008/2006, Flávio, Rui, Samara.
4. Item 1: preparar (não ativar) o agendamento do re-run de patrimônio para 16/08, na convenção de automação do projeto. Ativação é ato da Raiz.

Regras: timeout explícito (até 600000ms) em execuções longas, rodar em background. Armadilha do unstable_cache em src/lib/api.ts: nunca retornar degradado/vazio de dentro do cache numa falha; lançar. Propriedade de arquivos: scripts/lib/, scripts de backfill, config de agendamento, relatórios em QA/. Migrations novas suas seguem o gate (@write, rollback, allowlist própria, proposta de recorte em arquivo separado); recortes.json e baseline são da Raiz.

Testes e DoD (parar em artefato local verificado; zero escrita em Supabase real):
- Teste automatizado provando que o dry-run não escreve (fail-closed).
- Contrato de dados + fixtures publicados para a Trilha C (B-E2).
- Relatórios de dry-run por coleta: universo, tabelas, linhas planejadas, resultado por fonte com estado terminal honesto (encontrado / vazio_confirmado / sem_achado_no_escopo / indeterminado / erro / nao_aplicavel), fonte e data.
- Suite, check:dead-code e build passam no worktree.
- Entrega final: branch trilha-b + relatórios + lista do que a Raiz deve autorizar e aplicar, com contagens esperadas por ato.
```

## Sessão C — destaques, votações, autoria (item 8 já; itens 4/14/7 quando a B entregar B-E2)

```text
Leia Settings/README.md primeiro. Depois leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e o receipt QA/2026-08-10-base-lancamento.md (no branch base-lancamento). Crie seu worktree do tip do branch base-lancamento: `git worktree add ../puxa-ficha-trilha-c base-lancamento -b trilha-c`. Você prepara; quem aplica é a Sessão Raiz. Não toque no módulo de timeline (é da Trilha A).

Escopo e ordem:
1. Item 8 (pode começar agora): autoria legislativa: dedupe de proposições de ementa idêntica (caso Daciolo: 4 REQs iguais da PEC 446/09 listados) e promoção da proposição mais relevante (o PL) ao box destacado.
2. Itens 4+14 (quando a Trilha B publicar o B-E2, o contrato de dados com fixtures; NÃO esperar aplicação em produção): expandir a busca/heurística de destaques desenvolvendo contra as fixtures do contrato. Objetivo: onde existir conteúdo real (trajetória, patrimônio, votação, processo), a busca encontra e mostra. Onde NÃO existir após busca honesta, a ficha exibe estado vazio honesto, nunca conteúdo criado para preencher tela. O gate é zero afirmações falsas, não zero fichas vazias. Casos de teste: a ficha do print com Destaques (0) e Renan com 1. A validação contra dados reais acontece no readback final da Raiz, não aqui.
3. Item 7 (não depende da B): ampliar votações-chave (caso Daciolo: 2 votações num mandato de 4 anos). Expandir o dataset editorial e o matching por candidato. Toda votação com fonte rastreável. O corte editorial de quais votações entram é decisão do Thiago: propor a lista, não decidir sozinho.

Regra 0: nada de conteúdo inventado. Destaque e votação só com fonte rastreável no código ou no dado. Propriedade de arquivos: módulos de destaques/autoria/votações, dataset editorial, testes. Migrations novas suas seguem o gate; recortes.json e baseline são da Raiz.

Testes e DoD (parar em artefato local verificado):
- Teste unitário do dedupe de autoria, da promoção ao box e da regra de estado mínimo honesto de destaques, rodando contra as fixtures do B-E2.
- Readback local (fixtures): contagem de fichas com destaques vazios antes/depois, separando "vazio porque não há conteúdo real" (aceitável, documentado) de "vazio porque a busca não olhou" (bug); distribuição de votações por ficha antes/depois.
- Reproduzir os prints originais (autoria Daciolo, votações Daciolo, ficha com 0, Renan com 1) DEPOIS do fix, com screenshot local.
- Suite, check:dead-code e build passam no worktree.
- Entrega final: branch trilha-c + resumo para a Raiz, sinalizando o que só fecha no readback contra dados reais.
```

## Sessão D — layout (abrir em paralelo, worktree próprio)

```text
Leia Settings/README.md primeiro. Depois leia QA/2026-08-09-triagem-18-ajustes-pre-lancamento.md e o receipt QA/2026-08-10-base-lancamento.md (no branch base-lancamento). Crie seu worktree do tip do branch base-lancamento: `git worktree add ../puxa-ficha-trilha-d base-lancamento -b trilha-d`. Frontend puro. Você prepara; quem faz merge é a Sessão Raiz.

Escopo:
1. Itens 11+17 (layout): card "Patrimônio declarado" (casos Hertz e Samara) fora do padrão dos demais cards de dinheiro: tipografia própria e área vazia enorme. Alinhar ao padrão visual do site.

O item 18 (layout do email de digest) fica fora deste release candidate e será tratado em sessão ou PR posterior.

Propriedade de arquivos: componentes de UI dos cards de dinheiro/patrimônio. Nada além disso.

Testes e DoD (parar em artefato local verificado):
- Verificação visual real (gate duro): screenshot do card corrigido nas fichas do Hertz e da Samara em preview local, comparado ao padrão dos outros cards. Build passar não prova tela certa.
- Responsivo verificado (mobile) nos cards.
- Suite, `npm run check:dead-code` e build passam no worktree.
- Entrega final: branch trilha-d + screenshots para a Raiz.
```
