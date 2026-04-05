# Quiz "Quem Me Representa?" - Feature Completa v2

> **Nota (2026-04-04):** documento historico da entrega v2. O encoding da URL evoluiu para **v3** (Likert + bit de importancia por pergunta). Fonte de verdade: `src/data/quiz/perguntas.ts` (`QUIZ_VERSION`), `src/lib/quiz-encoding.ts`. Exemplos abaixo com `v=2` referem-se ao periodo intermediario; links novos usam `v=3`.

## Context

O quiz foi implementado como MVP (fase 1) com 10 perguntas e scoring baseado em votos + espectro partidario. Apos teste real, 7 problemas/evolucoes foram identificados:

1. **P1**: Perguntas ambiguas que nao funcionam com escala Likert ("X ou Y?" nao combina com "Concordo/Discordo")
2. **P2**: Resultado sem explicacao do ranking (so mostra %, nao diz POR QUE)
3. **P3**: Perguntas so cobrem centro, nao diferenciam extremos (comunista, ancap, autoritario)
4. **P4**: Bug: usuario comunista recebeu Flavio Bolsonaro a 72.3% (1 voto coincidente dominou o score)
5. **P5**: Mostra todos os candidatos, deveria mostrar top 3
6. **P6**: Suporte a governadores (quiz por UF)
7. **P7**: Perfil politico da pessoa com arquetipos + card compartilhavel

---

## Root Cause do Bug (P4)

- Usuario em (eco:1, soc:1), PL em (eco:8, soc:9)
- score_espectro = 16.5% (distancia maxima)
- Bolsonaro tem apenas 1 voto mapeado que coincidiu com o usuario
- Pesos fixos: `0.6154 * ~1.0 + 0.3846 * 0.165 = ~68-72%`
- **1 voto recebe 61.5% do peso total. Um unico match casual domina o resultado.**

Agravante: 9 de 10 perguntas so mapeiam eixo economico, apenas 1 mapeia eixo social. O score_espectro nao consegue diferenciar conservador de progressista.

---

## Plano de Implementacao

### Etapa 1: Reescrever perguntas como afirmacoes (P1 + P3)

**Arquivo**: `src/data/quiz/perguntas.ts`

Reescrever todas as perguntas como afirmacoes declarativas. Adicionar 5 perguntas cobrindo eixo social e extremos. Total: 15 perguntas.

**Perguntas reescritas**:

| ID | Texto atual | Texto novo | Mudanca de direcao? |
|----|-------------|------------|---------------------|
| q01 | "A reforma trabalhista de 2017 foi boa para os trabalhadores?" | "A reforma trabalhista de 2017 beneficiou os trabalhadores brasileiros." | Nao |
| q02 | "O teto de gastos protege a economia ou prejudica servicos publicos?" | "O teto de gastos publicos foi necessario para proteger a economia brasileira." | Nao |
| q03 | (ja ok) | (manter) | - |
| q04 | (ja ok) | (manter) | - |
| q05 | (ja ok) | (manter) | - |
| q06 | (ja ok) | (manter) | - |
| q07 | (ja ok) | (manter) | - |
| q08 | (ja ok) | (manter) | - |
| q09 | "Programas como Bolsa Familia sao investimento social ou assistencialismo?" | "Programas de transferencia de renda como o Bolsa Familia sao um investimento social necessario." | Sim: direcao_voto → `concordo=sim`, eixo_economico_dir → `concordo=estado` |
| q10 | (ja ok) | (manter) | - |

**Perguntas novas (q11-q15)** cobrindo gaps do espectro:

| ID | Eixo | Texto | economico_dir | social_dir | O que diferencia |
|----|------|-------|--------------|------------|------------------|
| q11 | costumes | "A posse de armas de fogo deveria ser um direito garantido a todo cidadao." | - | concordo=conservador | direita vs centro |
| q12 | costumes | "O ensino religioso deveria ter espaco nas escolas publicas." | - | concordo=conservador | laico vs religioso |
| q13 | direitos_sociais | "O Estado deveria garantir moradia e saude como direitos universais, mesmo que isso aumente impostos." | concordo=estado | concordo=progressista | esquerda radical vs centro-esquerda |
| q14 | seguranca | "As Forcas Armadas deveriam ter um papel mais ativo na seguranca publica." | - | concordo=conservador | autoritario vs libertario (proxy do eixo social; mistura autoritarismo institucional com costumes, mas e a melhor aproximacao em 2 eixos) |
| q15 | economia | "Empresas estrategicas como Petrobras e Vale deveriam ser 100% estatais." | concordo=estado | - | extrema-esquerda vs centro-esquerda |

**Resultado**: de 1 para 5 perguntas com eixo social. Cobertura de posicoes extremas (armamento, estatizacao total, militarismo, estado laico, direitos universais).

Incrementar `QUIZ_VERSION` de 1 para 2 **(feito)**; posteriormente **v3** adiciona importancia por pergunta no payload (ver repo).

---

### Etapa 2: Corrigir scoring com pesos dinamicos (P4)

**Arquivo**: `src/lib/quiz-scoring.ts`

Substituir pesos fixos por funcao que escala com confianca:

```typescript
function dynamicWeights(votosComparados: number): { wVoto: number; wEspectro: number } {
  if (votosComparados === 0) return { wVoto: 0, wEspectro: 1 }
  if (votosComparados === 1) return { wVoto: 0.30, wEspectro: 0.70 }
  if (votosComparados === 2) return { wVoto: 0.50, wEspectro: 0.50 }
  return { wVoto: W_VOTO_MVP, wEspectro: W_ESPECTRO_MVP }  // 3+: 61.5/38.5
}
```

Impacto no bug: `0.30 * 1.0 + 0.70 * 0.165 = 41.6%` (medio, nao "alto alinhamento").

---

### Etapa 3: Adicionar explicacao ao resultado (P2)

**Arquivos**: `src/lib/quiz-types.ts`, `src/lib/quiz-scoring.ts`

Novos tipos:

```typescript
export interface QuizScoreExplanation {
  resumo: string
  user_position: { eco: number; soc: number }
  candidato_position: { eco: number; soc: number }
  peso_voto_usado: number
  peso_espectro_usado: number
}
```

Adicionar campo `explanation: QuizScoreExplanation` ao `QuizScoreResult`.

Gerar `resumo` com logica:
- Distancia por eixo: "Proximo no eixo economico" (dist <= 2) ou "Distante no eixo social" (dist >= 5)
- Votacoes: "Concordou em N votacao(oes)" ou "Divergiu em N votacao(oes)"
- Sem votos: "Baseado no espectro do partido"

---

### Etapa 4: Top 3 + "Ver todos" (P5)

**Arquivo**: `src/components/quiz/QuizResult.tsx`

- `useState(false)` para `showAll`
- Renderizar `ranked.slice(0, 3)` por default
- Botao "Ver todos os N candidatos" expande a lista

**Arquivo**: `src/components/quiz/QuizResultCard.tsx`

- Mostrar `score.explanation.resumo` abaixo do badge de confiabilidade

---

### Etapa 5: Perfil politico com arquetipos (P7)

**Arquivos novos**:
- `src/data/quiz/arquetipos.ts` - definicao dos arquetipos
- `src/components/quiz/QuizPerfil.tsx` - card do perfil politico

**Conceito**: a partir da posicao do usuario nos eixos economico (1-10) e social (1-10), derivada pelas respostas, atribuir um arquetipo politico. O arquetipo aparece antes do ranking de candidatos como "Seu perfil politico".

**Grade de arquetipos** (mutuamente exclusiva, sem sobreposicao):

A grade cobre o plano 1-10 x 1-10 sem lacunas. Cada celula pertence a exatamente um arquetipo. Regra de prioridade: match exato de faixa; em caso de empate (fronteira), usar a celula com menor distancia euclidiana ao centro do arquetipo.

| Faixa eco | Faixa soc | Arquetipo | Descricao curta |
|-----------|-----------|-----------|-----------------|
| 1-2 | 1-3 | Revolucionario | Estado forte, transformacao social radical |
| 1-2 | 4-7 | Socialista | Economia estatal, moderado nos costumes |
| 1-2 | 8-10 | Esquerda conservadora | Estado na economia, conservador nos costumes |
| 3-4 | 1-3 | Social-democrata progressista | Redistribuicao com direitos amplos |
| 3-4 | 4-7 | Social-democrata | Centro-esquerda classico |
| 3-4 | 8-10 | Populista de esquerda | Redistribuicao com pauta conservadora |
| 5-6 | 1-3 | Centrista progressista | Pragmatico com pauta de direitos |
| 5-6 | 4-7 | Centrista | Pragmatico, sem posicao fixa |
| 5-6 | 8-10 | Centro-conservador | Moderado na economia, tradicional nos costumes |
| 7-8 | 1-3 | Liberal progressista | Livre mercado com pauta de direitos |
| 7-8 | 4-7 | Liberal | Direita economica, moderado nos costumes |
| 7-8 | 8-10 | Conservador liberal | Direita economica e social |
| 9-10 | 1-3 | Libertario | Estado minimo, liberdades individuais maximas |
| 9-10 | 4-7 | Ultra-liberal | Mercado radical, neutro nos costumes |
| 9-10 | 8-10 | Direita radical | Mercado radical, conservadorismo forte |

**15 arquetipos, grade 5x3, cobertura total sem sobreposicao.**

**Disclaimer obrigatorio**: todo card de arquetipo exibe fixo: "Rotulo simplificado para reflexao. Nao e classificacao cientifica nem define quem voce e."

Alinhamento com AGENTS.md: nenhum arquetipo e apresentado como verdade factual. E heuristica de quiz com disclaimer explicito.

**Funcao de classificacao** em `src/lib/quiz-scoring.ts`:

```typescript
export function classificarPerfil(eco: number, soc: number): QuizArquetipo {
  // lookup na grade 5x3, retornar arquetipo da celula
  // eco: Math.ceil(eco / 2) → faixa 1-5
  // soc: soc <= 3 ? 0 : soc <= 7 ? 1 : 2 → coluna 0-2
}
```

**UI do perfil** em `QuizPerfil.tsx`:
- Card com nome do arquetipo, descricao curta, disclaimer
- Mini-grafico 2D (SVG leve) mostrando posicao do usuario nos eixos
- Compartilhamento via Web Share API + URL com parametros (sem `html2canvas`)

**Decisao sobre html2canvas**: removido do escopo. Web Share API + link compartilhavel ja cobre P7. OG image dinamica (server-side, Vercel Edge) e candidata para fase futura quando houver spike de cache validado. `html2canvas` adiciona pacote pesado, problemas com CSP e Safari, e nao justifica no MVP do perfil.

**Integracao no resultado**: O perfil aparece ACIMA do ranking de candidatos em `QuizResult.tsx`:

```tsx
<QuizPerfil userPosition={userPosition} />
<h2>Candidatos mais alinhados</h2>
<ol>{top3}</ol>
```

---

### Etapa 6: Suporte a governadores (P6)

**Mudancas de API e cache**:

`getQuizAlignmentDatasetResource` hoje so recebe `cargo`. Para governadores, precisa de `estado`. Assinatura atualizada:

```typescript
// api.ts
async function getQuizAlignmentDatasetResourceUncached(
  cargo = "Presidente",
  estado?: string
): Promise<DataResource<QuizAlignmentDataset>>
```

Mudancas internas:
- Usar `getCandidatosResourceUncached(cargo, estado)` em vez de so `cargo`
- Cache: o wrapper `unstable_cache` do Next.js diferencia entradas pelos **argumentos** passados na chamada. Passar `(cargo, estado ?? "")` na funcao exportada garante que combinacoes Presidente / Governador+UF nao se misturem, sem precisar repetir `cargo` e `estado` no array estatico de keyParts (o prefixo `["quiz-alignment-dataset-resource"]` basta).

```typescript
const getCachedQuizAlignmentDatasetResource = unstable_cache(
  async (cargo: string, estado: string) =>
    getQuizAlignmentDatasetResourceUncached(cargo, estado || undefined),
  ["quiz-alignment-dataset-resource"],
  { revalidate: APP_DATA_REVALIDATE_SECONDS, tags: ["quiz-dataset"] }
)

export async function getQuizAlignmentDatasetResource(
  cargo = "Presidente",
  estado?: string
): Promise<DataResource<QuizAlignmentDataset>> {
  return getCachedQuizAlignmentDatasetResource(cargo, estado ?? "")
}
```

**Mock para governadores**:

`buildMockQuizAlignmentDataset()` precisa aceitar `cargo` e `estado`:

```typescript
export function buildMockQuizAlignmentDataset(
  cargo = "Presidente",
  estado?: string
): QuizAlignmentDataset
```

Filtrar `MOCK_CANDIDATOS` por `cargo_disputado` e `estado` antes de montar o dataset. Garantir que mock tenha pelo menos 2-3 candidatos governadores para teste (verificar se `MOCK_CANDIDATOS` ja tem).

**Mudancas de roteamento**:

**Arquivos**:
- `src/app/quiz/page.tsx` - landing com selector de cargo
- `src/app/quiz/perguntas/page.tsx` - receber `cargo` e `uf` via searchParams
- `src/app/quiz/resultado/page.tsx` - passar `cargo` e `uf` para `getQuizAlignmentDatasetResource`

**Flow do usuario**:

```
/quiz → Escolher: "Presidente" ou "Governador"
  → Se Governador: escolher UF (dropdown dos 26 estados + DF)
  → /quiz/perguntas?cargo=Governador&uf=SP
  → /quiz/resultado?cargo=Governador&uf=SP&v=3&r=ENCODED
```

**Propagacao de parametros**: `QuizContainer` precisa ler `cargo` e `uf` dos searchParams e propagar no `router.push` para resultado. Hoje (L33) faz:

```typescript
router.push(`/quiz/resultado?${buildQuizResultQuery(next)}`)
```

Mudar para:

```typescript
const cargoParam = searchParams.get("cargo") ?? "Presidente"
const ufParam = searchParams.get("uf") ?? ""
const base = buildQuizResultQuery(next)
const extra = cargoParam !== "Presidente" ? `&cargo=${cargoParam}&uf=${ufParam}` : ""
router.push(`/quiz/resultado?${base}${extra}`)
```

**Resultado page**: `QuizResultadoPage` (L22) hoje chama `getQuizAlignmentDatasetResource("Presidente")`. Mudar para ler `cargo` e `uf` dos searchParams e passar ambos.

**Landing** em `QuizLanding.tsx`:
- Dois botoes: "Presidente" e "Governador"
- Se Governador: dropdown de UF (nao usar `BrazilMap.tsx` na landing para evitar peso de pagina desnecessario; o mapa e SVG pesado com GSAP. Dropdown simples com as 27 UFs e suficiente. Se quiser mapa depois, lazy-load)
- Link para `/quiz/perguntas?cargo=Governador&uf=XX`

**Nota**: governadores tipicamente nao tem votos no Congresso, entao scoring sera 100% espectro. O badge "Sem historico de votacoes" ja existe e cobre isso.

**Encoding**: `cargo` e `uf` ficam na query string separados (nao no payload base64). O payload base64 contem respostas Likert e, a partir da **v3**, um bit de importancia por pergunta. O decoder aceita v1, v2 e v3; `?v=` na URL indica a versao.

---

### Etapa 7: Atualizar testes

**Arquivos**: `tests/quiz-scoring.test.ts`, `tests/quiz-encoding.test.ts`

**Testes com fixtures sinteticas** (nao depender de mock real):

```typescript
// Fixture: candidato sintetico para testes determinísticos
const FIXTURE_CANDIDATO_PL: QuizCandidatoData = {
  id: "test-pl", slug: "test-pl", nome_urna: "Teste PL",
  partido_sigla: "PL", foto_url: null,
  cargo_disputado: "Presidente", estado: null,
  votos: { "votacao-1": "sim" }  // 1 voto
}

const FIXTURE_CANDIDATO_PSOL: QuizCandidatoData = {
  id: "test-psol", slug: "test-psol", nome_urna: "Teste PSOL",
  partido_sigla: "PSOL", foto_url: null,
  cargo_disputado: "Presidente", estado: null,
  votos: { "votacao-1": "nao", "votacao-2": "nao", "votacao-3": "nao" }
}
```

Novos testes:
- **Regressao P4**: usuario extrema-esquerda vs fixture PL → score < 50%
- **Regressao P4**: usuario extrema-direita vs fixture PSOL → score < 50%
- **Pesos dinamicos**: 0 votos → wVoto=0; 1 voto → wVoto=0.30; 3 votos → wVoto=0.6154
- **Explicacao**: resumo preenchido, user_position coerente com respostas
- **Arquetipos**: (1,1) → Revolucionario; (10,10) → Direita radical; (5,5) → Centrista
- **Encoding roundtrip**: 15 perguntas encode+decode = identico
- Testes existentes ajustados para novos pesos dinamicos

---

## Sequencia de Execucao

```
Etapa 1: Perguntas (perguntas.ts)
    |
Etapa 2: Scoring fix (quiz-scoring.ts, quiz-types.ts)
    |
Etapa 3: Explicacao (quiz-scoring.ts, quiz-types.ts)
    |
Etapa 4: Top 3 UI (QuizResult.tsx, QuizResultCard.tsx)
    |
Etapa 5: Perfil politico (arquetipos.ts, QuizPerfil.tsx, quiz-scoring.ts)
    |
Etapa 6: Governadores (api.ts, mock.ts, quiz/page.tsx, perguntas/page.tsx,
         resultado/page.tsx, QuizContainer.tsx, QuizLanding.tsx, quiz-encoding.ts)
    |
Etapa 7: Testes (fixtures sinteticas, regressao, roundtrip)
    |
Build + verificacao
```

Etapas 1-4 sao o core (corrigem os bugs e problemas reportados).
Etapa 5 e a feature de perfil.
Etapa 6 e a expansao para governadores.

---

## Arquivos Criticos

| Arquivo | Mudanca |
|---------|---------|
| `src/data/quiz/perguntas.ts` | Reescrever + 5 novas, bump version |
| `src/lib/quiz-scoring.ts` | Pesos dinamicos + explicacao + classificarPerfil() |
| `src/lib/quiz-types.ts` | QuizScoreExplanation + QuizArquetipo |
| `src/data/quiz/arquetipos.ts` | **Novo**: grade 5x3 de arquetipos |
| `src/components/quiz/QuizResult.tsx` | Top 3 + perfil acima do ranking |
| `src/components/quiz/QuizResultCard.tsx` | Mostrar resumo da explicacao |
| `src/components/quiz/QuizPerfil.tsx` | **Novo**: card do perfil politico com disclaimer |
| `src/components/quiz/QuizContainer.tsx` | Propagar cargo/uf nos searchParams |
| `src/components/quiz/QuizLanding.tsx` | Selector presidente/governador + dropdown UF |
| `src/app/quiz/page.tsx` | Passar cargo para landing |
| `src/app/quiz/perguntas/page.tsx` | Receber cargo/uf via searchParams |
| `src/app/quiz/resultado/page.tsx` | Passar cargo/uf para getQuizAlignmentDatasetResource |
| `src/lib/api.ts` | Assinatura `(cargo, estado?)`, cache com chave composta |
| `src/lib/quiz-encoding.ts` | cargo/uf na query string (separado do payload base64) |
| `src/data/mock.ts` | `buildMockQuizAlignmentDataset(cargo, estado?)` |
| `tests/quiz-scoring.test.ts` | Fixtures sinteticas, regressao, arquetipos |
| `tests/quiz-encoding.test.ts` | Roundtrip com 15 perguntas |

Funcoes existentes reutilizadas:
- `getCandidatosResourceUncached(cargo, estado)` em `src/lib/api.ts:517` (ja aceita ambos)
- `normalizePartySigla()` em `src/lib/party-utils.ts`
- `CandidatePhoto` em `src/components/CandidatePhoto.tsx`
- `AlignmentBar` em `src/components/quiz/AlignmentBar.tsx`
- `buildQuizResultQuery()` em `src/lib/quiz-encoding.ts`

---

## Decisoes Tecnicas

| Decisao | Motivo |
|---------|--------|
| html2canvas removido do escopo | Pacote pesado, problemas CSP/Safari, Web Share + link ja cobre P7 |
| BrazilMap.tsx nao usado na landing do quiz | SVG pesado com GSAP, dropdown de UF e suficiente e mais acessivel |
| cargo/uf na query string, nao no payload base64 | Mantem encoding simples, decoder nao precisa ramo por versao |
| Fixtures sinteticas nos testes | Nao depender de mock real, determinístico, funciona em CI |
| Grade 5x3 sem sobreposicao | Evita ambiguidade na classificacao, cada ponto do plano tem exatamente 1 arquetipo |
| q14 (FFAA) como proxy do eixo social | Em 2 eixos, autoritarismo institucional e melhor aproximacao para conservadorismo. Nao e multidimensional |
| Disclaimer obrigatorio em arquetipos | Alinhamento com AGENTS.md: heuristica de quiz, nao classificacao cientifica |

---

## Verificacao

```bash
npm test                    # testes unitarios (scoring, encoding, arquetipos); CI nao depende de nomes reais de candidatos
npm run lint                # sem erros
npm run build               # build ok, rotas /quiz geradas
npm run dev                 # testar manualmente:
                            #   - responder como extrema-esquerda
                            #     → perfil "Revolucionario" + disclaimer
                            #     → Bolsonaro < 50%, PSOL/PT no top 3
                            #   - responder como centro
                            #     → perfil "Centrista"
                            #     → resultados variados
                            #   - responder como extrema-direita
                            #     → perfil "Direita radical"
                            #     → PL no top, PSOL no bottom
                            #   - resultado mostra perfil + top 3 + explicacao
                            #   - "Ver todos" expande lista
                            #   - quiz de governador:
                            #     → selecionar UF no dropdown
                            #     → ver candidatos filtrados
                            #     → badge "Sem historico de votacoes" esperado
                            #   - link compartilhado preserva cargo/uf/respostas
```
