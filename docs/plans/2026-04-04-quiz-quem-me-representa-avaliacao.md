# Avaliacao do plano "Quem Me Representa?" (Quiz de alinhamento)

> Documento: avaliacao tecnica e editorial do plano em [`2026-04-04-quiz-quem-me-representa.md`](./2026-04-04-quiz-quem-me-representa.md)  
> Data: 2026-04-04  
> Escopo: alinhamento com arquitetura do repo (Next.js 15, ISR, `api.ts`, Supabase, mock fallback), regras em `AGENTS.md` / `CLAUDE.md`, riscos de implementacao

## Sintese

O plano esta **alinhado com o diferencial do Puxa Ficha** (cruzar votos reais, PLs, financiamento e transparencia) e com o fluxo editorial que o projeto ja prega (disclaimers, nao ser recomendacao de voto, fontes publicas). A **fatiacao em fases** (MVP votos + espectro, depois posicoes/PL/compartilhamento) e sensata dado o gargalo conhecido de `votacoes_chave` / votos cruzados.

O plano principal foi **atualizado (pos-auditoria)** e incorpora decisoes sobre esses pontos; ver [`2026-04-04-quiz-quem-me-representa.md`](./2026-04-04-quiz-quem-me-representa.md) secoes 4.3, 5, 6.1, 9.1.

---

## Atualizacao pos-revisao do plano (2026-04-04)

O documento de plano foi revisado pelo autor e agora inclui, entre outras coisas:

- **Fonte de verdade MVP**: perguntas e espectro em `src/data/quiz/*.ts`; Supabase so para dados de candidatos e, na fase 2, `posicoes_declaradas`.
- **Dataset agregado**: contrato `getQuizAlignmentDatasetResource()` com `DataResource`, `unstable_cache` e mock fallback (alinhado ao comparador).
- **URL de share**: encoding por bits (3 bits por Likert) + `v=1`, meta de tamanho, mensagem se o schema for antigo.
- **Go/no-go**: criterios numericos antes de lancar (sec. 9.1).
- **Reponderacao** por fase do algoritmo e tratamento de candidato **sem votos** no Congresso.
- **Mini-projeto** de financiamento por setor explicitado na fase 3.

**O que ainda depende so da implementacao (nao do texto do plano)**

- A query SQL de exemplo na secao 6.1 e um rascunho: na pratica usar **queries Supabase separadas** (candidatos, `votacoes_chave` por titulo, `votos_candidato` filtrado) ou uma view dedicada, para evitar `json_agg` duplicado por join com `projetos_lei`.
- **UUIDs de votacao** nao devem ser hardcoded no repo: o codigo deve mapear **`votacao_titulos` -> id** via `votacoes_chave.titulo` em runtime (cada banco gera UUIDs diferentes no seed).
- **Normalizacao de partido**: manter **uma funcao client-safe** (`party-utils.ts`) alinhada a `normalizePartyValue` de `party-canonical.ts` (sem importar scripts Node no bundle do quiz).

---

## Pontos fortes

- **Dados reais ja modelados**: `votacoes_chave`, `votos_candidato`, `projetos_lei`, `financiamento`, `mudancas_partido` existem no schema e sao carregados hoje em `src/lib/api.ts` (ex.: join `votos_candidato` + `votacoes_chave` por candidato na ficha).
- **Filtro "so presidente"** no MVP encaixa no padrao existente: `getCandidatosComparaveis` em `api.ts` ja usa `cargo ?? "Presidente"` e `v_comparador`.
- **Privacidade (calculo no browser)** e narrativa de produto coerentes; o servidor so precisa entregar um **dataset pre-agrupado** (idealmente via ISR / `unstable_cache` como o comparador), sem enviar respostas do usuario.
- **Riscos editoriais** (mapeamento partidario controverso, percepcao de enviesamento) ja listados; reforcar na UI com metodologia e fontes fecha bem com a linha "transparencia" do plano.

---

## Atensoes em relacao as regras do repositorio

| Regra / contexto | Como o plano se encaixa |
| ---------------- | ------------------------ |
| "NAO usar IA para ranking, recomendacao de voto ou decisao editorial automatica" (`AGENTS.md`) | O score proposto e **deterministico** a partir de regras e dados publicos, nao LLM. Ainda assim, **linguagem de produto** deve evitar "teu candidato" / "deveria votar"; manter o framing do proprio plano ("alinhamento", nao endosso). |
| `pontos_atencao` / IA | Fase 2 (`posicoes_declaradas` com possivel IA) deve seguir o padrao ja exigido: `gerado_por`, `verificado`, e **nao misturar** com curadoria humana sem revisao. |
| Anti-pattern "NAO usar SSR" para dados volateis | O plano combina com **ISR + bundle enxuto**: uma RSC carrega o dataset em build/revalidate; o quiz em si e client-heavy (GSAP ja esta no projeto). |

Nada no plano **viola** diretamente as anti-regras, desde que posicoes geradas por IA nao entrem no score publico sem `verificado = true` (o proprio plano ja sugere curadoria).

---

## Lacunas tecnicas a fechar no desenho

### 1. Payload para o client (performance e manutencao)

Hoje os votos sao buscados **por candidato** na ficha. Para o quiz, seria ingenuo reutilizar `getCandidatoBySlug` em loop: N+1 queries e payload enorme.

**Recomendacao**: uma funcao dedicada em `src/lib/api.ts`, por exemplo `getQuizAlignmentDatasetResource(cargo)`, que em **uma ou poucas queries** retorne:

- lista minima de candidatos (id, slug, nome, partido, foto);
- votos apenas para `votacao_id` que aparecem no mapeamento do quiz;
- agregados de PL por `tema` (contagens), nao lista completa de projetos;
- para financiamento fase 3: **vetor ou flags pre-computados** (ex.: share por categoria), nao `maiores_doadores` cru, senao o plano exige novo pipeline de categorizacao.

Isso conversa com a mitigacao "dados pre-processados no build" da secao 9 do plano original.

### 2. Contradicao interna: `quiz_perguntas` / `espectro_partidario` no SQL vs "JSON estatico"

O plano propoe tabelas na secao 5 e, na secao 6.1, fala em JSON estatico ou hardcoded.

**Sugestao de decisao**:

- **MVP**: JSON/TS versionado no repo (deploy = atualizacao de conteudo, sem migration) para perguntas e espectro; menos superficie RLS/migrations.
- **Quando precisar de CMS sem deploy**: migrar para Supabase com politicas `SELECT` publicas espelhando `votacoes_chave`.

Documentar uma escolha evita duplicar fonte de verdade.

### 3. URL `?r=BASE64` (compartilhamento)

15-20 respostas Likert (+ opcional importancia) em base64 pode **estourar limites praticos** (WhatsApp, X) e gerar links quebrados.

**Alternativas a especificar**: compactacao (ex. lz-string), codificacao binaria minima (2-3 bits por resposta), ou **versao curta do schema** (`v=1` + payload). Validar tamanho maximo alvo (por exemplo abaixo de 2k caracteres).

### 4. OG image dinamica (fase 3)

O projeto ja usa `opengraph-image.tsx` em rotas. Para `/quiz/resultado` com query, e viavel, mas e preciso alinhar com **cache** e **limite de runtime** (Edge). Vale um spike curto antes de prometer "card viral" na fase 3.

### 5. Modo mock e `sourceStatus`

Qualquer pagina nova que dependa de bundle agregado precisa de **fallback** quando `USE_MOCK` ou `degraded`, senao o quiz some ou quebra em dev/CI sem Supabase. Espelhar o padrao `DataResource` ja usado no comparador.

### 6. Normalizacao de `partido_sigla`

A tabela proposta de espectro usa siglas em maiusculas; o banco pode divergir. O mapeamento deve passar por **normalizacao unica** (mesma funcao usada na UI e no score).

---

## Dependencias de dados (honestidade operacional)

- O plano cita corretamente que **votacoes-chave e votos cruzados estao parciais**; o MVP "so votos + espectro" ainda pode ficar **dominado pelo espectro** se faltar cobertura de votos, o que enfraquece o discurso "baseado em acoes". Para o MVP, prever na UI **indicador por candidato** ("poucos votos mapeados neste quiz") e **reponderar** a dimensao (como ja sugerido na tabela de riscos do plano).

- **Financiamento por setor** (fase 3) nao e so SQL: exige modelo de categorias e possivel enriquecimento na ingestao; tratar como **mini-projeto de dados**, nao so front.

---

## Conclusao

O plano e **forte em visao de produto e coerente com o banco e com a stack**. Para executar no repo atual, vale **amarrar** o desenho do dataset agregado em `api.ts`, a estrategia de armazenamento de perguntas/espectro (repo vs Supabase), o contrato de URL de share, e o comportamento em **mock/degraded**. Com isso, a sequencia SDD (`/sdd-research` > break > execute) mencionada no proprio plano faz sentido.

---

## Checklist sugerido (pos-avaliacao)

1. Decidir fonte de verdade: JSON no repo (MVP) vs tabelas `quiz_perguntas` / `espectro_partidario` no Supabase.
2. Especificar contrato tipo `getQuizAlignmentDataset`: queries agregadas, colunas minimas, revalidate/tags, mock fallback.
3. Especificar encoding compacto da URL e limite de tamanho; validar em WhatsApp/X.
4. Checklist de cobertura de `votacoes_chave`/votos antes de marketing forte em "acoes reais".
