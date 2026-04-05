# Quem Me Representa? (Quiz de Alinhamento)

> Status: **Fase 1 e 2 implementadas no repositório** (2026-04-04). Produção pública e Supabase remoto exigem **deploy promovido** e **migrations aplicadas** para refletir rotas e tabelas (ex.: `posicoes_declaradas`).
> Prioridade: alta (feature viral, diferencial de produto)
> Estimativa de complexidade: 5+ arquivos, requer `/sdd-research` > `/sdd-break` > `/sdd-execute`
> Ultima atualizacao: 2026-04-04 (alinhamento doc vs codigo)

## Visao geral

Quiz interativo onde o usuario responde perguntas sobre temas politicos e recebe um ranking de alinhamento com os candidatos. Diferente de quizzes simplistas de "esquerda ou direita", o **modelo de score atual** combina votacoes-chave, espectro partidario, posicoes declaradas curadas (quando a tabela existe no banco), volume de projetos por tema e alertas qualitativos (contradicoes em votos, mudancas de partido). **Financiamento e historico politico nao entram no calculo hoje**; seguem no roadmap de produto (secoes 1.5, 1.7 e fases futuras).

O resultado nao e "vote nesse candidato". E "esses sao os candidatos cujas acoes mais se alinham (ou desalinham) com o que voce disse acreditar".

---

## 1. Fontes de dados para alinhamento

### 1.1 Votacoes-chave (ja existe)

- Tabela `votacoes_chave` com tema, descricao e impacto_popular
- Tabela `votos_candidato` com voto real (sim/nao/abstencao/ausente)
- Temas ja categorizados: trabalho, economia, meio_ambiente, etc.
- Join existente em `api.ts`: `supabase.from("votos_candidato").select("*, votacao:votacoes_chave(*)").eq("candidato_id", id)`
- **Peso no score: alto** (acao concreta, verificavel)
- **Risco**: cobertura parcial. Nem todos os candidatos tem votos registrados (ex: governadores que nunca foram congressistas). Ver secao 9.1 (criterio go/no-go).

### 1.2 Espectro partidario (novo)

- Criar mapeamento de partidos para espectro ideologico
- Dimensoes: economico (estado vs mercado) + social (progressista vs conservador)
- Baseado em classificacoes academicas (ex: Latinobarometro, pesquisas do CESOP/Unicamp)
- Nao e "esquerda/direita" binario: escala de 1-10 em cada eixo
- **Peso no score: medio** (partido indica tendencia, mas individuo pode divergir)
- **Fonte de verdade no MVP**: arquivo TypeScript no repo (`src/data/quiz/espectro-partidario.ts`), nao tabela Supabase. Ver secao 5.

Mapeamento inicial proposto:

| Partido      | Economico (1=estado, 10=mercado) | Social (1=progressista, 10=conservador) |
| ------------ | -------------------------------- | --------------------------------------- |
| PSTU         | 1                                | 1                                       |
| PCO          | 1                                | 2                                       |
| UP           | 1                                | 1                                       |
| PSOL         | 2                                | 1                                       |
| PT           | 3                                | 3                                       |
| PCDOB        | 3                                | 3                                       |
| PDT          | 3                                | 4                                       |
| PSB          | 4                                | 3                                       |
| PV           | 4                                | 3                                       |
| CIDADANIA    | 5                                | 4                                       |
| PSD          | 5                                | 5                                       |
| MDB          | 5                                | 5                                       |
| PSDB         | 6                                | 4                                       |
| PODE         | 6                                | 5                                       |
| UNIAO        | 6                                | 6                                       |
| PP           | 7                                | 6                                       |
| AVANTE       | 6                                | 6                                       |
| REPUBLICANOS | 7                                | 8                                       |
| PL           | 8                                | 9                                       |
| NOVO         | 9                                | 5                                       |
| DC           | 5                                | 9                                       |
| PRTB         | 7                                | 8                                       |
| MISSAO       | 5                                | 8                                       |

> Esse mapeamento precisa de revisao editorial antes de publicar. Fonte sugerida: Banco de Dados Legislativos do CEBRAP + Latinobarometro.

### 1.3 Posicoes declaradas / Wikipedia (parcialmente existe)

- Campo `biografia` ja tem texto da Wikipedia
- Extrair posicoes explicitas de temas (ex: "defende privatizacao da Petrobras", "contra o aborto")
- Pode ser feito por curadoria humana ou por IA com revisao
- Se gerado por IA: obrigatorio `gerado_por: "ia"` + `verificado: false` + so entra no score apos `verificado: true` (regra CLAUDE.md/AGENTS.md)
- Nova tabela Supabase: `posicoes_declaradas` (ver secao 5.3, fase 2)
- Estrutura: `{ tema: string, posicao: string, fonte: string, url: string }`
- **Peso no score: alto** (declaracao publica, rastreavel)
- **Fase**: 2 (nao MVP)

### 1.4 Projetos de lei por tema (ja existe)

- Tabela `projetos_lei` com campo `tema`
- Autoria de PLs revela prioridades reais do candidato
- Agrupar por tema e contar: se alguem tem 15 PLs sobre seguranca e 0 sobre educacao, isso diz algo
- **Pre-processamento necessario**: contagem por tema por candidato no dataset agregado (nao enviar lista completa de PLs pro client)
- **Peso no score: medio** (indica prioridade, nao necessariamente posicao)
- **Fase**: 2

### 1.5 Financiamento (ja existe)

- Tabela `financiamento` com `maiores_doadores` (JSONB: `[{nome, valor, tipo}]`)
- Candidato financiado por agronegocio vs sindicatos vs fundo publico
- **Mini-projeto de dados necessario**: categorizar doadores por setor (agro, industria, financeiro, sindical, religioso, etc.). Os doadores atuais tem `tipo` (PF/PJ/fundo), mas nao setor. Exige:
  - Modelo de categorias (enum de setores)
  - Script de enriquecimento ou curadoria para classificar doadores
  - Campo novo em `financiamento` ou tabela auxiliar `doadores_classificados`
- **Peso no score: baixo-medio** (indireto, mas revelador)
- **Fase**: 3 (depende de mini-projeto de classificacao de doadores)

### 1.6 Contradicoes (ja existe)

- `votos_candidato.contradicao` + `pontos_atencao` categoria "contradicao"
- Nao entra no score, mas aparece como alerta no resultado: "Atencao: este candidato votou contra X apesar de declarar ser a favor"
- **Uso: qualitativo no resultado, nao no score**
- **Fase**: 2 (aparece no detalhamento por candidato)

### 1.7 Mudancas de partido (ja existe)

- Tabela `mudancas_partido`
- Indica consistencia ideologica
- Pular de PSOL pra PL e diferente de pular de PSB pra PT
- Calculo de "indice de consistencia": soma das distancias euclidianas no espectro entre partidos antigo e novo, normalizada
- **Peso no score: baixo** (contextual, aparece no detalhamento)
- **Fase**: 2

---

## 2. Design do quiz

### 2.1 Estrutura

**15-20 perguntas**, organizadas em 6-8 eixos tematicos:

| Eixo             | Exemplo de pergunta                                                                    |
| ---------------- | -------------------------------------------------------------------------------------- |
| Economia         | "O governo deveria controlar precos de alimentos e combustiveis?"                      |
| Trabalho         | "A reforma trabalhista de 2017 foi boa para os trabalhadores?"                         |
| Seguranca        | "A solucao para a violencia e mais policia ou mais politicas sociais?"                 |
| Meio ambiente    | "O Brasil deveria priorizar preservacao ambiental mesmo que desacelere o agronegocio?" |
| Direitos sociais | "Programas como Bolsa Familia sao investimento social ou assistencialismo?"            |
| Politica fiscal  | "O teto de gastos protege a economia ou prejudica servicos publicos?"                  |
| Corrupcao        | "Foro privilegiado deveria ser abolido para todos os politicos?"                       |
| Costumes         | "O Estado deveria interferir em questoes como aborto e casamento homoafetivo?"         |

### 2.2 Formato das respostas

Cada pergunta tem 5 opcoes (escala Likert):

- Concordo totalmente
- Concordo parcialmente
- Neutro / nao tenho opiniao
- Discordo parcialmente
- Discordo totalmente

Opcionalmente: pergunta de importancia ("Esse tema e importante pra voce?" sim/nao) para ponderar o peso.

### 2.3 Mapeamento pergunta > dado

Cada pergunta e mapeada para:

1. **Votacoes-chave** correspondentes (quando existem)
2. **Posicao no eixo ideologico** (economico ou social)
3. **Temas de PL** relacionados (fase 2)
4. **Posicoes declaradas** correspondentes (fase 2)

Exemplo:

```
Pergunta: "A reforma trabalhista de 2017 foi boa para os trabalhadores?"
→ Votacao: "Reforma Trabalhista" (votacao_id: X)
   Concordo totalmente = espera voto "sim"
   Discordo totalmente = espera voto "nao"
→ Eixo economico: concordo = mais mercado (8-10), discordo = mais estado (1-3)
→ Temas PL: "trabalho", "direitos_trabalhistas"
→ Posicoes: buscar posicoes com tema "trabalho"
```

### 2.4 Flow do usuario

```
[Landing /quiz] → [Pergunta 1/N] → ... → [Pergunta N/N] → [Processando...] → [Resultado]
                                                                                    |
                                                                            [Compartilhar]
                                                                            [Ver detalhes]
                                                                            [Comparar top 2]
                                                                            [Refazer]
```

- Progress bar no topo
- Uma pergunta por tela (mobile-first)
- Animacao suave entre perguntas (GSAP, ja no projeto)
- Sem login, sem cadastro, sem email
- Resultado calculado no client (nenhum dado do usuario sai do browser)
- Tela "Processando..." com animacao (1-2s, calculo real + UX de "estamos analisando")

---

## 3. Algoritmo de alinhamento

### 3.1 Score composto

Para cada candidato, calcular score de 0-100:

```
score_final = (
    w1 * score_votacoes +      // peso 0.40
    w2 * score_espectro +      // peso 0.25
    w3 * score_posicoes +      // peso 0.20  (fase 2, 0 no MVP)
    w4 * score_projetos +      // peso 0.10  (fase 2, 0 no MVP)
    w5 * score_financiamento   // peso 0.05  (fase 3, 0 no MVP)
) * 100
```

**Reponderacao dinamica no MVP**: como posicoes, projetos e financiamento nao existem na fase 1, os pesos sao redistribuidos proporcionalmente:

```
MVP:
  score_votacoes:  0.40 / 0.65 = 0.615
  score_espectro:  0.25 / 0.65 = 0.385

Fase 2 (com posicoes + projetos):
  score_votacoes:  0.40 / 0.95 = 0.421
  score_espectro:  0.25 / 0.95 = 0.263
  score_posicoes:  0.20 / 0.95 = 0.211
  score_projetos:  0.10 / 0.95 = 0.105

Fase 3 (completo):
  pesos originais (somam 1.0)
```

### 3.2 Calculo por dimensao

**score_votacoes** (0.0 a 1.0):

Para cada pergunta `q` que tem `votacao_ids` mapeados:
1. Converter resposta Likert do usuario para valor numerico: `{concordo_total: 1.0, concordo_parcial: 0.75, neutro: 0.5, discordo_parcial: 0.25, discordo_total: 0.0}`
2. Para cada candidato, pegar o voto na votacao correspondente
3. Converter voto do candidato: se `direcao_voto = "concordo=sim"`, entao `sim = 1.0`, `nao = 0.0`, `abstencao = 0.5`, `ausente = null`, `obstrucao = 0.3`
4. Se voto = null (ausente ou nao participou): excluir essa pergunta do calculo desse candidato
5. Score = `1.0 - |valor_usuario - valor_candidato|` (match perfeito = 1.0, oposto = 0.0)
6. Media ponderada de todas as perguntas validas (com peso de importancia se marcado)

**Candidatos sem votos**: se um candidato nao tem NENHUM voto mapeado nas perguntas do quiz, `score_votacoes = null`. O peso e redistribuido para espectro. Na UI, exibir badge "Sem historico de votacoes no Congresso" (governadores, candidatos novos).

**score_espectro** (0.0 a 1.0):

1. Derivar posicao do usuario nos eixos a partir das respostas:
   - Para cada pergunta com `eixo_economico_dir` definido, acumular o valor Likert na direcao indicada
   - Idem para `eixo_social_dir`
   - Normalizar para escala 1-10
2. Buscar posicao do partido do candidato no mapeamento `espectro-partidario.ts`
3. Se candidato tem `espectro_override`, usar override
4. Calcular distancia euclidiana normalizada:
   ```
   dist = sqrt((user_eco - cand_eco)^2 + (user_soc - cand_soc)^2) / sqrt(81 + 81)
   score = 1.0 - dist
   ```
   Max distancia possivel: sqrt(162) ~= 12.73, normaliza para 0-1.

**score_posicoes** (0.0 a 1.0, fase 2):

Para cada pergunta com temas mapeados:
1. Buscar `posicoes_declaradas` do candidato com tema correspondente
2. Se posicao do candidato concorda com resposta do usuario: 1.0
3. Se ambiguo: 0.5
4. Se discorda: 0.0
5. Se nao tem posicao declarada: excluir da media
6. So considerar posicoes com `verificado: true`

**score_projetos** (0.0 a 1.0, fase 2):

1. Para cada eixo tematico do quiz, contar PLs do candidato com tema correspondente
2. Normalizar: candidato com mais PLs naquele tema entre todos = 1.0, zero PLs = 0.0
3. Se usuario marcou eixo como "importante", o bonus e proporcional ao ranking de PLs do candidato
4. Se usuario nao marcou importancia, contribuicao neutra (0.5)

**score_financiamento** (0.0 a 1.0, fase 3):

Depende do mini-projeto de classificacao de doadores. Estrutura prevista:
1. Pergunta extra no quiz: "De onde deveria vir o dinheiro de campanha?" (fundo publico / doacao individual / nao me importo)
2. Calcular share por categoria de financiamento do candidato
3. Match entre preferencia do usuario e realidade do financiamento

### 3.3 Ponderacao por importancia

Se o usuario marcou "esse tema e importante":
- O peso daquela pergunta DOBRA no calculo de `score_votacoes` e `score_posicoes`
- Temas marcados como "nao importante" mantem peso normal (nao zera)
- Implementacao: multiplicar por 2.0 no numerador e denominador da media ponderada

Exemplo com 3 perguntas, uma marcada como importante:
```
Sem importancia:     media = (s1 + s2 + s3) / 3
Com p2 importante:   media = (s1 + 2*s2 + s3) / 4
```

---

## 4. Pagina de resultado

### 4.1 Ranking

Lista ordenada de candidatos com:

- Foto (via `CandidatePhoto.tsx` existente) + nome + partido
- Barra de alinhamento (0-100%) com cor gradiente (vermelho < 40%, amarelo 40-70%, verde > 70%)
- Tag: "Alto alinhamento" (>70%), "Medio" (40-70%), "Baixo" (<40%)
- Badge de confiabilidade: "Baseado em N votacoes" ou "Dados limitados" se poucos datapoints
- Botao "Ver ficha completa" (link para `/candidato/{slug}`)
- Botao "Comparar" (abre comparador com top 2)

### 4.2 Detalhamento por candidato (fase 2)

Ao clicar num candidato no ranking, expandir (padrao `ExpandableCard.tsx` existente):

- Breakdown por eixo: "Economia: 85% | Trabalho: 30% | Meio ambiente: 90%"
- Secao "Onde voces concordam": lista de votacoes/posicoes onde houve match, com link para fonte
- Secao "Onde voces discordam": idem para mismatches
- Alertas de contradicao: "Declarou ser contra X, mas votou a favor" (com fonte)
- Indice de consistencia ideologica: baseado em mudancas de partido
- Cada datapoint com icone de fonte (TSE, Camara, Senado, Wikipedia)

### 4.3 Compartilhamento

#### URL de compartilhamento

Encoding compacto das respostas (nao base64 bruto):

```
Formato: /quiz/resultado?v=1&r=ENCODED_STRING

Cada resposta = 3 bits:
  000 = concordo_total
  001 = concordo_parcial
  010 = neutro
  011 = discordo_parcial
  100 = discordo_total

Importancia (se habilitada) = 1 bit por pergunta

20 perguntas * 3 bits = 60 bits = 8 bytes
20 importancias * 1 bit = 20 bits = 3 bytes
Total: 11 bytes → base64url = ~15 caracteres

URL exemplo: /quiz/resultado?v=1&r=aBcDeFgHiJk
```

- `v=1` = versao do schema (permite quebrar backward compat quando perguntas mudam)
- Validacao: se `v` nao bate com versao atual, mostrar mensagem "Este resultado foi gerado com uma versao anterior do quiz. Refaca para resultado atualizado."
- **Limite testado**: URL total < 200 caracteres (seguro para WhatsApp, X, Telegram, SMS)

#### OG image dinamica (fase 3)

- Route handler em `/quiz/resultado/opengraph-image/route.tsx`
- Recebe parametros `v` e `r` da query string
- Gera imagem 1200x630 com: titulo "Meu alinhamento", top 3 candidatos com foto + percentual
- Cache por combinacao de parametros (muitas combinacoes possiveis, considerar edge runtime)
- **Spike antes de implementar**: testar limite de combinacoes no cache da Vercel Edge

#### Botoes de share

- "Compartilhar no X" (intent URL com texto pre-preenchido)
- "Compartilhar no WhatsApp" (wa.me link com URL)
- "Copiar link" (clipboard API)
- "Compartilhar" nativo (Web Share API onde disponivel, fallback para os anteriores)

---

## 5. Fonte de verdade dos dados do quiz

### Decisao: JSON/TypeScript no repo para MVP, Supabase para dados de candidatos

A auditoria identificou contradicao entre propor tabelas SQL e falar em JSON estatico. Decisao:

**No repo (versionado, deploy = atualizacao)**:
- Perguntas do quiz: `src/data/quiz/perguntas.ts`
- Espectro partidario: `src/data/quiz/espectro-partidario.ts`
- Mapeamento pergunta > votacao: embutido no objeto de pergunta

**No Supabase (dados de candidatos, ja existem)**:
- `votos_candidato` + `votacoes_chave` (votos reais)
- `projetos_lei` (contagens por tema, pre-agregadas no dataset)
- `financiamento` (shares por tipo, pre-agregadas)
- `posicoes_declaradas` (tabela nova, fase 2)

**Quando migrar perguntas/espectro para Supabase**: quando/se precisar de CMS sem deploy (ex: editor de perguntas no admin). Nao e necessario no MVP.

### 5.1 Arquivo: `src/data/quiz/perguntas.ts`

```typescript
export interface QuizPergunta {
  id: string                      // "q01", "q02", etc.
  eixo: QuizEixo
  texto: string                   // texto da pergunta
  contexto?: string               // "Entenda melhor" (fase 2)
  ordem: number

  // Mapeamentos para score
  votacao_ids?: string[]           // UUIDs de votacoes_chave
  direcao_voto: "concordo=sim" | "concordo=nao"
  eixo_economico_dir?: "concordo=mercado" | "concordo=estado"
  eixo_social_dir?: "concordo=progressista" | "concordo=conservador"
  temas_pl?: string[]             // temas de PL para match (fase 2)
}

export type QuizEixo =
  | "economia"
  | "trabalho"
  | "seguranca"
  | "meio_ambiente"
  | "direitos_sociais"
  | "politica_fiscal"
  | "corrupcao"
  | "costumes"

export type RespostaLikert =
  | "concordo_total"
  | "concordo_parcial"
  | "neutro"
  | "discordo_parcial"
  | "discordo_total"

export const LIKERT_VALUES: Record<RespostaLikert, number> = {
  concordo_total: 1.0,
  concordo_parcial: 0.75,
  neutro: 0.5,
  discordo_parcial: 0.25,
  discordo_total: 0.0,
}

// Versao do payload na URL (?v=). No repo: v1 = 10 perguntas; v2 = Likert (15); v3 = Likert + bit de importancia por pergunta.
// Fonte de verdade: `src/data/quiz/perguntas.ts` e `src/lib/quiz-encoding.ts` (nao copiar numeros deste bloco sem conferir).
export const QUIZ_VERSION = 3

export const QUIZ_PERGUNTAS: QuizPergunta[] = [
  // curadoria editorial: Thiago preenche
]
```

### 5.2 Arquivo: `src/data/quiz/espectro-partidario.ts`

```typescript
export interface EspectroPartidario {
  partido_sigla: string
  eixo_economico: number    // 1 (estado) a 10 (mercado)
  eixo_social: number       // 1 (progressista) a 10 (conservador)
  fonte?: string
  notas?: string
}

export const ESPECTRO_PARTIDARIO: EspectroPartidario[] = [
  { partido_sigla: "PSTU", eixo_economico: 1, eixo_social: 1, fonte: "CEBRAP" },
  { partido_sigla: "PCO", eixo_economico: 1, eixo_social: 2, fonte: "CEBRAP" },
  // ... todos os partidos
]

// Lookup rapido
export const ESPECTRO_MAP = new Map(
  ESPECTRO_PARTIDARIO.map(e => [e.partido_sigla, e])
)
```

### 5.3 Tabela Supabase: `posicoes_declaradas` (fase 2)

```sql
CREATE TABLE posicoes_declaradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  tema TEXT NOT NULL,           -- "privatizacao", "aborto", "reforma_tributaria"
  posicao TEXT NOT NULL,        -- "a favor", "contra", "ambiguo"
  descricao TEXT,               -- frase exata ou resumo
  fonte TEXT,                   -- "Wikipedia", "entrevista Folha 2024-01", etc.
  url_fonte TEXT,
  verificado BOOLEAN DEFAULT FALSE,
  gerado_por TEXT DEFAULT 'curadoria',  -- "ia" | "curadoria" | "automatico"

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidato_id, tema)    -- um candidato, uma posicao por tema
);

CREATE INDEX idx_posicoes_candidato ON posicoes_declaradas (candidato_id);
CREATE INDEX idx_posicoes_tema ON posicoes_declaradas (tema);
```

### 5.4 Campo opcional em `candidatos`

```sql
ALTER TABLE candidatos ADD COLUMN espectro_override JSONB;
-- formato: {"eixo_economico": 7, "eixo_social": 3}
-- para candidatos que divergem muito do partido
```

---

## 6. Arquitetura tecnica

### 6.1 Dataset agregado: `getQuizAlignmentDatasetResource()`

Funcao dedicada em `src/lib/api.ts`. NAO reutiliza `getCandidatoBySlug` em loop.

```typescript
// Tipo do dataset que vai pro client
export interface QuizCandidatoData {
  id: string
  slug: string
  nome_urna: string
  partido_sigla: string
  foto_url: string | null
  cargo_disputado: string
  estado: string | null

  // Votos: somente para votacoes mapeadas no quiz
  votos: Record<string, string>    // votacao_id -> "sim" | "nao" | "abstencao" | "obstrucao"
  // (ausente = key nao existe)

  // PLs por tema (fase 2): contagem
  pls_por_tema?: Record<string, number>  // tema -> count

  // Financiamento (fase 3): shares pre-calculados
  financiamento_shares?: {
    fundo_publico: number        // 0.0 a 1.0
    pessoa_fisica: number
    recursos_proprios: number
  }

  // Contradicoes (fase 2)
  contradicoes?: Array<{
    votacao_titulo: string
    descricao: string
  }>

  // Indice de consistencia (fase 2)
  mudancas_partido_count?: number

  // Override de espectro (se diverge do partido)
  espectro_override?: {
    eixo_economico: number
    eixo_social: number
  } | null
}

export interface QuizAlignmentDataset {
  candidatos: QuizCandidatoData[]
  votacoes_mapeadas: string[]   // lista de votacao_ids usados no quiz
}
```

**Implementacao (Supabase)**:

```sql
-- Query principal: uma chamada, retorna tudo
SELECT
  c.id, c.slug, c.nome_urna, c.partido_sigla, c.foto_url,
  c.cargo_disputado, c.estado, c.espectro_override,

  -- votos (somente votacoes do quiz)
  json_agg(DISTINCT jsonb_build_object(
    'votacao_id', vc.votacao_id::text,
    'voto', vc.voto
  )) FILTER (WHERE vc.votacao_id IS NOT NULL) AS votos_raw,

  -- PLs por tema (fase 2)
  json_agg(DISTINCT jsonb_build_object(
    'tema', pl.tema,
    'count', pl_count.total
  )) FILTER (WHERE pl.tema IS NOT NULL) AS pls_por_tema_raw

FROM candidatos c
LEFT JOIN votos_candidato vc ON vc.candidato_id = c.id
  AND vc.votacao_id = ANY($1::uuid[])  -- filtro: so votacoes do quiz
LEFT JOIN LATERAL (
  SELECT tema, COUNT(*) as total
  FROM projetos_lei
  WHERE candidato_id = c.id AND tema IS NOT NULL
  GROUP BY tema
) pl_count ON true
LEFT JOIN projetos_lei pl ON pl.candidato_id = c.id

WHERE c.publicavel = true
  AND c.status != 'removido'
  AND c.cargo_disputado = $2  -- "Presidente" ou "Governador"
GROUP BY c.id
```

**Padroes do projeto mantidos**:
- Retorna `DataResource<QuizAlignmentDataset>` (live/mock/degraded)
- Usa `withSupabaseRetry()` para resiliencia
- Cached via `unstable_cache` com revalidate 3600s (mesmo padrao do comparador)
- Tag de cache: `["quiz-dataset", cargo]`

**Mock fallback**:

```typescript
// src/data/mock.ts - adicionar
export const MOCK_QUIZ_DATASET: QuizAlignmentDataset = {
  candidatos: MOCK_CANDIDATOS
    .filter(c => c.cargo_disputado === "Presidente")
    .map(c => ({
      id: c.id,
      slug: c.slug,
      nome_urna: c.nome_urna,
      partido_sigla: c.partido_sigla,
      foto_url: c.foto_url,
      cargo_disputado: c.cargo_disputado,
      estado: c.estado,
      votos: {},  // mock sem votos
    })),
  votacoes_mapeadas: [],
}
```

### 6.2 Paginas

```
src/app/quiz/page.tsx                  → Landing (RSC, ISR)
src/app/quiz/perguntas/page.tsx        → Quiz (client component, "use client")
src/app/quiz/resultado/page.tsx        → Resultado (RSC carrega dataset, client calcula)
src/app/quiz/resultado/opengraph-image/route.tsx  → OG image (fase 3)
```

**Detalhe de `/quiz/resultado/page.tsx`**:

O RSC carrega o dataset via `getQuizAlignmentDatasetResource()` e passa como prop para o client component `QuizResult`. O client component:
1. Le respostas do state (se veio do quiz) ou da query string `?v=1&r=...` (se veio de link compartilhado)
2. Valida versao do schema
3. Calcula scores client-side
4. Renderiza ranking

```typescript
// page.tsx (server)
export default async function QuizResultadoPage() {
  const datasetResource = await getQuizAlignmentDatasetResource("Presidente")
  return (
    <QuizResult
      dataset={datasetResource.data}
      sourceStatus={datasetResource.sourceStatus}
    />
  )
}
```

### 6.3 Componentes novos

| Componente | Responsabilidade | Client/Server | Fase |
|------------|-----------------|---------------|------|
| `QuizLanding.tsx` | Hero, explicacao, CTA "Comecar", disclaimers | Server | 1 |
| `QuizQuestion.tsx` | Uma pergunta com escala Likert, animacao GSAP | Client | 1 |
| `QuizProgress.tsx` | Barra de progresso + numero da pergunta | Client | 1 |
| `QuizContainer.tsx` | Gerencia state das respostas, navegacao entre perguntas | Client | 1 |
| `QuizResult.tsx` | Ranking completo, calcula scores | Client | 1 |
| `QuizResultCard.tsx` | Card individual de candidato no ranking | Client | 1 |
| `AlignmentBar.tsx` | Barra visual de alinhamento 0-100% (reutilizavel) | Client | 1 |
| `QuizDetailPanel.tsx` | Detalhamento por eixo ao expandir candidato | Client | 2 |
| `QuizShareButtons.tsx` | Botoes de compartilhamento + URL encoding | Client | 2 |
| `QuizShareCard.tsx` | Card para OG image (server-rendered) | Server | 3 |

### 6.4 Modulo de calculo: `src/lib/quiz-scoring.ts`

Funcao pura, sem side effects, testavel unitariamente:

```typescript
export interface QuizScoreResult {
  candidato_slug: string
  score_final: number           // 0-100
  score_votacoes: number | null // null se sem votos
  score_espectro: number
  score_posicoes: number | null // null se fase 1
  score_projetos: number | null
  score_financiamento: number | null
  confiabilidade: "alta" | "media" | "baixa"  // baseado em quantos datapoints
  detalhamento_por_eixo: Record<QuizEixo, number>
}

export function calcularAlinhamento(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  candidato: QuizCandidatoData,
  perguntas: QuizPergunta[],
  espectro: EspectroPartidario | null,
  faseAtual: 1 | 2 | 3
): QuizScoreResult {
  // ... logica do algoritmo descrita na secao 3
}

export function rankearCandidatos(
  respostas: Map<string, { valor: RespostaLikert; importante: boolean }>,
  dataset: QuizAlignmentDataset,
  perguntas: QuizPergunta[],
  espectroMap: Map<string, EspectroPartidario>,
  faseAtual: 1 | 2 | 3
): QuizScoreResult[] {
  // calcular para cada candidato, ordenar por score_final desc
}
```

### 6.5 Privacidade

- Nenhum dado do usuario e enviado ao servidor
- Respostas ficam em state do React (useState), nunca em cookie/localStorage
- URL de compartilhamento contem apenas as respostas codificadas (15 chars), nao identificacao
- Disclosure claro na landing: "Suas respostas nao sao armazenadas e nao saem do seu navegador"
- Nao usar analytics para rastrear respostas individuais (so metricas agregadas: quiz_started, quiz_completed)

### 6.6 Normalizacao de `partido_sigla`

O espectro partidario usa siglas em uppercase. Para evitar mismatch com o banco (que pode ter variantes), toda comparacao passa pela funcao `resolveCanonicalParty()` ja existente em `scripts/lib/party-canonical.ts`. Importar e reutilizar no client:

```typescript
// Extrair a logica de normalizacao para src/lib/party-utils.ts (client-safe)
// Sem dependencia de Node.js
export function normalizePartySigla(sigla: string): string {
  return sigla
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .toUpperCase()
}
```

---

## 7. Conteudo editorial

### 7.1 Tom

- Perguntas em linguagem acessivel, nao tecnica
- Evitar jargao legislativo ("Voce apoia a PEC 241?" -> "O governo deveria ter um limite fixo de quanto pode gastar com saude e educacao?")
- Cada pergunta com tooltip/expandir "Entenda melhor" com contexto breve (fase 2)
- Tom conversacional, nao academico: "O que voce acha?" nao "Qual sua opiniao sobre a materia X?"

### 7.2 Disclaimers

Na landing e no resultado:

- "Este quiz nao e recomendacao de voto"
- "O alinhamento e baseado em dados publicos e pode nao refletir a posicao atual do candidato"
- "Posicoes politicas sao mais complexas do que um quiz consegue capturar"
- "Candidatos sem dados suficientes podem ter score menos preciso"
- "Suas respostas nao sao armazenadas"

No footer da landing: link para "Metodologia" com explicacao detalhada dos pesos e fontes.

### 7.3 Transparencia

- Mostrar de onde vem cada datapoint no detalhamento (fase 2)
- Link direto para a votacao/posicao/PL que gerou o match ou mismatch
- Peso de cada dimensao visivel (nao escondido): "Votos no Congresso: 40% | Espectro do partido: 25% | ..."
- Metodologia acessivel via link (pagina ou secao expandivel)
- Botao "Discordo da classificacao" no espectro de cada partido (coleta feedback, nao muda o score)

---

## 8. Fases de implementacao

### Fase 1: MVP (scope minimo viavel)

**Dados**:
- 10 perguntas com mapeamento para votacoes + eixos ideologicos
- Espectro partidario (JSON no repo, revisado editorialmente)
- `getQuizAlignmentDatasetResource()` em `api.ts` com mock fallback

**UI**:
- Landing (`/quiz`) com hero, explicacao, disclaimers, CTA
- Quiz (`/quiz/perguntas`) com 10 perguntas, progresso, animacao GSAP
- Resultado (`/quiz/resultado`) com ranking simples (foto, nome, partido, barra, tag)

**Score**: `score_votacoes` (61.5%) + `score_espectro` (38.5%)

**Nao inclui**: detalhamento por eixo, compartilhamento, posicoes, PLs, financiamento, "Entenda melhor"

**Criterio de done**: quiz funciona end-to-end em mobile e desktop, mock fallback funciona, nenhum dado sai do browser

### Fase 2: Fontes expandidas + compartilhamento

**Dados**:
- Tabela `posicoes_declaradas` no Supabase (curadoria de ~50 posicoes para top 10 candidatos)
- Contagens de PL por tema no dataset
- Contradicoes no dataset

**UI**:
- Detalhamento por eixo ao clicar num candidato
- "Onde voces concordam / discordam" com fontes linkadas
- Alertas de contradicao
- Indice de consistencia (mudancas de partido)
- URL de compartilhamento com encoding compacto
- Botoes de share (X, WhatsApp, copiar link)
- "Entenda melhor" em cada pergunta

**Score**: `score_votacoes` (42.1%) + `score_espectro` (26.3%) + `score_posicoes` (21.1%) + `score_projetos` (10.5%)

### Fase 3: Experiencia completa

**Dados**:
- Mini-projeto de classificacao de doadores por setor
- Financiamento shares no dataset

**UI**:
- OG image dinamica para compartilhamento
- Score de financiamento
- Extensao para governadores (quiz por UF, perguntas estaduais adicionais)
- Pergunta extra sobre financiamento de campanha

**Score**: formula completa com 5 dimensoes

---

## 9. Riscos e mitigacoes

### 9.1 Criterio go/no-go (cobertura de dados)

O quiz so faz sentido publicar se tiver dados suficientes. Criterios minimos antes de lancar:

**Go**:
- Minimo 8 votacoes-chave com votos cruzados de pelo menos 60% dos candidatos presidenciaveis
- Espectro partidario revisado editorialmente (todas as siglas que aparecem no quiz cobertas)
- Pelo menos 5 dos top 10 candidatos com 3+ votos mapeados

**No-go** (adiar lancamento):
- Menos de 5 votacoes com votos cruzados
- Mais de 50% dos candidatos sem NENHUM voto
- Espectro sem revisao editorial

**Monitorar pos-lancamento**:
- % de candidatos no resultado com badge "Dados limitados"
- Se > 40%, considerar esconder esses candidatos ou separar em secao "Dados insuficientes"

### 9.2 Outros riscos

| Risco | Mitigacao |
| ----- | --------- |
| Mapeamento ideologico controverso | Fonte academica, disclosure, botao "discordo da classificacao" |
| Poucos votos pra alguns candidatos | Badge "Dados limitados", redistribuir peso para espectro, indicar N de datapoints |
| Perguntas enviesadas | Revisao editorial multipla, testar com usuarios de diferentes perfis |
| Candidato alega deturpacao | Todas as fontes sao publicas e linkadas, metodologia transparente |
| Compartilhamento viral sem contexto | Disclaimer no card, link para metodologia, versao do schema na URL |
| URL de compartilhamento quebra | Encoding compacto (< 200 chars), validacao de versao, fallback "refaca o quiz" |
| Score dominado por espectro no MVP | Disclosure de que fase 1 e simplificada, roadmap publico para mais fontes |
| Cache da OG image (fase 3) explode | Spike antes de implementar, considerar rate limit ou geracao sob demanda |
| Normalizacao de partido_sigla diverge | Usar funcao unica `normalizePartySigla()` em todos os contextos |

---

## 10. Metricas de sucesso

- **Funnel**: quiz_landing_view → quiz_started → quiz_completed (% de drop por pergunta)
- **Engajamento pos-resultado**: cliques em "ver ficha completa", cliques em "comparar"
- **Viralizacao**: URLs de compartilhamento geradas, cliques em share buttons
- **Tempo no quiz**: media e distribuicao (muito rapido = nao leu, muito lento = abandonou)
- **Bounce**: landing → saida sem comecar
- **Retorno**: usuarios que refazem o quiz (URL unica vs repetida)

Implementacao: eventos simples no analytics (Vercel Analytics ou plausible.io), sem rastrear respostas individuais.

---

## 11. Dependencias

### Dependencias de dados (bloqueantes para MVP)

- [ ] Votacoes-chave curadas: minimo 8 votacoes com votos cruzados de 60%+ dos candidatos
- [ ] Espectro partidario revisado editorialmente por Thiago
- [ ] 10 perguntas redigidas por Thiago com mapeamentos validados

### Dependencias de dados (bloqueantes para fase 2)

- [ ] Tabela `posicoes_declaradas` criada e populada (curadoria de ~50 posicoes, top 10 candidatos)
- [ ] Campo `tema` preenchido em `projetos_lei` com cobertura razoavel

### Dependencias de dados (bloqueantes para fase 3)

- [ ] Mini-projeto de classificacao de doadores por setor concluido
- [ ] Spike de OG image dinamica no Edge validado

### Dependencias tecnicas

- [ ] `getQuizAlignmentDatasetResource()` implementada em `api.ts` com mock fallback
- [ ] `normalizePartySigla()` extraida para `src/lib/party-utils.ts` (client-safe)
- [ ] Testes unitarios para `quiz-scoring.ts` (logica pura, facil de testar)

---

## 12. Referencia de mercado

Projetos similares que ja fizeram isso (em outros paises/contextos):

- ISideWith.com (EUA) - quiz de alinhamento com candidatos
- Wahl-O-Mat (Alemanha) - ferramenta oficial de comparacao eleitoral
- VoteCompass (Canada/Australia) - quiz academico com transparencia metodologica
- Match Eleitoral (Portugal) - versao europeia com eixos ideologicos

Nenhum desses cruza votacoes reais + financiamento + PLs + posicoes declaradas com fonte. Esse e o diferencial.

---

## 13. Estimativa de arquivos por fase

### Fase 1 (MVP): ~12 arquivos

```
src/data/quiz/perguntas.ts              (novo)
src/data/quiz/espectro-partidario.ts    (novo)
src/lib/quiz-scoring.ts                 (novo)
src/lib/quiz-encoding.ts               (novo, encoding/decoding URL)
src/lib/party-utils.ts                  (novo, normalizePartySigla client-safe)
src/lib/api.ts                          (editar, adicionar getQuizAlignmentDatasetResource)
src/lib/types.ts                        (editar, adicionar QuizCandidatoData, QuizAlignmentDataset)
src/data/mock.ts                        (editar, adicionar MOCK_QUIZ_DATASET)
src/app/quiz/page.tsx                   (novo)
src/app/quiz/perguntas/page.tsx         (novo)
src/app/quiz/resultado/page.tsx         (novo)
src/components/quiz/QuizLanding.tsx      (novo)
src/components/quiz/QuizContainer.tsx    (novo)
src/components/quiz/QuizQuestion.tsx     (novo)
src/components/quiz/QuizProgress.tsx     (novo)
src/components/quiz/QuizResult.tsx       (novo)
src/components/quiz/QuizResultCard.tsx   (novo)
src/components/quiz/AlignmentBar.tsx     (novo)
```

### Fase 2: ~8 arquivos adicionais

```
src/components/quiz/QuizDetailPanel.tsx  (novo)
src/components/quiz/QuizShareButtons.tsx (novo)
scripts/seed-posicoes-declaradas.ts      (novo)
scripts/schema-posicoes.sql              (novo, migration)
src/lib/quiz-scoring.ts                  (editar, adicionar posicoes + projetos)
src/lib/api.ts                           (editar, expandir dataset)
src/lib/types.ts                         (editar, adicionar PosicaoDeclarada)
src/data/mock.ts                         (editar, expandir mock)
```

### Fase 3: ~5 arquivos adicionais

```
src/app/quiz/resultado/opengraph-image/route.tsx  (novo)
src/components/quiz/QuizShareCard.tsx              (novo)
scripts/classify-doadores.ts                       (novo, mini-projeto)
src/lib/quiz-scoring.ts                            (editar, adicionar financiamento)
src/lib/api.ts                                     (editar, expandir dataset)
```

---

## 14. Sequencia SDD recomendada

```
/sdd-research (ja feito: este documento e o PRD)
    |
    v
/sdd-break → separar em issues:
    Issue 1: dados (perguntas.ts, espectro.ts, types, mock)
    Issue 2: api.ts (getQuizAlignmentDatasetResource + mock fallback)
    Issue 3: quiz-scoring.ts (logica pura + testes)
    Issue 4: quiz-encoding.ts (encode/decode URL + testes)
    Issue 5: UI landing + perguntas (pages + components GSAP)
    Issue 6: UI resultado (page + components ranking)
    Issue 7: integracao e2e (wiring tudo, smoke test)
    |
    v
/sdd-execute por issue, com shadow validation
```

Dependencias entre issues: 1 → 2 → 3,4 (paralelos) → 5,6 (paralelos) → 7

---

## 15. Log de execucao (implementacao)

> Auditoria: entradas em ordem cronologica. Cada linha descreve o que foi feito no codigo ou na documentacao.

### 2026-04-04 — Inicio Fase 1 (MVP) pos-atualizacao do plano

1. **Documentacao**: Atualizado [`2026-04-04-quiz-quem-me-representa-avaliacao.md`](./2026-04-04-quiz-quem-me-representa-avaliacao.md) com secao "Atualizacao pos-revisao do plano" e notas sobre implementacao (query SQL, UUIDs via titulo, `party-utils`).
2. **Desvio controlado em relacao ao plano sec. 5.1**: Em `perguntas.ts` usamos `votacao_titulos: string[]` (match em `votacoes_chave.titulo`) em vez de UUIDs fixos no repo, para funcionar em qualquer ambiente Supabase. O servidor preenche `votacao_titulo_to_id` no `QuizAlignmentDataset`.
3. **Dataset**: `getQuizAlignmentDatasetResource(cargo)` em `api.ts` com tres consultas (candidatos ja via `getCandidatosResourceUncached`, `votacoes_chave` por titulos do quiz, `votos_candidato` por candidatos e votacoes), `unstable_cache` e tag `quiz-dataset`.
4. **Mock**: `buildMockQuizAlignmentDataset()` em `mock.ts` agrega `MOCK_VOTOS` por titulos que intersectam o quiz.
5. **UI MVP**: Rotas `/quiz`, `/quiz/perguntas`, `/quiz/resultado`; componentes em `src/components/quiz/`; link no `Navbar`.
6. **Testes**: `tests/quiz-scoring.test.ts` e `tests/quiz-encoding.test.ts` (runner `tsx --test`).
7. **Verificacao** (2026-04-04): `npm test` (14/14 pass), `npm run lint` (sem erros), `npm run build` (sucesso; rotas `/quiz`, `/quiz/perguntas`, `/quiz/resultado` geradas).
8. **Arquivos novos principais**: `src/lib/party-utils.ts`, `src/lib/quiz-types.ts`, `src/lib/quiz-scoring.ts`, `src/lib/quiz-encoding.ts`, `src/data/quiz/perguntas.ts`, `src/data/quiz/espectro-partidario.ts`, `src/data/quiz/index.ts`, `src/components/quiz/*`, `src/app/quiz/**`, extensoes em `src/lib/api.ts`, `src/data/mock.ts`, `src/components/Navbar.tsx`.
9. **Nota**: secao 6.1 do plano (SQL unico) nao foi copiada literalmente; implementacao usa 3 queries Supabase como descrito no item 3 acima.
10. **Ajuste pos-revisao**: q10 `eixo_social_dir` corrigido para `concordo=progressista` (concordar com "menos interferencia do Estado" alinha ao eixo progressista no modelo 1 a 10). q09 ganhou comentario de curadoria (enunciado ambiguo). `buildQuizResultQuery` deixa de usar `encodeURIComponent` no parametro `r` (base64url ja e URL-safe).

### 2026-04-04 — Fase 2 (fontes expandidas + UX)

1. **Dados**: migracao `posicoes_declaradas`, dataset com PL por tema, posicoes verificadas, contradicoes em votos do quiz, contagem de mudancas de partido; `quiz-scoring` fase 2 com posicoes e projetos; tipos e testes.
2. **UI**: "Entenda melhor" nas perguntas, share (Web Share, X, WhatsApp, copiar), painel de detalhe no resultado, breakdown no card.
3. **Comparador**: `/comparar?c1=slug&c2=slug` (ate `c4`) pre-seleciona candidatos via `initialSelectedSlugs` em `ComparadorPanel`.
4. **Quiz resultado**: link "Comparar os 2 mais alinhados" e rodape com "Metodologia do quiz".
5. **Pagina** `/quiz/metodologia` com texto de transparencia (pesos de referencia, fontes, privacidade).
6. **Landing** `/quiz`: link "Como calculamos o alinhamento" para metodologia.
7. **Encoding v3 e headers**: bit de importancia por pergunta na URL (`perguntas.ts`, `quiz-encoding.ts`); links de fonte no resultado. Em `next.config.ts`, `upgrade-insecure-requests` e HSTS so na Vercel (`VERCEL=1`) ou com `PF_FORCE_PRODUCTION_SECURITY_HEADERS=1`, para `npm run start` em HTTP local nao quebrar WebKit/Playwright.
8. **Pendente opcional**: OG dinamica do resultado (fase 3 no plano).
